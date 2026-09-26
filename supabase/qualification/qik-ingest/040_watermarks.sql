-- C3 qik ingest: watermark fence + idle forward cursor. FILES ONLY.
-- Writes the YHB pause count 36183. Does not insert predecessor articles.

insert into public.mip_consolidation_watermarks (
  source_project_ref, channel, watermark, captured_at
) values (
  'yhbwnrtlqbjtcrrlpbge',
  'ingest_pause_fence',
  jsonb_build_object(
    'kind', 'yhb_ingest_pause_fence',
    'articles', 36183,
    'freshness', 'fence',
    'is_current', false,
    'corpus_transfer', false,
    'note', 'Count fence only. This package does not copy article rows.'
  ),
  '2026-09-26T00:00:00Z'::timestamptz
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
    'articles_observed_at_package', 98,
    'continuity_from_yhb_fence_articles', 36183
  ),
  '2026-09-26T00:00:00Z'::timestamptz
)
on conflict (source_project_ref, channel) do nothing;
