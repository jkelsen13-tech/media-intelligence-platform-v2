-- Read-only recovery lineage over retained generations. Isolated; no new production grants.
set role mip_hypothesis_owner;
alter function mip_hypothesis.generation_backlog(uuid,uuid) rename to generation_backlog_pre_recovery;
revoke execute on function mip_hypothesis.generation_backlog_pre_recovery(uuid,uuid) from mip_hypothesis_gateway;
create function mip_hypothesis.generation_backlog(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; entries jsonb;
begin
 result:=mip_hypothesis.generation_backlog_pre_recovery(p_user,p_investigation);
 -- The original reader holds current private membership. Only generation IDs
 -- from that same investigation are exposed, never request arguments or secrets.
 select coalesce(jsonb_agg(e.value||jsonb_build_object(
  'recovery_prior_generation_id',prior.prior_generation_id,
  'recovery_generation_id',next.generation_id) order by e.ordinality),'[]'::jsonb)
 into entries from jsonb_array_elements(result->'entries') with ordinality e(value,ordinality)
 left join mip_hypothesis.generation_recoveries prior on prior.generation_id=(e.value->>'generation_id')::uuid
 left join mip_hypothesis.generation_recoveries next on next.prior_generation_id=(e.value->>'generation_id')::uuid;
 return result||jsonb_build_object('contract_version','mip_hypothesis_generation_backlog_v2','entries',entries);
end $$;
revoke all on function mip_hypothesis.generation_backlog(uuid,uuid) from public;
grant execute on function mip_hypothesis.generation_backlog(uuid,uuid) to mip_hypothesis_gateway;
reset role;
