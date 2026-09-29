// Held prerequisite provisioning, never installation/activation/material processing.
// Explicit trusted-installer ADMIN profile. Secure inputs remain memory-only.
import {createHash,randomBytes,createHmac,pbkdf2Sync} from 'node:crypto'
import pg from 'pg'
import {assertCredentialLogging} from '../collector-native-capture/credentialDelivery.mjs'
import {DEVELOPMENT_PROFILE,developmentProfile,providerBoundarySQL,providerSnapshotSQL} from './managedPolicy.mjs'
export const PROFILE='supabase-managed-v1'
export const AUDIT_LOGIN='mip_native_audit_v1'
export const METADATA_LOGIN='mip_native_metadata_audit_v1'
const INSTALLER='postgres',PROVIDER='supabase_admin',PROJECT='qikvmopbtijoebdqosyq',POOL='aws-0-us-west-1.pooler.supabase.com'
const CA='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
const qi=s=>'"'+s.replaceAll('"','""')+'"'
const hash=s=>createHash('sha256').update(s).digest('hex')
const fail=()=>{throw Error('managed_provisioning_refused')}
const C3_SQL="\nselect encode(sha256(convert_to(jsonb_build_object(\n 'gate',(select jsonb_agg(to_jsonb(t) order by id) from qik_ingest.collection_gate t),\n 'schedule',(select jsonb_agg(to_jsonb(t) order by jobname) from qik_ingest.schedule_intent t),\n 'credentials',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from qik_ingest.runtime_credentials t),\n 'sources',(select jsonb_agg(to_jsonb(t) order by id) from public.ingest_sources t),\n 'receipt',(select jsonb_agg(to_jsonb(t) order by id) from qik_ingest_operation.persistent_install_receipt t)\n )::text,'UTF8')),'hex') baseline,\n (select count(*)=1 and bool_and(not collection_authorized) from qik_ingest.collection_gate where id) gate_closed,\n not exists(select 1 from qik_ingest.runtime_credentials) credentials_empty,\n not exists(select 1 from qik_ingest.schedule_intent where active) schedule_closed,\n not exists(select 1 from public.ingest_sources where enabled and collection_enabled) sources_closed,\n exists(select 1 from qik_ingest_operation.persistent_install_receipt\n where id and operation_id=$1 and sql_manifest_sha256=$2) receipt_matches\n"
export const DBLINK_PREREQUISITE_SQL="\nwith ext as (\n select e.oid,e.extversion,e.extowner,n.nspname from pg_extension e\n join pg_namespace n on n.oid=e.extnamespace where e.extname='dblink'\n), members as (\n select d.classid,d.objid,d.objsubid from pg_depend d,ext e\n where d.refclassid='pg_extension'::regclass and d.refobjid=e.oid and d.deptype='e'\n), inventory as (\n select coalesce(jsonb_agg(jsonb_build_object(\n 'class',m.classid::regclass::text,'oid',m.objid,'subid',m.objsubid,\n 'proc',(select to_jsonb(p)-'proacl'||jsonb_build_object('acl',p.proacl::text) from pg_proc p where m.classid='pg_proc'::regclass and p.oid=m.objid),\n 'fdw',(select to_jsonb(f) from pg_foreign_data_wrapper f where m.classid='pg_foreign_data_wrapper'::regclass and f.oid=m.objid)\n ) order by m.classid,m.objid,m.objsubid),'[]'::jsonb) value from members m\n)\nselect e.extversion='1.2' and e.nspname='extensions' and e.extowner=current_user::regrole as expected,\n not exists(select 1 from pg_depend d join members m on d.refclassid=m.classid and d.refobjid=m.objid\n where d.deptype not in ('i','a') and not exists(select 1 from members own where own.classid=d.classid and own.objid=d.objid)) as unused,\n not exists(select 1 from members m join pg_proc p on m.classid='pg_proc'::regclass and p.oid=m.objid where p.proowner<>current_user::regrole) as owns_functions,\n not exists(select 1 from pg_foreign_server s join members m on m.classid='pg_foreign_data_wrapper'::regclass and m.objid=s.srvfdw) as no_servers,\n encode(sha256(convert_to(jsonb_build_object('version',e.extversion,'owner',e.extowner,'schema',e.nspname,'members',i.value)::text,'UTF8')),'hex') metadata_sha256\nfrom ext e cross join inventory i\n"
const EDGE_SQL="select r.rolname role_name,r.oid::text role_oid,m.rolname member_name,m.oid::text member_oid,g.rolname grantor_name,g.oid::text grantor_oid,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where r.rolname=$1 or m.rolname=$1"
function config(c){
 if(!c||Object.keys(c).sort().join()!==['auditLogin','c3ManifestSha256','c3OperationId','disposable','expectedLogin','expectedMetadataAuditor','operationId','provisioningProfile'].sort().join())fail()
 if(![PROFILE,DEVELOPMENT_PROFILE].includes(c.provisioningProfile)||c.expectedLogin!==INSTALLER||c.auditLogin!==AUDIT_LOGIN||c.expectedMetadataAuditor!==METADATA_LOGIN||typeof c.disposable!=='boolean')fail()
 if(!/^[a-f0-9]{32}$/.test(c.operationId)||!/^[a-f0-9]{32}$/.test(c.c3OperationId)||!/^[a-f0-9]{64}$/.test(c.c3ManifestSha256))fail()
 if(c.disposable&&(process.env.MIP_MANAGED_PROVISIONING_ARM!=='synthetic-pg17-only'||process.env.MIP_DISPOSABLE_POSTGRES!=='qik-persistent-install'))fail()
 return Object.freeze({...c,request_sha256:hash(JSON.stringify(Object.fromEntries(Object.entries(c).sort(([a],[b])=>a.localeCompare(b)))))})
}
function target(value,login,audit,disposable,ca){
 let u;try{u=new URL(value)}catch{fail()}
 const pool=u.hostname===POOL
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.password||u.hash||u.pathname!=='/postgres'||!['','5432'].includes(u.port))fail()
 if(disposable){
  if(u.hostname!=='127.0.0.1'||decodeURIComponent(u.username)!==login||u.search)fail()
 }else{
  if(![POOL,'db.'+PROJECT+'.supabase.co'].includes(u.hostname)||decodeURIComponent(u.username)!==login+(pool?'.'+PROJECT:''))fail()
  if(audit){
   if([...u.searchParams.keys()].sort().join()!=='connect_timeout,sslmode,sslrootcert'||u.searchParams.get('sslmode')!=='verify-full'||u.searchParams.get('sslrootcert')!=='system'||u.searchParams.get('connect_timeout')!=='5')fail()
  }else if(u.search)fail()
  if(typeof ca!=='string'||hash(ca)!==CA)fail()
 }
 return {host:u.hostname,port:5432,database:'postgres',user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),ssl:disposable?false:{rejectUnauthorized:true,ca}}
}
async function connect(t){
 const db=new pg.Client({...t,connectionTimeoutMillis:5000,statement_timeout:1000,query_timeout:5000,application_name:'mip-managed-prerequisite-provisioning'})
 db.on('error',()=>{})
 try{await db.connect();await db.query("set statement_timeout='1000ms'");await db.query("set lock_timeout='500ms'");return db}catch{try{await db.end()}catch{const e=Error('managed_connection_cleanup_unverified');e.cleanup_unverified=true;throw e}fail()}
}
async function identity(db,c){
 const r=(await db.query("select session_user::text login,current_user::text effective,r.oid::text oid,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,r.rolinherit,r.rolreplication,current_database() database,current_setting('server_version_num') version,current_setting('supautils.privileged_role',true) privileged,current_setting('supautils.superuser',true) provider,pg_has_role(current_user,'supabase_privileged_role','USAGE') privileged_usage,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) tls from pg_roles r where r.rolname=current_user")).rows[0]
 if(!r||r.login!==INSTALLER||r.effective!==INSTALLER||r.rolsuper||!r.rolcreaterole||!r.rolcreatedb||!r.rolbypassrls||!r.rolinherit||r.rolreplication!==true||r.database!=='postgres'||r.version!=='170006'||r.privileged!=='supabase_privileged_role'||r.privileged_usage!==true||r.provider!==PROVIDER||(!c.disposable&&(db.connection?.stream?.encrypted!==true||db.connection?.stream?.authorized!==true)))fail()
 const p=(await db.query("select oid::text oid from pg_roles where rolname=$1 and rolsuper",[PROVIDER])).rows[0]
 if(!p)fail()
 return {installer_oid:r.oid,provider_oid:p.oid}
}
async function c3(db,c){
 const r=(await db.query(C3_SQL,[c.c3OperationId,c.c3ManifestSha256])).rows[0]
 if(!r||!r.gate_closed||!r.credentials_empty||!r.schedule_closed||!r.sources_closed||!r.receipt_matches||!/^[a-f0-9]{64}$/.test(r.baseline))fail()
 return r.baseline
}
async function extension(db,ids,expectedSchema='mip_factual_transport_raw'){
 const r=(await db.query("select e.oid::text oid,e.extversion,e.extowner::text owner,n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='dblink'")).rows[0]
 if(!r||r.extversion!=='1.2'||r.owner!==ids.provider_oid||r.nspname!==expectedSchema)fail()
 const v=(await db.query(DBLINK_PREREQUISITE_SQL)).rows[0]
 if(!v?.unused||!v.no_servers||!/^[a-f0-9]{64}$/.test(v.metadata_sha256))fail()
 const wrong=(await db.query("select exists(select 1 from pg_depend d join pg_proc p on d.classid='pg_proc'::regclass and p.oid=d.objid where d.refclassid='pg_extension'::regclass and d.refobjid=$1::oid and d.deptype='e' and p.proowner<>$2::oid) bad",[r.oid,ids.provider_oid])).rows[0]
 if(wrong?.bad!==false)fail()
 const privilege=(await db.query("select has_function_privilege(current_user,($1||'.dblink_exec(text,text)')::regprocedure,'EXECUTE WITH GRANT OPTION') allowed",[expectedSchema])).rows[0]
 if(privilege?.allowed!==true)fail()
 if(expectedSchema==='mip_factual_transport_raw'){
  const isolated=(await db.query("select nspowner=current_user::regrole and not exists(select 1 from aclexplode(coalesce(nspacl,acldefault('n',nspowner))) a where a.grantee<>nspowner) ok from pg_namespace where nspname=$1",[expectedSchema])).rows[0]
  if(isolated?.ok!==true)fail()
 }
 return {extension_oid:r.oid,extension_metadata_sha256:v.metadata_sha256}
}
async function auditor(db,name,ids,allowInstalled=false){
 const r=(await db.query("select oid::text oid,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname=$1",[name])).rows[0]
 if(!r||!r.rolcanlogin||r.rolinherit||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls)fail()
 const edges=(await db.query(EDGE_SQL,[name])).rows
 if(edges.length!==1)fail()
 const e=edges[0]
 if(e.role_name!==name||e.role_oid!==r.oid||e.member_name!==INSTALLER||e.member_oid!==ids.installer_oid||e.grantor_name!==PROVIDER||e.grantor_oid!==ids.provider_oid||e.grantor_oid!=='10'||e.admin_option!==true||e.inherit_option!==false||e.set_option!==false)fail()
 const right=(await db.query("select pg_has_role($1::oid,$2::oid,'USAGE') or pg_has_role($1::oid,$2::oid,'SET') elevated,exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=$1::oid and (deptype='o' or(deptype in('a','i','r') and classid<>'pg_auth_members'::regclass))) direct_dependency",[r.oid,ids.installer_oid])).rows[0]
 if(right?.elevated!==false||(!allowInstalled&&right.direct_dependency!==false))fail()
 const material=(await db.query("select exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname in('public','auth','evidence_pipeline','qik_ingest') and case when t.relkind in('r','p','v','m','f') then has_table_privilege($1::oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege($1::oid,t.oid,'SELECT,INSERT,UPDATE,REFERENCES') else false end) allowed",[r.oid])).rows[0]
 if(material?.allowed!==false)fail()
 return {oid:r.oid,edge:e}
}
function verifier(password){
 const salt=randomBytes(16),salted=pbkdf2Sync(password,salt,4096,32,'sha256')
 return 'SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest('base64')+':'+createHmac('sha256',salted).update('Server Key').digest('base64')
}
export async function assertManagedCredentialLogging(db){
 await assertCredentialLogging(db)
 const rows=(await db.query("select name,setting from pg_settings where name=any($1::text[])",[['statement_timeout','lock_timeout','auto_explain.log_nested_statements']])).rows
 const v=Object.fromEntries(rows.map(r=>[r.name,r.setting]))
 if(!(Number(v.statement_timeout)>0&&Number(v.statement_timeout)<=1000)||!(Number(v.lock_timeout)>0&&Number(v.lock_timeout)<=500)||![undefined,'off'].includes(v['auto_explain.log_nested_statements']))fail()
}
async function createAuditors(db,targets){
 await assertManagedCredentialLogging(db)
 await db.query("create function pg_temp.mip_managed_create_auditor(which_auditor text,scram text) returns boolean language plpgsql security invoker set search_path='' as $f$ begin if session_user<>'postgres' or current_user<>'postgres' or which_auditor is null or which_auditor not in('mip_native_audit_v1','mip_native_metadata_audit_v1') or scram is null or scram!~'^SCRAM-SHA-256[$]4096:[A-Za-z0-9+/=]{24}[$][A-Za-z0-9+/=]{44}:[A-Za-z0-9+/=]{44}$' then return false;end if;begin execute format('create role %I login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %L',which_auditor,scram);return true;exception when query_canceled or assert_failure then return false;when others then return false;end;end $f$")
 await db.query('revoke all on function pg_temp.mip_managed_create_auditor(text,text) from public')
 for(const [name,t] of [[AUDIT_LOGIN,targets.audit],[METADATA_LOGIN,targets.metadata]]){
  await assertManagedCredentialLogging(db)
  const result=(await db.query('select pg_temp.mip_managed_create_auditor($1,$2) applied',[name,verifier(t.password)])).rows[0]
  if(result?.applied!==true)fail()
 }
 await db.query('drop function pg_temp.mip_managed_create_auditor(text,text)')
}
async function lock(db){
 await db.query('begin')
 const r=(await db.query("select pg_try_advisory_xact_lock(hashtextextended('qik-comparison-atomic-v1',0)) acquired")).rows[0]
 if(r?.acquired!==true)fail()
 await db.query('lock table public.ingest_sources,qik_ingest.collection_gate,qik_ingest.schedule_intent,qik_ingest.runtime_credentials,qik_ingest_operation.persistent_install_receipt in share row exclusive mode')
}
const RECEIPT_DDL="create schema mip_managed_provisioning;revoke all on schema mip_managed_provisioning from public,anon,authenticated,service_role;create table mip_managed_provisioning.receipts(operation_id text primary key,request_sha256 text not null,installer name not null,installer_oid oid not null,audit_login name not null,audit_oid oid not null,metadata_auditor name not null,metadata_auditor_oid oid not null,audit_edge jsonb not null,metadata_edge jsonb not null,provider_role name not null,provider_oid oid not null,extension_oid oid not null,extension_metadata_sha256 text not null,c3_operation_id text not null,c3_manifest_sha256 text not null,c3_baseline_sha256 text not null,created_at timestamptz not null default clock_timestamp());revoke all on mip_managed_provisioning.receipts from public,anon,authenticated,service_role;create function mip_managed_provisioning.immutable_receipt() returns trigger language plpgsql set search_path='' as $f$ begin raise exception 'managed_receipt_immutable';end $f$;revoke all on function mip_managed_provisioning.immutable_receipt() from public,anon,authenticated,service_role;create trigger immutable_receipt before update or delete or truncate on mip_managed_provisioning.receipts for each statement execute function mip_managed_provisioning.immutable_receipt()"
async function receipt(db,c,ids,baseline){
 const rows=(await db.query('select * from mip_managed_provisioning.receipts')).rows
 if(rows.length!==1)fail()
 const r=rows[0]
 if(developmentProfile(c)){
  await db.query(providerBoundarySQL(c))
  if(JSON.stringify(r.provider_metadata)!==JSON.stringify((await db.query(providerSnapshotSQL())).rows[0]?.metadata))fail()
 }
 const a=await auditor(db,AUDIT_LOGIN,ids),m=await auditor(db,METADATA_LOGIN,ids),d=await extension(db,ids)
 if(r.operation_id!==c.operationId||r.request_sha256!==c.request_sha256||r.installer!==INSTALLER||String(r.installer_oid)!==ids.installer_oid||r.audit_login!==AUDIT_LOGIN||String(r.audit_oid)!==a.oid||r.metadata_auditor!==METADATA_LOGIN||String(r.metadata_auditor_oid)!==m.oid||r.provider_role!==PROVIDER||String(r.provider_oid)!==ids.provider_oid||String(r.extension_oid)!==d.extension_oid||r.extension_metadata_sha256!==d.extension_metadata_sha256||r.c3_operation_id!==c.c3OperationId||r.c3_manifest_sha256!==c.c3ManifestSha256||r.c3_baseline_sha256!==baseline)fail()
 for(const [left,right] of [[r.audit_edge,a.edge],[r.metadata_edge,m.edge]])if(Object.keys(right).some(k=>left?.[k]!==right[k])||Object.keys(left??{}).length!==Object.keys(right).length)fail()
 const safe=(await db.query("select n.nspowner=current_user::regrole and t.relowner=current_user::regrole and t.relkind='r' and not exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee<>n.nspowner) and not exists(select 1 from aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a where a.grantee<>t.relowner) ok from pg_namespace n join pg_class t on t.relnamespace=n.oid where n.nspname='mip_managed_provisioning' and t.relname='receipts'")).rows[0]
 if(safe?.ok!==true)fail()
 return r
}
function outcome(state,c,phase,unknown=false){
 return {contract:'qik-managed-prerequisites-v1',state,operation_id:c?.operationId??null,request_sha256:c?.request_sha256??null,needs_reconciliation:unknown,phase,installation_allowed:false,activation_allowed:false,material_access_allowed:false,publication_allowed:false,connection_cleanup_verified:false}
}
async function authentication(targets,c){
 for(const [name,t] of [[AUDIT_LOGIN,targets.audit],[METADATA_LOGIN,targets.metadata]]){
  let db
  try{
   db=await connect(t)
   const r=(await db.query("select session_user::text login,current_user::text effective,(select ssl from pg_stat_ssl where pid=pg_backend_pid()) tls")).rows[0]
   if(r?.login!==name||r.effective!==name||(!c.disposable&&(db.connection?.stream?.encrypted!==true||db.connection?.stream?.authorized!==true)))fail()
  }finally{if(db)try{await db.end()}catch{const e=Error('managed_auditor_cleanup_unverified');e.cleanup_unverified=true;throw e}}
 }
}
async function run(action,input,secrets){
 let c,db,phase='configuration',commitAttempted=false,committed=false,result,clean=true
 try{
  c=config(input)
  if(!secrets||Object.keys(secrets).sort().join()!=='audit,caPem,installer,metadataAudit')fail()
  const targets={installer:target(secrets.installer,INSTALLER,false,c.disposable,secrets.caPem),audit:target(secrets.audit,AUDIT_LOGIN,true,c.disposable,secrets.caPem),metadata:target(secrets.metadataAudit,METADATA_LOGIN,false,c.disposable,secrets.caPem)}
  if(!/^[\x21-\x7e]{24,256}$/.test(targets.audit.password)||!/^[\x21-\x7e]{24,256}$/.test(targets.metadata.password)||new Set([targets.installer.password,targets.audit.password,targets.metadata.password]).size!==3)fail()
  phase='installer_connection';db=await connect(targets.installer)
  phase='installer_identity';const ids=await identity(db,c)
  phase='provider_boundary'
  if(developmentProfile(c))await db.query(providerBoundarySQL(c))
  phase='serialization';await lock(db)
  phase='c3_boundary';const baseline=await c3(db,c)
  // This phase owns initial creation only, never post-install credential maintenance.
  // Installed audit_connection and protected policies require a separate qualified procedure.
  phase='installed_phase'
  if((await db.query("select exists(select 1 from pg_namespace where nspname in('mip_comparison_install','mip_native_activation')) present")).rows[0].present)fail()
  const exists=(await db.query("select exists(select 1 from pg_namespace where nspname='mip_managed_provisioning') present")).rows[0].present
  if(!exists){
   if(action==='reconcile'){await db.query('rollback');result=outcome('not_provisioned',c,phase);return result}
   phase='collision'
   if((await db.query("select exists(select 1 from pg_roles where rolname=any($1::text[])) present",[[AUDIT_LOGIN,METADATA_LOGIN]])).rows[0].present)fail()
   if((await db.query("select exists(select 1 from pg_namespace where nspname in('mip_comparison_install','mip_native_activation','mip_factual_transport_raw')) present")).rows[0].present)fail()
   phase='provider_extension'
   if(!(await db.query("select exists(select 1 from pg_extension where extname='dblink') present")).rows[0].present)await db.query('create extension dblink with schema extensions')
   await extension(db,ids,'extensions')
   await db.query('create schema mip_factual_transport_raw;revoke all on schema mip_factual_transport_raw from public,anon,authenticated,service_role;alter extension dblink set schema mip_factual_transport_raw')
   const d=await extension(db,ids)
   phase='secure_auditor_creation';await createAuditors(db,targets)
   const a=await auditor(db,AUDIT_LOGIN,ids),m=await auditor(db,METADATA_LOGIN,ids)
   phase='immutable_receipt';await db.query(developmentProfile(c)?RECEIPT_DDL.replace('created_at timestamptz','provider_metadata jsonb not null,created_at timestamptz'):RECEIPT_DDL)
   await db.query("insert into mip_managed_provisioning.receipts(operation_id,request_sha256,installer,installer_oid,audit_login,audit_oid,metadata_auditor,metadata_auditor_oid,audit_edge,metadata_edge,provider_role,provider_oid,extension_oid,extension_metadata_sha256,c3_operation_id,c3_manifest_sha256,c3_baseline_sha256"+(developmentProfile(c)?",provider_metadata":"")+") values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17"+(developmentProfile(c)?",$18::jsonb":"")+")",[c.operationId,c.request_sha256,INSTALLER,ids.installer_oid,AUDIT_LOGIN,a.oid,METADATA_LOGIN,m.oid,JSON.stringify(a.edge),JSON.stringify(m.edge),PROVIDER,ids.provider_oid,d.extension_oid,d.extension_metadata_sha256,c.c3OperationId,c.c3ManifestSha256,baseline,...(developmentProfile(c)?[JSON.stringify((await db.query(providerSnapshotSQL())).rows[0]?.metadata)]:[])])
  }
  phase='receipt_readback';const r=await receipt(db,c,ids,baseline)
  phase='commit';commitAttempted=true;await db.query('commit');committed=true
  await db.end();db=null
  phase='distinct_auditor_authentication';await authentication(targets,c)
  result={...outcome('provisioned_authentication_verified',c,phase),receipt:{operation_id:r.operation_id,audit_oid:String(r.audit_oid),metadata_auditor_oid:String(r.metadata_auditor_oid),extension_oid:String(r.extension_oid),extension_metadata_sha256:r.extension_metadata_sha256}}
 }catch(e){
  if(e?.cleanup_unverified===true)clean=false
  result=outcome(committed?'provisioned_authentication_unverified':commitAttempted?'commit_outcome_unknown':'provisioning_refused',c,phase,commitAttempted)
  if(db&&!commitAttempted)try{await db.query('rollback')}catch{clean=false;result.needs_reconciliation=true}
 }finally{
  if(db)try{await db.end()}catch{clean=false}
  if(result)result.connection_cleanup_verified=clean
  if(!clean&&result)result.needs_reconciliation=true
 }
 return result
}
export const provisionManagedPrerequisites=(config,secrets)=>run('provision',config,secrets)
export const reconcileManagedPrerequisites=(config,secrets)=>run('reconcile',config,secrets)
