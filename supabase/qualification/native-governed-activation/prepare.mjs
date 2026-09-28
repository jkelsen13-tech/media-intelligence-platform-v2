// Source-only successor preparation. Not installed, activated, or qualified.
// Parent transaction must retain its exact original historical checkpoints.
import {createHash} from 'node:crypto'
export const PROFILE='native-governed-activation-v1'
export const SQL_PATH='supabase/qualification/native-governed-activation/001_profile.sql'
export const SQL_BLOB='2654db95c674d73c0467625b024a16ea6154d2dd'
export const GROUPS=Object.freeze(['mip_arc_native_worker','mip_comparison_worker_v1','mip_identity_broker_v2','mip_mentions_admin','mip_mentions_gateway'])
export const ROLES=Object.freeze([
 ...'mip_collector_owner_v2 mip_collector_scheduler_v1 mip_collector_worker_v1 mip_comparison_producer_owner_v1 mip_comparison_producer_v1 mip_comparison_worker_owner_v1 mip_comparison_worker_v1 mip_cutover_authority_admin_v1 mip_cutover_recovery_v1 mip_cutover_schema_owner_v1 mip_efta_admitter_v1 mip_efta_auth_session_owner_v1 mip_efta_authenticator_v1 mip_efta_owner_v1 mip_efta_private_reader_v1 mip_efta_reviewer_v1 mip_factual_owner_v3 mip_factual_reviewer_v3 mip_identity_broker_v2 mip_identity_owner_v2 mip_journal_gateway_v2 mip_journal_owner_v2 mip_kernel_owner_v2 mip_projection_builder_v1 mip_projection_publisher_owner_v1 mip_projection_publisher_v1 mip_publication_owner_v2 mip_retention_reader_v1 mip_retention_writer_v1'.split(' '),
 ...'mip_kernel_reader_compat_v1 mip_kernel_producer_compat_v1 mip_kernel_worker_compat_v1 mip_kernel_scheduler_compat_v1 mip_kernel_selector_compat_v1 mip_kernel_publisher_compat_v1 mip_kernel_scorer_compat_v1'.split(' '),
 ...'mip_mentions_owner mip_mentions_gateway mip_mentions_admin mip_mentions_native_validator mip_arc_qik_source_owner mip_canonical_writer mip_arc_native_owner mip_arc_native_worker mip_arc_attachment_owner'.split(' ')
].sort())
export const REQUIRED_APIS=Object.freeze([
 ['mip_mentions_admin','mip_native_caller','configure_admission','uuid uuid uuid uuid uuid text name uuid text timestamptz timestamptz boolean'],
 ['mip_mentions_gateway','mip_native_caller','read_current','uuid uuid bigint uuid uuid text'],
 ['mip_arc_native_worker','mip_arc_native','snapshot','uuid uuid uuid'],
 ['mip_arc_native_worker','mip_arc_native','read_scoring_input','uuid uuid text'],
 ['mip_arc_native_worker','mip_arc_native','complete_score','uuid uuid text jsonb'],
 ['mip_arc_native_worker','mip_arc_native','read_current_score','uuid uuid text text uuid'],
 ['mip_comparison_worker_v1','mip_identity','worker_claim','uuid uuid text'],
 ['mip_comparison_worker_v1','mip_identity','worker_complete','uuid uuid text uuid uuid text text jsonb'],
 ['mip_comparison_worker_v1','mip_identity','worker_fail','uuid uuid text uuid uuid text text'],
 ['mip_comparison_worker_v1','mip_identity','worker_journal_put','uuid text text jsonb'],
 ['mip_comparison_worker_v1','mip_identity','worker_journal_get','uuid text text'],
 ['mip_comparison_worker_v1','mip_identity','worker_journal_pending','uuid text text integer'],
 ['mip_comparison_worker_v1','mip_identity','worker_resume_claim','uuid text text'],
 ['mip_identity_broker_v2','mip_identity','configuration','text text'],
 ['mip_identity_broker_v2','mip_identity','issue','uuid text text uuid uuid text text text bigint bigint text']
].map(Object.freeze))
const HASH=/^[0-9a-f]{64}$/,LOGIN=/^[a-z][a-z0-9_]{0,62}$/,OID=/^[1-9][0-9]*$/
const prepared=new WeakSet(),installed=new WeakSet(),creation=new WeakMap(),issuers=new WeakMap()
const fail=code=>{throw Error('native_activation_'+code)}
const digest=s=>createHash('sha256').update(s).digest('hex')
const quote=x=>{if(!LOGIN.test(x))fail('identifier');return '"'+x+'"'}
const literal=x=>"'"+x.replaceAll("'","''")+"'"
function once(s,needle,value){if(s.split(needle).length!==2)fail('compiler_boundary');return s.replace(needle,()=>value)}
export async function prepareNativeActivation(read,{expectedLogin,operationId,expectedMetadataAuditor}){
 quote(expectedLogin);quote(expectedMetadataAuditor)
 if(expectedLogin===expectedMetadataAuditor||ROLES.includes(expectedMetadataAuditor))fail('metadata_auditor')
 if(!/^[0-9a-f]{32}$/.test(operationId??''))fail('operation')
 const issuer='mip_agi_'+operationId
 const bytes=Buffer.from(await read(SQL_PATH)),source=bytes.toString('utf8')
 if(!Buffer.from(source).equals(bytes)||createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==SQL_BLOB)fail('source_digest')
 const marker=" if expected_state='pending' then\n  if broker_session is not null"
 const start=source.indexOf('declare b mip_native_activation.bootstrap;v mip_native_activation.revisions;')
 const end=source.indexOf(marker,start)
 if(start<0||end<start||source.split(marker).length!==2)fail('compiler_boundary')
 let body=source.slice(start,end)
 body=once(body,'deadline timestamptz;','deadline timestamptz;expected_state text;expected_revision uuid;')
 body=once(body,'begin\n',`begin
 select h.revision,coalesce(ar.action,'disabled_bootstrap') into expected_revision,expected_state
 from mip_native_activation.head h left join mip_native_activation.revisions ar on ar.revision=h.revision where h.singleton;
`)
 const structural="create function mip_native_activation.assert_structure() returns void\nlanguage plpgsql set search_path='' as $structure$\n"+body+'end $structure$;'
 let deactivation=body
 deactivation=once(deactivation,"if mip_native_activation.edges() is distinct from want then raise exception 'native_activation_edges';end if;",
  "if exists(select value from jsonb_array_elements(mip_native_activation.edges()) except select value from jsonb_array_elements(want)) "+
  "or exists(select value from jsonb_array_elements(b.original_edges||b.issuer_edges) except select value from jsonb_array_elements(mip_native_activation.edges())) "+
  "then raise exception 'native_activation_edges';end if;")
 const schemaEquality="or\n    ((expected_state='active' or(expected_state='pending' and r.value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2'))) and has_schema_privilege(member_oid,x.oid,'USAGE') is distinct from has_schema_privilege(role_oid,x.oid,'USAGE'))"
 deactivation=once(deactivation,schemaEquality,'')
 const functionStart="  if expected_state='active' or(expected_state='pending' and r.value->>'group' in('mip_mentions_admin','mip_mentions_gateway','mip_identity_broker_v2')) then\n   for x"
 const first=deactivation.indexOf(functionStart),last=deactivation.indexOf("\n  end if;",first)
 if(first<0||last<first)fail('compiler_boundary')
 deactivation=deactivation.slice(0,first)+deactivation.slice(last+"\n  end if;".length)
 // Audit qualification/current authority expiry may never prevent revocation.
 const auditStart=" if expected_state in('pending','active') and not exists("
 const aa=deactivation.indexOf(auditStart),ab=deactivation.indexOf("end if;",aa)
 if(aa<0||ab<aa)fail('compiler_boundary')
 deactivation=deactivation.slice(0,aa)+deactivation.slice(ab+'end if;'.length)
 const deactivationSql="create function mip_native_activation.assert_deactivation_input() returns void\nlanguage plpgsql set search_path='' as $deactivation$\n"+deactivation+'end $deactivation$;'
 let sql=once(source,'__STRUCTURAL_CHECKER__',structural)
 sql=once(sql,'__DEACTIVATION_CHECKER__',deactivationSql)
 sql=once(sql,'__PROTECTED_ROLES__','array['+ROLES.map(literal).join(',')+']')
 sql=sql.replaceAll('__INSTALLER__',()=>quote(expectedLogin)).replaceAll('__ISSUER__',()=>issuer).replaceAll('__AUDITOR__',()=>quote(expectedMetadataAuditor)).replaceAll('__AUDITOR_NAME__',()=>expectedMetadataAuditor)
 if(/__[A-Z_]+__/.test(sql))fail('compiler_boundary')
 const plan=Object.freeze({profile:PROFILE,expectedLogin,operationId,expectedMetadataAuditor,issuer,sql,program_sha256:digest(sql),sql_blob:SQL_BLOB})
 prepared.add(plan);creation.set(plan,new Map());return plan
}
function check(plan){if(!prepared.has(plan)||plan.program_sha256!==digest(plan.sql))fail('plan')}
export function assertActivationRoleInventory(roles){
 if(JSON.stringify([...roles].sort())!==JSON.stringify(ROLES))fail('role_inventory')
}
export async function captureActivationBootstrapCreation(db,plan,role){
 check(plan)
 const seen=creation.get(plan)
 if(!GROUPS.includes(role)||seen.has(role))fail('creation_boundary')
 const q=await db.query("select p.rolname role_name,p.oid::text role_oid,m.rolname member_name,m.oid::text member_oid,a.grantor::text grantor_oid,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member where p.rolname=$1 or m.rolname=$1",[role])
 const e=q.rows[0]
 if(q.rows.length!==1||e.role_name!==role||e.member_name!==(['mip_mentions_admin','mip_mentions_gateway'].includes(role)?plan.expectedLogin:plan.issuer)
  ||e.admin_option!==true||e.inherit_option!==false||e.set_option!==false
  ||![e.role_oid,e.member_oid,e.grantor_oid].every(x=>OID.test(x)))fail('bootstrap_creation')
 seen.set(role,Object.freeze({...e}))
 return Object.freeze({...e})
}
export async function installActivationPreparationInTransaction(db,plan){
 check(plan)
 if(installed.has(plan))fail('preparation_retry')
 await db.query('savepoint native_activation_preparation')
 const id=(await db.query("select session_user::text s,current_user::text c,rolsuper,rolcanlogin,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolreplication from pg_roles where rolname=current_user")).rows[0]
 if(id?.s!==plan.expectedLogin||id.c!==plan.expectedLogin||id.rolsuper||!id.rolcanlogin||!id.rolcreaterole
  ||!id.rolcreatedb||!id.rolbypassrls||!id.rolinherit||id.rolreplication)fail('installer')
 if((await db.query("select exists(select 1 from pg_namespace where nspname='mip_native_activation') collision")).rows[0]?.collision!==false)fail('collision')
 const auditor=(await db.query("select oid::text oid from pg_roles r where rolname=$1 and rolcanlogin and not(rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls or rolinherit) and not exists(select 1 from pg_auth_members where roleid=r.oid or member=r.oid) and not exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=r.oid and deptype in('o','a','i','r'))",[plan.expectedMetadataAuditor])).rows
 if(auditor.length!==1)fail('metadata_auditor')
 await db.query(plan.sql)
 // Default ACLs belong to the provider. Remove them only on our new objects.
 const extra=(await db.query("select distinct g.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a join pg_roles g on g.oid=a.grantee where n.nspname='mip_native_activation' and a.grantee<>p.proowner and g.rolname<>$1",[plan.expectedLogin])).rows
 for(const {rolname} of extra)await db.query('revoke all on all functions in schema mip_native_activation from '+quote(rolname))
 const tableExtra=(await db.query("select distinct g.rolname from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl) a join pg_roles g on g.oid=a.grantee where n.nspname='mip_native_activation' and a.grantee<>c.relowner and g.rolname<>$1",[plan.expectedMetadataAuditor])).rows
 for(const {rolname} of tableExtra)await db.query('revoke all on all tables in schema mip_native_activation from '+quote(rolname))
 await db.query('release savepoint native_activation_preparation')
 installed.add(plan)
}
export async function sealActivationBootstrapInTransaction(db,plan,{operationId,installManifest,nativeProgram}){
 check(plan)
 if(!installed.has(plan)||!issuers.has(plan)||operationId!==plan.operationId||creation.get(plan).size!==GROUPS.length||!/^[0-9a-f]{32}$/.test(operationId)
  ||!HASH.test(installManifest)||!HASH.test(nativeProgram))fail('bootstrap_plan')
 await db.query('savepoint native_activation_seal')
 const expected=GROUPS.map(g=>creation.get(plan).get(g)),issuerEdges=issuers.get(plan)
 const combined=[...expected,...issuerEdges].sort((a,b)=>a.role_name.localeCompare(b.role_name)||a.member_name.localeCompare(b.member_name)||Number(a.grantor_oid)-Number(b.grantor_oid))
 const observed=(await db.query('select mip_native_activation.edges() edges,mip_native_activation.role_catalog() roles')).rows[0]
 if(JSON.stringify(observed?.edges)!==JSON.stringify(combined)){
  // JSONB object field order is not a contract; compare each exact field.
  if(!Array.isArray(observed?.edges)||observed.edges.length!==combined.length
   ||combined.some((e,i)=>Object.keys(e).some(k=>e[k]!==observed.edges[i]?.[k])
    ||Object.keys(observed.edges[i]??{}).length!==Object.keys(e).length))fail('bootstrap_topology')
 }
 if(observed.roles.length!==ROLES.length||observed.roles.some((r,i)=>r.name!==ROLES[i]
  ||r.login||r.super||r.create_role||r.create_db||r.replication||r.bypass))fail('protected_attributes')
 for(const [group,schema,name,args] of REQUIRED_APIS){
  const r=(await db.query("select count(*)::int n,bool_and(has_schema_privilege($1,n.oid,'USAGE') and not has_schema_privilege($1,n.oid,'CREATE') and has_function_privilege($1,p.oid,'EXECUTE')) ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$2 and p.proname=$3 and array(select unnest(p.proargtypes))=array(select x::regtype::oid from unnest(string_to_array($4,' ')) x)",[group,schema,name,args])).rows[0]
  if(r?.n!==1||r.ok!==true)fail('required_api')
 }
 const helper=(await db.query("select count(*)::int n,bool_and(p.proconfig=array['search_path=\"\"'] and not p.proleakproof and p.proparallel='u' and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee not in(p.proowner,$1::regrole) or a.privilege_type<>'EXECUTE' or(a.grantee<>p.proowner and a.is_grantable))) ok from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_native_activation'",[plan.expectedLogin])).rows[0]
 if(helper?.n!==16||helper.ok!==true)fail('helper_boundary')
 await db.query("insert into mip_native_activation.bootstrap select true,$1,session_user,session_user::regrole::oid,$6::name,$6::regrole::oid,$7::jsonb,$8::name,$8::regrole::oid,$2,$3,$4,$5::jsonb,mip_native_activation.role_catalog(),mip_native_activation.catalog_hash()",
 [operationId,installManifest,nativeProgram,plan.program_sha256,JSON.stringify(expected),plan.issuer,JSON.stringify(issuerEdges),plan.expectedMetadataAuditor])
 await db.query("select mip_native_activation.assert_current('disabled_bootstrap',null)")
 await db.query('release savepoint native_activation_seal')
 return Object.freeze({profile:PROFILE,state:'disabled_bootstrap',program_sha256:plan.program_sha256,committed:false,publication_allowed:false,production_qualified:false})
}

const EXTRA_GROUPS=Object.freeze(GROUPS.filter(g=>!g.startsWith('mip_mentions_')))
const CREATE_GROUP=Object.freeze({
 mip_comparison_worker_v1:'create role mip_comparison_worker_v1 nologin nosuperuser nobypassrls;',
 mip_identity_broker_v2:'create role mip_identity_broker_v2 nologin nosuperuser nobypassrls;',
 mip_arc_native_worker:'create role mip_arc_native_worker nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;'
})
export async function createActivationIssuerInTransaction(db,plan){
 check(plan)
 await db.query('savepoint native_activation_issuer')
 if(issuers.has(plan)||(await db.query('select exists(select 1 from pg_roles where rolname=$1) collision',[plan.issuer])).rows[0]?.collision!==false)fail('issuer_collision')
 await db.query('create role '+quote(plan.issuer)+' nologin createrole noinherit nosuperuser nocreatedb nobypassrls noreplication')
 await db.query('grant '+quote(plan.issuer)+' to '+quote(plan.expectedLogin)+' with admin false,inherit false,set true')
 const rows=(await db.query("select p.rolname role_name,p.oid::text role_oid,m.rolname member_name,m.oid::text member_oid,a.grantor::text grantor_oid,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member where p.rolname=$1 or m.rolname=$1 order by a.grantor",[plan.issuer])).rows
 if(rows.length!==2||rows.some(e=>e.role_name!==plan.issuer||e.member_name!==plan.expectedLogin||e.inherit_option
  ||![e.role_oid,e.member_oid,e.grantor_oid].every(v=>OID.test(v)))
  ||rows.filter(e=>e.admin_option&&!e.set_option).length!==1
  ||rows.filter(e=>!e.admin_option&&e.set_option&&e.grantor_oid===e.member_oid).length!==1)fail('issuer_creation')
 issuers.set(plan,rows.map(e=>Object.freeze({...e})))
 await db.query('release savepoint native_activation_issuer')
}
export async function createActivationOperationalGroup(db,plan,role){
 check(plan)
 if(!EXTRA_GROUPS.includes(role)||!issuers.has(plan)||creation.get(plan).has(role))fail('issuer_group')
 if((await db.query('select exists(select 1 from pg_roles where rolname=$1) collision',[role])).rows[0]?.collision!==false)fail('group_collision')
 await db.query('set local role '+quote(plan.issuer))
 await db.query(CREATE_GROUP[role])
 await db.query('set local role '+quote(plan.expectedLogin))
 await captureActivationBootstrapCreation(db,plan,role)
}
export async function retireActivationIssuerCreationAuthority(db,plan){
 check(plan)
 if(!EXTRA_GROUPS.every(g=>creation.get(plan).has(g)))fail('issuer_incomplete')
 await db.query('alter role '+quote(plan.issuer)+' nocreaterole')
}

// Call ONLY after the parent's SAVEPOINT and immediately before a fixed,
// already-pinned assertion helper/fragment; then ROLLBACK TO that SAVEPOINT.
// Never wrap permission/schema mutations in this historical-only checkpoint.
export async function dropActivationIssuerForHistoricalCheckpoint(db,plan){
 check(plan)
 if(!issuers.has(plan))fail('issuer_missing')
 await db.query('savepoint native_activation_drop_guard')
 const q=(await db.query("select session_user::text s,current_user::text c,r.oid::text oid,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolbypassrls,r.rolinherit,r.rolreplication,exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=r.oid and (deptype='o' or(deptype in('a','i','r') and classid<>'pg_auth_members'::regclass))) owns_or_acl,exists(select 1 from pg_auth_members where grantor=r.oid) issued_runtime from pg_roles r where rolname=$1",[plan.issuer])).rows[0]
 if(q?.s!==plan.expectedLogin||q.c!==plan.expectedLogin||q.oid!==issuers.get(plan)[0].role_oid
  ||q.rolcanlogin||q.rolsuper||q.rolcreatedb||q.rolbypassrls||q.rolinherit||q.rolreplication
  ||q.owns_or_acl||q.issued_runtime)fail('historical_issuer')
 await db.query('drop role '+quote(plan.issuer))
 await db.query('release savepoint native_activation_drop_guard')
}
