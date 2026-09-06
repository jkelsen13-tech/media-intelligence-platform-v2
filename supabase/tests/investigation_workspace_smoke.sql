-- Administrator canary: all fixtures and temporary assignments roll back.
begin;
set local statement_timeout='25s';
set local lock_timeout='3s';
-- Choose the fixture principal as administrator without broadening profile grants.
select set_config('mip.workspace_smoke_user_id',(select id::text from public.mip_profiles order by id limit 1),true);
set local role service_role;
do $$
declare user_id uuid; inv uuid:=gen_random_uuid(); ver1 uuid:=gen_random_uuid(); ver2 uuid:=gen_random_uuid();
  obs1 uuid:=gen_random_uuid(); obs2 uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); coverage uuid:=gen_random_uuid();
  url text:='https://example.org/workspace-rollback-'||gen_random_uuid(); q jsonb; job jsonb; cap jsonb; candidate jsonb;
  ctx jsonb; a jsonb; position text; evidence jsonb; state jsonb; result jsonb; original jsonb;
begin
  -- Existing profile identity only; never creates an Auth user or sends mail.
  user_id:=nullif(current_setting('mip.workspace_smoke_user_id',true),'')::uuid;
  if user_id is null then raise exception 'canary requires an existing MIP profile'; end if;
  if exists(select 1 from evidence_pipeline.import_jobs pending_job where pending_job.state in ('pending','processing','retry_wait')) then
    raise exception 'intake active; run canary during idle intake'; end if;
  q:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','workspace-rollback','article',jsonb_build_object(
    'url',url,'title','Rollback-only workspace fixture','outlet','Fixture','summary','A report.','published_at','2019-01-01T00:00:00Z')));
  job:=public.mip_pipeline_v1('claim');
  if job->'id' is distinct from q then raise exception 'unrelated intake claimed'; end if;
  cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',job->>'id','lease_token',job->>'lease_token'));
  candidate:=public.mip_pipeline_v1('candidate',jsonb_build_object('capture_id',cap->>'capture_id','candidate_key','workspace-smoke','candidate_kind','claim',
    'statement','A report.','source_field','summary','span_start',0,'span_end',9,'excerpt','A report.','extractor_version','fixture','remaining_uncertainty','Synthetic.'));
  ctx:=public.mip_assessments_v1('context',jsonb_build_object('candidate_id',candidate));
  a:=public.mip_assessments_v1('append',jsonb_build_object('candidate_id',candidate,'algorithm_key','workspace-fixture','algorithm_version','1',
    'outcome','insufficient_evidence','rationale','Synthetic; no semantic conclusion.','remaining_uncertainty','Fixture only.','context_positions',ctx->'context_positions'));
  result:=public.mip_investigation_briefings_v1('observe',jsonb_build_object('observation_id',obs1,'candidate_ids',jsonb_build_array(candidate)));
  select i->>'position' into position from jsonb_array_elements(result->'snapshot'->'inputs')i where i->'capture'->>'id'=cap->>'capture_id';
  evidence:=jsonb_build_array(jsonb_build_object('position',position,'source_field','summary','span_start',0,'span_end',9,'excerpt','A report.','relation','context','note','Exact synthetic excerpt.'));
  state:=jsonb_build_object('question','Did the synthetic commitment progress?','scope_note','Rollback fixture only.','canonical_subject',null,
    'time_range',jsonb_build_object('from',null,'to',null,'meaning','Unknown source interval.'),'unresolved_questions',jsonb_build_array('Was implementation observed?'),
    'coverage',jsonb_build_array(jsonb_build_object('id',coverage,'label','Fixture scope','status','limited','source_classes',jsonb_build_array('fixture'),
      'languages',jsonb_build_array('en'),'regions','[]'::jsonb,'from',null,'to',null,'retained_text','summary_only','search_status','not_run','searched_at',null,
      'method','No actual collection search.','limitations',jsonb_build_array('Synthetic data only.'))),
    'hypotheses',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'statement','Implementation remains unresolved.','assessment_ids',jsonb_build_array(a),
      'evidence',evidence,'assumptions','[]'::jsonb,'would_strengthen',jsonb_build_array('A cancellation record.'),'would_weaken',jsonb_build_array('An implementation record.'),
      'remaining_uncertainty','Synthetic.')),
    'commitments',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'actor','Fixture institution','statement','A reported commitment.','scope','Synthetic.',
      'conditions','[]'::jsonb,'deadline_text','No observed deadline.','success_criterion','Direct implementation evidence.','remaining_uncertainty','Outcome unresolved.',
      'stages',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','commitment','status','reported','depends_on','[]'::jsonb,
      'coverage_ids',jsonb_build_array(coverage),'evidence',evidence,'note','A report alone does not prove implementation.')))));
  original:=public.mip_investigation_workspace_v1('put',jsonb_build_object('investigation_id',inv,'version_id',ver1,'previous_version_id',null,
    'observation_id',obs1,'state',state,'change_reason','Rollback fixture.'));
  begin
    perform public.mip_investigation_workspace_v1('read',jsonb_build_object('user_id',user_id,'investigation_id',inv));
    raise exception 'unassigned read allowed'; exception when insufficient_privilege then null;
  end;
  perform public.mip_investigation_workspace_v1('set_access',jsonb_build_object('user_id',user_id,'investigation_id',inv,'access_role','reviewer','reason','Temporary rollback assignment.'));
  result:=public.mip_investigation_workspace_v1('read',jsonb_build_object('user_id',user_id,'investigation_id',inv));
  if result->'comparison'->>'mode'<>'not_reviewed' or result->>'publicly_eligible'<>'false'
    or jsonb_array_length(result->'version'->'state'->'hypotheses')<>1 or jsonb_array_length(result->'version'->'state'->'commitments')<>1
    or jsonb_array_length(result->'version'->'state'->'coverage')<>1 then raise exception 'initial section state incorrect'; end if;
  perform public.mip_investigation_workspace_v1('mark_review',jsonb_build_object('user_id',user_id,'investigation_id',inv,'version_id',ver1,'receipt_id',receipt,'previous_receipt_id',null));
  q:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','workspace-rollback','article',jsonb_build_object(
    'url',url,'title','Rollback-only workspace fixture','outlet','Fixture','summary','A corrected report.','published_at','2010-01-01T00:00:00Z')));
  job:=public.mip_pipeline_v1('claim'); if job->'id' is distinct from q then raise exception 'unrelated correction claimed'; end if;
  cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',job->>'id','lease_token',job->>'lease_token'));
  perform public.mip_investigation_briefings_v1('observe',jsonb_build_object('observation_id',obs2,'previous_observation_id',obs1,'candidate_ids',jsonb_build_array(candidate)));
  state:=jsonb_set(state,'{hypotheses,0,remaining_uncertainty}','"Correction requires reconsideration."');
  perform public.mip_investigation_workspace_v1('put',jsonb_build_object('investigation_id',inv,'version_id',ver2,'previous_version_id',ver1,
    'observation_id',obs2,'state',state,'change_reason','Source correction and analyst uncertainty updated.'));
  result:=public.mip_investigation_workspace_v1('read',jsonb_build_object('user_id',user_id,'investigation_id',inv));
  if result->'review'->>'version_id'<>ver1::text or result->'version'->>'id'<>ver2::text or not exists(
    select 1 from jsonb_array_elements(result->'comparison'->'evidence_changes')c where c->>'kind'='assessment_dependency_change')
    or jsonb_array_length(result->'comparison'->'definition_changes'->'hypotheses'->'updated')<>1 then
    raise exception 'correction did not reach shared briefing and hypothesis state'; end if;
  result:=public.mip_investigation_workspace_v1('read',jsonb_build_object('user_id',user_id,'investigation_id',inv,'version_id',ver1));
  if result->'version' is distinct from original then raise exception 'old version was rewritten'; end if;
  perform public.mip_investigation_workspace_v1('set_access',jsonb_build_object('user_id',user_id,'investigation_id',inv,'access_role','viewer','reason','Temporary viewer fixture.'));
  begin
    perform public.mip_investigation_workspace_v1('mark_review',jsonb_build_object('user_id',user_id,'investigation_id',inv,'version_id',ver2,'receipt_id',gen_random_uuid(),'previous_receipt_id',receipt));
    raise exception 'viewer review allowed'; exception when insufficient_privilege then null;
  end;
  perform public.mip_investigation_workspace_v1('set_access',jsonb_build_object('user_id',user_id,'investigation_id',inv,'access_role','revoked','reason','Temporary revocation fixture.'));
  begin
    perform public.mip_investigation_workspace_v1('read',jsonb_build_object('user_id',user_id,'investigation_id',inv));
    raise exception 'revoked read allowed'; exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.mip_investigation_workspace_v1('list','{}'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform count(*) from evidence_pipeline.investigation_versions; raise exception 'browser table allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform public.mip_investigation_workspace_v1('list','{}'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'workspace state, hypotheses, commitments, coverage, exact evidence, correction briefing, review baseline and assignment denial passed; fixtures and assignments rolled back' result;
