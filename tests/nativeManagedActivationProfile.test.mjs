import {createHash} from 'node:crypto'
import {CANONICAL_ENTITY_SOURCE,CANONICAL_ENTITY_CONTRACT,transformCanonicalEntitySource,ENTITY_CATALOG_SQL} from '../supabase/qualification/native-provisioning-compat/canonicalEntity.mjs'
import {validateActivationHostConfig,dispatchActivationHostAction,activationHostActionSatisfied} from '../supabase/qualification/native-governed-activation/host.mjs'
import {SESSION_LOCK_PROFILE,SESSION_LOCK_DDL,sessionLockBoundarySQL} from '../supabase/qualification/native-provisioning-compat/sessionLock.mjs'
import {prepareAtomicInstall,sanitizeInstallDiagnostic,INSTALL_DIAGNOSTICS,DOJ_PATH} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
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

test('activation host preserves only bounded atomic failure evidence and never authorizes failed installation',async()=>{
 const hash='a'.repeat(64),release='b'.repeat(40),operation='1'.repeat(32),canary='PRIVATE_FAILURE_CANARY';
 const cfg={releaseSha:release,operationId:operation,expectedLogin:'postgres',auditLogin:'mip_native_audit_v1',
 c3OperationId:'2'.repeat(32),c3ManifestSha256:hash,expectedManifestSha256:hash,expectedNativeProgramSha256:hash,
 dblinkMetadataSha256:hash,collectorSource:'qik-synthetic',expectedMetadataAuditor:'mip_native_metadata_audit_v1',expectedSuccessorProgram:hash};
 const dsn=login=>'postgresql://'+login+'.qikvmopbtijoebdqosyq:SYNTHETIC_ONLY@aws-0-us-west-1.pooler.supabase.com:5432/postgres';
 const c=validateActivationHostConfig(JSON.stringify(cfg),{installer:dsn('postgres'),audit:dsn(cfg.auditLogin)+'?connect_timeout=5&sslmode=verify-full&sslrootcert=system',metadataAudit:dsn(cfg.expectedMetadataAuditor)});
 const base=state=>({state,operation_id:operation,manifest_sha256:hash,native_mode:'native-governed-v6',
 native_program_sha256:hash,activation_profile:'native-governed-activation-v1',successor_program_sha256:hash,
 activation_allowed:false,needs_reconciliation:false,audit_qualified:false,connection_cleanup_verified:true,cleanup_diagnostic:null});
 for(const state of ['installation_refused','reconciliation_unavailable','installed_disabled_audit_unresolved']){
  const r=await dispatchActivationHostAction('reconcile',c,()=>{},{
   reconcileComparisonInstall:async()=>({...base(state),phase:'source:supabase/qualification/mip-cutover-authority/012_efta_live_authentication.sql',
    sqlstate:'42501',diagnostic:'atomic_existing_c3_owner_transfer',message:canary,detail:canary,query:canary,stack:canary,connectionString:canary})});
  assert.equal(r.state,state);assert.equal(r.failure_phase,'source:supabase/qualification/mip-cutover-authority/012_efta_live_authentication.sql');
  assert.equal(r.failure_sqlstate,'42501');assert.equal(r.failure_diagnostic,'atomic_existing_c3_owner_transfer');
  assert.equal(JSON.stringify(r).includes(canary),false);
  for(const action of ['install','reconcile','audit'])assert.equal(activationHostActionSatisfied(action,r),false);
  for(const field of ['activation_allowed','publication_allowed','material_access_allowed','production_qualified'])assert.equal(r[field],false);
 }
 for(const changed of [{phase:canary,sqlstate:'ABCDE',diagnostic:canary},
  {phase:'source:'+canary,sqlstate:'password',diagnostic:'atomic_existing_c3_owner_transfer:'+canary}]){
  const r=await dispatchActivationHostAction('reconcile',c,()=>{},{reconcileComparisonInstall:async()=>({...base('installation_refused'),...changed})});
  assert.equal(r.failure_phase,null);assert.equal(r.failure_sqlstate,null);assert.equal(r.failure_diagnostic,null);
  assert.equal(JSON.stringify(r).includes(canary),false);
 }
 for(const changed of [{operation_id:'3'.repeat(32)},{manifest_sha256:'0'.repeat(64)},{successor_program_sha256:'0'.repeat(64)}]){
  const r=await dispatchActivationHostAction('reconcile',c,()=>{},{reconcileComparisonInstall:async()=>({...base('installation_refused'),phase:'catalog_preflight',sqlstate:'42501',diagnostic:'atomic_catalog_preflight',...changed})});
  assert.equal(r.state,'outcome_unknown');assert.equal(Object.hasOwn(r,'failure_phase'),false);
 }
 const ok=await dispatchActivationHostAction('reconcile',c,()=>{},{reconcileComparisonInstall:async()=>({...base('not_installed'),phase:canary,sqlstate:canary,diagnostic:canary})});
 assert.equal(activationHostActionSatisfied('reconcile',ok),true);assert.equal(Object.hasOwn(ok,'failure_phase'),false);assert.equal(JSON.stringify(ok).includes(canary),false);
});

test('activation host independently bounds existing native failure evidence',async()=>{
 const hash='a'.repeat(64),operation='1'.repeat(32),canary='PRIVATE_NATIVE_FAILURE_CANARY';
 const cfg={releaseSha:'b'.repeat(40),operationId:operation,expectedLogin:'postgres',auditLogin:'mip_native_audit_v1',
 c3OperationId:'2'.repeat(32),c3ManifestSha256:hash,expectedManifestSha256:hash,expectedNativeProgramSha256:hash,
 dblinkMetadataSha256:hash,collectorSource:'qik-synthetic',expectedMetadataAuditor:'mip_native_metadata_audit_v1',expectedSuccessorProgram:hash};
 const dsn=login=>'postgresql://'+login+'.qikvmopbtijoebdqosyq:SYNTHETIC_ONLY@aws-0-us-west-1.pooler.supabase.com:5432/postgres';
 const c=validateActivationHostConfig(JSON.stringify(cfg),{installer:dsn('postgres'),audit:dsn(cfg.auditLogin)+'?connect_timeout=5&sslmode=verify-full&sslrootcert=system',metadataAudit:dsn(cfg.expectedMetadataAuditor)});
 const base={state:'installation_refused',operation_id:operation,manifest_sha256:hash,native_mode:'native-governed-v6',
 native_program_sha256:hash,activation_profile:'native-governed-activation-v1',successor_program_sha256:hash,
 activation_allowed:false,needs_reconciliation:false,audit_qualified:false,connection_cleanup_verified:true,cleanup_diagnostic:null,
 phase:'native_joint_install',sqlstate:'P0001',diagnostic:null};
 const run=changed=>dispatchActivationHostAction('reconcile',c,()=>{},{reconcileComparisonInstall:async()=>({...base,...changed})});
 const allowed={stage:'checkpoint_assertion',source:'supabase/qualification/entity-resolution/candidate-review/004_candidate_review.sql',object:'auth.sessions',name:'candidate review owner boundary failed'};
 const r=await run({native_failure:{...allowed,query:canary,detail:canary,position:canary,frames:[canary],internal_source:{sha256:canary}}});
 assert.deepEqual(r.failure_native,allowed);assert.equal(JSON.stringify(r).includes(canary),false);
 assert.equal(activationHostActionSatisfied('install',r),false);
 const core=await run({native_failure:{...allowed,name:'native_install_existing_owner_path'}});
 assert.equal(core.failure_native.name,'native_install_existing_owner_path');
 for(const changed of [{stage:canary,source:canary,object:canary,name:canary},
 {stage:'checkpoint_assertion:'+canary,source:allowed.source+'/'+canary,object:'auth.sessions.'+canary,name:allowed.name+':'+canary}]){
  const refused=await run({native_failure:changed});
  assert.deepEqual(refused.failure_native,{stage:null,source:null,object:null,name:null});
  assert.equal(JSON.stringify(refused).includes(canary),false);
 }
 for(const changed of [{native_failure:canary},{native_failure:[allowed]},{phase:'catalog_preflight',native_failure:allowed},
 {state:'not_installed',native_failure:allowed},{operation_id:'3'.repeat(32),native_failure:allowed},
 {manifest_sha256:'0'.repeat(64),native_failure:allowed},{successor_program_sha256:'0'.repeat(64),native_failure:allowed}]){
  const refused=await run(changed);assert.equal(Object.hasOwn(refused,'failure_native'),false);
 }
 for(const field of ['activation_allowed','publication_allowed','material_access_allowed','production_qualified'])assert.equal(r[field],false);
});

test('fixed entity column successor preserves raw005, identity key and historical compilation',async()=>{
 const raw=(await read(CANONICAL_ENTITY_SOURCE)).toString()
 const options={...managed,provisioningProfile:SESSION_LOCK_PROFILE,nativeMode:NATIVE_CALLER_MODE,activationProfile:'native-governed-activation-v1'}
 const plan=await prepareAtomicInstall(read,options)
 const step=plan.native.steps.find(s=>s.path===CANONICAL_ENTITY_SOURCE)
 assert.equal(CANONICAL_ENTITY_CONTRACT,'qik-entity-type-column-v1')
 assert.equal(step.blob,'b6487f76f4186a58e7f77d50eecca0a40fd76c27')
 assert.match(step.body,/grant select\(id,canonical_name,normalized_name,entity_type,aliases\)/)
 assert.match(step.body,/'type',entity_type,'aliases'/)
 assert.match(step.body,/before update of id,canonical_name,normalized_name,entity_type,aliases/)
 assert.match(step.assertion,/canonical_entity_column_boundary/)
 assert.equal(transformCanonicalEntitySource(raw,managed),raw)
 const historical=await prepareAtomicInstall(read,{...options,provisioningProfile:DEVELOPMENT_PROFILE})
 const old=historical.native.steps.find(s=>s.path===CANONICAL_ENTITY_SOURCE)
 assert.match(old.body,/'type',type,'aliases'/)
 assert.doesNotMatch(old.assertion,/canonical_entity_column_boundary/)
 assert.notEqual(plan.native.program_sha256,historical.native.program_sha256)
 assert.notEqual(plan.manifest_sha256,historical.manifest_sha256)
 for(const needle of ["'type',type,'aliases'","before update of id,canonical_name,normalized_name,type,aliases"])
  assert.throws(()=>transformCanonicalEntitySource(raw.replace(needle,''),options),/canonical_entity_adapter_boundary/)
 assert.match(ENTITY_CATALOG_SQL,/pg_catalog.pg_trigger/)
 assert.match(ENTITY_CATALOG_SQL,/prosrc=/)
 // Literal expected function bodies are evidence, not executed table reads.
 assert.doesNotMatch(ENTITY_CATALOG_SQL.replace(/'(?:[^']|'')*'/g,"''"),/from public.entities|select mip_mentions/i)
})
test('complete managed successor manifest and both real host source inventories match actual blobs',async()=>{
 const manifest=JSON.parse((await read('verifier/qik-native-activation-successor.json')).toString())
 const blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length),Buffer.from([0]),b])).digest('hex')
 for(const entry of manifest.sources)assert.equal(blob(await read(entry.path)),entry.git_blob,entry.path)
 for(const path of ['supabase/qualification/native-governed-activation/run.mjs','supabase/qualification/native-provisioning-compat/preflight-run.mjs']){
  const source=(await read(path)).toString()
  const object=source.match(/const (?:CODE_PINS|PINS)=Object.freeze\((\{[\s\S]*?\})\)/)[1]
  const pins=Function('return ('+object+')')()
  assert.ok(pins['supabase/qualification/native-provisioning-compat/canonicalEntity.mjs'])
  for(const [p,pin] of Object.entries(pins))assert.equal(blob(await read(p)),pin,p)
 }
})

 test('pinned DOJ final refusals expose only exact static labels and never server suffixes',async()=>{
 const source=(await read(DOJ_PATH)).toString(),tail=source.slice(source.indexOf('do $final_doj_permissions$'));
 const labels=[...new Set([...tail.matchAll(/raise exception '(doj_[a-z0-9_]+)(?::[^']*)?'/g)].map(x=>x[1]))];
 assert.equal(labels.length,25);
 const canary='PRIVATE_DOJ_SUFFIX_CANARY';
 for(const code of labels){
  assert.ok(INSTALL_DIAGNOSTICS.includes(code),code);
  for(const message of [code,code+': '+canary,code+':\\n'+canary]){
   const result=sanitizeInstallDiagnostic({message,detail:canary,query:canary});
   assert.equal(result,code);assert.equal(JSON.stringify(result).includes(canary),false);
  }
  for(const message of [code+'_'+canary,code+' '+canary,canary+code])assert.equal(sanitizeInstallDiagnostic({message}),null);
 }
 for(const signature of ['mip_identity.operation_check(jsonb)','mip_identity.operation_check_pre_doj_v1(jsonb)','qik_ingest.check_doj_material(uuid,uuid,uuid)']){
  const bounded='doj_function_acl:'+signature;
  assert.ok(INSTALL_DIAGNOSTICS.includes(bounded));
  assert.equal(sanitizeInstallDiagnostic({message:'doj_function_acl: '+signature}),bounded);
  assert.equal(sanitizeInstallDiagnostic({message:bounded}),bounded);
  assert.equal(sanitizeInstallDiagnostic({message:'doj_function_acl: '+signature+':'+canary}),'doj_function_acl');
 }
 for(const message of ['doj_unlisted:'+canary,canary,'postgresql://'+canary,null])assert.equal(sanitizeInstallDiagnostic({message}),null);
});

 test('managed DOJ predecessor drops stale EFTA direct grant while wrapper keeps governed execution',async()=>{
 const options={...managed,provisioningProfile:SESSION_LOCK_PROFILE,nativeMode:NATIVE_CALLER_MODE,activationProfile:'native-governed-activation-v1'};
 const plan=await prepareAtomicInstall(read,options);
 const predecessor='revoke execute on function mip_identity.operation_check_pre_doj_v1(jsonb) from mip_efta_owner_v1;';
 assert.equal(plan.dojBody.split(predecessor).length,2);
 const ownerAcl='set role qik_ingest_fn_owner;\nrevoke all on function qik_ingest.check_doj_material(uuid,uuid,uuid) from public,anon,authenticated,service_role,qik_ingest_runtime,mip_cutover_authority_admin_v1,mip_comparison_worker_v1,mip_comparison_producer_v1,mip_projection_publisher_v1,postgres,mip_efta_owner_v1;\ngrant execute on function qik_ingest.check_doj_material(uuid,uuid,uuid) to mip_publication_owner_v2;\nreset role;';
 assert.equal(plan.dojBody.split(ownerAcl).length,2);
 assert.equal(plan.dojBody.split('grant execute on function qik_ingest.check_doj_material(uuid,uuid,uuid) to mip_publication_owner_v2;').length,2);
 assert.match(plan.dojBody,/grant execute on function mip_identity\.operation_check\(jsonb\) to mip_efta_owner_v1/);
 assert.match(plan.dojAssertions,/\('mip_identity\.operation_check_pre_doj_v1\(jsonb\)','mip_publication_owner_v2','v',array\['mip_publication_owner_v2'\]\)/);
 const old=await prepareAtomicInstall(read,{...options,provisioningProfile:DEVELOPMENT_PROFILE});
 assert.equal(old.dojBody.includes(predecessor),false);
 assert.equal(old.dojBody.includes(ownerAcl),false);
 assert.notEqual(plan.manifest_sha256,old.manifest_sha256);
});
