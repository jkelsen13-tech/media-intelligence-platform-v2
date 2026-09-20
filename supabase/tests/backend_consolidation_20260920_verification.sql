-- Run each section only on its named project. Read-only verification; no
-- secret values, credential rows, article bodies, or user identifiers returned.

-- qikvmopbtijoebdqosyq: public projection grant closure.
select c.relname,
  has_table_privilege('anon',c.oid,'SELECT') anon_read,
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') anon_write,
  has_table_privilege('authenticated',c.oid,'SELECT') authenticated_read,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') authenticated_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'spatial_projection_v1','authors_public','arc_milestones_public',
  'comparison_public','graph_coverage_public','news_detail_public',
  'investigation_surface_public'
) order by c.relname;

-- qikvmopbtijoebdqosyq: spatial capability boundary without principal IDs.
select
  count(*) filter (where revoked_at is null)::int active_grants,
  count(distinct auth_user_id) filter (where revoked_at is null)::int active_principals,
  has_function_privilege('spatial_writer_runtime',
    'public.spatial_runtime_operation_allowed(uuid,text)','EXECUTE') writer_can_gate,
  has_function_privilege('anon',
    'public.spatial_runtime_operation_allowed(uuid,text)','EXECUTE') anon_can_gate,
  has_function_privilege('authenticated',
    'public.spatial_runtime_operation_allowed(uuid,text)','EXECUTE') authenticated_can_gate,
  has_function_privilege('service_role',
    'public.spatial_runtime_operation_allowed(uuid,text)','EXECUTE') service_can_gate
from mip_private.spatial_runtime_principal_capabilities;

-- qikvmopbtijoebdqosyq: current retained collector coverage.
select source_relation,count(*)::int versions,count(distinct source_key)::int source_rows,
  max(source_observed_at) latest_observation
from mip_private.collector_row_versions
where source_project='yhbwnrtlqbjtcrrlpbge'
group by source_relation order by source_relation;

-- jfnzyvzthzqtczlxhjll: the five drifted tables must all have RLS and no
-- browser CRUD grants.
select c.relname,c.relrowsecurity,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_crud,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated_crud
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'arc_membership_candidates','authors','outlets','policies','story_arcs'
) order by c.relname;

-- yhbwnrtlqbjtcrrlpbge and niejaejtbxgakyrsntxm: run where the named function
-- exists. Browser execution must be false and service execution true.
select p.proname,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('publish_explanation','mip_v2_gdelt_begin_stage')
order by p.proname;
