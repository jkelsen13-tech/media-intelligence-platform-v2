-- Production-recorded public-surface authenticated-review revoke.
-- Applied on qikvmopbtijoebdqosyq as 20260905181254 / mip_public_surface_authenticated_review_revoke.
-- Restored verbatim from supabase_migrations.schema_migrations.statements.
-- Do not replay this file on production; it is already recorded there.

-- Close ordinary-authenticated access to private review bases transferred
-- by the public-surface schema. Reader contracts stay on comparison_public,
-- news_detail_public, and the other governed projections. Signing in does
-- not confer reviewer privileges. service_role remains the operator path.

drop policy if exists events_authenticated_read on public.events;
drop policy if exists claims_authenticated_read on public.claims;
drop policy if exists article_claims_authenticated_read on public.article_claims;
drop policy if exists event_articles_authenticated_read on public.event_articles;
drop policy if exists explanations_authenticated_read on public.explanations;
drop policy if exists cross_surface_candidates_read on public.cross_surface_candidates;
drop policy if exists p3_legal_case_read on public.p3_legal_case;
drop policy if exists p3_legal_case_evidence_read on public.p3_legal_case_evidence;
drop policy if exists p3_policy_read on public.p3_policy;
drop policy if exists p3_policy_track_event_read on public.p3_policy_track_event;

revoke select on table
  public.events,
  public.claims,
  public.article_claims,
  public.event_articles,
  public.explanations,
  public.cross_surface_candidates,
  public.claim_evidence_links,
  public.claim_corrections,
  public.entities,
  public.p3_legal_case,
  public.p3_legal_case_evidence,
  public.p3_policy,
  public.p3_policy_track_event
from anon, authenticated, public;

grant select on table
  public.events,
  public.claims,
  public.article_claims,
  public.event_articles,
  public.explanations,
  public.cross_surface_candidates,
  public.claim_evidence_links,
  public.claim_corrections,
  public.entities,
  public.p3_legal_case,
  public.p3_legal_case_evidence,
  public.p3_policy,
  public.p3_policy_track_event
to service_role;
