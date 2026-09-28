// Source-only until separately qualified. No CLI, activation or automatic retry.
import {createHash} from 'node:crypto'
import {compileSource,PROJECT,NAME_MAPPING} from './compileSource.mjs'
import {collectCatalog,validateCatalog,RESERVED_ROLES,RESERVED_SCHEMAS} from './catalogPreflight.mjs'
import {connectPersistentInstaller} from '../qik-ingest/persistentInstall.mjs'
import {assertCredentialLogging} from '../collector-native-capture/credentialDelivery.mjs'

export const INSTALL_VERSION='qik-comparison-atomic-v1'
export const DOJ_SOURCE_COMMIT='53355765bcc579930130f16ac4bff9a5fe498e92'
export const DOJ_PATH='supabase/qualification/mip-cutover-authority/020_doj_private_permission.sql'
export const DOJ_BLOB='0e0b3d2f3ae200b551b98ce66bc3c90d277ff333'
const RECEIPT_SCHEMA='mip_comparison_install'
const SHA=/^[a-f0-9]{64}$/
const ID=/^[a-f0-9]{32}$/
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/
const COMPATIBILITY_ROLES=Object.freeze(['mip_kernel_reader_compat_v1','mip_kernel_producer_compat_v1','mip_kernel_worker_compat_v1','mip_kernel_scheduler_compat_v1','mip_kernel_selector_compat_v1','mip_kernel_publisher_compat_v1','mip_kernel_scorer_compat_v1'].sort())
const schemas=RESERVED_SCHEMAS.filter(x=>x!=='comparison_qualification')
const digest=x=>createHash('sha256').update(x).digest('hex')
const quote=x=>{if(!LOGIN.test(x))throw Error('atomic_identifier');return '"'+x+'"'}
function refuse(code){throw Error('atomic_'+code)}
function once(s,before,after){if(s.split(before).length!==2)refuse('source_boundary');return s.replace(before,after)}
function outer(s){
 if([...s.matchAll(/^begin;[ \t]*$/gm)].length!==1||[...s.matchAll(/^commit;[ \t]*$/gm)].length!==1
  ||!/^commit;\s*$/m.test(s)||s.slice(s.lastIndexOf('\ncommit;')+8).trim())refuse('transaction_boundary')
 return s.replace(/^begin;[ \t]*$/m,'').replace(/^commit;[ \t]*$/m,'')
}
function split(s,marker){if(s.split(marker).length!==2)refuse('assertion_boundary');const at=s.indexOf(marker);return [s.slice(0,at),s.slice(at)]}
export async function prepareAtomicInstall(readPinnedSource){
 const compiled=await compileSource(readPinnedSource)
 const raw=Buffer.from(await readPinnedSource(DOJ_PATH,DOJ_SOURCE_COMMIT))
 if(createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex')!==DOJ_BLOB)refuse('doj_source_digest')
 let doj=outer(raw.toString('utf8'))
 for(const [from,to] of Object.entries(NAME_MAPPING))doj=doj.replace(new RegExp('\\b'+from+'\\b','g'),to)
 const roles=new Map()
 for(const step of compiled.steps)for(const m of step.sql.matchAll(/\bcreate role ([a-z0-9_]+)([^;]*);/g)){
  if(roles.has(m[1])||!RESERVED_ROLES.includes(m[1])||/\b(login|superuser|createdb|createrole|bypassrls|replication)\b/.test(m[2]))refuse('role_contract')
  roles.set(m[1],m[0])
 }
 if(roles.size!==RESERVED_ROLES.length||RESERVED_ROLES.some(r=>!roles.has(r)))refuse('role_inventory')
 const steps=compiled.steps.map(s=>({...s}))
 const assertionStep=steps.find(s=>s.path.endsWith('/019_native_retention_permissions.sql'))
 const [permissions,assertions]=split(assertionStep.sql,'do $final_native_permissions$')
 const [dojBody,dojAssertions]=split(doj,'do $final_doj_permissions$')
 const body=steps.filter(s=>s!==assertionStep&&!s.path.startsWith('adapter:'))
 // Inject temporary CREATE immediately after new schema declaration, before owner transfers.
 // Revoke before the final assertions. These schemas provably did not exist at preflight.
 const roleList=[...roles.keys()].sort().map(quote).join(',')
 for(const step of body){
  if(step.path.endsWith('/009_factual_enforcement.sql'))step.sql=once(step.sql,
   'create extension dblink with schema mip_factual_transport;',
   'alter extension dblink set schema mip_factual_transport;')
  step.sql=step.sql.replace(/\bcreate schema (?:if not exists )?([a-z0-9_]+);/g,(statement,name)=>{
   if(!schemas.includes(name))refuse('schema_contract')
   return statement+'\ngrant create on schema '+quote(name)+' to '+roleList+';'
  })
  step.compiled_sha256=digest(step.sql)
 }
 const closure=steps.find(s=>s.path==='adapter:compatibility-closure-v1')
 const compatibility=steps.find(s=>s.path==='adapter:compatibility-assertions-v1')
 if(!closure||!compatibility)refuse('compiler_contract')
 // These exact seven freshly created compatibility roles already have all
 // privilege-bearing flags false. PG17 still requires elevated privileges to
 // ALTER those flags to false; change only the differing default INHERIT flag.
 if([...closure.sql.matchAll(/^alter role .*;$/gm)].length!==COMPATIBILITY_ROLES.length)
  refuse('compatibility_role_boundary')
 for(const role of COMPATIBILITY_ROLES){
  if(roles.get(role)!=='create role '+role+';')refuse('compatibility_creation_boundary')
  closure.sql=once(closure.sql,
   'alter role '+role+' nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;',
   'alter role '+role+' noinherit;')
 }
 // Full original attribute/ownership/membership assertions remain unchanged.
 const plan={version:INSTALL_VERSION,target_project:PROJECT,source_commit:compiled.source_commit,
  doj_source_commit:DOJ_SOURCE_COMMIT,roles:[...roles.entries()].sort(([a],[b])=>a.localeCompare(b)),
  body,dojBody,permissions,closure:closure.sql,assertions,dojAssertions,compatibility:compatibility.sql}
 return {...plan,manifest_sha256:digest(JSON.stringify(plan))}
}
export function validateAtomicConfig(c){
 if(!c||c.authorization!=='owner-authorized-disabled-comparison-install'||!ID.test(c.operationId??'')
  ||!LOGIN.test(c.expectedLogin??'')||!ID.test(c.c3OperationId??'')||!SHA.test(c.c3ManifestSha256??'')
  ||!SHA.test(c.expectedManifestSha256??'')||!SHA.test(c.dblinkMetadataSha256??'')||typeof c.collectorSource!=='string'
  ||!/^qik-[a-z0-9_-]{1,90}$/.test(c.collectorSource))refuse('configuration')
 if(!LOGIN.test(c.auditLogin??'')||[c.expectedLogin,'postgres','service_role','authenticator','supabase_admin'].includes(c.auditLogin)
  ||RESERVED_ROLES.includes(c.auditLogin))refuse('audit_login')
 let u
 try{u=new URL(c.auditConnectionString)}catch{refuse('audit_target')}
 const synthetic=c.disposable===true&&process.env.MIP_QIK_COMPARISON_DISPOSABLE==='synthetic-pg17-only'
 const local=synthetic&&u.hostname==='127.0.0.1'&&u.pathname==='/postgres'&&u.password&&decodeURIComponent(u.username)===c.auditLogin&&!u.search&&!u.hash
 if(c.disposable===true&&!local)refuse('disposable_target')
 const pool=u.hostname==='aws-0-us-west-1.pooler.supabase.com'
 if(!['postgres:','postgresql:'].includes(u.protocol)||(!local&&(!u.password||u.pathname!=='/postgres'
  ||u.hash||!['','5432'].includes(u.port)||(!pool&&u.hostname!=='db.'+PROJECT+'.supabase.co')
  ||decodeURIComponent(u.username)!==c.auditLogin+(pool?'.'+PROJECT:'')
  ||u.searchParams.get('sslmode')!=='verify-full'||u.searchParams.get('sslrootcert')!=='system'
  ||u.searchParams.get('connect_timeout')!=='5'
  ||[...u.searchParams.keys()].sort().join(',')!=='connect_timeout,sslmode,sslrootcert')))refuse('audit_target')
 return {operationId:c.operationId,expectedLogin:c.expectedLogin,auditLogin:c.auditLogin,
  c3OperationId:c.c3OperationId,c3ManifestSha256:c.c3ManifestSha256,
  expectedManifestSha256:c.expectedManifestSha256,dblinkMetadataSha256:c.dblinkMetadataSha256,collectorSource:c.collectorSource,
  creator:'mip_tmp_'+c.operationId}
}
// Hash only the existing configuration/receipt rows. Never source articles/captures.
const C3_SQL=String.raw`
select encode(sha256(convert_to(jsonb_build_object(
 'gate',(select jsonb_agg(to_jsonb(t) order by id) from qik_ingest.collection_gate t),
 'schedule',(select jsonb_agg(to_jsonb(t) order by jobname) from qik_ingest.schedule_intent t),
 'credentials',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from qik_ingest.runtime_credentials t),
 'sources',(select jsonb_agg(to_jsonb(t) order by id) from public.ingest_sources t),
 'receipt',(select jsonb_agg(to_jsonb(t) order by id) from qik_ingest_operation.persistent_install_receipt t)
 )::text,'UTF8')),'hex') baseline,
 (select count(*)=1 and bool_and(not collection_authorized) from qik_ingest.collection_gate where id) gate_closed,
 not exists(select 1 from qik_ingest.schedule_intent where active) schedule_closed,
 not exists(select 1 from public.ingest_sources where enabled and collection_enabled) sources_closed,
 exists(select 1 from qik_ingest_operation.persistent_install_receipt
 where id and operation_id=$1 and sql_manifest_sha256=$2) receipt_matches
`;
async function c3(db,c){
 const r=(await db.query(C3_SQL,[c.c3OperationId,c.c3ManifestSha256])).rows[0]
 if(!r||!r.gate_closed||!r.schedule_closed||!r.sources_closed||!r.receipt_matches||!SHA.test(r.baseline))refuse('c3_baseline')
 return r.baseline
}
export const DBLINK_PREFLIGHT_SQL=`
with ext as (
 select e.oid,e.extversion,e.extowner,n.nspname from pg_extension e
 join pg_namespace n on n.oid=e.extnamespace where e.extname='dblink'
), members as (
 select d.classid,d.objid,d.objsubid from pg_depend d,ext e
 where d.refclassid='pg_extension'::regclass and d.refobjid=e.oid and d.deptype='e'
), inventory as (
 select coalesce(jsonb_agg(jsonb_build_object(
 'class',m.classid::regclass::text,'oid',m.objid,'subid',m.objsubid,
 'proc',(select to_jsonb(p)-'proacl'||jsonb_build_object('acl',p.proacl::text) from pg_proc p where m.classid='pg_proc'::regclass and p.oid=m.objid),
 'fdw',(select to_jsonb(f) from pg_foreign_data_wrapper f where m.classid='pg_foreign_data_wrapper'::regclass and f.oid=m.objid)
 ) order by m.classid,m.objid,m.objsubid),'[]'::jsonb) value from members m
)
select e.extversion='1.2' and e.nspname='extensions' and e.extowner=current_user::regrole as expected,
 not exists(select 1 from pg_depend d join members m on d.refclassid=m.classid and d.refobjid=m.objid
 where d.deptype not in ('i','a') and not exists(select 1 from members own where own.classid=d.classid and own.objid=d.objid)) as unused,
 not exists(select 1 from members m join pg_proc p on m.classid='pg_proc'::regclass and p.oid=m.objid where p.proowner<>current_user::regrole) as owns_functions,
 not exists(select 1 from pg_foreign_server s join members m on m.classid='pg_foreign_data_wrapper'::regclass and m.objid=s.srvfdw) as no_servers,
 encode(sha256(convert_to(jsonb_build_object('version',e.extversion,'owner',e.extowner,'schema',e.nspname,'members',i.value)::text,'UTF8')),'hex') metadata_sha256
from ext e cross join inventory i
`;
async function verifyDblink(db,c){
 const result=await db.query(DBLINK_PREFLIGHT_SQL),r=result.rows?.[0]
 if(result.rows?.length!==1||!r.expected||!r.unused||!r.no_servers||!r.owns_functions||r.metadata_sha256!==c.dblinkMetadataSha256)
  refuse('preinstalled_dblink_dependency')
}
async function auditRole(db,c){
 const r=(await db.query(`select r.oid,
 not(rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls) and rolcanlogin as restricted,
 not exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid) as isolated,
 not exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace
 where n.nspname in ('public','evidence_pipeline','qik_ingest') and t.relkind in ('r','p','v','m','f')
 and (has_table_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 or has_any_column_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) as no_material_access
 from pg_roles r where rolname=$1`,[c.auditLogin])).rows[0]
 if(!r?.restricted||!r.isolated||!r.no_material_access)refuse('audit_identity')
}
const receiptDDL=String.raw`
create schema mip_comparison_install;
revoke all on schema mip_comparison_install from public,anon,authenticated,service_role;
create table mip_comparison_install.receipts(
 operation_id text primary key,installer name not null,manifest_sha256 text not null,
 c3_baseline_sha256 text not null,collector_source text not null,audit_login name not null,
 state text not null check(state='installed_disabled_audit_pending'),
 installed_at timestamptz not null default clock_timestamp());
create function mip_comparison_install.reject_change() returns trigger language plpgsql set search_path='' as $immutable$
begin raise exception 'comparison_install_receipt_immutable';end $immutable$;
revoke all on function mip_comparison_install.reject_change() from public,anon,authenticated,service_role;
create trigger immutable before update or delete or truncate on mip_comparison_install.receipts
 for each statement execute function mip_comparison_install.reject_change();
revoke all on mip_comparison_install.receipts from public,anon,authenticated,service_role;
`;
function auditProbeDDL(c){
 const op=c.operationId
 const uid=op.slice(0,8)+'-'+op.slice(8,12)+'-'+op.slice(12,16)+'-'+op.slice(16,20)+'-'+op.slice(20)
 return "\n create table mip_comparison_install.audit_qualifications(\n operation_id text primary key references mip_comparison_install.receipts,\n manifest_sha256 text not null,qualified_at timestamptz not null default clock_timestamp());\n revoke all on mip_comparison_install.audit_qualifications from public,anon,authenticated,service_role;\n create trigger immutable before update or delete or truncate on mip_comparison_install.audit_qualifications\n for each statement execute function mip_comparison_install.reject_change();\n grant usage,create on schema mip_comparison_install to mip_factual_owner_v3;\n create function mip_comparison_install.audit_probe(p_write boolean) returns boolean\n language plpgsql security definer set search_path='' as $probe$\n declare n integer;\n begin\n select count(*) into n from mip_factual.rejection_audit\n where explanation_id='__UID__'::uuid\n and assertion_digest=mip_comparison_kernel_v1.argument_digest(jsonb_build_object('assertion_id','install-audit:__OP__'))\n and rule='provenance' and attempted_transition='published';\n if n=0 and p_write then\n  perform mip_factual.log_rejection(jsonb_build_object('id','__UID__','assertion_id','install-audit:__OP__'),'provenance');\n  return true;\n end if;\n return n=1;\n end $probe$;\n alter function mip_comparison_install.audit_probe(boolean) owner to mip_factual_owner_v3;\n revoke create on schema mip_comparison_install from mip_factual_owner_v3;\n revoke all on function mip_comparison_install.audit_probe(boolean) from public,anon,authenticated,service_role;\n grant execute on function mip_comparison_install.audit_probe(boolean) to __LOGIN__;\n".replaceAll('__UID__',uid).replaceAll('__OP__',op).replaceAll('__LOGIN__',quote(c.expectedLogin))
}
function auditBoundarySQL(c){
 // Database installer and true superusers remain the trusted administration boundary.
 // pg_has_role(...,'SET') computes transitive SET reachability from untrusted
 // LOGIN principals, including reachable NOLOGIN roles and their inherited rights.
 // Isolated built-in NOLOGIN capabilities remain outside that reachable closure.
 return "\ndo $audit_boundary$\ndeclare r record;t oid;f oid;allowed oid[];actual text[];want text[];\n installer oid:='__INSTALLER__'::regrole;\n factual oid:='mip_factual_owner_v3'::regrole;\n owner_role oid:='mip_cutover_schema_owner_v1'::regrole;\n audit_role oid:='__AUDIT__'::regrole;\nbegin\n if to_regprocedure('mip_factual_transport.dblink_exec(text,text)') is null\n or to_regprocedure('mip_factual.log_rejection(jsonb,text)') is null\n or to_regprocedure('mip_comparison_install.audit_probe(boolean)') is null\n or not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace\n  where e.extname='dblink' and e.extversion='1.2' and e.extowner=installer and n.nspname='mip_factual_transport')\n then raise exception 'atomic_audit_transport_configuration';end if;\n foreach t in array array['mip_factual.audit_connection'::regclass::oid,'mip_factual.rejection_audit'::regclass::oid] loop\n  if not exists(select 1 from pg_class where oid=t and relowner=owner_role and relrowsecurity and relforcerowsecurity) then raise exception 'atomic_audit_storage_owner';end if;\n  if exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) p where a.attrelid=t and a.attnum>0 and not a.attisdropped) then raise exception 'atomic_audit_column_acl';end if;\n  select array_agg(g.rolname||':'||a.privilege_type order by g.rolname||':'||a.privilege_type) into actual\n  from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a\n  left join pg_roles g on g.oid=a.grantee where c.oid=t and a.grantee<>owner_role;\n  want:=array['mip_factual_owner_v3:INSERT','mip_factual_owner_v3:SELECT'];\n  if t='mip_factual.rejection_audit'::regclass then\n   select array_agg(x order by x) into want from unnest(want||array['__AUDIT__:INSERT']) x;\n  end if;\n  if actual is distinct from want or exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid=t and (a.grantee=0 or (a.grantee<>owner_role and a.is_grantable))) then raise exception 'atomic_audit_table_acl';end if;\n  if (select count(*) from pg_policy where polrelid=t)<>(case when t='mip_factual.audit_connection'::regclass then 1 else 2 end)\n   or not exists(select 1 from pg_policy where polrelid=t and polname='factual_kernel' and polcmd='*' and polpermissive and polroles=array[factual] and pg_get_expr(polqual,polrelid)='true' and pg_get_expr(polwithcheck,polrelid)='true')\n   or (t='mip_factual.rejection_audit'::regclass and not exists(select 1 from pg_policy where polrelid=t and polname='atomic_audit_insert' and polcmd='a' and polpermissive and polroles=array[audit_role] and polqual is null and pg_get_expr(polwithcheck,polrelid)='true'))\n  then raise exception 'atomic_audit_policy';end if;\n  for r in select target.oid from pg_roles target where not target.rolsuper and target.oid not in(installer,owner_role,factual,audit_role)\n   and exists(select 1 from pg_roles caller where caller.rolcanlogin and not caller.rolsuper and caller.oid<>installer\n    and pg_has_role(caller.oid,target.oid,'SET')) loop\n   if has_table_privilege(r.oid,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r.oid,t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'atomic_audit_effective_table';end if;\n  end loop;\n  if has_table_privilege(audit_role,t,'SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(audit_role,t,'SELECT,UPDATE,REFERENCES')\n   or has_table_privilege(audit_role,t,'INSERT') is distinct from (t='mip_factual.rejection_audit'::regclass) then raise exception 'atomic_audit_login_table';end if;\n end loop;\n for r in select * from (values\n  ('mip_factual',array['__INSTALLER__','__AUDIT__','mip_factual_owner_v3','mip_factual_reviewer_v3','mip_publication_owner_v2','mip_cutover_schema_owner_v1']),\n  ('mip_factual_transport',array['__INSTALLER__','mip_factual_owner_v3']),\n  ('mip_comparison_install',array['__INSTALLER__','mip_factual_owner_v3'])\n ) x(schema_name,allowed) loop\n  if not exists(select 1 from pg_namespace where nspname=r.schema_name and nspowner=installer) then raise exception 'atomic_audit_schema_owner';end if;\n  if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a left join pg_roles g on g.oid=a.grantee\n   where n.nspname=r.schema_name and (a.grantee=0 or not(g.rolname=any(r.allowed)) or (a.grantee<>installer and (a.privilege_type<>'USAGE' or a.is_grantable)))) then raise exception 'atomic_audit_schema_acl';end if;\n end loop;\n for r in select p.oid,p.proowner,p.prosecdef,p.proconfig,p.proacl,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace\n where n.nspname='mip_factual_transport' or (n.nspname='mip_factual' and p.proname='log_rejection') or (n.nspname='mip_comparison_install' and p.proname='audit_probe') loop\n  if r.nspname='mip_factual_transport' then\n   if r.proowner<>installer then raise exception 'atomic_audit_transport_owner';end if;\n   allowed:=array[installer];\n   if r.oid='mip_factual_transport.dblink_exec(text,text)'::regprocedure then allowed:=allowed||array[factual];end if;\n  else\n   if r.proowner<>factual or not r.prosecdef or not coalesce(r.proconfig&&array['search_path=\"\"','search_path='],false) then raise exception 'atomic_audit_function_configuration';end if;\n   allowed:=case when r.proname='audit_probe' then array[factual,installer] else array[factual] end;\n  end if;\n  if exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) a\n   where a.grantee=0 or not(a.grantee=any(allowed)) or (a.grantee<>r.proowner and a.is_grantable)) then raise exception 'atomic_audit_function_acl';end if;\n  for f in select target.oid from pg_roles target where not target.rolsuper and target.oid<>installer\n   and exists(select 1 from pg_roles caller where caller.rolcanlogin and not caller.rolsuper and caller.oid<>installer\n    and pg_has_role(caller.oid,target.oid,'SET')) loop\n   if has_function_privilege(f,r.oid,'EXECUTE') is distinct from (f=any(allowed)) then raise exception 'atomic_audit_effective_execute';end if;\n  end loop;\n end loop;\n if exists(select 1 from pg_auth_members where roleid in(factual,owner_role,audit_role) or member in(factual,owner_role,audit_role)) then raise exception 'atomic_audit_membership';end if;\n if exists(select 1 from pg_roles target where not target.rolsuper and target.oid<>installer\n  and exists(select 1 from pg_roles caller where caller.rolcanlogin and not caller.rolsuper and caller.oid<>installer and pg_has_role(caller.oid,target.oid,'SET'))\n  and (pg_has_role(target.oid,installer,'SET') or pg_has_role(target.oid,installer,'USAGE'))) then raise exception 'atomic_audit_installer_path';end if;\nend $audit_boundary$;\n".replaceAll('__INSTALLER__',c.expectedLogin).replaceAll('__AUDIT__',c.auditLogin)
}
function safe(state,c,hash,extra={}){
 return {state,operation_id:c.operationId,manifest_sha256:hash,activation_allowed:false,...extra}
}
// Only this authenticated entry point executes the prepared program. No raw SQL or
// injectable verification callback is accepted. Caller source reader is blob-pinned.
export async function installComparisonAtomic(config,readPinnedSource){
 const c=validateAtomicConfig(config),plan=await prepareAtomicInstall(readPinnedSource)
 if(plan.manifest_sha256!==c.expectedManifestSha256)refuse('manifest_mismatch')
 const db=await connectPersistentInstaller({connectionString:config.connectionString,
  expectedLogin:c.expectedLogin,sessionPoolerHost:config.sessionPoolerHost,disposable:config.disposable===true})
 let begun=false,commitAttempted=false,phase='begin'
 try{
  await db.query('begin');begun=true
  await db.query("set local lock_timeout='5000ms'")
  await db.query("select pg_advisory_xact_lock(hashtextextended('qik-comparison-atomic-v1',0))")
  phase='catalog_preflight'
  const catalog=await collectCatalog(db)
  // Explicit adapter dependency mode: existing verified dblink in extensions,
  // subsequently relocated atomically. Core catalog's original contract is unchanged.
  await verifyDblink(db,c)
  const checked=validateCatalog({...catalog,extensions:catalog.extensions.filter(e=>e.name!=='dblink')},c.expectedLogin)
  if(!checked.catalog_compatible)refuse('catalog_preflight')
  const collision=(await db.query('select exists(select 1 from pg_namespace where nspname=$1) or exists(select 1 from pg_roles where rolname=$2) collision',[RECEIPT_SCHEMA,c.creator])).rows[0]
  if(collision?.collision!==false)refuse('installation_collision')
  await db.query('lock table public.ingest_sources,qik_ingest.collection_gate,qik_ingest.schedule_intent,qik_ingest.runtime_credentials,qik_ingest_operation.persistent_install_receipt in share row exclusive mode')
  phase='c3_baseline'
  const baseline=await c3(db,c)
  phase='audit_prerequisite'
  await auditRole(db,c)
  const owner=(await db.query("select pg_has_role(current_user,'qik_ingest_fn_owner','SET') can_transfer,has_schema_privilege('qik_ingest_fn_owner','qik_ingest','CREATE') had_create")).rows[0]
  if(owner?.can_transfer!==true||typeof owner.had_create!=='boolean')refuse('existing_c3_owner_transfer')
  phase='temporary_creator'
  await db.query('create role '+quote(c.creator)+' nologin createrole noinherit nosuperuser nocreatedb nobypassrls noreplication')
  await db.query('grant '+quote(c.creator)+' to '+quote(c.expectedLogin)+' with inherit false,set true')
  await db.query('set role '+quote(c.creator))
  for(const [role,statement] of plan.roles){
   await db.query(statement)
   await db.query('grant '+quote(role)+' to '+quote(c.expectedLogin)+' with inherit true,set true')
  }
  await db.query('reset role')
  for(const step of plan.body){
   phase='source:'+step.path
   await db.query(step.sql)
   if(step.path.endsWith('/006_collector_reconciliation.sql'))
    await db.query('insert into mip_identity.collector_config(id,source) values(true,$1)',[c.collectorSource])
   if(step.path.endsWith('/007_survivor_release.sql'))
    await db.query('select mip_identity.install_survivor_fences()')
   if(step.path.endsWith('/009_factual_enforcement.sql')){
    // Existing 009 private contract. Secret only in protocol parameter, never SQL text.
    await assertCredentialLogging(db)
    await db.query("create function pg_temp.atomic_audit_config(p_secret text) returns void language plpgsql security invoker set search_path='' as $private$ begin begin insert into mip_factual.audit_connection(id,connection_string) values(true,p_secret); exception when query_canceled or assert_failure then raise exception 'atomic_audit_configuration_failed'; when others then raise exception 'atomic_audit_configuration_failed'; end; end $private$")
    await db.query('revoke all on function pg_temp.atomic_audit_config(text) from public')
    await db.query('select pg_temp.atomic_audit_config($1)',[config.auditConnectionString])
    await db.query('drop function pg_temp.atomic_audit_config(text)')
    await db.query('grant usage on schema mip_factual to '+quote(c.auditLogin))
    await db.query('grant insert on mip_factual.rejection_audit to '+quote(c.auditLogin))
    await db.query('create policy atomic_audit_insert on mip_factual.rejection_audit for insert to '+quote(c.auditLogin)+' with check(true)')
   }
  }
  phase='doj_permission_unit'
  if(!owner.had_create)await db.query('grant create on schema qik_ingest to qik_ingest_fn_owner')
  await db.query(plan.dojBody)
  if(!owner.had_create)await db.query('revoke create on schema qik_ingest from qik_ingest_fn_owner')
  phase='final_permission_functions'
  await db.query(plan.permissions)
  // New-schema CREATE grants are installer scaffolding, never runtime authority.
  phase='temporary_schema_create_revoke'
  for(const schema of schemas)await db.query('revoke create on schema '+quote(schema)+' from '+plan.roles.map(([r])=>quote(r)).join(','))
  const alterRoles=plan.closure.split('\n').filter(line=>line.startsWith('alter role '))
  const aclClosure=plan.closure.split('\n').filter(line=>!line.startsWith('alter role ')).join('\n')
  phase='compatibility_role_attributes'
  await db.query('set role '+quote(c.creator))
  for(const statement of alterRoles)await db.query(statement)
  await db.query('reset role')
  phase='compatibility_acl_revoke'
  await db.query(aclClosure)
  phase='installation_receipt'
  await db.query(receiptDDL)
  await db.query(auditProbeDDL(c))
  await db.query('insert into mip_comparison_install.receipts(operation_id,installer,manifest_sha256,c3_baseline_sha256,collector_source,audit_login,state) values($1,session_user,$2,$3,$4,$5,$6)',
   [c.operationId,plan.manifest_sha256,baseline,c.collectorSource,c.auditLogin,'installed_disabled_audit_pending'])
  phase='c3_preservation'
  if(await c3(db,c)!==baseline)refuse('c3_drift')
  phase='temporary_creator_ownership'
  const creatorOwns=(await db.query("select exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=$1::regrole and deptype='o') owns_objects",[c.creator])).rows[0]
  if(creatorOwns?.owns_objects!==false)refuse('creator_owned_objects')
  phase='temporary_role_grants_revoke'
  await db.query('set role '+quote(c.creator))
  for(const [role] of plan.roles)await db.query('revoke '+quote(role)+' from '+quote(c.expectedLogin)+' cascade')
  await db.query('reset role')
  await db.query('revoke '+quote(c.creator)+' from '+quote(c.expectedLogin))
  phase='temporary_creator_drop'
  await db.query('drop role '+quote(c.creator))
  phase='temporary_membership_assertions'
  const edges=(await db.query('select count(*)::integer n from pg_auth_members where roleid in(select oid from pg_roles where rolname=any($1::text[])) or member in(select oid from pg_roles where rolname=any($1::text[]))',[plan.roles.map(([r])=>r)])).rows[0]
  if(edges?.n!==0)refuse('residual_memberships')
  phase='audit_secret_boundary'
  await db.query(auditBoundarySQL(c))
  phase='final_assertions'
  await db.query(plan.assertions)
  await db.query(plan.dojAssertions)
  await db.query(plan.compatibility)
  phase='commit'
  commitAttempted=true
  await db.query('commit');begun=false
  return safe('installed_disabled_audit_pending',c,plan.manifest_sha256,{needs_reconciliation:false,audit_qualified:false})
 }catch(error){
  if(begun&&!commitAttempted)await db.query('rollback').catch(()=>{})
  // Never send a replay or claim rollback once COMMIT may have reached the server.
  return safe(commitAttempted?'commit_ambiguous':'installation_refused',c,plan.manifest_sha256,
   {needs_reconciliation:commitAttempted,audit_qualified:false,phase,
    sqlstate:/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null})
 }finally{await db.end().catch(()=>{})}
}
export async function reconcileComparisonInstall(config){
 const c=validateAtomicConfig(config)
 const db=await connectPersistentInstaller({connectionString:config.connectionString,
  expectedLogin:c.expectedLogin,sessionPoolerHost:config.sessionPoolerHost,disposable:config.disposable===true})
 try{
  // Fresh authenticated session. Refuse to mistake a still-running install for absence.
  await db.query('begin')
  const lock=(await db.query("select pg_try_advisory_xact_lock(hashtextextended('qik-comparison-atomic-v1',0)) acquired")).rows[0]
  if(lock?.acquired!==true)return safe('reconciliation_inflight',c,c.expectedManifestSha256,{needs_reconciliation:true})
  const exists=(await db.query("select to_regclass('mip_comparison_install.receipts') is not null present")).rows[0]
  if(!exists?.present){
   const remnants=(await db.query('select exists(select 1 from pg_namespace where nspname=any($1::text[])) or exists(select 1 from pg_roles where rolname=any($2::text[])) present',[[...schemas,RECEIPT_SCHEMA],[...RESERVED_ROLES,c.creator]])).rows[0]
   return safe(remnants?.present?'reconciliation_drift':'not_installed',c,c.expectedManifestSha256,{needs_reconciliation:remnants?.present!==false})
  }
  const r=(await db.query('select operation_id,installer,manifest_sha256,c3_baseline_sha256,collector_source,audit_login,state from mip_comparison_install.receipts where operation_id=$1',[c.operationId])).rows[0]
  if(!r||r.installer!==c.expectedLogin||r.manifest_sha256!==c.expectedManifestSha256
   ||r.collector_source!==c.collectorSource||r.audit_login!==c.auditLogin||r.state!=='installed_disabled_audit_pending'
   ||r.c3_baseline_sha256!==await c3(db,c))return safe('reconciliation_drift',c,c.expectedManifestSha256,{needs_reconciliation:true})
  await db.query(auditBoundarySQL(c))
  return safe('installed_disabled_audit_pending',c,c.expectedManifestSha256,{needs_reconciliation:false,audit_qualified:false})
 }catch{return safe('reconciliation_unavailable',c,c.expectedManifestSha256,{needs_reconciliation:true})}
 finally{await db.query('rollback').catch(()=>{});await db.end().catch(()=>{})}
}

export async function qualifyComparisonAudit(config){
 const c=validateAtomicConfig(config)
 const observed=await reconcileComparisonInstall(config)
 if(observed.state!=='installed_disabled_audit_pending')return observed
 const db=await connectPersistentInstaller({connectionString:config.connectionString,
  expectedLogin:c.expectedLogin,sessionPoolerHost:config.sessionPoolerHost,disposable:config.disposable===true})
 try{
  await db.query('begin')
  const locked=(await db.query("select pg_try_advisory_xact_lock(hashtextextended('qik-comparison-audit-v1',0)) acquired")).rows[0]
  if(locked?.acquired!==true)return safe('audit_qualification_inflight',c,c.expectedManifestSha256,{needs_reconciliation:true})
  const already=(await db.query('select manifest_sha256 from mip_comparison_install.audit_qualifications where operation_id=$1',[c.operationId])).rows[0]
  if(already){
   if(already.manifest_sha256!==c.expectedManifestSha256)refuse('audit_receipt_drift')
   return safe('installed_disabled_audit_qualified',c,c.expectedManifestSha256,{needs_reconciliation:false,audit_qualified:true})
  }
  const written=(await db.query('select mip_comparison_install.audit_probe(true) verified')).rows[0]
  if(written?.verified!==true)refuse('audit_probe')
  await db.query('rollback')
  await db.query('begin')
  const held=(await db.query("select pg_try_advisory_xact_lock(hashtextextended('qik-comparison-audit-v1',0)) acquired")).rows[0]
  if(held?.acquired!==true)refuse('audit_readback_inflight')
  const retained=(await db.query('select mip_comparison_install.audit_probe(false) verified')).rows[0]
  if(retained?.verified!==true)refuse('audit_not_autonomous')
  await c3(db,c)
  await db.query('insert into mip_comparison_install.audit_qualifications(operation_id,manifest_sha256) values($1,$2) on conflict(operation_id) do nothing',[c.operationId,c.expectedManifestSha256])
  await db.query('commit')
  return safe('installed_disabled_audit_qualified',c,c.expectedManifestSha256,{needs_reconciliation:false,audit_qualified:true})
 }catch{
  return safe('installed_disabled_audit_unresolved',c,c.expectedManifestSha256,{needs_reconciliation:true,audit_qualified:false})
 }finally{await db.query('rollback').catch(()=>{});await db.end().catch(()=>{})}
}
