-- Isolated V2 only. Closes two audit findings without restoring base-table grants,
-- promoting graph/timeline/arc/geography candidates, or touching Legal/Policy,
-- Document 07/Callais, or redistricting-adjacent material.
--
-- The auditability contract distinguishes an exact, retained publisher excerpt
-- from a public claim that cannot be verified against the locally retained text.
-- The promotion contract applies only to deterministic literal spans from active,
-- non-protected articles with exactly one recorded event. It remains News-detail
-- material: Source Comparison continues to filter claims by its own rule version.

alter table public.article_claims
  add column if not exists evidence_source_field text,
  add column if not exists evidence_excerpt text,
  add column if not exists auditability_state text not null default 'unverified_against_retained_source',
  add column if not exists auditability_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'article_claims_evidence_source_field_check'
      and conrelid = 'public.article_claims'::regclass
  ) then
    alter table public.article_claims
      add constraint article_claims_evidence_source_field_check
      check (evidence_source_field is null or evidence_source_field in ('title', 'summary', 'body_text'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'article_claims_auditability_state_check'
      and conrelid = 'public.article_claims'::regclass
  ) then
    alter table public.article_claims
      add constraint article_claims_auditability_state_check
      check (auditability_state in ('verified_retained_source', 'unverified_against_retained_source'));
  end if;
end
$$;

-- Classify every inserted or revised claim surface from the article's stored
-- publisher record. Direct literal spans are preferred. A normalization-only
-- match is accepted only where the deterministic regex resolves one literal
-- retained excerpt; it never uses semantic similarity or paraphrase matching.
create or replace function public.mip_v2_apply_article_claim_auditability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_summary text;
  v_body text;
  v_text text := coalesce(new.surface_text, '');
  v_pattern text;
  v_field text;
  v_source text;
  v_start integer;
  v_excerpt text;
begin
  select title, summary, body_text
    into v_title, v_summary, v_body
  from public.articles
  where id = new.article_id;

  new.evidence_source_field := null;
  new.evidence_excerpt := null;
  new.char_start := null;
  new.char_end := null;
  new.auditability_state := 'unverified_against_retained_source';
  new.auditability_note := 'No exact retained publisher excerpt supports this public claim surface.';

  if v_text = '' then
    return new;
  end if;

  -- A deterministic promoter may supply an independently validated body span.
  -- Preserve it only when the current retained article body still equals the
  -- public surface verbatim at the submitted offsets.
  if new.evidence_source_field = 'body_text'
     and new.char_start is not null
     and new.char_end is not null
     and new.char_start >= 0
     and new.char_end > new.char_start
     and substring(coalesce(v_body, '') from new.char_start + 1 for new.char_end - new.char_start) = v_text then
    new.evidence_excerpt := substring(v_body from new.char_start + 1 for new.char_end - new.char_start);
    new.auditability_state := 'verified_retained_source';
    new.auditability_note := null;
    return new;
  end if;

  select src.field, src.value, position(lower(v_text) in lower(src.value))
    into v_field, v_source, v_start
  from (values
    ('title'::text, v_title, 1),
    ('summary'::text, v_summary, 2),
    ('body_text'::text, v_body, 3)
  ) as src(field, value, ordinal)
  where src.value is not null
    and position(lower(v_text) in lower(src.value)) > 0
  order by src.ordinal
  limit 1;

  if v_field is not null then
    v_excerpt := substring(v_source from v_start for char_length(v_text));
  else
    v_pattern := regexp_replace(lower(v_text), '[^[:alnum:]]+', '[^[:alnum:]]*', 'g');
    select src.field, src.value, regexp_instr(lower(src.value), v_pattern, 1, 1, 0, 'i')
      into v_field, v_source, v_start
    from (values
      ('title'::text, v_title, 1),
      ('summary'::text, v_summary, 2),
      ('body_text'::text, v_body, 3)
    ) as src(field, value, ordinal)
    where src.value is not null
      and regexp_instr(lower(src.value), v_pattern, 1, 1, 0, 'i') > 0
    order by src.ordinal
    limit 1;

    if v_field is not null then
      v_excerpt := regexp_substr(v_source, v_pattern, 1, 1, 'i');
    end if;
  end if;

  if v_field is not null and v_start > 0 and coalesce(v_excerpt, '') <> '' then
    new.evidence_source_field := v_field;
    new.evidence_excerpt := v_excerpt;
    new.char_start := v_start - 1;
    new.char_end := v_start - 1 + char_length(v_excerpt);
    new.auditability_state := 'verified_retained_source';
    new.auditability_note := null;
  end if;

  return new;
end;
$$;

drop trigger if exists mip_v2_article_claim_auditability_before_write on public.article_claims;
create trigger mip_v2_article_claim_auditability_before_write
before insert or update of article_id, surface_text on public.article_claims
for each row execute function public.mip_v2_apply_article_claim_auditability();

-- Backfill claim auditability only outside the absolute excluded scopes. The
-- current census contains zero affected protected public claim surfaces; the
-- filter remains part of the migration to preserve that boundary on reruns.
update public.article_claims ac
set surface_text = ac.surface_text
from public.articles a
where a.id = ac.article_id
  and ac.is_current = true
  and concat_ws(E'\n', a.title, a.summary, a.body_text, ac.surface_text) !~* 'callais|louisiana v\. callais|document 07|redistrict|gerrymander|district map';

create unique index if not exists article_claims_deterministic_promotion_dedupe_idx
  on public.article_claims (article_id, extraction_method, md5(surface_text))
  where is_current = true
    and extraction_method = 'deterministic_literal_public_promotion_v1';

-- Promote only source-bounded deterministic candidates. This function does not
-- read or change cross_surface_candidates and cannot create graph, arc,
-- timeline, geography, Legal/Policy, or Source Comparison records.
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

  select count(distinct ea.event_id), min(ea.event_id::text)::uuid
    into v_event_count, v_event_id
  from public.event_articles ea
  where ea.article_id = v_article_id;

  if coalesce(v_event_count, 0) <> 1 or v_event_id is null then
    return 0;
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

create or replace function public.mip_v2_promote_deterministic_article_claims_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mip_v2_promote_deterministic_article_claims(new.id);
  return new;
end;
$$;

drop trigger if exists mip_v2_deterministic_claim_promotion_after_extract on public.article_extraction_results;
create trigger mip_v2_deterministic_claim_promotion_after_extract
after insert on public.article_extraction_results
for each row execute function public.mip_v2_promote_deterministic_article_claims_after_insert();

-- One-time V2-only backfill. The function independently enforces the literal
-- span, active article, exactly-one-event, and prohibited-scope conditions.
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

comment on column public.article_claims.auditability_state is
  'verified_retained_source requires a stored literal source excerpt; unverified_against_retained_source is publicly disclosed rather than presented identically.';
comment on function public.mip_v2_promote_deterministic_article_claims(uuid) is
  'V2-only deterministic public claim promoter. Requires an exact body span, one event, active article, and explicit non-Callais/non-redistricting scope; never promotes cross-surface candidates.';
