\set ON_ERROR_STOP on
-- Synthetic PostgreSQL 17 qualification only. Run in a disposable database.
-- The production staging migration and unchanged installed finish candidate are
-- loaded before the narrow worker candidate; no source rows or live secrets.
-- Relevant native relation columns and constraints from supabase/schema.sql
-- and 20260905151626_mip_consolidation_delta.sql. The update trigger and
-- unrelated public relations are omitted from this source-free fixture.
-- The runner passes one synthetic fixture_password. The disposable server uses
-- localhost password authentication; psql reconnects as the LOGIN itself so
-- session_user proves the intended principal. No production secret is used.
create schema fixture_nie_worker;
set search_path = fixture_nie_worker, public;
create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, label text not null,
  type text not null check (type in ('event','actor','institution','document','anomaly')),
  description text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create table public.original_source_import_mappings (
  source_project_ref text not null, source_table text not null,
  source_id uuid not null, target_id uuid not null,
  source_url text, imported_at timestamptz not null default now(),
  primary key (source_project_ref,source_table,source_id));
alter table public.nodes enable row level security;
alter table public.original_source_import_mappings enable row level security;
\i /repo/supabase/migrations/20260905203600_mip_legacy_graph_private_staging.sql
\i /repo/supabase/qualification/nie-parent-custody/001_scoped_finish.sql
\i /repo/supabase/qualification/nie-parent-custody/002_narrow_worker_candidate.sql

create role nie_parent_fixture_login login noinherit nobypassrls
  password :'fixture_password';
create role nie_parent_foreign_login login noinherit nobypassrls
  password :'fixture_password';
grant connect on database postgres
  to nie_parent_fixture_login, nie_parent_foreign_login;
grant nie_parent_worker_call to nie_parent_fixture_login with inherit true, set false;
grant usage on schema fixture_nie_worker to nie_parent_fixture_login;
create table fixture_page as
select jsonb_build_array(jsonb_build_object(
  'source_project_ref','niejaejtbxgakyrsntxm',
  'source_table','events',
  'source_id','11111111-1111-4111-8111-111111111111',
  'object_family','source_comparison_event',
  'payload',jsonb_build_object(
    'id','11111111-1111-4111-8111-111111111111',
    'canonical_title','Synthetic event', 'occurred_at_start',null,
    'occurred_at_end',null,'location_text',null,'arc_id',null,
    'arc_event_id',null,'status','synthetic','rule_version','v1',
    'created_at','2026-09-23T00:00:00+00:00'),
  'payload_json',jsonb_build_object(
    'id','11111111-1111-4111-8111-111111111111',
    'canonical_title','Synthetic event', 'occurred_at_start',null,
    'occurred_at_end',null,'location_text',null,'arc_id',null,
    'arc_event_id',null,'status','synthetic','rule_version','v1',
    'created_at','2026-09-23T00:00:00+00:00')::text,
  'source_imported_at',null,'recovery_status',null)) as records;
grant select on fixture_page to nie_parent_fixture_login;
create table fixture_digest as
select legacy_graph_staging.fingerprint_payload(
  legacy_graph_staging.prepare_page(records)) as page_sha256 from fixture_page;
grant select on fixture_digest to nie_parent_fixture_login;
create table foreign_page as
select jsonb_build_array(jsonb_set(jsonb_set(jsonb_set(records->0,
  '{source_id}','"66666666-6666-4666-8666-666666666666"'::jsonb),
  '{payload,id}','"66666666-6666-4666-8666-666666666666"'::jsonb),
  '{payload_json}',to_jsonb(jsonb_set(records->0->'payload','{id}',
    '"66666666-6666-4666-8666-666666666666"'::jsonb)::text))) as records
from fixture_page;
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256)
select 'nie_parent_fixture_login','nie-native-fixture-page-1',
  'niejaejtbxgakyrsntxm','events',
  legacy_graph_staging.fingerprint_payload(legacy_graph_staging.prepare_page(records)),
  1,clock_timestamp()+interval '1 hour',repeat('a',64)
from fixture_page;
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256)
select 'nie_parent_foreign_login','nie-foreign-page',
  'niejaejtbxgakyrsntxm','events',
  legacy_graph_staging.fingerprint_payload(legacy_graph_staging.prepare_page(records)),
  1,clock_timestamp()+interval '1 hour',repeat('b',64)
from foreign_page;
-- Admin fixture for a different login. The worker must not see or claim it.
insert into legacy_graph_staging.import_jobs
  (run_id,source_project_ref,source_table,page,page_sha256,page_size,state)
select 'nie-foreign-page','niejaejtbxgakyrsntxm','events',
  legacy_graph_staging.prepare_page(records),
  legacy_graph_staging.fingerprint_payload(legacy_graph_staging.prepare_page(records)),
  1,'completed' from foreign_page;
create table foreign_job_id as
select id from legacy_graph_staging.import_jobs where run_id='nie-foreign-page';
insert into legacy_graph_staging.staged_records
  (job_id,source_project_ref,source_table,source_id,object_family,payload,
   payload_sha256,decision,identity_decision)
select j.id,'niejaejtbxgakyrsntxm','events',
  '66666666-6666-4666-8666-666666666666'::uuid,'source_comparison_event',
  p.records->0->'payload',
  legacy_graph_staging.fingerprint_payload(p.records->0->'payload'),
  'insert_unmapped_identity','insert_unmapped_identity'
from legacy_graph_staging.import_jobs j cross join foreign_page p
where j.run_id='nie-foreign-page';
insert into legacy_graph_staging.payload_versions
  (staged_record_id,source_project_ref,source_table,source_id,ordinal,origin,
   payload,payload_sha256)
select r.id,r.source_project_ref,r.source_table,r.source_id,1,'staged_original',
  r.payload,r.payload_sha256 from legacy_graph_staging.staged_records r
where r.source_id='66666666-6666-4666-8666-666666666666';
grant select on foreign_job_id to nie_parent_fixture_login;
create table own_job_id (id uuid not null);
grant select, insert on own_job_id to nie_parent_fixture_login;

select (not rolbypassrls and not rolsuper) as narrow_executor
from pg_roles where rolname='nie_parent_worker_exec' \gset
\if :narrow_executor
\else
  \quit 1
\endif
select (c.relowner <> 'nie_parent_worker_exec'::regrole
  and c.relrowsecurity) as executor_does_not_own_rls_tables
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='legacy_graph_staging' and c.relname='import_jobs' \gset
\if :executor_does_not_own_rls_tables
\else
  \quit 1
\endif
select (not has_table_privilege('nie_parent_fixture_login',
    'legacy_graph_staging.import_jobs','SELECT,INSERT,UPDATE')
  and not has_function_privilege('nie_parent_fixture_login',
    'legacy_graph_staging.finish_nie_parent_job(uuid,uuid,text,text)','EXECUTE')
  and not has_function_privilege('nie_parent_fixture_login',
    'legacy_graph_staging.enqueue(text,jsonb,jsonb)','EXECUTE')
  and not has_function_privilege('nie_parent_fixture_login',
    'public.mip_legacy_graph_v1(text,jsonb)','EXECUTE')
  and not pg_has_role('nie_parent_fixture_login','nie_parent_worker_exec','MEMBER'))
  as direct_power_denied \gset
\if :direct_power_denied
\else
  \quit 1
\endif

\connect postgres nie_parent_fixture_login 127.0.0.1
set search_path = fixture_nie_worker, public;
select (session_user='nie_parent_fixture_login'
  and current_user='nie_parent_fixture_login') as intended_login \gset
\if :intended_login
\else
  \quit 1
\endif
do $$
declare denied boolean;
begin
  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_enqueue_scoped(
      'nie-foreign-page',(select records from fixture_page));
  exception when others then denied := true; end;
  if not denied then raise exception 'foreign run accepted'; end if;

  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_enqueue_scoped(
      'nie-native-fixture-page-1',
      jsonb_set((select records from fixture_page),'{0,payload,canonical_title}',
        '"changed"'::jsonb));
  exception when others then denied := true; end;
  if not denied then raise exception 'unapproved page accepted'; end if;

  denied := false;
  begin
    perform legacy_graph_staging.claim_job('nie-native-fixture-page-1');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'direct claim helper executable'; end if;

  denied := false;
  begin
    update legacy_graph_staging.import_jobs set state='completed';
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'direct staging DML permitted'; end if;

  denied := false;
  begin
    insert into legacy_graph_staging.nie_parent_page_scope
      (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
       expires_at,approved_manifest_sha256)
    values ('nie_parent_fixture_login','forged','niejaejtbxgakyrsntxm','events',
      repeat('a',64),1,clock_timestamp()+interval '1 hour',repeat('a',64));
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'scope forge permitted'; end if;
end $$;

begin;
select legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-native-fixture-page-1',(select records from fixture_page))->>'job_id' as job_id \gset
insert into own_job_id values (:'job_id'::uuid);
select legacy_graph_staging.nie_parent_claim_scoped('nie-native-fixture-page-1')->>'lease_token' as lease_token \gset
select (legacy_graph_staging.nie_parent_finish_scoped(
  :'job_id'::uuid,:'lease_token'::uuid,'nie-native-fixture-page-1',
  (select page_sha256 from fixture_digest))->>'state')='completed' as finished \gset
\if :finished
\else
  \quit 1
\endif
commit;

-- Separate transaction, same authenticated login. Verify complete private
-- payload and original version, then refusal of unrelated and unknown jobs.
select (jsonb_array_length(r)=1 and r->0->>'source_id'=
  '11111111-1111-4111-8111-111111111111'
  and r->0->>'review_state'='pending'
  and r->0->>'payload_json'=(select records->0->>'payload_json' from fixture_page)
  and jsonb_array_length(r->0->'versions')=1
  and r->0->'versions'->0->>'origin'='staged_original'
  and r->0->'versions'->0->>'payload_json'=
    (select records->0->>'payload_json' from fixture_page)) as post_commit_readback
from (select legacy_graph_staging.nie_parent_readback_scoped(:'job_id'::uuid) r) x \gset
\if :post_commit_readback
\else
  \quit 1
\endif
do $$
declare denied boolean;
  own_job uuid;
begin
  select id into own_job from own_job_id;
  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_claim_scoped('nie-foreign-page');
  exception when others then denied := true; end;
  if not denied then raise exception 'foreign claim accepted'; end if;

  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_readback_scoped(
      (select id from foreign_job_id));
  exception when others then denied := true; end;
  if not denied then raise exception 'foreign job readback accepted'; end if;

  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_readback_scoped(
      '99999999-9999-4999-8999-999999999999');
  exception when others then denied := true; end;
  if not denied then raise exception 'unknown job readback accepted'; end if;

  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_finish_scoped(
      own_job,'99999999-9999-4999-8999-999999999999'::uuid,
      'nie-foreign-page',repeat('a',64));
  exception when others then denied := true; end;
  if not denied then raise exception 'foreign finish accepted'; end if;
end $$;
\connect postgres postgres 127.0.0.1
set search_path = fixture_nie_worker, public;
select 'NIE_NARROW_WORKER_NATIVE_PASS' as status;
