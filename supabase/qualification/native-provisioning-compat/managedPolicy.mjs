// Explicit provider compatibility policy. Optionless historical profiles never call these transforms.
export const MANAGED_PROFILE='supabase-managed-v1'
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
 if(o.provisioningProfile!==MANAGED_PROFILE||!ID.test(o.provisioningOperationId??'')
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
 return `select jsonb_build_object('profile','${MANAGED_PROFILE}','provisioning_operation_id',${lit(o.provisioningOperationId)},
 'installer_oid','postgres'::regrole::oid::text,
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
 const rows=(await db.query('select * from mip_managed_provisioning.receipts where operation_id=$1',[c.provisioningOperationId])).rows
 const r=rows[0]
 if(rows.length!==1||r.installer!=='postgres'||r.audit_login!==AUDIT_LOGIN||r.metadata_auditor!==METADATA_LOGIN
 ||r.provider_role!=='supabase_admin'||r.c3_operation_id!==c.c3OperationId||r.c3_manifest_sha256!==c.c3ManifestSha256
 ||r.extension_metadata_sha256!==c.dblinkMetadataSha256||!HASH.test(r.extension_metadata_sha256??''))fail()
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
 const definitionHash=Object.values((await db.query(definitionsSQL)).rows[0]??{})[0]
 if(!HASH.test(definitionHash??''))fail()
 return Object.freeze({extensionOid:String(r.extension_oid),providerOid:String(r.provider_oid),definitionHash,
  auditEdge:r.audit_edge,metadataEdge:r.metadata_edge,installerOid:String(r.installer_oid)})
}
export function managedTransportSQL(){
 return `create function mip_factual_transport.dblink_exec(conn text,command text) returns text
 language sql security definer set search_path='' begin atomic
 select ${RAW_SCHEMA}.dblink_exec(conn,command);
 end;
 revoke all on function mip_factual_transport.dblink_exec(text,text) from public,anon,authenticated,service_role;`
}
export function managedBoundarySQL(){
 return `do $managed_boundary$
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
 and exists(select 1 from pg_roles caller where caller.rolcanlogin and not caller.rolsuper and caller.oid<>installer_oid
 and pg_has_role(caller.oid,target.oid,'SET')) loop
 if has_schema_privilege(x.oid,raw_oid,'USAGE,CREATE') then raise exception 'managed_raw_effective_access';end if;
 end loop;
 if has_schema_privilege(factual_oid,raw_oid,'USAGE,CREATE') then raise exception 'managed_factual_raw_access';end if;
 if not ${auditorEdgePredicate(lit(AUDIT_LOGIN)+'::regrole')} or not ${auditorEdgePredicate(lit(METADATA_LOGIN)+'::regrole')} then raise exception 'managed_auditor_edges';end if;
 end $managed_boundary$;`
}
export async function captureManagedFinal(db,c,reference){
 await db.query(managedBoundarySQL())
 const m=(await db.query(managedSnapshotSQL(c))).rows[0]?.metadata
 if(!m||!reference||m.extension?.oid!==reference.extensionOid||m.extension.owner!==reference.providerOid
 ||m.definitions_sha256!==reference.definitionHash||m.installer_oid!==reference.installerOid
 ||!Array.isArray(m.audit_edge)||m.audit_edge.length!==1||!validEdge(m.audit_edge[0],AUDIT_LOGIN,reference.installerOid,reference.auditEdge)
 ||!Array.isArray(m.metadata_edge)||m.metadata_edge.length!==1||!validEdge(m.metadata_edge[0],METADATA_LOGIN,reference.installerOid,reference.metadataEdge))fail()
 return m
}
export function transformManagedActivation(sql,o){
 if(!managedOptions(o))return sql
 sql=once(sql,"catalog_hash text not null check(catalog_hash~'^[0-9a-f]{64}$')","catalog_hash text not null check(catalog_hash~'^[0-9a-f]{64}$'),managed_metadata jsonb not null")
 const old="or exists(select 1 from pg_auth_members where roleid=b.metadata_auditor_oid or member=b.metadata_auditor_oid)"
 if(sql.split(old).length!==4)fail()
 sql=sql.replaceAll(old,"or not "+auditorEdgePredicate('b.metadata_auditor_oid'))
 const anchor="then raise exception 'native_activation_metadata_auditor';end if;"
 if(sql.split(anchor).length!==4)fail()
 sql=sql.replaceAll(anchor,anchor+"\n if b.managed_metadata is distinct from ("+managedSnapshotSQL(o)+") then raise exception 'managed_provisioning_drift';end if;")
 const tail="select 'rewrite',r.oid::text,to_jsonb(r) from pg_catalog.pg_rewrite r\n join pg_catalog.pg_class c on c.oid=r.ev_class join ns n on n.oid=c.relnamespace"
 sql=once(sql,tail,tail+"\n union all\n select 'managed_extension',e.oid::text,to_jsonb(e) from pg_catalog.pg_extension e where e.extname='dblink'\n union all\n select 'managed_extension_dependency',d.classid::text||':'||d.objid||':'||d.objsubid||':'||d.refclassid||':'||d.refobjid||':'||d.refobjsubid||':'||d.deptype,to_jsonb(d) from pg_catalog.pg_depend d where d.refclassid='pg_extension'::regclass and d.refobjid=(select oid from pg_catalog.pg_extension where extname='dblink')")
 return sql
}
