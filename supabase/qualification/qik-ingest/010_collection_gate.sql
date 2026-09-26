-- C3 qik ingest: owner collection gate. FILES ONLY. Not a live migration.
-- Default remains disabled. Does not create secrets, schedules, or articles.
-- Pre-existing package identities are refused by 05_operation_ledger.sql.

create schema qik_ingest;
create role qik_ingest_fn_owner nologin noinherit;
create role qik_ingest_runtime login noinherit;

-- A non-superuser creator receives ADMIN, not SET, on PostgreSQL 16.
-- Keep explicit owner access non-inheriting; DROP ROLE removes it at cleanup.
do $owner_access$
begin
  if not (select rolsuper from pg_roles where rolname=current_user) then
    execute format('grant qik_ingest_fn_owner to %I with set true', current_user);
    execute format('grant qik_ingest_fn_owner to %I with inherit false', current_user);
  end if;
  if not has_schema_privilege('service_role','public','USAGE') then
    raise exception 'qik_ingest_service_public_usage_required';
  end if;
end
$owner_access$;

grant usage on schema qik_ingest to qik_ingest_fn_owner;
grant usage on schema public to qik_ingest_fn_owner, qik_ingest_runtime;

create table if not exists qik_ingest.package_meta (
  id boolean primary key default true check (id),
  package text not null check (package = 'qik-ingest'),
  live_hold boolean not null default true check (live_hold),
  algorithm_version text not null check (algorithm_version = 'qik-ingest-rss-v1-retain-from-yhb-v8')
);
insert into qik_ingest.package_meta (id, package, live_hold, algorithm_version)
values (true, 'qik-ingest', true, 'qik-ingest-rss-v1-retain-from-yhb-v8')
on conflict (id) do nothing;

create table if not exists qik_ingest.collection_gate (
  id boolean primary key default true check (id),
  collection_authorized boolean not null default false,
  notes text not null default 'Owner gate. Default false. Edge cannot flip this.'
);
insert into qik_ingest.collection_gate (id, collection_authorized)
values (true, false)
on conflict (id) do nothing;

create table if not exists qik_ingest.runtime_credentials (
  credential_hash text primary key check (credential_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default false,
  notes text not null default 'Empty on live apply. Disposable tests insert a hash. No plaintext secrets.'
);

do $$
declare
  rec record;
begin
  if to_regclass('qik_ingest_operation.dropped_constraints') is null then
    raise exception 'qik_ingest_cleanup_requires_ledger';
  end if;
  for rec in
    select c.conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    where c.conrelid = 'public.ingest_sources'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ~* 'collection_enabled'
      and pg_get_constraintdef(c.oid) ~* 'false'
  loop
    insert into qik_ingest_operation.dropped_constraints(nspname,relname,conname,definition)
    values ('public','ingest_sources',rec.conname,rec.definition)
    on conflict do nothing;
    execute format('alter table public.ingest_sources drop constraint %I', rec.conname);
  end loop;
end
$$;

create or replace function qik_ingest.enforce_collection_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collection_enabled is true
     and not coalesce((select collection_authorized from qik_ingest.collection_gate where id), false) then
    raise exception 'qik_ingest_collection_not_authorized' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function qik_ingest.enforce_collection_gate() from public, anon, authenticated, service_role, qik_ingest_runtime;

drop trigger if exists qik_ingest_collection_gate on public.ingest_sources;
create trigger qik_ingest_collection_gate
before insert or update on public.ingest_sources
for each row execute function qik_ingest.enforce_collection_gate();

create or replace function qik_ingest.require_token(p_token text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'qik_ingest_unauthorized' using errcode = '28000';
  end if;
  if not exists (
    select 1 from qik_ingest.runtime_credentials
    where active
      and credential_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'qik_ingest_unauthorized' using errcode = '28000';
  end if;
end
$$;
revoke all on function qik_ingest.require_token(text) from public, anon, authenticated, service_role, qik_ingest_runtime;

create or replace function qik_ingest.reject_false_current(p_freshness text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_freshness in ('current', 'up_to_date', 'latest', 'live_current') then
    raise exception 'qik_ingest_false_current_forbidden' using errcode = '22023';
  end if;
end
$$;
revoke all on function qik_ingest.reject_false_current(text) from public, anon, authenticated, service_role, qik_ingest_runtime;

alter table qik_ingest.package_meta enable row level security;
alter table qik_ingest.package_meta force row level security;
alter table qik_ingest.collection_gate enable row level security;
alter table qik_ingest.collection_gate force row level security;
alter table qik_ingest.runtime_credentials enable row level security;
alter table qik_ingest.runtime_credentials force row level security;

revoke all on all tables in schema qik_ingest from public, anon, authenticated, service_role, qik_ingest_runtime;
grant select, insert, update on qik_ingest.package_meta, qik_ingest.collection_gate, qik_ingest.runtime_credentials
  to qik_ingest_fn_owner;

drop policy if exists qik_ingest_fn_package_meta on qik_ingest.package_meta;
create policy qik_ingest_fn_package_meta on qik_ingest.package_meta
  for all to qik_ingest_fn_owner using (true) with check (true);
drop policy if exists qik_ingest_fn_collection_gate on qik_ingest.collection_gate;
create policy qik_ingest_fn_collection_gate on qik_ingest.collection_gate
  for all to qik_ingest_fn_owner using (true) with check (true);
drop policy if exists qik_ingest_fn_runtime_credentials on qik_ingest.runtime_credentials;
create policy qik_ingest_fn_runtime_credentials on qik_ingest.runtime_credentials
  for all to qik_ingest_fn_owner using (true) with check (true);

drop policy if exists qik_ingest_fn_select_articles on public.articles;
create policy qik_ingest_fn_select_articles on public.articles
  for select to qik_ingest_fn_owner using (true);
drop policy if exists qik_ingest_fn_select_sources on public.ingest_sources;
create policy qik_ingest_fn_select_sources on public.ingest_sources
  for select to qik_ingest_fn_owner using (true);
drop policy if exists qik_ingest_fn_runs on public.ingestion_runs;
create policy qik_ingest_fn_runs on public.ingestion_runs
  for all to qik_ingest_fn_owner using (true) with check (true);
drop policy if exists qik_ingest_fn_source_runs on public.ingestion_source_runs;
create policy qik_ingest_fn_source_runs on public.ingestion_source_runs
  for all to qik_ingest_fn_owner using (true) with check (true);
drop policy if exists qik_ingest_fn_watermarks on public.mip_consolidation_watermarks;
create policy qik_ingest_fn_watermarks on public.mip_consolidation_watermarks
  for all to qik_ingest_fn_owner using (true) with check (true);

grant select on public.ingest_sources to qik_ingest_fn_owner;
grant select on public.articles to qik_ingest_fn_owner;
grant select, insert, update on public.ingestion_runs to qik_ingest_fn_owner;
grant select, insert, update on public.ingestion_source_runs to qik_ingest_fn_owner;
grant select, insert, update on public.mip_consolidation_watermarks to qik_ingest_fn_owner;

grant create on schema qik_ingest to qik_ingest_fn_owner;
do $$
begin
  execute 'alter function qik_ingest.enforce_collection_gate() owner to qik_ingest_fn_owner';
  execute 'alter function qik_ingest.require_token(text) owner to qik_ingest_fn_owner';
  execute 'alter function qik_ingest.reject_false_current(text) owner to qik_ingest_fn_owner';
end
$$;

revoke create on schema qik_ingest from qik_ingest_fn_owner;
