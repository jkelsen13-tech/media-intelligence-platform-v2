-- Isolated candidate only: index the ingestion-run foreign key used for joins
-- and cascade checks. This file was prepared after the owner-review gate and
-- was not applied to a live project in this run.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists ingestion_source_runs_run_id_idx
  on public.ingestion_source_runs (run_id);

commit;
