-- PROPOSAL ONLY. $1 private baseline JSON; $2 approved CA path; $3 expected transformed.
-- Bind parameters, never interpolate secrets. Result contains only private equality booleans.
WITH baseline AS (
 SELECT id,connection_string FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS b(id boolean,connection_string text)
), expected AS (
 SELECT id,CASE WHEN $3::boolean AND id IS TRUE THEN
   'postgresql://mip_native_audit_v1:'
   || pg_catalog.substr(pg_catalog.split_part(connection_string,'@',1),pg_catalog.length('postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:')+1)
   || '@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?'
   || (SELECT pg_catalog.string_agg(CASE WHEN parameter='sslrootcert=system'
       THEN 'sslrootcert='||pg_catalog.replace($2::text,'/','%2F') ELSE parameter END,'&' ORDER BY ordinal)
       FROM pg_catalog.unnest(pg_catalog.string_to_array(pg_catalog.split_part(connection_string,'?',2),'&'))
       WITH ORDINALITY AS params(parameter,ordinal))
   ELSE connection_string END AS connection_string FROM baseline
), actual AS (
 SELECT id,connection_string FROM mip_factual.audit_connection
), expected_json AS (
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) ORDER BY id NULLS LAST,connection_string COLLATE "C" NULLS FIRST),'[]'::jsonb) AS rows FROM expected e
), actual_json AS (
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY id NULLS LAST,connection_string COLLATE "C" NULLS FIRST),'[]'::jsonb) AS rows FROM actual a
)
SELECT
 ($3::boolean IS NOT NULL AND $2::text ~ '^/[A-Za-z0-9_./-]+$') AS comparison_inputs_valid,
 (SELECT pg_catalog.count(*)=1 FROM baseline WHERE id IS TRUE) AS baseline_selected_once,
 (SELECT pg_catalog.count(*)=1 FROM actual WHERE id IS TRUE) AS current_selected_once,
 (SELECT coalesce(pg_catalog.bool_and(connection_string IS NOT NULL
   AND connection_string ~ '^postgresql://mip_native_audit_v1[.]qikvmopbtijoebdqosyq:[^@]+@aws-0-us-west-1[.]pooler[.]supabase[.]com:5432/postgres[?]'
   AND pg_catalog.regexp_count(connection_string,'@')=1 AND pg_catalog.regexp_count(connection_string,'[?]')=1
   AND pg_catalog.cardinality(pg_catalog.string_to_array(pg_catalog.split_part(connection_string,'?',2),'&'))=3
   AND pg_catalog.string_to_array(pg_catalog.split_part(connection_string,'?',2),'&') @> ARRAY['sslrootcert=system','sslmode=verify-full','connect_timeout=5']),false)
 FROM baseline WHERE id IS TRUE) AS baseline_source_valid,
 (SELECT rows FROM expected_json) IS NOT DISTINCT FROM (SELECT rows FROM actual_json) AS all_rows_match,
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b) ORDER BY id NULLS LAST,connection_string COLLATE "C" NULLS FIRST),'[]'::jsonb) FROM baseline b WHERE id IS NOT TRUE)
 IS NOT DISTINCT FROM
 (SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY id NULLS LAST,connection_string COLLATE "C" NULLS FIRST),'[]'::jsonb) FROM actual a WHERE id IS NOT TRUE) AS unrelated_rows_match,
 (SELECT coalesce(pg_catalog.bool_and(a.connection_string IS NOT NULL AND b.connection_string IS NOT NULL
  AND CASE WHEN $3::boolean THEN
    pg_catalog.substr(pg_catalog.split_part(a.connection_string,'@',1),pg_catalog.length('postgresql://mip_native_audit_v1:')+1)
    IS NOT DISTINCT FROM
    pg_catalog.substr(pg_catalog.split_part(b.connection_string,'@',1),pg_catalog.length('postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:')+1)
  ELSE a.connection_string IS NOT DISTINCT FROM b.connection_string END),false)
  FROM actual a JOIN baseline b ON a.id IS TRUE AND b.id IS TRUE) AS opaque_credential_match;
