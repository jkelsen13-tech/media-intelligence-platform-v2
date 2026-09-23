\set ON_ERROR_STOP on
-- Source-free extension of the narrow destination-worker native fixture.
-- Run with psql against one disposable PostgreSQL 17 database as postgres.
-- The base fixture installs the real private staging migration, installed
-- finish definition, and candidate; this file does not target qik.
\i /repo/verifier/nie-reconciliation/n3_narrow_worker_native.sql

-- The N2 article payload has exactly 28 keys. Retain JSON null, an exact
-- decimal, and Unicode through the first stage and a separate readback call.
create temporary table fixture_article_page as
select jsonb_build_array(jsonb_build_object(
  'source_project_ref','niejaejtbxgakyrsntxm',
  'source_table','articles',
  'source_id','22222222-2222-4222-8222-222222222222',
  'object_family','article',
  'payload',payload,
  'payload_json',payload::text,
  'source_imported_at',null,'recovery_status',null)) as records
from (select jsonb_build_object(
  'arc_assign_attempted_at',null,'arc_assignment_evidence',
    jsonb_build_object('score',0.12345678901234567890::numeric,'note','Αθήνα 🛰'),
  'arc_id',null,'author_id',null,'body_text','Synthetic body 雪 🛰',
  'claims',jsonb_build_array(jsonb_build_object('weight',0.000000000000000001::numeric)),
  'different_causal_chain',false,'embedding','[0.125,-0.0000001]',
  'entities_extracted_at',null,'feed',null,'fetched_at',null,
  'id','22222222-2222-4222-8222-222222222222',
  'image_alt',null,'image_url',null,'ingestion_run_id',null,
  'is_digest',false,'monoculture',null,'outlet','Synthetic source',
  'outlet_id',null,'published_at','2026-09-23T01:02:03+00:00',
  'source_status','pending','source_status_changed_at',null,
  'source_status_note',null,'summary','Unicode Αθήνα 雪',
  'title','Synthetic article','unattributed',null,
  'url','https://example.invalid/synthetic','is_pre_ruling',false
  ) as payload) p;
grant select on fixture_article_page to nie_parent_fixture_login;
create temporary table fixture_article_digest as
select legacy_graph_staging.fingerprint_payload(
    legacy_graph_staging.prepare_page(records)) as page_sha256,
  legacy_graph_staging.fingerprint_payload(records->0->'payload')
    as payload_sha256
from fixture_article_page;
grant select on fixture_article_digest to nie_parent_fixture_login;
select ((select count(*) from jsonb_object_keys(records->0->'payload'))=28)
  as article_exact_field_count
from fixture_article_page \gset
\if :article_exact_field_count
\else
  \quit 1
\endif

-- This mapping is source-qualified. The worker may read it through its RLS
-- policy but cannot create, update, or see another source's mapping.
insert into public.original_source_import_mappings
  (source_project_ref,source_table,source_id,target_id)
values ('niejaejtbxgakyrsntxm','articles',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333');
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256)
select 'nie_parent_fixture_login','nie-article-original',
  'niejaejtbxgakyrsntxm','articles',
  legacy_graph_staging.fingerprint_payload(
    legacy_graph_staging.prepare_page(records)),1,
  clock_timestamp()+interval '1 hour',repeat('c',64)
from fixture_article_page;

set session authorization nie_parent_fixture_login;
begin;
select legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-article-original',(select records from fixture_article_page))->>'job_id'
  as article_job_id \gset
create temporary table fixture_article_job (id uuid not null);
insert into fixture_article_job values (:'article_job_id'::uuid);
select legacy_graph_staging.nie_parent_claim_scoped('nie-article-original')->>'lease_token'
  as article_lease \gset
do $$
declare denied boolean := false;
begin
  begin
    perform legacy_graph_staging.nie_parent_finish_scoped(
      (select id from fixture_article_job),
      '99999999-9999-4999-8999-999999999999'::uuid,
      'nie-article-original',
      (select page_sha256 from fixture_article_digest));
  exception when raise_exception then
    denied := SQLERRM like 'invalid or expired nie parent job lease%';
  end;
  if not denied then raise exception 'wrong lease finished own job'; end if;
end $$;
select (legacy_graph_staging.nie_parent_finish_scoped(
  :'article_job_id'::uuid,:'article_lease'::uuid,'nie-article-original',
  (select page_sha256 from fixture_article_digest))->>'state')='completed'
  as article_finished \gset
\if :article_finished
\else
  \quit 1
\endif
commit;

-- Lost acknowledgement: a fresh transaction with the same login recovers
-- exact completed content, version origin, decimal and digest. A retry of the
-- same run is idempotent and does not create a second job or version.
select (jsonb_array_length(r)=1
  and (r->0->>'source_id')='22222222-2222-4222-8222-222222222222'
  and (r->0->>'review_state')='pending'
  and (r->0->>'payload_json')=(select records->0->>'payload_json'
                                      from fixture_article_page)
  and (r->0->>'payload_sha256')=(select payload_sha256
       from fixture_article_digest)
  and (r->0->>'payload_json') like '%Αθήνα%'
  and (((r->0->>'payload_json')::jsonb #>>
       '{arc_assignment_evidence,score}')::numeric)=0.12345678901234567890::numeric
  and jsonb_array_length(r->0->'versions')=1
  and r->0->'versions'->0->>'origin'='staged_original'
  and r->0->'versions'->0->>'payload_sha256'=r->0->>'payload_sha256'
  and r->0->'versions'->0->>'payload_json'=r->0->>'payload_json')
  as article_postcommit_exact
from (select legacy_graph_staging.nie_parent_readback_scoped(
  :'article_job_id'::uuid) r) x \gset
\if :article_postcommit_exact
\else
  \quit 1
\endif
select ((legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-article-original',(select records from fixture_article_page))->>'job_id')
    = :'article_job_id'
  and (legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-article-original',(select records from fixture_article_page))
    ->>'already_completed')='true') as exact_run_replay \gset
\if :exact_run_replay
\else
  \quit 1
\endif
reset session authorization;
select (proposed_target_id='33333333-3333-4333-8333-333333333333'::uuid)
  as source_qualified_mapping_used
from legacy_graph_staging.staged_records
where source_project_ref='niejaejtbxgakyrsntxm'
  and source_table='articles'
  and source_id='22222222-2222-4222-8222-222222222222' \gset
\if :source_qualified_mapping_used
\else
  \quit 1
\endif
select (count(*)=1) as one_original_article_version
from legacy_graph_staging.payload_versions
where source_project_ref='niejaejtbxgakyrsntxm'
  and source_table='articles'
  and source_id='22222222-2222-4222-8222-222222222222' \gset
\if :one_original_article_version
\else
  \quit 1
\endif

-- A distinct approved run may deliver the same source identity and content.
-- It reuses the staged row without manufacturing another retained version.
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256)
select 'nie_parent_fixture_login','nie-article-same-identity',
  'niejaejtbxgakyrsntxm','articles',
  (select page_sha256 from fixture_article_digest),1,
  clock_timestamp()+interval '1 hour',repeat('8',64);
set session authorization nie_parent_fixture_login;
begin;
select legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-article-same-identity',(select records from fixture_article_page))
  ->>'job_id' as same_job_id \gset
select legacy_graph_staging.nie_parent_claim_scoped('nie-article-same-identity')
  ->>'lease_token' as same_lease \gset
select ((legacy_graph_staging.nie_parent_finish_scoped(
  :'same_job_id'::uuid,:'same_lease'::uuid,'nie-article-same-identity',
  (select page_sha256 from fixture_article_digest))
    ->'results'->0->>'replayed')='true') as same_identity_replayed \gset
\if :same_identity_replayed
\else
  \quit 1
\endif
commit;
reset session authorization;
select (count(*)=1) as same_identity_added_no_version
from legacy_graph_staging.payload_versions
where source_project_ref='niejaejtbxgakyrsntxm'
  and source_table='articles'
  and source_id='22222222-2222-4222-8222-222222222222' \gset
\if :same_identity_added_no_version
\else
  \quit 1
\endif

-- A new approved run for the same source-qualified identity with changed
-- content must preserve the original and link a quarantined incoming version.
create temporary table fixture_article_changed as
select jsonb_build_array(jsonb_set(jsonb_set(records->0,
  '{payload,title}','"Changed synthetic article"'::jsonb),
  '{payload_json}',to_jsonb(jsonb_set(records->0->'payload',
    '{title}','"Changed synthetic article"'::jsonb)::text))) as records
from fixture_article_page;
grant select on fixture_article_changed to nie_parent_fixture_login;
create temporary table fixture_changed_digest as
select legacy_graph_staging.fingerprint_payload(
  legacy_graph_staging.prepare_page(records)) as page_sha256
from fixture_article_changed;
grant select on fixture_changed_digest to nie_parent_fixture_login;
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256)
select 'nie_parent_fixture_login','nie-article-changed',
  'niejaejtbxgakyrsntxm','articles',
  legacy_graph_staging.fingerprint_payload(
    legacy_graph_staging.prepare_page(records)),1,
  clock_timestamp()+interval '1 hour',repeat('d',64)
from fixture_article_changed;
set session authorization nie_parent_fixture_login;
begin;
select legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-article-changed',(select records from fixture_article_changed))->>'job_id'
  as changed_job_id \gset
select legacy_graph_staging.nie_parent_claim_scoped('nie-article-changed')->>'lease_token'
  as changed_lease \gset
select (legacy_graph_staging.nie_parent_finish_scoped(
  :'changed_job_id'::uuid,:'changed_lease'::uuid,'nie-article-changed',
  (select page_sha256 from fixture_changed_digest))
    ->'results'->0->>'decision')='identical_id_divergent_content'
  as changed_quarantined \gset
\if :changed_quarantined
\else
  \quit 1
\endif
commit;
reset session authorization;
select (count(*)=1) as one_staged_identity
from legacy_graph_staging.staged_records
where source_project_ref='niejaejtbxgakyrsntxm'
  and source_table='articles'
  and source_id='22222222-2222-4222-8222-222222222222' \gset
\if :one_staged_identity
\else
  \quit 1
\endif
select (count(*)=2 and min(ordinal)=1 and max(ordinal)=2
  and count(*) filter (where origin='staged_original')=1
  and count(*) filter (where origin='incoming_divergent')=1)
  as version_lineage_retained
from legacy_graph_staging.payload_versions
where source_project_ref='niejaejtbxgakyrsntxm'
  and source_table='articles'
  and source_id='22222222-2222-4222-8222-222222222222' \gset
\if :version_lineage_retained
\else
  \quit 1
\endif

select 'NIE_NARROW_WORKER_EXTENDED_PART1_PASS' as status;

-- The node ID collision path must preserve the Source Comparison event as
-- quarantined rather than misidentify it as a graph node. The base fixture's
-- public.nodes structure is a narrow synthetic dependency-path fixture; the
-- production node DDL and effective policies remain a separate catalog gate.
insert into public.nodes(id)
values ('77777777-7777-4777-8777-777777777777');
create temporary table fixture_collision_page as
select jsonb_build_array(jsonb_set(jsonb_set(jsonb_set(records->0,
  '{source_id}','"77777777-7777-4777-8777-777777777777"'::jsonb),
  '{payload,id}','"77777777-7777-4777-8777-777777777777"'::jsonb),
  '{payload_json}',to_jsonb(jsonb_set(records->0->'payload','{id}',
    '"77777777-7777-4777-8777-777777777777"'::jsonb)::text))) as records
from fixture_page;
grant select on fixture_collision_page to nie_parent_fixture_login;
create temporary table fixture_collision_digest as
select legacy_graph_staging.fingerprint_payload(
  legacy_graph_staging.prepare_page(records)) as page_sha256
from fixture_collision_page;
grant select on fixture_collision_digest to nie_parent_fixture_login;
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256)
select 'nie_parent_fixture_login','nie-event-node-collision',
  'niejaejtbxgakyrsntxm','events',
  legacy_graph_staging.fingerprint_payload(
    legacy_graph_staging.prepare_page(records)),1,
  clock_timestamp()+interval '1 hour',repeat('e',64)
from fixture_collision_page;
set session authorization nie_parent_fixture_login;
begin;
select legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-event-node-collision',(select records from fixture_collision_page))
  ->>'job_id' as collision_job_id \gset
select legacy_graph_staging.nie_parent_claim_scoped('nie-event-node-collision')
  ->>'lease_token' as collision_lease \gset
select (legacy_graph_staging.nie_parent_finish_scoped(
  :'collision_job_id'::uuid,:'collision_lease'::uuid,
  'nie-event-node-collision',
  (select page_sha256 from fixture_collision_digest))
    ->'results'->0->>'decision')='event_family_not_interchangeable'
  as collision_quarantined \gset
\if :collision_quarantined
\else
  \quit 1
\endif
commit;
select ((r->0->>'review_state')='quarantined'
  and (r->0->>'source_table')='events'
  and (r->0->>'source_id')='77777777-7777-4777-8777-777777777777')
  as collision_readback_private
from (select legacy_graph_staging.nie_parent_readback_scoped(
  :'collision_job_id'::uuid) r) x \gset
\if :collision_readback_private
\else
  \quit 1
\endif
reset session authorization;

-- An interrupted page transaction rolls back its enqueue, claim, stage,
-- version and completion together. It is safe to retry from the frozen source
-- snapshot; the worker cannot mistake an uncommitted page for preserved data.
create temporary table fixture_rollback_page as
select jsonb_build_array(jsonb_set(jsonb_set(jsonb_set(records->0,
  '{source_id}','"88888888-8888-4888-8888-888888888888"'::jsonb),
  '{payload,id}','"88888888-8888-4888-8888-888888888888"'::jsonb),
  '{payload_json}',to_jsonb(jsonb_set(records->0->'payload','{id}',
    '"88888888-8888-4888-8888-888888888888"'::jsonb)::text))) as records
from fixture_article_page;
grant select on fixture_rollback_page to nie_parent_fixture_login;
create temporary table fixture_rollback_digest as
select legacy_graph_staging.fingerprint_payload(
  legacy_graph_staging.prepare_page(records)) as page_sha256
from fixture_rollback_page;
grant select on fixture_rollback_digest to nie_parent_fixture_login;
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256)
select 'nie_parent_fixture_login','nie-rollback-page',
  'niejaejtbxgakyrsntxm','articles',
  legacy_graph_staging.fingerprint_payload(
    legacy_graph_staging.prepare_page(records)),1,
  clock_timestamp()+interval '1 hour',repeat('f',64)
from fixture_rollback_page;
set session authorization nie_parent_fixture_login;
begin;
select legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-rollback-page',(select records from fixture_rollback_page))
  ->>'job_id' as rollback_job_id \gset
select legacy_graph_staging.nie_parent_claim_scoped('nie-rollback-page')
  ->>'lease_token' as rollback_lease \gset
select (legacy_graph_staging.nie_parent_finish_scoped(
  :'rollback_job_id'::uuid,:'rollback_lease'::uuid,'nie-rollback-page',
  (select page_sha256 from fixture_rollback_digest))->>'state')='completed'
  as rollback_inside_transaction_complete \gset
\if :rollback_inside_transaction_complete
\else
  \quit 1
\endif
rollback;
reset session authorization;
select (not exists(select 1 from legacy_graph_staging.import_jobs
     where run_id='nie-rollback-page')
  and not exists(select 1 from legacy_graph_staging.staged_records
     where source_project_ref='niejaejtbxgakyrsntxm'
       and source_table='articles'
       and source_id='88888888-8888-4888-8888-888888888888')
  and not exists(select 1 from legacy_graph_staging.payload_versions
     where source_project_ref='niejaejtbxgakyrsntxm'
       and source_table='articles'
       and source_id='88888888-8888-4888-8888-888888888888'))
  as rollback_cleared_every_effect \gset
\if :rollback_cleared_every_effect
\else
  \quit 1
\endif

-- Expiry and administrative revocation both close a previously established
-- login's scoped readback. They do not alter the completed historical rows.
update legacy_graph_staging.nie_parent_page_scope
set expires_at=clock_timestamp()-interval '1 second'
where run_id='nie-event-node-collision';
delete from legacy_graph_staging.nie_parent_page_scope
where run_id='nie-article-original';
create temporary table fixture_denial_ids as
select 'article'::text kind,:'article_job_id'::uuid id
union all select 'collision',:'collision_job_id'::uuid;
grant select on fixture_denial_ids to nie_parent_fixture_login;
set session authorization nie_parent_fixture_login;
do $$
declare denied boolean;
begin
  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_readback_scoped(
      (select id from fixture_denial_ids where kind='collision'));
  exception when raise_exception then
    denied := SQLERRM = 'nie readback outside completed worker scope';
  end;
  if not denied then raise exception 'expired scope permitted completed readback'; end if;

  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_readback_scoped(
      (select id from fixture_denial_ids where kind='article'));
  exception when raise_exception then
    denied := SQLERRM = 'nie readback outside completed worker scope';
  end;
  if not denied then raise exception 'revoked scope permitted completed readback'; end if;

  denied := false;
  begin
    perform legacy_graph_staging.nie_parent_claim_scoped('nie-event-node-collision');
  exception when raise_exception then
    denied := SQLERRM = 'nie run outside approved worker scope';
  end;
  if not denied then raise exception 'expired scope permitted claim'; end if;
end $$;
reset session authorization;
select (count(*)=2) as historical_article_versions_preserved_after_revoke
from legacy_graph_staging.payload_versions
where source_project_ref='niejaejtbxgakyrsntxm'
  and source_table='articles'
  and source_id='22222222-2222-4222-8222-222222222222' \gset
\if :historical_article_versions_preserved_after_revoke
\else
  \quit 1
\endif

-- An overlapping later run whose original staged identity is controlled by
-- an expired/revoked earlier scope must fail closed. It cannot treat the
-- hidden row as absent, overwrite it, or disclose its historical versions.
create temporary table fixture_overlap_page as
select jsonb_build_array(jsonb_set(jsonb_set(records->0,
  '{payload,title}','"Third synthetic article"'::jsonb),
  '{payload_json}',to_jsonb(jsonb_set(records->0->'payload',
    '{title}','"Third synthetic article"'::jsonb)::text))) as records
from fixture_article_page;
grant select on fixture_overlap_page to nie_parent_fixture_login;
create temporary table fixture_overlap_digest as
select legacy_graph_staging.fingerprint_payload(
  legacy_graph_staging.prepare_page(records)) as page_sha256
from fixture_overlap_page;
grant select on fixture_overlap_digest to nie_parent_fixture_login;
insert into legacy_graph_staging.nie_parent_page_scope
  (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
   expires_at,approved_manifest_sha256)
select 'nie_parent_fixture_login','nie-article-overlap',
  'niejaejtbxgakyrsntxm','articles',
  legacy_graph_staging.fingerprint_payload(
    legacy_graph_staging.prepare_page(records)),1,
  clock_timestamp()+interval '1 hour',repeat('9',64)
from fixture_overlap_page;
set session authorization nie_parent_fixture_login;
begin;
select legacy_graph_staging.nie_parent_enqueue_scoped(
  'nie-article-overlap',(select records from fixture_overlap_page))
  ->>'job_id' as overlap_job_id \gset
select legacy_graph_staging.nie_parent_claim_scoped('nie-article-overlap')
  ->>'lease_token' as overlap_lease \gset
create temporary table fixture_overlap_job as
select :'overlap_job_id'::uuid id,:'overlap_lease'::uuid lease;
do $$
declare denied boolean := false;
begin
  begin
    perform legacy_graph_staging.nie_parent_finish_scoped(
      (select id from fixture_overlap_job),
      (select lease from fixture_overlap_job),
      'nie-article-overlap',
      (select page_sha256 from fixture_overlap_digest));
  exception when unique_violation then
    denied := true;
  end;
  if not denied then raise exception 'expired original scope allowed overlapping identity'; end if;
end $$;
rollback;
reset session authorization;
select (not exists(select 1 from legacy_graph_staging.import_jobs
     where run_id='nie-article-overlap')
  and (select count(*) from legacy_graph_staging.payload_versions
     where source_project_ref='niejaejtbxgakyrsntxm'
       and source_table='articles'
       and source_id='22222222-2222-4222-8222-222222222222')=2)
  as overlap_failure_left_history_intact \gset
\if :overlap_failure_left_history_intact
\else
  \quit 1
\endif

-- Negative probes may raise correctly yet still leave unwanted side effects.
-- Compare final deterministic counts, source IDs and payload digests.
select (
  (select count(*) from legacy_graph_staging.import_jobs
   where run_id in ('nie-article-original','nie-article-same-identity',
     'nie-article-changed','nie-event-node-collision',
     'nie-rollback-page','nie-article-overlap'))=4
  and (select count(*) from legacy_graph_staging.staged_records
   where source_project_ref='niejaejtbxgakyrsntxm'
     and source_table='articles'
     and source_id in ('22222222-2222-4222-8222-222222222222'::uuid,
       '88888888-8888-4888-8888-888888888888'::uuid))=1
  and (select payload_sha256 from legacy_graph_staging.staged_records
   where source_project_ref='niejaejtbxgakyrsntxm'
     and source_table='articles'
     and source_id='22222222-2222-4222-8222-222222222222')
       =(select payload_sha256 from fixture_article_digest)
  and (select count(*) from legacy_graph_staging.payload_versions
   where source_project_ref='niejaejtbxgakyrsntxm'
     and source_table='articles'
     and source_id='22222222-2222-4222-8222-222222222222')=2
  and (select count(*) from legacy_graph_staging.record_conflicts
   where source_project_ref='niejaejtbxgakyrsntxm'
     and source_table='articles'
     and source_id='22222222-2222-4222-8222-222222222222'
     and conflict_kind='identical_id_divergent_content')=1
  and (select count(*) from legacy_graph_staging.staged_records
   where source_project_ref='niejaejtbxgakyrsntxm'
     and source_table='events'
     and source_id='77777777-7777-4777-8777-777777777777')=1
) as all_postnegative_effects_bounded \gset
\if :all_postnegative_effects_bounded
\else
  \quit 1
\endif

select 'NIE_NARROW_WORKER_EXTENDED_NATIVE_PASS' as status;
