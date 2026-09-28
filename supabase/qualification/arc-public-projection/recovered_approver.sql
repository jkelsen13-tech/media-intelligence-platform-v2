CREATE OR REPLACE FUNCTION public.mip_approve_arc_membership_candidate(p_candidate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_candidate public.arc_membership_candidates%rowtype;
  v_score public.arc_membership_scores%rowtype;
  v_policy public.arc_membership_release_policy%rowtype;
  v_article public.articles%rowtype;
  v_result jsonb;
begin
  select * into v_candidate from public.arc_membership_candidates where id = p_candidate_id for update;
  if not found then raise exception 'arc membership candidate not found'; end if;
  if v_candidate.state <> 'pending' then raise exception 'arc membership candidate is not pending'; end if;
  select * into v_score from public.arc_membership_scores
    where candidate_id = v_candidate.id
    order by scored_at desc limit 1;
  if not found then raise exception 'arc membership candidate has no score'; end if;
  if v_score.decision <> 'candidate' or v_score.hard_rejections <> '[]'::jsonb then raise exception 'arc membership score is not admissible'; end if;
  if v_score.candidate_updated_at <> v_candidate.updated_at then raise exception 'arc membership score is stale'; end if;
  select * into v_policy from public.arc_membership_release_policy where model_version = v_score.model_version;
  if not found or not v_policy.fixture_passed or not v_policy.auto_approval_enabled or v_policy.auto_approval_threshold is null then
    raise exception 'arc membership release policy is default-deny';
  end if;
  if v_score.cluster_confidence < v_policy.auto_approval_threshold then raise exception 'arc membership score is below release threshold'; end if;
  select * into v_article from public.articles where id = v_candidate.article_id for update;
  if not found then raise exception 'candidate article not found'; end if;

  perform set_config('app.arc_membership_approval_candidate_id', v_candidate.id::text, true);
  update public.arc_membership_candidates
     set state = 'approved',
         invalidated_at = null,
         approved_score_id = v_score.id,
         approved_at = now()
   where id = v_candidate.id;

  perform public.attach_article_to_arc(v_candidate.article_id, v_candidate.arc_id, v_article.embedding, jsonb_build_object(
    'membership_gate', 'arc-v1-membership',
    'candidate_id', v_candidate.id,
    'score_id', v_score.id,
    'model_version', v_score.model_version,
    'cluster_confidence', v_score.cluster_confidence,
    'approved_at', now()
  ));
  select jsonb_build_object('candidate_id', v_candidate.id, 'article_id', v_candidate.article_id, 'arc_id', v_candidate.arc_id, 'approved', true) into v_result;
  return v_result;
end;
$function$
