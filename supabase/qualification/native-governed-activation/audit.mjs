import {auditorEdgePredicate,managedSnapshotSQL} from '../native-provisioning-compat/managedPolicy.mjs'
// Independent read-only catalog auditor. No installer credential, SQL callback,
// AUTH row, captured content, session token, or currentness waiver.
import pg from 'pg'
import {connectionTarget} from '../collector-native-capture/authenticatedPgDriver.mjs'
import {prepareNativeActivation,PROFILE,GROUPS,ROLES} from './prepare.mjs'
const fail=()=>{throw Error('native_activation_metadata_audit_refused')}
const boundedSqlstate=error=>/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const sortEdges=a=>a.map(x=>Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))))
 .sort((a,b)=>a.role_name.localeCompare(b.role_name)||a.member_name.localeCompare(b.member_name)||Number(a.grantor_oid)-Number(b.grantor_oid))
const AUDITOR_SQL=String.raw`
select r.oid::text oid,session_user::text login,current_user::text effective,
 r.rolcanlogin and not(r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication or r.rolbypassrls or r.rolinherit)
 and not exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid)
 and not exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=r.oid and deptype='o')
 and not exists(select 1 from pg_namespace n where n.nspname<>'information_schema' and n.nspname !~ '^pg_' and has_schema_privilege(r.oid,n.oid,'CREATE'))
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where (a.grantee=r.oid and a.privilege_type='EXECUTE') or
   (a.grantee in(select oid from pg_roles where rolname=any($1)) and has_function_privilege(r.oid,p.oid,'EXECUTE')))

 -- CASE guards the function call itself. AND predicate order is not an
 -- execution barrier: PostgreSQL may otherwise test nonsequences/other columns.
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname<>'information_schema' and n.nspname !~ '^pg_'
   and case when c.relkind in('r','p','v','m','f')
    and (n.nspname<>'mip_native_activation' or c.relname not in('bootstrap','head','revisions'))
   then has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
   else false end)
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname<>'information_schema' and n.nspname !~ '^pg_'
   and case when c.relkind='S' then has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE')
    else false end)
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where case when n.nspname='mip_native_activation' and c.relkind='r'
   then has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES')
   else false end)
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where case when n.nspname='mip_native_activation' and c.relname='revisions' and c.relkind='r'
   then has_column_privilege(r.oid,c.oid,'authority','SELECT') else false end)
 as safe
from pg_roles r where rolname=session_user;
`
export async function auditNativeActivationMetadata(config,readPinnedSource){
 let db=null,begun=false,verified=false,result,phase='source'
 try{
 const plan=await prepareNativeActivation(readPinnedSource,{expectedLogin:config.expectedLogin,operationId:config.operationId,
  expectedMetadataAuditor:config.expectedMetadataAuditor,...(config.provisioningProfile?{provisioningProfile:config.provisioningProfile,provisioningOperationId:config.provisioningOperationId}:{})})
 phase='configuration'
 if(plan.program_sha256!==config.expectedSuccessorProgram)fail()
 if(config.disposable&&process.env.MIP_NATIVE_ACTIVATION_ARM!=='synthetic-pg17-only')fail()
 const url=connectionTarget(config.metadataAuditConnectionString,config.expectedMetadataAuditor,config.disposable===true,config.sessionPoolerHost??null)
 if(url.pathname!=='/postgres')fail()
 db=new pg.Client({connectionString:url.href,ssl:config.disposable?false:{rejectUnauthorized:true},
  connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:15000,application_name:'mip-native-activation-metadata-audit'})
  phase='connect'
  await db.connect()
  if(config.provisioningProfile&&!config.disposable&&(db.connection?.stream?.encrypted!==true||db.connection?.stream?.authorized!==true))fail()
  phase='transaction'
  await db.query('begin read only');begun=true
  await db.query("set local statement_timeout='10000ms'")
  // regproc catalog values must render exactly as in the pinned hash function.
  await db.query("set local search_path=''")
  await db.query('select pg_advisory_xact_lock_shared(171903,7001)')
  phase='auditor_identity'
  const id=(await db.query(config.provisioningProfile?AUDITOR_SQL.replace('not exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid)',auditorEdgePredicate('r.oid')):AUDITOR_SQL,[GROUPS])).rows[0]
  if(id?.login!==config.expectedMetadataAuditor||id.effective!==id.login||id.safe!==true)fail()
  phase='bootstrap'
  const b=(await db.query('select * from mip_native_activation.bootstrap where singleton')).rows[0]
  if(!b||b.operation_id!==config.operationId||b.installer!==config.expectedLogin
   ||String(b.metadata_auditor_oid)!==id.oid||b.metadata_auditor!==id.login
   ||b.install_manifest!==config.expectedInstallManifest||b.native_program!==config.expectedNativeProgram
   ||b.successor_program!==plan.program_sha256)fail()
  if(config.provisioningProfile){
   // Independent catalog read: no installer credential or installed SQL callback.
   phase='managed_installer'
   const installer=(await db.query("select rolname=$2 and rolcanlogin and not rolsuper and rolcreaterole and rolcreatedb and rolbypassrls and rolinherit and rolreplication ok from pg_catalog.pg_roles where oid=$1::oid",[b.installer_oid,config.expectedLogin])).rows[0]
   if(installer?.ok!==true)fail()
   phase='managed_catalog'
   const actual=(await db.query(managedSnapshotSQL(config))).rows[0]?.metadata
   if(!same(actual,b.managed_metadata))fail()
  }
  phase='head'
  const h=(await db.query('select revision from mip_native_activation.head where singleton')).rows[0]
  const v=h?.revision?(await db.query('select revision,predecessor,operation_id,action,members,request_hash from mip_native_activation.revisions where revision=$1',[h.revision])).rows[0]:null
  if(!h||h.revision&&!v||v&&v.operation_id!==b.operation_id)fail()
  const state=v?.action??'disabled_bootstrap'
  if(!['disabled_bootstrap','pending','active'].includes(state))fail()
  // Extract a single fixed SELECT body from the pinned source, never accept SQL
  // from config or the database's installed function implementation.
  phase='catalog_source'
  const begin="create function mip_native_activation.catalog_hash() returns text\nlanguage sql stable set search_path='' as $f$\n"
  if(plan.sql.split(begin).length!==2)fail()
  const tail=plan.sql.split(begin)[1],end=tail.indexOf('\n$f$;')
  if(end<0)fail()
  phase='catalog_initial'
  const catalog=(await db.query(tail.slice(0,end))).rows[0]
  if(Object.values(catalog??{})[0]!==b.catalog_hash)fail()
  phase='roles'
  const roles=(await db.query("select oid::text oid,rolname name,rolcanlogin login,rolsuper super,rolcreaterole create_role,rolcreatedb create_db,rolreplication replication,rolbypassrls bypass,rolinherit inherit from pg_roles where rolname=any($1) order by rolname",[ROLES])).rows
  if(roles.length!==ROLES.length||roles.some((r,i)=>r.name!==ROLES[i]||r.login||r.super||r.create_role||r.create_db||r.replication||r.bypass||Object.keys(r).some(k=>r[k]!==b.role_catalog[i]?.[k])))fail()
  phase='edges'
  const edges=(await db.query("select p.rolname role_name,p.oid::text role_oid,m.rolname member_name,m.oid::text member_oid,a.grantor::text grantor_oid,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member where p.rolname=any($1) or m.rolname=any($1)",[[...ROLES,plan.issuer]])).rows
  const expected=[...b.original_edges,...b.issuer_edges]
  for(const m of v?.members??[]){
   if(state==='active'||state==='pending'&&['mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2'].includes(m.group))
    expected.push({role_name:m.group,role_oid:m.group_oid,member_name:m.name,member_oid:m.oid,
     grantor_oid:['mip_mentions_admin','mip_mentions_gateway'].includes(m.group)?String(b.installer_oid):String(b.issuer_oid),
     admin_option:false,inherit_option:true,set_option:false})
  }
  if(!same(sortEdges(edges),sortEdges(expected)))fail()
  phase='issuer'
  const issuer=(await db.query("select not(rolcanlogin or rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls or rolinherit) and oid=$2::oid and not exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=r.oid and (deptype='o' or(deptype in('a','i','r') and classid<>'pg_auth_members'::regclass))) and not pg_has_role($3::oid,r.oid,'USAGE') and pg_has_role($3::oid,r.oid,'SET') ok from pg_roles r where rolname=$1",[plan.issuer,b.issuer_oid,b.installer_oid])).rows[0]
  if(issuer?.ok!==true)fail()
  phase='issuer_execute'
  const issuerExecute=(await db.query("select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee in(select oid from pg_roles where rolname=any($1)) and has_function_privilege($2::oid,p.oid,'EXECUTE')) bad",[GROUPS,b.issuer_oid])).rows[0]
  if(issuerExecute?.bad!==false)fail()
  // The unchanged pinned historical fragments established each protected RLS,
  // owner and ACL shape. The independent full catalog hash above covers them
  // again in the restored topology, including transitive owner helpers.

  for(const role of GROUPS){
   phase='group_paths'
   const paths=(await db.query("select not pg_has_role($1::oid,$3::regrole::oid,'USAGE') and not pg_has_role($1::oid,$3::regrole::oid,'SET') and not pg_has_role($2::oid,$3::regrole::oid,'USAGE') and not pg_has_role($2::oid,$3::regrole::oid,'SET') and not exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=$3::regrole and deptype='o') ok",[b.installer_oid,b.issuer_oid,role])).rows[0]
   if(paths?.ok!==true)fail()
  }
  for(const m of [...(v?.members??[]),{name:plan.issuer,oid:String(b.issuer_oid),group:null}]){
   const runtime=m.group!==null
   const enabled=runtime&&(state==='active'||state==='pending'&&['mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2'].includes(m.group))
   phase='runtime_attributes'
   const attr=(await db.query("select oid=$2::oid and rolcanlogin=$3 and not(rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls or rolinherit) and not exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=r.oid and (deptype='o' or(deptype in('a','i','r') and classid<>'pg_auth_members'::regclass))) ok from pg_roles r where rolname=$1",[m.name,m.oid,runtime])).rows[0]
   if(attr?.ok!==true)fail()
   if(runtime){
    phase='runtime_edges'
    const extra=(await db.query("select exists(select 1 from pg_auth_members where (roleid=$1::oid or member=$1::oid) and not($2 and roleid=$3::oid and member=$1::oid and grantor=$4::oid and not admin_option and inherit_option and not set_option)) bad",[m.oid,enabled,m.group_oid,['mip_mentions_admin','mip_mentions_gateway'].includes(m.group)?b.installer_oid:b.issuer_oid])).rows[0]
    if(extra?.bad!==false)fail()
   }
   phase='runtime_rights'
   const rights=(await db.query("select not exists(select 1 from pg_namespace n where n.nspname<>'information_schema' and n.nspname !~ '^pg_' and (has_schema_privilege($1::oid,n.oid,'CREATE') or($2 and has_schema_privilege($1::oid,n.oid,'USAGE') is distinct from has_schema_privilege($3::oid,n.oid,'USAGE')))) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname<>'information_schema' and n.nspname !~ '^pg_' and $2 and has_function_privilege($1::oid,p.oid,'EXECUTE') is distinct from has_function_privilege($3::oid,p.oid,'EXECUTE')) and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('mip_mentions','mip_arc_native','mip_arc_qik_source','mip_arc_projection_private','mip_native_comparison','mip_native_caller','mip_comparison_kernel_v1','mip_cutover_authority','mip_identity','mip_factual','evidence_pipeline','auth') and c.relkind in('r','p','v','m','f','S') and case when c.relkind='S' then has_sequence_privilege($1::oid,c.oid,'USAGE,SELECT,UPDATE') when c.relkind in('r','p','v','m','f') then has_table_privilege($1::oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege($1::oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') else false end) ok",[m.oid,enabled,m.group_oid??b.issuer_oid])).rows[0]
   if(rights?.ok!==true)fail()
  }
  phase='catalog_final'
  if(Object.values((await db.query(tail.slice(0,end))).rows[0]??{})[0]!==b.catalog_hash)fail()
  phase='commit'
  await db.query('commit');begun=false;verified=true
  result={profile:PROFILE,state,revision:h.revision,operation_id:b.operation_id,permission_boundary_current:true,
   authority_current:false,production_qualified:false,publication_allowed:false,material_access_allowed:false}
 }catch(error){
  result={profile:PROFILE,state:'unverified',phase,sqlstate:boundedSqlstate(error),permission_boundary_current:false,authority_current:false,
   production_qualified:false,publication_allowed:false,material_access_allowed:false}
 }finally{
  let cleanup=true,cleanupPhase=null,cleanupSqlstate=null
  if(begun)try{await db.query('rollback')}catch(error){cleanup=false;cleanupPhase='rollback';cleanupSqlstate=boundedSqlstate(error)}
  if(db)try{await db.end()}catch(error){cleanup=false;cleanupPhase='close';cleanupSqlstate=boundedSqlstate(error)}
  result.cleanup_phase=cleanupPhase;result.cleanup_sqlstate=cleanupSqlstate
  result.connection_cleanup_verified=cleanup
  if(!cleanup||!verified)result.permission_boundary_current=false
 }
 return Object.freeze(result)
}
