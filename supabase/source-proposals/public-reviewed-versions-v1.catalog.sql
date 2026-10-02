-- READ ONLY. Pin the complete result before authorizing this unapplied package.
begin read only;
set local search_path=pg_catalog;
select jsonb_build_object(
    'relations',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,
      'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'acl',c.relacl::text,
      'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,
      'definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) else null end,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'not_null',a.attnotnull,'acl',a.attacl::text) order by a.attnum) from pg_attribute a
        where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
      'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,
        'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
      'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
        'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]')
        from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by c.oid::regclass::text)
      from pg_class c where c.oid=any(array['public.articles'::regclass,'public.nodes'::regclass,
        'evidence_pipeline.article_captures'::regclass,'public.article_claims'::regclass,'public.claims'::regclass,
        'public.event_articles'::regclass,'public.events'::regclass,'public.citations'::regclass,
        'mip_private.reader_claim_surfaces'::regclass,'public.news_detail_public'::regclass,
        'public.comparison_public'::regclass,'public.authors_public'::regclass])),
    'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
      'memberships',(select coalesce(jsonb_agg(p.rolname order by p.rolname),'[]') from pg_roles p
        where p.oid<>r.oid and pg_has_role(r.oid,p.oid,'MEMBER'))) order by r.rolname)
      from pg_roles r where r.rolname in ('anon','authenticated','service_role')),
    'new_objects',(select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname,c.relname),'[]')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_private'
      and c.relname in ('reviewed_public_article_versions','reviewed_public_article_evidence','reviewed_public_stories',
        'reviewed_public_story_versions','reviewed_public_story_members','public_reviewed_article_versions','public_reviewed_article_evidence'))
  ) ;
rollback;
