-- PROPOSAL ONLY. PRIVATE EXECUTION LANE ONLY after approved logging/privacy gates.
-- Boolean outputs do not authorize secret-dependent observations through general MCP.
SELECT
 (SELECT pg_catalog.count(*) FROM mip_factual.audit_connection WHERE id IS TRUE) AS selected_count,
 (SELECT pg_catalog.count(*) FROM mip_factual.audit_connection WHERE id IS NOT TRUE) AS unrelated_count,
 (SELECT coalesce(pg_catalog.bool_and(connection_string IS NOT NULL),false)
  FROM mip_factual.audit_connection WHERE id IS TRUE) AS selected_nonnull,
 (SELECT coalesce(pg_catalog.bool_and(connection_string IS NOT NULL
   AND connection_string ~ '^postgresql://mip_native_audit_v1[.]qikvmopbtijoebdqosyq:[^@]+@aws-0-us-west-1[.]pooler[.]supabase[.]com:5432/postgres[?]'
   AND pg_catalog.regexp_count(connection_string,'@')=1 AND pg_catalog.regexp_count(connection_string,'[?]')=1
   AND pg_catalog.cardinality(pg_catalog.string_to_array(pg_catalog.split_part(connection_string,'?',2),'&'))=3
   AND pg_catalog.string_to_array(pg_catalog.split_part(connection_string,'?',2),'&')
       @> ARRAY['sslrootcert=system','sslmode=verify-full','connect_timeout=5']),false)
  FROM mip_factual.audit_connection WHERE id IS TRUE) AS selected_source_matches,
 (SELECT pg_catalog.count(*) FROM mip_comparison_install.receipts WHERE
  operation_id='a382dcdbf2924852b711b6a8b0c713eb'
  AND manifest_sha256='221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320'
  AND state='installed_disabled_audit_pending' AND installer='postgres'
  AND audit_login='mip_native_audit_v1') AS receipt_count,
 (SELECT pg_catalog.count(*) FROM mip_native_activation.bootstrap WHERE singleton IS TRUE
  AND operation_id='a382dcdbf2924852b711b6a8b0c713eb'
  AND install_manifest='221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320'
  AND installer='postgres') AS bootstrap_count,
 (SELECT pg_catalog.count(*) FROM mip_native_activation.head WHERE singleton IS TRUE AND revision IS NULL) AS head_count,
 (SELECT pg_catalog.count(*) FROM mip_comparison_install.audit_qualifications) AS qualification_count;
