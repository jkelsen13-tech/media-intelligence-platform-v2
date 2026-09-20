-- Run each section only on its named project. Read-only verification; no
-- secret values, credential rows, article bodies, or user identifiers returned.

-- ALL PROJECTS: repeatable-read catalog boundary. The PostgREST exposed-schema
-- setting can be unavailable on a direct SQL connection, so null is evidence
-- that dashboard/API configuration still needs a separate readback, not that
-- no schema is exposed.
begin isolation level repeatable read read only;
set local statement_timeout='25s';

select clock_timestamp() observed_at,
  current_database() database_name,
  current_setting('server_version',true) server_version,
  current_setting('pgrst.db_schemas',true) pgrst_db_schemas_if_visible;

-- Effective relation reachability for the Data API roles. Tables in public
-- with a true read/write value and RLS disabled require explicit disposition.
-- Views are reported separately because relrowsecurity does not protect them.
select n.nspname schema_name,c.relname relation_name,c.relkind,
  pg_get_userbyid(c.relowner) owner,
  c.relrowsecurity rls_enabled,c.relforcerowsecurity force_rls,
  has_table_privilege('anon',c.oid,'SELECT') anon_read,
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') anon_write,
  has_table_privilege('authenticated',c.oid,'SELECT') authenticated_read,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') authenticated_write,
  has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service_access
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','m')
order by c.relname;

-- A view without security_invoker=true runs with owner authority. This does not
-- automatically prove disclosure; the effective grants and definition must be
-- reviewed together. The definition hash permits drift comparison without
-- returning view SQL.
select n.nspname schema_name,c.relname view_name,c.relkind,
  pg_get_userbyid(c.relowner) owner,c.reloptions,
  has_table_privilege('anon',c.oid,'SELECT') anon_read,
  has_table_privilege('authenticated',c.oid,'SELECT') authenticated_read,
  has_table_privilege('service_role',c.oid,'SELECT') service_read,
  md5(pg_get_viewdef(c.oid,false)) definition_md5
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('v','m')
order by c.relname;

-- Every effectively callable SECURITY DEFINER routine is an authority edge.
-- A null/unsafe search_path is reported. Function bodies are intentionally not
-- returned; hashes identify drift. pg_depend does not fully describe dynamic
-- SQL or all PL/pgSQL calls, so this is a direct-edge inventory, not a complete
-- semantic call graph.
select n.nspname schema_name,p.proname,
  pg_get_function_identity_arguments(p.oid) identity_arguments,
  pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.proconfig,
  has_function_privilege('public',p.oid,'EXECUTE') public_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
  md5(pg_get_functiondef(p.oid)) definition_md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname not in ('pg_catalog','information_schema')
  and n.nspname not like 'pg_%'
  and p.prokind in ('f','p')
  and (p.prosecdef
    or has_function_privilege('public',p.oid,'EXECUTE')
    or has_function_privilege('anon',p.oid,'EXECUTE')
    or has_function_privilege('authenticated',p.oid,'EXECUTE'))
order by n.nspname,p.proname,identity_arguments;

-- PostgreSQL's implicit default for a newly created function grants EXECUTE to
-- PUBLIC. An owner with no global pg_default_acl row therefore has an unsafe
-- effective default even though a naive "zero PUBLIC rows" query looks clean.
with application_owners as (
  select distinct p.proowner owner_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema')
    and n.nspname not like 'pg_%'
), function_defaults as (
  select o.owner_oid,d.defaclacl
  from application_owners o
  left join pg_default_acl d on d.defaclrole=o.owner_oid
    and d.defaclnamespace=0 and d.defaclobjtype='f'
)
select pg_get_userbyid(owner_oid) owner,
  defaclacl is not null explicit_global_function_default_acl,
  exists (
    select 1 from aclexplode(coalesce(defaclacl,acldefault('f',owner_oid))) a
    where a.grantee=0 and a.privilege_type='EXECUTE'
  ) effective_default_public_execute,
  coalesce(defaclacl,acldefault('f',owner_oid))::text effective_function_default_acl
from function_defaults order by owner;

-- Role attributes and memberships define indirect escalation paths. No
-- passwords, JWTs, user IDs, or credential values are returned.
select r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,
  r.rolcanlogin,r.rolreplication,r.rolbypassrls,
  coalesce(array_agg(parent.rolname order by parent.rolname)
    filter (where parent.rolname is not null),'{}') direct_memberships
from pg_roles r
left join pg_auth_members m on m.member=r.oid
left join pg_roles parent on parent.oid=m.roleid
where r.rolname in ('anon','authenticated','service_role','authenticator','postgres')
   or r.rolname like 'mip_%'
group by r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,
  r.rolcanlogin,r.rolreplication,r.rolbypassrls
order by r.rolname;

rollback;

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
