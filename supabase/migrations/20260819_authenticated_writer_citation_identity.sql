-- The citation table records no separate evidence-text field, so article/entity/type
-- is its auditable identity. The pre-migration duplicate audit returned zero rows.
-- This constraint permits the authenticated writer's explicit idempotent upsert.

create unique index if not exists citations_article_entity_type_uidx
  on public.citations (article_id, cited_entity, cited_type);

comment on index public.citations_article_entity_type_uidx is
  'Prevents duplicate citation identities during isolated-v2 provenance-first ingestion.';
