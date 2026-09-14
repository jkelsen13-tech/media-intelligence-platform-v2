-- Isolated qualification extension only; no live migration or gateway deployment.
-- Caller identity is supplied only by the trusted authenticated coordinator.
begin;
create role mip_boundary_history_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema mip_temporal to mip_boundary_history_gateway;
grant usage on schema mip_hypothesis to mip_temporal_advance_owner;
grant execute on function mip_hypothesis.read_bound_history(uuid,uuid) to mip_temporal_advance_owner;
create function mip_temporal.read_boundary_history(
 p_session uuid,p_binding uuid,p_incarnation uuid,p_digest text,p_source uuid,p_stream uuid,p_epoch uuid,
 p_capture uuid,p_marker uuid,p_user uuid,p_investigation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;c mip_temporal.stream_captures;k mip_temporal.boundary_capture_types;
 h mip_temporal.stream_heads;receipt jsonb;history jsonb;actual pg_lsn;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'mip_boundary_history_isolation';end if;
 -- Native identity and history execute on this very database backend, not separately named adapters.
 v:=mip_temporal.check_boundary_stream(p_session,p_binding,p_incarnation,p_digest);
 if v.source_id is distinct from p_source or v.stream_epoch is distinct from p_stream
  or v.observation_epoch is distinct from p_epoch then raise exception 'mip_boundary_history_scope';end if;
 select * into c from mip_temporal.stream_captures where id=p_capture;
 select * into k from mip_temporal.boundary_capture_types where capture_id=p_capture;
 select * into h from mip_temporal.stream_heads where binding_id=p_binding;
 select r.receipt into receipt from mip_temporal.stream_checkpoints r where capture_id=p_capture;
 select confirmed_flush_lsn into actual from pg_catalog.pg_replication_slots where slot_name=v.slot_name;
 if c.binding_id is distinct from p_binding or k.kind is distinct from 'marker'
  or k.target_request is distinct from p_marker or receipt is null or h.last_lsn<c.end_lsn
  or actual is distinct from h.last_lsn then raise exception 'mip_boundary_history_terminal';end if;
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 -- Revalidate time-sensitive session authority after any permission-fence wait.
 perform mip_temporal.check_boundary_stream(p_session,p_binding,p_incarnation,p_digest);
 return jsonb_build_object('schema','mip_combined_boundary_history_v1',
  'binding_id',p_binding,'incarnation_id',p_incarnation,'contract_digest',p_digest,
  'source_id',v.source_id,'stream_epoch',v.stream_epoch,'observation_epoch',v.observation_epoch,
  'terminal_capture',p_capture,'target_marker',p_marker,'covered_through',c.end_lsn::text,
  'verified_user_id',p_user,'investigation_id',p_investigation,'history',history);
end $$;
alter function mip_temporal.read_boundary_history(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
 owner to mip_temporal_advance_owner;
revoke all on function mip_temporal.read_boundary_history(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
 from public,anon,authenticated,service_role,mip_temporal_recorder,mip_temporal_ack_gateway,mip_comparison_worker_v1;
grant execute on function mip_temporal.read_boundary_history(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
 to mip_boundary_history_gateway;
commit;
