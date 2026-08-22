-- V2 approved remediation: close residual anonymous/public read policies on
-- confirmed-exposure tables while retaining the existing authenticated and
-- service_role SELECT access. This migration changes no rows or schema data.
--
-- Scope: Tier 0 legal data, Tier 1 ingestion/configuration, and Tier 2
-- editorial/graph internals listed in V1V2AnonymousReadExposureRemediationPlan.

begin;

-- Keep the tables protected even if a future migration changes default RLS behavior.
alter table public.article_claims enable row level security;
alter table public.article_extraction_results enable row level security;
alter table public.claim_evidence_links enable row level security;
alter table public.claims enable row level security;
alter table public.cross_surface_candidates enable row level security;
alter table public.ingest_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.ingestion_sources enable row level security;
alter table public.p3_legal_case enable row level security;
alter table public.p3_legal_case_evidence enable row level security;
alter table public.pipeline_config enable row level security;

-- Defense in depth: anonymous and PUBLIC roles must not receive table-level SELECT.
revoke select on table public.article_claims from anon, public;
revoke select on table public.article_extraction_results from anon, public;
revoke select on table public.claim_evidence_links from anon, public;
revoke select on table public.claims from anon, public;
revoke select on table public.cross_surface_candidates from anon, public;
revoke select on table public.ingest_sources from anon, public;
revoke select on table public.ingestion_runs from anon, public;
revoke select on table public.ingestion_sources from anon, public;
revoke select on table public.p3_legal_case from anon, public;
revoke select on table public.p3_legal_case_evidence from anon, public;
revoke select on table public.pipeline_config from anon, public;

-- Preserve the pre-change role-specific read paths. RLS still applies to
-- authenticated requests; service_role retains its server-side administrative path.
grant select on table public.article_claims, public.article_extraction_results,
  public.claim_evidence_links, public.claims, public.cross_surface_candidates,
  public.ingest_sources, public.ingestion_runs, public.ingestion_sources,
  public.p3_legal_case, public.p3_legal_case_evidence, public.pipeline_config
  to authenticated, service_role;

-- Existing permissive SELECT policies carried anon either directly or through
-- PUBLIC. Retarget each policy to authenticated without changing its predicate.
alter policy "public read article_claims" on public.article_claims to authenticated;
alter policy "article_extraction_results_read" on public.article_extraction_results to authenticated;
alter policy "public read claim_evidence_links" on public.claim_evidence_links to authenticated;
alter policy "public read claims" on public.claims to authenticated;
alter policy "cross_surface_candidates_read" on public.cross_surface_candidates to authenticated;
alter policy "public read ingest_sources" on public.ingest_sources to authenticated;
alter policy "ingestion_runs_read" on public.ingestion_runs to authenticated;
alter policy "ingestion_sources_read" on public.ingestion_sources to authenticated;
alter policy "public read p3 legal case" on public.p3_legal_case to authenticated;
alter policy "public read p3 legal evidence" on public.p3_legal_case_evidence to authenticated;
alter policy "public read pipeline_config" on public.pipeline_config to authenticated;

commit;
