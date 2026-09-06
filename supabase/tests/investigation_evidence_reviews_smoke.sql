-- Administrator-only, rollback-only canary. Never leaves an assignment or fixture.
begin;
set local statement_timeout='25s';
set local lock_timeout='3s';
select set_config('mip.review_smoke_user_id',(select id::text from public.mip_profiles order by id limit 1),true);
set local role service_role;
do $$
declare uid uuid:=nullif(current_setting('mip.review_smoke_user_id',true),'')::uuid;
  iid uuid:=gen_random_uuid();vid uuid:=gen_random_uuid();oid uuid:=gen_random_uuid();eid uuid:=gen_random_uuid();
  queued jsonb;job jsonb;cap jsonb;candidate jsonb;report jsonb;args jsonb;decision jsonb;receipt jsonb;second jsonb;history jsonb;cue jsonb;
  text_value text:='A corrected fixture report.';
begin
  if uid is null then raise exception 'canary requires an existing MIP profile'; end if;
  if exists(select 1 from evidence_pipeline.import_jobs where state in ('pending','processing','retry_wait')) then
    raise exception 'intake active; run canary during idle intake'; end if;
  queued:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','review-rollback','article',jsonb_build_object(
    'url','https://example.org/review-rollback-'||iid,'title','Rollback-only fixture','outlet','Fixture','summary',text_value,'published_at','2019-01-01T00:00:00Z')));
  job:=public.mip_pipeline_v1('claim');
  if job->'id' is distinct from queued then raise exception 'unrelated intake claimed'; end if;
  cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',job->>'id','lease_token',job->>'lease_token'));
  candidate:=public.mip_pipeline_v1('candidate',jsonb_build_object('capture_id',cap->>'capture_id','candidate_key','review-smoke','candidate_kind','claim',
    'statement',text_value,'source_field','summary','span_start',0,'span_end',length(text_value),'excerpt',text_value,'extractor_version','fixture','remaining_uncertainty','Synthetic.'));
  perform public.mip_investigation_briefings_v1('observe',jsonb_build_object('observation_id',oid,'candidate_ids',jsonb_build_array(candidate)));
  perform public.mip_investigation_workspace_v1('put',jsonb_build_object('investigation_id',iid,'version_id',vid,'previous_version_id',null,'observation_id',oid,
    'state',jsonb_build_object('question','Does this fixture cue warrant follow-up?','scope_note','Rollback only.','canonical_subject',null,
      'time_range',jsonb_build_object('from',null,'to',null,'meaning','Unknown.'),'unresolved_questions','[]'::jsonb,'hypotheses','[]'::jsonb,'commitments','[]'::jsonb,'coverage','[]'::jsonb),
    'change_reason','Rollback fixture.'));
  perform public.mip_investigation_workspace_v1('set_access',jsonb_build_object('user_id',uid,'investigation_id',iid,'access_role','reviewer','reason','Rollback-only assignment.'));
  report:=public.mip_investigation_evidence_checks_v1('run',jsonb_build_object('user_id',uid,'investigation_id',iid,'version_id',vid));
  args:=jsonb_build_object('user_id',uid,'investigation_id',iid,'version_id',vid,'report_id',report->'report'->'id');
  if public.mip_investigation_evidence_reviews_v1('read',args)->>'revision'<>'0' then raise exception 'read wrote a review'; end if;
  cue:=report->'report'->'result'->'challenge_cues'->0;
  decision:=args||jsonb_build_object('event_id',eid,'previous_event_id',null,'target_kind','evidence_cue','target_id',cue->>'id',
    'decision','relevant','rationale','Synthetic cue retained for follow-up, not a verdict.',
    'evidence',jsonb_build_array((cue->'reference')||jsonb_build_object('relation','context','note','Exact saved fixture text.')));
  receipt:=public.mip_investigation_evidence_reviews_v1('decide',decision);
  if receipt->'event'->>'revision'<>'1' or receipt->>'publicly_eligible'<>'false' then raise exception 'review receipt incorrect'; end if;
  if public.mip_investigation_evidence_reviews_v1('decide',decision)->'event' is distinct from receipt->'event' then raise exception 'retry duplicated review'; end if;
  begin
    perform public.mip_investigation_evidence_reviews_v1('decide',decision||jsonb_build_object('event_id',gen_random_uuid()));
    raise exception 'stale decision accepted'; exception when serialization_failure then null;
  end;
  second:=public.mip_investigation_evidence_reviews_v1('decide',decision||jsonb_build_object('event_id',gen_random_uuid(),'previous_event_id',eid,'decision','disputed'));
  if second->'event'->>'revision'<>'2' then raise exception 'replacement missing'; end if;
  history:=public.mip_investigation_evidence_reviews_v1('history',args||jsonb_build_object('target_kind','evidence_cue','target_id',cue->>'id','at_revision','1','before_revision',null));
  if jsonb_array_length(history->'events')<>1 or history->'events'->0->>'decision'<>'relevant' then raise exception 'history leaked future decision'; end if;
  if (public.mip_investigation_evidence_reviews_v1('read',args)->'summary'->>'disputed')::int<>1 then raise exception 'current review missing'; end if;
  if exists(select 1 from evidence_pipeline.investigation_review_receipts where investigation_id=iid) then raise exception 'decision marked workspace reviewed'; end if;
  if public.mip_investigation_evidence_checks_v1('read',args-'report_id') is distinct from report then raise exception 'review rewrote machine report'; end if;
  perform public.mip_investigation_workspace_v1('set_access',jsonb_build_object('user_id',uid,'investigation_id',iid,'access_role','viewer','reason','Temporary viewer.'));
  perform public.mip_investigation_evidence_reviews_v1('read',args);
  begin
    perform public.mip_investigation_evidence_reviews_v1('decide',decision);
    raise exception 'viewer wrote review'; exception when insufficient_privilege then null;
  end;
  perform public.mip_investigation_workspace_v1('set_access',jsonb_build_object('user_id',uid,'investigation_id',iid,'access_role','revoked','reason','Temporary revocation.'));
  begin
    perform public.mip_investigation_evidence_reviews_v1('read',args);
    raise exception 'revoked review read'; exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.mip_investigation_evidence_reviews_v1('read','{}'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform count(*) from evidence_pipeline.investigation_evidence_review_events; raise exception 'browser table allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform public.mip_investigation_evidence_reviews_v1('read','{}'); raise exception 'browser RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'evidence reviews: immutable decisions, retry, conflicts, pinned history, unchanged report/receipts, viewer/revoked/browser denial passed; all fixtures rolled back' result;
