-- READ ONLY. Capture after installation/ROLLBACK-only rehearsal for exact rollback drift guard.
begin read only;
set local search_path=pg_catalog;
with base as (
select jsonb_build_object(
    'relations',(select jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,
      'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'acl',c.relacl::text,
      'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,
      'definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) else null end,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'not_null',a.attnotnull,'acl',a.attacl::text,
        'default',(select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) order by a.attnum) from pg_attribute a
        where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
      'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text),'[]') from pg_index i where i.indrelid=c.oid),
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
    'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text) order by n.nspname)
      from pg_namespace n where n.nspname in ('public','mip_private','evidence_pipeline')),
    'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
      'memberships',(select coalesce(jsonb_agg(p.rolname order by p.rolname),'[]') from pg_roles p
        where p.oid<>r.oid and pg_has_role(r.oid,p.oid,'MEMBER'))) order by r.rolname)
      from pg_roles r where r.rolname in ('anon','authenticated','service_role')),
    'new_objects',(select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname,c.relname),'[]')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='mip_private'
      and c.relname in ('reviewed_public_article_versions','reviewed_public_article_evidence','reviewed_public_stories',
        'reviewed_public_story_versions','reviewed_public_story_members','public_reviewed_article_versions','public_reviewed_article_evidence'))
        or (n.nspname='public' and c.relname='news_reviewed_articles_public')),
    'function_names',(select coalesce(jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
      'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='mip_private' and p.proname in ('public_article_evidence_is_visible','public_article_version_is_visible',
        'bind_reviewed_public_article_version','require_reviewed_public_article_version','public_story_version_is_visible',
        'bind_reviewed_public_story_version','reviewed_public_article_payload','reviewed_public_story_payload'))
      or (n.nspname='public' and p.proname in ('read_reviewed_public_article_v1','read_reviewed_public_story_v1',
        'read_reviewed_public_story_for_article_v1','read_reviewed_public_stories_for_article_v1','read_reviewed_public_story_directory_v1','search_reviewed_public_article_ids_v1')))
  ) 
)
select jsonb_build_object('base',base.jsonb_build_object,
 'package_relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),
   'kind',c.relkind,'acl',c.relacl::text,'rls',c.relrowsecurity,'options',c.reloptions,
   'definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) else null end,
   'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'acl',a.attacl::text,'not_null',a.attnotnull,'default',(select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) order by a.attnum)
     from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select coalesce(jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
   'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text),'[]') from pg_index i where i.indrelid=c.oid),
   'triggers',(select coalesce(jsonb_agg(pg_get_triggerdef(t.oid) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='mip_private' and c.relname in
   ('reviewed_public_article_versions','reviewed_public_article_evidence','reviewed_public_stories','reviewed_public_story_versions','reviewed_public_story_members','public_reviewed_article_versions','public_reviewed_article_evidence'))
   or (n.nspname='public' and c.relname='news_reviewed_articles_public')),
 'package_functions',(select jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,
   'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='mip_private' and p.proname in ('public_article_evidence_is_visible','public_article_version_is_visible','bind_reviewed_public_article_version',
    'require_reviewed_public_article_version','public_story_version_is_visible','bind_reviewed_public_story_version','reviewed_public_article_payload','reviewed_public_story_payload'))
   or (n.nspname='public' and p.proname in ('read_reviewed_public_article_v1','read_reviewed_public_story_v1','read_reviewed_public_story_for_article_v1',
    'read_reviewed_public_stories_for_article_v1','read_reviewed_public_story_directory_v1','search_reviewed_public_article_ids_v1')))) from base;
rollback;
