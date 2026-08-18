-- Isolated v2 corpus expansion: Norfolk consent-decree coverage.
-- Adds two independently published reports to the existing, source-bounded arc.
-- The Source Comparison read path must label multi-outlet coverage as lineage unverified.

BEGIN;

INSERT INTO public.articles (
  feed, outlet, title, url, summary, published_at, body_text, claims,
  arc_id, unattributed, monoculture, is_digest, entities_extracted_at,
  arc_assign_attempted_at, ingestion_run_id, source_status, source_status_note
)
VALUES
  (
    'curated-public-records',
    'WAVY',
    'Court grants motion to end consent decree governing Norfolk’s hiring practices',
    'https://www.wavy.com/news/local-news/court-grants-motion-to-end-consent-decree-governing-norfolks-hiring-practices/',
    'WAVY reported that the Eastern District of Virginia granted a motion ending the consent decree governing Norfolk Police and Fire-Rescue hiring practices.',
    TIMESTAMPTZ '2025-08-13 15:51:00-04',
    'Curated public report. The record is limited to the published account of the court action; it does not reproduce any underlying case-file materials.',
    '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025'),
    false, false, false, now(), now(), 'v2-norfolk-multi-outlet-2026-08-18', 'active',
    'Curated public reporting; membership is manual and source lineage is not verified.'
  ),
  (
    'curated-public-records',
    '13News Now',
    'Federal “micromanagement” was unnecessary in Norfolk, DOJ says',
    'https://www.13newsnow.com/article/news/local/mycity/norfolk/justice-department-frees-norfolk-from-hiring-decree/291-d556ddca-3a43-440d-9da7-e7a690c5680c',
    '13News Now reported that DOJ released Norfolk from the long-running hiring decree after a motion to dissolve it was filed in July.',
    TIMESTAMPTZ '2025-08-13 00:00:00-04',
    'Curated public report. The record is limited to the published account of the decree action; it does not reproduce any underlying case-file materials.',
    '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025'),
    false, false, false, now(), now(), 'v2-norfolk-multi-outlet-2026-08-18', 'active',
    'Curated public reporting; membership is manual and source lineage is not verified.'
  )
ON CONFLICT (url) DO UPDATE SET
  feed = EXCLUDED.feed,
  outlet = EXCLUDED.outlet,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  published_at = EXCLUDED.published_at,
  body_text = EXCLUDED.body_text,
  claims = EXCLUDED.claims,
  arc_id = EXCLUDED.arc_id,
  unattributed = false,
  monoculture = false,
  is_digest = false,
  entities_extracted_at = now(),
  arc_assign_attempted_at = now(),
  ingestion_run_id = EXCLUDED.ingestion_run_id,
  source_status = EXCLUDED.source_status,
  source_status_note = EXCLUDED.source_status_note;

DELETE FROM public.sources
WHERE url IN (
  'https://www.wavy.com/news/local-news/court-grants-motion-to-end-consent-decree-governing-norfolks-hiring-practices/',
  'https://www.13newsnow.com/article/news/local/mycity/norfolk/justice-department-frees-norfolk-from-hiring-decree/291-d556ddca-3a43-440d-9da7-e7a690c5680c'
)
AND node_id = (SELECT id FROM public.nodes WHERE slug = 'evt-doj-norfolk-termination-20250813');

INSERT INTO public.sources (node_id, outlet, headline, url, published_at)
SELECT n.id, a.outlet, a.title, a.url, a.published_at::date
FROM public.nodes n
JOIN public.articles a ON a.ingestion_run_id = 'v2-norfolk-multi-outlet-2026-08-18'
WHERE n.slug = 'evt-doj-norfolk-termination-20250813';

DELETE FROM public.article_claims ac
USING public.claims c, public.events e, public.articles a
WHERE ac.claim_id = c.id
  AND ac.article_id = a.id
  AND c.event_id = e.id
  AND e.canonical_title = 'Court granted DOJ motion regarding Norfolk decree'
  AND a.ingestion_run_id = 'v2-norfolk-multi-outlet-2026-08-18';

DELETE FROM public.event_articles ea
USING public.events e, public.articles a
WHERE ea.event_id = e.id
  AND ea.article_id = a.id
  AND e.canonical_title = 'Court granted DOJ motion regarding Norfolk decree'
  AND a.ingestion_run_id = 'v2-norfolk-multi-outlet-2026-08-18';

INSERT INTO public.event_articles (event_id, article_id, membership_method, membership_confidence)
SELECT e.id, a.id, 'manual_curated_report', 1.0
FROM public.events e
JOIN public.articles a ON a.ingestion_run_id = 'v2-norfolk-multi-outlet-2026-08-18'
WHERE e.canonical_title = 'Court granted DOJ motion regarding Norfolk decree'
  AND e.rule_version = 'v2-doj-consent-actions-2026-08-18';

INSERT INTO public.article_claims (
  claim_id, article_id, surface_text, char_start, char_end,
  extraction_method, extraction_confidence, stance, loaded_language, version, is_current
)
SELECT
  c.id,
  a.id,
  CASE a.outlet
    WHEN 'WAVY' THEN 'The U.S. District Court for the Eastern District of Virginia granted a motion to end the consent decree governing Norfolk’s police and fire hiring practices.'
    WHEN '13News Now' THEN 'The report states that DOJ released Norfolk from the long-running hiring decree after the Department filed a motion to dissolve it.'
  END,
  NULL, NULL, 'manual', 1.0, 'asserts', '[]'::jsonb, 1, true
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.articles a ON a.ingestion_run_id = 'v2-norfolk-multi-outlet-2026-08-18'
WHERE e.canonical_title = 'Court granted DOJ motion regarding Norfolk decree'
  AND c.rule_version = 'v2-doj-consent-actions-2026-08-18';

COMMIT;

SELECT
  (SELECT count(*) FROM public.articles WHERE ingestion_run_id = 'v2-norfolk-multi-outlet-2026-08-18') AS added_articles,
  (SELECT count(*) FROM public.event_articles ea JOIN public.events e ON e.id = ea.event_id WHERE e.canonical_title = 'Court granted DOJ motion regarding Norfolk decree') AS norfolk_event_articles,
  (SELECT count(*) FROM public.article_claims ac JOIN public.claims c ON c.id = ac.claim_id JOIN public.events e ON e.id = c.event_id WHERE e.canonical_title = 'Court granted DOJ motion regarding Norfolk decree') AS norfolk_claim_surfaces
LIMIT 1;
