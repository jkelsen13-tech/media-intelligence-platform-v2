-- Isolated production-authority DESIGN. Not a migration, live grant, JWT enablement,
-- publication activation, or cutover. Do not apply via supabase/migrations.
-- Do not rename comparison_qualification.* onto these identities.
-- JWT iss/aud/sub are intentionally absent.
begin;
do $identities$
begin
  if not exists (select 1 from pg_roles where rolname='mip_cutover_schema_owner_v1') then
    create role mip_cutover_schema_owner_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_collector_scheduler_v1') then
    create role mip_collector_scheduler_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_collector_worker_v1') then
    create role mip_collector_worker_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_comparison_producer_v1') then
    create role mip_comparison_producer_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_comparison_worker_v1') then
    create role mip_comparison_worker_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_projection_builder_v1') then
    create role mip_projection_builder_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_projection_publisher_v1') then
    create role mip_projection_publisher_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_cutover_authority_admin_v1') then
    create role mip_cutover_authority_admin_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_cutover_recovery_v1') then
    create role mip_cutover_recovery_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_retention_writer_v1') then
    create role mip_retention_writer_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_retention_reader_v1') then
    create role mip_retention_reader_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_comparison_worker_owner_v1') then
    create role mip_comparison_worker_owner_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_comparison_producer_owner_v1') then
    create role mip_comparison_producer_owner_v1 nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='mip_projection_publisher_owner_v1') then
    create role mip_projection_publisher_owner_v1 nologin nosuperuser nobypassrls;
  end if;
end
$identities$;

create schema if not exists mip_cutover_authority;
revoke all on schema mip_cutover_authority from public,anon,authenticated,service_role;
grant usage on schema mip_cutover_authority to mip_comparison_producer_v1,mip_comparison_worker_v1,
  mip_projection_publisher_v1,mip_cutover_authority_admin_v1,mip_cutover_recovery_v1;

-- EXECUTE-only stubs. They refuse until owner-gated provision. Not live workers.
create function mip_cutover_authority.producer_enqueue(
  p_request uuid,p_session uuid,p_runtime text,p_payload jsonb,p_observed timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  raise exception using errcode='P0001', message='mip_cutover_authority_not_provisioned';
end $$;

create function mip_cutover_authority.worker_claim(p_request uuid,p_session uuid,p_runtime text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  raise exception using errcode='P0001', message='mip_cutover_authority_not_provisioned';
end $$;

create function mip_cutover_authority.worker_complete(
  p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,p_input_hash text,p_implementation text,p_output jsonb
) returns text language plpgsql security definer set search_path='' as $$
begin
  raise exception using errcode='P0001', message='mip_cutover_authority_not_provisioned';
end $$;

create function mip_cutover_authority.publisher_release(p_request uuid,p_session uuid,p_runtime text,p_source text)
returns text language plpgsql security definer set search_path='' as $$
begin
  raise exception using errcode='P0001', message='mip_cutover_authority_not_provisioned';
end $$;

alter function mip_cutover_authority.producer_enqueue(uuid,uuid,text,jsonb,timestamptz) owner to mip_comparison_producer_owner_v1;
alter function mip_cutover_authority.worker_claim(uuid,uuid,text) owner to mip_comparison_worker_owner_v1;
alter function mip_cutover_authority.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb) owner to mip_comparison_worker_owner_v1;
alter function mip_cutover_authority.publisher_release(uuid,uuid,text,text) owner to mip_projection_publisher_owner_v1;

revoke all on function mip_cutover_authority.producer_enqueue(uuid,uuid,text,jsonb,timestamptz),
  mip_cutover_authority.worker_claim(uuid,uuid,text),
  mip_cutover_authority.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb),
  mip_cutover_authority.publisher_release(uuid,uuid,text,text)
from public,anon,authenticated,service_role;

grant execute on function mip_cutover_authority.producer_enqueue(uuid,uuid,text,jsonb,timestamptz)
  to mip_comparison_producer_v1;
grant execute on function mip_cutover_authority.worker_claim(uuid,uuid,text),
  mip_cutover_authority.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)
  to mip_comparison_worker_v1;
grant execute on function mip_cutover_authority.publisher_release(uuid,uuid,text,text)
  to mip_projection_publisher_v1;
-- Producer source and evaluated implementation are server-bound at provision time.
-- This stub does not accept caller-supplied source or implementation identity.
commit;
