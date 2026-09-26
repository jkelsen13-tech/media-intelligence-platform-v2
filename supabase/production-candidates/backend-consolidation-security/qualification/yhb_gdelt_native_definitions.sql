-- Exact pg_get_functiondef output read from yhb on 2026-09-21.
-- Synthetic qualification fixture only; contains no credentials or data.
-- Live definition SHA-256 identities are asserted by the harness.
CREATE OR REPLACE FUNCTION public.mip_v2_gdelt_stage_batch(p_run_id text, p_records jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_requested integer; v_inserted integer; v_source_id text;
begin
  if jsonb_typeof(p_records) <> 'array' then raise exception 'GDELT records must be a JSON array'; end if;
  v_requested := jsonb_array_length(p_records);
  if v_requested < 1 or v_requested > 1000 then raise exception 'GDELT stage batch must contain 1..1000 records'; end if;
  select source_id into v_source_id from public.gdelt_staging_runs where run_id = p_run_id and state = 'staging';
  if v_source_id is null then raise exception 'GDELT staging run is not open'; end if;
  with source_rows as (
    select nullif(trim(value->>'gdelt_event_id'), '') as gdelt_event_id,
      case when coalesce(value->>'gdelt_event_date', '') ~ '^\d{8}$' then to_date(value->>'gdelt_event_date', 'YYYYMMDD') else null end as gdelt_event_date,
      nullif(trim(value->>'source_url'), '') as source_url, nullif(trim(value->>'source_domain'), '') as source_domain,
      nullif(trim(value->>'actor1_name'), '') as actor1_name, nullif(trim(value->>'actor2_name'), '') as actor2_name,
      nullif(trim(value->>'event_code'), '') as event_code, nullif(trim(value->>'event_root_code'), '') as event_root_code,
      coalesce(value->'provenance', '{}'::jsonb) as provenance
    from jsonb_array_elements(p_records)
  ), inserted as (
    insert into public.gdelt_staged_articles (run_id, source_id, gdelt_event_id, gdelt_event_date, source_url, source_domain, actor1_name, actor2_name, event_code, event_root_code, event_label, provenance)
    select p_run_id, v_source_id, r.gdelt_event_id, r.gdelt_event_date, r.source_url, r.source_domain, r.actor1_name, r.actor2_name, r.event_code, r.event_root_code, public.mip_v2_gdelt_event_label(r.event_code), r.provenance || jsonb_build_object('source_id', v_source_id, 'gdelt_event_id', r.gdelt_event_id, 'fetched_at', now())
    from source_rows r
    where r.gdelt_event_id is not null and r.source_url ~ '^https?://' and r.source_domain is not null
    on conflict (run_id, gdelt_event_id) do nothing returning id
  ) select count(*) into v_inserted from inserted;
  update public.gdelt_staging_runs set counters = counters || jsonb_build_object('stage_requested', coalesce((counters->>'stage_requested')::integer, 0) + v_requested, 'staged', coalesce((counters->>'staged')::integer, 0) + v_inserted), updated_at = now() where run_id = p_run_id;
  return jsonb_build_object('requested', v_requested, 'staged', v_inserted, 'duplicate_or_invalid', v_requested - v_inserted);
end
$function$;

CREATE OR REPLACE FUNCTION public.mip_v2_gdelt_materialize_batch(p_run_id text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_selected integer := 0; v_materialized integer := 0; v_existing integer := 0;
begin
  if p_limit < 1 or p_limit > 500 then raise exception 'materialization batch must be 1..500'; end if;
  if not exists (select 1 from public.gdelt_staging_runs where run_id = p_run_id and state in ('staged', 'materializing')) then raise exception 'GDELT staging run is not ready to materialize'; end if;
  update public.gdelt_staging_runs set state = 'materializing', updated_at = now() where run_id = p_run_id;
  create temporary table if not exists pg_temp.gdelt_materialize_selection (stage_id uuid primary key, source_url text not null, article_id uuid) on commit drop;
  truncate pg_temp.gdelt_materialize_selection;
  insert into pg_temp.gdelt_materialize_selection (stage_id, source_url)
  select id, source_url from public.gdelt_staged_articles where run_id = p_run_id and state = 'staged' order by gdelt_event_date, id limit p_limit for update skip locked;
  get diagnostics v_selected = row_count;
  if v_selected = 0 then update public.gdelt_staging_runs set state = 'materialized', updated_at = now() where run_id = p_run_id; return jsonb_build_object('selected', 0, 'materialized', 0, 'skipped_existing', 0, 'done', true); end if;
  with inserted as (
    insert into public.articles (feed, outlet, title, url, summary, published_at, body_text, claims, unattributed, monoculture, is_digest, ingestion_run_id, source_status, source_status_note)
    select distinct on (s.source_url) 'gdelt-events-export', s.source_domain, left(coalesce(nullif(s.actor1_name, ''), 'GDELT event ' || s.gdelt_event_id) || case when nullif(s.actor2_name, '') is not null then ' — ' || s.actor2_name else '' end, 500), s.source_url,
      left('GDELT structured event record ' || s.gdelt_event_id || '. Actor 1: ' || coalesce(s.actor1_name, 'not recorded') || '; actor 2: ' || coalesce(s.actor2_name, 'not recorded') || '; coded action: ' || coalesce(s.event_label, 'not recorded') || '. This is GDELT event metadata, not publisher article text.', 2000),
      s.gdelt_event_date::timestamptz, null, '[]'::jsonb, true, false, false, p_run_id, 'active',
      'Discovery provenance: GDELT Event Database export (' || s.source_id || '), GlobalEventID ' || s.gdelt_event_id || ', fetched ' || s.fetched_at::text || '. Structured event metadata only; no approval, source-independence finding, or publisher-text claim is implied.'
    from public.gdelt_staged_articles s join pg_temp.gdelt_materialize_selection sel on sel.stage_id = s.id
    order by s.source_url, s.gdelt_event_id on conflict (url) do nothing returning id, url
  ) update pg_temp.gdelt_materialize_selection sel set article_id = i.id from inserted i where i.url = sel.source_url;
  update public.gdelt_staged_articles s set article_id = sel.article_id, state = case when sel.article_id is null then 'skipped_existing' else 'materialized' end, materialized_at = now(), updated_at = now() from pg_temp.gdelt_materialize_selection sel where s.id = sel.stage_id;
  select count(*) filter (where article_id is not null), count(*) filter (where article_id is null) into v_materialized, v_existing from pg_temp.gdelt_materialize_selection;
  with actor_candidates as (
    select s.article_id, trim(v.actor_name) as actor_name from public.gdelt_staged_articles s join pg_temp.gdelt_materialize_selection sel on sel.stage_id = s.id and sel.article_id is not null cross join lateral unnest(array[s.actor1_name, s.actor2_name]) as v(actor_name)
    where trim(coalesce(v.actor_name, '')) <> '' and upper(trim(v.actor_name)) not in ('UNKNOWN', 'UNIDENTIFIED', 'N/A', 'NULL')
  ), normalized as (
    select distinct article_id, actor_name, trim(regexp_replace(lower(actor_name), '[^a-z0-9]+', ' ', 'g')) as normalized_name from actor_candidates
  ) insert into public.entities (canonical_name, normalized_name, entity_type, mention_count, last_seen)
    select distinct on (normalized_name) left(actor_name, 160), normalized_name, public.mip_v2_gdelt_entity_type(actor_name), 0, now() from normalized where normalized_name <> ''
    on conflict (normalized_name) do update set last_seen = excluded.last_seen;
  with actor_candidates as (
    select s.article_id, trim(v.actor_name) as actor_name from public.gdelt_staged_articles s join pg_temp.gdelt_materialize_selection sel on sel.stage_id = s.id and sel.article_id is not null cross join lateral unnest(array[s.actor1_name, s.actor2_name]) as v(actor_name)
    where trim(coalesce(v.actor_name, '')) <> '' and upper(trim(v.actor_name)) not in ('UNKNOWN', 'UNIDENTIFIED', 'N/A', 'NULL')
  ), normalized as (
    select distinct article_id, trim(regexp_replace(lower(actor_name), '[^a-z0-9]+', ' ', 'g')) as normalized_name from actor_candidates
  ) insert into public.article_entities (article_id, entity_id, confidence, extraction_method, role)
    select n.article_id, e.id, 0.5, 'gdelt_structured_metadata', null from normalized n join public.entities e on e.normalized_name = n.normalized_name on conflict (article_id, entity_id) do nothing;
  update public.gdelt_staging_runs set counters = counters || jsonb_build_object('materialized', coalesce((counters->>'materialized')::integer, 0) + v_materialized, 'skipped_existing', coalesce((counters->>'skipped_existing')::integer, 0) + v_existing), updated_at = now() where run_id = p_run_id;
  return jsonb_build_object('selected', v_selected, 'materialized', v_materialized, 'skipped_existing', v_existing, 'done', false);
end
$function$;

CREATE OR REPLACE FUNCTION public.mip_v2_gdelt_attach_batch(p_run_id text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_row record; v_arc_id uuid; v_shared_ids uuid[]; v_shared_names text[]; v_selected integer := 0; v_attached integer := 0; v_unattached integer := 0; v_df_limit integer := 5; v_confidence_floor numeric := 0.5;
begin
  if p_limit < 1 or p_limit > 500 then raise exception 'attachment batch must be 1..500'; end if;
  if not exists (select 1 from public.gdelt_staging_runs where run_id = p_run_id and state in ('materialized', 'attaching')) then raise exception 'GDELT staging run is not ready to attach'; end if;
  update public.gdelt_staging_runs set state = 'attaching', updated_at = now() where run_id = p_run_id;
  select coalesce((value #>> '{}')::numeric, 0.5) into v_confidence_floor from public.pipeline_config where key = 'entity_resolve_min_confidence';
  select coalesce((value #>> '{}')::integer, 5) into v_df_limit from public.pipeline_config where key = 'cluster_entity_max_df';
  for v_row in select s.id as stage_id, s.article_id from public.gdelt_staged_articles s where s.run_id = p_run_id and s.state = 'materialized' and s.article_id is not null order by s.gdelt_event_date, s.id limit p_limit for update skip locked loop
    v_selected := v_selected + 1;
    select candidate.arc_id, array_agg(candidate.entity_id order by candidate.entity_id), array_agg(candidate.canonical_name order by candidate.entity_id) into v_arc_id, v_shared_ids, v_shared_names
    from (select ae_arc.arc_id, ae_arc.entity_id, e.canonical_name from public.article_entities ae_article join public.article_entities df on df.entity_id = ae_article.entity_id join public.arc_entities ae_arc on ae_arc.entity_id = ae_article.entity_id join public.story_arcs arc on arc.id = ae_arc.arc_id and arc.status = 'active' join public.entities e on e.id = ae_arc.entity_id where ae_article.article_id = v_row.article_id and ae_article.confidence >= v_confidence_floor group by ae_arc.arc_id, ae_arc.entity_id, e.canonical_name having count(distinct df.article_id) <= v_df_limit) candidate
    group by candidate.arc_id having count(*) >= 2 order by count(*) desc, candidate.arc_id limit 1;
    if v_arc_id is null then update public.gdelt_staged_articles set state = 'unattached', updated_at = now() where id = v_row.stage_id; v_unattached := v_unattached + 1; continue; end if;
    perform public.attach_article_to_arc(v_row.article_id, v_arc_id, null::vector, jsonb_build_object('similarity', null, 'shared_entity_ids', to_jsonb(v_shared_ids), 'shared_entity_names', to_jsonb(v_shared_names), 'rule_version', 'arc_assign@20260724+gte-small(threshold=0.88);gdelt-staged-no-embedding-two-shared-entities-only', 'assigned_at', now(), 'provenance', 'GDELT Event Database structured metadata; no publisher-text embedding'));
    update public.story_arcs set last_update_at = now(), last_assignment_run = now() where id = v_arc_id;
    update public.gdelt_staged_articles set state = 'attached', attached_at = now(), updated_at = now() where id = v_row.stage_id; v_attached := v_attached + 1;
  end loop;
  if v_selected = 0 then update public.gdelt_staging_runs set state = 'attached', updated_at = now() where run_id = p_run_id; end if;
  update public.gdelt_staging_runs set counters = counters || jsonb_build_object('attached_existing_arc', coalesce((counters->>'attached_existing_arc')::integer, 0) + v_attached, 'unattached_after_existing_arc_scan', coalesce((counters->>'unattached_after_existing_arc_scan')::integer, 0) + v_unattached), updated_at = now() where run_id = p_run_id;
  return jsonb_build_object('selected', v_selected, 'attached', v_attached, 'unattached', v_unattached, 'done', v_selected = 0);
end
$function$;

CREATE OR REPLACE FUNCTION public.mip_v2_gdelt_originate_batch(p_run_id text, p_max_components integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_component record; v_actor_id uuid; v_actor_name text; v_process text; v_cluster_text text; v_seed_article uuid; v_seed_date date; v_arc_id uuid; v_root_node_id uuid; v_event_id uuid; v_distinct_outlets integer; v_originated integer := 0; v_pending_events integer := 0; v_no_origination integer := 0; v_df_limit integer := 5; v_confidence_floor numeric := 0.5; v_shared_ids uuid[]; v_shared_names text[]; v_components_processed integer := 0; v_terminal_unattached integer := 0;
begin
  if p_max_components < 1 or p_max_components > 100 then raise exception 'origin component batch must be 1..100'; end if;
  if not exists (select 1 from public.gdelt_staging_runs where run_id = p_run_id and state in ('attached', 'attaching')) then raise exception 'GDELT staging run is not ready for origination'; end if;
  select coalesce((value #>> '{}')::numeric, 0.5) into v_confidence_floor from public.pipeline_config where key = 'entity_resolve_min_confidence';
  select coalesce((value #>> '{}')::integer, 5) into v_df_limit from public.pipeline_config where key = 'cluster_entity_max_df';
  for v_component in
    with recursive eligible as (select s.id as stage_id, s.article_id from public.gdelt_staged_articles s where s.run_id = p_run_id and s.state = 'unattached' and s.article_id is not null),
    entity_links as (select distinct e.stage_id, ae.entity_id from eligible e join public.article_entities ae on ae.article_id = e.article_id and ae.confidence >= v_confidence_floor join public.article_entities df on df.entity_id = ae.entity_id group by e.stage_id, ae.entity_id having count(distinct df.article_id) <= v_df_limit),
    edges as (select distinct left_link.stage_id as source_stage_id, right_link.stage_id as target_stage_id from entity_links left_link join entity_links right_link on right_link.entity_id = left_link.entity_id where left_link.stage_id <> right_link.stage_id),
    reach(root_stage_id, stage_id) as (select stage_id, stage_id from eligible union select reach.root_stage_id, edges.target_stage_id from reach join edges on edges.source_stage_id = reach.stage_id),
    component_membership as (select stage_id, min(root_stage_id::text)::uuid as component_key from reach group by stage_id),
    components as (select component_key, array_agg(stage_id order by stage_id) as stage_ids from component_membership group by component_key having count(*) >= 2)
    select component_key, stage_ids from components order by component_key limit p_max_components
  loop
    v_components_processed := v_components_processed + 1;
    select e.id, e.canonical_name into v_actor_id, v_actor_name from public.gdelt_staged_articles s join public.article_entities ae on ae.article_id = s.article_id and ae.confidence >= v_confidence_floor join public.entities e on e.id = ae.entity_id where s.id = any(v_component.stage_ids) order by case e.entity_type when 'institution' then 1 when 'person' then 2 else 3 end, e.canonical_name limit 1;
    select string_agg(a.title || '. ' || coalesce(a.summary, ''), ' ' order by a.published_at, a.id), (array_agg(a.id order by a.published_at nulls last, a.id))[1], min(a.published_at)::date, count(distinct a.outlet) into v_cluster_text, v_seed_article, v_seed_date, v_distinct_outlets from public.gdelt_staged_articles s join public.articles a on a.id = s.article_id where s.id = any(v_component.stage_ids);
    v_process := public.mip_v2_gdelt_process(coalesce(v_cluster_text, ''));
    if v_actor_id is null or v_process is null then update public.gdelt_staged_articles set state = 'unattached_no_origination', failure_note = 'No production-pattern process or resolved actor for GDELT component', updated_at = now() where id = any(v_component.stage_ids); v_no_origination := v_no_origination + cardinality(v_component.stage_ids); continue; end if;
    insert into public.nodes (slug, label, type, description, summary, confidence, occurred_at, metadata) values ('evt-gdelt-' || substr(md5(p_run_id || ':' || v_component.component_key::text), 1, 24), left(v_actor_name || ' — ' || v_process, 120), 'event', left(v_cluster_text, 400), left(v_cluster_text, 400), 65, v_seed_date, jsonb_build_object('ingestion_run_id', p_run_id, 'provenance', 'GDELT Event Database structured metadata')) on conflict (slug) do update set label = excluded.label returning id into v_root_node_id;
    insert into public.story_arcs (slug, title, category, category_confidence, category_evidence, seed_article_id, title_article_count, status, root_node_id, summary, started_at, last_assignment_run) values ('arc-gdelt-' || substr(md5(p_run_id || ':' || v_component.component_key::text), 1, 24), left(v_actor_name || ' — ' || v_process, 140), 'unclassified', null, null, v_seed_article, cardinality(v_component.stage_ids), 'active', v_root_node_id, left(v_cluster_text, 500), v_seed_date, now()) on conflict (slug) do update set last_assignment_run = excluded.last_assignment_run returning id into v_arc_id;
    with entity_frequency as (select ae.entity_id, count(distinct ae.article_id) as member_count from public.gdelt_staged_articles s join public.article_entities ae on ae.article_id = s.article_id and ae.confidence >= v_confidence_floor where s.id = any(v_component.stage_ids) group by ae.entity_id) insert into public.arc_entities (arc_id, entity_id, role) select v_arc_id, entity_id, case when entity_id = v_actor_id then 'primary' else 'participant' end from entity_frequency where member_count >= 2 on conflict (arc_id, entity_id) do nothing;
    if not exists (select 1 from public.arc_entities where arc_id = v_arc_id) then insert into public.arc_entities (arc_id, entity_id, role) values (v_arc_id, v_actor_id, 'primary') on conflict do nothing; end if;
    select array_agg(distinct ae.entity_id order by ae.entity_id), array_agg(distinct e.canonical_name order by e.canonical_name) into v_shared_ids, v_shared_names from public.gdelt_staged_articles s join public.article_entities ae on ae.article_id = s.article_id and ae.confidence >= v_confidence_floor join public.entities e on e.id = ae.entity_id where s.id = any(v_component.stage_ids);
    perform public.attach_article_to_arc(s.article_id, v_arc_id, null::vector, jsonb_build_object('similarity', null, 'shared_entity_ids', to_jsonb(v_shared_ids), 'shared_entity_names', to_jsonb(v_shared_names), 'rule_version', 'arc_origin@production-rules;gdelt-staged-structured-metadata', 'assigned_at', now(), 'provenance', 'GDELT Event Database structured metadata; new arc remains subject to review')) from public.gdelt_staged_articles s where s.id = any(v_component.stage_ids);
    update public.gdelt_staged_articles set state = 'originated', attached_at = now(), updated_at = now() where id = any(v_component.stage_ids); v_originated := v_originated + cardinality(v_component.stage_ids);
    if v_distinct_outlets >= 2 then
      insert into public.events (canonical_title, occurred_at_start, occurred_at_end, arc_id, status, rule_version, comparison_validation_state) select left(v_actor_name || ' — ' || v_process, 500), min(a.published_at)::date, max(a.published_at)::date, v_arc_id, 'candidate', 'gdelt-staged-attach@v1', 'pending_review' from public.gdelt_staged_articles s join public.articles a on a.id = s.article_id where s.id = any(v_component.stage_ids) returning id into v_event_id;
      insert into public.event_articles (event_id, article_id, membership_method, membership_confidence) select v_event_id, s.article_id, 'gdelt_staged_arc_component_production_rules', null from public.gdelt_staged_articles s where s.id = any(v_component.stage_ids) on conflict (event_id, article_id) do nothing; v_pending_events := v_pending_events + 1;
    end if;
  end loop;
  if v_components_processed < p_max_components then
    update public.gdelt_staged_articles
    set state = 'unattached_no_origination', failure_note = 'No multi-article component meets the unchanged production entity-overlap gate', updated_at = now()
    where run_id = p_run_id and state = 'unattached';
    get diagnostics v_terminal_unattached = row_count;
  end if;
  update public.gdelt_staging_runs set counters = counters || jsonb_build_object('originated_articles', coalesce((counters->>'originated_articles')::integer, 0) + v_originated, 'new_multi_outlet_pending_events', coalesce((counters->>'new_multi_outlet_pending_events')::integer, 0) + v_pending_events, 'unattached_no_origination', coalesce((counters->>'unattached_no_origination')::integer, 0) + v_no_origination + v_terminal_unattached), state = case when not exists (select 1 from public.gdelt_staged_articles where run_id = p_run_id and state = 'unattached') then 'completed' else 'attached' end, completed_at = case when not exists (select 1 from public.gdelt_staged_articles where run_id = p_run_id and state = 'unattached') then now() else completed_at end, updated_at = now() where run_id = p_run_id;
  return jsonb_build_object('components_processed', v_components_processed, 'originated_articles', v_originated, 'new_multi_outlet_pending_events', v_pending_events, 'unattached_no_origination', v_no_origination, 'terminal_unattached', v_terminal_unattached);
end
$function$;

CREATE OR REPLACE FUNCTION public.mip_v2_gdelt_close_staging(p_run_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.gdelt_staging_runs set state = 'staged', fetch_completed_at = now(), updated_at = now() where run_id = p_run_id and state = 'staging';
  if not found then raise exception 'GDELT staging run is not open'; end if;
end
$function$;
