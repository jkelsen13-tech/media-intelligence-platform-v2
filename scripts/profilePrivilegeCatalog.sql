-- Read-only catalog template. The compiler substitutes the byte-exact proposal
-- baseline query at the sole marker; this file is never submitted by a client.
with recursive baseline as (__PROFILE_PROPOSAL_BASELINE__),
table_object as (select * from pg_class where oid='public.mip_profiles'::regclass),
signup as (select p.* from pg_trigger t join pg_proc p on p.oid=t.tgfoid
  where t.tgrelid='auth.users'::regclass and t.tgname='on_auth_user_created_mip' and not t.tgisinternal),
acl_entries as (
  select 'table'::text scope, null::text column_name, e.* from table_object c,
    lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) e
  union all
  select 'column', a.attname, e.* from table_object c join pg_attribute a on a.attrelid=c.oid,
    lateral aclexplode(a.attacl) e where a.attnum>0 and not a.attisdropped
),
seeds(oid) as (
  select oid from pg_roles where rolname in ('anon','authenticated','service_role',current_user,session_user)
  union select relowner from table_object
  union select grantor from acl_entries union select grantee from acl_entries where grantee<>0
  union select proowner from signup
  union select nspowner from pg_namespace where nspname in ('public','auth')
),
relevant(oid) as (
  select oid from seeds union
  select case when m.roleid=r.oid then m.member else m.roleid end
  from relevant r join pg_auth_members m on m.roleid=r.oid or m.member=r.oid
),
subjects as (select oid,rolname from pg_roles where rolname in ('anon','authenticated','service_role',current_user,session_user))
select jsonb_build_object(
  'identity',jsonb_build_object('current_user',current_user,'session_user',session_user,
    'database',current_database(),'database_oid',(select oid::bigint from pg_database where datname=current_database()),
    'server_address',inet_server_addr()::text,'server_port',inet_server_port(),
    'server_version_num',current_setting('server_version_num'),'server_version',version(),
    'table_oid',(select oid::bigint from table_object),'search_path',pg_catalog.current_setting('search_path')),
  'baseline',(select jsonb_build_object from baseline),
  'roles',coalesce((select jsonb_agg(jsonb_build_object('oid',p.oid::bigint,'name',p.rolname,
    'superuser',p.rolsuper,'inherit',p.rolinherit,'create_role',p.rolcreaterole,
    'create_db',p.rolcreatedb,'login',p.rolcanlogin,'replication',p.rolreplication,
    'bypass_rls',p.rolbypassrls,'connection_limit',p.rolconnlimit,
    'valid_until',p.rolvaliduntil::text,'config',p.rolconfig) order by p.rolname)
    from pg_roles p join relevant r on r.oid=p.oid),'[]'::jsonb),
  'memberships',coalesce((select jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),
    'member',pg_get_userbyid(m.member),'grantor',pg_get_userbyid(m.grantor),
    'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) order by m.roleid,m.member,m.grantor)
    from pg_auth_members m where m.roleid in (select oid from relevant) or m.member in (select oid from relevant)),'[]'::jsonb),
  'browser_paths',coalesce((select jsonb_agg(jsonb_build_object('browser',s.rolname,'role',p.rolname,
    'usage',pg_has_role(s.oid,p.oid,'USAGE'),'set',pg_has_role(s.oid,p.oid,'SET'),
    'admin',pg_has_role(s.oid,p.oid,'MEMBER WITH ADMIN OPTION'),
    'owner_access',pg_has_role(p.oid,(select relowner from table_object),'USAGE'),
    'admin_targets',coalesce((select jsonb_agg(target.rolname order by target.rolname)
      from pg_roles target join relevant tr on tr.oid=target.oid
      where pg_has_role(p.oid,target.oid,'MEMBER WITH ADMIN OPTION')),'[]'::jsonb),
    'broad',coalesce((select jsonb_agg(privilege.name order by privilege.name)
      from (values ('TRUNCATE'),('TRIGGER'),('REFERENCES'),('MAINTAIN')) privilege(name)
      where has_table_privilege(p.oid,'public.mip_profiles',privilege.name)),'[]'::jsonb),
    'column_references',has_any_column_privilege(p.oid,'public.mip_profiles','REFERENCES'))
    order by s.rolname,p.rolname) from subjects s cross join pg_roles p join relevant r on r.oid=p.oid
    where s.rolname in ('anon','authenticated')),'[]'::jsonb),
  'acl_entries',coalesce((select jsonb_agg(jsonb_build_object('scope',e.scope,'column',e.column_name,
    'grantor',pg_get_userbyid(e.grantor),'grantee',case when e.grantee=0 then 'PUBLIC' else pg_get_userbyid(e.grantee) end,
    'privilege',e.privilege_type,'grant_option',e.is_grantable,
    'browser_effective',coalesce((select jsonb_agg(s.rolname order by s.rolname) from subjects s
      where s.rolname in ('anon','authenticated') and (e.grantee=0 or e.grantee=s.oid or pg_has_role(s.oid,e.grantee,'USAGE'))),'[]'::jsonb))
    order by e.scope,e.column_name,e.grantor,e.grantee,e.privilege_type) from acl_entries e),'[]'::jsonb),
  'effective',coalesce((select jsonb_agg(jsonb_build_object('role',s.rolname,'scope','table','column',null,
    'privilege',p.name,'allowed',has_table_privilege(s.oid,'public.mip_profiles',p.name),
    'grant_option',has_table_privilege(s.oid,'public.mip_profiles',p.name||' WITH GRANT OPTION')) order by s.rolname,p.name)
    from subjects s cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('TRIGGER'),('REFERENCES'),('MAINTAIN')) p(name)),'[]'::jsonb)
    || coalesce((select jsonb_agg(jsonb_build_object('role',s.rolname,'scope','column','column',a.attname,
    'privilege',p.name,'allowed',has_column_privilege(s.oid,a.attrelid,a.attnum,p.name),
    'grant_option',has_column_privilege(s.oid,a.attrelid,a.attnum,p.name||' WITH GRANT OPTION')) order by s.rolname,a.attnum,p.name)
    from subjects s cross join pg_attribute a cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(name)
    where a.attrelid='public.mip_profiles'::regclass and a.attnum>0 and not a.attisdropped),'[]'::jsonb),
  'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text) order by n.nspname)
    from pg_namespace n where n.nspname in ('public','auth')),
  'rows',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.mip_profiles p),'[]'::jsonb)
) catalog;
