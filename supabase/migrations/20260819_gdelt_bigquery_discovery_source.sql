-- Isolated v2 only: register the owner-authorized GDELT BigQuery discovery path.
--
-- This migration does not create credentials, enable billing, query BigQuery, or
-- promote any discovery data. It only permits a distinct source type and adds the
-- reviewed source-catalog row required by the constrained ingestion RPC.

begin;

alter table public.ingestion_sources
  drop constraint if exists ingestion_sources_source_type_check;

alter table public.ingestion_sources
  add constraint ingestion_sources_source_type_check
  check (source_type in ('gdelt_doc_api', 'gdelt_bigquery', 'rss', 'sitemap', 'official_feed'));

insert into public.ingestion_sources (
  source_key,
  label,
  source_url,
  source_type,
  outlet_domain,
  feed,
  active,
  allow_body_fetch,
  notes,
  cursor
)
values (
  'gdelt-bigquery-gkg-discovery',
  'GDELT BigQuery GKG original-URL discovery',
  'bigquery://gdelt-bq.gdeltv2.gkg_partitioned',
  'gdelt_bigquery',
  null,
  'gdelt-bigquery-gkg',
  true,
  true,
  'Discovery metadata only through the GDELT BigQuery public dataset. The worker reads original publisher URLs from DocumentIdentifier, hydrates only robot-permitted publisher HTML, records all skips, and leaves every cross-surface candidate pending review. GDELT metadata is not treated as publisher evidence, source independence, or an automatic graph/timeline/arc/geography update.',
  '{"dataset":"gdelt-bq.gdeltv2","table":"gkg_partitioned","partition_field":"_PARTITIONTIME","url_field":"DocumentIdentifier","outlet_field":"SourceCommonName","timestamp_field":"DATE"}'::jsonb
)
on conflict (source_key) do update set
  label = excluded.label,
  source_url = excluded.source_url,
  source_type = excluded.source_type,
  outlet_domain = excluded.outlet_domain,
  feed = excluded.feed,
  active = excluded.active,
  allow_body_fetch = excluded.allow_body_fetch,
  notes = excluded.notes,
  cursor = excluded.cursor,
  updated_at = now();

commit;
