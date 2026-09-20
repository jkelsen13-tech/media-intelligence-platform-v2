-- OWNER-GATED ROLLBACK FOR yhb_browser_authority_containment.sql.
-- Restore only the grants observed immediately before containment.
-- This file does not restore any Edge deployment and contains no row DML.

BEGIN;

GRANT EXECUTE ON FUNCTION public.articles_source_status_propagate() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_new_mip_user() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_approve_arc_membership_candidate(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_arc_membership_projection_state_change() TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_ingest_rss_schedule_authorized(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_intercept_direct_arc_attachment() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_invalidate_arc_membership_approvals() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_project_approved_arc_membership(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_queue_source_comparison_enrichment() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_refresh_arc_projection_milestone(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_retract_arc_membership_projection(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_seed_arc_membership_candidates(integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_source_comparison_schedule_authorized(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_sync_arc_source_comparison_events(integer) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_touch_arc_membership_candidate() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_v2_apply_article_claim_auditability() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_v2_assert_ingestion_writer_key(text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_attach_batch(text,integer) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_close_staging(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_materialize_batch(text,integer) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_originate_batch(text,integer) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_stage_batch(text,jsonb) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mip_v2_ingestion_begin_run(text,text,timestamp with time zone,timestamp with time zone,text,text,text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_v2_ingestion_finish_run(text,text,jsonb,text,text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_v2_ingestion_write_batch(text,text,integer,jsonb,text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_v2_promote_deterministic_article_claims(uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.mip_v2_promote_deterministic_article_claims_after_insert() TO PUBLIC;

GRANT SELECT ON TABLE
  public.authors_public,
  public.comparison_public,
  public.graph_coverage_public,
  public.news_detail_public
TO anon, authenticated;

COMMIT;
