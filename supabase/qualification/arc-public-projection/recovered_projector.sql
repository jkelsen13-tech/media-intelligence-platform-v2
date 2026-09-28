CREATE OR REPLACE FUNCTION public.mip_project_approved_arc_membership(p_candidate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_candidate public.arc_membership_candidates%rowtype;
  v_score public.arc_membership_scores%rowtype;
  v_article public.articles%rowtype;
  v_arc public.story_arcs%rowtype;
  v_run public.arc_membership_projection_runs%rowtype;
  v_node_id uuid;
  v_source_id uuid;
  v_edge_id uuid := null;
  v_arc_event_id uuid;
  v_text text;
  v_event_category text;
  v_event_confidence text;
  v_milestone public.arc_milestones%rowtype;
  v_outcome text;
  v_milestones_evidenced integer := 0;
begin
  select * into v_candidate
    from public.arc_membership_candidates
   where id = p_candidate_id
   for update;
  if not found then raise exception 'arc membership candidate not found'; end if;
  if v_candidate.state <> 'approved' or v_candidate.approved_score_id is null then
    raise exception 'arc membership projection requires an approved algorithmic candidate';
  end if;

  select * into v_score
    from public.arc_membership_scores
   where id = v_candidate.approved_score_id;
  if not found
     or v_score.candidate_id <> v_candidate.id
     or v_score.decision <> 'candidate'
     or v_score.hard_rejections <> '[]'::jsonb then
    raise exception 'arc membership projection approval signal is not admissible';
  end if;

  select * into v_run
    from public.arc_membership_projection_runs
   where candidate_id = v_candidate.id
   for update;
  if found and v_run.state = 'active' then
    return jsonb_build_object(
      'candidate_id', v_candidate.id,
      'status', 'already_projected',
      'event_node_id', v_run.event_node_id,
      'source_id', v_run.source_id,
      'edge_id', v_run.edge_id,
      'arc_event_id', v_run.arc_event_id
    );
  end if;

  select * into v_article from public.articles where id = v_candidate.article_id for update;
  if not found then raise exception 'projection article not found'; end if;
  select * into v_arc from public.story_arcs where id = v_candidate.arc_id for update;
  if not found then raise exception 'projection arc not found'; end if;

  v_text := btrim(coalesce(v_article.title, '') || '. ' || coalesce(v_article.summary, '') || '. ' || coalesce(v_article.body_text, ''));
  v_event_category := case v_arc.category
    when 'institutional_accountability' then 'accountability'
    when 'geopolitical_consequence' then 'geopolitical'
    when 'economic_policy' then 'economic'
    when 'legislative_regulatory' then 'legislative'
    else 'accountability'
  end;
  v_event_confidence := case when exists (
    select 1 from public.citations c
    where c.article_id = v_article.id
      and c.cited_type in ('court_doc', 'agency_release')
  ) then 'confirmed' else 'corroborated' end;

  insert into public.nodes (
    slug, label, type, description, confidence, summary, occurred_at, arc_id,
    arc_membership_candidate_id, metadata
  ) values (
    'arc-member-' || v_candidate.id::text,
    left(v_article.title, 120),
    'event',
    left(coalesce(v_article.summary, ''), 400),
    70,
    left(coalesce(v_article.summary, ''), 400),
    v_article.published_at::date,
    v_candidate.arc_id,
    v_candidate.id,
    jsonb_build_object(
      'article_id', v_article.id,
      'arc_membership_candidate_id', v_candidate.id,
      'projection_rule_version', 'arc-membership-post-approval-projection-v1'
    )
  ) on conflict (slug) do update
    set label = excluded.label,
        description = excluded.description,
        summary = excluded.summary,
        occurred_at = excluded.occurred_at,
        arc_id = excluded.arc_id,
        arc_membership_candidate_id = excluded.arc_membership_candidate_id,
        metadata = excluded.metadata,
        updated_at = now()
  returning id into v_node_id;

  insert into public.sources (
    node_id, outlet, headline, url, published_at, arc_membership_candidate_id
  ) values (
    v_node_id,
    coalesce(nullif(btrim(v_article.outlet), ''), 'Unspecified outlet'),
    left(v_article.title, 200),
    v_article.url,
    v_article.published_at::date,
    v_candidate.id
  ) on conflict (arc_membership_candidate_id) where arc_membership_candidate_id is not null do update
    set node_id = excluded.node_id,
        outlet = excluded.outlet,
        headline = excluded.headline,
        url = excluded.url,
        published_at = excluded.published_at
  returning id into v_source_id;

  insert into public.arc_events (
    arc_id, title, category, confidence, occurred_at, description,
    arc_membership_candidate_id
  ) values (
    v_candidate.arc_id,
    left(v_article.title, 200),
    v_event_category,
    v_event_confidence,
    v_article.published_at::date,
    left(coalesce(v_article.summary, ''), 400),
    v_candidate.id
  ) on conflict (arc_membership_candidate_id) where arc_membership_candidate_id is not null do update
    set title = excluded.title,
        category = excluded.category,
        confidence = excluded.confidence,
        occurred_at = excluded.occurred_at,
        description = excluded.description
  returning id into v_arc_event_id;

  if v_arc.root_node_id is not null and v_arc.root_node_id <> v_node_id then
    insert into public.edges (
      source_id, target_id, type, weight, label, signal_source, doc_strength,
      claimed_by, reliability, counterfactual_test, arc_membership_candidate_id, metadata
    ) values (
      v_arc.root_node_id,
      v_node_id,
      'sequence',
      'light',
      'algorithmically admitted Arc membership',
      'shared_entity',
      'circumstantial',
      'reporting',
      4,
      'sequence_only',
      v_candidate.id,
      jsonb_build_object(
        'article_id', v_article.id,
        'arc_membership_candidate_id', v_candidate.id,
        'projection_rule_version', 'arc-membership-post-approval-projection-v1'
      )
    ) on conflict (source_id, target_id, type) do update
      set label = excluded.label,
          weight = excluded.weight,
          signal_source = excluded.signal_source,
          doc_strength = excluded.doc_strength,
          claimed_by = excluded.claimed_by,
          reliability = excluded.reliability,
          counterfactual_test = excluded.counterfactual_test,
          arc_membership_candidate_id = excluded.arc_membership_candidate_id,
          metadata = excluded.metadata
    returning id into v_edge_id;
  end if;

  insert into public.arc_membership_projection_runs (
    candidate_id, state, event_node_id, source_id, edge_id, arc_event_id,
    projected_at, retracted_at, updated_at
  ) values (
    v_candidate.id, 'active', v_node_id, v_source_id, v_edge_id, v_arc_event_id,
    now(), null, now()
  ) on conflict (candidate_id) do update
    set state = 'active',
        event_node_id = excluded.event_node_id,
        source_id = excluded.source_id,
        edge_id = excluded.edge_id,
        arc_event_id = excluded.arc_event_id,
        projected_at = now(),
        retracted_at = null,
        updated_at = now();

  for v_milestone in
    select * from public.arc_milestones
     where arc_id = v_candidate.arc_id
       and status = 'pending'
     for update
  loop
    v_outcome := public.mip_arc_projection_milestone_outcome(v_milestone.milestone_key, v_text);
    if v_outcome is null then continue; end if;
    insert into public.arc_membership_projection_milestone_baselines(
      milestone_id, baseline_status, baseline_notes
    ) values (v_milestone.id, v_milestone.status, v_milestone.notes)
    on conflict (milestone_id) do nothing;
    insert into public.arc_membership_projection_milestone_evidence(
      candidate_id, milestone_id, outcome, article_title, article_url, recorded_at
    ) values (
      v_candidate.id, v_milestone.id, v_outcome, v_article.title, v_article.url, now()
    ) on conflict (candidate_id, milestone_id) do update
      set outcome = excluded.outcome,
          article_title = excluded.article_title,
          article_url = excluded.article_url,
          recorded_at = excluded.recorded_at;
    perform public.mip_refresh_arc_projection_milestone(v_milestone.id);
    v_milestones_evidenced := v_milestones_evidenced + 1;
  end loop;

  update public.story_arcs
     set last_update_at = now()
   where id = v_candidate.arc_id;

  return jsonb_build_object(
    'candidate_id', v_candidate.id,
    'status', 'projected',
    'event_node_id', v_node_id,
    'source_id', v_source_id,
    'edge_id', v_edge_id,
    'arc_event_id', v_arc_event_id,
    'milestones_evidenced', v_milestones_evidenced
  );
end;
$function$
