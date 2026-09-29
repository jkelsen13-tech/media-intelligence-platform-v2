import {SESSION_LOCK_PROFILE,SESSION_LOCK_DDL,sessionLockBoundarySQL} from '../supabase/qualification/native-provisioning-compat/sessionLock.mjs'
import {prepareAtomicInstall} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
import {NATIVE_CALLER_MODE} from '../supabase/qualification/native-governed-install/install.mjs'
import {activationTransaction} from '../supabase/qualification/native-governed-activation/activation.mjs'
import {GROUPS} from '../supabase/qualification/native-governed-activation/prepare.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {prepareNativeActivation,SQL_PATH} from '../supabase/qualification/native-governed-activation/prepare.mjs'
import {managedOptions,managedTransportSQL,managedSnapshotSQL,DEVELOPMENT_PROFILE,providerBoundarySQL,untrustedCallerSQL} from '../supabase/qualification/native-provisioning-compat/managedPolicy.mjs'
const read=path=>readFile(new URL('../'+path,import.meta.url))
const original={expectedLogin:'postgres',operationId:'1'.repeat(32),expectedMetadataAuditor:'mip_native_metadata_audit_v1'}
const managed={...original,provisioningProfile:'supabase-managed-v1',provisioningOperationId:'2'.repeat(32)}
test('managed successor is explicit and old compiled output retains strict auditor isolation',async()=>{
 const legacy=await prepareNativeActivation(read,original),next=await prepareNativeActivation(read,managed)
 assert.equal(legacy.provisioningProfile,undefined)
 assert.equal(legacy.sql.includes('managed_metadata'),false)
 assert.equal(legacy.sql.split('or exists(select 1 from pg_auth_members where roleid=b.metadata_auditor_oid or member=b.metadata_auditor_oid)').length,4)
 assert.equal(next.provisioningProfile,'supabase-managed-v1')
 assert.notEqual(next.program_sha256,legacy.program_sha256)
 assert.equal(next.sql.split("raise exception 'managed_provisioning_drift'").length,4)
 assert.match(next.sql,/managed_metadata jsonb not null/)
 assert.match(next.sql,/managed_extension_dependency/)
 assert.match(next.sql,/a.grantor=10/)
 assert.match(next.sql,/not a.inherit_option and not a.set_option/)
 assert.equal((await read(SQL_PATH)).includes(Buffer.from('managed_metadata')),false)
})
test('managed option rejects incomplete and alternative identities',()=>{
 assert.equal(managedOptions(original),false)
 for(const bad of [{...managed,provisioningProfile:'other'},{...managed,expectedLogin:'other'},{...managed,expectedMetadataAuditor:'other'},{...managed,provisioningOperationId:null},{...managed,auditLogin:'other'},{...original,provisioningOperationId:'2'.repeat(32)}])
  assert.throws(()=>managedOptions(bad),/boundary_refused/)
})
test('shim is fixed bound SQL and does not change provider extension ACL or relocate it',()=>{
 const sql=managedTransportSQL()
 assert.match(sql,/security definer set search_path='' begin atomic/)
 assert.match(sql,/select mip_factual_transport_raw.dblink_exec\(conn,command\)/)
 assert.doesNotMatch(sql,/alter extension|create extension|create schema|grant .*raw/i)
 const snapshot=managedSnapshotSQL(managed)
 for(const expected of ['pg_catalog.pg_extension','pg_catalog.pg_depend','definitions_sha256','provisioning_operation_id','prosqlbody','inherit_option','set_option'])
  assert.ok(snapshot.includes(expected),expected)
})

test('managed transient context reaches only the bounded returning-status wrapper and refusal rolls back',async()=>{
 const calls=[],secret='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 const settings={log_statement:'ddl',log_min_duration_statement:'-1',log_min_duration_sample:'-1',log_transaction_sample_rate:'0',log_parameter_max_length_on_error:'0',statement_timeout:'1000',lock_timeout:'500','auto_explain.log_min_duration':'10000','auto_explain.log_nested_statements':'off','pg_stat_statements.track':'top'}
 const db={async query(sql,args){
  calls.push({sql,args})
  if(sql.includes('from pg_settings'))return {rows:args[0].filter(k=>settings[k]!==undefined).map(name=>({name,setting:settings[name]}))}
  if(sql.includes('from mip_native_activation.bootstrap'))return {rows:[{matches:true}]}
  if(sql.startsWith('select pg_temp.managed_activation_transition'))return {rows:[{state:'refused'}]}
  return {rows:[]}
 },async end(){calls.push({sql:'end'})}}
 const req={revision:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',predecessor:null,action:'pending',
 members:GROUPS.map((group,i)=>({group,group_oid:String(100+i),name:'fixture_runtime_'+i,oid:String(200+i)})),
 authority:{scope:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',subject:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',valid_until:'2099-01-01T00:00:00.000Z'},
 ephemeral:{authSession:secret,tokenExp:4070908800}}
 const result=await activationTransaction(db,{...managed,expectedInstallManifest:'a'.repeat(64),expectedNativeProgram:'b'.repeat(64),expectedSuccessorProgram:'c'.repeat(64)},req)
 assert.equal(result.permissions_current,false)
 assert.equal(result.transaction,'not_committed')
 assert.equal(result.connection_cleanup_verified,true)
 assert.equal(calls.filter(c=>c.args?.includes(secret)).length,1)
 assert.ok(calls.find(c=>c.args?.includes(secret)).sql.startsWith('select pg_temp.managed_activation_transition'))
 assert.ok(calls.some(c=>c.sql==="set local lock_timeout='500ms'"))
 assert.ok(calls.some(c=>c.sql==='rollback'))
 assert.equal(calls.some(c=>c.sql.includes(secret)),false)
 assert.equal(JSON.stringify(result).includes(secret),false)
 const wrappers=calls.filter(c=>c.sql.startsWith('create function pg_temp.managed_activation'))
 assert.equal(wrappers.length,2)
 for(const w of wrappers){assert.match(w.sql,/when query_canceled or assert_failure/);assert.doesNotMatch(w.sql,/raise exception/)}
})

test('solo development profile preserves strict output and binds only existing provider identities',async()=>{
 const dev={...managed,provisioningProfile:DEVELOPMENT_PROFILE}
 const strict=await prepareNativeActivation(read,managed),development=await prepareNativeActivation(read,dev)
 assert.notEqual(strict.program_sha256,development.program_sha256)
 assert.doesNotMatch(strict.sql,/trusted_provider_metadata/)
 assert.match(development.sql,/trusted_provider_metadata/)
 assert.equal(untrustedCallerSQL(managed),'')
 assert.equal(untrustedCallerSQL(dev)," and caller.rolname not in('supabase_etl_admin','supabase_read_only_user')")
 const guard=providerBoundarySQL(dev)
 assert.match(guard,/managed_provider_attributes/)
 assert.match(guard,/managed_provider_edges/)
 assert.doesNotMatch(guard,/grant |revoke |alter role|create role/i)
 assert.equal(providerBoundarySQL(managed),'')
})

test('session-lock successor replaces both exact lock sites without rewriting historical source or owners',async()=>{
 const options={...managed,provisioningProfile:SESSION_LOCK_PROFILE,nativeMode:NATIVE_CALLER_MODE,activationProfile:'native-governed-activation-v1'}
 const plan=await prepareAtomicInstall(read,options)
 const backend=plan.body.find(s=>s.path.endsWith('/012_efta_live_authentication.sql')).sql
 const caller=plan.native.steps.at(-1)
 assert.match(backend,/mip_auth_session_lock.key_share\(p_subject,p_auth_session\)/)
 assert.match(backend,/owner to mip_efta_auth_session_owner_v1/)
 assert.doesNotMatch(backend,/grant (?:select\(id,user_id\)|update\(id\)) on auth.sessions to mip_efta_auth_session_owner_v1/)
 assert.match(caller.body,/mip_auth_session_lock.share\(u,session_id\)/)
 assert.match(caller.body,/to_timestamp\(token_exp\)<=clock_timestamp\(\)/)
 assert.match(caller.assertion,/if actual is not null/)
 assert.match(plan.activation.sql,/select x\.deadline into deadline from mip_auth_session_lock\.share\(u,session_id\) x;/)
 assert.doesNotMatch(plan.activation.sql,/select x\.not_after into deadline from auth\.sessions/)
 assert.match(plan.activation.sql,/perform 1 from mip_cutover_authority\.publication_fence where id for share;/)
 assert.doesNotMatch(SESSION_LOCK_DDL,/insert into|update auth\\.|delete from|execute format/i)
 assert.match(SESSION_LOCK_DDL,/for key share/)
 assert.match(SESSION_LOCK_DDL,/for share/)
 assert.match(sessionLockBoundarySQL(options),/pg_get_function_sqlbody/)
 assert.match(sessionLockBoundarySQL(options),/pg_catalog.pg_depend/)
 const historical=await prepareAtomicInstall(read,{...options,provisioningProfile:DEVELOPMENT_PROFILE})
 assert.match(historical.body.find(s=>s.path.endsWith('/012_efta_live_authentication.sql')).sql,/grant update\(id\) on auth.sessions to mip_efta_auth_session_owner_v1/)
 assert.match(historical.activation.sql,/select x\.not_after into deadline from auth\.sessions x/)
 assert.notEqual(historical.manifest_sha256,plan.manifest_sha256)
})
