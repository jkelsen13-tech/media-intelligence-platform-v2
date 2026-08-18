-- Roll back only the v2-doj-consent-actions-2026-08-18 cross-surface seed.
-- Does not touch Project 2025, Doc 07, production, or unrelated sandbox material.

BEGIN;

UPDATE public.articles
SET arc_id = NULL
WHERE ingestion_run_id = 'v2-doj-consent-actions-2026-08-18';

DELETE FROM public.story_arcs
WHERE slug = 'doj-consent-actions-2025';

DELETE FROM public.nodes
WHERE metadata ->> 'manifest' = 'v2-doj-consent-actions-2026-08-18';

DELETE FROM public.entities
WHERE normalized_name = 'us department of justice civil rights division'
  AND NOT EXISTS (
    SELECT 1 FROM public.article_entities ae WHERE ae.entity_id = public.entities.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.arc_entities arce WHERE arce.entity_id = public.entities.id
  );

DELETE FROM public.articles
WHERE ingestion_run_id = 'v2-doj-consent-actions-2026-08-18';

COMMIT;

SELECT
  (SELECT count(*) FROM public.articles WHERE ingestion_run_id = 'v2-doj-consent-actions-2026-08-18') AS remaining_seeded_articles,
  (SELECT count(*) FROM public.nodes WHERE metadata ->> 'manifest' = 'v2-doj-consent-actions-2026-08-18') AS remaining_seeded_nodes
LIMIT 1;
