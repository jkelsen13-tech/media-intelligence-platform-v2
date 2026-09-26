-- C3 qik ingest: discovery observation + native enqueue handoff contract.
-- FILES ONLY. Does not insert public.articles. Publication fields refused.
-- Identical delivery is idle at evidence_pipeline.enqueue (canonical_url,input_hash).
-- Changed content at the same URL becomes a new job; finish uses revision_pending.

create table qik_ingest.observed_items (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  source_id uuid not null,
  url text not null,
  title text not null,
  outlet text not null,
  summary text,
  body_text text,
  published_at timestamptz,
  observed_at timestamptz not null default clock_timestamp()
);

alter table qik_ingest.observed_items enable row level security;
alter table qik_ingest.observed_items force row level security;
revoke all on table qik_ingest.observed_items from public, anon, authenticated, service_role, qik_ingest_runtime;
grant select, insert on table qik_ingest.observed_items to qik_ingest_fn_owner;
drop policy if exists qik_ingest_fn_observed_items on qik_ingest.observed_items;
create policy qik_ingest_fn_observed_items on qik_ingest.observed_items
  for all to qik_ingest_fn_owner using (true) with check (true);

create or replace function public.mip_qik_ingest_retain_item(p_token text, p_run_id text, p_source_id uuid, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_title text;
  v_outlet text;
  v_summary text;
  v_body text;
  v_published text;
  v_id uuid;
begin
  perform qik_ingest.require_token(p_token);
  if not exists (select 1 from public.ingestion_runs where run_id = p_run_id and state = 'running') then
    raise exception 'qik_ingest_run_not_running' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.ingest_sources
    where id = p_source_id and enabled and collection_enabled
  ) then
    raise exception 'qik_ingest_source_not_enabled' using errcode = '42501';
  end if;
  if p_item ? 'reader_state' or p_item ? 'source_status' or p_item ? 'claims' then
    raise exception 'qik_ingest_publication_fields_forbidden' using errcode = '42501';
  end if;
  v_url := nullif(p_item->>'url', '');
  v_title := nullif(p_item->>'title', '');
  if v_url is null or v_title is null then
    raise exception 'qik_ingest_item_incomplete' using errcode = '22023';
  end if;
  if v_url !~ '^https?://' then
    return jsonb_build_object('disposition', 'rejected', 'reason', 'unsafe_or_non_http_url');
  end if;
  select coalesce(outlet_name, feed_url) into v_outlet
  from public.ingest_sources where id = p_source_id;
  v_summary := nullif(p_item->>'summary', '');
  v_body := nullif(p_item->>'body_text', '');
  v_published := nullif(p_item->>'published_at', '');
  if v_published is not null then
    if not isfinite(v_published::timestamptz) then
      raise exception 'qik_ingest_item_incomplete' using errcode = '22023';
    end if;
  end if;
  insert into qik_ingest.observed_items (
    run_id, source_id, url, title, outlet, summary, body_text, published_at
  ) values (
    p_run_id, p_source_id, v_url, v_title, v_outlet, v_summary, v_body,
    v_published::timestamptz
  ) returning id into v_id;
  return jsonb_build_object(
    'disposition', 'observed',
    'id', v_id,
    'article', jsonb_build_object(
      'url', v_url,
      'title', v_title,
      'outlet', v_outlet,
      'summary', v_summary,
      'body_text', v_body,
      'published_at', v_published
    )
  );
end
$$;

create or replace function public.mip_qik_ingest_record_source_run(
  p_token text, p_run_id text, p_source_id uuid, p_state text,
  p_fetched integer, p_new integer, p_error_note text, p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_url text;
  v_outlet text;
begin
  perform qik_ingest.require_token(p_token);
  if p_state not in ('succeeded', 'failed') then
    raise exception 'qik_ingest_invalid_source_state' using errcode = '22023';
  end if;
  if p_state = 'failed' and (p_error_note is null or length(p_error_note) = 0) then
    raise exception 'qik_ingest_failed_source_requires_note' using errcode = '22023';
  end if;
  if p_state = 'succeeded' and p_error_note is not null then
    raise exception 'qik_ingest_succeeded_source_forbids_note' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ingestion_runs where run_id = p_run_id and state = 'running') then
    raise exception 'qik_ingest_run_not_running' using errcode = '55000';
  end if;
  select feed_url, outlet_name into v_url, v_outlet from public.ingest_sources where id = p_source_id;
  if v_url is null then
    raise exception 'qik_ingest_unknown_source' using errcode = '22023';
  end if;
  insert into public.ingestion_source_runs (
    run_id, ingest_source_id, outlet_name, feed_url, state,
    fetched_items, new_items, error_note, attempted_at, completed_at
  ) values (
    p_run_id, p_source_id, v_outlet, v_url, p_state,
    coalesce(p_fetched, 0), coalesce(p_new, 0), p_error_note, v_now, v_now
  )
  on conflict (run_id, ingest_source_id) do update
    set state = excluded.state,
        fetched_items = excluded.fetched_items,
        new_items = excluded.new_items,
        error_note = excluded.error_note,
        completed_at = excluded.completed_at;
  return jsonb_build_object('run_id', p_run_id, 'source_id', p_source_id, 'state', p_state);
end
$$;

revoke all on function public.mip_qik_ingest_retain_item(text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.mip_qik_ingest_record_source_run(text, text, uuid, text, integer, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.mip_qik_ingest_retain_item(text, text, uuid, jsonb)
  to service_role, qik_ingest_runtime;
grant execute on function public.mip_qik_ingest_record_source_run(text, text, uuid, text, integer, integer, text, timestamptz)
  to service_role, qik_ingest_runtime;

do $$
begin
  execute 'alter function public.mip_qik_ingest_retain_item(text, text, uuid, jsonb) owner to qik_ingest_fn_owner';
  execute 'alter function public.mip_qik_ingest_record_source_run(text, text, uuid, text, integer, integer, text, timestamptz) owner to qik_ingest_fn_owner';
end
$$;
