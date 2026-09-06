-- Administrator entry point; all fixture records and jobs roll back.
begin;
set local statement_timeout='20s';
set local lock_timeout='3s';
set local role service_role;
do $$
declare url text:='https://example.org/assessment-smoke-'||gen_random_uuid();
  q jsonb; j jsonb; cap jsonb; candidate jsonb; ctx jsonb; payload jsonb;
  a jsonb; b jsonb; corrected uuid; result jsonb;
begin
  if exists(select 1 from evidence_pipeline.import_jobs where state in ('pending','processing','retry_wait')) then
    raise exception 'intake active; run canary during idle intake'; end if;
  q:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','assessment-rollback-smoke','article',
    jsonb_build_object('url',url,'title','Rollback-only fixture','outlet','Fixture','summary','A report.','published_at','2019-01-01T00:00:00Z')));
  j:=public.mip_pipeline_v1('claim');
  if j->'id' is distinct from q then raise exception 'unrelated intake claimed'; end if;
  cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token'));
  candidate:=public.mip_pipeline_v1('candidate',jsonb_build_object('capture_id',cap->>'capture_id','candidate_key','assessment-fixture',
    'candidate_kind','claim','statement','A report.','source_field','summary','span_start',0,'span_end',9,'excerpt','A report.',
    'extractor_version','fixture-1','remaining_uncertainty','Rollback-only fixture.'));
  ctx:=public.mip_assessments_v1('context',jsonb_build_object('candidate_id',candidate));
  result:=public.mip_assessments_v1('input',jsonb_build_object('position',(select position::text from evidence_pipeline.evidence_changes where capture_id=(cap->>'capture_id')::uuid)));
  if result->'capture'->>'id' is distinct from cap->>'capture_id' then raise exception 'wrong exact input'; end if;
  payload:=jsonb_build_object('candidate_id',candidate,'algorithm_key','rollback-fixture','algorithm_version','1',
    'outcome','insufficient_evidence','rationale','Synthetic; no semantic conclusion.','remaining_uncertainty','Fixture only.',
    'context_positions',ctx->'context_positions');
  a:=public.mip_assessments_v1('append',payload);
  if public.mip_assessments_v1('append',payload) is distinct from a then raise exception 'replay mismatch'; end if;
  ctx:=public.mip_assessments_v1('context',jsonb_build_object('candidate_id',candidate,'parents',jsonb_build_array(a)));
  b:=public.mip_assessments_v1('append',payload||jsonb_build_object('algorithm_version','child','parents',jsonb_build_array(a),'context_positions',ctx->'context_positions'));
  result:=public.mip_assessments_v1('read',jsonb_build_object('assessment_id',b));
  if result->>'stale'<>'false' or result->>'publicly_eligible'<>'false' then raise exception 'initial private state incorrect'; end if;
  q:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','assessment-correction-smoke','article',
    jsonb_build_object('url',url,'title','Rollback-only fixture','outlet','Fixture','summary','A corrected report.','published_at','2010-01-01T00:00:00Z')));
  j:=public.mip_pipeline_v1('claim');
  if j->'id' is distinct from q then raise exception 'unrelated correction intake'; end if;
  cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token'));
  corrected:=(cap->>'capture_id')::uuid;
  result:=public.mip_assessments_v1('read',jsonb_build_object('assessment_id',b));
  if result->>'stale'<>'true' then raise exception 'child freshness did not propagate'; end if;
  begin
    perform public.mip_assessments_v1('append',payload||'{"algorithm_version":"delayed"}');
    raise exception 'stale context accepted';
  exception when others then if sqlerrm not like '%context changed%' then raise; end if; end;
  update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '100 years'
    where change_position=(select position from evidence_pipeline.evidence_changes where capture_id=corrected);
  j:=public.mip_evidence_changes_v1('claim','{"route":"dependency_lookup"}');
  if j->'change'->>'capture_id' is distinct from corrected::text then raise exception 'unrelated dependency claimed'; end if;
  q:=jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token','limit',1);
  begin
    perform public.mip_assessments_v1('process_dependency',q||jsonb_build_object('lease_token',gen_random_uuid()));
    raise exception 'wrong token accepted';
  exception when others then if sqlerrm not like '%invalid or expired lease%' then raise; end if; end;
  result:=public.mip_assessments_v1('process_dependency',q);
  if result->>'coverage'<>'partial' then raise exception 'partial fanout completed'; end if;
  result:=public.mip_assessments_v1('process_dependency',q);
  if result->>'coverage'<>'complete' then raise exception 'full fanout incomplete'; end if;
  if public.mip_assessments_v1('process_dependency',q) is distinct from result then raise exception 'receipt replay mismatch'; end if;
  perform public.mip_assessments_v1('reconcile');
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.mip_assessments_v1('reconcile'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform count(*) from evidence_pipeline.assessments; raise exception 'browser table allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform public.mip_assessments_v1('reconcile'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'assessment context, exact input, replay, inherited freshness, fencing, paged completion and browser denial passed; fixtures rolled back' result;
