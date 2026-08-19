# Ingestion Working Notebook — mip-v2-backfill-20260819T055928Z-cdc6ac65

This run enforces a maximum of 10 articles per manifest and holds Doc 07 / Louisiana v. Callais material outside the pipeline.

| Time (UTC) | Manifest | Status | Detail |
|---|---:|---|---|
| 2026-08-19 05:59:28Z | — | started | mode=discover; target=10; sources=bbc-news-rss; write_mode=spool |
| 2026-08-19 05:59:29Z | 1 | manifested | 10 articles from bbc-news-rss for 2026-08-19 |
| 2026-08-19 05:59:29Z | 1 | spooled | 10 actions written to batch-00001-actions.json; no database rows written |
| 2026-08-19 05:59:31Z | — | completed | {"manifested": 10, "spooled": 10} |
