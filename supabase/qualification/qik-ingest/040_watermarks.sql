-- C3 qik ingest: historical count observation + idle forward cursor.
-- Legacy channel names are retained for compatibility, not consistency claims.

insert into public.mip_consolidation_watermarks (
  source_project_ref, channel, watermark, captured_at
) values (
  'yhbwnrtlqbjtcrrlpbge',
  'ingest_pause_fence',
  jsonb_build_object(
    'kind', 'yhb_ingest_pause_observation',
    'articles', 36183,
    'freshness', 'historical_observation',
    'is_current', false,
    'corpus_transfer', false,
    'note', 'Historical count observation only; not a consistency or continuity fence. No article rows are copied.'
  ),
  '2026-09-26T05:03:32Z'::timestamptz
)
on conflict (source_project_ref, channel) do nothing;

insert into public.mip_consolidation_watermarks (
  source_project_ref, channel, watermark, captured_at
) values (
  'qikvmopbtijoebdqosyq',
  'ingest_forward',
  jsonb_build_object(
    'kind', 'qik_ingest_forward',
    'freshness', 'qik_forward_idle',
    'is_current', false,
    'corpus_transfer', false,
    'articles_observed_at_package', (select count(*) from public.articles),
    'yhb_historical_articles_observed', 36183,
    'continuity_verified', false
  ),
  transaction_timestamp()
)
on conflict (source_project_ref, channel) do nothing;
