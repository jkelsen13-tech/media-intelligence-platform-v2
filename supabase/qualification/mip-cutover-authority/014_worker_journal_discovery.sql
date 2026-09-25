-- R5 isolated discovery integration; load after 013. No new queue or journal.
begin;
grant select(request_id,rpc_name,principal,runtime_id,generation_id,outcome)
 on comparison_qualification.request_runs to mip_comparison_worker_owner_v1;
create policy journal_discovery_runs on comparison_qualification.request_runs for select
 to mip_comparison_worker_owner_v1 using(true);
grant select(state) on comparison_qualification.jobs to mip_comparison_worker_owner_v1;
create index worker_journal_generation on mip_cutover_authority.worker_journal
 (runtime_id,((entry->'args')->>'p_generation'))
 where journal_key like 'worker_complete:%' or journal_key like 'worker_fail:%';

create function mip_cutover_authority.worker_journal_pending(
 p_session uuid,p_runtime text,p_after text,p_limit integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare item record;result jsonb:='[]'::jsonb;bound jsonb;native_state text;
begin
 perform comparison_qualification.require_bound('mip_comparison_worker_v1','worker_journal_pending',p_session,p_runtime);
 if p_limit is null or p_limit<1 or p_limit>50 or p_after is null or length(p_after)>100 then
  raise exception 'mip_journal_page_bounds';
 end if;
 for item in
  select j.*,r.generation_id as claimed_generation,r.outcome as claim_outcome
  from mip_cutover_authority.worker_journal j
  left join comparison_qualification.request_runs r
   on j.entry->>'operation'='worker_claim'
   and r.request_id=(j.entry->'args'->>'p_request')::uuid and r.rpc_name='worker_claim'
   and r.runtime_id=p_runtime and r.principal='mip_comparison_worker_v1'
  where j.runtime_id=p_runtime and (case when j.entry->>'operation'='worker_claim' then 1 else 0 end,j.journal_key)>
    (case when p_after='' then -1 when p_after like 'worker_claim:%' then 1 else 0 end,p_after)
   and right(j.journal_key,8)<>':receipt'
   and (
    (j.entry->>'operation' in ('worker_complete','worker_fail') and not exists(
      select 1 from mip_cutover_authority.worker_journal receipt
      where receipt.runtime_id=p_runtime and receipt.journal_key=j.journal_key||':receipt'))
    or (j.entry->>'operation'='worker_claim' and (
      r.request_id is null or
      (r.outcome='lease_issued' and exists(
       select 1 from comparison_qualification.jobs native
       where native.generation_id=r.generation_id and native.state='processing')
       and not exists(select 1 from mip_cutover_authority.worker_journal terminal
        where terminal.runtime_id=p_runtime
         and terminal.entry->>'operation' in ('worker_complete','worker_fail')
         and terminal.entry->'args'->>'p_generation'=r.generation_id::text))
    ))
   )
  order by case when j.entry->>'operation'='worker_claim' then 1 else 0 end,j.journal_key limit p_limit
 loop
  if item.token_hash is not null then
   -- Reuse native lease owner/source/implementation checks; never return tokens.
   perform mip_cutover_authority.worker_journal_token(p_runtime,item.entry->'args',item.token_hash);
   select state into native_state from comparison_qualification.jobs
    where generation_id=(item.entry->'args'->>'p_generation')::uuid;
  elsif item.claimed_generation is not null then
   bound:=comparison_qualification.claim_payload(item.claimed_generation,true,'journal_discovery');
   perform comparison_qualification.require_source_scope(p_runtime,bound->>'source_project');
   perform comparison_qualification.require_evaluated_implementation(p_runtime,bound->>'implementation_ref');
   native_state:='processing';
  else
   native_state:='unconfirmed';
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('key',item.journal_key,
   'action',case when item.entry->>'operation'='worker_claim' then 'hold_claim' else 'retry_terminal' end,
   'native_state',native_state));
 end loop;
 perform comparison_qualification.require_bound_final('mip_comparison_worker_v1','worker_journal_pending',p_session,p_runtime);
 return result;
end $$;
alter function mip_cutover_authority.worker_journal_pending(uuid,text,text,integer)
 owner to mip_comparison_worker_owner_v1;
revoke all on function mip_cutover_authority.worker_journal_pending(uuid,text,text,integer)
 from public,anon,authenticated,service_role,mip_comparison_producer_v1;
grant execute on function mip_cutover_authority.worker_journal_pending(uuid,text,text,integer)
 to mip_comparison_worker_v1;
commit;
