// Actual SQL qualification, synthetic dedicated PostgreSQL17.6 only.
// Requires official pgvector0.8.2; dependency build is owned by the CI workflow.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {prepareAtomicInstall,installComparisonAtomic,reconcileComparisonInstall,
 qualifyComparisonAudit,DBLINK_PREFLIGHT_SQL,INSTALL_DIAGNOSTICS} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
import {REQUIRED_RELATIONS,RESERVED_ROLES,RESERVED_SCHEMAS} from '../supabase/qualification/qik-comparison-adapter/catalogPreflight.mjs'
import {LOAD_ORDER} from '../supabase/qualification/qik-ingest/installQikIngest.mjs'
const root=new URL('../',import.meta.url),H='1'.repeat(64)
const password='mip-efta-disposable-ci-only',bootstrap='atomic_fixture_bootstrap',installer='atomic_fixture_installer',audit='atomic_fixture_audit'
const read=async p=>readFile(new URL(p,root),'utf8')
const url=user=>'postgresql://'+user+':'+password+'@127.0.0.1:5432/postgres'
async function client(user,database='postgres'){
 const db=new pg.Client({host:'127.0.0.1',port:5432,database,user,password,
 connectionTimeoutMillis:5000,statement_timeout:30000,query_timeout:40000})
 await db.connect();return db
}
// Test-only fault injection at the existing actual pg client boundary.
// Execute the real transaction command first; discard only its acknowledgement.
// No production injection hook or competing connection/execution service.
async function loseAcknowledgement(command,body){
 const original=pg.Client.prototype.query
 let losses=0
 pg.Client.prototype.query=async function(...args){
  const result=await original.apply(this,args)
  const text=typeof args[0]==='string'?args[0]:args[0]?.text
  if(losses===0&&this.connectionParameters.application_name==='mip-c3-persistent-install-source'
    &&typeof text==='string'&&text.trim().toLowerCase()===command){
   losses++
   throw Object.assign(new Error('synthetic acknowledgement discarded'),{code:'08006'})
  }
  return result
 }
 try{
  const result=await body()
  assert.equal(losses,1,'expected exactly one real transaction acknowledgement to be discarded: '+safeDiagnostic(result))
  return result
 }finally{pg.Client.prototype.query=original}
}
// Armed disposable-only close acknowledgement fault. The real pg close runs
// first; no live SQL, alternate connection factory or production hook is added.
async function loseCloseAcknowledgement(body,targetClose=1){
 assert.equal(process.env.MIP_QIK_COMPARISON_DISPOSABLE,'synthetic-pg17-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 const original=pg.Client.prototype.end
 let closes=0,losses=0
 pg.Client.prototype.end=async function(...args){
  const selected=this.connectionParameters.application_name==='mip-c3-persistent-install-source'
   &&this.connectionParameters.user===installer&&this.connectionParameters.host==='127.0.0.1'
   &&this.connectionParameters.database==='postgres'
  await original.apply(this,args)
  if(selected&&++closes===targetClose){
   losses++
   throw Error('synthetic close acknowledgement discarded')
  }
 }
 try{
  const result=await body()
  assert.equal(losses,1,'expected exactly one synthetic close acknowledgement loss')
  assert.equal(closes,targetClose,'unexpected extra installer connection after cleanup refusal')
  return result
 }finally{pg.Client.prototype.end=original}
}
async function withoutInstallerSessionLeak(observer,body){
 const sessions=async()=>Number((await observer.query(
  "select count(*)::integer n from pg_stat_activity where datname='postgres' and usename=$1 and application_name='mip-c3-persistent-install-source'",[installer])).rows[0].n)
 const baseline=await sessions()
 assert.equal(baseline,0,'fixture starts without installer API sessions')
 try{return await body()}
 finally{
  let current=await sessions()
  for(let attempt=0;current!==baseline&&attempt<40;attempt++){
   await new Promise(resolve=>setTimeout(resolve,25))
   current=await sessions()
  }
  assert.equal(current,baseline,'installer API session cleanup did not restore baseline')
 }
}
async function injectPrivateUnitDrift(sql,body){
 const original=pg.Client.prototype.query
 let injected=false
 pg.Client.prototype.query=async function(...args){
  const result=await original.apply(this,args)
  if(!injected&&this.connectionParameters.application_name==='mip-c3-persistent-install-source'
   &&typeof args[0]==='string'&&args[0].startsWith('insert into mip_comparison_install.receipts(')){
   injected=true
   await original.call(this,sql)
  }
  return result
 }
 try{const result=await body();assert.equal(injected,true,safeDiagnostic(result));return result}
 finally{pg.Client.prototype.query=original}
}
// Observe only fixed settings/control outcomes; never retain query parameters.
async function credentialWindow(fault,body,initialTimeout=null){
 const original=pg.Client.prototype.query
 const seen={bounded:null,restored:null,rollback:null,calls:0}
 pg.Client.prototype.query=async function(...args){
  const active=this.connectionParameters.application_name==='mip-c3-persistent-install-source'
  const sql=typeof args[0]==='string'?args[0]:args[0]?.text
  if(active&&typeof sql==='string'){
   if(sql==='begin'&&initialTimeout!==null)
    await original.call(this,"select set_config('statement_timeout',$1,false)",[initialTimeout+'ms'])
   if(sql.startsWith('create function pg_temp.atomic_audit_config(')&&fault){
    const prefix=fault==='timeout'?'perform pg_sleep(2); ':"raise exception 'synthetic-sensitive-failure'; "
    args[0]=sql.replace('insert into mip_factual.audit_connection',()=>prefix+'insert into mip_factual.audit_connection')
   }
   if(sql==='select pg_temp.atomic_audit_config($1)'){
    seen.calls++
    seen.bounded=(await original.call(this,"select setting from pg_settings where name='statement_timeout'")).rows[0].setting
   }
   if(sql.startsWith('grant usage on schema mip_factual to '))
    seen.restored=(await original.call(this,"select setting from pg_settings where name='statement_timeout'")).rows[0].setting
  }
  const result=await original.apply(this,args)
  if(active&&sql==='rollback')seen.rollback=(await original.call(this,"select setting from pg_settings where name='statement_timeout'")).rows[0].setting
  return result
 }
 try{return {receipt:await body(),seen}}finally{pg.Client.prototype.query=original}
}
async function assertPristineFixture(db){
 const r=(await db.query(
  "select current_database() db,current_setting('server_version_num') v,session_user::text login,current_user::text effective,"+
  "(select jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createrole',rolcreaterole,'createdb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass',rolbypassrls,'limit',rolconnlimit,'until',rolvaliduntil,'config',rolconfig) order by rolname) from pg_roles) roles,"+
  "(select jsonb_agg(datname order by datname) from pg_database) databases,"+
  "(select jsonb_agg(nspname order by nspname) from pg_namespace) schemas,"+
  "(select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner)) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace) extensions,"+
  "(select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') public_relations,"+
  "(select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') public_functions,"+
  "(select count(*)::integer from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public') public_types,"+
  "(select count(*)::integer from pg_largeobject_metadata) large_objects,"+
  "(select count(*)::integer from pg_foreign_server)+(select count(*)::integer from pg_event_trigger)+(select count(*)::integer from pg_default_acl)+(select count(*)::integer from pg_publication)+(select count(*)::integer from pg_subscription) extras"
 )).rows[0]
 const names=['postgres','pg_database_owner','pg_read_all_data','pg_write_all_data','pg_monitor',
  'pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables','pg_read_server_files',
  'pg_write_server_files','pg_execute_server_program','pg_signal_backend','pg_checkpoint',
  'pg_use_reserved_connections','pg_create_subscription','pg_maintain'].sort()
 const goodRole=role=>{
  const admin=role.name==='postgres'
  return role.super===admin&&role.inherit===true&&role.createrole===admin
   &&role.createdb===admin&&role.login===admin&&role.replication===admin
   &&role.bypass===admin&&role.limit===-1&&role.until===null&&role.config===null
 }
 if(!r||r.db!=='postgres'||r.v!=='170006'||r.login!=='postgres'||r.effective!=='postgres'
  ||JSON.stringify(r.databases)!==JSON.stringify(['postgres','template0','template1'])
  ||JSON.stringify(r.schemas)!==JSON.stringify(['information_schema','pg_catalog','pg_toast','public'])
  ||r.extensions?.length!==1||r.extensions[0].name!=='plpgsql'||r.extensions[0].version!=='1.0'||r.extensions[0].schema!=='pg_catalog'||r.extensions[0].owner!=='postgres'
  ||r.public_relations!==0||r.public_functions!==0||r.public_types!==0||r.large_objects!==0||r.extras!==0
  ||JSON.stringify(r.roles?.map(x=>x.name))!==JSON.stringify(names)||!r.roles.every(goodRole))
  throw Error('atomic_fixture_not_pristine')
 const edges=(await db.query("select p.rolname parent,m.rolname member,a.admin_option admin,a.inherit_option inherit,a.set_option set from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member order by p.rolname,m.rolname")).rows
 assert.deepEqual(edges,['pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables'].map(parent=>({parent,member:'pg_monitor',admin:false,inherit:true,set:true})))
}
function safeDiagnostic(receipt){
 // Only existing control-defined return fields; never errors, SQL or config.
 const state=/^[a-z_]{1,80}$/.test(receipt?.state??'')?receipt.state:null
 const phase=/^[a-z0-9_:./-]{1,220}$/.test(receipt?.phase??'')?receipt.phase:null
 const sqlstate=/^[0-9A-Z]{5}$/.test(receipt?.sqlstate??'')?receipt.sqlstate:null
 const diagnostic=INSTALL_DIAGNOSTICS.includes(receipt?.diagnostic)?receipt.diagnostic:null
 return JSON.stringify({state,phase,sqlstate,diagnostic})
}
const ident=s=>'"'+s.replaceAll('"','""')+'"'
for(const commitProfile of ['lost_commit_acknowledgement','lost_close_acknowledgement'])
test('full pinned atomic install on non-superuser PostgreSQL17.6, rollback and audit recovery: '+commitProfile,{timeout:240000,concurrency:false},async()=>{
 assert.equal(process.env.MIP_QIK_COMPARISON_DISPOSABLE,'synthetic-pg17-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 let owner=await client('postgres'),admin=null
 // No destructive cleanup is armed before this complete dedicated-cluster guard.
 try{
  await assertPristineFixture(owner)
  // The runner connection may cross a Docker bridge; inspect the internal
  // loopback rule used by dblink as well, before setup or cleanup is armed.
  const authentication=(await owner.query("select bool_and(error is null and (type='local' or (type='host' and auth_method='scram-sha-256'))) valid,count(*) filter(where type='host' and address='127.0.0.1' and netmask='255.255.255.255' and database=array['all']::text[] and user_name=array['all']::text[])::integer loopback_rules from pg_hba_file_rules")).rows[0]
  assert.deepEqual(authentication,{valid:true,loopback_rules:1},'fixture must require SCRAM on every host path, including internal loopback')
  // Also prove the runner's connection rejects an incorrect password.
  const wrongPassword=new pg.Client({host:'127.0.0.1',port:5432,database:'postgres',user:'postgres',
   password:'synthetic-deliberately-incorrect',connectionTimeoutMillis:5000})
  try{await assert.rejects(wrongPassword.connect(),error=>error.code==='28P01','fixture loopback must reject an incorrect password')}
  finally{await wrongPassword.end().catch(()=>{})}
 }catch(error){await owner.end();throw error}
 // Prove an unrelated application schema is refused and survives the refusal.
 // This sentinel is created only after a truly pristine baseline was established.
 await owner.query('create schema fixture_unrelated;create table fixture_unrelated.sentinel(id integer primary key);insert into fixture_unrelated.sentinel values(73)')
 await assert.rejects(assertPristineFixture(owner),/atomic_fixture_not_pristine/)
 assert.equal((await owner.query('select id from fixture_unrelated.sentinel')).rows[0].id,73)
 await owner.query('drop table fixture_unrelated.sentinel;drop schema fixture_unrelated')
 await assertPristineFixture(owner)
 const largeObject=(await owner.query('select lo_create(0) oid')).rows[0].oid
 await assert.rejects(assertPristineFixture(owner),/atomic_fixture_not_pristine/)
 assert.equal((await owner.query('select exists(select 1 from pg_largeobject_metadata where oid=$1) retained',[largeObject])).rows[0].retained,true)
 assert.equal((await owner.query('select lo_unlink($1) removed',[largeObject])).rows[0].removed,1)
 await assertPristineFixture(owner)
 const baseline=(await owner.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname)
 // Bootstrap credentials are hardcoded synthetic fixture material, never production.
 await owner.query("create role "+bootstrap+" login superuser password '"+password+"'")
 admin=await client(bootstrap)
 try{
  // OID10 bootstrap superuser cannot be demoted. Use a distinct synthetic role
  // for privileged substrate preparation, then legally remove SUPERUSER.
  await admin.query("create role "+installer+" login superuser password '"+password+"'")
  assert.equal((await admin.query('select oid<>10 nonbootstrap from pg_roles where rolname=$1',[installer])).rows[0].nonbootstrap,true)
  await admin.query('alter database postgres owner to '+ident(installer))
  await owner.end();owner=await client(installer)
  await owner.query('create schema extensions;create extension pgcrypto with schema extensions;create extension vector with schema public;create extension dblink with schema extensions')
  assert.equal((await owner.query("select extversion from pg_extension where extname='vector'")).rows[0].extversion,'0.8.2')
  await owner.query(await read('supabase/qualification/qik-ingest/fixture_substrate.sql'))
  // Complete actual observed public column contracts. No comparison fixture/seed.
  await owner.query('create schema auth')
  for(const r of REQUIRED_RELATIONS.filter(r=>['public','auth'].includes(r.schema_name))){
   const exists=(await owner.query('select to_regclass($1) name',[r.qualified])).rows[0].name
   if(!exists){
    const columns=Object.entries(r.requiredColumns)
    await owner.query('create table '+r.qualified+' ('+(columns.length
      ?columns.map(([n,t])=>ident(n)+' '+t+(n==='id'?' primary key':'')).join(',')
      :'id uuid primary key,payload jsonb')+')')
   }else{
    const names=new Set((await owner.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",[r.qualified])).rows.map(x=>x.attname))
    for(const [n,t] of Object.entries(r.requiredColumns))if(!names.has(n))await owner.query('alter table '+r.qualified+' add column '+ident(n)+' '+t)
   }
  }
  await owner.query(await read('supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'))
  for(const file of LOAD_ORDER){
   await owner.query(await read('supabase/qualification/qik-ingest/'+file))
   if(file!=='05_operation_ledger.sql')await owner.query('select qik_ingest_operation.capture_step($1)',[file])
  }
  await owner.query('create table qik_ingest_operation.persistent_install_receipt(id boolean primary key,operation_id text,installer name,sql_manifest_sha256 text,runtime_login name,runtime_token_hash text,runtime_creator_grantor name,installed_at timestamptz default now())')
  await owner.query('insert into qik_ingest_operation.persistent_install_receipt(id,operation_id,installer,sql_manifest_sha256) values(true,$1,$2,$3)',['3'.repeat(32),installer,H])
  await owner.query("create role "+audit+" login nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication password '"+password+"'")
  await owner.query('grant qik_ingest_fn_owner to '+ident(installer)+' with admin false,inherit true,set true')
  // Preserve the observed existing native function owner required by catalogPreflight.
  await admin.query('alter function public.mip_pipeline_v1(text,jsonb) owner to postgres')
  // Superuser performs substrate/extension setup only. Installer is now actual
  // password-authenticated non-superuser CREATEROLE, matching qik owner flags.
  await admin.query('alter role '+ident(installer)+' nosuperuser createrole createdb bypassrls')
  // Actual module configuration in the synthetic database only; no monitoring
  // setting is relaxed by production code. Applies to new installer sessions.
  await admin.query("alter database postgres set session_preload_libraries='auto_explain'")
  await admin.query("alter database postgres set auto_explain.log_min_duration='10000'")
  await admin.query("alter database postgres set auto_explain.log_nested_statements='off'")
  await owner.end();owner=null
  const plan=await prepareAtomicInstall(async p=>read(p))
  const pre=await client(installer)
  const actualIdentity=(await pre.query('select session_user::text login,current_user::text effective,r.rolsuper,r.rolcreaterole,r.rolbypassrls,d.datdba=r.oid database_owner from pg_roles r join pg_database d on d.datname=current_database() where r.rolname=current_user')).rows[0]
  assert.deepEqual(actualIdentity,{login:installer,effective:installer,rolsuper:false,rolcreaterole:true,rolbypassrls:true,database_owner:true})
  const dblink=(await pre.query(DBLINK_PREFLIGHT_SQL)).rows[0]
  assert.equal(dblink.expected,true);assert.equal(dblink.unused,true);assert.equal(dblink.no_servers,true)
  await pre.end()
  const cfg={authorization:'owner-authorized-disabled-comparison-install',
   operationId:'2'.repeat(32),expectedLogin:installer,connectionString:url(installer),
   c3OperationId:'3'.repeat(32),c3ManifestSha256:H,expectedManifestSha256:plan.manifest_sha256,
   dblinkMetadataSha256:dblink.metadata_sha256,collectorSource:'qik-fixture-v1',
   auditLogin:audit,auditConnectionString:url(audit),disposable:true}
  const absent=await withoutInstallerSessionLeak(admin,()=>loseCloseAcknowledgement(()=>reconcileComparisonInstall(cfg)))
  assert.equal(absent.state,'not_installed',safeDiagnostic(absent))
  assert.equal(absent.needs_reconciliation,true)
  assert.equal(absent.connection_cleanup_verified,false)
  assert.equal(absent.cleanup_diagnostic,'atomic_connection_close_failed')
  const cleanAbsent=await withoutInstallerSessionLeak(admin,()=>reconcileComparisonInstall(cfg))
  assert.equal(cleanAbsent.state,'not_installed')
  assert.equal(cleanAbsent.needs_reconciliation,false)
  assert.equal(cleanAbsent.connection_cleanup_verified,true)
  assert.equal(cleanAbsent.cleanup_diagnostic,null)
  for(const threshold of [500,1000]){
   await admin.query("alter database postgres set auto_explain.log_min_duration='"+threshold+"'")
   const refused=await credentialWindow(null,()=>installComparisonAtomic(cfg,async p=>read(p)))
   assert.equal(refused.receipt.state,'installation_refused',safeDiagnostic(refused.receipt))
   assert.equal(refused.receipt.phase,'credential_logging_assertion',safeDiagnostic(refused.receipt))
   assert.equal(refused.receipt.diagnostic,'cnc_credential_logging_refused',safeDiagnostic(refused.receipt))
   assert.equal(refused.seen.calls,0)
   assert.equal(refused.seen.rollback,'30000')
   assert.equal((await reconcileComparisonInstall(cfg)).state,'not_installed')
  }
  await admin.query("alter database postgres set auto_explain.log_min_duration='10000'")
  const loggingSession=await client(installer)
  try{
   const settings=Object.fromEntries((await loggingSession.query("select name,setting from pg_settings where name in ('auto_explain.log_min_duration','auto_explain.log_nested_statements')")).rows.map(row=>[row.name,row.setting]))
   assert.deepEqual(settings,{'auto_explain.log_min_duration':'10000','auto_explain.log_nested_statements':'off'})
  }finally{await loggingSession.end()}
  for(const fault of ['timeout','error','unlimited']){
   const failedWindow=await credentialWindow(fault,()=>installComparisonAtomic(cfg,async p=>read(p)),fault==='error'?750:fault==='unlimited'?0:null)
   assert.equal(failedWindow.receipt.state,'installation_refused',safeDiagnostic(failedWindow.receipt))
   assert.equal(failedWindow.receipt.phase,'credential_configuration',safeDiagnostic(failedWindow.receipt))
   assert.equal(failedWindow.receipt.diagnostic,'atomic_audit_configuration_failed',safeDiagnostic(failedWindow.receipt))
   assert.equal(failedWindow.seen.calls,1)
   assert.equal(failedWindow.receipt.sqlstate,'P0001',safeDiagnostic(failedWindow.receipt))
   assert.equal(failedWindow.seen.bounded,fault==='error'?'750':'1000')
   assert.equal(failedWindow.seen.rollback,fault==='error'?'750':fault==='unlimited'?'0':'30000')
   for(const secret of [cfg.auditConnectionString,password,'synthetic-sensitive-failure'])assert.equal(JSON.stringify(failedWindow.receipt).includes(secret),false)
   assert.equal((await reconcileComparisonInstall(cfg)).state,'not_installed')
  }
  // A foreign LOGIN+BYPASSRLS principal must not acquire this new secret via
  // installer defaults. The installer refuses; it never edits global defaults.
  await admin.query("create role atomic_fixture_reader login bypassrls nosuperuser nocreatedb nocreaterole password '"+password+"'")
  await admin.query('alter default privileges for role '+ident(installer)+' in schema public grant select on tables to service_role')
  const defaultsBefore=(await admin.query('select coalesce(jsonb_agg(to_jsonb(d) order by oid),\'[]\'::jsonb) value from pg_default_acl d')).rows[0].value
  await admin.query('alter default privileges for role '+ident(installer)+' grant select on tables to atomic_fixture_reader;alter default privileges for role '+ident(installer)+' grant usage on schemas to atomic_fixture_reader')
  const defaultsDuring=(await admin.query('select coalesce(jsonb_agg(to_jsonb(d) order by oid),\'[]\'::jsonb) value from pg_default_acl d')).rows[0].value
  const drift=await installComparisonAtomic(cfg,async p=>read(p))
  assert.equal(drift.state,'installation_refused',safeDiagnostic(drift))
  assert.equal(drift.phase,'audit_secret_boundary',safeDiagnostic(drift))
  assert.equal(drift.sqlstate,'P0001',safeDiagnostic(drift))
  assert.equal(drift.diagnostic,'atomic_audit_table_acl',safeDiagnostic(drift))
  assert.deepEqual((await admin.query('select coalesce(jsonb_agg(to_jsonb(d) order by oid),\'[]\'::jsonb) value from pg_default_acl d')).rows[0].value,defaultsDuring)
  assert.equal((await admin.query("select to_regclass('mip_factual.audit_connection') object")).rows[0].object,null)
  await admin.query('alter default privileges for role '+ident(installer)+' revoke select on tables from atomic_fixture_reader;alter default privileges for role '+ident(installer)+' revoke usage on schemas from atomic_fixture_reader')
  assert.deepEqual((await admin.query('select coalesce(jsonb_agg(to_jsonb(d) order by oid),\'[]\'::jsonb) value from pg_default_acl d')).rows[0].value,defaultsBefore)
  for(const [sql,diagnostic] of [
   ['grant select(connection_string) on mip_factual.audit_connection to atomic_fixture_reader','atomic_audit_column_acl'],
   ['create policy unsafe_fixture_read on mip_factual.audit_connection for select to atomic_fixture_reader using(true)','atomic_audit_policy'],
   ['grant execute on function mip_factual_transport.dblink_exec(text,text) to atomic_fixture_reader','atomic_audit_function_acl'],
  ]){
   const rejected=await injectPrivateUnitDrift(sql,()=>installComparisonAtomic(cfg,async p=>read(p)))
   assert.equal(rejected.state,'installation_refused',safeDiagnostic(rejected))
   assert.equal(rejected.phase,'audit_secret_boundary',safeDiagnostic(rejected))
   assert.equal(rejected.sqlstate,'P0001',safeDiagnostic(rejected))
   assert.equal(rejected.diagnostic,diagnostic,safeDiagnostic(rejected))
   assert.equal((await reconcileComparisonInstall(cfg)).state,'not_installed')
  }
  // Y inherits no table rights, but can SET ROLE to NOLOGIN+BYPASSRLS X,
  // which inherits pg_read_all_data. No new-unit ACL is explicitly granted.
  await admin.query("create role atomic_fixture_set_target nologin bypassrls nosuperuser nocreatedb nocreaterole inherit;create role atomic_fixture_set_login login nosuperuser nocreatedb nocreaterole nobypassrls password '"+password+"'")
  await admin.query('grant pg_read_all_data to atomic_fixture_set_target with inherit true,set false;grant atomic_fixture_set_target to atomic_fixture_set_login with inherit false,set true')
  assert.equal((await admin.query("select has_table_privilege('atomic_fixture_set_login','public.articles','SELECT') direct")).rows[0].direct,false)
  const setPath=await installComparisonAtomic(cfg,async p=>read(p))
  assert.equal(setPath.state,'installation_refused',safeDiagnostic(setPath))
  assert.equal(setPath.phase,'audit_secret_boundary',safeDiagnostic(setPath))
  assert.equal(setPath.sqlstate,'P0001',safeDiagnostic(setPath))
  assert.equal(setPath.diagnostic,'atomic_audit_effective_table',safeDiagnostic(setPath))
  assert.equal((await reconcileComparisonInstall(cfg)).state,'not_installed')
  assert.equal((await admin.query("select pg_has_role('atomic_fixture_set_login','atomic_fixture_set_target','SET') allowed,pg_has_role('atomic_fixture_set_target','pg_read_all_data','USAGE') inherited")).rows[0].allowed,true)
  assert.equal((await admin.query("select pg_has_role('atomic_fixture_set_target','pg_read_all_data','USAGE') inherited")).rows[0].inherited,true)
  await admin.query('drop role atomic_fixture_set_login;drop role atomic_fixture_set_target')
  // Force a real mid-install failure at the existing 009 uniqueness constraint.
  await admin.query("insert into public.explanations(id,assertion_id,version,is_current) values('00000000-0000-4000-8000-000000000001','synthetic-duplicate',1,true),('00000000-0000-4000-8000-000000000002','synthetic-duplicate',1,true)")
  const failed=await loseAcknowledgement('rollback',()=>installComparisonAtomic(cfg,async p=>read(p)))
  assert.equal(failed.state,'installation_refused',safeDiagnostic(failed))
  assert.equal(failed.needs_reconciliation,true,safeDiagnostic(failed))
  assert.equal(failed.connection_cleanup_verified,false)
  assert.equal(failed.cleanup_diagnostic,'atomic_cleanup_rollback_failed')
  assert.equal(failed.phase,'source:supabase/qualification/mip-cutover-authority/009_factual_enforcement.sql',safeDiagnostic(failed))
  assert.equal(failed.sqlstate,'23505',safeDiagnostic(failed))
  assert.equal((await admin.query('select count(*)::integer n from pg_roles where rolname=any($1::text[])',[[...RESERVED_ROLES,'mip_tmp_'+cfg.operationId]])).rows[0].n,0)
  assert.equal((await admin.query('select count(*)::integer n from pg_namespace where nspname=any($1::text[])',[[...RESERVED_SCHEMAS,'mip_comparison_install']])).rows[0].n,0)
  assert.equal((await admin.query("select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='dblink'")).rows[0].nspname,'extensions')
  assert.equal((await reconcileComparisonInstall(cfg)).state,'not_installed')
  await admin.query('delete from public.explanations')
  const window=await credentialWindow(null,()=>withoutInstallerSessionLeak(admin,()=>commitProfile==='lost_commit_acknowledgement'
   ?loseAcknowledgement('commit',()=>installComparisonAtomic(cfg,async p=>read(p)))
   :loseCloseAcknowledgement(()=>installComparisonAtomic(cfg,async p=>read(p)))))
  const installed=window.receipt
  assert.deepEqual(window.seen,{bounded:'1000',restored:'30000',rollback:null,calls:1})
  assert.equal(installed.state,commitProfile==='lost_commit_acknowledgement'?'commit_ambiguous':'installed_disabled_audit_pending',safeDiagnostic(installed))
  assert.equal(installed.needs_reconciliation,true,safeDiagnostic(installed))
  if(commitProfile==='lost_commit_acknowledgement'){
   assert.equal(installed.phase,'commit',safeDiagnostic(installed))
   assert.equal(installed.sqlstate,'08006',safeDiagnostic(installed))
   assert.equal(installed.connection_cleanup_verified,true)
   assert.equal(installed.cleanup_diagnostic,null)
  }else{
   assert.equal(installed.connection_cleanup_verified,false)
   assert.equal(installed.cleanup_diagnostic,'atomic_connection_close_failed')
   assert.equal(installed.audit_qualified,false)
   assert.equal(installed.phase,undefined)
   assert.equal(installed.sqlstate,undefined)
  }
  assert.equal(installed.activation_allowed,false)
  const reconciled=await withoutInstallerSessionLeak(admin,()=>reconcileComparisonInstall(cfg))
  assert.equal(reconciled.state,'installed_disabled_audit_pending')
  assert.equal(reconciled.needs_reconciliation,false)
  assert.equal(reconciled.connection_cleanup_verified,true)
  assert.equal(reconciled.cleanup_diagnostic,null)
  const stoppedAudit=await withoutInstallerSessionLeak(admin,()=>loseCloseAcknowledgement(()=>qualifyComparisonAudit(cfg)))
  assert.equal(stoppedAudit.state,'installed_disabled_audit_pending')
  assert.equal(stoppedAudit.needs_reconciliation,true)
  assert.equal(stoppedAudit.audit_qualified,false)
  assert.equal(stoppedAudit.connection_cleanup_verified,false)
  assert.equal((await admin.query('select count(*)::integer n from mip_comparison_install.audit_qualifications')).rows[0].n,0)
  const inspector=await client(installer)
  try{
   for(const name of plan.catalog_inspection_schemas){
    const observed=(await inspector.query("select has_schema_privilege(current_user,$1,'USAGE') usage,has_schema_privilege(current_user,$1,'CREATE') can_create",[name])).rows[0]
    assert.deepEqual(observed,{usage:true,can_create:false})
   }
   for(const signature of ['mip_comparison_kernel_v1.source_snapshot(jsonb,text)','mip_identity.authorize(uuid,text,text)','mip_cutover_authority.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)'])
    assert.equal((await inspector.query("select has_function_privilege(current_user,$1,'EXECUTE') allowed",[signature])).rows[0].allowed,false)
   assert.equal((await inspector.query("select has_table_privilege(current_user,'mip_identity.source_changes','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed")).rows[0].allowed,false)
   await assert.rejects(inspector.query('select 1 from mip_identity.source_changes limit 0'),error=>error.code==='42501')
   await assert.rejects(inspector.query("select mip_comparison_kernel_v1.source_snapshot('{}'::jsonb,'synthetic-inspection-denied')"),error=>error.code==='42501')
  }finally{await inspector.end()}

  assert.equal((await admin.query('select count(*)::integer n from pg_auth_members where roleid in(select oid from pg_roles where rolname=any($1::text[])) or member in(select oid from pg_roles where rolname=any($1::text[]))',[[...RESERVED_ROLES]])).rows[0].n,0)
  assert.equal((await admin.query("select count(*)::integer n from mip_identity.efta_scope")).rows[0].n,0)
  assert.equal((await admin.query("select count(*)::integer n from mip_identity.doj_policy_versions")).rows[0].n,0)
  const denied=await client('atomic_fixture_reader')
  try{
   await assert.rejects(denied.query('select connection_string from mip_factual.audit_connection'),e=>e.code==='42501')
   await assert.rejects(denied.query("select mip_factual_transport.dblink_exec('unused','select 1')"),e=>e.code==='42501')
   await assert.rejects(denied.query('select mip_comparison_install.audit_probe(false)'),e=>e.code==='42501')
  }finally{await denied.end()}
  const unresolvedClose=await withoutInstallerSessionLeak(admin,()=>loseCloseAcknowledgement(()=>qualifyComparisonAudit(cfg),2))
  assert.equal(unresolvedClose.state,'installed_disabled_audit_qualified',safeDiagnostic(unresolvedClose))
  assert.equal(unresolvedClose.needs_reconciliation,true)
  assert.equal(unresolvedClose.audit_qualified,false)
  assert.equal(unresolvedClose.connection_cleanup_verified,false)
  assert.equal(unresolvedClose.cleanup_diagnostic,'atomic_connection_close_failed')
  assert.equal((await admin.query('select count(*)::integer n from mip_comparison_install.audit_qualifications')).rows[0].n,1)
  const auditResult=await withoutInstallerSessionLeak(admin,()=>qualifyComparisonAudit(cfg))
  assert.equal(auditResult.needs_reconciliation,false)
  assert.equal(auditResult.audit_qualified,true)
  assert.equal(auditResult.connection_cleanup_verified,true)
  assert.equal(auditResult.cleanup_diagnostic,null)
  assert.equal(auditResult.state,'installed_disabled_audit_qualified',safeDiagnostic(auditResult))
  assert.equal(auditResult.activation_allowed,false)
  assert.equal((await qualifyComparisonAudit(cfg)).state,'installed_disabled_audit_qualified')
  const receipt=(await admin.query('select * from mip_comparison_install.receipts')).rows
  assert.equal(receipt.length,1)
  assert.equal((await admin.query('select count(*)::integer n from mip_factual.rejection_audit')).rows[0].n,1)
  await assert.rejects(admin.query("update mip_comparison_install.receipts set state=state"),/receipt_immutable/)
  assert.equal((await installComparisonAtomic(cfg,async p=>read(p))).state,'installation_refused')
  assert.equal((await admin.query("select collection_authorized from qik_ingest.collection_gate where id")).rows[0].collection_authorized,false)
 }finally{
  if(owner)await owner.end().catch(()=>{})
  if(admin){
   // Only the independently authenticated synthetic bootstrap can restore the
   // dedicated fixture. Drop the disposable database, never application tables.
   await admin.end()
   const clean=await client(bootstrap,'template1')
   await clean.query("select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres' and pid<>pg_backend_pid()")
   await clean.query('drop database postgres')
   await clean.query('create database postgres owner postgres')
   const created=(await clean.query('select rolname from pg_roles')).rows.map(r=>r.rolname).filter(n=>!baseline.includes(n)&&n!==bootstrap)
   const allowed=new Set([...RESERVED_ROLES,'mip_tmp_'+'2'.repeat(32),'anon','authenticated','service_role','qik_ingest_fn_owner','qik_ingest_runtime',installer,audit,'atomic_fixture_reader','atomic_fixture_set_target','atomic_fixture_set_login'])
   assert.ok(created.every(r=>allowed.has(r)),'unexpected role prevents unbounded cleanup')
   for(const name of created)await clean.query('drop role '+ident(name))
   await clean.end()
   const restored=await client('postgres')
   await restored.query('drop role '+bootstrap)
   assert.deepEqual((await restored.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname),baseline)
   await restored.end()
  }
 }
})
