import { readFile } from 'node:fs/promises'
import { reconcileBatch, IDENTITY_DECISIONS } from './mipIdentityReconciliation.mjs'
import { reconcileSourceRegisters, assertCollectionDisabled } from './mipSourceRegisters.mjs'
import { candidateFromExactSource, scoreArcCandidate, scoreComparisonCluster, membershipDecisionToPromotion } from './algorithmEvidenceAdapter.mjs'

export const DESTINATION_FOUNDATION_SQL = `
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema spatial;
create table public.articles (
  id uuid primary key default gen_random_uuid(), feed text not null, outlet text not null, title text not null, url text not null unique,
  summary text, body_text text, published_at timestamptz, fetched_at timestamptz not null default now(),
  ingestion_run_id text, reader_state text not null default 'pending_review' check(reader_state in ('eligible','pending_review','withheld')),
  source_status text not null default 'active' check(source_status in ('active','corrected','withdrawn')), claims jsonb default '[]'
);
create table public.nodes (
  id uuid primary key default gen_random_uuid(), slug text, label text not null, type text not null,
  description text, metadata jsonb default '{}', created_at timestamptz default now(), updated_at timestamptz default now(),
  confidence integer, summary text, occurred_at date, arc_id uuid, arc_membership_candidate_id uuid
);
create table public.geographic_places (id uuid primary key default gen_random_uuid(), canonical_name text);
create table public.pipeline_config (key text primary key, value jsonb);
create table public.story_arcs (id uuid primary key default gen_random_uuid());
create table public.outlets (id uuid primary key default gen_random_uuid());
create table public.authors (id uuid primary key default gen_random_uuid());
create table public.policies (id uuid primary key default gen_random_uuid());
create table public.arc_membership_candidates (id uuid primary key default gen_random_uuid());
create table public.sources (
  id uuid primary key default gen_random_uuid(), node_id uuid not null references public.nodes(id),
  outlet text not null, headline text not null, url text, published_at date, created_at timestamptz default now()
);
create table spatial.assertions (id uuid primary key default gen_random_uuid(), graph_node_id uuid references public.nodes(id));
create table spatial.assertion_revisions (
  id uuid primary key default gen_random_uuid(),
  spatial_assertion_id uuid references spatial.assertions(id),
  canonical_place_id uuid references public.geographic_places(id)
);
create view public.spatial_projection_v1 as
  select r.id revision_id, r.canonical_place_id, a.graph_node_id subject_graph_node_id
  from spatial.assertion_revisions r
  join spatial.assertions a on a.id = r.spatial_assertion_id;
grant usage on schema public to anon, authenticated, service_role;
grant select on public.nodes, public.geographic_places, public.spatial_projection_v1 to anon, authenticated, service_role;
alter table public.articles enable row level security;
grant select on public.articles to anon, authenticated;
create policy reader_eligibility on public.articles for select to anon, authenticated using (reader_state='eligible' and source_status='active');
`

export const MANUS_SOURCE_FIXTURE = {
  ingest_sources: [
    { outlet_id: 'cf138ed9-2068-4c4b-86c3-b2e52afa077c', feed_url: 'https://feeds.bbci.co.uk/news/world/rss.xml', label: 'BBC World' },
    { outlet_id: 'a04002c2-d79e-4d49-923f-d9605c2a804e', feed_url: 'https://www.theguardian.com/world/rss', label: 'Guardian World' },
  ],
  ingestion_sources: [
    { source_key: 'bbc-news-rss', label: 'BBC News RSS', source_url: 'https://feeds.bbci.co.uk/news/rss.xml', source_type: 'rss' },
    { source_key: 'gdelt-public-news-discovery', label: 'GDELT DOC 2.0 public-news discovery', source_url: 'https://api.gdeltproject.org/api/v2/doc/doc', source_type: 'gdelt_doc_api' },
  ],
}

export const RECORDED_GAPS = [
  {
    source: {
      source_project_ref: 'niejaejtbxgakyrsntxm',
      source_table: 'articles',
      source_id: '11111111-1111-4111-8111-111111111111',
      url: 'https://example.org/historical-gap',
      recovery_status: 'not_restorable_no_pre_import_snapshot',
    },
  },
  {
    source: {
      source_project_ref: 'niejaejtbxgakyrsntxm',
      source_table: 'articles',
      source_id: '22222222-2222-4222-8222-222222222222',
      title: 'Mapped',
      url: 'https://example.org/already-mapped',
    },
    target: { id: '33333333-3333-4333-8333-333333333333', title: 'Mapped', url: 'https://example.org/already-mapped' },
  },
]

export const EXISTING_MAPPINGS = [
  {
    source_project_ref: 'niejaejtbxgakyrsntxm',
    source_table: 'articles',
    source_id: '22222222-2222-4222-8222-222222222222',
    target_id: '33333333-3333-4333-8333-333333333333',
    source_url: 'https://example.org/already-mapped',
  },
]

export const ECLIPSE_ARTICLE = {
  url: 'https://science.nasa.gov/eclipses/future-eclipses/eclipse-2024/where-when/',
  title: '2024 Total Eclipse: Where & When',
  outlet: 'NASA Science',
  summary: 'NASA table of 2024-04-08 totality times including Cleveland, Ohio: partial 1:59 p.m. EDT, totality 3:13-3:17 p.m. EDT, maximum 3:15 p.m. EDT, partial ends 4:29 p.m. EDT.',
}

export async function applyConsolidationDelta(db) {
  const delta = await readFile(new URL('../supabase/migrations/20260905151626_mip_consolidation_delta.sql', import.meta.url), 'utf8')
  await db.exec(delta)
}

export async function applyEventScopedPublicArticleCounts(db) {
  const eventScoped = await readFile(new URL('../supabase/migrations/20260905160001_event_scoped_public_article_counts.sql', import.meta.url), 'utf8')
  await db.exec(eventScoped)
}

export const PUBLIC_SURFACE_TRANSFER_CHUNKS = [
  '20260905172453_mip_public_surface_transfer.sql',
  '20260905172517_mip_public_surface_stub_reconcile.sql',
  '20260905172527_mip_public_surface_predicates.sql',
  '20260905172543_mip_public_surface_tables.sql',
  '20260905172558_mip_public_surface_topics_rls.sql',
  '20260905172611_mip_public_surface_views.sql',
]

export const PUBLIC_SURFACE_PUBLICATION_GATES =
  '20260905180142_mip_public_surface_publication_gates.sql'

export const COMBINED_PUBLIC_SURFACE_DRAFT =
  '20260905174500_mip_public_surface_transfer.sql'

export async function applyMigrationFile(db, filename) {
  const sql = await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')
  await db.exec(sql)
}

export async function applyPublicSurfaceTransfer(db) {
  for (const filename of PUBLIC_SURFACE_TRANSFER_CHUNKS) {
    await applyMigrationFile(db, filename)
  }
}

export async function applyPublicSurfacePublicationGates(db) {
  await applyMigrationFile(db, PUBLIC_SURFACE_PUBLICATION_GATES)
}

export async function applyFoundation(db) {
  await db.exec(DESTINATION_FOUNDATION_SQL)
  const pipeline = await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql', import.meta.url), 'utf8')
  await db.exec(pipeline)
  await applyConsolidationDelta(db)
  await applyEventScopedPublicArticleCounts(db)
  await applyPublicSurfaceTransfer(db)
  await applyPublicSurfacePublicationGates(db)
}

export function restoreSourceRegisters() {
  const reconciled = reconcileSourceRegisters(MANUS_SOURCE_FIXTURE.ingest_sources, MANUS_SOURCE_FIXTURE.ingestion_sources)
  assertCollectionDisabled(reconciled)
  return reconciled
}

export function restoreIdentityLedger() {
  return reconcileBatch(RECORDED_GAPS, { existingMappings: EXISTING_MAPPINGS })
}

export async function restoreEclipseInvestigation(db, rpc) {
  const eventId = 'acc55cb2-5ac2-4aed-be36-3f576d2bc443'
  const placeId = '6034fc7e-b6ab-42b4-8c52-85421bd0d42c'
  await db.query(
    "insert into public.nodes(id, slug, label, type) values($1,'2024-total-solar-eclipse-cleveland','2024 Total Solar Eclipse, Cleveland, Ohio','event')",
    [eventId],
  )
  await db.query('insert into public.geographic_places(id, canonical_name) values($1,$2)', [placeId, 'Cleveland'])
  const assertion = (await db.query('insert into spatial.assertions(graph_node_id) values($1) returning id', [eventId])).rows[0].id
  const revision = (await db.query(
    'insert into spatial.assertion_revisions(id, spatial_assertion_id, canonical_place_id) values($1,$2,$3) returning id',
    ['9bf5c497-0c36-4307-9940-541265a94b0d', assertion, placeId],
  )).rows[0].id
  await db.query(
    "insert into public.articles(id, feed, outlet, title, url, summary, reader_state) values($1,'nasa-science',$2,$3,$4,$5,'pending_review')",
    ['e5a84674-0176-4704-b56f-e01c8ffa84f4', ECLIPSE_ARTICLE.outlet, ECLIPSE_ARTICLE.title, ECLIPSE_ARTICLE.url, ECLIPSE_ARTICLE.summary],
  )
  const jobId = await rpc('enqueue', { run_id: 'eclipse-consolidation', article: ECLIPSE_ARTICLE })
  const claimed = await rpc('claim')
  const finished = await rpc('finish', { job_id: claimed.id, lease_token: claimed.lease_token })
  const excerpt = 'totality times including Cleveland, Ohio'
  const claim = candidateFromExactSource({
    capture_id: finished.capture_id,
    candidate_key: 'cleveland-totality',
    candidate_kind: 'claim',
    statement: 'NASA recorded 2024-04-08 totality times for Cleveland, Ohio.',
    source_field: 'summary',
    source_text: ECLIPSE_ARTICLE.summary,
    excerpt,
    event_node_id: eventId,
    remaining_uncertainty: 'Publisher table excerpt only. Not independently corroborated and not reviewed for publication.',
  })
  const timeline = candidateFromExactSource({
    capture_id: finished.capture_id,
    candidate_key: 'cleveland-totality-window',
    candidate_kind: 'timeline',
    statement: 'Totality in Cleveland is recorded as 3:13-3:17 p.m. EDT.',
    source_field: 'summary',
    source_text: ECLIPSE_ARTICLE.summary,
    excerpt: 'totality 3:13-3:17 p.m. EDT',
    event_node_id: eventId,
    remaining_uncertainty: 'Clock values are copied from the retained NASA summary. No additional chronology is inferred.',
  })
  const geography = candidateFromExactSource({
    capture_id: finished.capture_id,
    candidate_key: 'cleveland-place',
    candidate_kind: 'geography',
    statement: 'The retained source names Cleveland, Ohio.',
    source_field: 'summary',
    source_text: ECLIPSE_ARTICLE.summary,
    excerpt: 'Cleveland, Ohio',
    event_node_id: eventId,
    place_id: placeId,
    spatial_revision_id: revision,
    remaining_uncertainty: 'Geography candidate is pending review. The released spatial projection remains the only public place record.',
  })
  const claimId = await rpc('candidate', claim)
  const timelineId = await rpc('candidate', timeline)
  const geographyId = await rpc('candidate', geography)
  return { jobId, finished, revision, claimId, timelineId, geographyId, eventId }
}

export function scoreEclipseMembershipWithoutApproval() {
  const arc = {
    id: 'fixture-eclipse-arc',
    title: '2024 Total Solar Eclipse, Cleveland, Ohio',
    summary: 'NASA table of 2024-04-08 totality times including Cleveland, Ohio.',
    started_at: '2024-04-08',
    last_update_at: '2024-04-08T20:29:00Z',
  }
  const members = [{
    id: 'e5a84674-0176-4704-b56f-e01c8ffa84f4',
    title: ECLIPSE_ARTICLE.title,
    summary: ECLIPSE_ARTICLE.summary,
    outlet: ECLIPSE_ARTICLE.outlet,
    published_at: '2024-04-08T17:59:00Z',
  }]
  const candidate = {
    id: 'fixture-unrelated-award',
    title: 'Cleveland clinic wins annual business excellence award',
    summary: 'A hospital was recognized for commercial performance at an awards ceremony.',
    outlet: 'example',
    published_at: '2024-04-09T12:00:00Z',
  }
  const arcScore = scoreArcCandidate({
    candidate,
    arc,
    members,
    candidateEntities: ['cleveland'],
    arcEntities: ['cleveland', 'eclipse', 'nasa'],
  })
  const comparisonScore = scoreComparisonCluster(
    { id: 'sc-event-not-graph-event', canonical_title: 'Unrelated sports contract and shipping lane' },
    [
      { article: { id: 'a1', title: 'Coach signs contract', summary: 'A football coach signed a contract.', outlet: 'A', url: 'https://example.org/a', published_at: '2026-01-01' } },
      { article: { id: 'a2', title: 'Ships transit Hormuz', summary: 'Commercial ships transited the strait.', outlet: 'B', url: 'https://example.org/b', published_at: '2026-01-01' } },
    ],
  )
  return {
    arc: membershipDecisionToPromotion(arcScore),
    source_comparison: membershipDecisionToPromotion(comparisonScore),
  }
}

export { IDENTITY_DECISIONS }
