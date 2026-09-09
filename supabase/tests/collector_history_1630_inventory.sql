-- Read-only reconciliation checks. Run source blocks on Manus and destination blocks on survivor.
-- Source: yhbwnrtlqbjtcrrlpbge, newly retained interval.
select clock_timestamp() as observed_at,'ingestion_runs' as relation,count(*) as rows,count(*) filter(where completed_at is null) as unfinished,max(octet_length(to_jsonb(r)::text)) as max_row_bytes, encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by run_id collate "C"),''),'UTF8')),'hex') as digest from public.ingestion_runs r where started_at >= '2026-09-09T12:15:00Z' and started_at < '2026-09-09T16:30:00Z'
union all
select clock_timestamp() as observed_at,'ingestion_source_runs' as relation,count(*) as rows,count(*) filter(where completed_at is null) as unfinished,max(octet_length(to_jsonb(r)::text)) as max_row_bytes, encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by id::text collate "C"),''),'UTF8')),'hex') as digest from public.ingestion_source_runs r where run_id in (select run_id from public.ingestion_runs where started_at >= '2026-09-09T12:15:00Z' and started_at < '2026-09-09T16:30:00Z')
union all
select clock_timestamp() as observed_at,'ingest_sources' as relation,count(*) as rows,0 as unfinished,max(octet_length(to_jsonb(r)::text)) as max_row_bytes, encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by id::text collate "C"),''),'UTF8')),'hex') as digest from public.ingest_sources r where true;

-- Source: complete current scope before the cutoff.
select clock_timestamp() as observed_at,'ingestion_runs' as relation,count(*) as rows,count(*) filter(where completed_at is null) as unfinished,max(octet_length(to_jsonb(r)::text)) as max_row_bytes, encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by run_id collate "C"),''),'UTF8')),'hex') as digest from public.ingestion_runs r where started_at < '2026-09-09T16:30:00Z'
union all
select clock_timestamp() as observed_at,'ingestion_source_runs' as relation,count(*) as rows,count(*) filter(where completed_at is null) as unfinished,max(octet_length(to_jsonb(r)::text)) as max_row_bytes, encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by id::text collate "C"),''),'UTF8')),'hex') as digest from public.ingestion_source_runs r where run_id in (select run_id from public.ingestion_runs where started_at < '2026-09-09T16:30:00Z')
union all
select clock_timestamp() as observed_at,'ingest_sources' as relation,count(*) as rows,0 as unfinished,max(octet_length(to_jsonb(r)::text)) as max_row_bytes, encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by id::text collate "C"),''),'UTF8')),'hex') as digest from public.ingest_sources r where true;

-- Destination: qikvmopbtijoebdqosyq, latest observed retained version per key.
-- These independently timed observations are not an atomic cross-database snapshot.
with latest as (
select distinct on(source_relation,source_key) * from mip_private.collector_row_versions
where source_project='yhbwnrtlqbjtcrrlpbge' order by source_relation,source_key,source_observed_at desc,retained_at desc,payload_hash),
runs as(select * from latest where source_relation='ingestion_runs' and (payload->>'started_at')::timestamptz<'2026-09-09T16:30:00Z'),
scope as(select * from runs union all select * from latest where source_relation='ingestion_source_runs' and payload->>'run_id' in(select source_key from runs) union all select * from latest where source_relation='ingest_sources')
select clock_timestamp() as observed_at,source_relation as relation,count(*) as rows,
encode(sha256(convert_to(coalesce(string_agg(payload_hash,'' order by source_key collate "C"),''),'UTF8')),'hex') as digest from scope group by source_relation;

-- Destination: retained foreign-key provenance completeness.
select
(select count(*) from mip_private.collector_row_versions c where c.source_project='yhbwnrtlqbjtcrrlpbge' and c.source_relation='ingestion_source_runs' and not exists(select 1 from mip_private.collector_row_versions p where p.source_project=c.source_project and p.source_relation='ingestion_runs' and p.source_key=c.payload->>'run_id')) as missing_parent_runs,
(select count(*) from mip_private.collector_row_versions c where c.source_project='yhbwnrtlqbjtcrrlpbge' and c.source_relation='ingestion_source_runs' and not exists(select 1 from mip_private.collector_row_versions p where p.source_project=c.source_project and p.source_relation='ingest_sources' and p.source_key=c.payload->>'ingest_source_id')) as missing_sources,
(select count(*) from(select source_relation,source_key from mip_private.collector_row_versions where source_project='yhbwnrtlqbjtcrrlpbge' group by source_relation,source_key having count(*)>1) v) as keys_with_multiple_versions;
