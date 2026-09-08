-- Read-only on Manus yhbwnrtlqbjtcrrlpbge; bounded 2026-09-08 transfer verification.
select 'ingestion_runs' as relation,count(*) as rows,max(length(run_id)) as max_key_length,max(octet_length(to_jsonb(r)::text)) as max_row_bytes,
encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by run_id collate "C"),''),'UTF8')),'hex') as digest
from public.ingestion_runs r where started_at < '2026-09-08T17:50:00Z'
union all
select 'ingestion_source_runs',count(*),null,max(octet_length(to_jsonb(r)::text)),
encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by id::text collate "C"),''),'UTF8')),'hex')
from public.ingestion_source_runs r where run_id in(select run_id from public.ingestion_runs where started_at < '2026-09-08T17:50:00Z')
union all
select 'ingest_sources',count(*),null,max(octet_length(to_jsonb(r)::text)),
encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex'),'' order by id::text collate "C"),''),'UTF8')),'hex')
from public.ingest_sources r;
