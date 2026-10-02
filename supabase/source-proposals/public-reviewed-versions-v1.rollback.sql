-- UNAPPLIED EXACT ROLLBACK. Empty package only; never deletes admitted history.
-- Pin both standalone original and installed catalog results; no CASCADE.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local search_path=pg_catalog;
lock table public.articles,mip_private.reviewed_public_article_versions,mip_private.reviewed_public_article_evidence,
 mip_private.reviewed_public_stories,mip_private.reviewed_public_story_versions,mip_private.reviewed_public_story_members in access exclusive mode;
do $guard$
declare actual jsonb; original_text text:=current_setting('mip.public_reviewed_versions_original_catalog',true);
 expected_text text:=current_setting('mip.public_reviewed_versions_rollback_expected_catalog',true);
begin
 if nullif(original_text,'') is null or nullif(expected_text,'') is null then raise exception 'exact original and installed rollback baselines required'; end if;
 -- BEGIN REVIEWED VERSION INSTALLED BASELINE
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
        'read_reviewed_public_story_for_article_v1','read_reviewed_public_stories_for_article_v1','read_reviewed_public_story_directory_v1')))
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
    'read_reviewed_public_stories_for_article_v1','read_reviewed_public_story_directory_v1')))) into actual from base;
 -- END REVIEWED VERSION INSTALLED BASELINE
 if actual is distinct from expected_text::jsonb then raise exception 'reviewed public version rollback catalog drift'; end if;
 if (select pg_get_userbyid(relowner) from pg_class where oid='public.articles'::regclass) is distinct from current_user
  or (select pg_get_userbyid(relowner) from pg_class where oid='mip_private.reviewed_public_article_versions'::regclass) is distinct from current_user
  or current_user in ('anon','authenticated','service_role') then raise exception 'verified existing publication owner required'; end if;
 if exists(select 1 from mip_private.reviewed_public_article_versions) or exists(select 1 from mip_private.reviewed_public_article_evidence)
  or exists(select 1 from mip_private.reviewed_public_stories) or exists(select 1 from mip_private.reviewed_public_story_versions)
  or exists(select 1 from mip_private.reviewed_public_story_members) then raise exception 'admitted history exists; destructive rollback refused'; end if;
 if original_text::jsonb->'new_objects'<>'[]'::jsonb then raise exception 'original empty package catalog required'; end if;
end $guard$;
-- Reconstruct only the two endpoint/reader ACL changes from reviewed original
-- catalog bytes. No unknown privileges, policies or functions are restored.
do $restore$
declare original jsonb:=current_setting('mip.public_reviewed_versions_original_catalog')::jsonb; r jsonb; a jsonb; x record; owner_oid oid;
begin
 select oid into owner_oid from pg_roles where rolname=current_user;
 select value into r from jsonb_array_elements(original->'relations') where value->>'identity'='public.news_detail_public';
 if r->>'owner' is distinct from current_user or nullif(r->>'definition','') is null then raise exception 'original News view owner/definition required'; end if;
 execute format('create or replace view public.news_detail_public with (security_barrier=true,security_invoker=false) as %s',r->>'definition');
 select value into r from jsonb_array_elements(original->'relations') where value->>'identity'='public.articles';
 if r->>'owner' is distinct from current_user then raise exception 'original article owner mismatch'; end if;
 for x in select g.*,roles.rolname from aclexplode((r->>'acl')::aclitem[])g join pg_roles roles on roles.oid=g.grantee
  where roles.rolname in ('anon','authenticated') and g.privilege_type='SELECT' loop
  if x.grantor<>owner_oid then raise exception 'original non-owner grantor needs separate exact rollback'; end if;
  execute format('grant select on public.articles to %I%s',x.rolname,case when x.is_grantable then ' with grant option' else '' end);
 end loop;
 for a in select value from jsonb_array_elements(r->'columns') loop
  for x in select g.*,roles.rolname from aclexplode((a->>'acl')::aclitem[])g join pg_roles roles on roles.oid=g.grantee
   where roles.rolname in ('anon','authenticated') and g.privilege_type='SELECT' loop
   if x.grantor<>owner_oid then raise exception 'original non-owner column grantor needs separate exact rollback'; end if;
   execute format('grant select(%I) on public.articles to %I%s',a->>'name',x.rolname,case when x.is_grantable then ' with grant option' else '' end);
  end loop;
 end loop;
 select value into r from jsonb_array_elements(original->'relations') where value->>'identity'='public.comparison_public';
 if r->>'owner' is distinct from current_user then raise exception 'original comparison owner mismatch'; end if;
 for x in select g.*,roles.rolname from aclexplode((r->>'acl')::aclitem[])g join pg_roles roles on roles.oid=g.grantee
  where roles.rolname in ('anon','authenticated') and g.privilege_type='SELECT' loop
  if x.grantor<>owner_oid then raise exception 'original comparison non-owner grantor needs separate exact rollback'; end if;
  execute format('grant select on public.comparison_public to %I%s',x.rolname,case when x.is_grantable then ' with grant option' else '' end);
 end loop;
end $restore$;
drop view public.news_reviewed_articles_public;
drop function public.read_reviewed_public_article_v1(uuid,uuid);
drop function public.read_reviewed_public_story_v1(uuid,uuid);
drop function public.read_reviewed_public_story_for_article_v1(uuid);
drop function public.read_reviewed_public_stories_for_article_v1(uuid);
drop function public.read_reviewed_public_story_directory_v1(uuid,integer);
drop function mip_private.bind_reviewed_public_article_version(uuid,uuid,text,text,text,text,text,uuid[],uuid,text);
drop function mip_private.require_reviewed_public_article_version(uuid,uuid,text);
drop function mip_private.bind_reviewed_public_story_version(text,uuid,uuid[],text,text,uuid,text);
drop function mip_private.reviewed_public_story_payload(uuid);
drop function mip_private.reviewed_public_article_payload(uuid);
drop view mip_private.public_reviewed_article_evidence,mip_private.public_reviewed_article_versions;
drop function mip_private.public_story_version_is_visible(uuid);
drop function mip_private.public_article_version_is_visible(uuid);
drop function mip_private.public_article_evidence_is_visible(uuid,uuid);
drop table mip_private.reviewed_public_story_members;
drop table mip_private.reviewed_public_story_versions;
drop table mip_private.reviewed_public_stories;
drop table mip_private.reviewed_public_article_evidence;
drop table mip_private.reviewed_public_article_versions;
commit;
