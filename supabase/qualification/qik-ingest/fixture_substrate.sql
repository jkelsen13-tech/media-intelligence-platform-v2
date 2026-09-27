-- DISPOSABLE substrate only. NEVER apply to qik, YHB, NIE, or jfn.
-- Collector surface plus the existing evidence_pipeline prerequisites
-- (history triggers, nodes, spatial stub). No real feeds.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$roles$;

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  feed text not null,
  outlet text not null,
  title text not null,
  url text not null unique,
  summary text,
  body_text text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  ingestion_run_id text,
  reader_state text not null default 'pending_review'
    check (reader_state in ('eligible', 'pending_review', 'withheld')),
  source_status text not null default 'active'
    check (source_status in ('active', 'corrected', 'withdrawn')),
  claims jsonb not null default '[]'::jsonb
);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_ownership text,
  country text,
  known_editorial_stance text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.ingest_sources (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid references public.outlets(id),
  feed_url text not null unique,
  enabled boolean not null default false,
  collection_enabled boolean not null default false,
  added_at timestamptz not null default now(),
  constraint ingest_sources_collection_enabled_check check (collection_enabled = false)
);

create table public.ingestion_runs (
  run_id text primary key,
  mode text not null check (mode in ('discover', 'hydrate', 'extract', 'cross_surface', 'backfill')),
  state text not null check (state in ('planned', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_window_start timestamptz,
  source_window_end timestamptz,
  algorithm_version text not null,
  model_id text,
  counters jsonb not null default '{}'::jsonb,
  notes text
);

create table public.ingestion_source_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.ingestion_runs(run_id) on delete cascade,
  ingest_source_id uuid not null references public.ingest_sources(id) on delete cascade,
  outlet_name text,
  feed_url text not null,
  state text not null check (state in ('succeeded', 'failed')),
  fetched_items integer not null default 0 check (fetched_items >= 0),
  new_items integer not null default 0 check (new_items >= 0),
  error_note text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (run_id, ingest_source_id)
);

create table public.mip_consolidation_watermarks (
  source_project_ref text not null,
  channel text not null,
  watermark jsonb not null,
  captured_at timestamptz not null default now(),
  primary key (source_project_ref, channel)
);

insert into public.outlets(id,name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Example World'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Example Idle');
insert into public.ingest_sources (id, outlet_id, feed_url, enabled, collection_enabled)
values
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://news.example/world.xml', false, false),
  ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'https://news.example/idle.xml', false, false);
alter table public.outlets enable row level security;
revoke all on public.outlets from public,anon,authenticated,service_role;
grant select on public.outlets to anon,authenticated;
grant select,insert,update on public.outlets to service_role;
create policy outlets_public_read on public.outlets for select to anon,authenticated using(true);

insert into public.articles (feed, outlet, title, url, reader_state)
values (
  'preexisting',
  'fixture',
  'Preexisting qik row',
  'https://news.example/preexisting',
  'pending_review'
);

alter table public.articles enable row level security;
alter table public.ingest_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.ingestion_source_runs enable row level security;
alter table public.mip_consolidation_watermarks enable row level security;

revoke all on public.articles, public.ingest_sources, public.ingestion_runs,
  public.ingestion_source_runs, public.mip_consolidation_watermarks
  from public, anon, authenticated;
grant select on public.articles to anon, authenticated;
create policy articles_reader_eligible on public.articles
  for select to anon, authenticated
  using (reader_state = 'eligible' and source_status = 'active');

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  label text,
  metadata jsonb default '{}'
);
create table public.geographic_places (
  id uuid primary key default gen_random_uuid(),
  canonical_name text
);
create table public.pipeline_config (
  key text primary key,
  value jsonb
);
create schema spatial;
create table spatial.assertions (
  id uuid primary key default gen_random_uuid(),
  graph_node_id uuid references public.nodes(id)
);
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
grant select on public.nodes, public.geographic_places, public.spatial_projection_v1 to service_role;
