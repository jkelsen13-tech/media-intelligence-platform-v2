-- Isolated Version Two only. Rewrites provenance references on edges imported
-- from the original project so public graph inspection resolves to V2 records.
-- The original source values remain under metadata.original_source for audit.

with remapped as (
  select
    e.id,
    e.metadata,
    jsonb_build_object(
      'article_id', coalesce(to_jsonb(article_map.target_id::text), e.metadata -> 'article_id'),
      'entity_id', coalesce(to_jsonb(entity_map.target_id::text), e.metadata -> 'entity_id')
    ) as target_references,
    jsonb_strip_nulls(jsonb_build_object(
      'article_id', e.metadata ->> 'article_id',
      'entity_id', e.metadata ->> 'entity_id'
    )) as source_references
  from public.edges e
  left join public.original_source_import_mappings article_map
    on article_map.source_project_ref = 'niejaejtbxgakyrsntxm'
   and article_map.source_table = 'articles'
   and article_map.source_id::text = e.metadata ->> 'article_id'
  left join public.original_source_import_mappings entity_map
    on entity_map.source_project_ref = 'niejaejtbxgakyrsntxm'
   and entity_map.source_table = 'entities'
   and entity_map.source_id::text = e.metadata ->> 'entity_id'
  where e.metadata -> 'original_source' ->> 'project_ref' = 'niejaejtbxgakyrsntxm'
    and (e.metadata ? 'article_id' or e.metadata ? 'entity_id')
)
update public.edges e
set metadata = jsonb_set(
  (remapped.metadata - 'article_id' - 'entity_id') || remapped.target_references,
  '{original_source}',
  coalesce(remapped.metadata -> 'original_source', '{}'::jsonb)
    || jsonb_build_object('edge_metadata_source_ids', remapped.source_references),
  true
)
from remapped
where e.id = remapped.id;
