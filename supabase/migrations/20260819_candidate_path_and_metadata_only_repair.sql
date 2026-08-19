-- Candidate-path and metadata-only reference repair.
--
-- A reference-manifest sentinel explicitly says its publisher body and
-- relationship data were not copied. Such rows remain valid News and Timeline
-- metadata, but cannot support literal extraction, Story Arc, Graph, or
-- review-candidate inference. This migration is additive for the article
-- audit fields and corrective only for rows carrying that exact sentinel.
--
-- Rollback: restore the affected relationship data from a pre-migration
-- isolated-sandbox backup after restoring original publisher bodies. Do not
-- re-create inferences from the sentinel itself.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS candidate_generation_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS candidate_generation_note text;

COMMENT ON COLUMN public.articles.candidate_generation_attempted_at IS
  'Timestamp of deterministic evidence-floor assessment for review-gated cross-surface candidates.';
COMMENT ON COLUMN public.articles.candidate_generation_note IS
  'Reason a candidate was materialized, withheld, or skipped; no approval implication.';

DO $$
DECLARE
  sentinel constant text := 'Read-only reference import: public source metadata only. No original body text, embeddings, entities, claims, or relationship data were copied.';
BEGIN
  -- Remove any review records that could only have been derived from
  -- non-evidentiary placeholder text.
  DELETE FROM public.cross_surface_candidates c
  USING public.articles a
  WHERE c.article_id = a.id
    AND a.body_text = sentinel;

  DELETE FROM public.citations c
  USING public.articles a
  WHERE c.article_id = a.id
    AND a.body_text = sentinel;

  DELETE FROM public.article_entities ae
  USING public.articles a
  WHERE ae.article_id = a.id
    AND a.body_text = sentinel;

  -- Disassociate the unsupported articles before deleting their isolated
  -- auto-originated arcs. Timeline event/article links are intentionally
  -- preserved so the records remain chronologically visible.
  UPDATE public.articles
  SET arc_id = NULL,
      claims = '[]'::jsonb,
      entities_extracted_at = coalesce(entities_extracted_at, now()),
      arc_assign_attempted_at = now(),
      source_status_changed_at = now(),
      source_status_note = 'Reference-manifest metadata only; original publisher body is unavailable for literal extraction or cross-surface assignment.',
      candidate_generation_attempted_at = now(),
      candidate_generation_note = 'withheld: reference-manifest metadata only; no original publisher body for literal evidence'
  WHERE body_text = sentinel;

  UPDATE public.events e
  SET arc_id = NULL
  FROM public.story_arcs sa
  JOIN public.articles seed ON seed.id = sa.seed_article_id
  WHERE e.arc_id = sa.id
    AND seed.body_text = sentinel;

  -- Delete only arcs seeded from metadata-only rows. All member article links
  -- were detached above; associated nodes and cascading graph edges are also
  -- unsupported derived state and are removed.
  DELETE FROM public.nodes n
  USING public.story_arcs sa
  JOIN public.articles seed ON seed.id = sa.seed_article_id
  WHERE (n.arc_id = sa.id OR n.id = sa.root_node_id)
    AND seed.body_text = sentinel;

  DELETE FROM public.story_arcs sa
  USING public.articles seed
  WHERE sa.seed_article_id = seed.id
    AND seed.body_text = sentinel;
END $$;
