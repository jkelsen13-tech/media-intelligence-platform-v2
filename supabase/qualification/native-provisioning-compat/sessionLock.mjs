// Explicit session-lock successor. Historical SQL bytes are never edited.
// Two fixed SQL-standard bodies bind dependencies at CREATE time. No dynamic
// query, caller-selected lock, DML, separate connection, or Auth-row return.
export const SESSION_LOCK_PROFILE='supabase-managed-solo-session-lock-v1'
export const SESSION_LOCK_SCHEMA='mip_auth_session_lock'
export const sessionLockProfile=o=>o.provisioningProfile===SESSION_LOCK_PROFILE
const once=(s,n,v)=>{if(s.split(n).length!==2)throw Error('session_lock_source_boundary');return s.replace(n,()=>v)}
const owner='mip_efta_auth_session_owner_v1'
export const SESSION_LOCK_DDL=`
create schema mip_auth_session_lock authorization postgres;
revoke all on schema mip_auth_session_lock from public,anon,authenticated,service_role,supabase_admin,supabase_etl_admin,supabase_read_only_user,authenticator;
create function mip_auth_session_lock.key_share(u pg_catalog.uuid,s pg_catalog.uuid)
returns pg_catalog.bool language sql volatile security definer parallel unsafe
set search_path='' begin atomic
 select true from auth.sessions x where x.id=s and x.user_id=u for key share;
end;
create function mip_auth_session_lock.share(u pg_catalog.uuid,s pg_catalog.uuid)
returns table(deadline pg_catalog.timestamptz) language sql volatile security definer parallel unsafe
set search_path='' begin atomic
 select x.not_after from auth.sessions x where x.id=s and x.user_id=u for share;
end;
revoke all on all functions in schema mip_auth_session_lock from public,anon,authenticated,service_role,supabase_admin,supabase_etl_admin,supabase_read_only_user,authenticator;
grant usage on schema mip_auth_session_lock to mip_efta_auth_session_owner_v1;
grant execute on function mip_auth_session_lock.key_share(uuid,uuid),mip_auth_session_lock.share(uuid,uuid) to mip_efta_auth_session_owner_v1;
`
export function transformSessionLockBackend(sql,path,o){
 if(!sessionLockProfile(o)||!path.endsWith('/012_efta_live_authentication.sql'))return sql
 sql=once(sql,"select x.user_id into observed_subject from auth.sessions x where x.id=p_auth_session and x.user_id=p_subject for key share;\n if not found or observed_subject is distinct from p_subject then raise exception 'efta_live_auth_session_invalid';end if;",
 "if mip_auth_session_lock.key_share(p_subject,p_auth_session) is distinct from true then raise exception 'efta_live_auth_session_invalid';end if;")
 sql=once(sql,'grant usage on schema mip_identity,mip_comparison_kernel_v1,auth,mip_cutover_authority to '+owner+';',
 'grant usage on schema mip_identity,mip_comparison_kernel_v1,mip_cutover_authority to '+owner+';')
 sql=once(sql,'grant select(id,user_id) on auth.sessions to '+owner+';',SESSION_LOCK_DDL)
 sql=once(sql,'grant update(id) on auth.sessions to '+owner+';','-- Successor: row locking uses only the fixed postgres-owned helper; no Auth UPDATE delegation.')
 return sql
}
export function transformSessionLockCaller(sql,o){
 if(!sessionLockProfile(o))return sql
 for(const column of ['id','user_id']){
  sql=once(sql,"or not has_column_privilege('"+owner+"',auth_table,'"+column+"','SELECT')",
  "or has_column_privilege('"+owner+"',auth_table,'"+column+"','SELECT')")
 }
 sql=once(sql,"or not has_column_privilege('"+owner+"',auth_table,'id','UPDATE')",
 "or has_column_privilege('"+owner+"',auth_table,'id','UPDATE')")
 sql=once(sql,'grant select(not_after) on auth.sessions to '+owner+';','-- Successor share helper returns only the locked expiry column.')
 sql=once(sql,'select x.not_after into deadline from auth.sessions x\n where x.id=session_id and x.user_id=u for share;',
 'select x.deadline into deadline from mip_auth_session_lock.share(u,session_id) x;')
 sql=once(sql,"if actual is distinct from array['id:SELECT','id:UPDATE','not_after:SELECT','user_id:SELECT']",
 'if actual is not null')
 sql=once(sql,"or not has_column_privilege('"+owner+"',auth_table,'not_after','SELECT')",
 "or has_column_privilege('"+owner+"',auth_table,'not_after','SELECT')")
 return sql
}
// The activation permission checker uses the same restricted owner and original
// publication-fence-before-Auth SHARE/expiry checks as the native caller.
export function transformSessionLockActivation(sql,o){
 if(!sessionLockProfile(o))return sql
 sql=once(sql,'select x.not_after into deadline from auth.sessions x\n where x.id=session_id and x.user_id=u for share;',
 'select x.deadline into deadline from mip_auth_session_lock.share(u,session_id) x;')
 return once(sql,'-- Preserve that ACL; perform the identical live-session check with existing column rights.',
 '-- Preserve that ACL; use the fixed locked-expiry helper without direct Auth privileges.')
}
// Exact canonical deparser text is source-defined, not captured from an installed
// helper and then trusted. Direct catalog audit resolves OIDs without USAGE.
const bodies={
 key_share:'beginatomicselecttruefromauth.sessionsxwhere((x.id=key_share.s)and(x.user_id=key_share.u))forkeyshareofx;end',
 share:'beginatomicselectx.not_afterfromauth.sessionsxwhere((x.id=share.s)and(x.user_id=share.u))forshareofx;end'
}
const lit=s=>"'"+s.replaceAll("'","''")+"'"
export function sessionLockBoundarySQL(o){
 if(!sessionLockProfile(o))return ''
 return `do $session_lock_boundary$
 declare ns oid;auth_table oid;r record;actor record;protected oid:='mip_efta_auth_session_owner_v1'::regrole;
 begin
 select oid into ns from pg_catalog.pg_namespace where nspname='mip_auth_session_lock' and nspowner='postgres'::regrole;
 select c.oid into auth_table from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='auth' and c.relname='sessions' and c.relkind='r' and c.relowner='supabase_auth_admin'::regrole;
 if ns is null or auth_table is null or(select count(*) from pg_catalog.pg_proc where pronamespace=ns)<>2
 or exists(select 1 from pg_catalog.pg_class where relnamespace=ns)
 or exists(select 1 from pg_catalog.pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.oid=ns and(a.grantee not in(n.nspowner,protected) or(a.grantee<>n.nspowner and(a.privilege_type<>'USAGE' or a.is_grantable))))
 or not has_schema_privilege(protected,ns,'USAGE') or has_schema_privilege(protected,ns,'CREATE')
 or has_any_column_privilege(protected,auth_table,'SELECT,UPDATE,INSERT,REFERENCES')
 or has_table_privilege(protected,auth_table,'SELECT,UPDATE,INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 or exists(select 1 from pg_catalog.pg_auth_members where roleid=protected or member=protected)
 then raise exception 'session_lock_boundary';end if;
 for r in select p.* from pg_catalog.pg_proc p where p.pronamespace=ns loop
 if r.proname not in('key_share','share') or r.proowner<>'postgres'::regrole or not r.prosecdef
 or r.prolang<>(select oid from pg_catalog.pg_language where lanname='sql')
 or r.prokind<>'f' or r.provolatile<>'v' or r.proparallel<>'u' or r.proleakproof or r.proisstrict
 or r.pronargs<>2 or r.pronargdefaults<>0 or r.proargtypes<>'2950 2950'::oidvector
 or r.proconfig is distinct from array['search_path=""'] or r.prosqlbody is null
 or r.proretset<>(r.proname='share')
 or r.prorettype<>(case when r.proname='share' then 1184 else 16 end)::oid
 or r.proargnames is distinct from(case when r.proname='share' then array['u','s','deadline'] else array['u','s'] end)
 or exists(select 1 from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) a where a.grantee not in(r.proowner,protected) or a.privilege_type<>'EXECUTE' or(a.grantee<>r.proowner and a.is_grantable))
 or not has_function_privilege(protected,r.oid,'EXECUTE')
 or lower(regexp_replace(pg_catalog.pg_get_function_sqlbody(r.oid),'[[:space:]]','','g')) is distinct from(case when r.proname='key_share' then ${lit(bodies.key_share)} else ${lit(bodies.share)} end)
 or not exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_proc'::regclass and d.objid=r.oid and d.refclassid='pg_class'::regclass and d.refobjid=auth_table and d.deptype='n')
 or exists(select 1 from pg_catalog.pg_depend d where d.classid='pg_proc'::regclass and d.objid=r.oid and d.refclassid='pg_class'::regclass and d.refobjid<>auth_table)
 then raise exception 'session_lock_function_boundary';end if;
 for actor in select target.oid from pg_catalog.pg_roles target where not target.rolsuper and target.oid<>'postgres'::regrole and target.rolname not in('supabase_etl_admin','supabase_read_only_user')
 and exists(select 1 from pg_catalog.pg_roles caller where caller.rolcanlogin and not caller.rolsuper and caller.rolname not in('postgres','supabase_etl_admin','supabase_read_only_user') and pg_has_role(caller.oid,target.oid,'SET')) loop
 if has_function_privilege(actor.oid,r.oid,'EXECUTE') or has_schema_privilege(actor.oid,ns,'CREATE')
 or pg_has_role(actor.oid,'postgres','SET') then raise exception 'session_lock_effective_boundary';end if;
 end loop;
 end loop;
 end $session_lock_boundary$;`
}
