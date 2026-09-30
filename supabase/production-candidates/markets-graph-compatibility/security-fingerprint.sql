-- Read-only, before compatibility.sql. Run with search_path=public,pg_catalog.
with targets as (
 select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in('nodes','edges','citations','node_topics','graph_event_article_memberships','comparison_public','investigation_surface_public','spatial_projection_v1','graph_coverage_public')
), state as (
 select c.relname,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,
 'options',c.reloptions,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'acl',a.attacl::text,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname),
 'constraints',(select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) order by k.conname) from pg_constraint k where k.conrelid=c.oid),
 'triggers',(select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text) order by t.tgname) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=c.oid and not t.tgisinternal),
 'view',case when c.relkind='v' then pg_get_viewdef(c.oid,true) end) value from targets c
) select jsonb_object_agg(relname,value) as state,md5(jsonb_object_agg(relname,value)::text) as fingerprint from state;
