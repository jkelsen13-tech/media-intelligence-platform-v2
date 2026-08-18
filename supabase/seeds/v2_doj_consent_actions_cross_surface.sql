-- Isolated v2 cross-surface seed: named DOJ primary releases only.
-- Manifest: v2-doj-consent-actions-2026-08-18
-- Scope: News + Graph + Timeline + Story Arcs. No Project 2025 outcome rows,
-- no Doc 07 rows, no inference, no causal edges, no person-level records.
-- Rollback: supabase/seeds/v2_doj_consent_actions_cross_surface_rollback.sql

BEGIN;

INSERT INTO public.story_arcs (
  slug, title, category, status, coverage_gap, summary, started_at,
  category_confidence, category_evidence, title_article_count
)
VALUES (
  'doj-consent-actions-2025',
  'Documented DOJ consent-decree actions (2025)',
  'institutional_accountability',
  'active',
  false,
  'Three named U.S. Department of Justice releases concerning 2025 consent-decree actions. This arc does not conclude that all consent decrees were reviewed or terminated.',
  DATE '2025-05-21',
  NULL,
  'Manual primary-source grouping; category is a display label, not an outcome score.',
  3
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  coverage_gap = EXCLUDED.coverage_gap,
  summary = EXCLUDED.summary,
  started_at = EXCLUDED.started_at,
  category_confidence = EXCLUDED.category_confidence,
  category_evidence = EXCLUDED.category_evidence,
  title_article_count = EXCLUDED.title_article_count,
  last_update_at = now();

INSERT INTO public.nodes (slug, label, type, description, metadata, confidence, summary, occurred_at, arc_id)
SELECT
  'arc-doj-consent-actions-2025',
  'Documented DOJ consent-decree actions (2025)',
  'policy',
  'A bounded grouping of three named DOJ releases. It does not establish a comprehensive review, termination, or intervention finding.',
  jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'scope', 'three_named_primary_releases'),
  NULL,
  'Grouping node for three named DOJ releases; no aggregate outcome is asserted.',
  DATE '2025-05-21',
  id
FROM public.story_arcs
WHERE slug = 'doj-consent-actions-2025'
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  metadata = EXCLUDED.metadata,
  confidence = NULL,
  summary = EXCLUDED.summary,
  occurred_at = EXCLUDED.occurred_at,
  arc_id = EXCLUDED.arc_id,
  updated_at = now();

UPDATE public.story_arcs a
SET root_node_id = n.id, last_update_at = now()
FROM public.nodes n
WHERE a.slug = 'doj-consent-actions-2025'
  AND n.slug = 'arc-doj-consent-actions-2025';

INSERT INTO public.nodes (slug, label, type, description, metadata, confidence, summary, occurred_at, arc_id)
VALUES
  (
    'institution-doj-civil-rights-division',
    'U.S. Department of Justice — Civil Rights Division',
    'institution',
    'Federal department component named in each of the three source releases.',
    jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'entity_type', 'institution'),
    NULL,
    'Institution named by the primary source releases.',
    NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025')
  ),
  (
    'evt-doj-louisville-minneapolis-dismissal-20250521',
    'DOJ announced dismissal steps for Louisville and Minneapolis actions',
    'event',
    'The DOJ release states that the Civil Rights Division was beginning the process of dismissing lawsuits against the Louisville and Minneapolis police departments and closing specified investigations.',
    jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'article_url', 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and'),
    NULL,
    'Named DOJ release, limited to the agency statement and listed actions.',
    DATE '2025-05-21',
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025')
  ),
  (
    'evt-doj-seattle-support-20250723',
    'DOJ announced support for Seattle termination motion',
    'event',
    'The DOJ release states that the Civil Rights Division filed a response supporting Seattle’s motion to terminate the police-department consent decree.',
    jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'article_url', 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree'),
    NULL,
    'Named DOJ release, limited to the filed response and its stated subject.',
    DATE '2025-07-23',
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025')
  ),
  (
    'evt-doj-norfolk-termination-20250813',
    'Court granted DOJ motion regarding Norfolk decree',
    'event',
    'The DOJ release states that the Eastern District of Virginia granted the Department’s motion to terminate the 1978 Norfolk consent decree governing police and firefighter employment.',
    jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'article_url', 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree'),
    NULL,
    'Named DOJ release, limited to the announced court action in the Norfolk matter.',
    DATE '2025-08-13',
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025')
  ),
  (
    'doc-doj-louisville-minneapolis-release-20250521',
    'DOJ release: Louisville and Minneapolis actions',
    'document',
    'Official DOJ press release dated May 21, 2025.',
    jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'url', 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and'),
    NULL,
    'Official DOJ press release.',
    DATE '2025-05-21',
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025')
  ),
  (
    'doc-doj-seattle-release-20250723',
    'DOJ release: Seattle termination motion',
    'document',
    'Official DOJ press release dated July 23, 2025.',
    jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'url', 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree'),
    NULL,
    'Official DOJ press release.',
    DATE '2025-07-23',
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025')
  ),
  (
    'doc-doj-norfolk-release-20250813',
    'DOJ release: Norfolk decree termination',
    'document',
    'Official DOJ press release dated August 13, 2025.',
    jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'url', 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree'),
    NULL,
    'Official DOJ press release.',
    DATE '2025-08-13',
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2026-08-18')
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  type = EXCLUDED.type,
  description = EXCLUDED.description,
  metadata = EXCLUDED.metadata,
  confidence = NULL,
  summary = EXCLUDED.summary,
  occurred_at = EXCLUDED.occurred_at,
  arc_id = EXCLUDED.arc_id,
  updated_at = now();

-- Correct an accidental slug lookup above on every idempotent execution.
UPDATE public.nodes
SET arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025'), updated_at = now()
WHERE slug = 'doc-doj-norfolk-release-20250813';

INSERT INTO public.articles (
  feed, outlet, title, url, summary, published_at, body_text, claims,
  arc_id, unattributed, monoculture, is_digest, entities_extracted_at,
  arc_assign_attempted_at, ingestion_run_id, source_status, source_status_note
)
VALUES
  (
    'doj-primary-records',
    'U.S. Department of Justice',
    'The U.S. Department of Justice’s Civil Rights Division Dismisses Biden-Era Police Investigations and Proposed Police Consent Decrees in Louisville and Minneapolis',
    'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and',
    'DOJ stated that its Civil Rights Division was beginning dismissal steps for the Louisville and Minneapolis lawsuits and closing specified investigations.',
    TIMESTAMPTZ '2025-05-21 00:00:00+00',
    'Primary DOJ record curated for the isolated v2 cross-surface seed. See the source URL for the full release.',
    '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025'),
    false, false, false, now(), now(), 'v2-doj-consent-actions-2026-08-18', 'active',
    'Primary DOJ release; manually curated for cross-surface demonstration.'
  ),
  (
    'doj-primary-records',
    'U.S. Department of Justice',
    'Justice Department Supports Seattle’s Motion to Terminate Police Department Consent Decree',
    'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree',
    'DOJ stated that its Civil Rights Division filed a response supporting Seattle’s motion to terminate the police-department consent decree.',
    TIMESTAMPTZ '2025-07-23 00:00:00+00',
    'Primary DOJ record curated for the isolated v2 cross-surface seed. See the source URL for the full release.',
    '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025'),
    false, false, false, now(), now(), 'v2-doj-consent-actions-2026-08-18', 'active',
    'Primary DOJ release; manually curated for cross-surface demonstration.'
  ),
  (
    'doj-primary-records',
    'U.S. Department of Justice',
    'Federal Court Grants Justice Department’s Motion to Terminate 47-Year-Old Consent Decree Governing Employment by City of Norfolk’s Police and Fire Departments',
    'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree',
    'DOJ stated that the Eastern District of Virginia granted its motion to terminate the 1978 Norfolk consent decree governing police and firefighter employment.',
    TIMESTAMPTZ '2025-08-13 00:00:00+00',
    'Primary DOJ record curated for the isolated v2 cross-surface seed. See the source URL for the full release.',
    '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025'),
    false, false, false, now(), now(), 'v2-doj-consent-actions-2026-08-18', 'active',
    'Primary DOJ release; manually curated for cross-surface demonstration.'
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

INSERT INTO public.entities (canonical_name, normalized_name, aliases, entity_type, mention_count)
SELECT 'U.S. Department of Justice — Civil Rights Division', 'us department of justice civil rights division', ARRAY['DOJ Civil Rights Division'], 'institution', 3
WHERE NOT EXISTS (
  SELECT 1 FROM public.entities WHERE normalized_name = 'us department of justice civil rights division'
);

INSERT INTO public.arc_entities (arc_id, entity_id, role)
SELECT a.id, e.id, 'primary'
FROM public.story_arcs a
JOIN public.entities e ON e.normalized_name = 'us department of justice civil rights division'
WHERE a.slug = 'doj-consent-actions-2025'
ON CONFLICT (arc_id, entity_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.article_entities (article_id, entity_id, confidence, extraction_method, role)
SELECT a.id, e.id, 1.0, 'manual', 'named institution in source release'
FROM public.articles a
JOIN public.entities e ON e.normalized_name = 'us department of justice civil rights division'
WHERE a.ingestion_run_id = 'v2-doj-consent-actions-2026-08-18'
ON CONFLICT (article_id, entity_id) DO UPDATE SET
  confidence = EXCLUDED.confidence,
  extraction_method = EXCLUDED.extraction_method,
  role = EXCLUDED.role;

DELETE FROM public.arc_events
WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025')
  AND title IN (
    'DOJ announced dismissal steps for Louisville and Minneapolis actions',
    'DOJ announced support for Seattle termination motion',
    'Court granted DOJ motion regarding Norfolk decree'
  );

INSERT INTO public.arc_events (arc_id, title, category, confidence, occurred_at, description)
SELECT id, 'DOJ announced dismissal steps for Louisville and Minneapolis actions', 'accountability', 'confirmed', DATE '2025-05-21',
  'Source-linked DOJ announcement; no conclusion about a comprehensive review of consent decrees.'
FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025'
UNION ALL
SELECT id, 'DOJ announced support for Seattle termination motion', 'accountability', 'confirmed', DATE '2025-07-23',
  'Source-linked DOJ announcement limited to its stated support for Seattle’s motion.'
FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025'
UNION ALL
SELECT id, 'Court granted DOJ motion regarding Norfolk decree', 'accountability', 'confirmed', DATE '2025-08-13',
  'Source-linked DOJ announcement limited to the named Norfolk court action.'
FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025';

DELETE FROM public.sources
WHERE url IN (
  'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and',
  'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree',
  'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree'
)
AND node_id IN (
  SELECT id FROM public.nodes WHERE metadata ->> 'manifest' = 'v2-doj-consent-actions-2026-08-18'
);

INSERT INTO public.sources (node_id, outlet, headline, url, published_at)
SELECT n.id, 'U.S. Department of Justice', a.title, a.url, a.published_at::date
FROM public.nodes n
JOIN public.articles a ON a.url = n.metadata ->> 'article_url'
WHERE n.metadata ->> 'manifest' = 'v2-doj-consent-actions-2026-08-18'
  AND n.type = 'event';

INSERT INTO public.edges (
  source_id, target_id, type, weight, label, metadata, similarity, sky_verified,
  signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes,
  counterfactual_test, reliability
)
SELECT
  i.id, e.id, 'actor', 'medium', 'actor: named DOJ Civil Rights Division action',
  jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'evidence', 'Named in the linked DOJ primary release.'),
  NULL, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL, 1
FROM public.nodes i
JOIN public.nodes e ON e.slug IN (
  'evt-doj-louisville-minneapolis-dismissal-20250521',
  'evt-doj-seattle-support-20250723',
  'evt-doj-norfolk-termination-20250813'
)
WHERE i.slug = 'institution-doj-civil-rights-division'
ON CONFLICT (source_id, target_id, type) DO UPDATE SET
  weight = EXCLUDED.weight, label = EXCLUDED.label, metadata = EXCLUDED.metadata,
  similarity = NULL, sky_verified = false, signal_source = EXCLUDED.signal_source,
  doc_strength = EXCLUDED.doc_strength, claimed_by = EXCLUDED.claimed_by,
  stance = EXCLUDED.stance, disputed_by = EXCLUDED.disputed_by,
  alternative_causes = EXCLUDED.alternative_causes, counterfactual_test = NULL,
  reliability = EXCLUDED.reliability;

INSERT INTO public.edges (
  source_id, target_id, type, weight, label, metadata, similarity, sky_verified,
  signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes,
  counterfactual_test, reliability
)
SELECT
  e.id, d.id, 'documentary', 'medium', 'documentary: official DOJ release',
  jsonb_build_object('manifest', 'v2-doj-consent-actions-2026-08-18', 'evidence', 'The event summary is limited to the linked official DOJ release.'),
  NULL, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL, 1
FROM public.nodes e
JOIN public.nodes d ON (
  (e.slug = 'evt-doj-louisville-minneapolis-dismissal-20250521' AND d.slug = 'doc-doj-louisville-minneapolis-release-20250521') OR
  (e.slug = 'evt-doj-seattle-support-20250723' AND d.slug = 'doc-doj-seattle-release-20250723') OR
  (e.slug = 'evt-doj-norfolk-termination-20250813' AND d.slug = 'doc-doj-norfolk-release-20250813')
)
ON CONFLICT (source_id, target_id, type) DO UPDATE SET
  weight = EXCLUDED.weight, label = EXCLUDED.label, metadata = EXCLUDED.metadata,
  similarity = NULL, sky_verified = false, signal_source = EXCLUDED.signal_source,
  doc_strength = EXCLUDED.doc_strength, claimed_by = EXCLUDED.claimed_by,
  stance = EXCLUDED.stance, disputed_by = EXCLUDED.disputed_by,
  alternative_causes = EXCLUDED.alternative_causes, counterfactual_test = NULL,
  reliability = EXCLUDED.reliability;

UPDATE public.story_arcs
SET seed_article_id = (
  SELECT id FROM public.articles
  WHERE url = 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and'
), last_update_at = now()
WHERE slug = 'doj-consent-actions-2025';

COMMIT;

-- Read-only postcondition check (expected: 3 articles, 8 nodes, 6 edges, 3 events).
SELECT
  (SELECT count(*) FROM public.articles WHERE ingestion_run_id = 'v2-doj-consent-actions-2026-08-18') AS seeded_articles,
  (SELECT count(*) FROM public.nodes WHERE metadata ->> 'manifest' = 'v2-doj-consent-actions-2026-08-18') AS seeded_nodes,
  (SELECT count(*) FROM public.edges WHERE metadata ->> 'manifest' = 'v2-doj-consent-actions-2026-08-18') AS seeded_edges,
  (SELECT count(*) FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'doj-consent-actions-2025')) AS seeded_arc_events
LIMIT 1;
