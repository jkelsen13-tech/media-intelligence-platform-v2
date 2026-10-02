-- UNEXECUTED clean-install rollback ONLY when every added table is empty.
-- Populated rows raise and preserve the entire extension. Native owners are never dropped.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if exists(select 1 from evidence_pipeline.selective_criteria_versions)
    or exists(select 1 from evidence_pipeline.selective_source_authorizations)
    or exists(select 1 from evidence_pipeline.selective_authorization_revocations)
    or exists(select 1 from evidence_pipeline.selective_discovery_receipts)
    or exists(select 1 from evidence_pipeline.selective_fetch_permits)
    or exists(select 1 from evidence_pipeline.selective_execution_receipts) then
    raise exception 'populated selective history must be retained; use revoke-only rollback';end if;
end $$;
drop function public.mip_selective_execution_v1(text,jsonb);
drop table evidence_pipeline.selective_execution_receipts;
drop table evidence_pipeline.selective_fetch_permits;
drop table evidence_pipeline.selective_discovery_receipts;
drop table evidence_pipeline.selective_authorization_revocations;
drop table evidence_pipeline.selective_source_authorizations;
drop table evidence_pipeline.selective_criteria_versions;
drop function evidence_pipeline.selective_metadata_decision(jsonb,jsonb);
commit;
