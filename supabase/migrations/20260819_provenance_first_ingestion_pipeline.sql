-- Provenance-first automated ingestion pipeline — isolated v2 sandbox only.
--
-- The pipeline may discover publisher records and produce structured extraction
-- candidates at scale. It deliberately does NOT auto-publish graph edges,
-- causal links, outcomes, source independence, or claimed facts. Those remain
-- review-gated candidate records until a human changes the review state.

create table if not exists public.ingestion_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  label text not null,
  source_url text not null unique,
  source_type text not null check (source_type in ('gdelt_doc_api', 'rss', 'sitemap', 'official_feed')),
  outlet_domain text,
  feed text not null,
  active boolean not null default true,
  allow_body_fetch boolean not null default false,
  notes text,
  cursor jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.ingestion_checkpoints (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.ingestion_runs(run_id) on delete cascade,
  source_id uuid not null references public.ingestion_sources(id) on delete cascade,
  checkpoint_key text not null,
  cursor jsonb not null default '{}'::jsonb,
  state text not null check (state in ('pending', 'running', 'completed', 'failed')),
  article_count integer not null default 0 check (article_count >= 0),
  error_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, source_id, checkpoint_key)
);

create table if not exists public.article_extraction_results (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  algorithm_version text not null,
  model_id text,
  input_sha256 text not null,
  output jsonb not null,
  state text not null check (state in ('candidate', 'reviewed', 'rejected', 'failed')),
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  unique (article_id, algorithm_version, input_sha256)
);

create table if not exists public.cross_surface_candidates (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  candidate_type text not null check (candidate_type in ('arc_assignment', 'timeline_assignment', 'graph_node', 'graph_edge', 'source_comparison_event', 'geography_mention')),
  target_table text not null check (target_table in ('story_arcs', 'arc_events', 'nodes', 'edges', 'source_comparison_events', 'geographic_places')),
  target_id uuid,
  evidence_excerpt text not null,
  evidence_start integer,
  evidence_end integer,
  algorithm_version text not null,
  review_state text not null check (review_state in ('pending', 'approved', 'rejected')) default 'pending',
  remaining_uncertainty text not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  check (
    (evidence_start is null and evidence_end is null)
    or (evidence_start is not null and evidence_end is not null and evidence_start >= 0 and evidence_end > evidence_start)
  )
);

create unique index if not exists article_extraction_results_dedupe_idx
  on public.article_extraction_results (article_id, algorithm_version, input_sha256);
create unique index if not exists cross_surface_candidates_dedupe_idx
  on public.cross_surface_candidates (article_id, candidate_type, target_table, target_id, evidence_excerpt, algorithm_version);
create index if not exists ingestion_checkpoints_pending_idx
  on public.ingestion_checkpoints (run_id, state, source_id);
create index if not exists article_extraction_results_state_idx
  on public.article_extraction_results (state, created_at desc);
create index if not exists cross_surface_candidates_review_idx
  on public.cross_surface_candidates (review_state, candidate_type, created_at desc);

alter table public.ingestion_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.ingestion_checkpoints enable row level security;
alter table public.article_extraction_results enable row level security;
alter table public.cross_surface_candidates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ingestion_sources' and policyname = 'ingestion_sources_read') then
    create policy ingestion_sources_read on public.ingestion_sources for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ingestion_runs' and policyname = 'ingestion_runs_read') then
    create policy ingestion_runs_read on public.ingestion_runs for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'article_extraction_results' and policyname = 'article_extraction_results_read') then
    create policy article_extraction_results_read on public.article_extraction_results for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cross_surface_candidates' and policyname = 'cross_surface_candidates_read') then
    create policy cross_surface_candidates_read on public.cross_surface_candidates for select to anon, authenticated using (true);
  end if;
end $$;

comment on table public.ingestion_sources is
  'Approved source endpoints for the v2 ingestion pipeline. Source endpoint approval is separate from article-level evidence.';
comment on table public.ingestion_runs is
  'Resumable run ledger for source discovery, hydration, structured extraction, and review-gated cross-surface candidate generation.';
comment on table public.article_extraction_results is
  'Structured model output retained as an auditable candidate; review state is explicit and does not establish a fact.';
comment on table public.cross_surface_candidates is
  'Evidence-span-bearing candidate connections. Pending candidates do not create live graph edges, timeline events, arc assignments, or geographic points.';
