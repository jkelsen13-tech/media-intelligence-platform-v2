-- Isolated native proof fixture only. NOT a production migration or integrated source capability.
-- Existing capture/permit interfaces remain unchanged and reject this two-table publication.
begin;
set role mip_temporal_registry_owner;
create table mip_temporal.stream_markers(
 marker_id uuid primary key,
 epoch uuid not null,
 creator_xid xid8 not null default pg_current_xact_id()
);
alter table mip_temporal.stream_markers enable row level security;
alter table mip_temporal.stream_markers force row level security;
-- No recorder/gateway/worker table policy or grant. Synthetic CI administrator supplies markers.
create policy registry on mip_temporal.stream_markers to mip_temporal_registry_owner using(true) with check(true);
reset role;
create trigger immutable_rows before update or delete on mip_temporal.stream_markers
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_temporal.stream_markers
 for each statement execute function mip_hypothesis.reject_mutation();
revoke all on mip_temporal.stream_markers from public,anon,authenticated,service_role,mip_temporal_recorder,mip_temporal_ack_gateway,mip_comparison_worker_v1;
commit;
