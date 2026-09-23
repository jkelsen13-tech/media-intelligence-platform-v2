\set ON_ERROR_STOP on
-- Disposable PG17/Supabase-image qualification only. 002 and 004 remain
-- uninstalled candidates; the prior N3 fixtures run before this extension.
\i /repo/verifier/nie-reconciliation/n3_narrow_worker_extended_native.sql
\i /repo/supabase/qualification/nie-parent-custody/004_exact_page_candidate.sql
create extension if not exists vector;
set search_path = fixture_nie_worker, public;

-- Native NIE vector(384) becomes the article JSON string retained at qik.
create table fixture_exact_page as
with v as (
  select (select ('['||string_agg(case when i=1 then '0.125'
    when i=384 then '-0.5' else '0' end,',' order by i)||']')::vector(384)
    from generate_series(1,384) as g(i)) as embedding
), p as (
  select jsonb_set(jsonb_set(
    (select records->0->'payload' from fixture_article_page),
    '{id}','"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"'::jsonb),
    '{embedding}',to_jsonb(v.embedding::text)) as payload,
    v.embedding from v
)
select jsonb_build_array(jsonb_build_object(
  'source_project_ref','niejaejtbxgakyrsntxm',
  'source_table','articles',
  'source_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'object_family','article',
  'payload',payload,'payload_json',payload::text,
  'source_imported_at',null,'recovery_status',null)) as records,
  embedding::text as vector_text
from p;
grant select on fixture_exact_page to nie_parent_fixture_login;
insert into public.original_source_import_mappings
  (source_project_ref,source_table,source_id,target_id)
values ('niejaejtbxgakyrsntxm','articles',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333');

create table fixture_exact_attack as
select 'nie-exact-foreign'::text as run_id,
  jsonb_build_array(jsonb_set(jsonb_set(jsonb_set(records->0,
    '{source_id}','"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"'::jsonb),
    '{payload,id}','"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"'::jsonb),
    '{payload_json}',to_jsonb(jsonb_set(records->0->'payload','{id}',
      '"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"'::jsonb)::text))) as records
from fixture_exact_page
union all
select 'nie-exact-extra',
  jsonb_build_array(jsonb_set(jsonb_set(records->0,
    '{payload,unapproved_field}','"hidden"'::jsonb),
    '{payload_json}',to_jsonb(jsonb_set(records->0->'payload',
      '{unapproved_field}','"hidden"'::jsonb)::text)))
from fixture_exact_page;
grant select on fixture_exact_attack to nie_parent_fixture_login;

-- The administrator-installed expected rows and keys come from the approved
-- manifest, even when the supplied page hash deliberately matches an attack.
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256,expected_rows,expected_fields)
select 'nie_parent_fixture_login',runs.run_id,'niejaejtbxgakyrsntxm',
  'articles',legacy_graph_staging.fingerprint_payload(
    legacy_graph_staging.prepare_page(runs.records)),1,
  case when runs.run_id='nie-exact-expired' then clock_timestamp()-interval '1 second'
       else clock_timestamp()+interval '20 minutes' end,
  repeat('d',64),
  jsonb_build_array(jsonb_build_object(
    'id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'sha256',legacy_graph_staging.fingerprint_payload(valid.records->0->'payload'))),
  (select to_jsonb(array_agg(k order by k))
     from jsonb_object_keys(valid.records->0->'payload') as keys(k))
from (select 'nie-exact-valid'::text run_id,records from fixture_exact_page
      union all select 'nie-exact-expired',records from fixture_exact_page
      union all select run_id,records from fixture_exact_attack) runs
cross join fixture_exact_page valid;
create table fixture_exact_digest as
select page_sha256 from legacy_graph_staging.nie_parent_page_scope
where run_id='nie-exact-valid';
grant select on fixture_exact_digest to nie_parent_fixture_login;

\connect postgres nie_parent_fixture_login 127.0.0.1
set search_path = fixture_nie_worker, public;
do $$
declare denied boolean;
  run_name text;
  attack jsonb;
begin
  for run_name,attack in
    select run_id,records from fixture_exact_attack
    union all select 'nie-exact-expired',records from fixture_exact_page
  loop
    denied := false;
    begin
      perform legacy_graph_staging.nie_parent_enqueue_scoped(run_name,attack);
    exception when raise_exception then
      denied := SQLERRM like case when run_name='nie-exact-expired'
        then 'nie page outside exact approved worker scope%'
        else 'nie page row or field outside approved manifest%' end;
    end;
    if not denied then raise exception 'unauthorized exact page accepted: %',run_name; end if;
  end loop;
end $$;

begin;
select legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-exact-valid',(select records from fixture_exact_page))->>'job_id'
  as exact_job_id \gset
select legacy_graph_staging.nie_parent_claim_scoped('nie-exact-valid')->>'lease_token'
  as exact_lease \gset
select (legacy_graph_staging.nie_parent_finish_scoped(
  :'exact_job_id'::uuid,:'exact_lease'::uuid,'nie-exact-valid',
  (select page_sha256 from fixture_exact_digest))->>'state')='completed'
  as exact_finished \gset
\if :exact_finished
\else
  \quit 1
\endif
commit;

select (jsonb_array_length(r)=1
  and (r->0->>'source_id')='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and ((r->0->>'payload_json')::jsonb->>'embedding')=
    (select vector_text from fixture_exact_page)
  and length(((r->0->>'payload_json')::jsonb->>'embedding'))-
    length(replace(((r->0->>'payload_json')::jsonb->>'embedding'),',',''))=383
  and ((r->0->>'payload_json')::jsonb->'monoculture')='null'::jsonb
  and ((r->0->>'payload_json')::jsonb#>'{claims,revisions}')='null'::jsonb
  and (r->0->>'payload_sha256')=legacy_graph_staging.fingerprint_payload(
    (select records->0->'payload' from fixture_exact_page))
  and jsonb_array_length(r->0->'versions')=1
  and r->0->'versions'->0->>'origin'='staged_original'
  and r->0->'versions'->0->>'payload_json'=r->0->>'payload_json')
  as exact_vector_null_readback
from (select legacy_graph_staging.nie_parent_readback_run_scoped('nie-exact-valid') r) x \gset
\if :exact_vector_null_readback
\else
  \quit 1
\endif
\connect postgres postgres 127.0.0.1
select (select count(*) from legacy_graph_staging.import_jobs
  where run_id in ('nie-exact-foreign','nie-exact-extra','nie-exact-expired'))=0
  as exact_attacks_left_no_jobs \gset
\if :exact_attacks_left_no_jobs
\else
  \quit 1
\endif
select 'NIE_EXACT_PAGE_NATIVE_PASS' as status;
