-- V2-only remediation: remove anonymous direct reads of internal, review, legal,
-- ingestion, graph-operation, and comparison base tables. Public Source Comparison
-- cards are served exclusively through public.comparison_public.
--
-- Intentionally leaves authenticated and service_role privileges unchanged.

-- Confirmed direct exposures.
REVOKE SELECT ON TABLE public.article_claims FROM anon;
REVOKE SELECT ON TABLE public.article_extraction_results FROM anon;
REVOKE SELECT ON TABLE public.claim_evidence_links FROM anon;
REVOKE SELECT ON TABLE public.claims FROM anon;
REVOKE SELECT ON TABLE public.cross_surface_candidates FROM anon;
REVOKE SELECT ON TABLE public.ingest_sources FROM anon;
REVOKE SELECT ON TABLE public.ingestion_runs FROM anon;
REVOKE SELECT ON TABLE public.ingestion_sources FROM anon;
REVOKE SELECT ON TABLE public.p3_legal_case FROM anon;
REVOKE SELECT ON TABLE public.p3_legal_case_evidence FROM anon;
REVOKE SELECT ON TABLE public.pipeline_config FROM anon;

-- Directive-listed landmine tables.
REVOKE SELECT ON TABLE public.arc_milestones FROM anon;
REVOKE SELECT ON TABLE public.author_profile_queue FROM anon;
REVOKE SELECT ON TABLE public.authors FROM anon;
REVOKE SELECT ON TABLE public.bias_incidents FROM anon;
REVOKE SELECT ON TABLE public.claim_corrections FROM anon;
REVOKE SELECT ON TABLE public.graph_checkpoints FROM anon;
REVOKE SELECT ON TABLE public.graph_community_assignments FROM anon;
REVOKE SELECT ON TABLE public.graph_layout_versions FROM anon;
REVOKE SELECT ON TABLE public.graph_metric_snapshots FROM anon;
REVOKE SELECT ON TABLE public.ingestion_checkpoints FROM anon;
REVOKE SELECT ON TABLE public.ingestion_writer_credentials FROM anon;
REVOKE SELECT ON TABLE public.mip_profiles FROM anon;
REVOKE SELECT ON TABLE public.publication_rejection_audit FROM anon;
REVOKE SELECT ON TABLE public.sky_verifications FROM anon;
REVOKE SELECT ON TABLE public.source_change_events FROM anon;
