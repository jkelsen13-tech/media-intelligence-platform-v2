-- Manifest: v2-february-2026-general-news-2026-08-19
-- Scope: eight directly verified publisher records from February 2026 across seven
-- source-mapped policy-watch events. No article body copying, popularity metric,
-- composite confidence score, independence claim, causality claim, or policy outcome is asserted.
-- Rollback: delete rows with ingestion_run_id = 'v2-february-2026-general-news-2026-08-19'
-- and graph/event/explanation rows identified by the manifest or rule-version below.

BEGIN;

-- Remove derived comparison rows before deleting the current implementation's events.
DELETE FROM public.explanations
WHERE rule_version = 'sc-v1|v2-february-2026-general-news-2026-08-19';

DELETE FROM public.article_claims ac
USING public.claims c, public.events e
WHERE ac.claim_id = c.id
  AND c.event_id = e.id
  AND e.rule_version = 'v2-february-2026-general-news-2026-08-19';

DELETE FROM public.event_articles ea
USING public.events e
WHERE ea.event_id = e.id
  AND e.rule_version = 'v2-february-2026-general-news-2026-08-19';

DELETE FROM public.claims c
USING public.events e
WHERE c.event_id = e.id
  AND e.rule_version = 'v2-february-2026-general-news-2026-08-19';

DELETE FROM public.events
WHERE rule_version = 'v2-february-2026-general-news-2026-08-19';

DELETE FROM public.citations
WHERE article_id IN (
  SELECT id FROM public.articles
  WHERE ingestion_run_id = 'v2-february-2026-general-news-2026-08-19'
);

DELETE FROM public.sources
WHERE node_id IN (
  SELECT id FROM public.nodes
  WHERE metadata ->> 'manifest' = 'v2-february-2026-general-news-2026-08-19'
);

DELETE FROM public.edges
WHERE metadata ->> 'manifest' = 'v2-february-2026-general-news-2026-08-19';

DELETE FROM public.arc_events
WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
  AND title IN (
    'Bipartisan Policy Center published a child-care data overview',
    'NPR published reporting on U.S.-China foreign-policy context',
    'Courthouse News reported a Fifth Circuit detention ruling',
    'PBS NewsHour/AP published climate-regulation reporting',
    'SCOTUSblog reported a tariff ruling',
    'Pew Research Center published policy-survey context',
    'CIDRAP collaboration published a vaccine-policy explainer'
  );

-- Arc: a bounded reading and linking container, not a conclusion about the
-- relationship among the separate policy topics.
INSERT INTO public.story_arcs (
  slug, title, category, status, display_kind, coverage_gap, summary, started_at,
  category_confidence, category_evidence, title_article_count
)
VALUES (
  'february-2026-source-mapped-policy-watch',
  'February 2026 — source-mapped public-policy watch',
  'institutional_accountability',
  'active',
  'research_collection',
  true,
  'A bounded source-mapped set of directly reviewed February 2026 publisher records across separate public-policy subjects. Arc membership organizes access and chronology only; it does not establish causation, completeness, shared editorial lineage, or a common policy outcome.',
  DATE '2026-02-05',
  NULL,
  'Manual source-mapped grouping using direct publisher URLs. No composite score or causal determination.',
  8
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  display_kind = EXCLUDED.display_kind,
  coverage_gap = EXCLUDED.coverage_gap,
  summary = EXCLUDED.summary,
  started_at = EXCLUDED.started_at,
  category_confidence = NULL,
  category_evidence = EXCLUDED.category_evidence,
  title_article_count = EXCLUDED.title_article_count,
  last_update_at = now();

-- Graph nodes: an arc root, seven event records, and eight publisher-record documents.
INSERT INTO public.nodes (
  slug, label, type, description, metadata, confidence, summary, occurred_at, arc_id
)
VALUES
(
  'arc-february-2026-source-mapped-policy-watch',
  'February 2026 — source-mapped public-policy watch',
  'policy',
  'A bounded source-mapped index of directly reviewed February 2026 publisher records. It is an organizing container, not a finding that the linked topics caused or explain one another.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","scope":"source_mapped_general_policy_reporting","causal_claim":false}'::jsonb,
  NULL,
  'Source-mapped chronology container; separate reported developments remain distinct.',
  DATE '2026-02-05',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'evt-feb26-child-care-data-overview-20260205',
  'Bipartisan Policy Center published a child-care data overview',
  'event',
  'Source-mapped publication event for the Bipartisan Policy Center’s national and state child-care data overview.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","source_scope":"publisher_record","causal_claim":false}'::jsonb,
  NULL,
  'Publisher-record event only; the platform does not independently validate the data overview’s figures.',
  DATE '2026-02-05',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'evt-feb26-npr-us-china-foreign-policy-20260205',
  'NPR published reporting on U.S.-China foreign-policy context',
  'event',
  'Source-mapped publication event for NPR reporting on China’s assessment of U.S. foreign-policy shifts.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","source_scope":"publisher_reporting","causal_claim":false}'::jsonb,
  NULL,
  'Reporting record only; reported analysis and expert views are not platform findings.',
  DATE '2026-02-05',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'evt-feb26-fifth-circuit-detention-ruling-20260206',
  'Courthouse News reported a Fifth Circuit detention ruling',
  'event',
  'Source-mapped publication event for Courthouse News reporting on a Fifth Circuit panel decision concerning mandatory detention and bond hearings.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","source_scope":"court_reporting","causal_claim":false}'::jsonb,
  NULL,
  'Court-reporting record only; consult the linked source and ruling for authoritative legal text.',
  DATE '2026-02-06',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'evt-feb26-pbs-climate-regulation-reporting-20260210',
  'PBS NewsHour/AP published climate-regulation reporting',
  'event',
  'Source-mapped grouping of two PBS NewsHour/AP items concerning anticipated and later-announced federal climate-regulation action in February 2026.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","source_scope":"publisher_reporting","causal_claim":false,"lineage":"same_outlet_two_records"}'::jsonb,
  NULL,
  'Publisher-reporting group only; repeated coverage by one outlet is not independent corroboration.',
  DATE '2026-02-10',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'evt-feb26-scotus-tariff-ruling-20260220',
  'SCOTUSblog reported a tariff ruling',
  'event',
  'Source-mapped publication event for SCOTUSblog reporting on a Supreme Court ruling concerning IEEPA-based tariffs.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","source_scope":"court_reporting","causal_claim":false}'::jsonb,
  NULL,
  'Court-reporting record only; the source report links to the court opinion.',
  DATE '2026-02-20',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'evt-feb26-pew-policy-survey-context-20260223',
  'Pew Research Center published policy-survey context',
  'event',
  'Source-mapped publication event for a Pew Research Center article compiling recent survey context on policy issues ahead of the State of the Union.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","source_scope":"publisher_data_context","causal_claim":false}'::jsonb,
  NULL,
  'Survey-context publication only; the platform does not independently validate methods or findings.',
  DATE '2026-02-23',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'evt-feb26-cidrap-vaccine-policy-explainer-20260205',
  'CIDRAP collaboration published a vaccine-policy explainer',
  'event',
  'Source-mapped publication event for a CIDRAP/Unbiased Science collaboration describing federal and state vaccine-policy developments.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","source_scope":"publisher_explainer","causal_claim":false}'::jsonb,
  NULL,
  'Source-published explainer only; not used here as a medical conclusion or standalone policy-outcome record.',
  DATE '2026-02-05',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'doc-feb26-bpc-child-care-data-overview-20260205',
  'Bipartisan Policy Center: National and State Child Care Data Overview',
  'document',
  'Publisher page dated 2026-02-05.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","url":"https://bipartisanpolicy.org/article/state-child-care-data-2025-update/","source_type":"publisher_record"}'::jsonb,
  NULL, 'Direct publisher record.', DATE '2026-02-05',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'doc-feb26-npr-us-china-foreign-policy-20260205',
  'NPR: As Trump reshapes foreign policy, China moves to limit risks, reap gains',
  'document',
  'Publisher page dated 2026-02-05.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","url":"https://www.npr.org/2026/02/05/g-s1-108686/with-trump-reshaping-foreign-policy-china-moves-to-limit-risks-and-reap-gains","source_type":"publisher_reporting"}'::jsonb,
  NULL, 'Direct publisher record.', DATE '2026-02-05',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'doc-feb26-courthouse-fifth-circuit-detention-20260206',
  'Courthouse News: Fifth Circuit upholds Trump administration’s mandatory detention policy',
  'document',
  'Publisher page dated 2026-02-06.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","url":"https://www.courthousenews.com/fifth-circuit-upholds-trump-administrations-mandatory-detention-policy/","source_type":"court_reporting"}'::jsonb,
  NULL, 'Direct publisher record.', DATE '2026-02-06',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'doc-feb26-pbs-climate-expected-20260210',
  'PBS NewsHour/AP: Trump set to gut U.S. climate change policy and environmental regulations',
  'document',
  'Publisher page dated 2026-02-10.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","url":"https://www.pbs.org/newshour/politics/trump-set-to-gut-u-s-climate-change-policy-and-environmental-regulations-white-house-official-says","source_type":"publisher_reporting"}'::jsonb,
  NULL, 'Direct publisher record.', DATE '2026-02-10',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'doc-feb26-pbs-climate-announcement-20260212',
  'PBS NewsHour: WATCH: Trump, EPA’s Zeldin announce end of scientific basis for U.S. action on climate change',
  'document',
  'Publisher page dated 2026-02-12.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","url":"https://www.pbs.org/newshour/science/watch-live-trump-zeldin-to-announce-end-of-scientific-basis-for-u-s-action-on-climate-change","source_type":"publisher_reporting"}'::jsonb,
  NULL, 'Direct publisher record.', DATE '2026-02-12',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'doc-feb26-scotusblog-tariff-ruling-20260220',
  'SCOTUSblog: Supreme Court strikes down tariffs',
  'document',
  'Publisher page dated 2026-02-20.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","url":"https://www.scotusblog.com/2026/02/supreme-court-strikes-down-tariffs/","source_type":"court_reporting"}'::jsonb,
  NULL, 'Direct publisher record.', DATE '2026-02-20',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'doc-feb26-pew-policy-survey-context-20260223',
  'Pew Research Center: State of the Union 2026 policy context',
  'document',
  'Publisher page dated 2026-02-23.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","url":"https://www.pewresearch.org/short-reads/2026/02/23/state-of-the-union-2026-where-americans-stand-on-key-issues-facing-the-nation/","source_type":"publisher_data_context"}'::jsonb,
  NULL, 'Direct publisher record.', DATE '2026-02-23',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
),
(
  'doc-feb26-cidrap-vaccine-policy-explainer-20260205',
  'CIDRAP: The State of U.S. Vaccine Policy',
  'document',
  'Publisher page dated 2026-02-05.',
  '{"manifest":"v2-february-2026-general-news-2026-08-19","url":"https://www.cidrap.umn.edu/adult-non-flu-vaccines/state-us-vaccine-policy","source_type":"publisher_explainer"}'::jsonb,
  NULL, 'Direct publisher record.', DATE '2026-02-05',
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')
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

UPDATE public.story_arcs a
SET root_node_id = n.id, last_update_at = now()
FROM public.nodes n
WHERE a.slug = 'february-2026-source-mapped-policy-watch'
  AND n.slug = 'arc-february-2026-source-mapped-policy-watch';

-- News: eight direct-publisher metadata records. No article body is copied.
INSERT INTO public.articles (
  feed, outlet, title, url, summary, published_at, body_text, claims, arc_id,
  unattributed, monoculture, is_digest, entities_extracted_at, arc_assign_attempted_at,
  ingestion_run_id, source_status, source_status_note
)
VALUES
(
  'february-2026-source-mapped', 'Bipartisan Policy Center', 'National and State Child Care Data Overview',
  'https://bipartisanpolicy.org/article/state-child-care-data-2025-update/',
  'Source-published policy-data overview dated 2026-02-05. This metadata record attributes the overview to the publisher and does not independently validate its figures.',
  TIMESTAMPTZ '2026-02-05 00:00:00+00', 'Direct publisher metadata record; consult the source URL for the full page.', '[]'::jsonb,
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch'), false, false, false, now(), now(),
  'v2-february-2026-general-news-2026-08-19', 'active', 'Direct publisher URL reviewed. Source-published data overview; no independent data validation or source-lineage claim.'
),
(
  'february-2026-source-mapped', 'NPR', 'As Trump reshapes foreign policy, China moves to limit risks, reap gains',
  'https://www.npr.org/2026/02/05/g-s1-108686/with-trump-reshaping-foreign-policy-china-moves-to-limit-risks-and-reap-gains',
  'Source-published NPR reporting dated 2026-02-05. This metadata record preserves attribution and a direct URL; reported analysis and expert views are not platform findings.',
  TIMESTAMPTZ '2026-02-05 00:00:00+00', 'Direct publisher metadata record; consult the source URL for the full reporting.', '[]'::jsonb,
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch'), false, false, false, now(), now(),
  'v2-february-2026-general-news-2026-08-19', 'active', 'Direct publisher URL reviewed. No source-independence or causal conclusion is asserted.'
),
(
  'february-2026-source-mapped', 'CIDRAP', 'The State of U.S. Vaccine Policy',
  'https://www.cidrap.umn.edu/adult-non-flu-vaccines/state-us-vaccine-policy',
  'Source-published explainer dated 2026-02-05. This record labels the page as a CIDRAP/Unbiased Science collaboration and does not use it as a medical conclusion or standalone policy-outcome record.',
  TIMESTAMPTZ '2026-02-05 00:00:00+00', 'Direct publisher metadata record; consult the source URL for the full explainer.', '[]'::jsonb,
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch'), false, false, false, now(), now(),
  'v2-february-2026-general-news-2026-08-19', 'active', 'Direct publisher URL reviewed. Collaboration and explainer status retained explicitly.'
),
(
  'february-2026-source-mapped', 'Courthouse News', 'Fifth Circuit upholds Trump administration''s mandatory detention policy',
  'https://www.courthousenews.com/fifth-circuit-upholds-trump-administrations-mandatory-detention-policy/',
  'Source-published court reporting dated 2026-02-06. This record attributes the report to Courthouse News and directs readers to the linked reporting and underlying court materials.',
  TIMESTAMPTZ '2026-02-06 00:00:00+00', 'Direct publisher metadata record; consult the source URL and court materials for authoritative legal text.', '[]'::jsonb,
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch'), false, false, false, now(), now(),
  'v2-february-2026-general-news-2026-08-19', 'active', 'Direct publisher URL reviewed. Reporting record is not legal advice or an independent legal determination.'
),
(
  'february-2026-source-mapped', 'PBS', 'Trump set to gut U.S. climate change policy and environmental regulations, White House official says',
  'https://www.pbs.org/newshour/politics/trump-set-to-gut-u-s-climate-change-policy-and-environmental-regulations-white-house-official-says',
  'PBS NewsHour published AP-attributed reporting dated 2026-02-10 about expected federal climate-regulation action. The expectation is retained as a reported expectation, not a completed-action finding.',
  TIMESTAMPTZ '2026-02-10 00:00:00+00', 'Direct publisher metadata record; consult the source URL for the full reporting.', '[]'::jsonb,
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch'), false, false, false, now(), now(),
  'v2-february-2026-general-news-2026-08-19', 'active', 'Direct publisher URL reviewed. AP attribution and expected-action framing retained.'
),
(
  'february-2026-source-mapped', 'PBS', 'WATCH: Trump, EPA''s Zeldin announce end of scientific basis for U.S. action on climate change',
  'https://www.pbs.org/newshour/science/watch-live-trump-zeldin-to-announce-end-of-scientific-basis-for-u-s-action-on-climate-change',
  'Source-published PBS NewsHour item dated 2026-02-12. This metadata record preserves attribution and direct source access without converting the coverage into an independent platform finding.',
  TIMESTAMPTZ '2026-02-12 00:00:00+00', 'Direct publisher metadata record; consult the source URL for the full page.', '[]'::jsonb,
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch'), false, false, false, now(), now(),
  'v2-february-2026-general-news-2026-08-19', 'active', 'Direct publisher URL reviewed. Same-outlet coverage is not independent corroboration.'
),
(
  'february-2026-source-mapped', 'SCOTUSblog', 'Supreme Court strikes down tariffs',
  'https://www.scotusblog.com/2026/02/supreme-court-strikes-down-tariffs/',
  'Source-published court reporting dated 2026-02-20. This record attributes the reported ruling description to SCOTUSblog and retains direct access to the linked source and court-opinion link.',
  TIMESTAMPTZ '2026-02-20 00:00:00+00', 'Direct publisher metadata record; consult the source URL and court opinion for authoritative legal text.', '[]'::jsonb,
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch'), false, false, false, now(), now(),
  'v2-february-2026-general-news-2026-08-19', 'active', 'Direct publisher URL reviewed. Reporting record is not legal advice or an independent legal determination.'
),
(
  'february-2026-source-mapped', 'Pew Research Center', 'State of the Union 2026: Where Americans stand on key issues facing the nation',
  'https://www.pewresearch.org/short-reads/2026/02/23/state-of-the-union-2026-where-americans-stand-on-key-issues-facing-the-nation/',
  'Source-published survey-context article dated 2026-02-23. This metadata record attributes the page to Pew Research Center and does not independently validate the survey methods or findings.',
  TIMESTAMPTZ '2026-02-23 00:00:00+00', 'Direct publisher metadata record; consult the source URL for the full article and methodology links.', '[]'::jsonb,
  (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch'), false, false, false, now(), now(),
  'v2-february-2026-general-news-2026-08-19', 'active', 'Direct publisher URL reviewed. Survey context is source-attributed only.'
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

-- A plain source row and citation map connect each News article to its event
-- node. The required documentation field is set only to mark a direct mapping;
-- it is not a composite confidence or reliability score and is suppressed as a
-- percentage in the interface for this citation type.
INSERT INTO public.sources (node_id, outlet, headline, url, published_at)
SELECT n.id, a.outlet, a.title, a.url, a.published_at::date
FROM public.articles a
JOIN public.nodes n ON n.slug = CASE a.url
  WHEN 'https://bipartisanpolicy.org/article/state-child-care-data-2025-update/' THEN 'evt-feb26-child-care-data-overview-20260205'
  WHEN 'https://www.npr.org/2026/02/05/g-s1-108686/with-trump-reshaping-foreign-policy-china-moves-to-limit-risks-and-reap-gains' THEN 'evt-feb26-npr-us-china-foreign-policy-20260205'
  WHEN 'https://www.cidrap.umn.edu/adult-non-flu-vaccines/state-us-vaccine-policy' THEN 'evt-feb26-cidrap-vaccine-policy-explainer-20260205'
  WHEN 'https://www.courthousenews.com/fifth-circuit-upholds-trump-administrations-mandatory-detention-policy/' THEN 'evt-feb26-fifth-circuit-detention-ruling-20260206'
  WHEN 'https://www.pbs.org/newshour/politics/trump-set-to-gut-u-s-climate-change-policy-and-environmental-regulations-white-house-official-says' THEN 'evt-feb26-pbs-climate-regulation-reporting-20260210'
  WHEN 'https://www.pbs.org/newshour/science/watch-live-trump-zeldin-to-announce-end-of-scientific-basis-for-u-s-action-on-climate-change' THEN 'evt-feb26-pbs-climate-regulation-reporting-20260210'
  WHEN 'https://www.scotusblog.com/2026/02/supreme-court-strikes-down-tariffs/' THEN 'evt-feb26-scotus-tariff-ruling-20260220'
  WHEN 'https://www.pewresearch.org/short-reads/2026/02/23/state-of-the-union-2026-where-americans-stand-on-key-issues-facing-the-nation/' THEN 'evt-feb26-pew-policy-survey-context-20260223'
END
WHERE a.ingestion_run_id = 'v2-february-2026-general-news-2026-08-19';

INSERT INTO public.citations (article_id, cited_entity, cited_type, documentation_strength, resolved_node_id)
SELECT a.id, 'Source-mapped event: ' || n.label, 'other', 1.0, n.id
FROM public.articles a
JOIN public.nodes n ON n.slug = CASE a.url
  WHEN 'https://bipartisanpolicy.org/article/state-child-care-data-2025-update/' THEN 'evt-feb26-child-care-data-overview-20260205'
  WHEN 'https://www.npr.org/2026/02/05/g-s1-108686/with-trump-reshaping-foreign-policy-china-moves-to-limit-risks-and-reap-gains' THEN 'evt-feb26-npr-us-china-foreign-policy-20260205'
  WHEN 'https://www.cidrap.umn.edu/adult-non-flu-vaccines/state-us-vaccine-policy' THEN 'evt-feb26-cidrap-vaccine-policy-explainer-20260205'
  WHEN 'https://www.courthousenews.com/fifth-circuit-upholds-trump-administrations-mandatory-detention-policy/' THEN 'evt-feb26-fifth-circuit-detention-ruling-20260206'
  WHEN 'https://www.pbs.org/newshour/politics/trump-set-to-gut-u-s-climate-change-policy-and-environmental-regulations-white-house-official-says' THEN 'evt-feb26-pbs-climate-regulation-reporting-20260210'
  WHEN 'https://www.pbs.org/newshour/science/watch-live-trump-zeldin-to-announce-end-of-scientific-basis-for-u-s-action-on-climate-change' THEN 'evt-feb26-pbs-climate-regulation-reporting-20260210'
  WHEN 'https://www.scotusblog.com/2026/02/supreme-court-strikes-down-tariffs/' THEN 'evt-feb26-scotus-tariff-ruling-20260220'
  WHEN 'https://www.pewresearch.org/short-reads/2026/02/23/state-of-the-union-2026-where-americans-stand-on-key-issues-facing-the-nation/' THEN 'evt-feb26-pew-policy-survey-context-20260223'
END
WHERE a.ingestion_run_id = 'v2-february-2026-general-news-2026-08-19';

-- Every graph edge is documentary and non-causal: the root organizes source
-- records; each event links to exactly the publisher document that supports it.
INSERT INTO public.edges (
  source_id, target_id, type, weight, label, metadata, similarity, sky_verified,
  signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes,
  counterfactual_test, reliability
)
SELECT root.id, event.id, 'documentary', 'light', 'documented in source-mapped arc',
  jsonb_build_object('manifest', 'v2-february-2026-general-news-2026-08-19', 'relationship_scope', 'tracking_membership', 'causal_claim', false),
  NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1
FROM public.nodes root
JOIN public.nodes event ON event.slug IN (
  'evt-feb26-child-care-data-overview-20260205',
  'evt-feb26-npr-us-china-foreign-policy-20260205',
  'evt-feb26-fifth-circuit-detention-ruling-20260206',
  'evt-feb26-pbs-climate-regulation-reporting-20260210',
  'evt-feb26-scotus-tariff-ruling-20260220',
  'evt-feb26-pew-policy-survey-context-20260223',
  'evt-feb26-cidrap-vaccine-policy-explainer-20260205'
)
WHERE root.slug = 'arc-february-2026-source-mapped-policy-watch'
UNION ALL
SELECT event.id, doc.id, 'documentary', 'medium', 'documentary: publisher record',
  jsonb_build_object('manifest', 'v2-february-2026-general-news-2026-08-19', 'relationship_scope', 'publisher_record_link', 'causal_claim', false),
  NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1
FROM public.nodes event
JOIN public.nodes doc ON (event.slug, doc.slug) IN (
  ('evt-feb26-child-care-data-overview-20260205', 'doc-feb26-bpc-child-care-data-overview-20260205'),
  ('evt-feb26-npr-us-china-foreign-policy-20260205', 'doc-feb26-npr-us-china-foreign-policy-20260205'),
  ('evt-feb26-fifth-circuit-detention-ruling-20260206', 'doc-feb26-courthouse-fifth-circuit-detention-20260206'),
  ('evt-feb26-pbs-climate-regulation-reporting-20260210', 'doc-feb26-pbs-climate-expected-20260210'),
  ('evt-feb26-pbs-climate-regulation-reporting-20260210', 'doc-feb26-pbs-climate-announcement-20260212'),
  ('evt-feb26-scotus-tariff-ruling-20260220', 'doc-feb26-scotusblog-tariff-ruling-20260220'),
  ('evt-feb26-pew-policy-survey-context-20260223', 'doc-feb26-pew-policy-survey-context-20260223'),
  ('evt-feb26-cidrap-vaccine-policy-explainer-20260205', 'doc-feb26-cidrap-vaccine-policy-explainer-20260205')
)
ON CONFLICT (source_id, target_id, type) DO UPDATE SET
  weight = EXCLUDED.weight, label = EXCLUDED.label, metadata = EXCLUDED.metadata,
  similarity = NULL, sky_verified = false, signal_source = EXCLUDED.signal_source,
  doc_strength = EXCLUDED.doc_strength, claimed_by = EXCLUDED.claimed_by,
  stance = EXCLUDED.stance, disputed_by = EXCLUDED.disputed_by,
  alternative_causes = EXCLUDED.alternative_causes, counterfactual_test = NULL,
  reliability = EXCLUDED.reliability;

-- Story Arc overview and Timeline share these date-bounded records. The
-- confidence marks a confirmed source record, not confirmation of all content.
INSERT INTO public.arc_events (arc_id, title, category, confidence, occurred_at, description)
SELECT a.id, v.title, 'accountability', 'confirmed', v.occurred_at, v.description
FROM public.story_arcs a
CROSS JOIN (
  VALUES
    ('Bipartisan Policy Center published a child-care data overview', DATE '2026-02-05', 'Source-published policy-data overview only; no independent data validation is asserted.'),
    ('NPR published reporting on U.S.-China foreign-policy context', DATE '2026-02-05', 'Source-published reporting only; reported analysis and expert views remain attributed to the source.'),
    ('CIDRAP collaboration published a vaccine-policy explainer', DATE '2026-02-05', 'Source-published explainer only; not used here as medical guidance or an outcome record.'),
    ('Courthouse News reported a Fifth Circuit detention ruling', DATE '2026-02-06', 'Court-reporting source record only; consult the linked reporting and court materials for legal text.'),
    ('PBS NewsHour/AP published climate-regulation reporting', DATE '2026-02-10', 'Same-outlet reporting group; the expected-action article and later coverage are distinct records, not independent corroboration.'),
    ('SCOTUSblog reported a tariff ruling', DATE '2026-02-20', 'Court-reporting source record only; consult the linked source and court opinion for legal text.'),
    ('Pew Research Center published policy-survey context', DATE '2026-02-23', 'Survey-context publication only; methods and findings are not independently validated by the platform.')
) AS v(title, occurred_at, description)
WHERE a.slug = 'february-2026-source-mapped-policy-watch';

-- Source Comparison: one event per source-mapped development. No event is
-- marked as independently corroborated; the PBS group explicitly remains
-- single-outlet coverage.
INSERT INTO public.events (
  canonical_title, occurred_at_start, occurred_at_end, location_text,
  arc_id, arc_event_id, status, rule_version
)
SELECT v.title, v.occurred_at, v.occurred_at, NULL, a.id,
  (SELECT id FROM public.arc_events ae WHERE ae.arc_id = a.id AND ae.title = v.title ORDER BY ae.id DESC LIMIT 1),
  'active', 'v2-february-2026-general-news-2026-08-19'
FROM public.story_arcs a
CROSS JOIN (
  VALUES
    ('Bipartisan Policy Center published a child-care data overview', DATE '2026-02-05'),
    ('NPR published reporting on U.S.-China foreign-policy context', DATE '2026-02-05'),
    ('CIDRAP collaboration published a vaccine-policy explainer', DATE '2026-02-05'),
    ('Courthouse News reported a Fifth Circuit detention ruling', DATE '2026-02-06'),
    ('PBS NewsHour/AP published climate-regulation reporting', DATE '2026-02-10'),
    ('SCOTUSblog reported a tariff ruling', DATE '2026-02-20'),
    ('Pew Research Center published policy-survey context', DATE '2026-02-23')
) AS v(title, occurred_at)
WHERE a.slug = 'february-2026-source-mapped-policy-watch';

INSERT INTO public.claims (event_id, canonical_text, claim_kind, thin_extraction, status, rule_version)
SELECT e.id,
  'A directly reviewed publisher record is mapped to this event. The displayed text is source-attributed metadata and does not establish independent corroboration, causality, or a broader policy outcome.',
  'fact', false, 'active', 'v2-february-2026-general-news-2026-08-19'
FROM public.events e
WHERE e.rule_version = 'v2-february-2026-general-news-2026-08-19';

INSERT INTO public.event_articles (event_id, article_id, membership_method, membership_confidence)
SELECT e.id, a.id, 'manual_curated_report', 1.0
FROM public.events e
JOIN public.articles a ON a.url = CASE e.canonical_title
  WHEN 'Bipartisan Policy Center published a child-care data overview' THEN 'https://bipartisanpolicy.org/article/state-child-care-data-2025-update/'
  WHEN 'NPR published reporting on U.S.-China foreign-policy context' THEN 'https://www.npr.org/2026/02/05/g-s1-108686/with-trump-reshaping-foreign-policy-china-moves-to-limit-risks-and-reap-gains'
  WHEN 'CIDRAP collaboration published a vaccine-policy explainer' THEN 'https://www.cidrap.umn.edu/adult-non-flu-vaccines/state-us-vaccine-policy'
  WHEN 'Courthouse News reported a Fifth Circuit detention ruling' THEN 'https://www.courthousenews.com/fifth-circuit-upholds-trump-administrations-mandatory-detention-policy/'
  WHEN 'SCOTUSblog reported a tariff ruling' THEN 'https://www.scotusblog.com/2026/02/supreme-court-strikes-down-tariffs/'
  WHEN 'Pew Research Center published policy-survey context' THEN 'https://www.pewresearch.org/short-reads/2026/02/23/state-of-the-union-2026-where-americans-stand-on-key-issues-facing-the-nation/'
END
WHERE e.rule_version = 'v2-february-2026-general-news-2026-08-19'
UNION ALL
SELECT e.id, a.id, 'manual_curated_report', 1.0
FROM public.events e
JOIN public.articles a ON a.url IN (
  'https://www.pbs.org/newshour/politics/trump-set-to-gut-u-s-climate-change-policy-and-environmental-regulations-white-house-official-says',
  'https://www.pbs.org/newshour/science/watch-live-trump-zeldin-to-announce-end-of-scientific-basis-for-u-s-action-on-climate-change'
)
WHERE e.canonical_title = 'PBS NewsHour/AP published climate-regulation reporting'
  AND e.rule_version = 'v2-february-2026-general-news-2026-08-19';

INSERT INTO public.article_claims (
  claim_id, article_id, surface_text, char_start, char_end, extraction_method,
  extraction_confidence, stance, loaded_language, version, is_current
)
SELECT c.id, ea.article_id, c.canonical_text, NULL, NULL,
  'manual_curated_report', 1.0, 'asserts', '[]'::jsonb, 1, true
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.event_articles ea ON ea.event_id = e.id
WHERE c.rule_version = 'v2-february-2026-general-news-2026-08-19';

INSERT INTO public.explanations (
  assertion_id, assertion_type, version, is_current, source_ids, archived_sources,
  source_roles, supporting_passage, contradicting_evidence, missing_evidence,
  shared_entities, relationship_type, rule_version, provenance_class, recomputed_at,
  reviewed_at, review_status, falsification_condition, correction_history,
  remaining_uncertainty, state
)
SELECT
  'sc:claim_grouping:' || c.id::text || ':' || a.id::text,
  'claim_grouping', 1, true, ARRAY[a.id], '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('article_id', a.id::text, 'role', 'source_published_record', 'outlet', a.outlet)),
  c.canonical_text,
  '[]'::jsonb,
  jsonb_build_array('Independent-source, source-lineage, causal, and policy-outcome determinations are not recorded for this mapped publisher item.'),
  ARRAY[]::uuid[], 'n/a', 'sc-v1|v2-february-2026-general-news-2026-08-19',
  'human_authored', now(), now(), 'draft',
  'Replace or correct this explanation if the publisher record is corrected, withdrawn, or shown not to support the displayed source-attributed metadata.',
  '[]'::jsonb,
  CASE WHEN a.outlet = 'PBS' THEN 'Two mapped PBS records are same-outlet coverage and are not independent corroboration.' ELSE 'This event currently maps one publisher record; no comparison, source independence, or platform conclusion is asserted.' END,
  'ok'
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.article_claims ac ON ac.claim_id = c.id AND ac.is_current = true
JOIN public.articles a ON a.id = ac.article_id
WHERE c.rule_version = 'v2-february-2026-general-news-2026-08-19';

UPDATE public.story_arcs
SET seed_article_id = (
  SELECT id FROM public.articles
  WHERE url = 'https://www.courthousenews.com/fifth-circuit-upholds-trump-administrations-mandatory-detention-policy/'
), last_update_at = now()
WHERE slug = 'february-2026-source-mapped-policy-watch';

COMMIT;

SELECT
  (SELECT count(*)::int FROM public.articles WHERE ingestion_run_id = 'v2-february-2026-general-news-2026-08-19') AS seeded_articles,
  (SELECT count(*)::int FROM public.nodes WHERE metadata ->> 'manifest' = 'v2-february-2026-general-news-2026-08-19') AS seeded_nodes,
  (SELECT count(*)::int FROM public.edges WHERE metadata ->> 'manifest' = 'v2-february-2026-general-news-2026-08-19') AS seeded_edges,
  (SELECT count(*)::int FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'february-2026-source-mapped-policy-watch')) AS seeded_arc_events,
  (SELECT count(*)::int FROM public.events WHERE rule_version = 'v2-february-2026-general-news-2026-08-19') AS seeded_comparison_events,
  (SELECT count(*)::int FROM public.citations c JOIN public.articles a ON a.id = c.article_id WHERE a.ingestion_run_id = 'v2-february-2026-general-news-2026-08-19') AS seeded_article_graph_links
LIMIT 1;
