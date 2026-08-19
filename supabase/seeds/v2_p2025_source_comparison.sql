-- Isolated v2 only — Project 2025 Source Comparison source-detail seed.
-- Manifest: v2-p2025-source-comparison-2026-08-19
-- Scope: four official DOJ records; each event is intentionally single-source.
-- No source-independence, causal, composite-score, or general-implementation claim.

BEGIN;

DELETE FROM public.explanations
WHERE rule_version = 'sc-v1|v2-p2025-source-comparison-2026-08-19';

DELETE FROM public.claim_evidence_links cel
USING public.claims c, public.events e
WHERE cel.claim_id = c.id
  AND c.event_id = e.id
  AND e.rule_version = 'v2-p2025-source-comparison-2026-08-19';

DELETE FROM public.article_claims ac
USING public.claims c, public.events e
WHERE ac.claim_id = c.id
  AND c.event_id = e.id
  AND e.rule_version = 'v2-p2025-source-comparison-2026-08-19';

DELETE FROM public.event_articles ea
USING public.events e
WHERE ea.event_id = e.id
  AND e.rule_version = 'v2-p2025-source-comparison-2026-08-19';

DELETE FROM public.claims c
USING public.events e
WHERE c.event_id = e.id
  AND e.rule_version = 'v2-p2025-source-comparison-2026-08-19';

DELETE FROM public.events
WHERE rule_version = 'v2-p2025-source-comparison-2026-08-19';

INSERT INTO public.events (
  canonical_title, occurred_at_start, occurred_at_end, location_text,
  arc_id, arc_event_id, status, rule_version
)
VALUES
  (
    'Attorney General rescinded two prior third-party-settlement payment memoranda',
    DATE '2025-02-05', DATE '2025-02-05', NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
    (SELECT id FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation') AND title = 'Attorney General rescinded two prior third-party-settlement payment memoranda'),
    'active', 'v2-p2025-source-comparison-2026-08-19'
  ),
  (
    'DOJ announced dismissal steps for Louisville and Minneapolis actions',
    DATE '2025-05-21', DATE '2025-05-21', NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
    (SELECT id FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation') AND title = 'DOJ announced dismissal steps for Louisville and Minneapolis actions'),
    'active', 'v2-p2025-source-comparison-2026-08-19'
  ),
  (
    'DOJ announced support for Seattle termination motion',
    DATE '2025-07-23', DATE '2025-07-23', NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
    (SELECT id FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation') AND title = 'DOJ announced support for Seattle termination motion'),
    'active', 'v2-p2025-source-comparison-2026-08-19'
  ),
  (
    'Court granted DOJ motion regarding Norfolk decree',
    DATE '2025-08-13', DATE '2025-08-13', NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
    (SELECT id FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation') AND title = 'Court granted DOJ motion regarding Norfolk decree'),
    'active', 'v2-p2025-source-comparison-2026-08-19'
  );

INSERT INTO public.claims (event_id, canonical_text, claim_kind, thin_extraction, status, rule_version)
SELECT
  e.id,
  CASE e.canonical_title
    WHEN 'Attorney General rescinded two prior third-party-settlement payment memoranda'
      THEN 'The Attorney General’s memorandum rescinded the May 5, 2022 and July 28, 2023 memoranda concerning payments to non-governmental third parties and directed a report on strategies and measures concerning improper payments.'
    WHEN 'DOJ announced dismissal steps for Louisville and Minneapolis actions'
      THEN 'DOJ stated that its Civil Rights Division was beginning dismissal steps for the Louisville and Minneapolis lawsuits and closing specified investigations.'
    WHEN 'DOJ announced support for Seattle termination motion'
      THEN 'DOJ stated that its Civil Rights Division filed a response supporting Seattle’s motion to terminate the police-department consent decree.'
    WHEN 'Court granted DOJ motion regarding Norfolk decree'
      THEN 'DOJ stated that the Eastern District of Virginia granted its motion to terminate the 1978 Norfolk consent decree governing police and firefighter employment.'
  END,
  'fact', false, 'active', 'v2-p2025-source-comparison-2026-08-19'
FROM public.events e
WHERE e.rule_version = 'v2-p2025-source-comparison-2026-08-19';

INSERT INTO public.event_articles (event_id, article_id, membership_method, membership_confidence)
SELECT
  e.id, a.id, 'manual_primary_source', 1.0
FROM public.events e
JOIN public.articles a ON a.url = CASE e.canonical_title
  WHEN 'Attorney General rescinded two prior third-party-settlement payment memoranda'
    THEN 'https://www.justice.gov/ag/media/1388536/dl?inline'
  WHEN 'DOJ announced dismissal steps for Louisville and Minneapolis actions'
    THEN 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and'
  WHEN 'DOJ announced support for Seattle termination motion'
    THEN 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree'
  WHEN 'Court granted DOJ motion regarding Norfolk decree'
    THEN 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree'
END
WHERE e.rule_version = 'v2-p2025-source-comparison-2026-08-19';

INSERT INTO public.article_claims (
  claim_id, article_id, surface_text, char_start, char_end,
  extraction_method, extraction_confidence, stance, loaded_language, version, is_current
)
SELECT
  c.id, a.id, c.canonical_text, NULL, NULL,
  'manual_primary_source', 1.0, 'asserts', '[]'::jsonb, 1, true
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.articles a ON a.url = CASE e.canonical_title
  WHEN 'Attorney General rescinded two prior third-party-settlement payment memoranda'
    THEN 'https://www.justice.gov/ag/media/1388536/dl?inline'
  WHEN 'DOJ announced dismissal steps for Louisville and Minneapolis actions'
    THEN 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and'
  WHEN 'DOJ announced support for Seattle termination motion'
    THEN 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree'
  WHEN 'Court granted DOJ motion regarding Norfolk decree'
    THEN 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree'
END
WHERE c.rule_version = 'v2-p2025-source-comparison-2026-08-19';

INSERT INTO public.claim_evidence_links (claim_id, evidence_url, evidence_type, linked_from_article_id)
SELECT c.id, a.url, 'primary_document', a.id
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.articles a ON a.url = CASE e.canonical_title
  WHEN 'Attorney General rescinded two prior third-party-settlement payment memoranda'
    THEN 'https://www.justice.gov/ag/media/1388536/dl?inline'
  WHEN 'DOJ announced dismissal steps for Louisville and Minneapolis actions'
    THEN 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and'
  WHEN 'DOJ announced support for Seattle termination motion'
    THEN 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree'
  WHEN 'Court granted DOJ motion regarding Norfolk decree'
    THEN 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree'
END
WHERE c.rule_version = 'v2-p2025-source-comparison-2026-08-19';

-- One explanation object per article-claim. The read path keys it by the final article UUID.
INSERT INTO public.explanations (
  assertion_id, assertion_type, version, is_current, source_ids, archived_sources,
  source_roles, supporting_passage, contradicting_evidence, missing_evidence,
  shared_entities, relationship_type, rule_version, provenance_class, recomputed_at,
  reviewed_at, review_status, falsification_condition, correction_history,
  remaining_uncertainty, state
)
SELECT
  'sc:claim_grouping:' || c.id::text || ':' || a.id::text,
  'claim_grouping', 1, true, ARRAY[]::uuid[], '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('article_id', a.id::text, 'role', 'primary_source_record', 'outlet', a.outlet)),
  c.canonical_text,
  '[]'::jsonb,
  jsonb_build_array('This event currently has one primary DOJ record. No independent-source or cross-outlet corroboration is asserted.'),
  ARRAY[]::uuid[], 'n/a', 'sc-v1|v2-p2025-source-comparison-2026-08-19',
  'human_authored', now(), now(), 'draft',
  'Replace or correct this explanation if the mapped DOJ record is corrected, withdrawn, or shown not to support the displayed text.',
  '[]'::jsonb,
  CASE e.canonical_title
    WHEN 'Attorney General rescinded two prior third-party-settlement payment memoranda'
      THEN 'The memorandum establishes the stated rescissions and direction; it does not establish the effectiveness, completion, or universal application of the requested follow-on measures.'
    WHEN 'DOJ announced dismissal steps for Louisville and Minneapolis actions'
      THEN 'The release documents announced steps; it does not establish a comprehensive review of all consent decrees or an aggregate policy outcome.'
    WHEN 'DOJ announced support for Seattle termination motion'
      THEN 'The release documents a filed response and stated support, not the court’s final disposition or a general result for other decrees.'
    WHEN 'Court granted DOJ motion regarding Norfolk decree'
      THEN 'The release documents the named Norfolk court action; it does not establish a general outcome for other consent decrees.'
  END,
  'ok'
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.article_claims ac ON ac.claim_id = c.id AND ac.is_current = true
JOIN public.articles a ON a.id = ac.article_id
WHERE c.rule_version = 'v2-p2025-source-comparison-2026-08-19';

COMMIT;

SELECT
  (SELECT count(*)::int FROM public.events WHERE rule_version = 'v2-p2025-source-comparison-2026-08-19') AS seeded_events,
  (SELECT count(*)::int FROM public.claims WHERE rule_version = 'v2-p2025-source-comparison-2026-08-19') AS seeded_claims,
  (SELECT count(*)::int FROM public.event_articles ea JOIN public.events e ON e.id = ea.event_id WHERE e.rule_version = 'v2-p2025-source-comparison-2026-08-19') AS seeded_event_articles,
  (SELECT count(*)::int FROM public.claim_evidence_links cel JOIN public.claims c ON c.id = cel.claim_id WHERE c.rule_version = 'v2-p2025-source-comparison-2026-08-19') AS seeded_primary_links,
  (SELECT count(*)::int FROM public.explanations WHERE rule_version = 'sc-v1|v2-p2025-source-comparison-2026-08-19' AND is_current = true) AS seeded_explanations
LIMIT 1;
