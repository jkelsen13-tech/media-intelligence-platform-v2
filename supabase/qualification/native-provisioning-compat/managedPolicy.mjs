// Explicit provider compatibility policy. Optionless historical profiles never call these transforms.
export const MANAGED_PROFILE='supabase-managed-v1'

export const DEVELOPMENT_PROFILE='supabase-managed-solo-development-v1'
export const TRUSTED_PROVIDER_LOGINS=['supabase_etl_admin','supabase_read_only_user']
export function developmentProfile(o){return o.provisioningProfile===DEVELOPMENT_PROFILE}
// Exclude approved LOGIN callers only. Shared NOLOGIN capabilities remain checked
// whenever any untrusted LOGIN can reach them. No grants or role mutation here.
export function untrustedCallerSQL(o,alias='caller'){
 return developmentProfile(o)?` and ${alias}.rolname not in('supabase_etl_admin','supabase_read_only_user')`:''
}
export function providerSnapshotSQL(){
 return `select jsonb_build_object('roles',(select jsonb_agg(jsonb_build_object(
 'oid',oid::text,'name',rolname,'login',rolcanlogin,'super',rolsuper,'create_role',rolcreaterole,
 'create_db',rolcreatedb,'bypass',rolbypassrls,'inherit',rolinherit,'replication',rolreplication) order by rolname)
 from pg_catalog.pg_roles where rolname in('supabase_etl_admin','supabase_read_only_user')),
 'edges',(select coalesce(jsonb_agg(jsonb_build_object('role',p.rolname,'role_oid',p.oid::text,
 'member',m.rolname,'member_oid',m.oid::text,'grantor',g.rolname,'grantor_oid',g.oid::text,
 'admin',a.admin_option,'inherit',a.inherit_option,'set',a.set_option)
 order by p.rolname,m.rolname,g.rolname),'[]'::jsonb) from pg_catalog.pg_auth_members a
 join pg_catalog.pg_roles p on p.oid=a.roleid join pg_catalog.pg_roles m on m.oid=a.member
 join pg_catalog.pg_roles g on g.oid=a.grantor
 where p.rolname in('supabase_etl_admin','supabase_read_only_user')
 or m.rolname in('supabase_etl_admin','supabase_read_only_user'))) metadata`
}
// The pinned live Auth-session helper uses FOR KEY SHARE. PostgreSQL requires
// UPDATE privilege for this read lock; customer must be able to issue the exact
// UPDATE(id) grant. A provider operation is needed if grant authority is absent.
export async function verifyManagedCallerAuthPrerequisite(db,o){
 if(!developmentProfile(o))return
 const r=(await db.query("select c.relkind='r' and c.relowner='supabase_auth_admin'::regrole and (select count(*) from pg_catalog.pg_attribute where attrelid=c.oid and attnum>0 and not attisdropped and ((attname in('id','user_id') and atttypid='uuid'::regtype) or(attname='not_after' and atttypid='timestamptz'::regtype)))=3 and has_column_privilege('postgres',c.oid,'id','SELECT WITH GRANT OPTION') and has_column_privilege('postgres',c.oid,'user_id','SELECT WITH GRANT OPTION') and has_column_privilege('postgres',c.oid,'id','UPDATE WITH GRANT OPTION') ok from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='sessions'")).rows
 if(r.length!==1||r[0]?.ok!==true)fail()
}
export function installerReadAllPredicate(){
 return "(select count(*)=1 and bool_and(a.grantor=10 and g.rolname='supabase_admin' and a.admin_option and a.inherit_option and a.set_option) from pg_catalog.pg_auth_members a join pg_catalog.pg_roles g on g.oid=a.grantor where a.roleid='pg_read_all_data'::regrole and a.member='postgres'::regrole)"
}
export function providerBoundarySQL(o){
 if(!developmentProfile(o))return ''
 return `do $provider_boundary$ begin
 if not ${installerReadAllPredicate()} or not pg_has_role('postgres','pg_read_all_data','USAGE') then raise exception 'managed_installer_read_all_edge';end if;
 if(select count(*) from pg_catalog.pg_roles where rolname in('supabase_etl_admin','supabase_read_only_user')
 and rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb and rolbypassrls and rolinherit
 and rolreplication=(rolname='supabase_etl_admin'))<>2 then raise exception 'managed_provider_attributes';end if;
 if(select count(*) from pg_catalog.pg_auth_members a
 join pg_catalog.pg_roles p on p.oid=a.roleid join pg_catalog.pg_roles m on m.oid=a.member
 where p.rolname in('supabase_etl_admin','supabase_read_only_user')
 or m.rolname in('supabase_etl_admin','supabase_read_only_user'))<>5
 or exists(select 1 from pg_catalog.pg_auth_members a
 join pg_catalog.pg_roles p on p.oid=a.roleid join pg_catalog.pg_roles m on m.oid=a.member
 join pg_catalog.pg_roles g on g.oid=a.grantor
 where(p.rolname in('supabase_etl_admin','supabase_read_only_user')
 or m.rolname in('supabase_etl_admin','supabase_read_only_user'))
 and not(g.oid=10 and g.rolname='supabase_admin' and not a.admin_option and a.inherit_option and a.set_option
 and ((p.rolname in('pg_monitor','pg_read_all_data') and m.rolname in('supabase_etl_admin','supabase_read_only_user'))
 or(p.rolname='supabase_privileged_role' and m.rolname='supabase_etl_admin'))))
 then raise exception 'managed_provider_edges';end if;
 end $provider_boundary$;`
}

// Provider aggregate statistics are metadata. Only the two provider-owned
// extension views are admitted; statement privacy is independently verified.
export function managedStatisticsViewPredicate(alias='c'){
 return `(${alias}.relkind='v' and ${alias}.relowner='postgres'::regrole and ${alias}.relname in('pg_stat_statements','pg_stat_statements_info')
 and ${alias}.relnamespace=(select oid from pg_catalog.pg_namespace where nspname='extensions')
 and exists(select 1 from pg_catalog.pg_depend d join pg_catalog.pg_extension e on e.oid=d.refobjid
 where d.classid='pg_class'::regclass and d.objid=${alias}.oid and d.refclassid='pg_extension'::regclass
 and d.deptype='e' and e.extname='pg_stat_statements' and e.extowner='postgres'::regrole and e.extversion='1.11'))`
}
export function managedStatisticsCatalogSQL(){
 return `select jsonb_build_object('extension',(select to_jsonb(e) from pg_catalog.pg_extension e where extname='pg_stat_statements'),
 'views',(select jsonb_agg(jsonb_build_object('class',to_jsonb(c),'rules',(select jsonb_agg(to_jsonb(stats_rule) order by stats_rule.oid) from pg_catalog.pg_rewrite stats_rule where stats_rule.ev_class=c.oid)) order by c.relname)
 from pg_catalog.pg_class c where ${managedStatisticsViewPredicate()}))`
}
export const RAW_SCHEMA='mip_factual_transport_raw'
export const AUDIT_LOGIN='mip_native_audit_v1'
export const METADATA_LOGIN='mip_native_metadata_audit_v1'
const HASH=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{32}$/
const fail=()=>{throw Error('managed_provisioning_boundary_refused')}
const lit=s=>"'"+s.replaceAll("'","''")+"'"
export function managedOptions(o){
 if(o.provisioningProfile===undefined){
  if(o.provisioningOperationId!==undefined)fail()
  return false
 }
 if(![MANAGED_PROFILE,DEVELOPMENT_PROFILE].includes(o.provisioningProfile)||!ID.test(o.provisioningOperationId??'')
 ||o.expectedLogin!=='postgres'||o.expectedMetadataAuditor!==METADATA_LOGIN
 ||(o.auditLogin!==undefined&&o.auditLogin!==AUDIT_LOGIN))fail()
 return true
}
export function once(source,needle,value){
 if(source.split(needle).length!==2)fail()
 return source.replace(needle,()=>value)
}
export function edgeQuery(role){
 return `select coalesce(jsonb_agg(jsonb_build_object('role_name',p.rolname,'role_oid',p.oid::text,
 'member_name',m.rolname,'member_oid',m.oid::text,'grantor_name',g.rolname,'grantor_oid',a.grantor::text,
 'admin_option',a.admin_option,'inherit_option',a.inherit_option,'set_option',a.set_option)
 order by a.roleid,a.member,a.grantor),'[]'::jsonb)
 from pg_catalog.pg_auth_members a join pg_catalog.pg_roles p on p.oid=a.roleid
 join pg_catalog.pg_roles m on m.oid=a.member join pg_catalog.pg_roles g on g.oid=a.grantor
 where a.roleid=${role} or a.member=${role}`
}
// Only one bootstrap-issued admin edge to trusted postgres is admitted. No inheritance/SET.
export function auditorEdgePredicate(role){
 return `(select count(*)=1 and bool_and(a.roleid=${role} and a.member='postgres'::regrole
 and a.admin_option and not a.inherit_option and not a.set_option
 and a.grantor=10 and g.rolname='supabase_admin')
 from pg_catalog.pg_auth_members a join pg_catalog.pg_roles g on g.oid=a.grantor
 where a.roleid=${role} or a.member=${role})`
}
const definitionsSQL=`select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
 'class',d.classid::regclass::text,'oid',d.objid,'subid',d.objsubid,
 'proc',(select to_jsonb(p)-'pronamespace' from pg_catalog.pg_proc p where d.classid='pg_proc'::regclass and p.oid=d.objid),
 'type',(select to_jsonb(t)-'typnamespace' from pg_catalog.pg_type t where d.classid='pg_type'::regclass and t.oid=d.objid),
 'fdw',(select to_jsonb(f) from pg_catalog.pg_foreign_data_wrapper f where d.classid='pg_foreign_data_wrapper'::regclass and f.oid=d.objid)
 ) order by d.classid,d.objid,d.objsubid),'[]'::jsonb)::text,'UTF8')),'hex')
 from pg_catalog.pg_depend d where d.refclassid='pg_extension'::regclass
 and d.refobjid=(select oid from pg_catalog.pg_extension where extname='dblink') and d.deptype='e'`
export function managedSnapshotSQL(o){
 managedOptions(o)
 return `select jsonb_build_object('profile','${o.provisioningProfile}'${developmentProfile(o)?",'trusted_provider_metadata',("+providerSnapshotSQL()+")":''},'provisioning_operation_id',${lit(o.provisioningOperationId)},
 'installer_oid','postgres'::regrole::oid::text,${developmentProfile(o)?"'installer_read_all_edge',("+edgeQuery("'pg_read_all_data'::regrole")+"),\'provider_statistics\',("+managedStatisticsCatalogSQL()+"),":''}
 'audit_edge',(${edgeQuery(lit(AUDIT_LOGIN)+'::regrole')}),
 'metadata_edge',(${edgeQuery(lit(METADATA_LOGIN)+'::regrole')}),
 'extension',(select jsonb_build_object('oid',e.oid::text,'owner',e.extowner::text,'version',e.extversion,
 'schema',n.nspname,'relocatable',e.extrelocatable) from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='dblink'),
 'definitions_sha256',(${definitionsSQL}),
 'raw_schema',(select jsonb_build_object('oid',oid::text,'owner',nspowner::text,'acl',nspacl::text) from pg_catalog.pg_namespace where nspname='${RAW_SCHEMA}'),
 'shim',(select jsonb_build_object('oid',p.oid::text,'owner',p.proowner::text,'language',p.prolang,
 'args',p.proargtypes::text,'return',p.prorettype,'definer',p.prosecdef,'config',p.proconfig,
 'source',p.prosrc,'body',p.prosqlbody::text,'acl',p.proacl::text) from pg_catalog.pg_proc p
 where p.oid=to_regprocedure('mip_factual_transport.dblink_exec(text,text)')),
 'dependencies',(select coalesce(jsonb_agg(to_jsonb(d) order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype),'[]'::jsonb)
 from pg_catalog.pg_depend d where (d.refclassid='pg_extension'::regclass and d.refobjid=(select oid from pg_catalog.pg_extension where extname='dblink'))
 or(d.classid='pg_proc'::regclass and d.objid=to_regprocedure('mip_factual_transport.dblink_exec(text,text)')))) metadata`
}
function validEdge(edge,name,installer,recorded){
 return edge?.role_name===name&&edge.member_name==='postgres'&&edge.member_oid===String(installer)
 &&edge.admin_option===true&&edge.inherit_option===false&&edge.set_option===false
 &&edge.grantor_oid==='10'&&edge.grantor_name==='supabase_admin'
 &&JSON.stringify(Object.entries(edge).sort())===JSON.stringify(Object.entries(recorded??{}).sort())
}
export async function verifyManagedPrerequisites(db,c,originalDblinkQuery){
 managedOptions(c)
 await verifyManagedCallerAuthPrerequisite(db,c)
 const control=(await db.query("select (select count(*)=1 from mip_managed_provisioning.receipts) and exists(select 1 from pg_namespace n where n.nspname='mip_managed_provisioning' and n.nspowner='postgres'::regrole and not exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee<>n.nspowner)) and exists(select 1 from pg_class c where c.oid='mip_managed_provisioning.receipts'::regclass and c.relowner='postgres'::regrole and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee<>c.relowner) and not exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attacl is not null)) ok")).rows[0]
 if(control?.ok!==true)fail()
 const rows=(await db.query('select * from mip_managed_provisioning.receipts where operation_id=$1',[c.provisioningOperationId])).rows
 const r=rows[0]
 if(rows.length!==1||r.installer!=='postgres'||r.audit_login!==AUDIT_LOGIN||r.metadata_auditor!==METADATA_LOGIN
 ||r.provider_role!=='supabase_admin'||r.c3_operation_id!==c.c3OperationId||r.c3_manifest_sha256!==c.c3ManifestSha256
 ||r.extension_metadata_sha256!==c.dblinkMetadataSha256||!HASH.test(r.extension_metadata_sha256??''))fail()
 if(developmentProfile(c)){
  await db.query(providerBoundarySQL(c))
  const actual=(await db.query(providerSnapshotSQL())).rows[0]?.metadata
  if(!r.provider_metadata||JSON.stringify(actual)!==JSON.stringify(r.provider_metadata))fail()
 }
 const metadata=(await db.query(originalDblinkQuery)).rows
 const d=metadata[0]
 if(metadata.length!==1||d.unused!==true||d.no_servers!==true||d.metadata_sha256!==c.dblinkMetadataSha256)fail()
 const identity=(await db.query("select session_user='postgres' and current_user='postgres' and 'postgres'::regrole::oid=$1::oid installer,exists(select 1 from pg_extension where oid=$2::oid and extname='dblink' and extversion='1.2' and extnamespace='mip_factual_transport_raw'::regnamespace and extowner=$3::oid and extowner='supabase_admin'::regrole) provider",[r.installer_oid,r.extension_oid,r.provider_oid])).rows[0]
 if(identity?.installer!==true||identity.provider!==true)fail()
 for(const [name,key,oidkey] of [[AUDIT_LOGIN,'audit_edge','audit_oid'],[METADATA_LOGIN,'metadata_edge','metadata_auditor_oid']]){
  const edges=Object.values((await db.query(edgeQuery(lit(name)+'::regrole'))).rows[0]??{})[0]
  if(!Array.isArray(edges)||edges.length!==1||!validEdge(edges[0],name,r.installer_oid,r[key])
  ||edges[0].role_oid!==String(r[oidkey]))fail()
 }
 const memberOwners=(await db.query("select not exists(select 1 from pg_depend d join pg_proc p on d.classid='pg_proc'::regclass and p.oid=d.objid where d.refclassid='pg_extension'::regclass and d.refobjid=$1::oid and d.deptype='e' and p.proowner<>$2::oid) ok",[r.extension_oid,r.provider_oid])).rows[0]
 if(memberOwners?.ok!==true)fail()
 const extraOwners=(await db.query("select not exists(select 1 from pg_depend d left join pg_type t on d.classid='pg_type'::regclass and t.oid=d.objid left join pg_foreign_data_wrapper f on d.classid='pg_foreign_data_wrapper'::regclass and f.oid=d.objid where d.refclassid='pg_extension'::regclass and d.refobjid=$1::oid and d.deptype='e' and(coalesce(t.typowner,$2::oid)<>$2::oid or coalesce(f.fdwowner,$2::oid)<>$2::oid)) ok",[r.extension_oid,r.provider_oid])).rows[0]
 if(extraOwners?.ok!==true)fail()
 const definitionHash=Object.values((await db.query(definitionsSQL)).rows[0]??{})[0]
 if(!HASH.test(definitionHash??''))fail()
 return Object.freeze({extensionOid:String(r.extension_oid),providerOid:String(r.provider_oid),definitionHash,
  auditEdge:r.audit_edge,metadataEdge:r.metadata_edge,installerOid:String(r.installer_oid),c3Baseline:r.c3_baseline_sha256,providerMetadata:r.provider_metadata})
}
export function managedTransportSQL(){
 return `create function mip_factual_transport.dblink_exec(conn text,command text) returns text
 language sql security definer set search_path='' begin atomic
 select ${RAW_SCHEMA}.dblink_exec(conn,command);
 end;
 revoke all on function mip_factual_transport.dblink_exec(text,text) from public,anon,authenticated,service_role;`
}
export function managedBoundarySQL(o={}){
 return providerBoundarySQL(o)+`do $managed_boundary$
 declare raw_oid oid;shim_oid oid;provider_oid oid;installer_oid oid;factual_oid oid;x record;
 begin
 select oid into strict provider_oid from pg_roles where rolname='supabase_admin' and rolsuper;
 select oid into strict installer_oid from pg_roles where rolname='postgres' and not rolsuper;
 select oid into strict factual_oid from pg_roles where rolname='mip_factual_owner_v3';
 select oid into strict raw_oid from pg_namespace where nspname='${RAW_SCHEMA}' and nspowner=installer_oid;
 if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 where n.oid=raw_oid and (a.grantee<>installer_oid or a.privilege_type not in('USAGE','CREATE'))) then raise exception 'managed_raw_acl';end if;
 if not exists(select 1 from pg_extension where extname='dblink' and extversion='1.2' and extrelocatable and extowner=provider_oid and extnamespace=raw_oid) then raise exception 'managed_extension_identity';end if;
 if exists(select 1 from pg_depend d join pg_proc p on d.classid='pg_proc'::regclass and p.oid=d.objid
 where d.refclassid='pg_extension'::regclass and d.refobjid=(select oid from pg_extension where extname='dblink') and d.deptype='e'
 and(p.proowner<>provider_oid or p.pronamespace<>raw_oid)) then raise exception 'managed_extension_members';end if;
 if exists(select 1 from pg_depend d left join pg_type t on d.classid='pg_type'::regclass and t.oid=d.objid
 left join pg_foreign_data_wrapper f on d.classid='pg_foreign_data_wrapper'::regclass and f.oid=d.objid
 where d.refclassid='pg_extension'::regclass and d.refobjid=(select oid from pg_extension where extname='dblink') and d.deptype='e'
 and(coalesce(t.typowner,provider_oid)<>provider_oid or coalesce(t.typnamespace,raw_oid)<>raw_oid or coalesce(f.fdwowner,provider_oid)<>provider_oid))
 then raise exception 'managed_extension_type_owner';end if;
 shim_oid:=to_regprocedure('mip_factual_transport.dblink_exec(text,text)');
 if shim_oid is null or not exists(select 1 from pg_proc where oid=shim_oid and proowner=installer_oid and prosecdef
 and prolang=(select oid from pg_language where lanname='sql') and prorettype='text'::regtype and proargtypes='25 25'::oidvector
 and proconfig=array['search_path=""'] and prosqlbody is not null) then raise exception 'managed_shim_identity';end if;
 if not exists(select 1 from pg_depend where classid='pg_proc'::regclass and objid=shim_oid and refclassid='pg_proc'::regclass
 and refobjid=to_regprocedure('${RAW_SCHEMA}.dblink_exec(text,text)') and deptype='n') then raise exception 'managed_shim_binding';end if;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=shim_oid
 and(a.grantee not in(installer_oid,factual_oid) or a.privilege_type<>'EXECUTE' or(a.grantee<>installer_oid and a.is_grantable)))
 or not has_function_privilege(factual_oid,shim_oid,'EXECUTE') then raise exception 'managed_shim_acl';end if;
 if not has_function_privilege(installer_oid,to_regprocedure('${RAW_SCHEMA}.dblink_exec(text,text)'),'EXECUTE') then raise exception 'managed_shim_raw_execution';end if;
 for x in select target.oid from pg_roles target where not target.rolsuper and target.oid<>installer_oid
 and exists(select 1 from pg_roles caller where caller.rolcanlogin and not caller.rolsuper and caller.oid<>installer_oid${untrustedCallerSQL(o)}
 and pg_has_role(caller.oid,target.oid,'SET')) loop
 if has_schema_privilege(x.oid,raw_oid,'USAGE,CREATE') then raise exception 'managed_raw_effective_access';end if;
 end loop;
 if has_schema_privilege(factual_oid,raw_oid,'USAGE,CREATE') then raise exception 'managed_factual_raw_access';end if;
 if not ${auditorEdgePredicate(lit(AUDIT_LOGIN)+'::regrole')} or not ${auditorEdgePredicate(lit(METADATA_LOGIN)+'::regrole')} then raise exception 'managed_auditor_edges';end if;
 end $managed_boundary$;`
}
export async function captureManagedFinal(db,c,reference){
 await db.query(managedBoundarySQL(c))
 const m=(await db.query(managedSnapshotSQL(c))).rows[0]?.metadata
 if(developmentProfile(c)&&JSON.stringify(m?.trusted_provider_metadata)!==JSON.stringify(reference?.providerMetadata))fail()
 if(!m||!reference||m.extension?.oid!==reference.extensionOid||m.extension.owner!==reference.providerOid
 ||m.definitions_sha256!==reference.definitionHash||m.installer_oid!==reference.installerOid
 ||!Array.isArray(m.audit_edge)||m.audit_edge.length!==1||!validEdge(m.audit_edge[0],AUDIT_LOGIN,reference.installerOid,reference.auditEdge)
 ||!Array.isArray(m.metadata_edge)||m.metadata_edge.length!==1||!validEdge(m.metadata_edge[0],METADATA_LOGIN,reference.installerOid,reference.metadataEdge))fail()
 return m
}
export function transformManagedActivation(sql,o){
 if(!managedOptions(o))return sql
 const installerReplication="and rolcreaterole and rolcreatedb and rolbypassrls and rolinherit and not rolreplication)"
 if(sql.split(installerReplication).length!==4)fail()
 sql=sql.replaceAll(installerReplication,"and rolcreaterole and rolcreatedb and rolbypassrls and rolinherit and rolreplication)")
 sql=once(sql,"catalog_hash text not null check(catalog_hash~'^[0-9a-f]{64}$')","catalog_hash text not null check(catalog_hash~'^[0-9a-f]{64}$'),managed_metadata jsonb not null")
 const old="or exists(select 1 from pg_auth_members where roleid=b.metadata_auditor_oid or member=b.metadata_auditor_oid)"
 if(sql.split(old).length!==4)fail()
 sql=sql.replaceAll(old,"or not "+auditorEdgePredicate('b.metadata_auditor_oid'))
 const anchor="then raise exception 'native_activation_metadata_auditor';end if;"
 if(sql.split(anchor).length!==4)fail()
 sql=sql.replaceAll(anchor,anchor+"\n if b.managed_metadata is distinct from ("+managedSnapshotSQL(o)+") then raise exception 'managed_provisioning_drift';end if;")
 const tail="select 'rewrite',r.oid::text,to_jsonb(r) from pg_catalog.pg_rewrite r\n join pg_catalog.pg_class c on c.oid=r.ev_class join ns n on n.oid=c.relnamespace"
 sql=once(sql,tail,tail+"\n union all\n select 'managed_extension',e.oid::text,to_jsonb(e) from pg_catalog.pg_extension e where e.extname='dblink'\n union all\n select 'managed_extension_dependency',d.classid::text||':'||d.objid||':'||d.objsubid||':'||d.refclassid||':'||d.refobjid||':'||d.refobjsubid||':'||d.deptype::text,to_jsonb(d) from pg_catalog.pg_depend d where d.refclassid='pg_extension'::regclass and d.refobjid=(select oid from pg_catalog.pg_extension where extname='dblink')")
 return sql
}
