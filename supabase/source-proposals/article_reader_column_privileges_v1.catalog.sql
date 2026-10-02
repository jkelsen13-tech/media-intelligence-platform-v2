-- READ-ONLY metadata prerequisite. No article rows/content are selected.
-- Review and pin this full result; do not automatically approve current state.
-- Same search_path as proposal/rollback so rendered definitions remain stable.
begin read only;
set local search_path=pg_catalog;
  select jsonb_build_object(
    'owner', pg_get_userbyid(c.relowner), 'acl', c.relacl::text,
    'row_security', c.relrowsecurity, 'force_row_security', c.relforcerowsecurity,
    'columns', (select jsonb_agg(jsonb_build_object('name', a.attname,
      'type', format_type(a.atttypid,a.atttypmod), 'not_null', a.attnotnull,
      'acl', a.attacl::text, 'default', pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select coalesce(jsonb_agg(jsonb_build_object('name', conname,
      'definition', pg_get_constraintdef(oid), 'validated', convalidated) order by conname),'[]'::jsonb)
      from pg_constraint where conrelid=c.oid),
    'policies', (select coalesce(jsonb_agg(jsonb_build_object('name',polname,
      'command',polcmd,'roles',polroles::text,'permissive',polpermissive,
      'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) order by polname),'[]'::jsonb)
      from pg_policy where polrelid=c.oid),
    'reader_roles', (select jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,
      'bypass_rls',rolbypassrls,'inherit',rolinherit) order by rolname)
      from pg_roles where rolname in ('anon','authenticated')),
    'reader_memberships', (select coalesce(jsonb_agg(jsonb_build_object('reader',reader.rolname,
      'member_of',parent.rolname) order by reader.rolname,parent.rolname),'[]'::jsonb)
      from pg_roles reader cross join pg_roles parent where reader.rolname in ('anon','authenticated')
      and reader.oid<>parent.oid and pg_has_role(reader.oid,parent.oid,'MEMBER')),
    'triggers', (select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
      'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid),
      'function_owner',pg_get_userbyid(p.proowner),'function_acl',p.proacl::text) order by t.tgname),'[]'::jsonb)
      from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=c.oid and not t.tgisinternal),
    'governed_views', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',v.relname,
      'owner',pg_get_userbyid(v.relowner),'acl',v.relacl::text,'options',to_jsonb(v.reloptions),
      'definition',pg_get_viewdef(v.oid,true)) order by n.nspname,v.relname)
      from pg_class v join pg_namespace n on n.oid=v.relnamespace where v.relkind='v'
      and ((n.nspname='public' and v.relname in ('news_detail_public','comparison_public','graph_coverage_public'))
        or (n.nspname='mip_private' and v.relname='reader_claim_surfaces')))
  ) from pg_class c where c.oid='public.articles'::regclass;
rollback;
