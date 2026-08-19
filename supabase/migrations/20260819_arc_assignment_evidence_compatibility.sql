-- Compatibility for environments restored from a pre-15A article schema.
--
-- The atomic attach_article_to_arc RPC preserves the versioned assignment
-- rationale when supplied by the reviewed ingestion/backfill path. Earlier
-- v2 sandbox baselines contain the RPC but not this nullable evidence field.
-- This migration is additive and data-preserving; existing legacy articles
-- intentionally retain NULL until an assignment actually has evidence.
--
-- Rollback: ALTER TABLE public.articles DROP COLUMN IF EXISTS arc_assignment_evidence;
-- Only use that rollback after removing the RPC reference and confirming no
-- assignment evidence needs to be retained.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS arc_assignment_evidence jsonb;

COMMENT ON COLUMN public.articles.arc_assignment_evidence IS
  'Versioned rationale emitted by the reviewed Story Arc assignment path; nullable for legacy articles.';
