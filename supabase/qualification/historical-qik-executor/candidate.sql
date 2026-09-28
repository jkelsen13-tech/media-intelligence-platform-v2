-- SOURCE CANDIDATE ONLY. Not a migration, not installed, not operational.
-- Run only in qikvmopbtijoebdqosyq after the README qualification sequence.
-- Requires dblink 1.2 in extensions, pgcrypto digest in extensions, Vault.
-- Dedicated roles must already exist. Never grant their membership to API roles.
begin;
create schema mip_history authorization mip_history_owner;
revoke all on schema mip_history from public, anon, authenticated, service_role;
set local role mip_history_owner;
alter default privileges in schema mip_history revoke execute on functions from public;
alter default privileges in schema mip_history revoke all on tables from public;

create table mip_history.route (
 singleton boolean primary key default true check(singleton),
 project text not null check(project='qikvmopbtijoebdqosyq'),
 qualified boolean not null default false,
 authorization_sha256 text not null,
 route_sha256 text not null,
 executor name not null check(executor='mip_history_executor'),
 max_export_bytes bigint not null check(max_export_bytes>0),
 max_export_rows bigint not null check(max_export_rows>0),
 max_unit_bytes bigint not null check(max_unit_bytes>0 and max_unit_bytes<=134217728),
 max_manifest_bytes bigint not null check(max_manifest_bytes>0),
 qualification jsonb not null
);
-- No route row is seeded: synthetic measurements are not production qualification.
create table mip_history.source_contract (
 project text primary key check(project in ('niejaejtbxgakyrsntxm','yhbwnrtlqbjtcrrlpbge')),
 vault_secret uuid not null,
 contract_sha256 text not null,
 -- Reviewed read-only SQL, not supplied by requests.
 -- Returns one JSON text object: roots, categories, object_inventory,
 -- family_counts and closure evidence. All reads occur in the same RR transaction.
 inventory_sql text not null,
 expected_tables text[] not null
);
create table mip_history.family_contract (
 project text not null references mip_history.source_contract,
 table_name text not null,
 fields text[] not null,
 -- Returns payload_json, native_identity_json, native_version_json,
 -- roots_json, dependencies_json (all text). Every occurrence must be distinguishable.
 select_sql text not null,
 primary key(project,table_name)
);
create table mip_history.export (
 operation_id uuid primary key,
 state text not null check(state in ('acquired','sealed')),
 raw_inventory jsonb not null,
 manifest_text text,
 manifest_sha256 text,
 route_sha256 text not null,
 authorization_sha256 text not null,
 acquired_at timestamptz not null default clock_timestamp(),
 check((state='sealed')=(manifest_text is not null and manifest_sha256 is not null))
);
-- One permanent payload home. Canonicalization replaces raw bytes ONCE before
-- seal; committed units reference this row and never duplicate payload bytes.
create table mip_history.payload (
 operation_id uuid not null references mip_history.export,
 ordinal bigint not null,
 project text not null,
 table_name text not null,
 native_identity_json text not null,
 native_version_json text not null,
 roots_json text not null,
 dependencies_json text not null,
 body bytea not null,
 canonical boolean not null default false,
 record_meta jsonb,
 primary key(operation_id,ordinal)
);
create unique index payload_identity on mip_history.payload
 (operation_id,(record_meta->'identity')) where canonical;
create table mip_history.unit (
 operation_id uuid not null references mip_history.export,
 unit_id text not null,
 manifest_sha256 text not null,
 unit_sha256 text not null,
 ordinals bigint[] not null,
 receipt jsonb not null,
 primary key(operation_id,unit_id)
);
create table mip_history.checkpoint (
 operation_id uuid primary key references mip_history.export,
 value jsonb not null
);
create function mip_history.guard() returns void
language plpgsql security definer set search_path=pg_catalog,mip_history as $$
begin
 if session_user <> 'mip_history_executor' or
    not exists(select 1 from mip_history.route where qualified and executor=session_user
      and qualification->>'material_host'='qik_only'
      and qualification->>'engine_sha'='b5b80ee37c6cd068d17f59b506bab6df70839ea6'
      and qualification->>'cost_ceiling_verified'='true'
      and qualification->>'acl_verified'='true'
      and qualification->>'full_engine_capacity_verified'='true')
 then raise exception using message='route_unqualified'; end if;
end $$;
create function mip_history.immutable() returns trigger
language plpgsql set search_path=pg_catalog,mip_history as $$
begin
 if tg_table_name='unit' or
    exists(select 1 from mip_history.export where operation_id=old.operation_id and state='sealed')
 then raise exception using message='immutable_export'; end if;
 return new;
end $$;
create trigger payload_immutable before update or delete on mip_history.payload
 for each row execute function mip_history.immutable();
create trigger export_immutable before update or delete on mip_history.export
 for each row execute function mip_history.immutable();
create trigger unit_immutable before update or delete on mip_history.unit
 for each row execute function mip_history.immutable();

-- ONE local statement/transaction; each remote source has ONE persistent session.
-- Every inventory and family SELECT shares the original RR READ ONLY transaction.
-- Any failure rolls the entire local attempt back. No "resume latest" operation.
create function mip_history.acquire(p_operation uuid) returns text
language plpgsql security definer set search_path=pg_catalog,mip_history,extensions
set statement_timeout='110s' set lock_timeout='3s' as $$
declare
 s record; f record; r record; inv text; descriptor text;
 conn text; secret text; inventory jsonb := '{}'::jsonb;
 n bigint:=0; used bigint:=0; route_row mip_history.route;
begin
 perform mip_history.guard();
 select * into strict route_row from mip_history.route;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 if exists(select 1 from mip_history.export where operation_id=p_operation)
 then raise exception using message='original_export_exists'; end if;
 if (select count(*) from mip_history.source_contract)<>2
 then raise exception using message='source_contract_missing'; end if;
 insert into mip_history.export(operation_id,state,raw_inventory,route_sha256,authorization_sha256)
 values(p_operation,'acquired','{}',route_row.route_sha256,route_row.authorization_sha256);
 for s in select * from mip_history.source_contract order by project loop
   if (select array_agg(table_name order by table_name) from mip_history.family_contract where project=s.project)
      is distinct from (select array_agg(x order by x) from unnest(s.expected_tables) x)
   then raise exception using message='family_contract_incomplete'; end if;
   conn := 'mip_'||replace(p_operation::text,'-','')||'_'||s.project;
   -- Secret never leaves database, never interpolated into dynamic SQL or returned.
   select decrypted_secret into strict secret from vault.decrypted_secrets where id=s.vault_secret;
   perform extensions.dblink_connect(conn,secret);
   secret:=null;
   perform extensions.dblink_exec(conn,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   perform extensions.dblink_exec(conn,'SET LOCAL statement_timeout = ''90s''');
   perform extensions.dblink_exec(conn,'SET LOCAL search_path = pg_catalog');
   select v into strict descriptor from extensions.dblink(conn,
     'SELECT json_build_object(''database'',current_database(),''snapshot'',pg_export_snapshot(),''mvcc'',pg_current_snapshot()::text,''readonly'',current_setting(''transaction_read_only''),''isolation'',current_setting(''transaction_isolation''))::text') as d(v text);
   if descriptor::jsonb->>'readonly'<>'on' or descriptor::jsonb->>'isolation'<>'repeatable read'
   then raise exception using message='snapshot_not_frozen'; end if;
   select v into strict inv from extensions.dblink(conn,s.inventory_sql) as d(v text);
   if inv::jsonb->'capacity'->>'within_limits' is distinct from 'true'
   then raise exception using message='acquisition_capacity'; end if;
   -- Objects cannot be assumed absent. This v1 refuses any discovered object;
   -- its byte capture must be implemented and qualified before that route is used.
   if jsonb_typeof(inv::jsonb->'object_inventory') is distinct from 'array'
      or jsonb_array_length(inv::jsonb->'object_inventory')<>0
   then raise exception using message='object_capture_unqualified'; end if;
   inventory:=inventory||jsonb_build_object(s.project,jsonb_build_object(
     'descriptor_json',descriptor,'inventory_json',inv,'contract_sha256',s.contract_sha256));
   for f in select * from mip_history.family_contract where project=s.project order by table_name loop
     for r in select * from extensions.dblink(conn,f.select_sql) as d(
       payload_json text,native_identity_json text,native_version_json text,roots_json text,dependencies_json text)
     loop
       n:=n+1; used:=used+octet_length(r.payload_json);
       if n>route_row.max_export_rows or used>route_row.max_export_bytes
       then raise exception using message='acquisition_capacity'; end if;
       insert into mip_history.payload values(p_operation,n,s.project,f.table_name,
         r.native_identity_json,r.native_version_json,r.roots_json,r.dependencies_json,
         convert_to(r.payload_json,'UTF8'),false,null);
     end loop;
   end loop;
   perform extensions.dblink_exec(conn,'ROLLBACK');
   perform extensions.dblink_disconnect(conn);
   conn:=null;
 end loop;
 update mip_history.export set raw_inventory=inventory where operation_id=p_operation;
 return 'acquired';
exception when others then
 secret:=null;
 if conn is not null then
   begin perform extensions.dblink_disconnect(conn); exception when others then null; end;
 end if;
 raise exception using message='acquisition_failed',errcode='P0001';
end $$;

-- These functions are internal private database calls, never public-schema RPCs.
create function mip_history.canonicalize(p_operation uuid,p_ordinal bigint,p_body bytea,p_meta jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,mip_history,extensions as $$
declare old_row mip_history.payload;
begin
 perform mip_history.guard();
 perform 1 from mip_history.export where operation_id=p_operation and state='acquired' for update;
 if not found then raise exception using message='export_not_acquired'; end if;
 select * into strict old_row from mip_history.payload
 where operation_id=p_operation and ordinal=p_ordinal for update;
 if old_row.canonical then
   if old_row.body<>p_body or old_row.record_meta<>p_meta
   then raise exception using message='canonical_conflict'; end if;
   return;
 end if;
 if convert_from(old_row.body,'UTF8')::jsonb is distinct from convert_from(p_body,'UTF8')::jsonb
 then raise exception using message='canonical_semantic_change'; end if;
 if p_meta->'identity'->>'project' is distinct from old_row.project
    or p_meta->'identity'->>'table' is distinct from old_row.table_name
    or p_meta->>'payload_sha256' is distinct from encode(extensions.digest(p_body,'sha256'),'hex')
    or (p_meta->>'payload_bytes')::bigint is distinct from octet_length(p_body)
 then raise exception using message='canonical_binding'; end if;
 -- Lossless semantic comparison is performed by the pinned JS canonicalizer.
 -- SQL jsonb equality alone is insufficient to prove its wire representation.
 update mip_history.payload set body=p_body,record_meta=p_meta,canonical=true
 where operation_id=p_operation and ordinal=p_ordinal;
end $$;
create function mip_history.seal(p_operation uuid,p_manifest text,p_sha text) returns void
language plpgsql security definer set search_path=pg_catalog,mip_history,extensions as $$
declare m jsonb; e mip_history.export;
begin
 perform mip_history.guard();
 select * into strict e from mip_history.export where operation_id=p_operation for update;
 if e.state='sealed' then
   if e.manifest_sha256<>p_sha or e.manifest_text<>p_manifest
   then raise exception using message='seal_conflict'; end if;
   return;
 end if;
 if octet_length(p_manifest)>(select max_manifest_bytes from mip_history.route)
 or encode(extensions.digest(convert_to(p_manifest,'UTF8'),'sha256'),'hex')<>p_sha
 or exists(select 1 from mip_history.payload where operation_id=p_operation and not canonical)
 then raise exception using message='seal_incomplete'; end if;
 m:=p_manifest::jsonb;
 if m->>'destination_project'<>'qikvmopbtijoebdqosyq'
 or jsonb_array_length(m->'objects')<>0
 or (select count(*) from mip_history.payload where operation_id=p_operation)<>jsonb_array_length(m->'records')
 or exists(
   (select record_meta from mip_history.payload where operation_id=p_operation)
   except (select value from jsonb_array_elements(m->'records')))
 then raise exception using message='seal_mapping'; end if;
 update mip_history.export set state='sealed',manifest_text=p_manifest,manifest_sha256=p_sha
 where operation_id=p_operation;
end $$;
create function mip_history.commit_unit(p_operation uuid,p_manifest text,p_unit text,p_unit_sha text,
 p_ordinals bigint[],p_receipt jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,mip_history as $$
declare previous mip_history.unit;
begin
 perform mip_history.guard();
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 if not exists(select 1 from mip_history.export where operation_id=p_operation
   and state='sealed' and manifest_sha256=p_manifest)
 then raise exception using message='original_export_unavailable'; end if;
 if cardinality(p_ordinals)=0 or cardinality(p_ordinals)<>(select count(distinct x) from unnest(p_ordinals) x)
 or cardinality(p_ordinals)<>(select count(*) from mip_history.payload
   where operation_id=p_operation and ordinal=any(p_ordinals) and canonical)
 then raise exception using message='unit_mapping'; end if;
 if p_receipt->>'operation_id'<>p_operation::text
 or p_receipt->>'manifest_sha256'<>p_manifest or p_receipt->>'unit_id'<>p_unit
 or p_receipt->>'unit_sha256'<>p_unit_sha or p_receipt->>'retention'<>'private_pending'
 then raise exception using message='receipt_binding'; end if;
 select * into previous from mip_history.unit where operation_id=p_operation and unit_id=p_unit;
 if found then
   if previous.manifest_sha256<>p_manifest or previous.unit_sha256<>p_unit_sha
      or previous.ordinals<>p_ordinals or previous.receipt<>p_receipt
   then raise exception using message='unit_conflict'; end if;
   return;
 end if;
 insert into mip_history.unit values(p_operation,p_unit,p_manifest,p_unit_sha,p_ordinals,p_receipt);
end $$;
create function mip_history.cas_checkpoint(p_operation uuid,p_expected text,p_next jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,mip_history as $$
declare previous jsonb;
begin
 perform mip_history.guard();
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select value into previous from mip_history.checkpoint where operation_id=p_operation for update;
 if (previous->>'sha256') is distinct from p_expected then return false; end if;
 if jsonb_typeof(p_next) is distinct from 'object'
 or (select array_agg(k order by k) from jsonb_object_keys(p_next) k)
    is distinct from array['authorization_sha256','manifest_sha256','operation_id','route_sha256','sha256','verified_units','version']
 or p_next->>'version' is distinct from 'historical-article-transfer/v1'
 or jsonb_typeof(p_next->'verified_units') is distinct from 'array'
 then raise exception using message='checkpoint_shape'; end if;
 if exists(select 1 from jsonb_array_elements(p_next->'verified_units') e
   where jsonb_typeof(e) is distinct from 'object'
   or (select array_agg(k order by k) from jsonb_object_keys(e) k)
      is distinct from array['receipt_sha256','unit_id']
   or coalesce(e->>'receipt_sha256','') !~ '^[a-f0-9]{64}$'
   or coalesce(e->>'unit_id','') !~ '^[a-f0-9]{64}$')
 then raise exception using message='checkpoint_shape'; end if;
 if p_next->>'operation_id' is distinct from p_operation::text or
    not exists(select 1 from mip_history.export where operation_id=p_operation and state='sealed'
      and manifest_sha256=p_next->>'manifest_sha256'
      and route_sha256=p_next->>'route_sha256' and authorization_sha256=p_next->>'authorization_sha256')
 then raise exception using message='checkpoint_binding'; end if;
 if previous is null then insert into mip_history.checkpoint values(p_operation,p_next);
 else update mip_history.checkpoint set value=p_next where operation_id=p_operation; end if;
 return true;
end $$;

-- ACLs are final, after object creation. Owner uses explicit RLS policies.
do $$
declare t text;
begin
 foreach t in array array['route','source_contract','family_contract','export','payload','unit','checkpoint'] loop
 execute format('alter table mip_history.%I enable row level security',t);
 execute format('alter table mip_history.%I force row level security',t);
 execute format('create policy owner_access on mip_history.%I to mip_history_owner using (true) with check (true)',t);
 end loop;
 foreach t in array array['route','export','payload','unit','checkpoint'] loop
 execute format('create policy executor_read on mip_history.%I for select to mip_history_executor using (true)',t);
 end loop;
end $$;
revoke all on all tables in schema mip_history from public,anon,authenticated,service_role,mip_history_executor;
revoke all on all functions in schema mip_history from public,anon,authenticated,service_role,mip_history_executor;
grant usage on schema mip_history to mip_history_executor;
grant select on mip_history.route,mip_history.export,mip_history.payload,mip_history.unit,mip_history.checkpoint to mip_history_executor;
grant execute on function mip_history.guard(),mip_history.acquire(uuid),
 mip_history.canonicalize(uuid,bigint,bytea,jsonb),mip_history.seal(uuid,text,text),
 mip_history.commit_unit(uuid,text,text,text,bigint[],jsonb),
 mip_history.cas_checkpoint(uuid,text,jsonb) to mip_history_executor;
reset role;
-- Expected role posture is an installation prerequisite, not silently altered.
do $$
begin
 if exists(select 1 from pg_roles where rolname in ('mip_history_owner','mip_history_executor')
   and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit))
 or not exists(select 1 from pg_roles where rolname='mip_history_owner' and not rolcanlogin)
 or not exists(select 1 from pg_roles where rolname='mip_history_executor' and rolcanlogin)
 or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.roleid
   where r.rolname in ('mip_history_owner','mip_history_executor')
      or m.member in (select oid from pg_roles where rolname in ('mip_history_owner','mip_history_executor')))
 then raise exception using message='principal_posture'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='mip_history' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity))
 then raise exception using message='rls_posture'; end if;
end $$;
commit;
