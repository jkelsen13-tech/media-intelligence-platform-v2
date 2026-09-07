-- Additive producer-scoped claim. Historical mixed-producer API remains unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.mip_evidence_change_claim_v1(p_route text,p_producer text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j evidence_pipeline.change_jobs; token uuid; old_token uuid;
begin
  if p_route is null or p_route not in ('dependency_lookup','new_candidate_search') then raise exception 'invalid route'; end if;
  if p_producer is null or p_producer not in ('capture','record_version') then raise exception 'invalid producer'; end if;
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

revoke all on function public.mip_evidence_change_claim_v1(text,text) from public,anon,authenticated;
grant execute on function public.mip_evidence_change_claim_v1(text,text) to service_role;
comment on function public.mip_evidence_change_claim_v1(text,text) is 'Server-only producer-scoped claim and expired-lease recovery. Required producer: capture or record_version. Existing fenced finish/fail contract applies. No scheduling or semantic processing.';
commit;
