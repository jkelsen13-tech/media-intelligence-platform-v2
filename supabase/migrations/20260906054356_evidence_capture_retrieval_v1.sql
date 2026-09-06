-- Private lexical capture-pair retrieval. No semantic assertion or publication.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table evidence_pipeline.retrieval_runs (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references evidence_pipeline.change_jobs(id),
 source_capture_id uuid not null references evidence_pipeline.article_captures(id),
 contract text not null default 'capture-lexical-1' check(contract='capture-lexical-1'),
 targets uuid[] not null check(cardinality(targets)<=2000),
 snapshot_hash text not null,
 is_refresh boolean not null,
 next_index integer not null default 0 check(next_index>=0 and next_index<=cardinality(targets)),
 created_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 unique(job_id,contract,snapshot_hash)
);
create unique index retrieval_initial_run on evidence_pipeline.retrieval_runs(job_id) where not is_refresh;
create index retrieval_run_source on evidence_pipeline.retrieval_runs(source_capture_id);
create table evidence_pipeline.retrieval_pairs (
 id uuid primary key default gen_random_uuid(),
 left_capture_id uuid not null references evidence_pipeline.article_captures(id),
 right_capture_id uuid not null references evidence_pipeline.article_captures(id),
 contract text not null default 'capture-lexical-1' check(contract='capture-lexical-1'),
 disposition text not null check(disposition in ('retrieval_candidate','no_lexical_match','same_article','insufficient_text')),
 shared_terms text[] not null,
 created_at timestamptz not null default clock_timestamp(),
 release_state text not null default 'private' check(release_state='private'),
 check(left_capture_id<right_capture_id),
 unique(left_capture_id,right_capture_id,contract)
);
create index retrieval_pair_right on evidence_pipeline.retrieval_pairs(right_capture_id);
create table evidence_pipeline.retrieval_run_items (
 run_id uuid not null references evidence_pipeline.retrieval_runs(id),
 target_capture_id uuid not null references evidence_pipeline.article_captures(id),
 pair_id uuid not null references evidence_pipeline.retrieval_pairs(id),
 primary key(run_id,target_capture_id)
);
create index retrieval_item_pair on evidence_pipeline.retrieval_run_items(pair_id);
create index retrieval_item_target on evidence_pipeline.retrieval_run_items(target_capture_id);

create function evidence_pipeline.capture_terms(p jsonb) returns text[]
language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct term order by term),'{}') from
 regexp_split_to_table(lower(coalesce(p->>'title','')||' '||coalesce(nullif(p->>'body_text',''),p->>'summary','')),'[^a-z0-9]+')term
 where length(term) between 4 and 80 and term !~ '^[0-9]+$'
 and term<>all(array['about','after','again','also','been','before','being','between','could','from','have','into','more','most','news','only','other','over','report','reported','reports','said','says','some','than','that','their','them','then','there','these','they','this','those','through','under','very','were','what','when','where','which','while','will','with','would','your'])
$$;

-- Freeze an explicit visible capture set. A later full refresh repairs concurrent
-- arrivals, including lower allocated change positions; no time cutoff is used.
create function evidence_pipeline.start_retrieval(p_job uuid,p_token uuid,p_refresh boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j evidence_pipeline.change_jobs; source_id uuid; ids uuid[]; fp text; r evidence_pipeline.retrieval_runs;
begin
 select * into j from evidence_pipeline.change_jobs where id=p_job for update;
 if not found or j.route<>'new_candidate_search' then raise exception 'new candidate search job required'; end if;
 select capture_id into source_id from evidence_pipeline.evidence_changes where position=j.change_position;
 if source_id is null then raise exception 'unsupported producer; this contract handles retained article captures only'; end if;
 if p_refresh then
   if j.state<>'completed' or not exists(select 1 from evidence_pipeline.retrieval_runs where job_id=p_job and not is_refresh and completed_at is not null) then raise exception 'refresh requires completed capture retrieval'; end if;
 else
   if j.state='completed' then
     select * into r from evidence_pipeline.retrieval_runs where job_id=p_job and not is_refresh;
     if found and r.completed_at is not null then return to_jsonb(r); end if;
     raise exception 'completion does not belong to this retriever';
   end if;
   if j.state<>'processing' or p_token is null or j.lease_token is distinct from p_token or j.lease_expires_at<=clock_timestamp() then raise exception 'invalid or expired lease'; end if;
   select * into r from evidence_pipeline.retrieval_runs where job_id=p_job and not is_refresh;
   if found then return to_jsonb(r); end if;
 end if;
 select coalesce(array_agg(id order by id),'{}') into ids from
   (select id from evidence_pipeline.article_captures where id<>source_id order by id limit 2001)x;
 if cardinality(ids)>2000 then raise exception 'snapshot budget exceeded; indexed corpus adapter required'; end if;
 fp:=encode(sha256(convert_to(to_jsonb(ids)::text,'UTF8')),'hex');
 insert into evidence_pipeline.retrieval_runs(job_id,source_capture_id,targets,snapshot_hash,is_refresh)
 values(p_job,source_id,ids,fp,p_refresh) on conflict(job_id,contract,snapshot_hash) do nothing;
 select * into r from evidence_pipeline.retrieval_runs where job_id=p_job and contract='capture-lexical-1' and snapshot_hash=fp;
 return to_jsonb(r);
end $$;

create function evidence_pipeline.process_retrieval(p_run uuid,p_token uuid,p_limit integer default 25) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r evidence_pipeline.retrieval_runs; j evidence_pipeline.change_jobs; a evidence_pipeline.article_captures; b evidence_pipeline.article_captures;
 source_terms text[]; target_terms text[]; overlap text[]; kind text; pair uuid; idx integer; stop_at integer; receipt jsonb;
begin
 if p_limit is null or p_limit<1 or p_limit>25 then raise exception 'limit must be 1..25'; end if;
 -- Job then run lock order matches start, avoiding lock inversion.
 select j0.* into j from evidence_pipeline.change_jobs j0 join evidence_pipeline.retrieval_runs r0 on r0.job_id=j0.id where r0.id=p_run for update of j0;
 if not found then raise exception 'unknown retrieval run'; end if;
 select * into r from evidence_pipeline.retrieval_runs where id=p_run for update;
 receipt:=jsonb_build_object('work_ref','capture-retrieval:'||r.id::text,'coverage','complete','contract',r.contract,
   'snapshot_hash',r.snapshot_hash,'targets',cardinality(r.targets),'meaning','lexical capture-pair enumeration only; semantic verification and other producer families excluded');
 if r.completed_at is not null then return receipt; end if;
 if not r.is_refresh and (j.state<>'processing' or p_token is null or j.lease_token is distinct from p_token or j.lease_expires_at<=clock_timestamp()) then raise exception 'invalid or expired lease'; end if;
 select * into a from evidence_pipeline.article_captures where id=r.source_capture_id;
 source_terms:=evidence_pipeline.capture_terms(a.payload);
 stop_at:=least(r.next_index+p_limit,cardinality(r.targets));
 for idx in r.next_index+1..stop_at loop
   select * into b from evidence_pipeline.article_captures where id=r.targets[idx];
   target_terms:=evidence_pipeline.capture_terms(b.payload);
   select coalesce(array_agg(t order by t),'{}') into overlap from unnest(source_terms)t where t=any(target_terms);
   kind:=case when a.article_id=b.article_id then 'same_article'
     when cardinality(source_terms)<2 or cardinality(target_terms)<2 then 'insufficient_text'
     when cardinality(overlap)>=2 then 'retrieval_candidate' else 'no_lexical_match' end;
   insert into evidence_pipeline.retrieval_pairs(left_capture_id,right_capture_id,disposition,shared_terms)
   values(least(a.id,b.id),greatest(a.id,b.id),kind,overlap) on conflict(left_capture_id,right_capture_id,contract) do nothing;
   select id into pair from evidence_pipeline.retrieval_pairs where left_capture_id=least(a.id,b.id) and right_capture_id=greatest(a.id,b.id) and contract=r.contract;
   insert into evidence_pipeline.retrieval_run_items(run_id,target_capture_id,pair_id) values(r.id,b.id,pair) on conflict do nothing;
 end loop;
 update evidence_pipeline.retrieval_runs set next_index=stop_at where id=r.id;
 if stop_at<cardinality(r.targets) then return jsonb_build_object('coverage','partial','run_id',r.id,'scanned',stop_at,'targets',cardinality(r.targets)); end if;
 if (select count(*) from evidence_pipeline.retrieval_run_items where run_id=r.id)<>cardinality(r.targets) then raise exception 'coverage mismatch'; end if;
 update evidence_pipeline.retrieval_runs set completed_at=clock_timestamp() where id=r.id;
 if not r.is_refresh then perform evidence_pipeline.finish_change_job(j.id,p_token,receipt); end if;
 return receipt;
end $$;

create function public.mip_capture_retrieval_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'input must be object'; end if;
 case p_action
 when 'start' then return evidence_pipeline.start_retrieval((p_input->>'job_id')::uuid,(p_input->>'lease_token')::uuid,false);
 when 'refresh' then return evidence_pipeline.start_retrieval((p_input->>'job_id')::uuid,null,true);
 when 'page' then return evidence_pipeline.process_retrieval((p_input->>'run_id')::uuid,(p_input->>'lease_token')::uuid,coalesce((p_input->>'limit')::int,25));
 when 'read' then
   select to_jsonb(r)||jsonb_build_object('counts',coalesce((select jsonb_object_agg(disposition,n) from
     (select p.disposition,count(*) n from evidence_pipeline.retrieval_run_items i join evidence_pipeline.retrieval_pairs p on p.id=i.pair_id where i.run_id=r.id group by p.disposition)x),'{}')) into result from evidence_pipeline.retrieval_runs r where id=(p_input->>'run_id')::uuid;
   return result;
 when 'pair' then
   select to_jsonb(p)||jsonb_build_object('left_capture',to_jsonb(a),'right_capture',to_jsonb(b)) into result
   from evidence_pipeline.retrieval_pairs p join evidence_pipeline.article_captures a on a.id=p.left_capture_id
   join evidence_pipeline.article_captures b on b.id=p.right_capture_id where p.id=(p_input->>'pair_id')::uuid;
   return result;
 when 'results' then
   if coalesce((p_input->>'limit')::int,25) not between 1 and 25 then raise exception 'limit must be 1..25'; end if;
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from
   (select i.target_capture_id,p.* from evidence_pipeline.retrieval_run_items i join evidence_pipeline.retrieval_pairs p on p.id=i.pair_id
    where i.run_id=(p_input->>'run_id')::uuid and (p_input->>'after' is null or i.target_capture_id>(p_input->>'after')::uuid)
    order by i.target_capture_id limit coalesce((p_input->>'limit')::int,25))x;
   return result;
 else raise exception 'unsupported retrieval action';
 end case;
end $$;

do $$ declare t text; f record; begin
 foreach t in array array['retrieval_runs','retrieval_pairs','retrieval_run_items'] loop
   execute format('alter table evidence_pipeline.%I enable row level security',t);
   execute format('revoke all on evidence_pipeline.%I from public,anon,authenticated,service_role',t);
   execute format('grant select,insert on evidence_pipeline.%I to service_role',t);
   execute format('create trigger no_truncate before truncate on evidence_pipeline.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
 end loop;
 foreach t in array array['retrieval_pairs','retrieval_run_items'] loop
   execute format('create trigger no_rewrite before update or delete on evidence_pipeline.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='evidence_pipeline' and p.proname in ('capture_terms','start_retrieval','process_retrieval') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant update(next_index,completed_at) on evidence_pipeline.retrieval_runs to service_role;
revoke all on function public.mip_capture_retrieval_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.mip_capture_retrieval_v1(text,jsonb) to service_role;
commit;
