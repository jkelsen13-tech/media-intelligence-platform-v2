-- DO NOT APPLY WITHOUT THE OWNER'S PRODUCTION-SECURITY AUTHORIZATION.
-- Target: yhbwnrtlqbjtcrrlpbge only.
-- Purpose: remove browser execution from the exact live SECURITY DEFINER set.
-- This candidate changes grants only. It contains no row DML and no object drop.

BEGIN;

DO $$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.articles_source_status_propagate()',
    'public.handle_new_mip_user()',
    'public.mip_approve_arc_membership_candidate(uuid)',
    'public.mip_arc_membership_projection_state_change()',
    'public.mip_ingest_rss_schedule_authorized(text)',
    'public.mip_intercept_direct_arc_attachment()',
    'public.mip_invalidate_arc_membership_approvals()',
    'public.mip_project_approved_arc_membership(uuid)',
    'public.mip_queue_source_comparison_enrichment()',
    'public.mip_refresh_arc_projection_milestone(uuid)',
    'public.mip_retract_arc_membership_projection(uuid)',
    'public.mip_seed_arc_membership_candidates(integer)',
    'public.mip_source_comparison_schedule_authorized(text)',
    'public.mip_sync_arc_source_comparison_events(integer)',
    'public.mip_touch_arc_membership_candidate()',
    'public.mip_v2_apply_article_claim_auditability()',
    'public.mip_v2_assert_ingestion_writer_key(text)',
    'public.mip_v2_gdelt_attach_batch(text,integer)',
    'public.mip_v2_gdelt_close_staging(text)',
    'public.mip_v2_gdelt_materialize_batch(text,integer)',
    'public.mip_v2_gdelt_originate_batch(text,integer)',
    'public.mip_v2_gdelt_stage_batch(text,jsonb)',
    'public.mip_v2_ingestion_begin_run(text,text,timestamp with time zone,timestamp with time zone,text,text,text)',
    'public.mip_v2_ingestion_finish_run(text,text,jsonb,text,text)',
    'public.mip_v2_ingestion_write_batch(text,text,integer,jsonb,text)',
    'public.mip_v2_promote_deterministic_article_claims(uuid)',
    'public.mip_v2_promote_deterministic_article_claims_after_insert()'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NULL THEN
      RAISE EXCEPTION 'preflight failed: missing function %', signature;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc AS p WHERE p.oid = target) THEN
      RAISE EXCEPTION 'preflight failed: % is not SECURITY DEFINER', signature;
    END IF;
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.articles_source_status_propagate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.articles_source_status_propagate() TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_mip_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_mip_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_approve_arc_membership_candidate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_approve_arc_membership_candidate(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_arc_membership_projection_state_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_arc_membership_projection_state_change() TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_ingest_rss_schedule_authorized(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_ingest_rss_schedule_authorized(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_intercept_direct_arc_attachment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_intercept_direct_arc_attachment() TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_invalidate_arc_membership_approvals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_invalidate_arc_membership_approvals() TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_project_approved_arc_membership(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_project_approved_arc_membership(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_queue_source_comparison_enrichment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_queue_source_comparison_enrichment() TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_refresh_arc_projection_milestone(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_refresh_arc_projection_milestone(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_retract_arc_membership_projection(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_retract_arc_membership_projection(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_seed_arc_membership_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_seed_arc_membership_candidates(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_source_comparison_schedule_authorized(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_source_comparison_schedule_authorized(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_sync_arc_source_comparison_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_sync_arc_source_comparison_events(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_touch_arc_membership_candidate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_touch_arc_membership_candidate() TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_apply_article_claim_auditability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_apply_article_claim_auditability() TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_assert_ingestion_writer_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_assert_ingestion_writer_key(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_gdelt_attach_batch(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_attach_batch(text,integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_gdelt_close_staging(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_close_staging(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_gdelt_materialize_batch(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_materialize_batch(text,integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_gdelt_originate_batch(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_originate_batch(text,integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_gdelt_stage_batch(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_gdelt_stage_batch(text,jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_ingestion_begin_run(text,text,timestamp with time zone,timestamp with time zone,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_ingestion_begin_run(text,text,timestamp with time zone,timestamp with time zone,text,text,text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_ingestion_finish_run(text,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_ingestion_finish_run(text,text,jsonb,text,text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_ingestion_write_batch(text,text,integer,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_ingestion_write_batch(text,text,integer,jsonb,text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_promote_deterministic_article_claims(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_promote_deterministic_article_claims(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mip_v2_promote_deterministic_article_claims_after_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mip_v2_promote_deterministic_article_claims_after_insert() TO service_role;

DO $$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'public.authors_public',
    'public.comparison_public',
    'public.graph_coverage_public',
    'public.news_detail_public'
  ] LOOP
    IF to_regclass(relation_name) IS NULL THEN
      RAISE EXCEPTION 'preflight failed: missing relation %', relation_name;
    END IF;
  END LOOP;
END
$$;

REVOKE SELECT ON TABLE
  public.authors_public,
  public.comparison_public,
  public.graph_coverage_public,
  public.news_detail_public
FROM PUBLIC, anon, authenticated;

COMMIT;
