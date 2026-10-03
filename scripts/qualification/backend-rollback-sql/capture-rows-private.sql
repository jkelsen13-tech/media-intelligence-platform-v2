-- PROPOSAL ONLY. SECRET-BEARING RESULT: approved private executor memory only.
-- Never call through general MCP, console output, public receipts or error serialization.
-- Capture only AFTER logging gates; keep outside transaction for post-ROLLBACK comparison.
SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'connection_string',connection_string)
 ORDER BY id NULLS LAST,connection_string COLLATE "C" NULLS FIRST),'[]'::jsonb) AS private_rows
FROM mip_factual.audit_connection;
