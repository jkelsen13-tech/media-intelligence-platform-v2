-- SOURCE-FREE QUALIFICATION CANDIDATE. Do not apply to qik without the
-- separately authorized role, scope, credential and custody operation.
-- Requires installed legacy_graph_staging v1 and finish_nie_parent_job.
-- The login is provisioned later. It receives membership ONLY in the call
-- role; it never inherits this executor's table rights or service_role.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create role nie_parent_worker_exec nologin noinherit nobypassrls;
create role nie_parent_worker_call nologin noinherit nobypassrls;

create table legacy_graph_staging.nie_parent_page_scope (
  login_name name not null,
  run_id text not null primary key,
  source_project_ref text not null check (source_project_ref = 'niejaejtbxgakyrsntxm'),
  source_table text not null check (source_table in ('events', 'articles')),
  page_sha256 text not null check (page_sha256 ~ '^[0-9a-f]{64}$'),
  page_size integer not null check (page_size between 1 and 100),
  expires_at timestamptz not null,
  approved_manifest_sha256 text not null check (approved_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
alter table legacy_graph_staging.nie_parent_page_scope enable row level security;
revoke all on legacy_graph_staging.nie_parent_page_scope from public, anon, authenticated, service_role;
grant select on legacy_graph_staging.nie_parent_page_scope to nie_parent_worker_exec;
create policy nie_parent_exec_scope_select on legacy_graph_staging.nie_parent_page_scope
  for select to nie_parent_worker_exec
  using (login_name = session_user and expires_at > clock_timestamp());

grant usage on schema legacy_graph_staging to nie_parent_worker_exec, nie_parent_worker_call;
grant select, insert, update on legacy_graph_staging.import_jobs to nie_parent_worker_exec;
grant select, insert on legacy_graph_staging.staged_records to nie_parent_worker_exec;
grant update (review_state, decision) on legacy_graph_staging.staged_records to nie_parent_worker_exec;
grant select, insert on legacy_graph_staging.record_conflicts,
  legacy_graph_staging.payload_versions, legacy_graph_staging.job_events to nie_parent_worker_exec;
-- No endpoint_checks or other staging table access is needed by scoped finish.
grant select (id) on public.nodes to nie_parent_worker_exec;
create policy nie_parent_node_collision_read on public.nodes
  for select to nie_parent_worker_exec using (true);
grant select (source_project_ref, source_table, source_id, target_id)
  on public.original_source_import_mappings to nie_parent_worker_exec;
create policy nie_parent_mapping_select on public.original_source_import_mappings
  for select to nie_parent_worker_exec
  using (source_project_ref = 'niejaejtbxgakyrsntxm'
    and source_table in ('events', 'articles'));

-- RLS is enforced against the executor, which neither owns these tables nor
-- has BYPASSRLS. session_user remains the authenticated login inside a
-- SECURITY DEFINER wrapper and cannot be changed by SET ROLE or a GUC.
create policy nie_parent_exec_job_select on legacy_graph_staging.import_jobs
  for select to nie_parent_worker_exec using (
    source_project_ref = 'niejaejtbxgakyrsntxm' and source_table in ('events', 'articles')
    and exists (select 1 from legacy_graph_staging.nie_parent_page_scope s
      where s.run_id = import_jobs.run_id and s.source_table = import_jobs.source_table
        and s.page_sha256 = import_jobs.page_sha256 and s.page_size = import_jobs.page_size)
  );
create policy nie_parent_exec_job_insert on legacy_graph_staging.import_jobs
  for insert to nie_parent_worker_exec with check (
    source_project_ref = 'niejaejtbxgakyrsntxm' and source_table in ('events', 'articles')
    and exists (select 1 from legacy_graph_staging.nie_parent_page_scope s
      where s.run_id = import_jobs.run_id and s.source_table = import_jobs.source_table
        and s.page_sha256 = import_jobs.page_sha256 and s.page_size = import_jobs.page_size)
  );
create policy nie_parent_exec_job_update on legacy_graph_staging.import_jobs
  for update to nie_parent_worker_exec
  using (source_project_ref = 'niejaejtbxgakyrsntxm' and exists (
    select 1 from legacy_graph_staging.nie_parent_page_scope s
    where s.run_id = import_jobs.run_id and s.source_table = import_jobs.source_table
      and s.page_sha256 = import_jobs.page_sha256 and s.page_size = import_jobs.page_size))
  with check (source_project_ref = 'niejaejtbxgakyrsntxm' and exists (
    select 1 from legacy_graph_staging.nie_parent_page_scope s
    where s.run_id = import_jobs.run_id and s.source_table = import_jobs.source_table
      and s.page_sha256 = import_jobs.page_sha256 and s.page_size = import_jobs.page_size));

create policy nie_parent_exec_staged_select on legacy_graph_staging.staged_records
  for select to nie_parent_worker_exec using (
    source_project_ref = 'niejaejtbxgakyrsntxm' and source_table in ('events', 'articles')
    and exists (select 1 from legacy_graph_staging.import_jobs j where j.id = job_id));
create policy nie_parent_exec_staged_insert on legacy_graph_staging.staged_records
  for insert to nie_parent_worker_exec with check (
    source_project_ref = 'niejaejtbxgakyrsntxm' and source_table in ('events', 'articles')
    and exists (select 1 from legacy_graph_staging.import_jobs j where j.id = job_id
      and j.source_table = staged_records.source_table));
create policy nie_parent_exec_staged_update on legacy_graph_staging.staged_records
  for update to nie_parent_worker_exec
  using (source_project_ref = 'niejaejtbxgakyrsntxm' and exists (
    select 1 from legacy_graph_staging.import_jobs j where j.id = job_id))
  with check (source_project_ref = 'niejaejtbxgakyrsntxm' and exists (
    select 1 from legacy_graph_staging.import_jobs j where j.id = job_id));

create policy nie_parent_exec_conflict_select on legacy_graph_staging.record_conflicts
  for select to nie_parent_worker_exec using (
    source_project_ref = 'niejaejtbxgakyrsntxm' and source_table in ('events', 'articles')
    and exists (select 1 from legacy_graph_staging.nie_parent_page_scope s
      where s.run_id = record_conflicts.run_id and s.source_table = record_conflicts.source_table));
create policy nie_parent_exec_conflict_insert on legacy_graph_staging.record_conflicts
  for insert to nie_parent_worker_exec with check (
    source_project_ref = 'niejaejtbxgakyrsntxm' and source_table in ('events', 'articles')
    and exists (select 1 from legacy_graph_staging.nie_parent_page_scope s
      where s.run_id = record_conflicts.run_id and s.source_table = record_conflicts.source_table));
create policy nie_parent_exec_version_select on legacy_graph_staging.payload_versions
  for select to nie_parent_worker_exec using (
    source_project_ref = 'niejaejtbxgakyrsntxm' and source_table in ('events', 'articles')
    and exists (select 1 from legacy_graph_staging.staged_records r
      where r.id = staged_record_id and r.source_id = payload_versions.source_id));
create policy nie_parent_exec_version_insert on legacy_graph_staging.payload_versions
  for insert to nie_parent_worker_exec with check (
    source_project_ref = 'niejaejtbxgakyrsntxm' and source_table in ('events', 'articles')
    and exists (select 1 from legacy_graph_staging.staged_records r
      where r.id = staged_record_id and r.source_id = payload_versions.source_id));
create policy nie_parent_exec_event_select on legacy_graph_staging.job_events
  for select to nie_parent_worker_exec using (
    exists (select 1 from legacy_graph_staging.import_jobs j where j.id = job_id));
create policy nie_parent_exec_event_insert on legacy_graph_staging.job_events
  for insert to nie_parent_worker_exec with check (
    exists (select 1 from legacy_graph_staging.import_jobs j where j.id = job_id));

-- Exact invoker dependency closure. Do not grant validate_endpoints,
-- finish_job, fail_job, status, manifest or public.mip_legacy_graph_v1.
grant execute on function legacy_graph_staging.canonical_number_es(double precision),
  legacy_graph_staging.canonical_number(jsonb),
  legacy_graph_staging.canonical_json(jsonb),
  legacy_graph_staging.fingerprint_payload(jsonb),
  legacy_graph_staging.verified_digest(jsonb,text),
  legacy_graph_staging.object_family(text,jsonb),
  legacy_graph_staging.lookup_mapping_target(text,text,uuid,jsonb,uuid),
  legacy_graph_staging.family_collision(text,uuid),
  legacy_graph_staging.public_graph_row(text,uuid),
  legacy_graph_staging.public_graph_collision(text,uuid,text,jsonb),
  legacy_graph_staging.record_conflict(text,text,text,uuid,uuid,text,text,text,text[],jsonb),
  legacy_graph_staging.append_payload_version(uuid,uuid,uuid,text,text,uuid,text,jsonb,text),
  legacy_graph_staging.stage_record(uuid,text,jsonb),
  legacy_graph_staging.prepare_page(jsonb),
  legacy_graph_staging.job_results(uuid,jsonb,jsonb),
  legacy_graph_staging.enqueue(text,jsonb,jsonb),
  legacy_graph_staging.claim_job(text),
  legacy_graph_staging.finish_nie_parent_job(uuid,uuid,text,text)
  to nie_parent_worker_exec;

-- PostgreSQL requires the new owner to have CREATE on the schema during an
-- ownership transfer. Remove it in this same transaction before any login can
-- execute the wrappers.
grant create on schema legacy_graph_staging to nie_parent_worker_exec;

create function legacy_graph_staging.nie_parent_enqueue_scoped(p_run text, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare prepared jsonb;
  digest text;
  page_table text;
  rec jsonb;
begin
  prepared := legacy_graph_staging.prepare_page(p_records);
  digest := legacy_graph_staging.fingerprint_payload(prepared);
  page_table := prepared->0->>'source_table';
  if not exists (select 1 from legacy_graph_staging.nie_parent_page_scope s
      where s.run_id = p_run and s.page_sha256 = digest
        and s.page_size = jsonb_array_length(prepared) and s.source_table = page_table) then
    raise exception 'nie page outside approved worker scope';
  end if;
  for rec in select value from jsonb_array_elements(prepared) as r(value) loop
    if rec->>'source_project_ref' is distinct from 'niejaejtbxgakyrsntxm'
       or rec->>'source_table' is distinct from page_table then
      raise exception 'nie page mixed source';
    end if;
  end loop;
  return legacy_graph_staging.enqueue(p_run, p_records, '[]'::jsonb);
end $$;

create function legacy_graph_staging.nie_parent_claim_scoped(p_run text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job jsonb;
begin
  if not exists (select 1 from legacy_graph_staging.nie_parent_page_scope s
      where s.run_id = p_run) then
    raise exception 'nie run outside approved worker scope';
  end if;
  job := legacy_graph_staging.claim_job(p_run);
  if job is not null and not exists (
    select 1 from legacy_graph_staging.nie_parent_page_scope s
    where s.run_id = job->>'run_id' and s.page_sha256 = job->>'page_sha256'
      and s.source_table = job->>'source_table') then
    raise exception 'nie claim outside approved worker scope';
  end if;
  return job;
end $$;

create function legacy_graph_staging.nie_parent_finish_scoped(
  p_job uuid, p_token uuid, p_run text, p_page_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from legacy_graph_staging.import_jobs j
    join legacy_graph_staging.nie_parent_page_scope s
      on s.run_id = j.run_id and s.page_sha256 = j.page_sha256
    where j.id = p_job and j.run_id = p_run and j.page_sha256 = p_page_sha256
      and j.source_project_ref = 'niejaejtbxgakyrsntxm') then
    raise exception 'nie job outside approved worker scope';
  end if;
  return legacy_graph_staging.finish_nie_parent_job(p_job,p_token,p_run,p_page_sha256);
end $$;

create function legacy_graph_staging.nie_parent_readback_scoped(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select 1 from legacy_graph_staging.import_jobs j
    join legacy_graph_staging.nie_parent_page_scope s
      on s.run_id = j.run_id and s.page_sha256 = j.page_sha256
    where j.id = p_job and j.state = 'completed'
      and j.source_project_ref = 'niejaejtbxgakyrsntxm') then
    raise exception 'nie readback outside completed worker scope';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_project_ref', r.source_project_ref, 'source_table', r.source_table,
    'source_id', r.source_id, 'payload_json', r.payload::text,
    'payload_sha256', r.payload_sha256, 'review_state', r.review_state,
    'versions', coalesce(v.versions,'[]'::jsonb)) order by page.ord), '[]'::jsonb)
    into result
  from legacy_graph_staging.import_jobs j
  cross join lateral jsonb_array_elements(j.page) with ordinality as page(rec,ord)
  join legacy_graph_staging.staged_records r
    on r.source_project_ref = page.rec->>'source_project_ref'
   and r.source_table = page.rec->>'source_table'
   and r.source_id = (page.rec->>'source_id')::uuid
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'source_project_ref',v.source_project_ref,'source_table',v.source_table,
      'source_id',v.source_id,'payload_json',v.payload::text,
      'payload_sha256',v.payload_sha256,'origin',v.origin) order by v.ordinal) as versions
    from legacy_graph_staging.payload_versions v where v.staged_record_id = r.id
  ) v on true
  where j.id = p_job;
  return result;
end $$;

create function legacy_graph_staging.nie_parent_readback_run_scoped(p_run text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare job_id uuid;
begin
  select j.id into job_id from legacy_graph_staging.import_jobs j
  join legacy_graph_staging.nie_parent_page_scope s
    on s.run_id=j.run_id and s.page_sha256=j.page_sha256
  where j.run_id=p_run and j.state='completed';
  if job_id is null then raise exception 'nie run outside completed worker scope'; end if;
  return legacy_graph_staging.nie_parent_readback_scoped(job_id);
end $$;

-- Set the exact call surface while the installer still owns the wrappers.
-- A non-super installer cannot change their ACL after transferring ownership.
revoke all on function legacy_graph_staging.nie_parent_enqueue_scoped(text,jsonb),
  legacy_graph_staging.nie_parent_claim_scoped(text),
  legacy_graph_staging.nie_parent_finish_scoped(uuid,uuid,text,text),
  legacy_graph_staging.nie_parent_readback_scoped(uuid),
  legacy_graph_staging.nie_parent_readback_run_scoped(text)
  from public, anon, authenticated, service_role;
grant execute on function legacy_graph_staging.nie_parent_enqueue_scoped(text,jsonb),
  legacy_graph_staging.nie_parent_claim_scoped(text),
  legacy_graph_staging.nie_parent_finish_scoped(uuid,uuid,text,text),
  legacy_graph_staging.nie_parent_readback_scoped(uuid),
  legacy_graph_staging.nie_parent_readback_run_scoped(text)
  to nie_parent_worker_call;

-- PostgreSQL 17 requires the installer to be able to SET ROLE to the new
-- function owner and that owner to have CREATE on its schema at transfer.
-- Role creators may already have ADMIN membership with SET disabled; grant
-- only temporary SET capability and remove that option before commit.
do $$ begin
  if current_setting('is_superuser') <> 'on'
      and pg_has_role(current_user, 'nie_parent_worker_exec', 'SET') then
    raise exception 'installer unexpectedly could SET ROLE NIE executor';
  end if;
end $$;
grant nie_parent_worker_exec to current_user with inherit false, set true;
grant create on schema legacy_graph_staging to nie_parent_worker_exec;
alter function legacy_graph_staging.nie_parent_enqueue_scoped(text,jsonb) owner to nie_parent_worker_exec;
alter function legacy_graph_staging.nie_parent_claim_scoped(text) owner to nie_parent_worker_exec;
alter function legacy_graph_staging.nie_parent_finish_scoped(uuid,uuid,text,text) owner to nie_parent_worker_exec;
alter function legacy_graph_staging.nie_parent_readback_scoped(uuid) owner to nie_parent_worker_exec;
alter function legacy_graph_staging.nie_parent_readback_run_scoped(text) owner to nie_parent_worker_exec;
revoke create on schema legacy_graph_staging from nie_parent_worker_exec;
revoke set option for nie_parent_worker_exec from current_user;
do $$ begin
  if current_setting('is_superuser') <> 'on'
      and (pg_has_role(current_user, 'nie_parent_worker_exec', 'SET')
        or pg_has_role(current_user, 'nie_parent_worker_exec', 'USAGE')) then
    raise exception 'installer retained effective NIE executor rights';
  end if;
  if has_schema_privilege('nie_parent_worker_exec',
      'legacy_graph_staging', 'CREATE') then
    raise exception 'NIE executor retained schema CREATE';
  end if;
end $$;
comment on table legacy_graph_staging.nie_parent_page_scope is
  'Administrator-only exact page authorization; populate after separate source snapshot qualification and owner approval.';
commit;
