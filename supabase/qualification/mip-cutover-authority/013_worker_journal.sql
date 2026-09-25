-- R5 isolated candidate only; load after 003_scoped_queue.sql. No live schema, login or schedule.
-- Request payloads live in qik-owned storage; session/lease tokens are not copied.
begin;
-- 003 supplies the source/implementation row-lock fences used below.
do $$ begin
 if to_regclass('mip_cutover_authority.source_turns') is null then
  raise exception 'mip_journal_requires_scoped_queue';
 end if;
end $$;
grant execute on function comparison_qualification.require_bound_final(text,text,uuid,text)
 to mip_comparison_worker_owner_v1;
create table mip_cutover_authority.worker_journal (
 runtime_id text not null check(length(runtime_id) between 1 and 100),
 journal_key text not null check(length(journal_key) between 1 and 100),
 entry jsonb not null check(jsonb_typeof(entry)='object' and octet_length(entry::text)<=2200000),
 token_hash text check(token_hash ~ '^[0-9a-f]{64}$'),
 primary key(runtime_id,journal_key),
 check(not (coalesce(entry->'args','{}'::jsonb) ?| array['p_session','p_token']))
);
alter table mip_cutover_authority.worker_journal owner to mip_cutover_schema_owner_v1;
alter table mip_cutover_authority.worker_journal enable row level security;
alter table mip_cutover_authority.worker_journal force row level security;
revoke all on mip_cutover_authority.worker_journal from public,anon,authenticated,service_role,
 mip_comparison_worker_v1,mip_comparison_producer_v1;
grant select,insert on mip_cutover_authority.worker_journal to mip_comparison_worker_owner_v1;
create policy journal_rpc_owner on mip_cutover_authority.worker_journal
 to mip_comparison_worker_owner_v1 using(true) with check(true);
create trigger immutable_worker_journal before update or delete on mip_cutover_authority.worker_journal
 for each row execute function comparison_qualification.reject_rewrite();
create trigger no_worker_journal_truncate before truncate on mip_cutover_authority.worker_journal
 for each statement execute function comparison_qualification.reject_rewrite();

-- Read only the existing native token locations. Terminal operations clear jobs'
-- token but retain it in outputs/failure_reports; no second token store is made.
grant select(generation_id,lease_token) on comparison_qualification.jobs,
 comparison_qualification.outputs,comparison_qualification.failure_reports
 to mip_comparison_worker_owner_v1;
create policy journal_native_token on comparison_qualification.jobs for select
 to mip_comparison_worker_owner_v1 using(true);
create policy journal_native_token on comparison_qualification.outputs for select
 to mip_comparison_worker_owner_v1 using(true);
create policy journal_native_token on comparison_qualification.failure_reports for select
 to mip_comparison_worker_owner_v1 using(true);

create function mip_cutover_authority.worker_journal_token(
 p_runtime text,p_args jsonb,p_token_hash text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare token uuid;bound jsonb;
begin
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
end $$;

create function mip_cutover_authority.worker_journal_put(
 p_session uuid,p_runtime text,p_key text,p_entry jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare retained jsonb;digest text;prior mip_cutover_authority.worker_journal;
 op text;args jsonb;expected text[];base mip_cutover_authority.worker_journal;
begin
 perform comparison_qualification.require_bound('mip_comparison_worker_v1','worker_journal_put',p_session,p_runtime);
 if p_key is null or p_key !~ '^worker_(claim|complete|fail):[0-9a-f-]{36}(:receipt)?$'
 or jsonb_typeof(p_entry) is distinct from 'object'
 or p_entry->'version' is distinct from '1'::jsonb
 or octet_length(p_entry::text)>2200000 then raise exception 'mip_journal_shape';end if;
 op:=split_part(p_key,':',1);
 perform split_part(p_key,':',2)::uuid;
 if right(p_key,8)=':receipt' then
  if (p_entry-array['version','result'])<>'{}'::jsonb or not(p_entry?'result') then raise exception 'mip_journal_receipt_shape';end if;
  select * into base from mip_cutover_authority.worker_journal
   where runtime_id=p_runtime and journal_key=left(p_key,length(p_key)-8);
  if not found then raise exception 'mip_journal_request_missing';end if;
  if base.token_hash is not null then
   perform mip_cutover_authority.worker_journal_token(p_runtime,base.entry->'args',base.token_hash);
  end if;
  if op='worker_claim' then
   if p_entry->'result'<>'null'::jsonb and (
    jsonb_typeof(p_entry->'result')<>'object'
    or (p_entry->'result'-'generation_id')<>'{}'::jsonb
    or jsonb_typeof(p_entry->'result'->'generation_id') is distinct from 'string'
   ) then raise exception 'mip_journal_receipt_shape';end if;
  elsif p_entry->>'result' is distinct from case op when 'worker_complete' then 'completed' else 'failed' end then
   raise exception 'mip_journal_receipt_shape';
  end if;
  retained:=p_entry;
 else
  args:=p_entry->'args';
  if (p_entry-array['version','operation','args'])<>'{}'::jsonb
  or p_entry->>'operation' is distinct from op or jsonb_typeof(args) is distinct from 'object'
  or args->>'p_runtime' is distinct from p_runtime
  or args->>'p_request' is distinct from split_part(p_key,':',2) then raise exception 'mip_journal_binding';end if;
  expected:=array['p_runtime','p_request'];
  if op<>'worker_claim' then
   expected:=expected||array['p_generation','p_token','p_input_hash','p_implementation'];
   if op='worker_complete' then expected:=expected||array['p_output'];end if;
  end if;
  if not(args?&expected) or (args-expected)<>'{}'::jsonb then raise exception 'mip_journal_args';end if;
  retained:=jsonb_set(p_entry,'{args}',args-'p_token');
  if op<>'worker_claim' then
   -- Cast rejects malformed/non-string token values without retaining them.
   digest:=comparison_qualification.argument_digest(jsonb_build_object('token',(args->>'p_token')::uuid::text));
   if mip_cutover_authority.worker_journal_token(p_runtime,args,digest)::text is distinct from args->>'p_token' then
    raise exception 'mip_journal_token_binding';
   end if;
   if op='worker_complete' and jsonb_typeof(args->'p_output') is distinct from 'object' then raise exception 'mip_journal_output_shape';end if;
  end if;
 end if;
 -- A uniqueness conflict waits for the other short transaction, then the next
 -- statement observes its committed row at READ COMMITTED. No overwrite.
 insert into mip_cutover_authority.worker_journal values(p_runtime,p_key,retained,digest)
 on conflict(runtime_id,journal_key) do nothing;
 select * into strict prior from mip_cutover_authority.worker_journal
  where runtime_id=p_runtime and journal_key=p_key;
 if prior.entry is distinct from retained or prior.token_hash is distinct from digest then
  raise exception 'mip_journal_content_conflict';
 end if;
 perform comparison_qualification.require_bound_final('mip_comparison_worker_v1','worker_journal_put',p_session,p_runtime);
 return true;
end $$;

create function mip_cutover_authority.worker_journal_get(
 p_session uuid,p_runtime text,p_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare retained mip_cutover_authority.worker_journal;token uuid;
begin
 perform comparison_qualification.require_bound('mip_comparison_worker_v1','worker_journal_get',p_session,p_runtime);
 select * into retained from mip_cutover_authority.worker_journal
  where runtime_id=p_runtime and journal_key=p_key;
 if not found then
  perform comparison_qualification.require_bound_final('mip_comparison_worker_v1','worker_journal_get',p_session,p_runtime);
  return null;
 end if;
 if retained.token_hash is not null then
  token:=mip_cutover_authority.worker_journal_token(p_runtime,retained.entry->'args',retained.token_hash);
  perform comparison_qualification.require_bound_final('mip_comparison_worker_v1','worker_journal_get',p_session,p_runtime);
  return jsonb_set(retained.entry,'{args,p_token}',to_jsonb(token::text));
 end if;
 perform comparison_qualification.require_bound_final('mip_comparison_worker_v1','worker_journal_get',p_session,p_runtime);
 return retained.entry;
end $$;

alter function mip_cutover_authority.worker_journal_token(text,jsonb,text) owner to mip_comparison_worker_owner_v1;
alter function mip_cutover_authority.worker_journal_put(uuid,text,text,jsonb) owner to mip_comparison_worker_owner_v1;
alter function mip_cutover_authority.worker_journal_get(uuid,text,text) owner to mip_comparison_worker_owner_v1;
revoke all on function mip_cutover_authority.worker_journal_token(text,jsonb,text),
 mip_cutover_authority.worker_journal_put(uuid,text,text,jsonb),
 mip_cutover_authority.worker_journal_get(uuid,text,text)
 from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1;
grant execute on function mip_cutover_authority.worker_journal_put(uuid,text,text,jsonb),
 mip_cutover_authority.worker_journal_get(uuid,text,text) to mip_comparison_worker_v1;
commit;
