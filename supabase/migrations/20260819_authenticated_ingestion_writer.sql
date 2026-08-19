-- Isolated v2 backfill writer: authenticated RPC gateway for the local
-- provenance-first worker. This is deliberately narrower than a service role:
-- it inserts only new article URLs and candidate/review-pending derivative rows.
-- It cannot update existing articles or create graph/timeline/arc/location rows.

create table if not exists public.ingestion_writer_credentials (
  id smallint primary key default 1 check (id = 1),
  key_hash text not null,
  active boolean not null default true,
  rotated_at timestamptz not null default now(),
  check (length(key_hash) = 64)
);

alter table public.ingestion_writer_credentials enable row level security;

create or replace function public.mip_v2_assert_ingestion_writer_key(p_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_hash text;
begin
  if p_key is null or length(trim(p_key)) < 32 then
    raise exception 'invalid ingestion writer key';
  end if;
  select key_hash into expected_hash
  from public.ingestion_writer_credentials
  where id = 1 and active = true;
  if expected_hash is null or encode(digest(p_key, 'sha256'), 'hex') <> expected_hash then
    raise exception 'invalid ingestion writer key';
  end if;
end;
$$;

create or replace function public.mip_v2_ingestion_begin_run(
  p_run_id text,
  p_mode text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_algorithm_version text,
  p_model_id text,
  p_writer_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mip_v2_assert_ingestion_writer_key(p_writer_key);
  if p_run_id is null or p_run_id like 'doc07-canary-%' then
    raise exception 'held or invalid run id';
  end if;
  if p_mode <> 'backfill' then
    raise exception 'writer accepts only backfill runs';
  end if;
  insert into public.ingestion_runs (
    run_id, mode, state, source_window_start, source_window_end,
    algorithm_version, model_id, counters, notes
  ) values (
    p_run_id, p_mode, 'running', p_window_start, p_window_end,
    p_algorithm_version, p_model_id, '{}'::jsonb,
    'Authenticated isolated-v2 RPC writer; <=10 manifest, Doc 07 exclusion, and no-auto-promotion enforced by worker and writer.'
  ) on conflict (run_id) do nothing;
end;
$$;

create or replace function public.mip_v2_ingestion_write_batch(
  p_run_id text,
  p_source_key text,
  p_batch_number integer,
  p_actions jsonb,
  p_writer_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id uuid;
  v_inserted integer := 0;
begin
  perform public.mip_v2_assert_ingestion_writer_key(p_writer_key);
  if p_batch_number < 1 then
    raise exception 'batch number must be positive';
  end if;
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) > 10 then
    raise exception 'actions must be an array of at most 10 records';
  end if;
  if not exists (select 1 from public.ingestion_runs where run_id = p_run_id and state = 'running') then
    raise exception 'ingestion run is not active';
  end if;
  select id into v_source_id from public.ingestion_sources
  where source_key = p_source_key and active = true;
  if v_source_id is null then
    raise exception 'source is not active or not approved';
  end if;

  with action_rows as (
    select value as action from jsonb_array_elements(p_actions)
  ), article_rows as (
    select
      action,
      nullif(action->'article'->>'feed', '') as feed,
      nullif(action->'article'->>'outlet', '') as outlet,
      nullif(action->'article'->>'title', '') as title,
      nullif(action->'article'->>'url', '') as url,
      nullif(action->'article'->>'summary', '') as summary,
      nullif(action->'article'->>'published_at', '')::timestamptz as published_at,
      nullif(action->'article'->>'body_text', '') as body_text,
      coalesce(action->'article'->'claims', '[]'::jsonb) as claims,
      coalesce((action->'article'->>'unattributed')::boolean, true) as unattributed,
      coalesce((action->'article'->>'monoculture')::boolean, false) as monoculture,
      coalesce((action->'article'->>'is_digest')::boolean, false) as is_digest,
      action->'article'->>'source_status' as source_status,
      action->'article'->>'source_status_note' as source_status_note
    from action_rows
  ), inserted as (
    insert into public.articles (
      feed, outlet, title, url, summary, published_at, body_text, claims,
      unattributed, monoculture, is_digest, ingestion_run_id, source_status, source_status_note
    )
    select
      feed, outlet, title, url, summary, published_at, body_text, claims,
      unattributed, monoculture, is_digest, p_run_id, source_status, source_status_note
    from article_rows
    where url is not null and title is not null
    on conflict (url) do nothing
    returning id, url
  ), extraction_insert as (
    insert into public.article_extraction_results (
      article_id, algorithm_version, model_id, input_sha256, output, state, validation_errors
    )
    select
      i.id,
      ar.action->'extraction_result'->>'algorithm_version',
      ar.action->'extraction_result'->>'model_id',
      ar.action->'extraction_result'->>'input_sha256',
      ar.action->'extraction_result'->'output',
      ar.action->'extraction_result'->>'state',
      coalesce(ar.action->'extraction_result'->'validation_errors', '[]'::jsonb)
    from article_rows ar
    join inserted i on i.url = ar.url
    where jsonb_typeof(ar.action->'extraction_result') = 'object'
    on conflict (article_id, algorithm_version, input_sha256) do nothing
  ), citation_insert as (
    insert into public.citations (article_id, cited_entity, cited_type, documentation_strength, resolved_node_id)
    select
      i.id,
      citation.cited_entity,
      citation.cited_type,
      coalesce(citation.documentation_strength, 0),
      citation.resolved_node_id
    from article_rows ar
    join inserted i on i.url = ar.url
    cross join lateral jsonb_to_recordset(coalesce(ar.action->'citations', '[]'::jsonb)) as citation(
      cited_entity text, cited_type text, documentation_strength numeric, resolved_node_id uuid
    )
    on conflict (article_id, cited_entity, cited_type) do nothing
  ), candidate_insert as (
    insert into public.cross_surface_candidates (
      article_id, candidate_type, target_table, target_id, evidence_excerpt,
      evidence_start, evidence_end, algorithm_version, review_state, remaining_uncertainty
    )
    select
      i.id,
      candidate.candidate_type,
      candidate.target_table,
      candidate.target_id,
      candidate.evidence_excerpt,
      candidate.evidence_start,
      candidate.evidence_end,
      candidate.algorithm_version,
      'pending',
      candidate.remaining_uncertainty
    from article_rows ar
    join inserted i on i.url = ar.url
    cross join lateral jsonb_to_recordset(coalesce(ar.action->'cross_surface_candidates', '[]'::jsonb)) as candidate(
      candidate_type text, target_table text, target_id uuid, evidence_excerpt text,
      evidence_start integer, evidence_end integer, algorithm_version text, review_state text, remaining_uncertainty text
    )
    on conflict (article_id, candidate_type, target_table, target_id, evidence_excerpt, algorithm_version) do nothing
  )
  select count(*) into v_inserted from inserted;

  insert into public.ingestion_checkpoints (
    run_id, source_id, checkpoint_key, cursor, state, article_count
  ) values (
    p_run_id, v_source_id, format('batch-%s', lpad(p_batch_number::text, 5, '0')),
    jsonb_build_object('batch', p_batch_number, 'action_count', jsonb_array_length(p_actions)),
    'completed', v_inserted
  ) on conflict (run_id, source_id, checkpoint_key) do update set
    cursor = excluded.cursor,
    state = excluded.state,
    article_count = excluded.article_count,
    updated_at = now();

  return jsonb_build_object('inserted', v_inserted, 'requested', jsonb_array_length(p_actions));
end;
$$;

create or replace function public.mip_v2_ingestion_finish_run(
  p_run_id text,
  p_state text,
  p_counters jsonb,
  p_note text,
  p_writer_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mip_v2_assert_ingestion_writer_key(p_writer_key);
  if p_state not in ('completed', 'completed_with_errors', 'failed', 'cancelled') then
    raise exception 'invalid completion state';
  end if;
  update public.ingestion_runs
  set state = p_state,
      completed_at = now(),
      counters = coalesce(p_counters, '{}'::jsonb),
      notes = p_note
  where run_id = p_run_id;
end;
$$;

grant execute on function public.mip_v2_ingestion_begin_run(text, text, timestamptz, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.mip_v2_ingestion_write_batch(text, text, integer, jsonb, text) to anon, authenticated;
grant execute on function public.mip_v2_ingestion_finish_run(text, text, jsonb, text, text) to anon, authenticated;

comment on table public.ingestion_writer_credentials is
  'Isolated-v2 only. Stores a hash of a locally provisioned one-purpose ingestion RPC key; never expose the key or grant table access.';
comment on function public.mip_v2_ingestion_write_batch is
  'Authenticated isolated-v2 batch writer. Inserts only new article URLs and candidate/pending derivative rows; cannot promote any cross-surface record.';
