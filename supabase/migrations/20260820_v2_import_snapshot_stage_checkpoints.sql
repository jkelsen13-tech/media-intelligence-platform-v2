-- Isolated Version Two only. Extends the existing private read-only import
-- ledger with a deterministic source-snapshot manifest and durable per-stage
-- checkpoints. It does not contact or modify the original source project.

alter table public.original_source_import_runs
  add column if not exists source_snapshot_id text,
  add column if not exists source_snapshot_checksum text,
  add column if not exists snapshot_checksum_method text,
  add column if not exists current_stage text,
  add column if not exists stage_checkpoints jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.original_source_import_runs
  drop constraint if exists original_source_import_runs_snapshot_checksum_format;

alter table public.original_source_import_runs
  add constraint original_source_import_runs_snapshot_checksum_format
  check (source_snapshot_checksum is null or source_snapshot_checksum ~ '^[0-9a-f]{64}$');

-- The ledger remains private even though it now includes snapshot and stage
-- metadata. Anonymous and authenticated roles receive no grant or policy.
revoke all on public.original_source_import_runs from anon, authenticated;
