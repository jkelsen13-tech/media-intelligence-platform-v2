-- UNAPPLIED EXACT ROLLBACK. Empty comparison bindings only; no historical data deletion.
-- Pin fresh installed catalog and the exact pre-install catalog retained by the package.
begin;
set local search_path=pg_catalog;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.comparison_public in access exclusive mode;
lock table mip_private.comparison_install_snapshot,mip_private.comparison_reviewed_members,
 mip_private.comparison_reviewed_surfaces in access exclusive mode;
do $guard$
declare actual jsonb; original jsonb; expected text:=current_setting('mip.comparison_rollback_expected_catalog',true);
 original_text text:=current_setting('mip.comparison_original_catalog',true); r jsonb;
begin
 if nullif(expected,'') is null or nullif(original_text,'') is null then raise exception 'exact original and installed comparison rollback baselines required'; end if;
 -- BEGIN COMPARISON CATALOG
select jsonb_build_object(
  'relations',(select jsonb_agg(jsonb_build_object('identity',n.nspname||'.'||c.relname,
   'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'acl',c.relacl::text,
   'options',c.reloptions,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'comment',obj_description(c.oid,'pg_class'),
   'definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) end,
   'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'acl',a.attacl::text,'comment',col_description(a.attrelid,a.attnum),
    'default',(select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) order by a.attnum)
    from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid)) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
   'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text),'[]') from pg_index i where i.indrelid=c.oid),
   'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
   'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),
    'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname=any(array[
    'public.comparison_public','public.articles','public.article_claims','public.claims','public.events','public.event_articles',
    'public.explanations','public.claim_evidence_links','public.claim_corrections','public.story_arcs','public.nodes',
    'evidence_pipeline.article_captures','mip_private.reader_claim_surfaces','mip_private.reviewed_public_article_versions',
    'mip_private.reviewed_public_article_evidence','mip_private.public_reviewed_article_versions','mip_private.public_reviewed_article_evidence',
    'mip_private.comparison_reviewed_members','mip_private.comparison_reviewed_surfaces','mip_private.comparison_install_snapshot',
    'mip_private.comparison_bound_members','mip_private.comparison_bound_surfaces'])),
  'functions',(select coalesce(jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
   'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid),'comment',obj_description(p.oid,'pg_proc')) order by p.oid::regprocedure::text),'[]')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    p.oid=any(array['mip_private.public_article_version_is_visible(uuid)'::regprocedure,
     'mip_private.public_article_evidence_is_visible(uuid,uuid)'::regprocedure,'evidence_pipeline.reject_history_mutation()'::regprocedure])
    or (n.nspname='mip_private' and p.proname in ('bind_comparison_member','bind_comparison_surface','comparison_member_is_visible','comparison_surface_is_visible'))
    or (n.nspname='public' and p.proname='read_reviewed_comparison_v1')),
  'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) order by nspname)
   from pg_namespace where nspname in ('public','mip_private','evidence_pipeline')),
  'default_privileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),
   'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text) order by d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]')
   from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
  'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
   'memberships',(select coalesce(jsonb_agg(p.rolname order by p.rolname),'[]') from pg_roles p where p.oid<>r.oid and pg_has_role(r.oid,p.oid,'MEMBER'))) order by r.rolname)
   from pg_roles r where r.rolname in ('anon','authenticated','service_role'))
 ) into actual;
 -- END COMPARISON CATALOG
 if actual is distinct from expected::jsonb then raise exception 'comparison rollback catalog drift'; end if;
 select original_catalog into strict original from mip_private.comparison_install_snapshot;
 if original is distinct from original_text::jsonb then raise exception 'original comparison snapshot mismatch'; end if;
 if current_user in ('anon','authenticated','service_role') or current_user is distinct from
  (select pg_get_userbyid(relowner) from pg_class where oid='public.comparison_public'::regclass)
  or current_user is distinct from (select pg_get_userbyid(relowner) from pg_class where oid='mip_private.comparison_install_snapshot'::regclass) then
  raise exception 'existing comparison publication owner required'; end if;
 if exists(select 1 from mip_private.comparison_reviewed_members) or exists(select 1 from mip_private.comparison_reviewed_surfaces) then
  raise exception 'comparison admitted binding history exists; destructive rollback refused'; end if;
 select value into strict r from jsonb_array_elements(original->'relations') where value->>'identity'='public.comparison_public';
 if r->>'owner' is distinct from current_user or nullif(r->>'definition','') is null
  or r->'options' is distinct from '["security_barrier=true","security_invoker=false"]'::jsonb then
  raise exception 'original exact comparison definition and owner/options required'; end if;
 execute format('create or replace view public.comparison_public with(security_barrier=true,security_invoker=false) as %s',r->>'definition');
end $guard$;
-- Installation added only these owner SELECT grants. Preflight required both
-- roles to lack direct, column, PUBLIC and inherited SELECT beforehand.
revoke select on public.comparison_public from anon,authenticated;
drop function public.read_reviewed_comparison_v1();
drop view mip_private.comparison_bound_surfaces,mip_private.comparison_bound_members;
drop function mip_private.comparison_surface_is_visible(uuid,uuid);
drop function mip_private.comparison_member_is_visible(uuid,uuid);
drop function mip_private.bind_comparison_surface(uuid,uuid,text,uuid,uuid[],uuid[]);
drop function mip_private.bind_comparison_member(uuid,uuid,text);
drop table mip_private.comparison_reviewed_surfaces;
drop table mip_private.comparison_reviewed_members;
drop table mip_private.comparison_install_snapshot;
do $verify$
declare actual jsonb;
begin
 -- BEGIN COMPARISON CATALOG
select jsonb_build_object(
  'relations',(select jsonb_agg(jsonb_build_object('identity',n.nspname||'.'||c.relname,
   'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'acl',c.relacl::text,
   'options',c.reloptions,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'comment',obj_description(c.oid,'pg_class'),
   'definition',case when c.relkind='v' then pg_get_viewdef(c.oid,true) end,
   'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'acl',a.attacl::text,'comment',col_description(a.attrelid,a.attnum),
    'default',(select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)) order by a.attnum)
    from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',x.conname,'definition',pg_get_constraintdef(x.oid)) order by x.conname),'[]') from pg_constraint x where x.conrelid=c.oid),
   'indexes',(select coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) order by i.indexrelid::regclass::text),'[]') from pg_index i where i.indrelid=c.oid),
   'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'roles',p.polroles,
    'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname),'[]') from pg_policy p where p.polrelid=c.oid),
   'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),
    'function',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) order by n.nspname,c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname=any(array[
    'public.comparison_public','public.articles','public.article_claims','public.claims','public.events','public.event_articles',
    'public.explanations','public.claim_evidence_links','public.claim_corrections','public.story_arcs','public.nodes',
    'evidence_pipeline.article_captures','mip_private.reader_claim_surfaces','mip_private.reviewed_public_article_versions',
    'mip_private.reviewed_public_article_evidence','mip_private.public_reviewed_article_versions','mip_private.public_reviewed_article_evidence',
    'mip_private.comparison_reviewed_members','mip_private.comparison_reviewed_surfaces','mip_private.comparison_install_snapshot',
    'mip_private.comparison_bound_members','mip_private.comparison_bound_surfaces'])),
  'functions',(select coalesce(jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
   'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid),'comment',obj_description(p.oid,'pg_proc')) order by p.oid::regprocedure::text),'[]')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    p.oid=any(array['mip_private.public_article_version_is_visible(uuid)'::regprocedure,
     'mip_private.public_article_evidence_is_visible(uuid,uuid)'::regprocedure,'evidence_pipeline.reject_history_mutation()'::regprocedure])
    or (n.nspname='mip_private' and p.proname in ('bind_comparison_member','bind_comparison_surface','comparison_member_is_visible','comparison_surface_is_visible'))
    or (n.nspname='public' and p.proname='read_reviewed_comparison_v1')),
  'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) order by nspname)
   from pg_namespace where nspname in ('public','mip_private','evidence_pipeline')),
  'default_privileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),
   'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl::text) order by d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]')
   from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
  'roles',(select jsonb_agg(jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,
   'memberships',(select coalesce(jsonb_agg(p.rolname order by p.rolname),'[]') from pg_roles p where p.oid<>r.oid and pg_has_role(r.oid,p.oid,'MEMBER'))) order by r.rolname)
   from pg_roles r where r.rolname in ('anon','authenticated','service_role'))
 ) into actual;
 -- END COMPARISON CATALOG
 if actual is distinct from current_setting('mip.comparison_original_catalog')::jsonb then raise exception 'comparison exact rollback restoration failed'; end if;
end $verify$;
commit;
