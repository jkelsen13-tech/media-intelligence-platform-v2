-- Explicit fresh-generation recovery. Isolated only; no scheduler, cancellation or production grants.
set role mip_hypothesis_owner;
create table mip_hypothesis.generation_recoveries(
 request_id uuid primary key, prior_generation_id uuid not null unique references mip_hypothesis.generations,
 generation_id uuid not null unique references mip_hypothesis.generations,
 author_id uuid not null, arguments jsonb not null, receipt jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 check(prior_generation_id<>generation_id)
);
alter table mip_hypothesis.generation_recoveries enable row level security;
alter table mip_hypothesis.generation_recoveries force row level security;
create policy owner_only on mip_hypothesis.generation_recoveries to mip_hypothesis_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_hypothesis.generation_recoveries
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.generation_recoveries
 for each statement execute function mip_hypothesis.reject_mutation();

create function mip_hypothesis.recover_generation(p_user uuid,p_investigation uuid,p_version uuid,p_source_project text,
 p_request uuid,p_runtime text,p_method uuid,p_prior uuid,p_spec jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior mip_hypothesis.generations; job mip_hypothesis.generation_jobs; old mip_hypothesis.generation_recoveries;
 method mip_hypothesis.method_versions; args jsonb; result jsonb; b jsonb;
begin
 select * into strict method from mip_hypothesis.method_versions where revision=p_method;
 perform mip_hypothesis.generation_authority(p_runtime,p_source_project,method.implementation,p_method);
 -- Same runtime/job serialization as completion. If completion commits first,
 -- it is observed here; an outstanding processing row is never cancelled.
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-worker:'||p_runtime,0));
 select * into prior from mip_hypothesis.generations where id=p_prior;
 if not found or prior.author_id is distinct from p_user or prior.investigation_id is distinct from p_investigation
  or prior.runtime is distinct from p_runtime or prior.source_project is distinct from p_source_project then
  raise exception 'mip_hypothesis_recovery_owner_scope';end if;
 select * into strict job from mip_hypothesis.generation_jobs where generation_id=p_prior for update;
 args:=jsonb_build_object('user',p_user,'investigation',p_investigation,'version',p_version,'source',p_source_project,
  'runtime',p_runtime,'method',p_method,'prior',p_prior,'spec',p_spec);
 -- Retaining old input references does not waive their current permission.
 for b in select value from jsonb_array_elements(prior.closure_bindings) loop
  perform mip_hypothesis.require_observed_operations(p_user,p_investigation,(b->>'workspace_version_id')::uuid,
   p_source_project,b->>'input_position');
 end loop;
 select * into old from mip_hypothesis.generation_recoveries where request_id=p_request or prior_generation_id=p_prior;
 if found then
  if old.request_id is distinct from p_request or old.arguments is distinct from args then
   raise exception 'mip_hypothesis_recovery_conflict';end if;
  -- Reuse capture's current authority, exact arguments and completed-result recovery.
  perform mip_hypothesis.capture_generation(p_user,p_investigation,p_version,p_source_project,p_request,p_runtime,p_method,p_spec);
  return old.receipt;
 end if;
 if job.state<>'failed' and not(job.state='processing' and job.lease_expires_at<=clock_timestamp()) then
  raise exception 'mip_hypothesis_recovery_not_stranded';end if;
 -- Prevent attaching a pre-existing ordinary capture to this recovery request.
 if exists(select 1 from mip_hypothesis.generations where request_id=p_request) then
  raise exception 'mip_hypothesis_recovery_conflict';end if;
 result:=mip_hypothesis.capture_generation(p_user,p_investigation,p_version,p_source_project,p_request,p_runtime,p_method,p_spec);
 result:=result||jsonb_build_object('prior_generation_id',p_prior,'prior_state',job.state,
  'prior_retained',true,'force_cancellation',false,'automatic_retry',false);
 insert into mip_hypothesis.generation_recoveries(request_id,prior_generation_id,generation_id,author_id,arguments,receipt)
 values(p_request,p_prior,(result->>'generation_id')::uuid,p_user,args,result);
 return result;
end $$;
revoke all on mip_hypothesis.generation_recoveries from public;
revoke all on function mip_hypothesis.recover_generation(uuid,uuid,uuid,text,uuid,text,uuid,uuid,jsonb) from public;
grant execute on function mip_hypothesis.recover_generation(uuid,uuid,uuid,text,uuid,text,uuid,uuid,jsonb) to mip_hypothesis_gateway;
reset role;
