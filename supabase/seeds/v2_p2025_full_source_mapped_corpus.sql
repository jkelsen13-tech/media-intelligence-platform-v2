-- Isolated v2 only. Generated from real dated publisher records plus four official DOJ records.
-- Manifest: v2-p2025-corpus-2026-08-19
-- Scope: 56 publisher records (2025–2026) + 4 primary DOJ records; no article body copying; no causal inference.
-- Rollback: delete rows where ingestion_run_id = 'v2-p2025-corpus-2026-08-19', and graph/arc rows whose metadata.manifest = 'v2-p2025-corpus-2026-08-19'.

BEGIN;

INSERT INTO public.story_arcs (slug, title, category, status, coverage_gap, summary, started_at, category_confidence, category_evidence, title_article_count)
VALUES (
  'project-2025-doj-track1-implementation', 'Project 2025 — DOJ Track 1 source-mapped implementation record', 'institutional_accountability', 'active', true,
  'A bounded source-mapped record of dated public reporting and four named DOJ primary actions. It does not determine whether Project 2025 caused an action, whether all goals were implemented, or whether the selected corpus is comprehensive.',
  DATE '2025-01-20', NULL, 'Manual source-mapped grouping; no composite score or causal determination.', 60
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, category = EXCLUDED.category, status = EXCLUDED.status, coverage_gap = EXCLUDED.coverage_gap, summary = EXCLUDED.summary, started_at = EXCLUDED.started_at, category_confidence = NULL, category_evidence = EXCLUDED.category_evidence, title_article_count = EXCLUDED.title_article_count, last_update_at = now();

INSERT INTO public.nodes (slug, label, type, description, metadata, confidence, summary, occurred_at, arc_id)
VALUES
(
    'arc-project-2025-doj-track1-implementation', 'Project 2025 — DOJ Track 1 source-mapped implementation record', 'policy',
    'A bounded, source-mapped record of Project 2025-related reporting and named DOJ actions. Arc membership organizes coverage and does not establish that a reporting item caused, comprehensively measured, or validated an implementation outcome.',
    '{"manifest":"v2-p2025-corpus-2026-08-19","scope":"source_mapped_reporting_and_named_doj_actions","causal_claim":false}'::jsonb, NULL,
    'Bounded source-mapped grouping; reporting coverage and policy actions remain distinct.', DATE '2025-01-20',
    (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
  ),
(
      'evt-p2025-third-party-settlement-policy-20250205', 'Attorney General rescinded two prior third-party-settlement payment memoranda', 'event', 'The Attorney General’s memorandum rescinded the May 5, 2022 and July 28, 2023 memoranda concerning payments to non-governmental third parties and directed a report on strategies and measures concerning improper payments.',
      '{"manifest":"v2-p2025-corpus-2026-08-19","article_url":"https://www.justice.gov/ag/media/1388536/dl?inline","evidence_class":"primary_doj_record","causal_claim":false}'::jsonb, NULL,
      'Primary-source event record. The memorandum establishes the stated rescissions and direction; it does not establish the effectiveness, completion, or universal application of the requested follow-on measures.', DATE '2025-02-05',
      (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
    ),
(
      'doc-p2025-doj-third-party-settlement-memo-20250205', 'DOJ primary record: Reinstating the Prohibition on Improper Third-Party Settlements', 'document',
      'Official DOJ primary record dated 2025-02-05.',
      '{"manifest":"v2-p2025-corpus-2026-08-19","url":"https://www.justice.gov/ag/media/1388536/dl?inline","source_type":"primary_record"}'::jsonb, NULL,
      'Official primary source document.', DATE '2025-02-05',
      (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
    ),
(
      'evt-p2025-doj-louisville-minneapolis-20250521', 'DOJ announced dismissal steps for Louisville and Minneapolis actions', 'event', 'DOJ stated that its Civil Rights Division was beginning dismissal steps for the Louisville and Minneapolis lawsuits and closing specified investigations.',
      '{"manifest":"v2-p2025-corpus-2026-08-19","article_url":"https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and","evidence_class":"primary_doj_record","causal_claim":false}'::jsonb, NULL,
      'Primary-source event record. The release documents the announced steps; it does not establish a comprehensive review of all consent decrees or an aggregate policy outcome.', DATE '2025-05-21',
      (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
    ),
(
      'doc-p2025-doj-louisville-minneapolis-release-20250521', 'DOJ primary record: The U.S. Department of Justice’s Civil Rights Division Dismisses Biden-Era Police Investigations and Proposed Police Consent Decrees in Louisville and Minneapolis', 'document',
      'Official DOJ primary record dated 2025-05-21.',
      '{"manifest":"v2-p2025-corpus-2026-08-19","url":"https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and","source_type":"primary_record"}'::jsonb, NULL,
      'Official primary source document.', DATE '2025-05-21',
      (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
    ),
(
      'evt-p2025-seattle-decree-response-20250723', 'DOJ announced support for Seattle termination motion', 'event', 'DOJ stated that its Civil Rights Division filed a response supporting Seattle’s motion to terminate the police-department consent decree.',
      '{"manifest":"v2-p2025-corpus-2026-08-19","article_url":"https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree","evidence_class":"primary_doj_record","causal_claim":false}'::jsonb, NULL,
      'Primary-source event record. The release documents a filed response and stated support, not the court’s final disposition or a general result for other decrees.', DATE '2025-07-23',
      (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
    ),
(
      'doc-p2025-doj-seattle-release-20250723', 'DOJ primary record: Justice Department Supports Seattle’s Motion to Terminate Police Department Consent Decree', 'document',
      'Official DOJ primary record dated 2025-07-23.',
      '{"manifest":"v2-p2025-corpus-2026-08-19","url":"https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree","source_type":"primary_record"}'::jsonb, NULL,
      'Official primary source document.', DATE '2025-07-23',
      (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
    ),
(
      'evt-p2025-norfolk-decree-termination-20250813', 'Court granted DOJ motion regarding Norfolk decree', 'event', 'DOJ stated that the Eastern District of Virginia granted its motion to terminate the 1978 Norfolk consent decree governing police and firefighter employment.',
      '{"manifest":"v2-p2025-corpus-2026-08-19","article_url":"https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree","evidence_class":"primary_doj_record","causal_claim":false}'::jsonb, NULL,
      'Primary-source event record. The release documents the named Norfolk court action; it does not establish a general outcome for other consent decrees.', DATE '2025-08-13',
      (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
    ),
(
      'doc-p2025-doj-norfolk-release-20250813', 'DOJ primary record: Federal Court Grants Justice Department’s Motion to Terminate 47-Year-Old Consent Decree Governing Employment by City of Norfolk’s Police and Fire Departments', 'document',
      'Official DOJ primary record dated 2025-08-13.',
      '{"manifest":"v2-p2025-corpus-2026-08-19","url":"https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree","source_type":"primary_record"}'::jsonb, NULL,
      'Official primary source document.', DATE '2025-08-13',
      (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
    )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label, type = EXCLUDED.type, description = EXCLUDED.description, metadata = EXCLUDED.metadata, confidence = NULL, summary = EXCLUDED.summary, occurred_at = EXCLUDED.occurred_at, arc_id = EXCLUDED.arc_id, updated_at = now();

UPDATE public.story_arcs a
SET root_node_id = n.id, last_update_at = now()
FROM public.nodes n
WHERE a.slug = 'project-2025-doj-track1-implementation' AND n.slug = 'arc-project-2025-doj-track1-implementation';

INSERT INTO public.articles (feed, outlet, title, url, summary, published_at, body_text, claims, arc_id, unattributed, monoculture, is_digest, entities_extracted_at, arc_assign_attempted_at, ingestion_run_id, source_status, source_status_note)
VALUES
(
  'p2025-public-news-verified', 'The Guardian', 'Trump’s appointments signal which Project 2025 goals he might advance first', 'https://www.theguardian.com/us-news/2025/jan/08/trump-project-2025', 'Published 2025-01-08 coverage from The Guardian. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-01-08 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Politico', '37 ways Project 2025 has shown up in Trump’s executive orders', 'https://www.politico.com/interactives/2025/trump-executive-orders-project-2025/', 'Published 2025-02-05 coverage from Politico. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-02-05 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'apnews.com', 'Senate confirms Project 2025 architect Russell Vought to lead powerful White House budget office', 'https://apnews.com/article/trump-russell-vought-confirmation-budget-project-2025-7d1c476694176876256e95cecbd49231', 'Published 2025-02-06 coverage from apnews.com. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-02-06 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'WATCH: Senate confirms Project 2025 architect Russell Vought to lead powerful White House OMB', 'https://www.pbs.org/newshour/politics/watch-live-senate-considers-trump-omb-nominee-russell-vought-for-confirmation', 'Published 2025-02-06 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-02-06 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'BBC', 'What is Project 2025? Wish list for Trump second term, explained', 'https://www.bbc.com/news/articles/c977njnvq2do', 'Published 2025-02-14 coverage from BBC. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-02-14 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'The Project 2025 policies Trump is already implementing', 'https://www.pbs.org/video/project-2025-1740259140/', 'Published 2025-02-22 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-02-22 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'KFF Health News', 'Trump Froze Out Project 2025 in His Campaign. Now Its Blueprint Is His Health Care Playbook.', 'https://kffhealthnews.org/medicaid/trump-project-2025-health-policy-abortion-medicaid-usaid/', 'Published 2025-02-24 coverage from KFF Health News. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-02-24 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The Hill', 'Project 2025: You can’t say Trump didn’t warn us', 'https://thehill.com/opinion/5186896-trump-project-2025/', 'Published 2025-03-11 coverage from The Hill. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-03-11 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'NBC News', 'The key Project 2025 authors now staffing the Trump administration', 'https://www.nbcnews.com/politics/trump-administration/key-project-2025-authors-now-staffing-trump-administration-rcna195107', 'Published 2025-03-12 coverage from NBC News. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-03-12 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Politico', '‘Beyond My Wildest Dreams’: The Architect of Project 2025 Is Ready for His Victory Lap', 'https://www.politico.com/news/magazine/2025/03/16/project-2025-paul-dans-qa-00228890', 'Published 2025-03-16 coverage from Politico. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-03-16 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The Guardian', 'Ex-Project 2025 chief says Trump’s actions are beyond his ‘wildest dreams’', 'https://www.theguardian.com/us-news/2025/mar/17/trump-administration-project-2025', 'Published 2025-03-17 coverage from The Guardian. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-03-17 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'E&E News by POLITICO', 'EPA’s Zeldin emerges as Project 2025 frontman', 'https://www.eenews.net/articles/epas-zeldin-emerges-as-project-2025-frontman/', 'Published 2025-03-20 coverage from E&E News by POLITICO. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-03-20 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The Guardian', '‘100-year timeframe’: how Project 2025 is guiding Trump’s attack on government', 'https://www.theguardian.com/us-news/2025/apr/26/trump-project-2025-book', 'Published 2025-04-26 coverage from The Guardian. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-04-26 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'ABC News - Breaking News, Latest News and Videos', 'Trump, echoing Project 2025, using ''flood the zone'' strategy to push agenda: Experts - ABC News', 'https://abcnews.com/Politics/trump-echoing-project-2025-flood-zone-strategy-push/story?id=121124118', 'Published 2025-04-29 coverage from ABC News - Breaking News, Latest News and Videos. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-04-29 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'NBC News', 'The man who led Project 2025 gives his assessment of Trump''s first 100 days', 'https://www.nbcnews.com/politics/trump-administration/man-led-project-2025-gives-assessment-trumps-first-100-days-rcna202199', 'Published 2025-04-29 coverage from NBC News. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-04-29 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'NPR', 'How Project 2025 is shaping Trump''s second term', 'https://www.npr.org/transcripts/nx-s1-5377294', 'Published 2025-04-29 coverage from NPR. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-04-29 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'USA Today', 'Trump’s early agenda dismantles Civil Rights Act, advances Project 2025, activists say', 'https://www.usatoday.com/story/news/politics/2025/05/04/trump-100-days-civil-rights-protections-setback/83331594007/', 'Published 2025-05-04 coverage from USA Today. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-05-04 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Politico', 'Project 2025 architect helped pull megabill over the line', 'https://www.politico.com/news/2025/07/03/project-2025-architect-helped-pull-megabill-over-the-line-00439753', 'Published 2025-07-03 coverage from Politico. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-07-03 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'apnews.com', 'Project 2025 author Paul Dans will challenge Republican Sen. Lindsey Graham in South Carolina', 'https://apnews.com/article/dans-project-2025-graham-south-carolina-senate-781a780ee4cd701d0b1d52d19e7a2892', 'Published 2025-07-28 coverage from apnews.com. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-07-28 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The New York Times', 'Project 2025 Architect Is Challenging Lindsey Graham for Senate (Published 2025)', 'https://www.nytimes.com/2025/07/28/us/politics/paul-dans-project-2025-lindsey-graham.html', 'Published 2025-07-28 coverage from The New York Times. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-07-28 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'Project 2025 author challenging Sen. Lindsey Graham in GOP primary', 'https://www.pbs.org/newshour/politics/project-2025-author-challenging-sen-lindsey-graham-in-gop-primary', 'Published 2025-07-28 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-07-28 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The Guardian', 'Project 2025’s Paul Dans will challenge Lindsey Graham in South Carolina Republican primary', 'https://www.theguardian.com/us-news/2025/jul/28/paul-dans-south-carolina-project-2025', 'Published 2025-07-28 coverage from The Guardian. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-07-28 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The Hill', 'After only 6 months, Project 2025 is already 47 percent complete', 'https://thehill.com/opinion/white-house/5435802-after-only-6-months-project-2025-is-halfway-complete/', 'Published 2025-08-05 coverage from The Hill. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-08-05 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'Amanpour and Company | How Pres. Trump Is Using Project 2025 to Reshape America | Season 2025', 'https://www.pbs.org/video/how-pres-trump-is-using-project-2025-to-reshape-america-lmzsjs/', 'Published 2025-08-12 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-08-12 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The New York Times', 'In New Book, Think Tank Behind Project 2025 Takes On the Constitution', 'https://www.nytimes.com/2025/09/09/us/politics/heritage-foundation-constitution-book.html', 'Published 2025-09-09 coverage from The New York Times. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-09-09 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'FactCheck.org', 'Trump, Project 2025 and the ‘Dismantling’ of the ‘Administrative State’', 'https://www.factcheck.org/2025/09/trump-project-2025-and-the-dismantling-of-the-administrative-state/', 'Published 2025-09-29 coverage from FactCheck.org. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-09-29 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'FactCheck.org', 'Trump, Project 2025 and Immigration', 'https://www.factcheck.org/2025/09/trump-project-2025-and-immigration/', 'Published 2025-09-30 coverage from FactCheck.org. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-09-30 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'FactCheck.org', 'Trump, Project 2025 and Climate Change/Fossil Fuels', 'https://www.factcheck.org/2025/10/trump-project-2025-and-climate-change-fossil-fuels/', 'Published 2025-10-01 coverage from FactCheck.org. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-01 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Axios', 'Trump embraces Project 2025 after disavowing it during 2024 campaign', 'https://www.axios.com/2025/10/02/trump-project-2025-russ-vought', 'Published 2025-10-02 coverage from Axios. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-02 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'FactCheck.org', 'Trump, Project 2025 and the Social Safety Net', 'https://www.factcheck.org/2025/10/trump-project-2025-and-the-social-safety-net/', 'Published 2025-10-02 coverage from FactCheck.org. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-02 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The New York Times', 'Trump Name-Checks Project 2025 as He Threatens to Dismantle Agencies', 'https://www.nytimes.com/2025/10/02/us/politics/trump-project-2025-vought.html', 'Published 2025-10-02 coverage from The New York Times. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-02 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'apnews.com', 'Trump no longer distancing himself from Project 2025 as he uses shutdown to further pursue its goals', 'https://apnews.com/article/trump-project-2025-russ-vought-shutdown-2d1ea5e6e32c583ddf6b8a8164e523c3', 'Published 2025-10-03 coverage from apnews.com. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-03 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Time Magazine', 'Trump Is No Longer Denying Support for Project 2025: What to Know', 'https://time.com/7323278/trump-project-2025-government-shutdown/', 'Published 2025-10-03 coverage from Time Magazine. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-03 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'BBC', 'Russell Vought - from Project 2025 to Trump''s shutdown enforcer', 'https://www.bbc.com/news/articles/c059ydyqe19o', 'Published 2025-10-03 coverage from BBC. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-03 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'FactCheck.org', 'Trump, Project 2025 and ‘Culture Wars’', 'https://www.factcheck.org/2025/10/trump-project-2025-and-culture-wars/', 'Published 2025-10-03 coverage from FactCheck.org. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-03 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'Amid shutdown fight, Trump no longer distancing himself from Project 2025', 'https://www.pbs.org/newshour/politics/amid-shutdown-fight-trump-no-longer-distancing-himself-from-project-2025', 'Published 2025-10-03 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-03 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'USA Today', 'Project 2025 is Trump''s government shutdown playbook. It always was. | Opinion', 'https://www.usatoday.com/story/opinion/columnist/2025/10/05/trump-shutdown-project-2025-doge/86481704007/', 'Published 2025-10-05 coverage from USA Today. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-10-05 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'How Pres. Trump Is Using Project 2025 to Reshape America | Video | Amanpour & Company', 'https://www.pbs.org/wnet/amanpour-and-company/video/how-pres-trump-is-using-project-2025-to-reshape-america-lmzsjs-2-2/', 'Published 2025-12-08 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-12-08 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Axios', 'Project 2025 architects lay out 2026 policy vision', 'https://www.axios.com/2025/12/09/trump-china-project-2026-2025-policy-heritage-foundation-abortion', 'Published 2025-12-09 coverage from Axios. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-12-09 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The Hechinger Report', 'Trump administration makes good on many Project 2025 education goals', 'https://hechingerreport.org/trump-administration-makes-good-on-many-project-2025-education-goals/', 'Published 2025-12-18 coverage from The Hechinger Report. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-12-18 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Columbia Journalism Review', 'How Project 2025 Kneecapped the US Press', 'https://www.cjr.org/analysis/how-project-2025-kneecapped-the-us-press.php', 'Published 2025-12-19 coverage from Columbia Journalism Review. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-12-19 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'Tracking how much of Project 2025 the Trump administration achieved this year', 'https://www.pbs.org/newshour/politics/tracking-how-much-of-project-2025-the-trump-administration-achieved-this-year', 'Published 2025-12-24 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-12-24 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'How Trump implemented much of Project 2025 in his first year | Washington Week with The Atlantic', 'https://www.pbs.org/weta/washingtonweek/video/2025/12/how-trump-implemented-much-of-project-2025-in-his-first-year', 'Published 2025-12-26 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-12-26 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Poynter', 'Here’s how many of Project 2025’s media proposals were implemented in 2025', 'https://www.poynter.org/reporting-editing/2025/project-2025-actions-against-press/', 'Published 2025-12-29 coverage from Poynter. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2025-12-29 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'Axios', 'Trump enacted dozens of Project 2025 goals. Here''s what''s left', 'https://www.axios.com/2026/01/01/trump-project-2025-remaining-goals', 'Published 2026-01-01 coverage from Axios. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-01-01 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'C-SPAN', 'User Clip: project 2025 description - C-SPAN', 'https://www.c-span.org/clip/washington-journal/user-clip-project-2025-description/5188203', 'Published 2026-01-11 coverage from C-SPAN. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-01-11 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'NPR', 'Trump has rolled out many of the Project 2025 policies he once claimed ignorance about', 'https://www.npr.org/2026/01/19/nx-s1-5640006/trump-has-rolled-out-many-of-the-project-2025-policies-he-once-claimed-ignorance-about', 'Published 2026-01-19 coverage from NPR. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-01-19 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'NBC News', 'Group behind Project 2025 pushes ‘marriage bootcamps’ in effort to focus on family', 'https://www.nbcnews.com/video/group-behind-project-2025-pushes-marriage-bootcamps-in-effort-to-focus-on-family-256357957942', 'Published 2026-01-21 coverage from NBC News. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-01-21 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'BBC', 'From Venezuela to immigration, Project 2025 provided Trump''s roadmap', 'https://www.bbc.com/news/articles/c5yvvjw8pdvo', 'Published 2026-02-22 coverage from BBC. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-02-22 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'Project 2025 author Paul Dans drops primary challenge to Lindsey Graham in South Carolina', 'https://www.pbs.org/newshour/politics/project-2025-author-paul-dans-drops-primary-challenge-to-lindsey-graham-in-south-carolina', 'Published 2026-04-13 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-04-13 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'PBS', 'How much of Project 2025 has Trump enacted?', 'https://www.pbs.org/video/trump-agenda-1776363619/', 'Published 2026-04-16 coverage from PBS. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-04-16 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'FactCheck.org', 'Project 2025 Series Wins National Headliner Award', 'https://www.factcheck.org/2026/04/project-2025-series-wins-national-headliner-award/', 'Published 2026-04-28 coverage from FactCheck.org. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-04-28 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'CNBC', 'Fed Chair Warsh makes first hires at central bank, including ''Project 2025'' author', 'https://www.cnbc.com/2026/06/02/fed-chair-warsh-makes-first-hires-at-central-bank-including-project-2025-author.html', 'Published 2026-06-02 coverage from CNBC. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-06-02 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'USA Today', 'The authors of Project 2025 are coming for Title IX | Opinion', 'https://www.usatoday.com/story/sports/columnist/nancy-armour/2026/07/23/heritage-foundation-title-ix-project-2025-womens-rights/91013439007/', 'Published 2026-07-23 coverage from USA Today. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-07-23 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The Christian Science Monitor', 'Project 2025: As midterms near, Trump’s window for action might be closing', 'https://www.csmonitor.com/USA/Politics/2026/0806/project-2025-trump-administration', 'Published 2026-08-06 coverage from The Christian Science Monitor. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-08-06 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-public-news-verified', 'The Hill', 'Trump nominates Project 2025 author to be Interior Department watchdog', 'https://thehill.com/policy/energy-environment/6017264-project-2025-interior-department-watchdog-oig/', 'Published 2026-08-07 coverage from The Hill. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.', TIMESTAMPTZ '2026-08-07 00:00:00+00',
  'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.'
),
(
  'p2025-primary-records', 'U.S. Department of Justice', 'Reinstating the Prohibition on Improper Third-Party Settlements', 'https://www.justice.gov/ag/media/1388536/dl?inline', 'Attorney General memorandum rescinding two prior memoranda concerning payments to non-governmental third parties and directing a follow-on report on strategies and measures concerning improper payments.', TIMESTAMPTZ '2025-02-05T00:00:00+00',
  'Primary DOJ memorandum curated for the isolated v2 cross-surface seed. See the source URL for the full memorandum.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Primary DOJ record manually curated from the official source URL.'
),
(
  'p2025-primary-records', 'U.S. Department of Justice', 'The U.S. Department of Justice’s Civil Rights Division Dismisses Biden-Era Police Investigations and Proposed Police Consent Decrees in Louisville and Minneapolis', 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and', 'DOJ stated that its Civil Rights Division was beginning dismissal steps for the Louisville and Minneapolis lawsuits and closing specified investigations.', TIMESTAMPTZ '2025-05-21T00:00:00+00',
  'Primary DOJ release curated for the isolated v2 cross-surface seed. See the source URL for the full release.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Primary DOJ record manually curated from the official source URL.'
),
(
  'p2025-primary-records', 'U.S. Department of Justice', 'Justice Department Supports Seattle’s Motion to Terminate Police Department Consent Decree', 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree', 'DOJ stated that its Civil Rights Division filed a response supporting Seattle’s motion to terminate the police-department consent decree.', TIMESTAMPTZ '2025-07-23T00:00:00+00',
  'Primary DOJ release curated for the isolated v2 cross-surface seed. See the source URL for the full release.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Primary DOJ record manually curated from the official source URL.'
),
(
  'p2025-primary-records', 'U.S. Department of Justice', 'Federal Court Grants Justice Department’s Motion to Terminate 47-Year-Old Consent Decree Governing Employment by City of Norfolk’s Police and Fire Departments', 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree', 'DOJ stated that the Eastern District of Virginia granted its motion to terminate the 1978 Norfolk consent decree governing police and firefighter employment.', TIMESTAMPTZ '2025-08-13T00:00:00+00',
  'Primary DOJ release curated for the isolated v2 cross-surface seed. See the source URL for the full release.', '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'),
  false, false, false, now(), now(), 'v2-p2025-corpus-2026-08-19', 'active', 'Primary DOJ record manually curated from the official source URL.'
)
ON CONFLICT (url) DO UPDATE SET
  feed = EXCLUDED.feed, outlet = EXCLUDED.outlet, title = EXCLUDED.title, summary = EXCLUDED.summary, published_at = EXCLUDED.published_at, body_text = EXCLUDED.body_text, claims = EXCLUDED.claims, arc_id = EXCLUDED.arc_id, unattributed = false, monoculture = false, is_digest = false, entities_extracted_at = now(), arc_assign_attempted_at = now(), ingestion_run_id = EXCLUDED.ingestion_run_id, source_status = EXCLUDED.source_status, source_status_note = EXCLUDED.source_status_note;

DELETE FROM public.arc_events
WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')
  AND title IN ('Attorney General rescinded two prior third-party-settlement payment memoranda', 'DOJ announced dismissal steps for Louisville and Minneapolis actions', 'DOJ announced support for Seattle termination motion', 'Court granted DOJ motion regarding Norfolk decree');

INSERT INTO public.arc_events (arc_id, title, category, confidence, occurred_at, description)
SELECT id, 'Attorney General rescinded two prior third-party-settlement payment memoranda', 'accountability', 'confirmed', DATE '2025-02-05', 'Source-linked primary DOJ record. The memorandum establishes the stated rescissions and direction; it does not establish the effectiveness, completion, or universal application of the requested follow-on measures.' FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'
UNION ALL
SELECT id, 'DOJ announced dismissal steps for Louisville and Minneapolis actions', 'accountability', 'confirmed', DATE '2025-05-21', 'Source-linked primary DOJ record. The release documents the announced steps; it does not establish a comprehensive review of all consent decrees or an aggregate policy outcome.' FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'
UNION ALL
SELECT id, 'DOJ announced support for Seattle termination motion', 'accountability', 'confirmed', DATE '2025-07-23', 'Source-linked primary DOJ record. The release documents a filed response and stated support, not the court’s final disposition or a general result for other decrees.' FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation'
UNION ALL
SELECT id, 'Court granted DOJ motion regarding Norfolk decree', 'accountability', 'confirmed', DATE '2025-08-13', 'Source-linked primary DOJ record. The release documents the named Norfolk court action; it does not establish a general outcome for other consent decrees.' FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation';

DELETE FROM public.sources
WHERE url IN ('https://www.justice.gov/ag/media/1388536/dl?inline', 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and', 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree', 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree')
  AND node_id IN (SELECT id FROM public.nodes WHERE metadata ->> 'manifest' = 'v2-p2025-corpus-2026-08-19');

INSERT INTO public.sources (node_id, outlet, headline, url, published_at)
SELECT n.id, 'U.S. Department of Justice', 'Reinstating the Prohibition on Improper Third-Party Settlements', 'https://www.justice.gov/ag/media/1388536/dl?inline', DATE '2025-02-05' FROM public.nodes n WHERE n.slug = 'evt-p2025-third-party-settlement-policy-20250205'
UNION ALL
SELECT n.id, 'U.S. Department of Justice', 'The U.S. Department of Justice’s Civil Rights Division Dismisses Biden-Era Police Investigations and Proposed Police Consent Decrees in Louisville and Minneapolis', 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and', DATE '2025-05-21' FROM public.nodes n WHERE n.slug = 'evt-p2025-doj-louisville-minneapolis-20250521'
UNION ALL
SELECT n.id, 'U.S. Department of Justice', 'Justice Department Supports Seattle’s Motion to Terminate Police Department Consent Decree', 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree', DATE '2025-07-23' FROM public.nodes n WHERE n.slug = 'evt-p2025-seattle-decree-response-20250723'
UNION ALL
SELECT n.id, 'U.S. Department of Justice', 'Federal Court Grants Justice Department’s Motion to Terminate 47-Year-Old Consent Decree Governing Employment by City of Norfolk’s Police and Fire Departments', 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree', DATE '2025-08-13' FROM public.nodes n WHERE n.slug = 'evt-p2025-norfolk-decree-termination-20250813';

DELETE FROM public.edges WHERE metadata ->> 'manifest' = 'v2-p2025-corpus-2026-08-19';

INSERT INTO public.edges (source_id, target_id, type, weight, label, metadata, similarity, sky_verified, signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes, counterfactual_test, reliability)
SELECT i.id, e.id, 'actor', 'medium', 'actor: named DOJ action', '{"manifest":"v2-p2025-corpus-2026-08-19","evidence":"Named in the linked DOJ primary record."}'::jsonb, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes i JOIN public.nodes e ON e.slug = 'evt-p2025-third-party-settlement-policy-20250205' WHERE i.slug = 'institution-doj-civil-rights-division'
UNION ALL
SELECT i.id, e.id, 'actor', 'medium', 'actor: named DOJ action', '{"manifest":"v2-p2025-corpus-2026-08-19","evidence":"Named in the linked DOJ primary record."}'::jsonb, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes i JOIN public.nodes e ON e.slug = 'evt-p2025-doj-louisville-minneapolis-20250521' WHERE i.slug = 'institution-doj-civil-rights-division'
UNION ALL
SELECT i.id, e.id, 'actor', 'medium', 'actor: named DOJ action', '{"manifest":"v2-p2025-corpus-2026-08-19","evidence":"Named in the linked DOJ primary record."}'::jsonb, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes i JOIN public.nodes e ON e.slug = 'evt-p2025-seattle-decree-response-20250723' WHERE i.slug = 'institution-doj-civil-rights-division'
UNION ALL
SELECT i.id, e.id, 'actor', 'medium', 'actor: named DOJ action', '{"manifest":"v2-p2025-corpus-2026-08-19","evidence":"Named in the linked DOJ primary record."}'::jsonb, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes i JOIN public.nodes e ON e.slug = 'evt-p2025-norfolk-decree-termination-20250813' WHERE i.slug = 'institution-doj-civil-rights-division'
ON CONFLICT (source_id, target_id, type) DO UPDATE SET
  weight = EXCLUDED.weight, label = EXCLUDED.label, metadata = EXCLUDED.metadata, similarity = NULL, sky_verified = false, signal_source = EXCLUDED.signal_source, doc_strength = EXCLUDED.doc_strength, claimed_by = EXCLUDED.claimed_by, stance = EXCLUDED.stance, disputed_by = EXCLUDED.disputed_by, alternative_causes = EXCLUDED.alternative_causes, counterfactual_test = NULL, reliability = EXCLUDED.reliability;

INSERT INTO public.edges (source_id, target_id, type, weight, label, metadata, similarity, sky_verified, signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes, counterfactual_test, reliability)
SELECT e.id, d.id, 'documentary', 'medium', 'documentary: official DOJ primary record', '{"manifest":"v2-p2025-corpus-2026-08-19","evidence":"The event summary is limited to the linked official DOJ record."}'::jsonb, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes e JOIN public.nodes d ON d.slug = 'doc-p2025-doj-third-party-settlement-memo-20250205' WHERE e.slug = 'evt-p2025-third-party-settlement-policy-20250205'
UNION ALL
SELECT e.id, d.id, 'documentary', 'medium', 'documentary: official DOJ primary record', '{"manifest":"v2-p2025-corpus-2026-08-19","evidence":"The event summary is limited to the linked official DOJ record."}'::jsonb, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes e JOIN public.nodes d ON d.slug = 'doc-p2025-doj-louisville-minneapolis-release-20250521' WHERE e.slug = 'evt-p2025-doj-louisville-minneapolis-20250521'
UNION ALL
SELECT e.id, d.id, 'documentary', 'medium', 'documentary: official DOJ primary record', '{"manifest":"v2-p2025-corpus-2026-08-19","evidence":"The event summary is limited to the linked official DOJ record."}'::jsonb, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes e JOIN public.nodes d ON d.slug = 'doc-p2025-doj-seattle-release-20250723' WHERE e.slug = 'evt-p2025-seattle-decree-response-20250723'
UNION ALL
SELECT e.id, d.id, 'documentary', 'medium', 'documentary: official DOJ primary record', '{"manifest":"v2-p2025-corpus-2026-08-19","evidence":"The event summary is limited to the linked official DOJ record."}'::jsonb, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes e JOIN public.nodes d ON d.slug = 'doc-p2025-doj-norfolk-release-20250813' WHERE e.slug = 'evt-p2025-norfolk-decree-termination-20250813'
ON CONFLICT (source_id, target_id, type) DO UPDATE SET
  weight = EXCLUDED.weight, label = EXCLUDED.label, metadata = EXCLUDED.metadata, similarity = NULL, sky_verified = false, signal_source = EXCLUDED.signal_source, doc_strength = EXCLUDED.doc_strength, claimed_by = EXCLUDED.claimed_by, stance = EXCLUDED.stance, disputed_by = EXCLUDED.disputed_by, alternative_causes = EXCLUDED.alternative_causes, counterfactual_test = NULL, reliability = EXCLUDED.reliability;

UPDATE public.story_arcs
SET seed_article_id = (SELECT id FROM public.articles WHERE url = 'https://www.justice.gov/ag/media/1388536/dl?inline'), last_update_at = now()
WHERE slug = 'project-2025-doj-track1-implementation';

COMMIT;

SELECT
  (SELECT count(*)::int FROM public.articles WHERE ingestion_run_id = 'v2-p2025-corpus-2026-08-19') AS seeded_articles,
  (SELECT count(*)::int FROM public.nodes WHERE metadata ->> 'manifest' = 'v2-p2025-corpus-2026-08-19') AS seeded_nodes,
  (SELECT count(*)::int FROM public.edges WHERE metadata ->> 'manifest' = 'v2-p2025-corpus-2026-08-19') AS seeded_edges,
  (SELECT count(*)::int FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = 'project-2025-doj-track1-implementation')) AS seeded_arc_events
LIMIT 1;
