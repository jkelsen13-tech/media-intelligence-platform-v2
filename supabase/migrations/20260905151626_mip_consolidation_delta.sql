-- Deliberate destination delta. Does not replay the historical migration
-- directory, import the Manus corpus, enable collection, or change spatial
-- runtime permissions. Evidence-pipeline foundation is already live.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Stub tables already exist on the destination as id-only relations.
-- Close the public write surface without hiding current empty reads.
alter table public.story_arcs enable row level security;
alter table public.outlets enable row level security;
alter table public.authors enable row level security;
alter table public.policies enable row level security;
alter table public.arc_membership_candidates enable row level security;
revoke insert, update, delete, truncate on public.story_arcs, public.outlets, public.authors, public.policies, public.arc_membership_candidates from public, anon, authenticated;
grant select on public.story_arcs, public.outlets, public.authors, public.policies to anon, authenticated, service_role;
revoke all on public.arc_membership_candidates from anon, authenticated;
grant select, insert, update on public.arc_membership_candidates to service_role;

drop policy if exists story_arcs_public_read on public.story_arcs;
create policy story_arcs_public_read on public.story_arcs for select to anon, authenticated using (true);
drop policy if exists outlets_public_read on public.outlets;
create policy outlets_public_read on public.outlets for select to anon, authenticated using (true);
drop policy if exists authors_public_read on public.authors;
create policy authors_public_read on public.authors for select to anon, authenticated using (true);
drop policy if exists policies_public_read on public.policies;
create policy policies_public_read on public.policies for select to anon, authenticated using (true);

-- Graph relationships are absent on the destination. An empty table is an
-- honest no-relationship state, not a schema-gap crash.
create table if not exists public.edges (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.nodes(id),
  target_id uuid not null references public.nodes(id),
  type text not null,
  weight text,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  similarity numeric,
  sky_verified boolean,
  signal_source text,
  doc_strength text,
  claimed_by text,
  stance text,
  disputed_by jsonb,
  alternative_causes jsonb,
  counterfactual_test text,
  reliability integer,
  arc_membership_candidate_id uuid,
  check (source_id <> target_id)
);
alter table public.edges enable row level security;
revoke insert, update, delete, truncate on public.edges from public, anon, authenticated;
grant select on public.edges to anon, authenticated, service_role;
grant insert, update on public.edges to service_role;
drop policy if exists edges_public_read on public.edges;
create policy edges_public_read on public.edges for select to anon, authenticated using (true);

-- Two source registers remain distinct. Collection stays off.
create table if not exists public.ingest_sources (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid,
  feed_url text not null unique,
  enabled boolean not null default false,
  collection_enabled boolean not null default false,
  added_at timestamptz not null default now(),
  check (collection_enabled = false)
);
create table if not exists public.ingestion_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  label text not null,
  source_url text not null,
  source_type text not null,
  outlet_domain text,
  feed text,
  active boolean not null default false,
  allow_body_fetch boolean not null default false,
  collection_enabled boolean not null default false,
  notes text,
  cursor jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (collection_enabled = false)
);
create table if not exists public.source_register_reconciliation (
  id uuid primary key default gen_random_uuid(),
  ingest_source_id uuid references public.ingest_sources(id),
  ingestion_source_id uuid references public.ingestion_sources(id),
  relationship text not null check (relationship in (
    'distinct_registers',
    'same_publisher_different_endpoint',
    'same_publisher_same_endpoint',
    'discovery_not_publisher',
    'unresolved'
  )),
  notes text not null,
  collection_enabled boolean not null default false,
  recorded_at timestamptz not null default now(),
  check (collection_enabled = false)
);

alter table public.ingest_sources enable row level security;
alter table public.ingestion_sources enable row level security;
alter table public.source_register_reconciliation enable row level security;
revoke all on public.ingest_sources, public.ingestion_sources, public.source_register_reconciliation from public, anon, authenticated;
grant select, insert, update on public.ingest_sources, public.ingestion_sources, public.source_register_reconciliation to service_role;

create table if not exists public.original_source_import_mappings (
  source_project_ref text not null,
  source_table text not null,
  source_id uuid not null,
  target_id uuid not null,
  source_url text,
  imported_at timestamptz not null default now(),
  primary key (source_project_ref, source_table, source_id)
);
create table if not exists public.original_source_import_conflicts (
  id uuid primary key default gen_random_uuid(),
  source_project_ref text not null,
  run_key text not null,
  source_table text not null,
  source_id uuid not null,
  target_id uuid,
  source_url text,
  conflict_kind text not null,
  affected_fields text[] not null default '{}'::text[],
  recovery_status text not null,
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  unique (source_project_ref, run_key, source_table, source_id, conflict_kind)
);
create table if not exists public.identity_reconciliation_gaps (
  id uuid primary key default gen_random_uuid(),
  source_project_ref text not null,
  gap_kind text not null,
  recorded_count integer not null check (recorded_count >= 0),
  recovery_status text not null,
  notes text not null,
  recorded_at timestamptz not null default now(),
  unique (source_project_ref, gap_kind)
);

alter table public.original_source_import_mappings enable row level security;
alter table public.original_source_import_conflicts enable row level security;
alter table public.identity_reconciliation_gaps enable row level security;
revoke all on public.original_source_import_mappings, public.original_source_import_conflicts, public.identity_reconciliation_gaps from public, anon, authenticated;
grant select, insert on public.original_source_import_mappings, public.original_source_import_conflicts, public.identity_reconciliation_gaps to service_role;

insert into public.identity_reconciliation_gaps (source_project_ref, gap_kind, recorded_count, recovery_status, notes)
values
  ('niejaejtbxgakyrsntxm', 'historical_url_upsert_no_snapshot', 752, 'not_restorable_no_pre_import_snapshot', 'Recorded 2026-08-20 import gap. Missing pre-import article versions are not invented.'),
  ('niejaejtbxgakyrsntxm', 'existing_import_mapping_skipped', 752, 'not_applicable_existing_mapping', 'Existing original-source mappings precede identity reconciliation.')
on conflict (source_project_ref, gap_kind) do nothing;

create table if not exists public.algorithm_release_policies (
  algorithm text primary key check (algorithm in ('arc', 'source_comparison')),
  model_version text not null,
  fixture_passed boolean not null,
  auto_approval_enabled boolean not null default false,
  auto_approval_threshold numeric,
  release_state text not null,
  notes text not null,
  updated_at timestamptz not null default now(),
  check (auto_approval_enabled = false),
  check (auto_approval_threshold is null)
);
alter table public.algorithm_release_policies enable row level security;
revoke all on public.algorithm_release_policies from public, anon, authenticated;
grant select, insert, update on public.algorithm_release_policies to service_role;

insert into public.algorithm_release_policies (algorithm, model_version, fixture_passed, auto_approval_enabled, auto_approval_threshold, release_state, notes)
values
  ('arc', 'arc-v1-membership-2026-08-23.2', true, false, null, 'default_deny_audit_complete_no_qualifying_band', 'Recovered fixtures pass. Recorded calibration does not qualify any band. Automatic approval stays disabled.'),
  ('source_comparison', 'sc-v2-membership-2026-08-23.5', true, false, null, 'default_deny_corrected_band_below_sample_floor', 'Recovered fixtures pass. Corrected band is below the 30-label floor. Automatic approval stays disabled.')
on conflict (algorithm) do update
  set model_version = excluded.model_version,
      fixture_passed = excluded.fixture_passed,
      auto_approval_enabled = false,
      auto_approval_threshold = null,
      release_state = excluded.release_state,
      notes = excluded.notes,
      updated_at = now();

-- Public investigation contract: event identity, released geography, and
-- counts of already-public rows only. Pending article text stays withheld.
create or replace view public.investigation_surface_public
with (security_invoker = true) as
select
  n.id as canonical_event_id,
  n.slug,
  n.label as event_label,
  n.type as event_type,
  n.occurred_at,
  exists (
    select 1 from public.spatial_projection_v1 p
    where p.subject_graph_node_id = n.id
  ) as has_released_geography,
  (
    select p.revision_id from public.spatial_projection_v1 p
    where p.subject_graph_node_id = n.id
    limit 1
  ) as spatial_revision_id,
  (
    select count(*)::integer from public.articles a
    where a.reader_state = 'eligible' and a.source_status = 'active'
  ) as public_article_count,
  0 as reviewed_claim_count,
  (
    select count(*)::integer from public.edges e
    where e.source_id = n.id or e.target_id = n.id
  ) as published_relationship_count,
  false as auto_approval_enabled
from public.nodes n
where n.type = 'event';

revoke all on public.investigation_surface_public from public;
grant select on public.investigation_surface_public to anon, authenticated, service_role;

insert into public.ingest_sources (outlet_id, feed_url, enabled, collection_enabled)
values
  ('cf138ed9-2068-4c4b-86c3-b2e52afa077c', 'https://feeds.bbci.co.uk/news/world/rss.xml', false, false),
  ('a04002c2-d79e-4d49-923f-d9605c2a804e', 'https://www.theguardian.com/world/rss', false, false),
  ('0ef2244f-03f4-4b00-81ad-7364da2b01d7', 'https://www.aljazeera.com/xml/rss/all.xml', false, false),
  ('bd19e457-ddb2-427c-97df-089633e7e47c', 'http://rss.cnn.com/rss/edition.rss', false, false),
  ('1009471b-21ac-4d47-96fd-986a84207040', 'https://moxie.foxnews.com/google-publisher/latest.xml', false, false),
  ('fe01dee5-eef2-45c0-a4a3-01dc12801517', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', false, false),
  ('30bfae26-90a9-4acf-8e2d-7e1d36d0eed4', 'https://www.cbc.ca/webfeed/rss/rss-world', false, false)
on conflict (feed_url) do nothing;

insert into public.ingestion_sources (source_key, label, source_url, source_type, allow_body_fetch, active, collection_enabled, notes)
values
  ('bbc-news-rss', 'BBC News RSS', 'https://feeds.bbci.co.uk/news/rss.xml', 'rss', false, false, false, 'Distinct from BBC World in ingest_sources.'),
  ('doj-press-release-rss', 'U.S. Department of Justice Press Releases RSS', 'https://www.justice.gov/news/rss?type=press_release&m=1', 'official_feed', false, false, false, null),
  ('npr-news-rss', 'NPR News RSS', 'https://feeds.npr.org/1001/rss.xml', 'rss', false, false, false, null),
  ('gdelt-public-news-discovery', 'GDELT DOC 2.0 public-news discovery', 'https://api.gdeltproject.org/api/v2/doc/doc', 'gdelt_doc_api', false, false, false, 'Discovery index. Not a publisher.'),
  ('gdelt-ap-original-url-discovery', 'GDELT DOC 2.0 — AP News original-URL discovery', 'https://api.gdeltproject.org/api/v2/doc/doc?query=domainis%3Aapnews.com', 'gdelt_doc_api', false, false, false, 'Discovery index. Not a publisher.'),
  ('gdelt-reuters-original-url-discovery', 'GDELT DOC 2.0 — Reuters original-URL discovery', 'https://api.gdeltproject.org/api/v2/doc/doc?query=domainis%3Areuters.com', 'gdelt_doc_api', false, false, false, 'Discovery index. Not a publisher.'),
  ('gdelt-bigquery-gkg-discovery', 'GDELT BigQuery GKG original-URL discovery', 'bigquery://gdelt-bq.gdeltv2.gkg_partitioned', 'gdelt_bigquery', false, false, false, 'Discovery index. Not a publisher.')
on conflict (source_key) do nothing;

insert into public.source_register_reconciliation (ingest_source_id, ingestion_source_id, relationship, notes, collection_enabled)
select i.id, s.id, 'same_publisher_different_endpoint',
  'BBC World (ingest_sources) and BBC News (ingestion_sources) are different endpoints.', false
from public.ingest_sources i
join public.ingestion_sources s on s.source_key = 'bbc-news-rss'
where i.feed_url = 'https://feeds.bbci.co.uk/news/world/rss.xml'
on conflict do nothing;

insert into public.source_register_reconciliation (ingest_source_id, ingestion_source_id, relationship, notes, collection_enabled)
select i.id, null, 'distinct_registers', 'No keyed ingestion_sources counterpart. Collection stays off.', false
from public.ingest_sources i
where i.feed_url <> 'https://feeds.bbci.co.uk/news/world/rss.xml'
  and not exists (
    select 1 from public.source_register_reconciliation r where r.ingest_source_id = i.id
  );

insert into public.source_register_reconciliation (ingest_source_id, ingestion_source_id, relationship, notes, collection_enabled)
select null, s.id, 'discovery_not_publisher', 'GDELT discovery is not a publisher and not independent corroboration.', false
from public.ingestion_sources s
where s.source_type in ('gdelt_doc_api', 'gdelt_bigquery')
  and not exists (
    select 1 from public.source_register_reconciliation r where r.ingestion_source_id = s.id and r.relationship = 'discovery_not_publisher'
  );

insert into public.source_register_reconciliation (ingest_source_id, ingestion_source_id, relationship, notes, collection_enabled)
select null, s.id, 'distinct_registers', 'Keyed official/news feed with no ingest_sources counterpart. Collection stays off.', false
from public.ingestion_sources s
where s.source_type in ('rss', 'official_feed') and s.source_key <> 'bbc-news-rss'
  and not exists (
    select 1 from public.source_register_reconciliation r where r.ingestion_source_id = s.id
  );

comment on table public.algorithm_release_policies is 'Recorded membership release gates. Fixtures passing does not enable automatic approval.';
comment on view public.investigation_surface_public is 'Anonymous investigation contract. Pending article text and private candidates are not exposed.';
commit;
