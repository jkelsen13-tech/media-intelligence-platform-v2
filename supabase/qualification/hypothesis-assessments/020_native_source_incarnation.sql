-- Isolated native source-incarnation guard. No production registration, credential or deployment.
begin;
set role mip_temporal_registry_owner;
create table mip_temporal.source_incarnations(
 binding_id uuid primary key references mip_temporal.source_versions,
 incarnation_id uuid not null unique,
 system_identifier text not null,database_oid oid not null,postmaster_started_at timestamptz not null,
 approval_ref text not null check(length(approval_ref)>0),
 check(isfinite(postmaster_started_at))
);
alter table mip_temporal.source_incarnations enable row level security;
alter table mip_temporal.source_incarnations force row level security;
create policy registry on mip_temporal.source_incarnations to mip_temporal_registry_owner using(true) with check(true);
reset role;
-- Only the existing NOLOGIN registry owner can inspect this control-data function.
grant execute on function pg_catalog.pg_control_system() to mip_temporal_registry_owner;
set role mip_temporal_registry_owner;
create function mip_temporal.require_incarnation(p_session uuid,p_binding uuid,p_expected uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;r mip_temporal.source_incarnations;system_id text;db_oid oid;
begin
 v:=mip_temporal.authorize_binding(p_session,p_binding);
 select * into r from mip_temporal.source_incarnations where binding_id=p_binding;
 if not found or p_expected is null or r.incarnation_id<>p_expected then raise exception 'mip_source_incarnation_denied';end if;
 select system_identifier::text into system_id from pg_catalog.pg_control_system();
 select oid into db_oid from pg_catalog.pg_database where datname=current_database();
 if r.system_identifier is distinct from system_id or r.database_oid is distinct from db_oid
  or r.postmaster_started_at is distinct from pg_catalog.pg_postmaster_start_time() then
  raise exception 'mip_source_native_identity_changed';
 end if;
end $$;
revoke all on function mip_temporal.require_incarnation(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function mip_temporal.require_incarnation(uuid,uuid,uuid) to mip_temporal_advance_owner;
reset role;
create function mip_temporal.capture_incarnation(p_session uuid,p_binding uuid,p_expected uuid,p_before pg_lsn,p_request uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform mip_temporal.require_incarnation(p_session,p_binding,p_expected);
 return mip_temporal.capture_next(p_session,p_binding,p_before,p_request);
end $$;
create function mip_temporal.prepare_incarnation(p_session uuid,p_capture uuid,p_expected uuid,p_request uuid,p_source uuid,p_stream uuid,
 p_end pg_lsn,p_bootstrap text,p_frames text,p_delivery text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare binding uuid;
begin
 select binding_id into binding from mip_temporal.stream_captures where id=p_capture;
 if not found then raise exception 'mip_source_incarnation_denied';end if;
 perform mip_temporal.require_incarnation(p_session,binding,p_expected);
 return mip_temporal.prepare_covered_advance(p_session,p_capture,p_request,p_source,p_stream,p_end,p_bootstrap,p_frames,p_delivery);
end $$;
create function mip_temporal.advance_incarnation(p_session uuid,p_request uuid,p_expected uuid) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare binding uuid;
begin
 select c.binding_id into binding from mip_temporal.covered_permits p join mip_temporal.stream_captures c on c.id=p.capture_id where p.request_id=p_request;
 if not found then raise exception 'mip_source_incarnation_denied';end if;
 perform mip_temporal.require_incarnation(p_session,binding,p_expected);
 return mip_temporal.advance_covered(p_session,p_request);
end $$;
do $owners$
declare r record;
begin
 for r in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='mip_temporal' and p.proname in('capture_incarnation','prepare_incarnation','advance_incarnation') loop
  execute 'alter function '||r.signature||' owner to mip_temporal_advance_owner';
  execute 'revoke all on function '||r.signature||' from public,anon,authenticated,service_role';
 end loop;
end $owners$;
revoke execute on function mip_temporal.capture_next(uuid,uuid,pg_lsn,uuid),
 mip_temporal.prepare_covered_advance(uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text) from mip_temporal_recorder;
revoke execute on function mip_temporal.advance_covered(uuid,uuid) from mip_temporal_ack_gateway;
grant execute on function mip_temporal.capture_incarnation(uuid,uuid,uuid,pg_lsn,uuid),
 mip_temporal.prepare_incarnation(uuid,uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text) to mip_temporal_recorder;
grant execute on function mip_temporal.advance_incarnation(uuid,uuid,uuid) to mip_temporal_ack_gateway;
create trigger immutable_rows before update or delete on mip_temporal.source_incarnations
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_temporal.source_incarnations
 for each statement execute function mip_hypothesis.reject_mutation();
commit;
