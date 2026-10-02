-- UNAPPLIED. Empty-package rollback only; retained/admitted data requires a
-- separate preservation decision. No cascade, source data deletion or retirement.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
lock table evidence_pipeline.record_versions,mip_private.market_revision_qualifications,
  mip_private.market_revision_sources,mip_private.market_revision_revocations in share row exclusive mode;
do $$begin
  if exists(select 1 from evidence_pipeline.record_versions where record_kind in ('market_identity','market_evidence_path','source_rights'))
    or exists(select 1 from mip_private.market_revision_qualifications) or exists(select 1 from mip_private.market_revision_sources)
    or exists(select 1 from mip_private.market_revision_revocations) then raise exception 'Markets rollback requires explicit retained-data preservation plan'; end if;
end $$;
drop function public.read_markets_source_directory_v1(text);
drop function mip_private.market_path_is_supported(uuid,uuid,numeric,jsonb,jsonb);
drop function mip_private.market_identity_json(evidence_pipeline.record_versions,jsonb,text,text);
drop view mip_private.public_market_revisions;
drop view mip_private.public_market_source_bindings;
drop function mip_private.market_instant_ns(text);
drop function mip_private.append_market_revision(text,uuid,jsonb,text,text,jsonb);
drop table mip_private.market_revision_sources;
drop table mip_private.market_revision_revocations;
drop table mip_private.market_revision_qualifications;
alter table evidence_pipeline.record_versions drop constraint record_versions_record_kind_check;
alter table evidence_pipeline.record_versions add constraint record_versions_record_kind_check
  check(record_kind in ('article','graph_node','temporal_assessment'));
commit;
