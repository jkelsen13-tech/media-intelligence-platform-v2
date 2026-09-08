-- No evaluation approvals, queue claims, scheduler or publication are seeded.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table evidence_pipeline.worker_evaluations (
 id uuid primary key default gen_random_uuid(),
 algorithm_key text not null check(length(btrim(algorithm_key)) between 1 and 120),
 algorithm_version text not null check(length(btrim(algorithm_version)) between 1 and 120),
 producer text not null default 'record_version' check(producer='record_version'),
 record_kind text not null check(record_kind in ('article','graph_node','temporal_assessment')),
 implementation_sha256 text not null check(implementation_sha256 ~ '^[0-9a-f]{64}$'),
 dataset_sha256 text not null check(dataset_sha256 ~ '^[0-9a-f]{64}$'),
 report_sha256 text not null check(report_sha256 ~ '^[0-9a-f]{64}$'),
 report_ref text not null check(length(btrim(report_ref)) between 1 and 1000),
 reviewer_ref text not null check(length(btrim(reviewer_ref)) between 1 and 200),
 case_count integer not null check(case_count>0),
 passed boolean not null,
 acceptance_checks jsonb not null check(jsonb_typeof(acceptance_checks)='object'),
 limitations text not null check(length(btrim(limitations)) between 1 and 4000),
 recorded_at timestamptz not null default clock_timestamp(),
 check (not passed or (
   acceptance_checks @> '{"producer_isolation":true,"bounded_work":true,"durable_recovery":true,"evidence_fidelity":true,"held_out_evaluation":true}'::jsonb
 ))
);
create table evidence_pipeline.worker_evaluation_revocations (
 evaluation_id uuid primary key references evidence_pipeline.worker_evaluations(id),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 revoked_at timestamptz not null default clock_timestamp()
);
comment on table evidence_pipeline.worker_evaluations is 'Immutable trusted-operator qualification receipts for record-version candidate retrieval. Passing must refer to an actual retained evaluation, not a self-certified metric or semantic/publication approval.';
create function public.mip_evaluated_record_claim_v1(p_evaluation_id uuid,p_implementation_sha256 text,p_record_kind text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j evidence_pipeline.change_jobs; token uuid; old_token uuid; e evidence_pipeline.worker_evaluations;
begin
  if p_record_kind is null or p_record_kind not in ('article','graph_node','temporal_assessment') then raise exception 'unsupported record kind'; end if;
  select * into e from evidence_pipeline.worker_evaluations where id=p_evaluation_id for share;
  if not found or not e.passed or e.record_kind is distinct from p_record_kind
    or e.implementation_sha256 is distinct from p_implementation_sha256
    or exists(select 1 from evidence_pipeline.worker_evaluation_revocations where evaluation_id=e.id)
    then raise exception 'qualified evaluation required'; end if;
  -- Each claim performs at most 100 expired-lease transitions.
  for j in select * from evidence_pipeline.change_jobs
    where route='new_candidate_search' and state='processing' and lease_expires_at<=clock_timestamp() and exists (
      select 1 from evidence_pipeline.evidence_changes c
      join evidence_pipeline.record_versions v on v.id=c.record_version_id
      where c.position=change_position and v.record_kind=p_record_kind)
    order by lease_expires_at,change_position limit 100 for update skip locked
  loop
    old_token:=j.lease_token;
    update evidence_pipeline.change_jobs set
      state=case when attempt_count>=5 then 'dead_letter' else 'retry_wait' end,
      available_at=clock_timestamp()+make_interval(secs=>30*power(2,attempt_count-1)::integer),
      lease_token=null,lease_expires_at=null where id=j.id;
    insert into evidence_pipeline.change_job_events(job_id,attempt_count,event,lease_token,detail)
    values(j.id,j.attempt_count,case when j.attempt_count>=5 then 'dead_letter' else 'lease_expired' end,old_token,
      jsonb_build_object('reason','lease expired'));
  end loop;
  select * into j from evidence_pipeline.change_jobs
  where route='new_candidate_search' and state in ('pending','retry_wait') and available_at<=clock_timestamp() and attempt_count<5 and exists (
      select 1 from evidence_pipeline.evidence_changes c
      join evidence_pipeline.record_versions v on v.id=c.record_version_id
      where c.position=change_position and v.record_kind=p_record_kind)
  order by available_at,change_position limit 1 for update skip locked;
  if not found then return null; end if;
  token:=gen_random_uuid();
  update evidence_pipeline.change_jobs set state='processing',attempt_count=attempt_count+1,
    lease_token=token,lease_expires_at=clock_timestamp()+interval '2 minutes'
    where id=j.id returning * into j;
  insert into evidence_pipeline.change_job_events(job_id,attempt_count,event,lease_token,detail)
  values(j.id,j.attempt_count,'claimed',token,jsonb_build_object('evaluation_id',e.id,
    'algorithm_key',e.algorithm_key,'algorithm_version',e.algorithm_version,
    'implementation_sha256',e.implementation_sha256,'record_kind',e.record_kind));
  return to_jsonb(j)||jsonb_build_object('change',
    (select to_jsonb(c) from evidence_pipeline.evidence_changes c where c.position=j.change_position));
end $$;


create function public.mip_revoke_worker_evaluation_v1(p_evaluation_id uuid,p_reason text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior text;
begin
 if p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then raise exception 'revocation reason required'; end if;
 perform 1 from evidence_pipeline.worker_evaluations where id=p_evaluation_id for update;
 if not found then raise exception 'unknown evaluation'; end if;
 select reason into prior from evidence_pipeline.worker_evaluation_revocations where evaluation_id=p_evaluation_id;
 if found then
   if prior=p_reason then return p_evaluation_id; end if;
   raise exception 'revocation conflict';
 end if;
 insert into evidence_pipeline.worker_evaluation_revocations(evaluation_id,reason) values(p_evaluation_id,p_reason);
 return p_evaluation_id;
end $$;
do $$ declare t text; begin
 foreach t in array array['worker_evaluations','worker_evaluation_revocations'] loop
   execute format('alter table evidence_pipeline.%I enable row level security',t);
   execute format('revoke all on evidence_pipeline.%I from public,anon,authenticated,service_role',t);
   execute format('grant select,insert on evidence_pipeline.%I to service_role',t);
   execute format('create trigger no_rewrite before update or delete on evidence_pipeline.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);
   execute format('create trigger no_truncate before truncate on evidence_pipeline.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
 end loop;
end $$;
-- PostgreSQL row locks require UPDATE privilege, even though the immutable
-- trigger rejects actual UPDATE/DELETE. Needed by claim/revoke serialization.
grant update on evidence_pipeline.worker_evaluations to service_role;
revoke all on function public.mip_evaluated_record_claim_v1(uuid,text,text),public.mip_revoke_worker_evaluation_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.mip_evaluated_record_claim_v1(uuid,text,text),public.mip_revoke_worker_evaluation_v1(uuid,text) to service_role;
create or replace function public.mip_evidence_change_claim_v1(p_route text,p_producer text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j evidence_pipeline.change_jobs; token uuid; old_token uuid;
begin
  if p_route is null or p_route not in ('dependency_lookup','new_candidate_search') then raise exception 'invalid route'; end if;
  if p_producer is null or p_producer not in ('capture','record_version') then raise exception 'invalid producer'; end if;
  if p_route='new_candidate_search' and p_producer='record_version' then raise exception 'qualified evaluation required; use mip_evaluated_record_claim_v1'; end if;
  -- Each claim performs at most 100 expired-lease transitions.
  for j in select * from evidence_pipeline.change_jobs
    where route=p_route and state='processing' and lease_expires_at<=clock_timestamp() and exists (
      select 1 from evidence_pipeline.evidence_changes c where c.position=change_position
      and ((p_producer='capture' and c.capture_id is not null)
        or (p_producer='record_version' and c.record_version_id is not null)))
    order by lease_expires_at,change_position limit 100 for update skip locked
  loop
    old_token:=j.lease_token;
    update evidence_pipeline.change_jobs set
      state=case when attempt_count>=5 then 'dead_letter' else 'retry_wait' end,
      available_at=clock_timestamp()+make_interval(secs=>30*power(2,attempt_count-1)::integer),
      lease_token=null,lease_expires_at=null where id=j.id;
    insert into evidence_pipeline.change_job_events(job_id,attempt_count,event,lease_token,detail)
    values(j.id,j.attempt_count,case when j.attempt_count>=5 then 'dead_letter' else 'lease_expired' end,old_token,
      jsonb_build_object('reason','lease expired'));
  end loop;
  select * into j from evidence_pipeline.change_jobs
  where route=p_route and state in ('pending','retry_wait') and available_at<=clock_timestamp() and attempt_count<5 and exists (
      select 1 from evidence_pipeline.evidence_changes c where c.position=change_position
      and ((p_producer='capture' and c.capture_id is not null)
        or (p_producer='record_version' and c.record_version_id is not null)))
  order by available_at,change_position limit 1 for update skip locked;
  if not found then return null; end if;
  token:=gen_random_uuid();
  update evidence_pipeline.change_jobs set state='processing',attempt_count=attempt_count+1,
    lease_token=token,lease_expires_at=clock_timestamp()+interval '2 minutes'
    where id=j.id returning * into j;
  insert into evidence_pipeline.change_job_events(job_id,attempt_count,event,lease_token)
  values(j.id,j.attempt_count,'claimed',token);
  return to_jsonb(j)||jsonb_build_object('change',
    (select to_jsonb(c) from evidence_pipeline.evidence_changes c where c.position=j.change_position));
end $$;
CREATE OR REPLACE FUNCTION evidence_pipeline.claim_change_job(p_route text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j evidence_pipeline.change_jobs; token uuid; old_token uuid;
begin
  if p_route is null or p_route not in ('dependency_lookup','new_candidate_search') then raise exception 'invalid route'; end if;
  if p_route='new_candidate_search' then raise exception 'producer-scoped candidate claim required'; end if;
  -- Each claim performs at most 100 expired-lease transitions.
  for j in select * from evidence_pipeline.change_jobs
    where route=p_route and state='processing' and lease_expires_at<=clock_timestamp()
    order by lease_expires_at,change_position limit 100 for update skip locked
  loop
    old_token:=j.lease_token;
    update evidence_pipeline.change_jobs set
      state=case when attempt_count>=5 then 'dead_letter' else 'retry_wait' end,
      available_at=clock_timestamp()+make_interval(secs=>30*power(2,attempt_count-1)::integer),
      lease_token=null,lease_expires_at=null where id=j.id;
    insert into evidence_pipeline.change_job_events(job_id,attempt_count,event,lease_token,detail)
    values(j.id,j.attempt_count,case when j.attempt_count>=5 then 'dead_letter' else 'lease_expired' end,old_token,
      jsonb_build_object('reason','lease expired'));
  end loop;
  select * into j from evidence_pipeline.change_jobs
  where route=p_route and state in ('pending','retry_wait') and available_at<=clock_timestamp() and attempt_count<5
  order by available_at,change_position limit 1 for update skip locked;
  if not found then return null; end if;
  token:=gen_random_uuid();
  update evidence_pipeline.change_jobs set state='processing',attempt_count=attempt_count+1,
    lease_token=token,lease_expires_at=clock_timestamp()+interval '2 minutes'
    where id=j.id returning * into j;
  insert into evidence_pipeline.change_job_events(job_id,attempt_count,event,lease_token)
  values(j.id,j.attempt_count,'claimed',token);
  return to_jsonb(j)||jsonb_build_object('change',
    (select to_jsonb(c) from evidence_pipeline.evidence_changes c where c.position=j.change_position));
end $function$

commit;
