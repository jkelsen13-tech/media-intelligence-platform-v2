-- DISPOSABLE PGlite substrate only. NEVER apply to qik, YHB, NIE, or jfn.
-- Mirrors the qik-owned collector surface enough to load 010–090: unique URL
-- articles, fenced ingest_sources, run ledger, watermarks. No real feeds.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit;

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

create table public.ingest_sources (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid,
  feed_url text not null unique,
  enabled boolean not null default false,
  collection_enabled boolean not null default false,
  added_at timestamptz not null default now(),
  outlet_name text,
  constraint ingest_sources_collection_enabled_false_check check (collection_enabled = false)
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

insert into public.ingest_sources (id, feed_url, enabled, collection_enabled, outlet_name)
values
  ('11111111-1111-4111-8111-111111111111', 'https://news.example/world.xml', false, false, 'Example World'),
  ('22222222-2222-4222-8222-222222222222', 'https://news.example/idle.xml', false, false, 'Example Idle');

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
