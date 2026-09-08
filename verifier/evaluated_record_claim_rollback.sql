-- Run manually as trusted SQL operator. Every fixture/claim is rolled back.
begin;
set local statement_timeout='30s';
set local role service_role;
do $test$
declare eid uuid; j jsonb; kind text; before_jobs text; before_events text;
begin
 select md5(jsonb_agg(to_jsonb(x) order by id)::text) into before_jobs from evidence_pipeline.change_jobs x;
 select md5(jsonb_agg(to_jsonb(x) order by id)::text) into before_events from evidence_pipeline.change_job_events x;
 begin perform public.mip_evaluated_record_claim_v1(gen_random_uuid(),repeat('a',64),'article'); raise exception 'missing evaluation accepted'; exception when others then if sqlerrm not like 'qualified evaluation required%' then raise; end if; end;
 begin perform public.mip_evidence_change_claim_v1('new_candidate_search','record_version'); raise exception 'producer bypass accepted'; exception when others then if sqlerrm not like 'qualified evaluation required%' then raise; end if; end;
 begin perform evidence_pipeline.claim_change_job('new_candidate_search'); raise exception 'legacy bypass accepted'; exception when others then if sqlerrm not like 'producer-scoped candidate claim required%' then raise; end if; end;
 if before_jobs is distinct from (select md5(jsonb_agg(to_jsonb(x) order by id)::text) from evidence_pipeline.change_jobs x)
 or before_events is distinct from (select md5(jsonb_agg(to_jsonb(x) order by id)::text) from evidence_pipeline.change_job_events x) then raise exception 'failed gates mutated queue'; end if;
 foreach kind in array array['article','graph_node','temporal_assessment'] loop
  insert into evidence_pipeline.worker_evaluations(algorithm_key,algorithm_version,record_kind,implementation_sha256,dataset_sha256,report_sha256,report_ref,reviewer_ref,case_count,passed,acceptance_checks,limitations)
  values('rollback-test-only','test',kind,repeat('a',64),repeat('b',64),repeat('c',64),'rollback fixture; no retained qualification','automated rollback fixture',1,true,'{"producer_isolation":true,"bounded_work":true,"durable_recovery":true,"evidence_fidelity":true,"held_out_evaluation":true}','Synthetic contract fixture only; never valid production qualification') returning id into eid;
  begin perform public.mip_evaluated_record_claim_v1(eid,repeat('d',64),kind); raise exception 'wrong implementation accepted'; exception when others then if sqlerrm not like 'qualified evaluation required%' then raise; end if; end;
  begin perform public.mip_evaluated_record_claim_v1(eid,repeat('a',64),case when kind='article' then 'graph_node' else 'article' end); raise exception 'wrong kind accepted'; exception when others then if sqlerrm not like 'qualified evaluation required%' then raise; end if; end;
  j:=public.mip_evaluated_record_claim_v1(eid,repeat('a',64),kind);
  if j is null or j->'change'->>'record_version_id' is null or j->'change'->>'capture_id' is not null then raise exception 'expected matching record job'; end if;
  if not exists(select 1 from evidence_pipeline.record_versions v where v.id=(j->'change'->>'record_version_id')::uuid and v.record_kind=kind) then raise exception 'wrong record kind claimed'; end if;
  if not exists(select 1 from evidence_pipeline.change_job_events where job_id=(j->>'id')::uuid and event='claimed' and detail->>'evaluation_id'=eid::text) then raise exception 'missing evaluation receipt'; end if;
  perform public.mip_revoke_worker_evaluation_v1(eid,'rollback test');
  perform public.mip_revoke_worker_evaluation_v1(eid,'rollback test');
  begin perform public.mip_evaluated_record_claim_v1(eid,repeat('a',64),kind); raise exception 'revoked evaluation accepted'; exception when others then if sqlerrm not like 'qualified evaluation required%' then raise; end if; end;
 end loop;
 if has_function_privilege('anon','public.mip_evaluated_record_claim_v1(uuid,text,text)','EXECUTE')
 or has_function_privilege('authenticated','public.mip_evaluated_record_claim_v1(uuid,text,text)','EXECUTE')
 or has_table_privilege('authenticated','evidence_pipeline.worker_evaluations','SELECT') then raise exception 'browser authority exposed'; end if;
end $test$;
rollback;
select 'evaluation gate rollback contracts passed' as result;
