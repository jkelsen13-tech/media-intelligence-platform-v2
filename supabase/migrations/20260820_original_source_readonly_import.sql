-- Read-only original-project import support.
-- This migration applies ONLY to the isolated Version Two sandbox. It neither
-- references nor writes to the original Supabase project.

create table if not exists public.original_source_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_project_ref text not null,
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  report jsonb not null default '{}'::jsonb
);

create table if not exists public.original_source_import_mappings (
  source_project_ref text not null,
  source_table text not null,
  source_id uuid not null,
  target_id uuid not null,
  source_url text,
  imported_at timestamptz not null default now(),
  primary key (source_project_ref, source_table, source_id)
);

create index if not exists original_source_import_mappings_target_idx
  on public.original_source_import_mappings (target_id);

-- This dedicated target-only credential avoids mutating the legacy ingestion
-- credential table, whose existing constraint permits only its own id. Only the
-- SHA-256 digest is stored; the local invocation secret is never persisted in
-- repository files or returned from the database.
create table if not exists public.original_source_import_credentials (
  credential_name text primary key check (credential_name = 'original-source-import'),
  key_hash text not null check (length(key_hash) = 64),
  active boolean not null default true,
  rotated_at timestamptz not null default now()
);

insert into public.original_source_import_credentials (credential_name, key_hash, active, rotated_at)
values ('original-source-import', '3f04052067902b2833b1eef43636d57d4f8b7d9e0f0ce34fd6b4cac709e3f007', true, now())
on conflict (credential_name) do update
  set key_hash = excluded.key_hash,
      active = excluded.active,
      rotated_at = excluded.rotated_at;

alter table public.original_source_import_runs enable row level security;
alter table public.original_source_import_mappings enable row level security;
alter table public.original_source_import_credentials enable row level security;

revoke all on public.original_source_import_runs from anon, authenticated;
revoke all on public.original_source_import_mappings from anon, authenticated;
revoke all on public.original_source_import_credentials from anon, authenticated;

-- The Version Two beta reader already supports these source-backed tables, but
-- the isolated sandbox did not yet contain them. The import excludes sealed,
-- expunged, and minor/private-person cases before inserting any row.
create table if not exists public.p3_legal_case (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  case_status text not null,
  verdict_or_disposition text,
  charge_or_issue text,
  deciding_body text,
  appeal_status text,
  involves_minor_or_private_person boolean not null default false,
  sealed_or_expunged boolean not null default false,
  authentication_completeness text,
  remaining_uncertainty text,
  review_status text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  correction_notice text,
  correction_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.p3_legal_case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.p3_legal_case(id) on delete cascade,
  track text not null,
  description text not null,
  source_id uuid,
  source_passage text,
  method_version text,
  authentication_state text,
  remaining_uncertainty text,
  review_status text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  correction_notice text,
  correction_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  source_url text
);

alter table public.p3_legal_case enable row level security;
alter table public.p3_legal_case_evidence enable row level security;

drop policy if exists "public read p3 legal case" on public.p3_legal_case;
create policy "public read p3 legal case" on public.p3_legal_case
  for select to anon, authenticated using (true);

drop policy if exists "public read p3 legal evidence" on public.p3_legal_case_evidence;
create policy "public read p3 legal evidence" on public.p3_legal_case_evidence
  for select to anon, authenticated using (true);
