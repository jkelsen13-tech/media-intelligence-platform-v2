-- Canonical qik collector operational contracts.
--
-- These tables extend the existing qik article/event/claim foundation. They do
-- not activate a worker, schedule a job, publish content, or acknowledge any
-- predecessor queue. Unlike the legacy yhb definitions, browser roles receive
-- no direct table privileges and no public read policies.

create table if not exists public.ingestion_runs (
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

create table if not exists public.ingestion_source_runs (
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
create index if not exists ingestion_source_runs_source_time_idx
  on public.ingestion_source_runs (ingest_source_id, attempted_at desc);

create table if not exists public.author_profile_queue (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.authors(id) on delete cascade,
  queued_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (author_id)
);

create table if not exists public.original_source_import_credentials (
  credential_name text primary key check (credential_name in ('original-source-import', 'arc-membership-run')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  rotated_at timestamptz not null default now()
);

create table if not exists public.source_comparison_enrichment_queue (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'succeeded', 'failed')),
  enqueued_at timestamptz not null default now(),
  processed_at timestamptz,
  error_note text,
  unique (event_id)
);
create index if not exists source_comparison_enrichment_queue_state_idx
  on public.source_comparison_enrichment_queue (state, enqueued_at);

create or replace function public.mip_queue_source_comparison_enrichment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.comparison_validation_state is distinct from old.comparison_validation_state then
    insert into public.source_comparison_enrichment_queue(
      event_id, state, enqueued_at, processed_at, error_note
    ) values (
      new.id, 'pending', clock_timestamp(), null, null
    )
    on conflict (event_id) do update
      set state = 'pending',
          enqueued_at = excluded.enqueued_at,
          processed_at = null,
          error_note = null;
  end if;
  return new;
end
$$;

drop trigger if exists events_queue_source_comparison_enrichment on public.events;
create trigger events_queue_source_comparison_enrichment
after update of comparison_validation_state on public.events
for each row execute function public.mip_queue_source_comparison_enrichment();

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'ingestion_runs',
    'ingestion_source_runs',
    'author_profile_queue',
    'original_source_import_credentials',
    'source_comparison_enrichment_queue'
  ] loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('alter table public.%I force row level security', relation_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', relation_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', relation_name);
  end loop;
end
$$;

revoke all on function public.mip_queue_source_comparison_enrichment()
  from public, anon, authenticated, service_role;

comment on table public.ingestion_runs is
  'Canonical collector run ledger. Presence does not activate collection or publication.';
comment on table public.ingestion_source_runs is
  'Per-source telemetry for canonical collector runs.';
comment on table public.author_profile_queue is
  'Private operational author-profile queue; no browser access.';
comment on table public.original_source_import_credentials is
  'Hashed credentials for bounded predecessor import compatibility; no plaintext secrets.';
comment on table public.source_comparison_enrichment_queue is
  'Canonical pending-work signal. A schedule/worker must use a fenced generation contract before activation.';
