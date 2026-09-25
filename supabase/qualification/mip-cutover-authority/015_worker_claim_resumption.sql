-- Isolated source-free exact-claim recovery. Load after 014, not a live migration.
-- Reuses jobs, lease_owners, request_runs and worker_journal; no new storage.
begin;
create function comparison_qualification.lock_generation_for_journal(p_generation uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from comparison_qualification.jobs where generation_id=p_generation for share;
end $$;
revoke all on function comparison_qualification.lock_generation_for_journal(uuid)
 from public,anon,authenticated,service_role;
grant execute on function comparison_qualification.lock_generation_for_journal(uuid)
 to mip_comparison_worker_owner_v1;

create or replace function mip_cutover_authority.worker_journal_token(
 p_runtime text,p_args jsonb,p_token_hash text
) returns uuid language plpgsql security invoker set search_path='' as $
declare token uuid;bound jsonb;
begin
 perform comparison_qualification.lock_generation_for_journal((p_args->>'p_generation')::uuid);
 if not exists(select 1 from mip_cutover_authority.lease_owners
 where generation_id=(p_args->>'p_generation')::uuid and runtime_id=p_runtime
 and principal='mip_comparison_worker_v1' and token_hash=p_token_hash) then
  raise exception using errcode='42501',message='mip_journal_lease_owner';
 end if;
 bound:=comparison_qualification.claim_payload((p_args->>'p_generation')::uuid,true,'journal_scope');
 perform comparison_qualification.require_source_scope(p_runtime,bound->>'source_project');
 perform comparison_qualification.require_evaluated_implementation(p_runtime,p_args->>'p_implementation');
 if bound->>'input_hash' is distinct from p_args->>'p_input_hash'
 or bound->>'implementation_ref' is distinct from p_args->>'p_implementation' then
  raise exception 'mip_journal_generation_binding';
 end if;
 select candidate into token from (
  select lease_token candidate from comparison_qualification.jobs where generation_id=(p_args->>'p_generation')::uuid
  union all select lease_token from comparison_qualification.outputs where generation_id=(p_args->>'p_generation')::uuid
  union all select lease_token from comparison_qualification.failure_reports where generation_id=(p_args->>'p_generation')::uuid
 ) native where candidate is not null and
 comparison_qualification.argument_digest(jsonb_build_object('token',candidate::text))=p_token_hash limit 1;
 if token is null then raise exception 'mip_journal_native_token_unavailable';end if;
 return token;
end $;

create function comparison_qualification.resume_exact_claim(p_runtime text,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior comparison_qualification.request_runs;j comparison_qualification.jobs;
 bound jsonb;token uuid;result jsonb;
begin
 select * into prior from comparison_qualification.request_runs
 where request_id=p_request and rpc_name='worker_claim'
 and runtime_id=p_runtime and principal='mip_comparison_worker_v1';
 if not found then raise exception 'mip_claim_not_recorded';end if;
 if prior.outcome='no_ready_work' then return jsonb_build_object('state','resolved');end if;
 select * into strict j from comparison_qualification.jobs
 where generation_id=prior.generation_id for update;
 bound:=comparison_qualification.claim_payload(j.generation_id,true,'resume_scope');
 perform comparison_qualification.require_source_scope(p_runtime,bound->>'source_project');
 perform comparison_qualification.require_evaluated_implementation(p_runtime,bound->>'implementation_ref');
 if j.state<>'processing' then return jsonb_build_object('state','resolved');end if;
 if not exists(select 1 from mip_cutover_authority.lease_owners
  where generation_id=j.generation_id and runtime_id=p_runtime
  and principal='mip_comparison_worker_v1'
  and token_hash=comparison_qualification.argument_digest(jsonb_build_object('token',j.lease_token::text)))
 then raise exception using errcode='42501',message='mip_resume_lease_owner';end if;
 -- Journal insertion locks this same native job before checking its token.
 -- A prepared terminal request is recovered through the established exact retry.
 if exists(select 1 from mip_cutover_authority.worker_journal
  where runtime_id=p_runtime and entry->>'operation' in ('worker_complete','worker_fail')
  and entry->'args'->>'p_generation'=j.generation_id::text) then
  return jsonb_build_object('state','terminal_pending');
 end if;
 if j.lease_expires_at>clock_timestamp() then return jsonb_build_object('state','waiting_lease');end if;
 if j.attempt=3 then
  update comparison_qualification.jobs set state='failed',failure_code='lease_attempts_exhausted',
   lease_token=null,lease_expires_at=null where generation_id=j.generation_id;
  return jsonb_build_object('state','exhausted');
 end if;
 if j.lease_expires_at+interval '30 seconds'*power(2,j.attempt-1)>clock_timestamp()
 then return jsonb_build_object('state','waiting_backoff');end if;
 token:=gen_random_uuid();
 update comparison_qualification.jobs set lease_token=token,
  lease_expires_at=clock_timestamp()+interval '2 minutes',attempt=attempt+1
 where generation_id=j.generation_id;
 insert into mip_cutover_authority.lease_owners values(j.generation_id,
  comparison_qualification.argument_digest(jsonb_build_object('token',token::text)),
  p_runtime,'mip_comparison_worker_v1');
 return jsonb_build_object('state','resumed','claim',
  comparison_qualification.claim_payload(j.generation_id,false,'native_exact_resume'));
end $$;
revoke all on function comparison_qualification.resume_exact_claim(text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function comparison_qualification.resume_exact_claim(text,uuid)
 to mip_comparison_worker_owner_v1;

create function mip_cutover_authority.worker_resume_claim(
 p_session uuid,p_runtime text,p_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare request uuid;result jsonb;claimed jsonb;prior comparison_qualification.request_runs;
begin
 perform comparison_qualification.require_bound('mip_comparison_worker_v1','worker_resume_claim',p_session,p_runtime);
 if p_key is null or p_key !~ '^worker_claim:[0-9a-f-]{36}$' then raise exception 'mip_resume_key';end if;
 request:=split_part(p_key,':',2)::uuid;
 if not exists(select 1 from mip_cutover_authority.worker_journal
 where runtime_id=p_runtime and journal_key=p_key and entry->>'operation'='worker_claim'
 and entry->'args'->>'p_request'=request::text) then raise exception 'mip_resume_journal_missing';end if;
 -- Same native request lock used by replay(), including a crash before claim commit.
 perform pg_advisory_xact_lock(hashtextextended(request::text||':worker_claim',149));
 select * into prior from comparison_qualification.request_runs
 where request_id=request and rpc_name='worker_claim'
 and runtime_id=p_runtime and principal='mip_comparison_worker_v1';
 if not found then
  claimed:=mip_cutover_authority.worker_claim(request,p_session,p_runtime);
  result:=case when claimed is null then jsonb_build_object('state','resolved')
   when claimed->>'lease_token' is null then jsonb_build_object('state','waiting_lease')
   else jsonb_build_object('state','resumed','claim',claimed) end;
 else result:=comparison_qualification.resume_exact_claim(p_runtime,request);
 end if;
 perform comparison_qualification.require_bound_final('mip_comparison_worker_v1','worker_resume_claim',p_session,p_runtime);
 return result;
end $$;
alter function mip_cutover_authority.worker_resume_claim(uuid,text,text) owner to mip_comparison_worker_owner_v1;
revoke all on function mip_cutover_authority.worker_resume_claim(uuid,text,text)
 from public,anon,authenticated,service_role,mip_comparison_producer_v1;
grant execute on function mip_cutover_authority.worker_resume_claim(uuid,text,text) to mip_comparison_worker_v1;
-- Preserve the installed native kernel owner instead of introducing an owner.
do $$declare native_owner text;begin
 select pg_get_userbyid(proowner) into native_owner from pg_proc
 where oid='comparison_qualification.claim_scoped(text)'::regprocedure;
 execute format('alter function comparison_qualification.lock_generation_for_journal(uuid) owner to %I',native_owner);
 execute format('alter function comparison_qualification.resume_exact_claim(text,uuid) owner to %I',native_owner);
end $$;
commit;
