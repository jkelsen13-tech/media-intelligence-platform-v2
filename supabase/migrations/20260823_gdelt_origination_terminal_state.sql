create or replace function public.mip_v2_gdelt_originate_batch(p_run_id text, p_max_components integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;
revoke all on function public.mip_v2_gdelt_originate_batch(text, integer) from public;
