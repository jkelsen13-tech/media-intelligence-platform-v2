-- Article conflict audit for the read-only original-source importer.
-- Applies ONLY to the isolated Version Two sandbox and does not contact the
-- original project. Conflict records are operational audit data, never public.
create table if not exists public.original_source_import_conflicts (
  id uuid primary key default gen_random_uuid(),
  source_project_ref text not null,
  run_key text not null,
  source_table text not null,
  source_id uuid not null,
  target_id uuid,
  source_url text,
  conflict_kind text not null check (conflict_kind in (
    'existing_url_skipped',
    'existing_id_skipped',
    'existing_import_mapping_skipped',
    'historical_url_upsert_no_snapshot'
  )),
  affected_fields text[] not null default '{}'::text[],
  recovery_status text not null,
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  unique (source_project_ref, run_key, source_table, source_id, conflict_kind)
);

alter table public.original_source_import_conflicts enable row level security;
revoke all on public.original_source_import_conflicts from anon, authenticated;

-- The completed 2026-08-20 import report shows that all 752 original articles
-- matched pre-existing Version Two URLs and were sent through the former article
-- upsert path. Version Two has no pre-import article snapshot/history table, so
-- these rows are preserved as an exact, non-restorable audit population rather
-- than being overwritten again with speculative reconstruction.
insert into public.original_source_import_conflicts (
  source_project_ref,
  run_key,
  source_table,
  source_id,
  target_id,
  source_url,
  conflict_kind,
  affected_fields,
  recovery_status,
  details
)
select
  m.source_project_ref,
  m.source_project_ref || '-historical-article-upsert-audit-20260820',
  'articles',
  m.source_id,
  m.target_id,
  m.source_url,
  'historical_url_upsert_no_snapshot',
  array[
    'feed', 'outlet', 'title', 'summary', 'published_at', 'fetched_at',
    'body_text', 'claims', 'unattributed', 'monoculture', 'is_digest',
    'image_url', 'image_alt', 'entities_extracted_at',
    'arc_assign_attempted_at', 'arc_assignment_evidence', 'source_status',
    'source_status_changed_at', 'source_status_note', 'ingestion_run_id',
    'arc_id'
  ],
  'not_restorable_no_pre_import_snapshot',
  jsonb_build_object(
    'reason', 'Former original-source article upsert selected an existing Version Two row by URL.',
    'prior_import_run_key', 'original-readonly-cross-surface-import-20260820',
    'restoration_evidence', 'No article history, snapshot table, or mapping snapshot columns exist in Version Two.'
  )
from public.original_source_import_mappings m
join public.articles a on a.id = m.target_id
where m.source_project_ref = 'niejaejtbxgakyrsntxm'
  and m.source_table = 'articles'
  and a.ingestion_run_id = 'original-readonly-cross-surface-import-20260820'
on conflict do nothing;
