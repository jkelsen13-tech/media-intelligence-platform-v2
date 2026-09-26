-- C3 qik ingest: run ledger + observe. FILES ONLY. Not a live migration.
-- Never writes freshness 'current'. Recover only running → failed.

create or replace function qik_ingest.set_forward_watermark(p_now timestamptz, p_freshness text, p_run_id text, p_counters jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform qik_ingest.reject_false_current(p_freshness);
  insert into public.mip_consolidation_watermarks (
    source_project_ref, channel, watermark, captured_at
  ) values (
    'qikvmopbtijoebdqosyq',
    'ingest_forward',
    jsonb_build_object(
      'kind', 'qik_ingest_forward',
      'freshness', p_freshness,
      'is_current', false,
      'corpus_transfer', false,
      'continuity_from_yhb_fence_articles', 36183,
      'last_run_id', p_run_id,
      'counters', coalesce(p_counters, '{}'::jsonb)
    ),
    p_now
  )
  on conflict (source_project_ref, channel) do update
    set watermark = excluded.watermark,
        captured_at = excluded.captured_at
    where public.mip_consolidation_watermarks.channel = 'ingest_forward';
end
$$;
revoke all on function qik_ingest.set_forward_watermark(timestamptz, text, text, jsonb)
  from public, anon, authenticated, service_role, qik_ingest_runtime;

create or replace function public.mip_qik_ingest_schedule_authorized(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;
  return exists (
    select 1 from qik_ingest.runtime_credentials
    where active
      and credential_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  );
end
$$;

create or replace function public.mip_qik_ingest_plan(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorized boolean;
begin
  perform qik_ingest.require_token(p_token);
  select collection_authorized into v_authorized from qik_ingest.collection_gate where id;
  return jsonb_build_object(
    'collection_authorized', coalesce(v_authorized, false),
    'algorithm_version', 'qik-ingest-rss-v1-retain-from-yhb-v8',
    'config', jsonb_build_object(
      'max_items_per_feed', 4,
      'max_new_per_run', 8,
      'feed_fetch_timeout_ms', 8000
    ),
    'sources', case
      when coalesce(v_authorized, false) then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'feed_url', s.feed_url,
          'outlet_name', coalesce(s.outlet_name, s.feed_url)
        ) order by s.feed_url)
        from public.ingest_sources s
        where s.enabled and s.collection_enabled
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end
$$;

create or replace function public.mip_qik_ingest_begin_run(p_token text, p_run_id text, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
begin
  perform qik_ingest.require_token(p_token);
  if not coalesce((select collection_authorized from qik_ingest.collection_gate where id), false) then
    raise exception 'qik_ingest_writer_disabled' using errcode = '55000';
  end if;
  if p_run_id is null or length(trim(p_run_id)) < 8 then
    raise exception 'qik_ingest_invalid_run_id' using errcode = '22023';
  end if;
  if exists (select 1 from public.ingestion_runs where mode = 'discover' and state = 'running') then
    raise exception 'qik_ingest_run_already_inflight' using errcode = '55000';
  end if;
  insert into public.ingestion_runs (
    run_id, mode, state, started_at, algorithm_version, counters, notes
  ) values (
    p_run_id, 'discover', 'running', v_now,
    'qik-ingest-rss-v1-retain-from-yhb-v8', '{}'::jsonb,
    'qik-owned retain collector; publication not granted'
  );
  perform qik_ingest.set_forward_watermark(v_now, 'qik_forward_inflight', p_run_id, '{}'::jsonb);
  return jsonb_build_object('run_id', p_run_id, 'state', 'running', 'freshness', 'qik_forward_inflight', 'is_current', false);
end
$$;

create or replace function public.mip_qik_ingest_finish_run(p_token text, p_run_id text, p_state text, p_counters jsonb, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_failed integer;
  v_freshness text;
begin
  perform qik_ingest.require_token(p_token);
  if p_state not in ('completed', 'completed_with_errors', 'failed', 'cancelled') then
    raise exception 'qik_ingest_invalid_completion_state' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ingestion_runs where run_id = p_run_id and state = 'running') then
    raise exception 'qik_ingest_run_not_running' using errcode = '55000';
  end if;
  select count(*) into v_failed
  from public.ingestion_source_runs
  where run_id = p_run_id and state = 'failed';
  if p_state = 'completed' and v_failed > 0 then
    raise exception 'qik_ingest_completed_with_failed_sources' using errcode = '55000';
  end if;
  v_freshness := case
    when p_state = 'completed' then 'qik_forward_ok'
    else 'qik_forward_stale'
  end;
  perform qik_ingest.reject_false_current(v_freshness);
  update public.ingestion_runs
    set state = p_state,
        completed_at = v_now,
        counters = coalesce(p_counters, '{}'::jsonb)
    where run_id = p_run_id;
  perform qik_ingest.set_forward_watermark(v_now, v_freshness, p_run_id, p_counters);
  return jsonb_build_object('run_id', p_run_id, 'state', p_state, 'freshness', v_freshness, 'is_current', false);
end
$$;

create or replace function public.mip_qik_ingest_recover_inflight(p_token text, p_run_id text, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
begin
  perform qik_ingest.require_token(p_token);
  if not exists (select 1 from public.ingestion_runs where run_id = p_run_id and state = 'running') then
    raise exception 'qik_ingest_run_not_running' using errcode = '55000';
  end if;
  update public.ingestion_runs
    set state = 'failed',
        completed_at = v_now,
        notes = coalesce(notes, '') || ' recovered_without_false_current'
    where run_id = p_run_id;
  perform qik_ingest.set_forward_watermark(v_now, 'qik_forward_stale', p_run_id, jsonb_build_object('recovered', true));
  return jsonb_build_object('run_id', p_run_id, 'state', 'failed', 'freshness', 'qik_forward_stale', 'is_current', false);
end
$$;

create or replace function public.mip_qik_ingest_observe(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fence jsonb;
  v_forward jsonb;
  v_inflight jsonb;
  v_authorized boolean;
  v_schedule boolean;
begin
  perform qik_ingest.require_token(p_token);
  select collection_authorized into v_authorized from qik_ingest.collection_gate where id;
  select active into v_schedule from qik_ingest.schedule_intent where jobname = 'mip-qik-ingest-rss';
  select watermark into v_fence
    from public.mip_consolidation_watermarks
    where source_project_ref = 'yhbwnrtlqbjtcrrlpbge' and channel = 'ingest_pause_fence';
  select watermark into v_forward
    from public.mip_consolidation_watermarks
    where source_project_ref = 'qikvmopbtijoebdqosyq' and channel = 'ingest_forward';
  select coalesce(jsonb_agg(jsonb_build_object('run_id', run_id, 'state', state) order by started_at), '[]'::jsonb)
    into v_inflight
    from public.ingestion_runs
    where mode = 'discover' and state = 'running';
  if v_forward ? 'freshness' then
    perform qik_ingest.reject_false_current(v_forward->>'freshness');
  end if;
  return jsonb_build_object(
    'is_current', false,
    'collection_authorized', coalesce(v_authorized, false),
    'schedule_active', coalesce(v_schedule, false),
    'fence', coalesce(v_fence, jsonb_build_object('missing', true)),
    'forward', coalesce(v_forward, jsonb_build_object('freshness', 'qik_forward_idle', 'is_current', false)),
    'inflight_runs', coalesce(v_inflight, '[]'::jsonb),
    'honesty', 'qik ingest is never advertised as current by this package'
  );
end
$$;

revoke all on function public.mip_qik_ingest_schedule_authorized(text) from public, anon, authenticated;
revoke all on function public.mip_qik_ingest_plan(text) from public, anon, authenticated;
revoke all on function public.mip_qik_ingest_begin_run(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mip_qik_ingest_finish_run(text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.mip_qik_ingest_recover_inflight(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.mip_qik_ingest_observe(text) from public, anon, authenticated;

grant execute on function public.mip_qik_ingest_schedule_authorized(text) to service_role, qik_ingest_runtime;
grant execute on function public.mip_qik_ingest_plan(text) to service_role, qik_ingest_runtime;
grant execute on function public.mip_qik_ingest_begin_run(text, text, timestamptz) to service_role, qik_ingest_runtime;
grant execute on function public.mip_qik_ingest_finish_run(text, text, text, jsonb, timestamptz) to service_role, qik_ingest_runtime;
grant execute on function public.mip_qik_ingest_recover_inflight(text, text, timestamptz) to service_role, qik_ingest_runtime;
grant execute on function public.mip_qik_ingest_observe(text) to service_role, qik_ingest_runtime;

do $$
begin
  execute 'alter function qik_ingest.set_forward_watermark(timestamptz, text, text, jsonb) owner to qik_ingest_fn_owner';
  execute 'alter function public.mip_qik_ingest_schedule_authorized(text) owner to qik_ingest_fn_owner';
  execute 'alter function public.mip_qik_ingest_plan(text) owner to qik_ingest_fn_owner';
  execute 'alter function public.mip_qik_ingest_begin_run(text, text, timestamptz) owner to qik_ingest_fn_owner';
  execute 'alter function public.mip_qik_ingest_finish_run(text, text, text, jsonb, timestamptz) owner to qik_ingest_fn_owner';
  execute 'alter function public.mip_qik_ingest_recover_inflight(text, text, timestamptz) owner to qik_ingest_fn_owner';
  execute 'alter function public.mip_qik_ingest_observe(text) owner to qik_ingest_fn_owner';
end
$$;
