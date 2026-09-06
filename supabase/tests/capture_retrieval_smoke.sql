-- All source fixtures, queue work and retrieval results roll back.
begin;
set local statement_timeout='20s';
set local lock_timeout='3s';
set local role service_role;
do $$
declare caps uuid[]:='{}'; q jsonb; j jsonb; c jsonb; r jsonb; result jsonb; found_pair boolean; n integer;
begin
 if exists(select 1 from evidence_pipeline.import_jobs where state in ('pending','processing','retry_wait')) then raise exception 'intake active; idle intake required'; end if;
 for n in 1..2 loop
   q:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','retrieval-rollback-smoke','article',jsonb_build_object(
     'url','https://example.org/retrieval-fixture-'||gen_random_uuid(),'title','Report','outlet','Fixture',
     'summary','Riverbridge wetlands pollution investigation.','published_at',case when n=1 then '2026-01-01T00:00:00Z' else '1980-01-01T00:00:00Z' end)));
   j:=public.mip_pipeline_v1('claim');if j->'id' is distinct from q then raise exception 'unrelated intake'; end if;
   c:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token'));
   caps:=array_append(caps,(c->>'capture_id')::uuid);
 end loop;
 update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '100 years'
 where change_position=(select position from evidence_pipeline.evidence_changes where capture_id=caps[2]);
 j:=public.mip_evidence_changes_v1('claim','{"route":"new_candidate_search"}');
 if j->'change'->>'capture_id' is distinct from caps[2]::text then raise exception 'unrelated search claimed'; end if;
 r:=public.mip_capture_retrieval_v1('start',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token'));
 if not (r->'targets' @> to_jsonb(array[caps[1]])) then raise exception 'ordinary input omitted for historical source'; end if;
 for n in 1..81 loop
   result:=public.mip_capture_retrieval_v1('page',jsonb_build_object('run_id',r->>'id','lease_token',j->>'lease_token'));
   exit when result->>'coverage'='complete';
 end loop;
 if result->>'coverage'<>'complete' then raise exception 'bounded smoke did not finish'; end if;
 select exists(select 1 from evidence_pipeline.retrieval_pairs where left_capture_id=least(caps[1],caps[2]) and right_capture_id=greatest(caps[1],caps[2]) and disposition='retrieval_candidate' and release_state='private') into found_pair;
 if not found_pair then raise exception 'expected lexical pair missing'; end if;
 if public.mip_capture_retrieval_v1('page',jsonb_build_object('run_id',r->>'id','lease_token',j->>'lease_token')) is distinct from result then raise exception 'retry mismatch'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.mip_capture_retrieval_v1('read');raise exception 'browser RPC permitted';exception when insufficient_privilege then null;end;
 begin perform count(*) from evidence_pipeline.retrieval_pairs;raise exception 'browser table permitted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.mip_capture_retrieval_v1('results');raise exception 'browser RPC permitted';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'service-role retained-input retrieval, historical arrival, exact retry and browser denial passed; fixtures rolled back' result;
