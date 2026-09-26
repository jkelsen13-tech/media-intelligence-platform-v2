-- C3 qik ingest cleanup. Drops this package only. FILES ONLY.
-- Refuses if the owner gate is on or any source is collection-enabled.
-- Does not delete articles, YHB jobs, NIE, or collector-shadow.

do $$
begin
  if to_regclass('qik_ingest.collection_gate') is not null
     and coalesce((select collection_authorized from qik_ingest.collection_gate where id), false) then
    raise exception 'qik_ingest_cleanup_refused_gate_on' using errcode = '55000';
  end if;
  if exists (select 1 from public.ingest_sources where collection_enabled) then
    raise exception 'qik_ingest_cleanup_refused_source_enabled' using errcode = '55000';
  end if;
end
$$;

drop trigger if exists qik_ingest_collection_gate on public.ingest_sources;

drop policy if exists qik_ingest_fn_select_articles on public.articles;
drop policy if exists qik_ingest_fn_insert_articles on public.articles;
drop policy if exists qik_ingest_fn_select_sources on public.ingest_sources;
drop policy if exists qik_ingest_fn_runs on public.ingestion_runs;
drop policy if exists qik_ingest_fn_source_runs on public.ingestion_source_runs;
drop policy if exists qik_ingest_fn_watermarks on public.mip_consolidation_watermarks;

drop function if exists public.mip_qik_ingest_schedule_authorized(text);
drop function if exists public.mip_qik_ingest_plan(text);
drop function if exists public.mip_qik_ingest_begin_run(text, text, timestamptz);
drop function if exists public.mip_qik_ingest_finish_run(text, text, text, jsonb, timestamptz);
drop function if exists public.mip_qik_ingest_recover_inflight(text, text, timestamptz);
drop function if exists public.mip_qik_ingest_observe(text);
drop function if exists public.mip_qik_ingest_retain_item(text, text, uuid, jsonb);
drop function if exists public.mip_qik_ingest_record_source_run(text, text, uuid, text, integer, integer, text, timestamptz);
drop function if exists qik_ingest.set_forward_watermark(timestamptz, text, text, jsonb);
drop function if exists qik_ingest.require_token(text);
drop function if exists qik_ingest.reject_false_current(text);
drop function if exists qik_ingest.enforce_collection_gate();

revoke all on public.articles, public.ingest_sources, public.ingestion_runs,
  public.ingestion_source_runs, public.mip_consolidation_watermarks
  from qik_ingest_fn_owner, qik_ingest_runtime;
revoke usage on schema public from qik_ingest_fn_owner, qik_ingest_runtime;
revoke usage on schema qik_ingest from qik_ingest_fn_owner, qik_ingest_runtime;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qik_ingest_runtime') then
    execute 'drop owned by qik_ingest_runtime cascade';
  end if;
  if exists (select 1 from pg_roles where rolname = 'qik_ingest_fn_owner') then
    execute 'drop owned by qik_ingest_fn_owner cascade';
  end if;
end
$$;

drop schema if exists qik_ingest cascade;

alter table public.ingest_sources
  drop constraint if exists ingest_sources_collection_enabled_false_check;
alter table public.ingest_sources
  add constraint ingest_sources_collection_enabled_false_check check (collection_enabled = false);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'qik_ingest_runtime') then
    execute 'drop role qik_ingest_runtime';
  end if;
  if exists (select 1 from pg_roles where rolname = 'qik_ingest_fn_owner') then
    execute 'drop role qik_ingest_fn_owner';
  end if;
end
$$;
