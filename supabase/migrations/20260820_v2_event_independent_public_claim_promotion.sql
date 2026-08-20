-- Isolated V2 only. A literal claim that is verifiably present in an active,
-- permitted publisher record may be public in the expanded News detail even
-- when no comparison event exists. Event linkage remains optional and affects
-- Source Comparison only; this migration creates no event, graph, arc,
-- timeline, geography, Legal/Policy, or candidate-promotion record.

alter table public.claims
  alter column event_id drop not null;

comment on column public.claims.event_id is
  'Optional event membership for canonical claims. Null is permitted only for source-bounded News-detail claims that are intentionally outside Source Comparison.';

create or replace function public.mip_v2_promote_deterministic_article_claims(
  p_extraction_result_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_article_id uuid;
  v_event_id uuid;
  v_event_count integer;
  v_candidate jsonb;
  v_surface_text text;
  v_start integer;
  v_end integer;
  v_claim_id uuid;
  v_promoted integer := 0;
  v_kind text;
  v_stance text;
  v_loaded_language jsonb;
begin
  select aer.article_id
    into v_article_id
  from public.article_extraction_results aer
  where aer.id = p_extraction_result_id
    and aer.state = 'candidate'
    and aer.model_id = 'deterministic-literal-v1'
    and aer.algorithm_version = 'provenance-first-v2.3-deterministic-literal';

  if v_article_id is null then
    return 0;
  end if;

  -- Absolute exclusions: a held or sensitive run, or any direct content hit,
  -- is never eligible for automatic public claim promotion.
  if not exists (
    select 1
    from public.articles a
    where a.id = v_article_id
      and a.source_status = 'active'
      and coalesce(a.ingestion_run_id, '') !~* '(doc07|callais|redistrict|gerrymander|district[ _-]?map)'
      and concat_ws(E'\n', a.title, a.summary, a.body_text) !~* 'callais|louisiana v\. callais|document 07|redistrict|gerrymander|district map'
  ) then
    return 0;
  end if;

  -- Comparison membership is optional for News. When one event is recorded,
  -- preserve it; zero or multiple event relationships are not grounds to
  -- suppress a source-bounded News claim and do not create a new event.
  select count(distinct ea.event_id), min(ea.event_id::text)::uuid
    into v_event_count, v_event_id
  from public.event_articles ea
  where ea.article_id = v_article_id;

  if coalesce(v_event_count, 0) <> 1 then
    v_event_id := null;
  end if;

  for v_candidate in
    select distinct on (lower(item.value ->> 'text')) item.value
    from public.article_extraction_results aer
    cross join lateral jsonb_array_elements(coalesce(aer.output -> 'claims', '[]'::jsonb)) with ordinality as item(value, ordinal)
    where aer.id = p_extraction_result_id
      and nullif(item.value ->> 'text', '') is not null
      and (item.value ->> 'start') ~ '^[0-9]+$'
      and (item.value ->> 'end') ~ '^[0-9]+$'
      and jsonb_typeof(item.value -> 'loaded_language') = 'array'
    order by lower(item.value ->> 'text'), item.ordinal
  loop
    v_surface_text := v_candidate ->> 'text';
    v_start := (v_candidate ->> 'start')::integer;
    v_end := (v_candidate ->> 'end')::integer;
    v_kind := case coalesce(nullif(v_candidate ->> 'kind', ''), 'substantive')
      when 'framing' then 'evaluation'
      else 'attributed_report'
    end;
    v_stance := case coalesce(nullif(v_candidate ->> 'stance', ''), 'reports')
      when 'reports' then 'attributes'
      when 'disputes' then 'qualifies'
      else 'asserts'
    end;
    v_loaded_language := v_candidate -> 'loaded_language';

    if v_end <= v_start or not exists (
      select 1 from public.articles a
      where a.id = v_article_id
        and substring(coalesce(a.body_text, '') from v_start + 1 for v_end - v_start) = v_surface_text
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.article_claims ac
      where ac.article_id = v_article_id
        and ac.is_current = true
        and ac.extraction_method = 'deterministic_literal_public_promotion_v1'
        and ac.surface_text = v_surface_text
    ) then
      continue;
    end if;

    insert into public.claims (
      event_id, canonical_text, claim_kind, thin_extraction, status, rule_version, first_seen_at
    ) values (
      v_event_id, v_surface_text, v_kind, false, 'active',
      'v2-deterministic-literal-public-claim-promotion', now()
    ) returning id into v_claim_id;

    insert into public.article_claims (
      claim_id, article_id, surface_text, char_start, char_end,
      evidence_source_field, evidence_excerpt, auditability_state, auditability_note,
      extraction_method, extraction_confidence, stance, loaded_language,
      version, is_current
    ) values (
      v_claim_id, v_article_id, v_surface_text, v_start, v_end,
      'body_text', v_surface_text, 'verified_retained_source', null,
      'deterministic_literal_public_promotion_v1', 1, v_stance, v_loaded_language,
      1, true
    );

    v_promoted := v_promoted + 1;
  end loop;

  return v_promoted;
end;
$$;

-- Re-run only through the same scope and literal-span predicate. Existing
-- public surfaces are deduplicated by the promoter; this reaches permitted
-- News-only records without creating comparison events.
do $$
declare
  extraction_row record;
begin
  for extraction_row in
    select id
    from public.article_extraction_results
    where state = 'candidate'
      and model_id = 'deterministic-literal-v1'
      and algorithm_version = 'provenance-first-v2.3-deterministic-literal'
  loop
    perform public.mip_v2_promote_deterministic_article_claims(extraction_row.id);
  end loop;
end;
$$;

comment on function public.mip_v2_promote_deterministic_article_claims(uuid) is
  'V2-only deterministic public claim promoter. Requires an exact body span and explicit non-Callais/non-redistricting scope. Event linkage is optional for News and remains required by Source Comparison; no cross-surface candidate is promoted.';
