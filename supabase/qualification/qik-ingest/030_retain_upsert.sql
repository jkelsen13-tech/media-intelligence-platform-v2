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
  credential_hash text not null,
  native_job_id uuid,
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
    run_id, source_id, url, title, outlet, summary, body_text, published_at, credential_hash
  ) values (
    p_run_id, p_source_id, v_url, v_title, v_outlet, v_summary, v_body,
    v_published::timestamptz, encode(sha256(convert_to(p_token,'UTF8')),'hex')
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

-- Bound claim: same evidence_pipeline.import_jobs queue, lease, attempts,
-- SKIP LOCKED, and expire rules as evidence_pipeline.claim_job, but ONLY for
-- explicitly bound job ids. Not a second queue. Unscoped mip_pipeline_v1
-- claim is not used by this qualification.
create or replace function public.mip_qik_ingest_claim_bound(p_job_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j evidence_pipeline.import_jobs;
  t timestamptz := clock_timestamp();
begin
  if p_job_ids is null or coalesce(cardinality(p_job_ids), 0) = 0
     or exists (select 1 from unnest(p_job_ids) x(id) where x.id is null) then
    raise exception 'qik_ingest_bound_jobs_required' using errcode = '22023';
  end if;

  with expired as (
    select id from evidence_pipeline.import_jobs
    where state = 'processing' and lease_expires_at <= t
      and id = any(p_job_ids)
    order by lease_expires_at
    limit 100
    for update skip locked
  ), changed as (
    update evidence_pipeline.import_jobs x set
      state = case when attempt_count >= 5 then 'dead_letter' else 'retry_wait' end,
      error_code = 'lease_expired',
      lease_token = null,
      lease_expires_at = null,
      available_at = t + make_interval(secs => least(3600, 30 * (2 ^ greatest(0, attempt_count - 1))::integer))
    from expired e where x.id = e.id
    returning x.*
  )
  insert into evidence_pipeline.job_events(job_id, attempt, state, code)
    select id, attempt_count, state, 'lease_expired' from changed;

  select * into j
  from evidence_pipeline.import_jobs
  where id = any(p_job_ids)
    and state in ('pending', 'retry_wait')
    and available_at <= t
    and attempt_count < 5
  order by available_at, created_at, id
  limit 1
  for update skip locked;
  if not found then
    return null;
  end if;
  update evidence_pipeline.import_jobs set
    state = 'processing',
    attempt_count = attempt_count + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = t + interval '2 minutes',
    error_code = null
  where id = j.id
  returning * into j;
  insert into evidence_pipeline.job_events(job_id, attempt, state)
    values (j.id, j.attempt_count, j.state);
  return to_jsonb(j);
end
$$;

create or replace function public.mip_qik_ingest_bound_job_states(p_job_ids uuid[])
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', j.id,
    'state', j.state,
    'outcome', j.outcome,
    'attempt_count', j.attempt_count,
    'error_code', j.error_code,
    'lease_token', j.lease_token,
    'capture_id', c.id
  ) order by j.created_at, j.id), '[]'::jsonb)
  from evidence_pipeline.import_jobs j
  left join evidence_pipeline.article_captures c on c.job_id=j.id and j.state='completed'
  where coalesce(cardinality(p_job_ids), 0) > 0
    and j.id = any(p_job_ids);
$$;

-- Read one exact completed native job/capture pair for pending extraction.
-- Invoker authority is the existing private service-role boundary, not a new
-- browser or qik_ingest_runtime read grant.
create or replace function public.mip_qik_ingest_capture_for_job(p_job_id uuid,p_capture_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('id',c.id,'article_id',c.article_id,
    'content_hash',c.content_hash,'payload_text',c.payload::text)
  into result
  from evidence_pipeline.article_captures c
  join evidence_pipeline.import_jobs j on j.id=c.job_id
  where j.id=p_job_id and j.state='completed' and c.id=p_capture_id;
  if result is null then raise exception 'retained_capture_unavailable'; end if;
  return result;
end $$;
revoke all on function public.mip_qik_ingest_capture_for_job(uuid,uuid)
  from public,anon,authenticated,qik_ingest_runtime;
grant execute on function public.mip_qik_ingest_capture_for_job(uuid,uuid) to service_role;

revoke all on function public.mip_qik_ingest_claim_bound(uuid[])
  from public, anon, authenticated, qik_ingest_runtime;
revoke all on function public.mip_qik_ingest_bound_job_states(uuid[])
  from public, anon, authenticated;
grant execute on function public.mip_qik_ingest_claim_bound(uuid[]) to service_role;
grant execute on function public.mip_qik_ingest_bound_job_states(uuid[])
  to service_role, qik_ingest_runtime;

do $$
begin
  execute 'alter function public.mip_qik_ingest_retain_item(text, text, uuid, jsonb) owner to qik_ingest_fn_owner';
  execute 'alter function public.mip_qik_ingest_record_source_run(text, text, uuid, text, integer, integer, text, timestamptz) owner to qik_ingest_fn_owner';
end
$$;
