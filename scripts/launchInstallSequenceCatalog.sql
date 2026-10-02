-- Read-only full coexistence catalogue. Existing roles only; no role creation.
-- OIDs and ACL serialization order are excluded; exact owner/grantor/privilege
-- tuples, definitions, policy expressions and dependency identities remain.
select jsonb_build_object(
  'schemas',(select jsonb_agg(jsonb_build_object('identity',n.nspname,'owner',pg_get_userbyid(n.nspowner),
    'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege_type',a.privilege_type,'is_grantable',a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]')
      from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a)) order by n.nspname)
    from pg_namespace n where n.nspname in ('public','mip_private','evidence_pipeline','spatial')),
  'relations',(select jsonb_agg(jsonb_build_object('identity',n.nspname||'.'||c.relname,'kind',c.relkind,
    'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,'comment',obj_description(c.oid,'pg_class'),
    'sequence',(select jsonb_build_object('type',format_type(s.seqtypid,null),'start',s.seqstart::text,'increment',s.seqincrement::text,'max',s.seqmax::text,'min',s.seqmin::text,'cache',s.seqcache::text,'cycle',s.seqcycle) from pg_sequence s where s.seqrelid=c.oid),
    'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege_type',a.privilege_type,'is_grantable',a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]')
      from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S' else 'r' end::"char",c.relowner))) a),
    'definition',case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) else null end,
    'columns',(select coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'comment',col_description(a.attrelid,a.attnum),
      'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(x.grantor),'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'privilege_type',x.privilege_type,'is_grantable',x.is_grantable) order by x.grantor,x.grantee,x.privilege_type,x.is_grantable),'[]') from aclexplode(nullif(a.attacl,'{}'::aclitem[])) x),
      'default',(select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) order by a.attnum),'[]')
      from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid),'validated',x.convalidated) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
    'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text),'[]') from pg_index i where i.indrelid=c.oid),
    'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by r) from unnest(p.polroles) r),
      'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
    'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),
      'function',t.tgfoid::regprocedure::text) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','mip_private','evidence_pipeline','spatial') and c.relkind in ('r','p','v','m','S')),
  'functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
    'security_definer',p.prosecdef,'configuration',p.proconfig,'definition',pg_get_functiondef(p.oid),'comment',obj_description(p.oid,'pg_proc'),
    'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege_type',a.privilege_type,'is_grantable',a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]')
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mip_private','evidence_pipeline','spatial') and p.prokind in ('f','p')),
  'roles',(select jsonb_agg(jsonb_build_object('identity',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,'login',r.rolcanlogin,
    'inherit',r.rolinherit,'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,'replication',r.rolreplication,'connection_limit',r.rolconnlimit,'configuration',r.rolconfig,
    'memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),
      'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) order by m.roleid,m.grantor),'[]') from pg_auth_members m where m.member=r.oid)) order by r.rolname)
    from pg_roles r),
  'default_privileges',(select coalesce(jsonb_agg(jsonb_build_object('identity',pg_get_userbyid(d.defaclrole)||'.'||coalesce(n.nspname,'*')||'.'||d.defaclobjtype::text,
    'acl',(select coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege_type',a.privilege_type,'is_grantable',a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]') from aclexplode(nullif(d.defaclacl,'{}'::aclitem[])) a)) order by d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace)
) as catalog;
