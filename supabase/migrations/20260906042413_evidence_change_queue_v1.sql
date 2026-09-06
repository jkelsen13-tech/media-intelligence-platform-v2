-- Private durable transport only. No semantic worker, publication, or scheduler.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table evidence_pipeline.article_captures,evidence_pipeline.record_versions in share row exclusive mode;

create table evidence_pipeline.evidence_changes (
  position bigint generated always as identity primary key,
  capture_id uuid unique references evidence_pipeline.article_captures(id),
  record_version_id uuid unique references evidence_pipeline.record_versions(id),
  queued_at timestamptz not null default clock_timestamp(),
  check (num_nonnulls(capture_id,record_version_id)=1)
);
comment on table evidence_pipeline.evidence_changes is
  'Immutable references to retained input versions. Position is allocation order, NOT commit order or a safe consumer high-water mark. queued_at is discovery time, NOT source observation time.';

create table evidence_pipeline.change_jobs (
  id uuid primary key default gen_random_uuid(),
  change_position bigint not null references evidence_pipeline.evidence_changes(position),
  route text not null check(route in ('dependency_lookup','new_candidate_search')),
  contract_version text not null default 'discovery-v1' check(contract_version='discovery-v1'),
  state text not null default 'pending' check(state in ('pending','processing','retry_wait','completed','dead_letter')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 5),
  available_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  unique(change_position,route,contract_version),
  check ((state='processing')=(lease_token is not null and lease_expires_at is not null)),
  check ((state='completed')=(completed_at is not null))
);
create index change_jobs_ready on evidence_pipeline.change_jobs(route,available_at,change_position)
  where state in ('pending','retry_wait');
create index change_jobs_expired on evidence_pipeline.change_jobs(route,lease_expires_at,change_position)
  where state='processing';

create table evidence_pipeline.change_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references evidence_pipeline.change_jobs(id),
  attempt_count integer not null,
  event text not null check(event in ('claimed','lease_expired','retry_wait','dead_letter','completed')),
  lease_token uuid,
  detail jsonb not null default '{}' check(jsonb_typeof(detail)='object'),
  recorded_at timestamptz not null default clock_timestamp()
);
create index change_job_events_job on evidence_pipeline.change_job_events(job_id,id);

create function evidence_pipeline.dispatch_evidence_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  insert into evidence_pipeline.change_jobs(change_position,route)
  values (new.position,'dependency_lookup'),(new.position,'new_candidate_search');
  return null;
end $$;
create trigger dispatch_evidence_change after insert on evidence_pipeline.evidence_changes
for each row execute function evidence_pipeline.dispatch_evidence_change();

create function evidence_pipeline.capture_evidence_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_TABLE_NAME='article_captures' then
    insert into evidence_pipeline.evidence_changes(capture_id) values(new.id) on conflict(capture_id) do nothing;
  elsif TG_TABLE_NAME='record_versions' then
    insert into evidence_pipeline.evidence_changes(record_version_id) values(new.id) on conflict(record_version_id) do nothing;
  else raise exception 'unsupported evidence change source'; end if;
  return null;
end $$;
create trigger mip_capture_change after insert on evidence_pipeline.article_captures
for each row execute function evidence_pipeline.capture_evidence_change();
create trigger mip_record_change after insert on evidence_pipeline.record_versions
for each row execute function evidence_pipeline.capture_evidence_change();

-- Reconcile missing notifications without date or position cutoffs. Repeat until
-- returned count is zero. Bounded by 100 changes per call, including old records.
create function evidence_pipeline.reconcile_evidence_changes(p_limit integer default 100) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer; m integer;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'limit must be 1..100'; end if;
  insert into evidence_pipeline.evidence_changes(capture_id)
  select a.id from evidence_pipeline.article_captures a
  where not exists(select 1 from evidence_pipeline.evidence_changes c where c.capture_id=a.id)
  order by a.captured_at,a.id limit p_limit on conflict(capture_id) do nothing;
  get diagnostics n=row_count;
  insert into evidence_pipeline.evidence_changes(record_version_id)
  select v.id from evidence_pipeline.record_versions v
  where not exists(select 1 from evidence_pipeline.evidence_changes c where c.record_version_id=v.id)
  order by v.recorded_at,v.id limit (p_limit-n) on conflict(record_version_id) do nothing;
  get diagnostics m=row_count;
  return n+m;
end $$;

create function evidence_pipeline.claim_change_job(p_route text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j evidence_pipeline.change_jobs; token uuid; old_token uuid;
begin
  if p_route is null or p_route not in ('dependency_lookup','new_candidate_search') then raise exception 'invalid route'; end if;
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
end $$;

create function evidence_pipeline.finish_change_job(p_id uuid,p_token uuid,p_receipt jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare j evidence_pipeline.change_jobs; prior jsonb;
begin
  if p_receipt is null or jsonb_typeof(p_receipt)<>'object'
    or coalesce(length(btrim(p_receipt->>'work_ref')),0)=0
    or p_receipt->>'coverage' is distinct from 'complete'
    or octet_length(p_receipt::text)>16384 then raise exception 'complete durable work receipt required'; end if;
  select * into j from evidence_pipeline.change_jobs where id=p_id for update;
  if not found then raise exception 'unknown change job'; end if;
  if j.state='completed' then
    select detail into prior from evidence_pipeline.change_job_events
    where job_id=p_id and event='completed' and lease_token=p_token;
    if found and prior=p_receipt then return 'completed'; end if;
    raise exception 'completion receipt conflict';
  end if;
  if j.state<>'processing' or p_token is null or j.lease_token is distinct from p_token
    or j.lease_expires_at<=clock_timestamp() then raise exception 'invalid or expired lease'; end if;
  insert into evidence_pipeline.change_job_events(job_id,attempt_count,event,lease_token,detail)
  values(j.id,j.attempt_count,'completed',p_token,p_receipt);
  update evidence_pipeline.change_jobs set state='completed',completed_at=clock_timestamp(),
    lease_token=null,lease_expires_at=null where id=j.id;
  return 'completed';
end $$;

create function evidence_pipeline.fail_change_job(p_id uuid,p_token uuid,p_code text,p_retryable boolean default true) returns text
language plpgsql security invoker set search_path='' as $$
declare j evidence_pipeline.change_jobs; next_state text;
begin
  if p_code is null or length(btrim(p_code))=0 or length(p_code)>200 or p_retryable is null then raise exception 'invalid failure'; end if;
  select * into j from evidence_pipeline.change_jobs where id=p_id for update;
  if not found or j.state<>'processing' or p_token is null or j.lease_token is distinct from p_token
    or j.lease_expires_at<=clock_timestamp() then raise exception 'invalid or expired lease'; end if;
  next_state:=case when p_retryable and j.attempt_count<5 then 'retry_wait' else 'dead_letter' end;
  insert into evidence_pipeline.change_job_events(job_id,attempt_count,event,lease_token,detail)
  values(j.id,j.attempt_count,next_state,p_token,jsonb_build_object('code',p_code));
  update evidence_pipeline.change_jobs set state=next_state,
    available_at=clock_timestamp()+make_interval(secs=>30*power(2,attempt_count-1)::integer),
    lease_token=null,lease_expires_at=null where id=j.id;
  return next_state;
end $$;

do $$ declare t text; f record; begin
  foreach t in array array['evidence_changes','change_jobs','change_job_events'] loop
    execute format('alter table evidence_pipeline.%I enable row level security',t);
    execute format('revoke all on evidence_pipeline.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert on evidence_pipeline.%I to service_role',t);
    execute format('create trigger no_truncate before truncate on evidence_pipeline.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
  end loop;
  foreach t in array array['evidence_changes','change_job_events'] loop
    execute format('create trigger no_rewrite before update or delete on evidence_pipeline.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='evidence_pipeline' and p.proname in ('dispatch_evidence_change','capture_evidence_change',
      'reconcile_evidence_changes','claim_change_job','finish_change_job','fail_change_job')
  loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant update on evidence_pipeline.change_jobs to service_role;
revoke all on sequence evidence_pipeline.evidence_changes_position_seq,evidence_pipeline.change_job_events_id_seq from public,anon,authenticated;
grant usage,select on sequence evidence_pipeline.evidence_changes_position_seq,evidence_pipeline.change_job_events_id_seq to service_role;

create function public.mip_evidence_changes_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'input must be an object'; end if;
  case p_action
    when 'claim' then return evidence_pipeline.claim_change_job(p_input->>'route');
    when 'finish' then return to_jsonb(evidence_pipeline.finish_change_job((p_input->>'job_id')::uuid,(p_input->>'lease_token')::uuid,p_input->'receipt'));
    when 'fail' then return to_jsonb(evidence_pipeline.fail_change_job((p_input->>'job_id')::uuid,(p_input->>'lease_token')::uuid,p_input->>'code',coalesce((p_input->>'retryable')::boolean,true)));
    when 'reconcile' then return to_jsonb(evidence_pipeline.reconcile_evidence_changes(coalesce((p_input->>'limit')::integer,100)));
    when 'input' then
      select jsonb_build_object('change',to_jsonb(c),'capture',to_jsonb(a),'record_version',to_jsonb(v)) into result
      from evidence_pipeline.change_jobs j join evidence_pipeline.evidence_changes c on c.position=j.change_position
      left join evidence_pipeline.article_captures a on a.id=c.capture_id
      left join evidence_pipeline.record_versions v on v.id=c.record_version_id
      where j.id=(p_input->>'job_id')::uuid;
      return result;
    when 'status' then
      select jsonb_agg(to_jsonb(s)) into result from
        (select route,state,count(*) jobs from evidence_pipeline.change_jobs group by route,state order by route,state)s;
      return coalesce(result,'[]'::jsonb);
    else raise exception 'unsupported evidence change action';
  end case;
end $$;
revoke all on function public.mip_evidence_changes_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.mip_evidence_changes_v1(text,jsonb) to service_role;
-- Seed a bounded installation page. Further missing inputs are explicit backlog.
select evidence_pipeline.reconcile_evidence_changes(100);
commit;
