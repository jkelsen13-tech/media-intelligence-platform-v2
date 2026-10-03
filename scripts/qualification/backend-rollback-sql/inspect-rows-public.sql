-- PROPOSAL ONLY. SELECT counts/boolean-id metadata; never reads connection_string.
SELECT pg_catalog.count(*) FILTER (WHERE id IS TRUE) AS selected_count,
 pg_catalog.count(*) FILTER (WHERE id IS NOT TRUE) AS unrelated_count
FROM mip_factual.audit_connection;
