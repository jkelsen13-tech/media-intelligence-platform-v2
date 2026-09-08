-- Run as database administrator. Every canary and queue transition rolls back.
-- Identity sequences may advance; gaps are expected and are not missing work.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
set local role service_role;
do $$
declare v uuid; evaluation uuid; j jsonb; receipt jsonb := '{"work_ref":"rollback-only-canary","coverage":"complete"}'; result text; intake_id jsonb; intake_job jsonb; cap jsonb;
begin
  if exists(select 1 from evidence_pipeline.import_jobs where state in ('pending','processing','retry_wait')) then
    raise exception 'intake active; run canary during an idle intake window'; end if;
  intake_id:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','change-queue-rollback-smoke',
    'article',jsonb_build_object('url','https://example.org/queue-smoke-'||gen_random_uuid(),
      'title','Rollback-only canary','outlet','Fixture','summary','Test source capture.','published_at','2010-01-01T00:00:00Z')));
  intake_job:=public.mip_pipeline_v1('claim');
  if intake_job->'id' is distinct from intake_id then raise exception 'claimed unrelated intake'; end if;
  cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',intake_job->>'id','lease_token',intake_job->>'lease_token'));
  if (select count(*) from evidence_pipeline.change_jobs j join evidence_pipeline.evidence_changes c
    on c.position=j.change_position where c.capture_id=(cap->>'capture_id')::uuid)<>2 then raise exception 'capture dispatch missing'; end if;
  v:=evidence_pipeline.append_version('graph_node',gen_random_uuid()::text,'insert',
    '{"fixture":"rollback-only; no public node"}','evidence-change-queue-smoke');
  if (select count(*) from evidence_pipeline.change_jobs j join evidence_pipeline.evidence_changes c
      on c.position=j.change_position where c.record_version_id=v)<>2 then raise exception 'two dispatch routes missing'; end if;
  -- Only the just-created canary receives priority. Existing pending jobs stay intact.
  update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '100 years'
    where change_position=(select position from evidence_pipeline.evidence_changes where record_version_id=v);
  j:=public.mip_evidence_changes_v1('claim','{"route":"dependency_lookup"}');
  if j->'change'->>'record_version_id' is distinct from v::text then raise exception 'claimed unrelated job'; end if;
  begin
    perform public.mip_evidence_changes_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',gen_random_uuid(),'receipt',receipt));
    raise exception 'bad token accepted';
  exception when others then
    if sqlerrm not like '%invalid or expired lease%' then raise; end if;
  end;
  result:=public.mip_evidence_changes_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token','receipt',receipt));
  perform public.mip_evidence_changes_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token','receipt',receipt));
  if (select count(*) from evidence_pipeline.change_job_events where job_id=(j->>'id')::uuid and event='completed')<>1 then raise exception 'receipt duplicated'; end if;
  -- Synthetic qualification applies only inside this rollback fixture.
  insert into evidence_pipeline.worker_evaluations(algorithm_key,algorithm_version,record_kind,implementation_sha256,dataset_sha256,report_sha256,report_ref,reviewer_ref,case_count,passed,acceptance_checks,limitations)
  values('queue-rollback-fixture','test','graph_node',repeat('a',64),repeat('b',64),repeat('c',64),'rollback-only fixture','rollback canary',1,true,
    '{"producer_isolation":true,"bounded_work":true,"durable_recovery":true,"evidence_fidelity":true,"held_out_evaluation":true}',
    'Synthetic contract fixture; never a production worker qualification') returning id into evaluation;
  j:=public.mip_evaluated_record_claim_v1(evaluation,repeat('a',64),'graph_node');
  if j->'change'->>'record_version_id' is distinct from v::text then raise exception 'claimed unrelated job'; end if;
  perform public.mip_evidence_changes_v1('fail',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token','code','smoke-stop','retryable',false));
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.mip_evidence_changes_v1('status'); raise exception 'browser RPC allowed';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from evidence_pipeline.evidence_changes; raise exception 'browser table allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform public.mip_evidence_changes_v1('status'); raise exception 'browser RPC allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'service_role dispatch, fencing, receipt replay, failure and browser denial passed; fixtures rolled back' result;
