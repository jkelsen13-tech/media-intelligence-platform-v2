-- Isolated compatibility delta: install001..005, then013..016 in that order.
-- No production migration, credentials, schema exposure or worker activation.
-- Continue the005 external workload mapping/key/session authority contract.
begin;
do $$begin
 if to_regprocedure('mip_identity.authorize(uuid,text,text)') is null
 or to_regprocedure('mip_cutover_authority.worker_resume_claim(uuid,text,text)') is null then
  raise exception 'mip_broker_recovery_dependencies';
 end if;
end $$;
-- Existing native kernel owns exact job recovery after005; grant only the
-- specific supporting history privileges, never worker table access.
grant select on mip_cutover_authority.worker_journal to mip_kernel_owner_v2;
create policy native_resume_journal_read on mip_cutover_authority.worker_journal
 for select to mip_kernel_owner_v2 using(true);
grant select,insert on mip_cutover_authority.lease_owners to mip_kernel_owner_v2;
create policy native_resume_lease_owner on mip_cutover_authority.lease_owners
 to mip_kernel_owner_v2 using(true) with check(true);

create function mip_identity.worker_journal_put(p_session uuid,p_runtime text,p_key text,p_entry jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare result boolean;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 result:=mip_cutover_authority.worker_journal_put(p_session,p_runtime,p_key,p_entry);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 return result;
end $$;
alter function mip_identity.worker_journal_put(uuid,text,text,jsonb) owner to mip_comparison_worker_owner_v1;
revoke all on function mip_identity.worker_journal_put(uuid,text,text,jsonb) from public,anon,authenticated,service_role,mip_comparison_producer_v1;
grant execute on function mip_identity.worker_journal_put(uuid,text,text,jsonb) to mip_comparison_worker_v1;
revoke execute on function mip_cutover_authority.worker_journal_put(uuid,text,text,jsonb) from mip_comparison_worker_v1;

create function mip_identity.worker_journal_get(p_session uuid,p_runtime text,p_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 result:=mip_cutover_authority.worker_journal_get(p_session,p_runtime,p_key);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 return result;
end $$;
alter function mip_identity.worker_journal_get(uuid,text,text) owner to mip_comparison_worker_owner_v1;
revoke all on function mip_identity.worker_journal_get(uuid,text,text) from public,anon,authenticated,service_role,mip_comparison_producer_v1;
grant execute on function mip_identity.worker_journal_get(uuid,text,text) to mip_comparison_worker_v1;
revoke execute on function mip_cutover_authority.worker_journal_get(uuid,text,text) from mip_comparison_worker_v1;

create function mip_identity.worker_journal_pending(p_session uuid,p_runtime text,p_after text,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 result:=mip_cutover_authority.worker_journal_pending(p_session,p_runtime,p_after,p_limit);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 return result;
end $$;
alter function mip_identity.worker_journal_pending(uuid,text,text,integer) owner to mip_comparison_worker_owner_v1;
revoke all on function mip_identity.worker_journal_pending(uuid,text,text,integer) from public,anon,authenticated,service_role,mip_comparison_producer_v1;
grant execute on function mip_identity.worker_journal_pending(uuid,text,text,integer) to mip_comparison_worker_v1;
revoke execute on function mip_cutover_authority.worker_journal_pending(uuid,text,text,integer) from mip_comparison_worker_v1;

create function mip_identity.worker_resume_claim(p_session uuid,p_runtime text,p_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 result:=mip_cutover_authority.worker_resume_claim(p_session,p_runtime,p_key);
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 return result;
end $$;
alter function mip_identity.worker_resume_claim(uuid,text,text) owner to mip_comparison_worker_owner_v1;
revoke all on function mip_identity.worker_resume_claim(uuid,text,text) from public,anon,authenticated,service_role,mip_comparison_producer_v1;
grant execute on function mip_identity.worker_resume_claim(uuid,text,text) to mip_comparison_worker_v1;
revoke execute on function mip_cutover_authority.worker_resume_claim(uuid,text,text) from mip_comparison_worker_v1;
commit;
