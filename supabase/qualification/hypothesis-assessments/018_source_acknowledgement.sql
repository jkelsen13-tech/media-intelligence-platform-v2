-- Isolated source-side acknowledgement capability. NOT a production migration or identity grant.
begin;
create role mip_temporal_registry_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_temporal_advance_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls replication;
create role mip_temporal_recorder nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_temporal_ack_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema mip_temporal authorization mip_temporal_registry_owner;
revoke all on schema mip_temporal from public,anon,authenticated,service_role;
grant usage on schema mip_temporal to mip_temporal_advance_owner,mip_temporal_recorder,mip_temporal_ack_gateway;
grant usage on schema mip_identity,mip_hypothesis to mip_temporal_registry_owner;
grant execute on function mip_identity.authorize(uuid,text,text),mip_identity.current_mapping(text,text) to mip_temporal_registry_owner;
grant execute on function mip_hypothesis.require_observation_epoch(uuid) to mip_temporal_registry_owner;
set role mip_temporal_registry_owner;
create table mip_temporal.source_versions(
 id uuid primary key,source_id uuid not null,stream_epoch uuid not null,runtime text not null,
 slot_name name not null,database_name name not null,observation_epoch uuid not null,
 approval_ref text not null check(length(approval_ref)>0)
);
create table mip_temporal.source_heads(
 source_id uuid primary key,binding_id uuid not null references mip_temporal.source_versions,active boolean not null
);
create table mip_temporal.retired_bindings(id uuid primary key);
alter table mip_temporal.retired_bindings enable row level security;
alter table mip_temporal.retired_bindings force row level security;
create policy registry on mip_temporal.retired_bindings to mip_temporal_registry_owner using(true) with check(true);
create table mip_temporal.advance_permits(
 request_id uuid primary key,binding_id uuid not null references mip_temporal.source_versions,
 mapping_revision uuid not null,end_lsn pg_lsn not null,delivery_hash text not null check(delivery_hash ~ '^[0-9a-f]{64}$'),
 creator_xid xid8 not null
);
create table mip_temporal.advance_receipts(
 request_id uuid primary key references mip_temporal.advance_permits,receipt jsonb not null
);
alter table mip_temporal.source_versions enable row level security;
alter table mip_temporal.source_versions force row level security;
alter table mip_temporal.source_heads enable row level security;
alter table mip_temporal.source_heads force row level security;
alter table mip_temporal.advance_permits enable row level security;
alter table mip_temporal.advance_permits force row level security;
alter table mip_temporal.advance_receipts enable row level security;
alter table mip_temporal.advance_receipts force row level security;
create policy registry on mip_temporal.source_versions to mip_temporal_registry_owner using(true) with check(true);
create policy registry on mip_temporal.source_heads to mip_temporal_registry_owner using(true) with check(true);
create policy registry on mip_temporal.advance_permits to mip_temporal_registry_owner using(true) with check(true);
create policy advancer on mip_temporal.advance_permits for select to mip_temporal_advance_owner using(true);
create policy advancer on mip_temporal.advance_receipts to mip_temporal_advance_owner using(true) with check(true);
create function mip_temporal.authorize_binding(p_session uuid,p_binding uuid)
returns mip_temporal.source_versions language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;
begin
 select * into v from mip_temporal.source_versions where id=p_binding;
 if not found then raise exception 'mip_temporal_binding_denied';end if;
 -- Same authority fence used by mapping/key revocation and source-head changes.
 perform mip_identity.authorize(p_session,v.runtime,'mip_comparison_producer_v1');
 perform 1 from mip_temporal.source_heads where source_id=v.source_id and binding_id=v.id and active;
 if not found or v.database_name<>current_database() then raise exception 'mip_temporal_binding_denied';end if;
 perform mip_hypothesis.require_observation_epoch(v.observation_epoch);
 perform 1 from pg_catalog.pg_replication_slots where slot_name=v.slot_name and database=v.database_name
  and slot_type='logical' and plugin='pgoutput' and invalidation_reason is null;
 if not found then raise exception 'mip_temporal_slot_denied';end if;
 return v;
end $$;
create function mip_temporal.prepare_advance(p_session uuid,p_binding uuid,p_source uuid,p_stream uuid,p_request uuid,p_end pg_lsn,p_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;m uuid;old mip_temporal.advance_permits;
begin
 v:=mip_temporal.authorize_binding(p_session,p_binding);
 if p_source is distinct from v.source_id or p_stream is distinct from v.stream_epoch or p_request is null
  or p_end is null or p_end<='0/0'::pg_lsn or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'mip_temporal_permit_denied';
 end if;
 m:=(mip_identity.current_mapping(v.runtime,'mip_comparison_producer_v1')).revision;
 perform pg_advisory_xact_lock(hashtextextended('mip-temporal-permit:'||p_request::text,0));
 perform mip_temporal.authorize_binding(p_session,p_binding);
 select * into old from mip_temporal.advance_permits where request_id=p_request;
 if found then
  if old.binding_id<>p_binding or old.mapping_revision<>m or old.end_lsn<>p_end or old.delivery_hash<>p_hash then
   raise exception 'mip_temporal_permit_conflict';
  end if;
  return p_request;
 end if;
 insert into mip_temporal.advance_permits values(p_request,p_binding,m,p_end,p_hash,pg_current_xact_id());
 return p_request;
end $$;
create function mip_temporal.guard_source_restore() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (tg_op='UPDATE' and (old.binding_id<>new.binding_id or (old.active and not new.active))) then
  insert into mip_temporal.retired_bindings values(old.binding_id) on conflict do nothing;
 end if;
 if tg_op<>'DELETE' and new.active and exists(select 1 from mip_temporal.retired_bindings where id=new.binding_id) then
  raise exception 'mip_temporal_fresh_binding_required';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger explicit_restore before insert or update or delete on mip_temporal.source_heads
 for each row execute function mip_temporal.guard_source_restore();
reset role;
grant select on mip_temporal.advance_permits to mip_temporal_advance_owner;
grant select,insert on mip_temporal.advance_receipts to mip_temporal_advance_owner;
grant usage on schema mip_identity to mip_temporal_advance_owner;
grant execute on function mip_identity.current_mapping(text,text) to mip_temporal_advance_owner;
create function mip_temporal.advance(p_session uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_temporal.advance_permits;v mip_temporal.source_versions;observed pg_lsn;result jsonb;m uuid;
begin
 select * into p from mip_temporal.advance_permits where request_id=p_request;
 if not found or p.creator_xid=pg_current_xact_id() then raise exception 'mip_temporal_committed_permit_required';end if;
 v:=mip_temporal.authorize_binding(p_session,p.binding_id);
 perform pg_advisory_xact_lock(hashtextextended('mip-temporal-slot:'||v.slot_name::text,0));
 -- Recheck expiry after waiting. Revocation cannot commit while the shared authority lock is held.
 v:=mip_temporal.authorize_binding(p_session,p.binding_id);
 m:=(mip_identity.current_mapping(v.runtime,'mip_comparison_producer_v1')).revision;
 if m<>p.mapping_revision then raise exception 'mip_temporal_permit_owner_mismatch';end if;
 select receipt into result from mip_temporal.advance_receipts where request_id=p_request;
 if found then return result;end if;
 select confirmed_flush_lsn into observed from pg_catalog.pg_replication_slots where slot_name=v.slot_name;
 if observed is null or observed>p.end_lsn then raise exception 'mip_temporal_ambiguous_position';end if;
 select end_lsn into observed from pg_catalog.pg_replication_slot_advance(v.slot_name,p.end_lsn);
 if observed<>p.end_lsn then raise exception 'mip_temporal_advance_unconfirmed';end if;
 -- Slot advancement is NOT rolled back with SQL. A prior committed permit survives an ambiguous failure.
 result:=jsonb_build_object('state','slot_advance_observed','request_id',p_request,'end_lsn',observed::text,'historical_time_qualified',false);
 insert into mip_temporal.advance_receipts values(p_request,result);
 return result;
end $$;
alter function mip_temporal.advance(uuid,uuid) owner to mip_temporal_advance_owner;
grant execute on function mip_temporal.authorize_binding(uuid,uuid) to mip_temporal_advance_owner;
revoke all on all functions in schema mip_temporal from public,anon,authenticated,service_role;
grant execute on function mip_temporal.prepare_advance(uuid,uuid,uuid,uuid,uuid,pg_lsn,text) to mip_temporal_recorder;
grant execute on function mip_temporal.advance(uuid,uuid) to mip_temporal_ack_gateway;
-- No owner-role membership, replication flag or native slot API is granted to either gateway or worker.
create trigger source_fence before insert or update or delete or truncate on mip_temporal.source_heads
 for each statement execute function mip_identity.serialize_change();
create trigger no_head_truncate before truncate on mip_temporal.source_heads for each statement execute function mip_hypothesis.reject_mutation();
do $immutable$
declare t text;
begin
 foreach t in array array['source_versions','advance_permits','advance_receipts','retired_bindings'] loop
  execute format('create trigger immutable_rows before update or delete on mip_temporal.%I for each row execute function mip_hypothesis.reject_mutation()',t);
  execute format('create trigger immutable_table before truncate on mip_temporal.%I for each statement execute function mip_hypothesis.reject_mutation()',t);
 end loop;
end $immutable$;
commit;
