-- Trusted server pins an epoch outside the database restore boundary. Default configuration remains closed.
set role mip_hypothesis_owner;
create function mip_hypothesis.require_observation_epoch(p_expected uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare actual uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 select epoch into actual from mip_hypothesis.observation_epoch where id and enabled for share;
 if actual is null then raise exception using errcode='55000',message='hypothesis observations disabled';end if;
 if p_expected is null or actual<>p_expected then
  raise exception using errcode='55000',message='hypothesis observation epoch mismatch';
 end if;
end $$;
revoke all on function mip_hypothesis.require_observation_epoch(uuid) from public;

revoke all on function mip_hypothesis.capture_history_observation(uuid,uuid,uuid) from mip_hypothesis_gateway;
create function mip_hypothesis.capture_history_observation(p_user uuid,p_investigation uuid,p_request uuid,p_expected_epoch uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
begin
 perform mip_hypothesis.require_observation_epoch(p_expected_epoch);
 return mip_hypothesis.capture_history_observation(p_user,p_investigation,p_request);
end $$;
revoke all on function mip_hypothesis.capture_history_observation(uuid,uuid,uuid,uuid) from public;
grant execute on function mip_hypothesis.capture_history_observation(uuid,uuid,uuid,uuid) to mip_hypothesis_gateway;

revoke all on function mip_hypothesis.read_history_observation(uuid,uuid,uuid) from mip_hypothesis_gateway;
create function mip_hypothesis.read_history_observation(p_user uuid,p_investigation uuid,p_request uuid,p_expected_epoch uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
begin
 perform mip_hypothesis.require_observation_epoch(p_expected_epoch);
 return mip_hypothesis.read_history_observation(p_user,p_investigation,p_request);
end $$;
revoke all on function mip_hypothesis.read_history_observation(uuid,uuid,uuid,uuid) from public;
grant execute on function mip_hypothesis.read_history_observation(uuid,uuid,uuid,uuid) to mip_hypothesis_gateway;

revoke all on function mip_hypothesis.list_history_observations(uuid,uuid) from mip_hypothesis_gateway;
create function mip_hypothesis.list_history_observations(p_user uuid,p_investigation uuid,p_expected_epoch uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
begin
 perform mip_hypothesis.require_observation_epoch(p_expected_epoch);
 return mip_hypothesis.list_history_observations(p_user,p_investigation);
end $$;
revoke all on function mip_hypothesis.list_history_observations(uuid,uuid,uuid) from public;
grant execute on function mip_hypothesis.list_history_observations(uuid,uuid,uuid) to mip_hypothesis_gateway;
reset role;
