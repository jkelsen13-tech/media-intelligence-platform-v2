-- ISOLATED extension only. Load after 002 in a disposable database.
-- No production migration, login, credential, schedule or publication activation.
begin;
-- Holding these row locks until transaction end serializes current eligibility
-- with the existing revocation UPDATEs. Recheck the locked row, not a prior snapshot.
create or replace function comparison_qualification.require_source_scope(p_runtime text,p_source text)
returns void language plpgsql security definer set search_path='' as $$
declare revoked timestamptz;
begin
 select revoked_at into revoked from comparison_qualification.runtime_source_scope
 where runtime_id=p_runtime and source=p_source for share;
 if not found or revoked is not null then
  perform comparison_qualification.deny('mip_source_not_in_scope');
 end if;
end $$;
create or replace function comparison_qualification.require_evaluated_implementation(p_runtime text,p_implementation text)
returns void language plpgsql security definer set search_path='' as $$
declare revoked timestamptz;
begin
 select revoked_at into revoked from comparison_qualification.evaluated_implementations
 where runtime_id=p_runtime and implementation=p_implementation for share;
 if not found or revoked is not null then
  perform comparison_qualification.deny('mip_implementation_not_evaluated');
 end if;
end $$;

create table mip_cutover_authority.source_turns(
 runtime_id text not null,source text not null,last_claimed_at timestamptz not null,
 primary key(runtime_id,source)
);
alter table mip_cutover_authority.source_turns enable row level security;
revoke all on mip_cutover_authority.source_turns from public,anon,authenticated,service_role;
-- Qualification kernel remains trusted infrastructure; ownership closure is a separate gate.
create function comparison_qualification.claim_scoped(p_runtime text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare selected record; token uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_runtime,312));
 select j.generation_id,g.source_project,g.implementation_ref into selected
 from comparison_qualification.jobs j
 join comparison_qualification.generations g on g.id=j.generation_id
 join comparison_qualification.runtime_source_scope s on s.runtime_id=p_runtime
  and s.source=g.source_project and s.revoked_at is null
 join comparison_qualification.evaluated_implementations i on i.runtime_id=p_runtime
  and i.implementation=g.implementation_ref and i.revoked_at is null
 left join mip_cutover_authority.source_turns t on t.runtime_id=p_runtime and t.source=g.source_project
 where j.state='pending' and j.available_at<=clock_timestamp() and j.attempt<3
 order by t.last_claimed_at nulls first,j.available_at,g.retained_at,j.generation_id
 limit 1 for update of j skip locked;
 if not found then return null; end if;
 perform comparison_qualification.require_source_scope(p_runtime,selected.source_project);
 perform comparison_qualification.require_evaluated_implementation(p_runtime,selected.implementation_ref);
 token:=gen_random_uuid();
 update comparison_qualification.jobs set state='processing',lease_token=token,
  lease_expires_at=clock_timestamp()+interval '2 minutes',attempt=attempt+1
 where generation_id=selected.generation_id;
 insert into mip_cutover_authority.source_turns values(p_runtime,selected.source_project,clock_timestamp())
 on conflict(runtime_id,source) do update set last_claimed_at=excluded.last_claimed_at;
 -- Processing rows are never recycled, exhausted, or cancelled by queue polling.
 return comparison_qualification.claim_payload(selected.generation_id,false,'mip_request_accepted');
end $$;
revoke all on function comparison_qualification.claim_scoped(text) from public,anon,authenticated,service_role;
grant execute on function comparison_qualification.claim_scoped(text) to mip_comparison_worker_owner_v1;
revoke execute on function comparison_qualification.claim() from mip_comparison_worker_owner_v1;
create or replace function mip_cutover_authority.worker_claim(p_request uuid,p_session uuid,p_runtime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior comparison_qualification.request_runs; claimed jsonb; v uuid; digest text;
begin
 perform comparison_qualification.require_bound('mip_comparison_worker_v1','worker_claim',p_session,p_runtime);
 digest:=comparison_qualification.argument_digest('{}'::jsonb);
 prior:=comparison_qualification.replay(p_request,'worker_claim',digest,'mip_comparison_worker_v1',p_runtime,p_session);
 if prior.request_id is not null then
   if prior.outcome='no_ready_work' then return null; end if;
   claimed:=comparison_qualification.claim_payload(prior.generation_id,true,'mip_request_replay_omits_token');
 else
   claimed:=comparison_qualification.claim_scoped(p_runtime);
 end if;
 if claimed is not null then
   perform comparison_qualification.require_source_scope(p_runtime,claimed->>'source_project');
   perform comparison_qualification.require_evaluated_implementation(p_runtime,claimed->>'implementation_ref');
 end if;
 if prior.request_id is not null then return claimed; end if;
 v:=(claimed->>'generation_id')::uuid;
 if v is not null then
   insert into mip_cutover_authority.lease_owners values(v,
    comparison_qualification.argument_digest(jsonb_build_object('token',claimed->>'lease_token')),
    p_runtime,'mip_comparison_worker_v1');
 end if;
 perform comparison_qualification.record_run(p_request,'worker_claim','mip_comparison_worker_v1',p_runtime,v,null,null,
   case when v is null then 'no_ready_work' else 'lease_issued' end,'mip_request_accepted',digest,p_session);
 return claimed;
end $$;


commit;
