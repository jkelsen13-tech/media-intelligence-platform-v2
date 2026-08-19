-- Approved source catalog for the provenance-first v2 ingestion pipeline.
--
-- This seed deliberately enables only public endpoints observed to be machine
-- readable. Reuters and AP News are collected through their original URLs in
-- GDELT discovery results; neither is misrepresented as a currently working
-- first-party RSS endpoint.

begin;

insert into public.ingestion_sources (
  source_key, label, source_url, source_type, outlet_domain, feed,
  active, allow_body_fetch, notes, cursor
)
values
  (
    'gdelt-public-news-discovery',
    'GDELT DOC 2.0 public-news discovery',
    'https://api.gdeltproject.org/api/v2/doc/doc',
    'gdelt_doc_api',
    null,
    'gdelt-public-news',
    true,
    false,
    'Discovery metadata only. The collector uses rate limits, exponential backoff, URL de-duplication, and records GDELT as discovery provenance; it does not treat GDELT as the publisher.',
    '{}'::jsonb
  ),
  (
    'gdelt-reuters-original-url-discovery',
    'GDELT DOC 2.0 — Reuters original-URL discovery',
    'https://api.gdeltproject.org/api/v2/doc/doc?query=domainis%3Areuters.com',
    'gdelt_doc_api',
    'reuters.com',
    'gdelt-reuters-discovery',
    true,
    false,
    'Reuters direct RSS was not verifiably available. This source only retains GDELT results whose original publisher URL resolves to reuters.com.',
    '{}'::jsonb
  ),
  (
    'gdelt-ap-original-url-discovery',
    'GDELT DOC 2.0 — AP News original-URL discovery',
    'https://api.gdeltproject.org/api/v2/doc/doc?query=domainis%3Aapnews.com',
    'gdelt_doc_api',
    'apnews.com',
    'gdelt-ap-discovery',
    true,
    false,
    'AP News top-news page was HTML rather than an observed RSS feed. This source only retains GDELT results whose original publisher URL resolves to apnews.com.',
    '{}'::jsonb
  ),
  (
    'gdelt-bigquery-gkg-discovery',
    'GDELT BigQuery GKG original-URL discovery',
    'bigquery://gdelt-bq.gdeltv2.gkg_partitioned',
    'gdelt_bigquery',
    null,
    'gdelt-bigquery-gkg',
    true,
    true,
    'Discovery metadata only through GDELT BigQuery. The worker maps `DocumentIdentifier` to the original publisher URL, hydrates only robot-permitted publisher HTML, logs every skip or failure, and leaves cross-surface candidates pending review. GDELT metadata is not publisher evidence or an automatic graph/timeline/arc/geography update.',
    '{"dataset":"gdelt-bq.gdeltv2","table":"gkg_partitioned","partition_field":"_PARTITIONTIME","url_field":"DocumentIdentifier","outlet_field":"SourceCommonName","timestamp_field":"DATE"}'::jsonb
  ),
  (
    'doj-press-release-rss',
    'U.S. Department of Justice Press Releases RSS',
    'https://www.justice.gov/news/rss?type=press_release&m=1',
    'official_feed',
    'justice.gov',
    'doj-official-rss',
    true,
    true,
    'Official DOJ press-release RSS exposed from the DOJ Press Releases page.',
    '{}'::jsonb
  ),
  (
    'bbc-news-rss',
    'BBC News RSS',
    'https://feeds.bbci.co.uk/news/rss.xml',
    'rss',
    'bbc.co.uk',
    'bbc-news-rss',
    true,
    true,
    'Public publisher-provided RSS feed. Publisher page fetches remain subject to per-domain robots and rate-limit checks.',
    '{}'::jsonb
  ),
  (
    'npr-news-rss',
    'NPR News RSS',
    'https://feeds.npr.org/1001/rss.xml',
    'rss',
    'npr.org',
    'npr-news-rss',
    true,
    true,
    'Public publisher-provided RSS feed. Publisher page fetches remain subject to per-domain robots and rate-limit checks.',
    '{}'::jsonb
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
  updated_at = now();

commit;

select source_key, source_type, outlet_domain, active
from public.ingestion_sources
order by source_key
limit 20;
