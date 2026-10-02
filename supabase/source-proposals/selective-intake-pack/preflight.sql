-- READ ONLY; inspect this standalone result before any separately approved installation.
begin read only;
select current_database() database_name, current_user actor, current_setting('server_version_num') server_version,
  to_regprocedure('public.mip_pipeline_v1(text,jsonb)') native_intake,
  to_regprocedure('public.mip_assessments_v1(text,jsonb)') native_assessments,
  to_regprocedure('evidence_pipeline.declare_candidate_input_relevance(jsonb)') native_relevance,
  to_regprocedure('public.mip_investigation_briefings_v1(text,jsonb)') native_observations,
  to_regprocedure('public.mip_investigation_workspace_v1(text,jsonb)') native_workspace,
  to_regprocedure('public.mip_investigation_selective_intake_v1(text,jsonb)') native_postcapture_receipts,
  to_regprocedure('public.mip_selective_execution_v1(text,jsonb)') proposed_execution;
select n.nspname schema_name,c.relname,c.relrowsecurity,c.relacl,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_any_access,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated_any_access,
  has_table_privilege('service_role',c.oid,'SELECT') operator_select,
  has_table_privilege('service_role',c.oid,'INSERT') operator_insert
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='evidence_pipeline' and c.relkind='r' and
  (c.relname like 'selective_%' or c.relname in ('investigation_selective_intake_receipts','investigation_memberships','investigation_versions','article_captures','evidence_candidates','assessments'))
order by c.relname;
select n.nspname schema_name,p.proname,p.prosecdef,p.proconfig,p.proacl,
  encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') operator_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('mip_pipeline_v1','mip_assessments_v1','mip_investigation_workspace_v1',
  'mip_investigation_briefings_v1','mip_investigation_selective_intake_v1','mip_selective_execution_v1','selective_metadata_decision')
order by n.nspname,p.proname;
select rolname,rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname in ('anon','authenticated','service_role');
commit;
