-- Isolated v2 only — privacy-safe Epstein Files Transparency Act process expansion.
-- Manifest: v2-epstein-process-cross-surface-2026-08-19
-- Hard boundary: no released-file contents, file names, names drawn from materials, victim data,
-- person-level allegations, images, audio, videos, case facts, or links to underlying files.
-- This seed retains statute, process, aggregate count, redaction, court-process, library-status,
-- congressional-oversight, and OIG-oversight metadata only.

BEGIN;

-- Refresh only the previously scoped compliance tracker events.
DELETE FROM public.p3_policy_track_event
WHERE policy_id = (SELECT id FROM public.p3_policy WHERE name = 'Epstein Files Transparency Act — disclosure-process compliance')
  AND method_version IN ('epstein-compliance-process-v1', 'epstein-compliance-process-v2');

INSERT INTO public.p3_policy (
  name, jurisdiction, instrument_type, description, review_status, agency, source_locator
)
SELECT
  'Epstein Files Transparency Act — disclosure-process compliance',
  'US Federal',
  'statutory compliance tracker',
  'Closed-curated tracker for statute, public administrative process, aggregate production metadata, redaction safeguards, court-process references, congressional oversight, and independent oversight only. It does not ingest, index, store, quote, search, or link to underlying released files; it does not make person-level allegations or findings.',
  'draft', 'DOJ',
  jsonb_build_object(
    'chapter', 0, 'pages', 'Public Law 119-38', 'edition', '2025-11-19',
    'chapter_title', 'Congress.gov official legislative record',
    'url', 'https://www.congress.gov/bill/119th-congress/house-bill/4405/text',
    'scope', 'process metadata only'
  )
WHERE NOT EXISTS (SELECT 1 FROM public.p3_policy WHERE name = 'Epstein Files Transparency Act — disclosure-process compliance');

INSERT INTO public.p3_policy_track_event (
  policy_id, track, state, event_date, source_passage, method_version,
  remaining_uncertainty, missing_evidence, review_status, source_locator
)
SELECT
  p.id, x.track, x.state, x.event_date, x.source_passage, 'epstein-compliance-process-v2',
  x.remaining_uncertainty, false, 'draft', x.source_locator
FROM public.p3_policy p
CROSS JOIN (
  VALUES
    (
      'stated_objective', 'became_law', DATE '2025-11-19',
      'Congress.gov identifies H.R. 4405 as Public Law 119-38 and records that the bill became law on November 19, 2025.',
      'This tracker records the statutory milestone and high-level process obligation only; it does not enumerate, summarize, or link to underlying materials.',
      jsonb_build_object('url', 'https://www.congress.gov/bill/119th-congress/house-bill/4405/all-info', 'source_type', 'official_legislative_record', 'scope', 'statute metadata only')
    ),
    (
      'actual_outcome', 'doj_aggregate_release_statement', DATE '2026-01-30',
      'DOJ stated that it published over 3 million additional responsive pages and that the aggregate production was nearly 3.5 million pages.',
      'This is an attributed DOJ process statement, not an independent conclusion that statutory obligations are complete. The tracker retains aggregate counts only and never accesses or stores the underlying materials.',
      jsonb_build_object('url', 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files', 'source_type', 'official_agency_statement', 'scope', 'aggregate release metadata only')
    ),
    (
      'actual_outcome', 'court_order_redaction_process_statement', DATE '2026-01-30',
      'DOJ stated that USAO-SDNY used an additional review protocol to comply with a court order regarding unredacted victim-identifying information.',
      'This is an attributed DOJ process statement about a safeguard. The tracker retains neither court filings nor any protected or identifying information.',
      jsonb_build_object('url', 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files', 'source_type', 'official_agency_statement', 'scope', 'court-process and redaction-safeguard metadata only')
    ),
    (
      'actual_outcome', 'congressional_oversight_hearing_scheduled', DATE '2026-02-11',
      'The House Judiciary Committee scheduled an oversight hearing concerning the mission and programs of the Department of Justice.',
      'This is a hearing-scheduling record only. It does not attribute testimony, assess compliance, or represent any unreviewed hearing material.',
      jsonb_build_object('url', 'https://judiciary.house.gov/committee-activity/hearings/oversight-us-department-justice-5', 'source_type', 'official_congressional_hearing_page', 'scope', 'scheduling metadata only')
    ),
    (
      'actual_outcome', 'section3_report_link_indexed_unreviewed', DATE '2026-02-14',
      'An official DOJ URL is indexed as an Epstein Files Transparency Act Section 3 Report to Congress.',
      'The report content could not be directly reviewed in this environment because the document endpoint was access-restricted. This entry establishes only that the official report link was identified; it makes no claim about the report contents.',
      jsonb_build_object('url', 'https://www.justice.gov/opa/media/1434856/dl?inline', 'source_type', 'official_report_link_unreviewed', 'scope', 'link metadata only')
    ),
    (
      'actual_outcome', 'oig_audit_open', DATE '2026-04-23',
      'DOJ OIG stated that it initiated an audit of DOJ processes for identification, redaction, withholding, release, and post-release matters under the Act.',
      'The audit is ongoing. No compliance conclusion, finding, or underlying-file information is inferred or represented.',
      jsonb_build_object('url', 'https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act', 'source_type', 'official_oversight_record', 'scope', 'audit-initiation metadata only')
    ),
    (
      'actual_outcome', 'library_update_and_privacy_notice', DATE '2026-07-17',
      'DOJ’s Epstein Library landing page said it would be updated if additional documents were identified for release, displayed a July 17, 2026 update date, and described redaction and search-functionality limitations.',
      'This is a library-status and privacy-process notice. No library contents, file links, identities, allegations, imagery, audio, or other material are ingested.',
      jsonb_build_object('url', 'https://www.justice.gov/epstein', 'source_type', 'official_library_landing_page', 'scope', 'library status and privacy notice only')
    ),
    (
      'actual_outcome', 'disclosure_index_and_redaction_notice', DATE '2026-08-19',
      'The DOJ Disclosures index listed Data Sets 1 through 12 and described DOJ-applied and pre-existing redaction safeguards, including protections arising from applicable law, regulations, and court orders.',
      'This is an index-and-redaction-process notice only. The tracker does not retain data-set contents, underlying record links, case titles, names, allegations, or protected information.',
      jsonb_build_object('url', 'https://www.justice.gov/epstein/doj-disclosures', 'source_type', 'official_disclosure_index', 'scope', 'data-set count and redaction-process metadata only')
    )
) AS x(track, state, event_date, source_passage, remaining_uncertainty, source_locator)
WHERE p.name = 'Epstein Files Transparency Act — disclosure-process compliance';

-- Story-arc and graph records: process-only actors, events, and source documents.
INSERT INTO public.story_arcs (slug, title, category, status, coverage_gap, summary, started_at, category_confidence, category_evidence, title_article_count)
VALUES (
  'epstein-files-act-process-oversight',
  'Epstein Files Transparency Act — process, safeguards, and oversight',
  'institutional_accountability', 'active', true,
  'A privacy-safe source-mapped record of statutory, aggregate-release, redaction-process, court-process, congressional-oversight, and OIG-oversight milestones. It contains no underlying file content or person-level material.',
  DATE '2025-11-19', NULL, 'Manual process-only grouping. No compliance score, content analysis, or person-level conclusion.', 6
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, category = EXCLUDED.category, status = EXCLUDED.status, coverage_gap = EXCLUDED.coverage_gap,
  summary = EXCLUDED.summary, started_at = EXCLUDED.started_at, category_confidence = NULL,
  category_evidence = EXCLUDED.category_evidence, title_article_count = EXCLUDED.title_article_count, last_update_at = now();

INSERT INTO public.nodes (slug, label, type, description, metadata, confidence, summary, occurred_at, arc_id)
VALUES
  (
    'arc-epstein-files-act-process-oversight',
    'Epstein Files Transparency Act — process, safeguards, and oversight', 'policy',
    'Privacy-safe process tracker. This grouping excludes file content, names drawn from underlying materials, victim data, person-level allegations, images, audio, and video.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"process_only","content_ingestion":false,"person_level_data":false}'::jsonb,
    NULL, 'Process-only record; no compliance conclusion.', DATE '2025-11-19',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'evt-efta-public-law-119-38-20251119',
    'Public Law 119-38 enactment recorded', 'event',
    'Congress.gov records enactment of the Epstein Files Transparency Act as Public Law 119-38.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"statute_metadata_only"}'::jsonb,
    NULL, 'Statutory milestone only.', DATE '2025-11-19',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'doc-efta-public-law-119-38',
    'Congress.gov legislative record: Public Law 119-38', 'document',
    'Official legislative record used only for statute metadata.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","source_type":"official_legislative_record"}'::jsonb,
    NULL, 'Official legislative record.', DATE '2025-11-19',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'evt-efta-doj-aggregate-release-20260130',
    'DOJ issued aggregate release-process statement', 'event',
    'DOJ stated aggregate responsive-page production figures in a public release statement.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"aggregate_metadata_only"}'::jsonb,
    NULL, 'Attributed DOJ aggregate-process statement only.', DATE '2026-01-30',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'doc-efta-doj-aggregate-release-20260130',
    'DOJ process statement: aggregate responsive-page publication', 'document',
    'Official DOJ process statement retained only as aggregate metadata.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","source_type":"official_agency_statement"}'::jsonb,
    NULL, 'Official DOJ source; aggregate metadata only.', DATE '2026-01-30',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'evt-efta-court-order-redaction-process-20260130',
    'DOJ stated a court-order-related redaction review protocol', 'event',
    'DOJ stated that a component used an additional review protocol to comply with a court order concerning protected identifying information.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"court_process_and_redaction_metadata_only"}'::jsonb,
    NULL, 'Attributed DOJ court-process safeguard statement only.', DATE '2026-01-30',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'evt-efta-house-doj-oversight-20260211',
    'House Judiciary DOJ oversight hearing scheduled', 'event',
    'Official House Judiciary hearing page recorded a DOJ oversight hearing date and witness.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"hearing_schedule_only"}'::jsonb,
    NULL, 'Congressional-oversight schedule only.', DATE '2026-02-11',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'doc-efta-house-doj-oversight-20260211',
    'House Judiciary hearing page: Oversight of the U.S. Department of Justice', 'document',
    'Official hearing schedule page retained without testimony or hearing-content assertions.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","source_type":"official_congressional_hearing_page"}'::jsonb,
    NULL, 'Official congressional schedule page.', DATE '2026-02-11',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'evt-efta-oig-audit-open-20260423',
    'DOJ OIG audit initiation announced', 'event',
    'DOJ OIG stated that it opened an audit of Department process compliance under the Act.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"audit_initiation_only"}'::jsonb,
    NULL, 'Audit initiation only; no outcome finding.', DATE '2026-04-23',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'doc-efta-oig-audit-open-20260423',
    'DOJ OIG audit notice', 'document',
    'Official OIG audit initiation notice.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","source_type":"official_oversight_record"}'::jsonb,
    NULL, 'Official OIG oversight record.', DATE '2026-04-23',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'evt-efta-library-privacy-update-20260717',
    'DOJ library posted update and privacy-process notice', 'event',
    'DOJ library landing page provided update, privacy, redaction, and search-limitations notices.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"library_status_privacy_notice_only"}'::jsonb,
    NULL, 'Library process notice only; no underlying materials.', DATE '2026-07-17',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'doc-efta-library-privacy-update-20260717',
    'DOJ Epstein Library landing-page process notice', 'document',
    'Official DOJ landing page retained for library-status and privacy-process wording only.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","source_type":"official_library_landing_page"}'::jsonb,
    NULL, 'Official DOJ library landing page.', DATE '2026-07-17',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'evt-efta-disclosure-index-20260819',
    'DOJ disclosure index documented redaction-process notice', 'event',
    'DOJ disclosure index displayed data-set count and high-level redaction-process notices, including court-order references.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"index_and_redaction_process_only"}'::jsonb,
    NULL, 'Index and redaction-process notice only.', DATE '2026-08-19',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  ),
  (
    'doc-efta-disclosure-index-20260819',
    'DOJ Disclosures index and redaction-process notice', 'document',
    'Official DOJ index retained only for data-set count and high-level redaction/court-process notices.',
    '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","source_type":"official_disclosure_index"}'::jsonb,
    NULL, 'Official DOJ disclosure index; no linked material.', DATE '2026-08-19',
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label, type = EXCLUDED.type, description = EXCLUDED.description, metadata = EXCLUDED.metadata,
  confidence = NULL, summary = EXCLUDED.summary, occurred_at = EXCLUDED.occurred_at, arc_id = EXCLUDED.arc_id, updated_at = now();

UPDATE public.story_arcs a
SET root_node_id = n.id, last_update_at = now()
FROM public.nodes n
WHERE a.slug = 'epstein-files-act-process-oversight'
  AND n.slug = 'arc-epstein-files-act-process-oversight';

INSERT INTO public.articles (
  feed, outlet, title, url, summary, published_at, body_text, claims, arc_id,
  unattributed, monoculture, is_digest, entities_extracted_at, arc_assign_attempted_at,
  ingestion_run_id, source_status, source_status_note
)
VALUES
  (
    'epstein-process-only', 'Congress.gov', 'Congress.gov records enactment of Public Law 119-38',
    'https://www.congress.gov/bill/119th-congress/house-bill/4405/all-info',
    'Statute metadata record for the Epstein Files Transparency Act; no underlying materials are represented.',
    TIMESTAMPTZ '2025-11-19 00:00:00+00',
    'Process-only source record. Consult the official legislative page for statutory text and status.', '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    false, false, false, now(), now(), 'v2-epstein-process-cross-surface-2026-08-19', 'active',
    'Official legislative record. Process metadata only; no underlying content represented.'
  ),
  (
    'epstein-process-only', 'U.S. Department of Justice', 'DOJ issues aggregate release-process statement',
    'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files',
    'Attributed aggregate responsive-page production statement; no underlying materials are represented.',
    TIMESTAMPTZ '2026-01-30 00:00:00+00',
    'Process-only source record. Consult the official DOJ statement for aggregate release metadata.', '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    false, false, false, now(), now(), 'v2-epstein-process-cross-surface-2026-08-19', 'active',
    'Official agency statement. Aggregate count metadata only; no underlying content represented.'
  ),
  (
    'epstein-process-only', 'House Judiciary Committee', 'House Judiciary schedules DOJ oversight hearing',
    'https://judiciary.house.gov/committee-activity/hearings/oversight-us-department-justice-5',
    'Congressional hearing schedule metadata; no testimony or assessment is represented.',
    TIMESTAMPTZ '2026-02-11 00:00:00+00',
    'Process-only source record. Consult the official hearing page for schedule information.', '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    false, false, false, now(), now(), 'v2-epstein-process-cross-surface-2026-08-19', 'active',
    'Official congressional hearing schedule. No testimony or conclusion represented.'
  ),
  (
    'epstein-process-only', 'U.S. Department of Justice Office of Inspector General', 'DOJ OIG announces audit initiation',
    'https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act',
    'Independent-oversight audit initiation metadata; no audit conclusion is represented.',
    TIMESTAMPTZ '2026-04-23 00:00:00+00',
    'Process-only source record. Consult the official OIG page for audit-status information.', '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    false, false, false, now(), now(), 'v2-epstein-process-cross-surface-2026-08-19', 'active',
    'Official oversight record. Audit initiation only; no compliance conclusion represented.'
  ),
  (
    'epstein-process-only', 'U.S. Department of Justice', 'DOJ library posts privacy and search-process notice',
    'https://www.justice.gov/epstein',
    'Library-status, privacy, redaction, and search-limitations metadata only; no materials or link targets are represented.',
    TIMESTAMPTZ '2026-07-17 00:00:00+00',
    'Process-only source record. Consult the official landing page for privacy and library-status notices.', '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    false, false, false, now(), now(), 'v2-epstein-process-cross-surface-2026-08-19', 'active',
    'Official library landing page. No file, person, or underlying-content metadata represented.'
  ),
  (
    'epstein-process-only', 'U.S. Department of Justice', 'DOJ disclosures index records data-set count and redaction-process notice',
    'https://www.justice.gov/epstein/doj-disclosures',
    'Index count and high-level redaction/court-process metadata only; no underlying disclosure material is represented.',
    TIMESTAMPTZ '2026-08-19 00:00:00+00',
    'Process-only source record. Consult the official index for its public notice; linked material is excluded from this platform record.', '[]'::jsonb,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    false, false, false, now(), now(), 'v2-epstein-process-cross-surface-2026-08-19', 'active',
    'Official disclosure-index notice. No underlying files, link titles, or person-level material represented.'
  )
ON CONFLICT (url) DO UPDATE SET
  feed = EXCLUDED.feed, outlet = EXCLUDED.outlet, title = EXCLUDED.title, summary = EXCLUDED.summary,
  published_at = EXCLUDED.published_at, body_text = EXCLUDED.body_text, claims = EXCLUDED.claims,
  arc_id = EXCLUDED.arc_id, unattributed = false, monoculture = false, is_digest = false,
  entities_extracted_at = now(), arc_assign_attempted_at = now(), ingestion_run_id = EXCLUDED.ingestion_run_id,
  source_status = EXCLUDED.source_status, source_status_note = EXCLUDED.source_status_note;

-- Release existing Source Comparison foreign-key references before refreshing arc events.
DELETE FROM public.explanations WHERE rule_version = 'sc-v1|v2-epstein-process-2026-08-19';
DELETE FROM public.claim_evidence_links cel USING public.claims c, public.events e
WHERE cel.claim_id = c.id AND c.event_id = e.id AND e.rule_version = 'v2-epstein-process-2026-08-19';
DELETE FROM public.article_claims ac USING public.claims c, public.events e
WHERE ac.claim_id = c.id AND c.event_id = e.id AND e.rule_version = 'v2-epstein-process-2026-08-19';
DELETE FROM public.event_articles ea USING public.events e
WHERE ea.event_id = e.id AND e.rule_version = 'v2-epstein-process-2026-08-19';
DELETE FROM public.claims c USING public.events e
WHERE c.event_id = e.id AND e.rule_version = 'v2-epstein-process-2026-08-19';
DELETE FROM public.events WHERE rule_version = 'v2-epstein-process-2026-08-19';

DELETE FROM public.arc_events
WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight')
  AND title IN (
    'Public Law 119-38 enactment recorded',
    'DOJ issued aggregate release-process statement',
    'DOJ stated a court-order-related redaction review protocol',
    'House Judiciary DOJ oversight hearing scheduled',
    'DOJ OIG audit initiation announced',
    'DOJ library posted update and privacy-process notice',
    'DOJ disclosure index documented redaction-process notice'
  );

INSERT INTO public.arc_events (arc_id, title, category, confidence, occurred_at, description)
SELECT a.id, v.title, 'accountability', 'confirmed', v.occurred_at, v.description
FROM public.story_arcs a
CROSS JOIN (
  VALUES
    ('Public Law 119-38 enactment recorded', DATE '2025-11-19', 'Statutory milestone only.'),
    ('DOJ issued aggregate release-process statement', DATE '2026-01-30', 'Attributed DOJ aggregate-process statement only.'),
    ('DOJ stated a court-order-related redaction review protocol', DATE '2026-01-30', 'Attributed DOJ court-process safeguard statement only.'),
    ('House Judiciary DOJ oversight hearing scheduled', DATE '2026-02-11', 'Congressional-oversight schedule only.'),
    ('DOJ OIG audit initiation announced', DATE '2026-04-23', 'Audit initiation only; no outcome finding.'),
    ('DOJ library posted update and privacy-process notice', DATE '2026-07-17', 'Library process notice only; no underlying materials.'),
    ('DOJ disclosure index documented redaction-process notice', DATE '2026-08-19', 'Index and redaction-process notice only.')
) AS v(title, occurred_at, description)
WHERE a.slug = 'epstein-files-act-process-oversight';

DELETE FROM public.sources
WHERE node_id IN (SELECT id FROM public.nodes WHERE metadata ->> 'manifest' = 'v2-epstein-process-cross-surface-2026-08-19');

INSERT INTO public.sources (node_id, outlet, headline, url, published_at)
SELECT n.id, v.outlet, v.headline, v.url, v.published_at
FROM public.nodes n
JOIN (
  VALUES
    ('evt-efta-public-law-119-38-20251119', 'Congress.gov', 'H.R. 4405 / Public Law 119-38 legislative record', 'https://www.congress.gov/bill/119th-congress/house-bill/4405/all-info', DATE '2025-11-19'),
    ('evt-efta-doj-aggregate-release-20260130', 'U.S. Department of Justice', 'Department of Justice publishes 3.5 million responsive pages in compliance with the Epstein Files Transparency Act', 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files', DATE '2026-01-30'),
    ('evt-efta-court-order-redaction-process-20260130', 'U.S. Department of Justice', 'DOJ process statement: court-order-related redaction review protocol', 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files', DATE '2026-01-30'),
    ('evt-efta-house-doj-oversight-20260211', 'House Judiciary Committee', 'Oversight of the U.S. Department of Justice', 'https://judiciary.house.gov/committee-activity/hearings/oversight-us-department-justice-5', DATE '2026-02-11'),
    ('evt-efta-oig-audit-open-20260423', 'U.S. Department of Justice Office of Inspector General', 'Audit of Department of Justice compliance with the Epstein Files Transparency Act', 'https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act', DATE '2026-04-23'),
    ('evt-efta-library-privacy-update-20260717', 'U.S. Department of Justice', 'Epstein Library privacy and process notice', 'https://www.justice.gov/epstein', DATE '2026-07-17'),
    ('evt-efta-disclosure-index-20260819', 'U.S. Department of Justice', 'DOJ Disclosures index', 'https://www.justice.gov/epstein/doj-disclosures', DATE '2026-08-19')
) AS v(node_slug, outlet, headline, url, published_at)
  ON n.slug = v.node_slug;

DELETE FROM public.edges WHERE metadata ->> 'manifest' = 'v2-epstein-process-cross-surface-2026-08-19';

INSERT INTO public.edges (
  source_id, target_id, type, weight, label, metadata, similarity, sky_verified,
  signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes,
  counterfactual_test, reliability
)
SELECT e.id, d.id, 'documentary', 'medium', 'documentary: official process record',
  '{"manifest":"v2-epstein-process-cross-surface-2026-08-19","scope":"process_only","evidence":"Event description is bounded to the linked official process record."}'::jsonb,
  NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1
FROM (VALUES
  ('evt-efta-public-law-119-38-20251119', 'doc-efta-public-law-119-38'),
  ('evt-efta-doj-aggregate-release-20260130', 'doc-efta-doj-aggregate-release-20260130'),
  ('evt-efta-court-order-redaction-process-20260130', 'doc-efta-doj-aggregate-release-20260130'),
  ('evt-efta-house-doj-oversight-20260211', 'doc-efta-house-doj-oversight-20260211'),
  ('evt-efta-oig-audit-open-20260423', 'doc-efta-oig-audit-open-20260423'),
  ('evt-efta-library-privacy-update-20260717', 'doc-efta-library-privacy-update-20260717'),
  ('evt-efta-disclosure-index-20260819', 'doc-efta-disclosure-index-20260819')
) AS m(event_slug, document_slug)
JOIN public.nodes e ON e.slug = m.event_slug
JOIN public.nodes d ON d.slug = m.document_slug
ON CONFLICT (source_id, target_id, type) DO UPDATE SET
  weight = EXCLUDED.weight, label = EXCLUDED.label, metadata = EXCLUDED.metadata, similarity = NULL,
  sky_verified = false, signal_source = EXCLUDED.signal_source, doc_strength = EXCLUDED.doc_strength,
  claimed_by = EXCLUDED.claimed_by, stance = EXCLUDED.stance, disputed_by = EXCLUDED.disputed_by,
  alternative_causes = EXCLUDED.alternative_causes, counterfactual_test = NULL, reliability = EXCLUDED.reliability;

UPDATE public.story_arcs
SET seed_article_id = (SELECT id FROM public.articles WHERE url = 'https://www.congress.gov/bill/119th-congress/house-bill/4405/all-info'),
    last_update_at = now()
WHERE slug = 'epstein-files-act-process-oversight';

-- Source Comparison: process-only primary records with explanation objects.
DELETE FROM public.explanations WHERE rule_version = 'sc-v1|v2-epstein-process-2026-08-19';
DELETE FROM public.claim_evidence_links cel USING public.claims c, public.events e
WHERE cel.claim_id = c.id AND c.event_id = e.id AND e.rule_version = 'v2-epstein-process-2026-08-19';
DELETE FROM public.article_claims ac USING public.claims c, public.events e
WHERE ac.claim_id = c.id AND c.event_id = e.id AND e.rule_version = 'v2-epstein-process-2026-08-19';
DELETE FROM public.event_articles ea USING public.events e
WHERE ea.event_id = e.id AND e.rule_version = 'v2-epstein-process-2026-08-19';
DELETE FROM public.claims c USING public.events e
WHERE c.event_id = e.id AND e.rule_version = 'v2-epstein-process-2026-08-19';
DELETE FROM public.events WHERE rule_version = 'v2-epstein-process-2026-08-19';

INSERT INTO public.events (canonical_title, occurred_at_start, occurred_at_end, location_text, arc_id, arc_event_id, status, rule_version)
VALUES
  (
    'DOJ issued aggregate release-process statement', DATE '2026-01-30', DATE '2026-01-30', NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    (SELECT id FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight') AND title = 'DOJ issued aggregate release-process statement'),
    'active', 'v2-epstein-process-2026-08-19'
  ),
  (
    'DOJ stated a court-order-related redaction review protocol', DATE '2026-01-30', DATE '2026-01-30', NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    (SELECT id FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight') AND title = 'DOJ stated a court-order-related redaction review protocol'),
    'active', 'v2-epstein-process-2026-08-19'
  ),
  (
    'DOJ OIG audit initiation announced', DATE '2026-04-23', DATE '2026-04-23', NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    (SELECT id FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight') AND title = 'DOJ OIG audit initiation announced'),
    'active', 'v2-epstein-process-2026-08-19'
  ),
  (
    'DOJ library posted update and privacy-process notice', DATE '2026-07-17', DATE '2026-07-17', NULL,
    (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight'),
    (SELECT id FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'epstein-files-act-process-oversight') AND title = 'DOJ library posted update and privacy-process notice'),
    'active', 'v2-epstein-process-2026-08-19'
  );

INSERT INTO public.claims (event_id, canonical_text, claim_kind, thin_extraction, status, rule_version)
SELECT e.id,
  CASE e.canonical_title
    WHEN 'DOJ issued aggregate release-process statement' THEN 'DOJ stated that it published over 3 million additional responsive pages and that the aggregate production was nearly 3.5 million pages.'
    WHEN 'DOJ stated a court-order-related redaction review protocol' THEN 'DOJ stated that a component used an additional review protocol to comply with a court order concerning protected identifying information.'
    WHEN 'DOJ OIG audit initiation announced' THEN 'DOJ OIG stated that it initiated an audit of DOJ processes for identification, redaction, withholding, release, and post-release matters under the Act.'
    WHEN 'DOJ library posted update and privacy-process notice' THEN 'DOJ’s library landing page stated that redactions of victim names and other identifying information had been applied and that portions of documents may not be electronically searchable.'
  END,
  'fact', false, 'active', 'v2-epstein-process-2026-08-19'
FROM public.events e
WHERE e.rule_version = 'v2-epstein-process-2026-08-19';

INSERT INTO public.event_articles (event_id, article_id, membership_method, membership_confidence)
SELECT e.id, a.id, 'manual_primary_source', 1.0
FROM public.events e
JOIN public.articles a ON a.url = CASE e.canonical_title
  WHEN 'DOJ issued aggregate release-process statement' THEN 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files'
  WHEN 'DOJ stated a court-order-related redaction review protocol' THEN 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files'
  WHEN 'DOJ OIG audit initiation announced' THEN 'https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act'
  WHEN 'DOJ library posted update and privacy-process notice' THEN 'https://www.justice.gov/epstein'
END
WHERE e.rule_version = 'v2-epstein-process-2026-08-19';

INSERT INTO public.article_claims (claim_id, article_id, surface_text, char_start, char_end, extraction_method, extraction_confidence, stance, loaded_language, version, is_current)
SELECT c.id, a.id, c.canonical_text, NULL, NULL, 'manual_primary_source', 1.0, 'asserts', '[]'::jsonb, 1, true
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.articles a ON a.url = CASE e.canonical_title
  WHEN 'DOJ issued aggregate release-process statement' THEN 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files'
  WHEN 'DOJ stated a court-order-related redaction review protocol' THEN 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files'
  WHEN 'DOJ OIG audit initiation announced' THEN 'https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act'
  WHEN 'DOJ library posted update and privacy-process notice' THEN 'https://www.justice.gov/epstein'
END
WHERE c.rule_version = 'v2-epstein-process-2026-08-19';

INSERT INTO public.claim_evidence_links (claim_id, evidence_url, evidence_type, linked_from_article_id)
SELECT c.id, a.url, 'primary_document', a.id
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.articles a ON a.url = CASE e.canonical_title
  WHEN 'DOJ issued aggregate release-process statement' THEN 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files'
  WHEN 'DOJ stated a court-order-related redaction review protocol' THEN 'https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files'
  WHEN 'DOJ OIG audit initiation announced' THEN 'https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act'
  WHEN 'DOJ library posted update and privacy-process notice' THEN 'https://www.justice.gov/epstein'
END
WHERE c.rule_version = 'v2-epstein-process-2026-08-19';

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
  jsonb_build_array(jsonb_build_object('article_id', a.id::text, 'role', 'primary_process_record', 'outlet', a.outlet)),
  c.canonical_text, '[]'::jsonb,
  jsonb_build_array('One primary process record is mapped to this event. No independent-source or cross-outlet corroboration is asserted.'),
  ARRAY[]::uuid[], 'n/a', 'sc-v1|v2-epstein-process-2026-08-19', 'human_authored', now(), now(), 'draft',
  'Replace or correct this explanation if the linked official process record is corrected, withdrawn, or shown not to support the displayed text.',
  '[]'::jsonb,
  CASE e.canonical_title
    WHEN 'DOJ issued aggregate release-process statement' THEN 'This is an attributed DOJ process statement. The tracker retains aggregate production metadata only and makes no independent compliance determination.'
    WHEN 'DOJ stated a court-order-related redaction review protocol' THEN 'This is an attributed DOJ safeguard statement. No court filing, protected information, or person-level material is represented.'
    WHEN 'DOJ OIG audit initiation announced' THEN 'The audit is ongoing. No audit finding or compliance determination is represented.'
    WHEN 'DOJ library posted update and privacy-process notice' THEN 'This is a library-process notice only. The platform retains no underlying library content or person-level material.'
  END,
  'ok'
FROM public.claims c
JOIN public.events e ON e.id = c.event_id
JOIN public.article_claims ac ON ac.claim_id = c.id AND ac.is_current = true
JOIN public.articles a ON a.id = ac.article_id
WHERE c.rule_version = 'v2-epstein-process-2026-08-19';

COMMIT;

SELECT
  (SELECT count(*)::int FROM public.p3_policy_track_event WHERE method_version = 'epstein-compliance-process-v2') AS tracker_events,
  (SELECT count(*)::int FROM public.articles WHERE ingestion_run_id = 'v2-epstein-process-cross-surface-2026-08-19') AS process_articles,
  (SELECT count(*)::int FROM public.nodes WHERE metadata ->> 'manifest' = 'v2-epstein-process-cross-surface-2026-08-19') AS graph_nodes,
  (SELECT count(*)::int FROM public.edges WHERE metadata ->> 'manifest' = 'v2-epstein-process-cross-surface-2026-08-19') AS graph_edges,
  (SELECT count(*)::int FROM public.events WHERE rule_version = 'v2-epstein-process-2026-08-19') AS comparison_events,
  (SELECT count(*)::int FROM public.explanations WHERE rule_version = 'sc-v1|v2-epstein-process-2026-08-19' AND is_current = true) AS comparison_explanations
LIMIT 1;
