-- Read-only catalogue helper. Same session as install/rollback; no credentials.
create or replace function pg_temp.mip_story_following_catalog() returns jsonb
language sql security invoker set search_path=pg_catalog as $$
select jsonb_build_object(
    'schema_owner',(select pg_get_userbyid(nspowner) from pg_namespace where nspname='mip_private'),
    'schema_acl',(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee,a.grantor,a.privilege_type)
      from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='mip_private'),
    'relations',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
      'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'acl',a.attacl::text) order by a.attnum)
        from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
      'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,
        'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
      'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),
        'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.oid::regclass::text)
      from pg_class c where c.oid=any(array['mip_private.reviewed_public_stories'::regclass,'mip_private.reviewed_public_story_versions'::regclass,
        'mip_private.reviewed_public_story_members'::regclass,'public.mip_profiles'::regclass,'public.articles'::regclass,'public.nodes'::regclass])),
    'functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
      'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p
      where p.oid=any(array['public.read_reviewed_public_story_v1(uuid,uuid)'::regprocedure,
        'mip_private.public_story_version_is_visible(uuid)'::regprocedure])),
    'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
      'memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),
        'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) order by m.roleid,m.grantor),'[]') from pg_auth_members m where m.member=r.oid)) order by r.rolname)
      from pg_roles r where r.rolname in ('anon','authenticated','service_role')),
    'new_objects',(select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='mip_private' and c.relname in ('public_story_material_changes','public_story_follows','public_story_follow_events'))
  ) ;
$$;
select pg_temp.mip_story_following_catalog();
