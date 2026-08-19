import { readFileSync, writeFileSync } from 'node:fs'

const [news2025Path, news2026Path, outputPath] = process.argv.slice(2)
if (!news2025Path || !news2026Path || !outputPath) {
  throw new Error('Usage: node generate_p2025_cross_surface_seed.mjs 2025.json 2026.json output.sql')
}

const sql = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`
const json = (value) => `${sql(JSON.stringify(value))}::jsonb`
const date = (value) => `TIMESTAMPTZ ${sql(String(value).replace('T08:00:00.000Z', ' 00:00:00+00').replace('T07:00:00.000Z', ' 00:00:00+00'))}`
const slugify = (value) => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80)

const news2025 = JSON.parse(readFileSync(news2025Path, 'utf8')).articles
const news2026 = JSON.parse(readFileSync(news2026Path, 'utf8')).articles
const allNews = [...news2025, ...news2026]
const byUrl = new Map()
for (const article of allNews) byUrl.set(article.publisher_url, article)
const news = [...byUrl.values()].sort((a, b) => a.published_at.localeCompare(b.published_at) || a.publisher_url.localeCompare(b.publisher_url))

const primary = [
  {
    outlet: 'U.S. Department of Justice',
    title: 'Reinstating the Prohibition on Improper Third-Party Settlements',
    url: 'https://www.justice.gov/ag/media/1388536/dl?inline',
    published_at: '2025-02-05T00:00:00+00',
    summary: 'Attorney General memorandum rescinding two prior memoranda concerning payments to non-governmental third parties and directing a follow-on report on strategies and measures concerning improper payments.',
    body_text: 'Primary DOJ memorandum curated for the isolated v2 cross-surface seed. See the source URL for the full memorandum.',
  },
  {
    outlet: 'U.S. Department of Justice',
    title: 'The U.S. Department of Justice’s Civil Rights Division Dismisses Biden-Era Police Investigations and Proposed Police Consent Decrees in Louisville and Minneapolis',
    url: 'https://www.justice.gov/opa/pr/us-department-justices-civil-rights-division-dismisses-biden-era-police-investigations-and',
    published_at: '2025-05-21T00:00:00+00',
    summary: 'DOJ stated that its Civil Rights Division was beginning dismissal steps for the Louisville and Minneapolis lawsuits and closing specified investigations.',
    body_text: 'Primary DOJ release curated for the isolated v2 cross-surface seed. See the source URL for the full release.',
  },
  {
    outlet: 'U.S. Department of Justice',
    title: 'Justice Department Supports Seattle’s Motion to Terminate Police Department Consent Decree',
    url: 'https://www.justice.gov/opa/pr/justice-department-supports-seattles-motion-terminate-police-department-consent-decree',
    published_at: '2025-07-23T00:00:00+00',
    summary: 'DOJ stated that its Civil Rights Division filed a response supporting Seattle’s motion to terminate the police-department consent decree.',
    body_text: 'Primary DOJ release curated for the isolated v2 cross-surface seed. See the source URL for the full release.',
  },
  {
    outlet: 'U.S. Department of Justice',
    title: 'Federal Court Grants Justice Department’s Motion to Terminate 47-Year-Old Consent Decree Governing Employment by City of Norfolk’s Police and Fire Departments',
    url: 'https://www.justice.gov/opa/pr/federal-court-grants-justice-departments-motion-terminate-47-year-old-consent-decree',
    published_at: '2025-08-13T00:00:00+00',
    summary: 'DOJ stated that the Eastern District of Virginia granted its motion to terminate the 1978 Norfolk consent decree governing police and firefighter employment.',
    body_text: 'Primary DOJ release curated for the isolated v2 cross-surface seed. See the source URL for the full release.',
  },
]

const events = [
  {
    slug: 'evt-p2025-third-party-settlement-policy-20250205',
    docSlug: 'doc-p2025-doj-third-party-settlement-memo-20250205',
    title: 'Attorney General rescinded two prior third-party-settlement payment memoranda',
    occurredAt: '2025-02-05',
    category: 'accountability',
    description: 'The Attorney General’s memorandum rescinded the May 5, 2022 and July 28, 2023 memoranda concerning payments to non-governmental third parties and directed a report on strategies and measures concerning improper payments.',
    uncertainty: 'The memorandum establishes the stated rescissions and direction; it does not establish the effectiveness, completion, or universal application of the requested follow-on measures.',
    primaryUrl: primary[0].url,
    primaryTitle: primary[0].title,
  },
  {
    slug: 'evt-p2025-doj-louisville-minneapolis-20250521',
    docSlug: 'doc-p2025-doj-louisville-minneapolis-release-20250521',
    title: 'DOJ announced dismissal steps for Louisville and Minneapolis actions',
    occurredAt: '2025-05-21',
    category: 'accountability',
    description: 'DOJ stated that its Civil Rights Division was beginning dismissal steps for the Louisville and Minneapolis lawsuits and closing specified investigations.',
    uncertainty: 'The release documents the announced steps; it does not establish a comprehensive review of all consent decrees or an aggregate policy outcome.',
    primaryUrl: primary[1].url,
    primaryTitle: primary[1].title,
  },
  {
    slug: 'evt-p2025-seattle-decree-response-20250723',
    docSlug: 'doc-p2025-doj-seattle-release-20250723',
    title: 'DOJ announced support for Seattle termination motion',
    occurredAt: '2025-07-23',
    category: 'accountability',
    description: 'DOJ stated that its Civil Rights Division filed a response supporting Seattle’s motion to terminate the police-department consent decree.',
    uncertainty: 'The release documents a filed response and stated support, not the court’s final disposition or a general result for other decrees.',
    primaryUrl: primary[2].url,
    primaryTitle: primary[2].title,
  },
  {
    slug: 'evt-p2025-norfolk-decree-termination-20250813',
    docSlug: 'doc-p2025-doj-norfolk-release-20250813',
    title: 'Court granted DOJ motion regarding Norfolk decree',
    occurredAt: '2025-08-13',
    category: 'accountability',
    description: 'DOJ stated that the Eastern District of Virginia granted its motion to terminate the 1978 Norfolk consent decree governing police and firefighter employment.',
    uncertainty: 'The release documents the named Norfolk court action; it does not establish a general outcome for other consent decrees.',
    primaryUrl: primary[3].url,
    primaryTitle: primary[3].title,
  },
]

const arcSlug = 'project-2025-doj-track1-implementation'
const manifest = 'v2-p2025-corpus-2026-08-19'
const arcTitle = 'Project 2025 — DOJ Track 1 source-mapped implementation record'
const allArticles = [
  ...news.map((a) => ({
    outlet: a.source,
    title: a.title,
    url: a.publisher_url,
    published_at: a.published_at,
    summary: `Published ${a.published_at.slice(0, 10)} coverage from ${a.source}. The headline is retained as attribution metadata, not as a platform finding or an implementation determination.`,
    body_text: 'Public publisher metadata record curated for the isolated v2 source-mapped corpus. Consult the source URL for full reporting.',
    feed: 'p2025-public-news-verified',
    statusNote: 'Direct publisher URL recovered from a dated public news record. Article text was not copied; source lineage is not verified.',
  })),
  ...primary.map((a) => ({ ...a, feed: 'p2025-primary-records', statusNote: 'Primary DOJ record manually curated from the official source URL.' })),
]

const articleValues = allArticles.map((a) => `(
  ${sql(a.feed)}, ${sql(a.outlet)}, ${sql(a.title)}, ${sql(a.url)}, ${sql(a.summary)}, ${date(a.published_at)},
  ${sql(a.body_text)}, '[]'::jsonb, (SELECT id FROM public.story_arcs WHERE slug = ${sql(arcSlug)}),
  false, false, false, now(), now(), ${sql(manifest)}, 'active', ${sql(a.statusNote)}
)`).join(',\n')

const nodeValues = [
  `(
    'arc-project-2025-doj-track1-implementation', ${sql(arcTitle)}, 'policy',
    'A bounded, source-mapped record of Project 2025-related reporting and named DOJ actions. Arc membership organizes coverage and does not establish that a reporting item caused, comprehensively measured, or validated an implementation outcome.',
    ${json({ manifest, scope: 'source_mapped_reporting_and_named_doj_actions', causal_claim: false })}, NULL,
    'Bounded source-mapped grouping; reporting coverage and policy actions remain distinct.', DATE '2025-01-20',
    (SELECT id FROM public.story_arcs WHERE slug = ${sql(arcSlug)})
  )`,
  ...events.flatMap((e) => [
    `(
      ${sql(e.slug)}, ${sql(e.title)}, 'event', ${sql(e.description)},
      ${json({ manifest, article_url: e.primaryUrl, evidence_class: 'primary_doj_record', causal_claim: false })}, NULL,
      ${sql(`Primary-source event record. ${e.uncertainty}`)}, DATE ${sql(e.occurredAt)},
      (SELECT id FROM public.story_arcs WHERE slug = ${sql(arcSlug)})
    )`,
    `(
      ${sql(e.docSlug)}, ${sql(`DOJ primary record: ${e.primaryTitle}`)}, 'document',
      ${sql(`Official DOJ primary record dated ${e.occurredAt}.`)},
      ${json({ manifest, url: e.primaryUrl, source_type: 'primary_record' })}, NULL,
      'Official primary source document.', DATE ${sql(e.occurredAt)},
      (SELECT id FROM public.story_arcs WHERE slug = ${sql(arcSlug)})
    )`,
  ]),
].join(',\n')

const arcEventTitles = events.map((e) => sql(e.title)).join(', ')
const arcEventValues = events.map((e) => `SELECT id, ${sql(e.title)}, ${sql(e.category)}, 'confirmed', DATE ${sql(e.occurredAt)}, ${sql(`Source-linked primary DOJ record. ${e.uncertainty}`)} FROM public.story_arcs WHERE slug = ${sql(arcSlug)}`).join('\nUNION ALL\n')
const primaryUrls = primary.map((p) => sql(p.url)).join(', ')
const eventSourceInsert = events.map((e) => `SELECT n.id, 'U.S. Department of Justice', ${sql(e.primaryTitle)}, ${sql(e.primaryUrl)}, DATE ${sql(e.occurredAt)} FROM public.nodes n WHERE n.slug = ${sql(e.slug)}`).join('\nUNION ALL\n')
const actorEdgeValues = events.map((e) => `SELECT i.id, e.id, 'actor', 'medium', 'actor: named DOJ action', ${json({ manifest, evidence: 'Named in the linked DOJ primary record.' })}, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes i JOIN public.nodes e ON e.slug = ${sql(e.slug)} WHERE i.slug = 'institution-doj-civil-rights-division'`).join('\nUNION ALL\n')
const documentaryEdgeValues = events.map((e) => `SELECT e.id, d.id, 'documentary', 'medium', 'documentary: official DOJ primary record', ${json({ manifest, evidence: 'The event summary is limited to the linked official DOJ record.' })}, NULL::numeric, false, 'citation', 'documented', 'source_document', 'supports', '[]'::jsonb, '[]'::jsonb, NULL::text, 1 FROM public.nodes e JOIN public.nodes d ON d.slug = ${sql(e.docSlug)} WHERE e.slug = ${sql(e.slug)}`).join('\nUNION ALL\n')

const output = `-- Isolated v2 only. Generated from real dated publisher records plus four official DOJ records.\n-- Manifest: ${manifest}\n-- Scope: ${news.length} publisher records (2025–2026) + ${primary.length} primary DOJ records; no article body copying; no causal inference.\n-- Rollback: delete rows where ingestion_run_id = '${manifest}', and graph/arc rows whose metadata.manifest = '${manifest}'.\n\nBEGIN;\n\nINSERT INTO public.story_arcs (slug, title, category, status, coverage_gap, summary, started_at, category_confidence, category_evidence, title_article_count)\nVALUES (\n  ${sql(arcSlug)}, ${sql(arcTitle)}, 'institutional_accountability', 'active', true,\n  'A bounded source-mapped record of dated public reporting and four named DOJ primary actions. It does not determine whether Project 2025 caused an action, whether all goals were implemented, or whether the selected corpus is comprehensive.',\n  DATE '2025-01-20', NULL, 'Manual source-mapped grouping; no composite score or causal determination.', ${allArticles.length}\n)\nON CONFLICT (slug) DO UPDATE SET\n  title = EXCLUDED.title, category = EXCLUDED.category, status = EXCLUDED.status, coverage_gap = EXCLUDED.coverage_gap, summary = EXCLUDED.summary, started_at = EXCLUDED.started_at, category_confidence = NULL, category_evidence = EXCLUDED.category_evidence, title_article_count = EXCLUDED.title_article_count, last_update_at = now();\n\nINSERT INTO public.nodes (slug, label, type, description, metadata, confidence, summary, occurred_at, arc_id)\nVALUES\n${nodeValues}\nON CONFLICT (slug) DO UPDATE SET\n  label = EXCLUDED.label, type = EXCLUDED.type, description = EXCLUDED.description, metadata = EXCLUDED.metadata, confidence = NULL, summary = EXCLUDED.summary, occurred_at = EXCLUDED.occurred_at, arc_id = EXCLUDED.arc_id, updated_at = now();\n\nUPDATE public.story_arcs a\nSET root_node_id = n.id, last_update_at = now()\nFROM public.nodes n\nWHERE a.slug = ${sql(arcSlug)} AND n.slug = 'arc-project-2025-doj-track1-implementation';\n\nINSERT INTO public.articles (feed, outlet, title, url, summary, published_at, body_text, claims, arc_id, unattributed, monoculture, is_digest, entities_extracted_at, arc_assign_attempted_at, ingestion_run_id, source_status, source_status_note)\nVALUES\n${articleValues}\nON CONFLICT (url) DO UPDATE SET\n  feed = EXCLUDED.feed, outlet = EXCLUDED.outlet, title = EXCLUDED.title, summary = EXCLUDED.summary, published_at = EXCLUDED.published_at, body_text = EXCLUDED.body_text, claims = EXCLUDED.claims, arc_id = EXCLUDED.arc_id, unattributed = false, monoculture = false, is_digest = false, entities_extracted_at = now(), arc_assign_attempted_at = now(), ingestion_run_id = EXCLUDED.ingestion_run_id, source_status = EXCLUDED.source_status, source_status_note = EXCLUDED.source_status_note;\n\nDELETE FROM public.arc_events\nWHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = ${sql(arcSlug)})\n  AND title IN (${arcEventTitles});\n\nINSERT INTO public.arc_events (arc_id, title, category, confidence, occurred_at, description)\n${arcEventValues};\n\nDELETE FROM public.sources\nWHERE url IN (${primaryUrls})\n  AND node_id IN (SELECT id FROM public.nodes WHERE metadata ->> 'manifest' = ${sql(manifest)});\n\nINSERT INTO public.sources (node_id, outlet, headline, url, published_at)\n${eventSourceInsert};\n\nDELETE FROM public.edges WHERE metadata ->> 'manifest' = ${sql(manifest)};\n\nINSERT INTO public.edges (source_id, target_id, type, weight, label, metadata, similarity, sky_verified, signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes, counterfactual_test, reliability)\n${actorEdgeValues}\nON CONFLICT (source_id, target_id, type) DO UPDATE SET\n  weight = EXCLUDED.weight, label = EXCLUDED.label, metadata = EXCLUDED.metadata, similarity = NULL, sky_verified = false, signal_source = EXCLUDED.signal_source, doc_strength = EXCLUDED.doc_strength, claimed_by = EXCLUDED.claimed_by, stance = EXCLUDED.stance, disputed_by = EXCLUDED.disputed_by, alternative_causes = EXCLUDED.alternative_causes, counterfactual_test = NULL, reliability = EXCLUDED.reliability;\n\nINSERT INTO public.edges (source_id, target_id, type, weight, label, metadata, similarity, sky_verified, signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes, counterfactual_test, reliability)\n${documentaryEdgeValues}\nON CONFLICT (source_id, target_id, type) DO UPDATE SET\n  weight = EXCLUDED.weight, label = EXCLUDED.label, metadata = EXCLUDED.metadata, similarity = NULL, sky_verified = false, signal_source = EXCLUDED.signal_source, doc_strength = EXCLUDED.doc_strength, claimed_by = EXCLUDED.claimed_by, stance = EXCLUDED.stance, disputed_by = EXCLUDED.disputed_by, alternative_causes = EXCLUDED.alternative_causes, counterfactual_test = NULL, reliability = EXCLUDED.reliability;\n\nUPDATE public.story_arcs\nSET seed_article_id = (SELECT id FROM public.articles WHERE url = ${sql(primary[0].url)}), last_update_at = now()\nWHERE slug = ${sql(arcSlug)};\n\nCOMMIT;\n\nSELECT\n  (SELECT count(*)::int FROM public.articles WHERE ingestion_run_id = ${sql(manifest)}) AS seeded_articles,\n  (SELECT count(*)::int FROM public.nodes WHERE metadata ->> 'manifest' = ${sql(manifest)}) AS seeded_nodes,\n  (SELECT count(*)::int FROM public.edges WHERE metadata ->> 'manifest' = ${sql(manifest)}) AS seeded_edges,\n  (SELECT count(*)::int FROM public.arc_events WHERE arc_id = (SELECT id FROM public.story_arcs WHERE slug = ${sql(arcSlug)})) AS seeded_arc_events\nLIMIT 1;\n`

writeFileSync(outputPath, output)
console.log(JSON.stringify({ outputPath, newsRecords: news.length, primaryRecords: primary.length, articleRecords: allArticles.length, eventRecords: events.length }, null, 2))
