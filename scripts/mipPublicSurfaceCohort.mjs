import { createHash } from 'node:crypto'

// Exact Manus Source Comparison cohort. Graph-event identity is not inferred
// from this event id or from article titles.
export const CYCLOSPORA_EVENT = {
  id: '8e4f9812-0afa-4aad-ada8-6fb556da70d9',
  canonical_title: 'Two Deaths Linked to Cyclospora Outbreak in Michigan',
  occurred_at_start: '2026-08-03',
  occurred_at_end: '2026-08-03',
  status: 'candidate',
  rule_version: 'original-readonly-import|8e4f9812-0afa-4aad-ada8-6fb556da70d9',
  comparison_validation_state: 'approved',
  created_at: '2026-08-09T06:53:33.912459+00',
}

export const CYCLOSPORA_ARTICLES = [
  {
    id: '575d4113-cbae-49af-94fc-e2858310ec4c',
    feed: 'fox-news',
    outlet: 'Fox News',
    title: 'Michigan reports 2 deaths in rare parasite outbreak that has sickened more than 11,000',
    url: 'https://www.foxnews.com/health/michigan-reports-deaths-rare-parasite-outbreak-sickened-more-than-11000',
    summary: "Two deaths linked to Michigan's cyclosporiasis outbreak had significant underlying health conditions impacted by the intestinal parasite and dehydration, health officials said.",
    published_at: '2026-08-03T17:56:32+00',
    fetched_at: '2026-08-03T18:20:14.361218+00',
    reader_state: 'eligible',
    source_status: 'active',
    unattributed: true,
    monoculture: true,
    claims: [
      { kind: 'substantive', text: 'Michigan reports 2 deaths in rare parasite outbreak that has sickened more than 11,000.' },
      { kind: 'substantive', text: "Two deaths linked to Michigan's cyclosporiasis outbreak had significant underlying health conditions impacted by the intestinal parasite and dehydration, health officials said." },
    ],
  },
  {
    id: '7b40ed41-39ad-42e0-baae-da888a77caf4',
    feed: 'new-york-times',
    outlet: 'New York Times',
    title: 'Two Deaths Linked to Cyclospora Outbreak in Michigan',
    url: 'https://www.nytimes.com/2026/08/03/well/eat/cyclospora-deaths-michigan.html',
    summary: 'The patients had “significant underlying health conditions” that may have contributed to their deaths, health officials said.',
    published_at: '2026-08-03T16:55:49+00',
    fetched_at: '2026-08-03T18:51:57.206813+00',
    reader_state: 'eligible',
    source_status: 'active',
    unattributed: false,
    monoculture: true,
    claims: [
      { kind: 'substantive', text: 'Two Deaths Linked to Cyclospora Outbreak in Michigan.' },
      { kind: 'framing', text: 'The patients had “significant underlying health conditions” that may have contributed to their deaths, health officials said.' },
    ],
  },
  {
    id: 'cc68af15-2f7a-4d40-b689-cd95a9ee7830',
    feed: 'al-jazeera',
    outlet: 'Al Jazeera',
    title: 'US announces first two deaths from cyclospora outbreak',
    url: 'https://www.aljazeera.com/news/2026/8/3/us-announces-first-two-deaths-from-cyclospora-outbreak?traffic_source=rss',
    summary: 'Authorities in the Midwestern state of Michigan say that two people who died had underlying conditions.',
    published_at: '2026-08-03T18:35:09+00',
    fetched_at: '2026-08-03T18:51:54.279201+00',
    reader_state: 'eligible',
    source_status: 'active',
    unattributed: true,
    monoculture: false,
    claims: [
      { kind: 'substantive', text: 'US announces first two deaths from cyclospora outbreak.' },
      { kind: 'substantive', text: 'Authorities in the Midwestern state of Michigan say that two people who died had underlying conditions.' },
    ],
  },
]

export const CYCLOSPORA_CLAIMS = [
  {
    id: '9110be0a-8fec-4ae4-beb9-5ce271e53c6a',
    canonical_text: 'Two Deaths Linked to Cyclospora Outbreak in Michigan.',
    claim_kind: 'fact',
    thin_extraction: false,
    status: 'active',
    rule_version: 'sc-v2-event-projection',
  },
  {
    id: 'da069e6a-c7cf-424c-a043-3b27d41db18b',
    canonical_text: 'The patients had “significant underlying health conditions” that may have contributed to their deaths, health officials said.',
    claim_kind: 'fact',
    thin_extraction: false,
    status: 'active',
    rule_version: 'sc-v2-event-projection',
  },
  {
    id: 'b15f704d-a47f-4ddd-8ffa-682824c9d1cc',
    canonical_text: 'Michigan reports 2 deaths in rare parasite outbreak that has sickened more than 11,000.',
    claim_kind: 'fact',
    thin_extraction: false,
    status: 'active',
    rule_version: 'sc-v2-event-projection',
  },
  {
    id: 'b8486da3-a2df-4c25-98c7-e9800b283b29',
    canonical_text: 'Authorities in the Midwestern state of Michigan say that two people who died had underlying conditions.',
    claim_kind: 'fact',
    thin_extraction: false,
    status: 'active',
    rule_version: 'sc-v2-event-projection',
  },
]

export const CYCLOSPORA_EVENT_ARTICLES = [
  { event_id: CYCLOSPORA_EVENT.id, article_id: '575d4113-cbae-49af-94fc-e2858310ec4c', membership_method: 'embedding_cluster', membership_confidence: 0.9592314656083035 },
  { event_id: CYCLOSPORA_EVENT.id, article_id: '7b40ed41-39ad-42e0-baae-da888a77caf4', membership_method: 'embedding_cluster', membership_confidence: 0.9592314656083035 },
  { event_id: CYCLOSPORA_EVENT.id, article_id: 'cc68af15-2f7a-4d40-b689-cd95a9ee7830', membership_method: 'embedding_cluster', membership_confidence: 0.9561659454632593 },
]

export const CYCLOSPORA_ARTICLE_CLAIMS = [
  {
    id: '1d890f25-538e-4127-8b42-d4ea8b200ca0',
    claim_id: 'b15f704d-a47f-4ddd-8ffa-682824c9d1cc',
    article_id: '575d4113-cbae-49af-94fc-e2858310ec4c',
    surface_text: 'Michigan reports 2 deaths in rare parasite outbreak that has sickened more than 11,000.',
    auditability_state: 'verified_retained_source',
  },
  {
    id: '296f45a5-8bcc-42ca-941f-8eda0b66f283',
    claim_id: '9110be0a-8fec-4ae4-beb9-5ce271e53c6a',
    article_id: '575d4113-cbae-49af-94fc-e2858310ec4c',
    surface_text: "Two deaths linked to Michigan's cyclosporiasis outbreak had significant underlying health conditions impacted by the intestinal parasite and dehydration, health officials said.",
    auditability_state: 'verified_retained_source',
  },
  {
    id: '887e3f0d-a88a-4705-b899-f6f884f14f64',
    claim_id: 'da069e6a-c7cf-424c-a043-3b27d41db18b',
    article_id: '7b40ed41-39ad-42e0-baae-da888a77caf4',
    surface_text: 'The patients had “significant underlying health conditions” that may have contributed to their deaths, health officials said.',
    auditability_state: 'verified_retained_source',
  },
  {
    id: 'b924cf61-cf38-4317-8023-21ca8c340425',
    claim_id: '9110be0a-8fec-4ae4-beb9-5ce271e53c6a',
    article_id: '7b40ed41-39ad-42e0-baae-da888a77caf4',
    surface_text: 'Two Deaths Linked to Cyclospora Outbreak in Michigan.',
    auditability_state: 'verified_retained_source',
  },
  {
    id: '07332b86-5ba2-4bd8-b306-98df6507b840',
    claim_id: '9110be0a-8fec-4ae4-beb9-5ce271e53c6a',
    article_id: 'cc68af15-2f7a-4d40-b689-cd95a9ee7830',
    surface_text: 'US announces first two deaths from cyclospora outbreak.',
    auditability_state: 'verified_retained_source',
  },
  {
    id: 'f041c734-a55e-4660-94d1-0346e28406b5',
    claim_id: 'b8486da3-a2df-4c25-98c7-e9800b283b29',
    article_id: 'cc68af15-2f7a-4d40-b689-cd95a9ee7830',
    surface_text: 'Authorities in the Midwestern state of Michigan say that two people who died had underlying conditions.',
    auditability_state: 'verified_retained_source',
  },
]

export const TIMELINE_ARC = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  slug: 'cyclospora-michigan-2026',
  title: 'Cyclospora outbreak, Michigan 2026',
  category: 'public-health',
  status: 'active',
}

export const TIMELINE_ARC_EVENT = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  arc_id: TIMELINE_ARC.id,
  title: 'Health officials report two Michigan deaths',
  category: 'public-health',
  confidence: 'confirmed',
  occurred_at: '2026-08-03',
  description: 'Stored Timeline row. Not a Source Comparison event and not a graph node.',
}

export const FRONTEND_RELATIONS = [
  'graph_coverage_public',
  'policy_actors',
  'policy_topics',
  'topics',
  'arc_milestones_public',
  'arc_events',
  'comparison_public',
  'authors_public',
  'citations',
  'news_detail_public',
  'sky_verifications',
]

export const REMAINING_FRONTEND_DEPS = [
  'node_topics',
  'node_location_mentions',
  'explanations',
  'p3_legal_case',
  'p3_legal_case_evidence',
  'p3_policy',
  'p3_policy_track_event',
  'events',
  'event_articles',
  'claims',
  'article_claims',
  'claim_evidence_links',
  'claim_corrections',
  'arc_milestones',
  'entities',
]

export function eventKey(eventId) {
  return createHash('md5').update(eventId).digest('hex')
}

export async function insertCyclosporaCohort(db) {
  for (const article of CYCLOSPORA_ARTICLES) {
    await db.query(
      `insert into public.articles(
         id, feed, outlet, title, url, summary, published_at, fetched_at,
         reader_state, source_status, unattributed, monoculture, claims
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
       on conflict (url) do nothing`,
      [
        article.id, article.feed, article.outlet, article.title, article.url,
        article.summary, article.published_at, article.fetched_at,
        article.reader_state, article.source_status, article.unattributed,
        article.monoculture, JSON.stringify(article.claims),
      ],
    )
  }

  await db.query(
    `insert into public.events(
       id, canonical_title, occurred_at_start, occurred_at_end, status,
       rule_version, comparison_validation_state, created_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (id) do nothing`,
    [
      CYCLOSPORA_EVENT.id, CYCLOSPORA_EVENT.canonical_title,
      CYCLOSPORA_EVENT.occurred_at_start, CYCLOSPORA_EVENT.occurred_at_end,
      CYCLOSPORA_EVENT.status, CYCLOSPORA_EVENT.rule_version,
      CYCLOSPORA_EVENT.comparison_validation_state, CYCLOSPORA_EVENT.created_at,
    ],
  )

  for (const row of CYCLOSPORA_EVENT_ARTICLES) {
    await db.query(
      `insert into public.event_articles(event_id, article_id, membership_method, membership_confidence)
       values ($1,$2,$3,$4) on conflict (event_id, article_id) do nothing`,
      [row.event_id, row.article_id, row.membership_method, row.membership_confidence],
    )
  }

  for (const claim of CYCLOSPORA_CLAIMS) {
    await db.query(
      `insert into public.claims(id, event_id, canonical_text, claim_kind, thin_extraction, status, rule_version)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`,
      [claim.id, CYCLOSPORA_EVENT.id, claim.canonical_text, claim.claim_kind, claim.thin_extraction, claim.status, claim.rule_version],
    )
  }

  for (const surface of CYCLOSPORA_ARTICLE_CLAIMS) {
    await db.query(
      `insert into public.article_claims(id, claim_id, article_id, surface_text, auditability_state, is_current)
       values ($1,$2,$3,$4,$5,true) on conflict (id) do nothing`,
      [surface.id, surface.claim_id, surface.article_id, surface.surface_text, surface.auditability_state],
    )
  }

  await db.query(
    `insert into public.story_arcs(id, slug, title, category, status)
     values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
    [TIMELINE_ARC.id, TIMELINE_ARC.slug, TIMELINE_ARC.title, TIMELINE_ARC.category, TIMELINE_ARC.status],
  )
  await db.query(
    `insert into public.arc_events(id, arc_id, title, category, confidence, occurred_at, description)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`,
    [
      TIMELINE_ARC_EVENT.id, TIMELINE_ARC_EVENT.arc_id, TIMELINE_ARC_EVENT.title,
      TIMELINE_ARC_EVENT.category, TIMELINE_ARC_EVENT.confidence,
      TIMELINE_ARC_EVENT.occurred_at, TIMELINE_ARC_EVENT.description,
    ],
  )
  await db.query(
    `insert into public.arc_milestones(id, arc_id, title, status)
     values ($1,$2,$3,'pending') on conflict (id) do nothing`,
    ['cccccccc-cccc-4ccc-8ccc-ccccccccccc1', TIMELINE_ARC.id, 'Official confirmation of outbreak deaths'],
  )

  return {
    event_id: CYCLOSPORA_EVENT.id,
    event_key: eventKey(CYCLOSPORA_EVENT.id),
    article_ids: CYCLOSPORA_ARTICLES.map((row) => row.id),
    graph_event_ids: [],
  }
}

export async function insertLedgerSample(db, mappings, conflicts) {
  for (const row of mappings) {
    await db.query(
      `insert into public.original_source_import_mappings(
         source_project_ref, source_table, source_id, target_id, source_url, imported_at
       ) values ($1,$2,$3,$4,$5,$6)
       on conflict (source_project_ref, source_table, source_id) do nothing`,
      [row.source_project_ref, row.source_table, row.source_id, row.target_id, row.source_url ?? null, row.imported_at ?? new Date().toISOString()],
    )
  }
  for (const row of conflicts) {
    await db.query(
      `insert into public.original_source_import_conflicts(
         id, source_project_ref, run_key, source_table, source_id, target_id,
         source_url, conflict_kind, affected_fields, recovery_status, details, detected_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       on conflict (source_project_ref, run_key, source_table, source_id, conflict_kind) do nothing`,
      [
        row.id, row.source_project_ref, row.run_key, row.source_table, row.source_id,
        row.target_id ?? null, row.source_url ?? null, row.conflict_kind,
        row.affected_fields ?? [], row.recovery_status, JSON.stringify(row.details ?? {}),
        row.detected_at ?? new Date().toISOString(),
      ],
    )
  }
}

export function hashRows(rows, fields) {
  const normalized = [...rows]
    .map((row) => fields.map((field) => String(row[field] ?? '')).join('\t'))
    .sort()
    .join('\n')
  return createHash('sha256').update(normalized).digest('hex')
}
