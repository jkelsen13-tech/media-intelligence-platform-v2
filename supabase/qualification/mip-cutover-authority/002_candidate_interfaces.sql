-- ISOLATED candidate integration only. NEVER load as a production migration.
-- Requires the disposable qualification kernel and 001_execute_only_identities.sql.
-- No LOGIN role, JWT, production grant, schedule or release is created.
begin;
grant usage on schema mip_cutover_authority to mip_comparison_producer_owner_v1,mip_comparison_worker_owner_v1;
create table mip_cutover_authority.runtime_config(
 runtime_id text primary key, source text not null, implementation text not null,
 lexicon jsonb not null check(jsonb_typeof(lexicon)='object')
);
alter table mip_cutover_authority.runtime_config enable row level security;
revoke all on mip_cutover_authority.runtime_config from public,anon,authenticated,service_role;
grant select on mip_cutover_authority.runtime_config to mip_comparison_producer_owner_v1;
create table mip_cutover_authority.lease_owners(
 generation_id uuid not null, token_hash text not null, runtime_id text not null,
 principal text not null, primary key(generation_id,token_hash)
);
alter table mip_cutover_authority.lease_owners enable row level security;
revoke all on mip_cutover_authority.lease_owners from public,anon,authenticated,service_role;
grant select,insert on mip_cutover_authority.lease_owners to mip_comparison_worker_owner_v1;
create policy worker_lease_owners on mip_cutover_authority.lease_owners to mip_comparison_worker_owner_v1 using(true) with check(true);
create trigger immutable_lease_owners before update or delete on mip_cutover_authority.lease_owners
for each row execute function comparison_qualification.reject_rewrite();
create trigger no_lease_owners_truncate before truncate on mip_cutover_authority.lease_owners
for each statement execute function comparison_qualification.reject_rewrite();
create policy producer_config on mip_cutover_authority.runtime_config for select to mip_comparison_producer_owner_v1 using(true);
grant usage on schema comparison_qualification to mip_comparison_producer_owner_v1,mip_comparison_worker_owner_v1;
grant execute on function comparison_qualification.require_bound(text,text,uuid,text),
 comparison_qualification.require_source_scope(text,text),
 comparison_qualification.require_evaluated_implementation(text,text),
 comparison_qualification.argument_digest(jsonb),
 comparison_qualification.replay(uuid,text,text,text,text,uuid),
 comparison_qualification.record_run(uuid,text,text,text,uuid,uuid,uuid,text,text,text,uuid)
to mip_comparison_producer_owner_v1,mip_comparison_worker_owner_v1;
grant execute on function comparison_qualification.source_snapshot(jsonb,text),
 comparison_qualification.enqueue(text,jsonb,text,timestamptz)
to mip_comparison_producer_owner_v1;
grant execute on function comparison_qualification.claim(),
 comparison_qualification.claim_payload(uuid,boolean,text),
 comparison_qualification.complete(uuid,uuid,text,text,jsonb),
 comparison_qualification.fail(uuid,uuid,text,text)
to mip_comparison_worker_owner_v1;

create or replace function mip_cutover_authority.producer_enqueue(
 p_request uuid,p_session uuid,p_runtime text,p_payload jsonb,p_observed timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare cfg mip_cutover_authority.runtime_config; prior comparison_qualification.request_runs;
 payload jsonb; v uuid; digest text;
begin
 perform comparison_qualification.require_bound('mip_comparison_producer_v1','producer_enqueue',p_session,p_runtime);
 -- Retain real database input, never accept caller-supplied source rows or timestamps.
 if p_payload is distinct from '{}'::jsonb or p_observed is not null then
   raise exception 'mip_capture_requires_server_input';
 end if;
 select * into strict cfg from mip_cutover_authority.runtime_config where runtime_id=p_runtime;
 perform comparison_qualification.require_source_scope(p_runtime,cfg.source);
 perform comparison_qualification.require_evaluated_implementation(p_runtime,cfg.implementation);
 digest:=comparison_qualification.argument_digest(jsonb_build_object('source',cfg.source,'implementation',cfg.implementation,'lexicon',cfg.lexicon));
 prior:=comparison_qualification.replay(p_request,'producer_enqueue',digest,'mip_comparison_producer_v1',p_runtime,p_session);
 if prior.request_id is not null then return prior.generation_id; end if;
 payload:=comparison_qualification.source_snapshot(cfg.lexicon,cfg.implementation);
 v:=comparison_qualification.enqueue(cfg.source,payload,cfg.implementation,clock_timestamp());
 perform comparison_qualification.record_run(p_request,'producer_enqueue','mip_comparison_producer_v1',p_runtime,v,null,null,'completed','mip_request_accepted',digest,p_session);
 return v;
end $$;

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
   claimed:=comparison_qualification.claim();
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

create or replace function mip_cutover_authority.worker_complete(
 p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,p_input_hash text,p_implementation text,p_output jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare prior comparison_qualification.request_runs; digest text; result text; bound jsonb;
begin
 perform comparison_qualification.require_bound('mip_comparison_worker_v1','worker_complete',p_session,p_runtime);
 bound:=comparison_qualification.claim_payload(p_generation,true,'scope_only');
 perform comparison_qualification.require_source_scope(p_runtime,bound->>'source_project');
 perform comparison_qualification.require_evaluated_implementation(p_runtime,p_implementation);
 digest:=comparison_qualification.argument_digest(jsonb_build_object('generation_id',p_generation,'input_hash',p_input_hash,'implementation',p_implementation,'output',p_output));
 prior:=comparison_qualification.replay(p_request,'worker_complete',digest,'mip_comparison_worker_v1',p_runtime,p_session);
 if prior.request_id is not null then return prior.outcome; end if;
 if not exists(select 1 from mip_cutover_authority.lease_owners
   where generation_id=p_generation and runtime_id=p_runtime and principal='mip_comparison_worker_v1'
   and token_hash=comparison_qualification.argument_digest(jsonb_build_object('token',p_token::text))) then
   raise exception using errcode='42501',message='mip_lease_owner_mismatch';
 end if;
 result:=comparison_qualification.complete(p_generation,p_token,p_input_hash,p_implementation,p_output);
 perform comparison_qualification.record_run(p_request,'worker_complete','mip_comparison_worker_v1',p_runtime,p_generation,null,null,'completed','mip_request_accepted',digest,p_session);
 return result;
end $$;

create function mip_cutover_authority.worker_fail(
 p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,p_input_hash text,p_implementation text
) returns text language plpgsql security definer set search_path='' as $$
declare prior comparison_qualification.request_runs; digest text; result text; bound jsonb;
begin
 perform comparison_qualification.require_bound('mip_comparison_worker_v1','worker_fail',p_session,p_runtime);
 bound:=comparison_qualification.claim_payload(p_generation,true,'scope_only');
 perform comparison_qualification.require_source_scope(p_runtime,bound->>'source_project');
 perform comparison_qualification.require_evaluated_implementation(p_runtime,p_implementation);
 digest:=comparison_qualification.argument_digest(jsonb_build_object('generation_id',p_generation,'input_hash',p_input_hash,'implementation',p_implementation));
 prior:=comparison_qualification.replay(p_request,'worker_fail',digest,'mip_comparison_worker_v1',p_runtime,p_session);
 if prior.request_id is not null then return prior.outcome; end if;
 if not exists(select 1 from mip_cutover_authority.lease_owners
   where generation_id=p_generation and runtime_id=p_runtime and principal='mip_comparison_worker_v1'
   and token_hash=comparison_qualification.argument_digest(jsonb_build_object('token',p_token::text))) then
   raise exception using errcode='42501',message='mip_lease_owner_mismatch';
 end if;
 result:=comparison_qualification.fail(p_generation,p_token,p_input_hash,p_implementation);
 perform comparison_qualification.record_run(p_request,'worker_fail','mip_comparison_worker_v1',p_runtime,p_generation,null,null,'failed','mip_request_accepted',digest,p_session);
 return result;
end $$;
alter function mip_cutover_authority.worker_fail(uuid,uuid,text,uuid,uuid,text,text) owner to mip_comparison_worker_owner_v1;
revoke all on function mip_cutover_authority.worker_fail(uuid,uuid,text,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function mip_cutover_authority.worker_fail(uuid,uuid,text,uuid,uuid,text,text) to mip_comparison_worker_v1;
-- In this isolated installation only, eliminate the ambient service-role bypass.
revoke all on all functions in schema comparison_qualification from service_role;
revoke all on all tables in schema comparison_qualification from service_role;
revoke all on schema comparison_qualification from service_role;
-- Publisher still refuses; complete survivor predicate/closure integration is OPEN.
commit;
