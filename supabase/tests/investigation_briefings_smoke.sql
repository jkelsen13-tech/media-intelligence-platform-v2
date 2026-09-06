-- Rollback-only deployment canary. No fixtures or observations survive.
begin;
set local statement_timeout='20s';
set local lock_timeout='3s';
set local role service_role;
do $$
declare url text:='https://example.org/briefing-smoke-'||gen_random_uuid(); q jsonb; j jsonb; cap jsonb;
  candidate jsonb; ctx jsonb; payload jsonb; a jsonb; b jsonb; replacement jsonb;
  baseline jsonb; next_obs jsonb; retry jsonb; later jsonb; obs_id uuid:=gen_random_uuid();
begin
  if exists(select 1 from evidence_pipeline.import_jobs where state in ('pending','processing','retry_wait')) then
    raise exception 'intake active; run canary during idle intake'; end if;
  q:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','briefing-rollback-smoke','article',
    jsonb_build_object('url',url,'title','Rollback-only fixture','outlet','Fixture','summary','A report.','published_at','2019-01-01T00:00:00Z')));
  j:=public.mip_pipeline_v1('claim');
  if j->'id' is distinct from q then raise exception 'unrelated intake claimed'; end if;
  cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token'));
  candidate:=public.mip_pipeline_v1('candidate',jsonb_build_object('capture_id',cap->>'capture_id','candidate_key','briefing-fixture',
    'candidate_kind','claim','statement','A report.','source_field','summary','span_start',0,'span_end',9,'excerpt','A report.',
    'extractor_version','fixture-1','remaining_uncertainty','Rollback-only fixture.'));
  ctx:=public.mip_assessments_v1('context',jsonb_build_object('candidate_id',candidate));
  payload:=jsonb_build_object('candidate_id',candidate,'algorithm_key','rollback-fixture','algorithm_version','1',
    'outcome','insufficient_evidence','rationale','Synthetic; no semantic conclusion.','remaining_uncertainty','Fixture only.',
    'context_positions',ctx->'context_positions');
  a:=public.mip_assessments_v1('append',payload);
  ctx:=public.mip_assessments_v1('context',jsonb_build_object('candidate_id',candidate,'parents',jsonb_build_array(a)));
  b:=public.mip_assessments_v1('append',payload||jsonb_build_object('algorithm_version','child','parents',jsonb_build_array(a),'context_positions',ctx->'context_positions'));
  baseline:=public.mip_investigation_briefings_v1('observe',jsonb_build_object('observation_id',obs_id,'candidate_ids',jsonb_build_array(candidate)));
  if baseline->'changes'<>'[]'::jsonb or baseline->>'publicly_eligible'<>'false' then raise exception 'baseline incorrect'; end if;
  q:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','briefing-correction-smoke','article',
    jsonb_build_object('url',url,'title','Rollback-only fixture','outlet','Fixture','summary','A corrected report.','published_at','2010-01-01T00:00:00Z')));
  j:=public.mip_pipeline_v1('claim');
  if j->'id' is distinct from q then raise exception 'unrelated correction claimed'; end if;
  cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token'));
  next_obs:=public.mip_investigation_briefings_v1('observe',jsonb_build_object('observation_id',gen_random_uuid(),
    'previous_observation_id',obs_id,'candidate_ids',jsonb_build_array(candidate)));
  if (select count(*) from jsonb_array_elements(next_obs->'changes') c where c->>'kind'='assessment_dependency_change')<>2 then
    raise exception 'correction did not propagate to both decisions'; end if;
  if not exists(select 1 from jsonb_array_elements(next_obs->'snapshot'->'inputs') i where i->'capture'->>'id'=cap->>'capture_id') then
    raise exception 'corrected input not retained'; end if;
  if public.mip_investigation_briefings_v1('read',jsonb_build_object('observation_id',obs_id)) is distinct from baseline then
    raise exception 'baseline was reconstructed'; end if;
  retry:=public.mip_investigation_briefings_v1('observe',jsonb_build_object('observation_id',obs_id,'candidate_ids',jsonb_build_array(candidate)));
  if retry is distinct from baseline then raise exception 'retry did not preserve observation'; end if;
  ctx:=public.mip_assessments_v1('context',jsonb_build_object('candidate_id',candidate));
  replacement:=public.mip_assessments_v1('append',payload||jsonb_build_object('algorithm_version','2','predecessor_id',a,'context_positions',ctx->'context_positions','outcome','contested'));
  later:=public.mip_investigation_briefings_v1('observe',jsonb_build_object('observation_id',gen_random_uuid(),
    'previous_observation_id',next_obs->'id','candidate_ids',jsonb_build_array(candidate)));
  if not exists(select 1 from jsonb_array_elements(later->'changes') c where c->>'kind'='assessment_replaced'
    and c->'before_assessment_id'=a and c->'after_assessment_id'=replacement and c->>'after_outcome'='contested') then
    raise exception 'replacement lineage missing'; end if;
  if later->>'publicly_eligible'<>'false' then raise exception 'private boundary failed'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.mip_investigation_briefings_v1('read','{}'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform count(*) from evidence_pipeline.investigation_observations; raise exception 'browser table allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform public.mip_investigation_briefings_v1('read','{}'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'investigation baseline, exact correction, dependency propagation, replacement, immutable retry and browser denial passed; fixtures rolled back' result;
