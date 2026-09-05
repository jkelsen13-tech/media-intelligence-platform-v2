-- Correct unscoped public_article_count on investigation_surface_public.
-- Destination has no events or event_articles tables. Source Comparison
-- event_articles.event_id is a different object family from graph nodes.id
-- and must not be joined by UUID string. evidence_candidates remain private.
-- sources.url is not article identity. This membership table is the governed
-- graph-event/article relationship. It is not backfilled from titles, dates,
-- or inferred cross-family identifiers. A zero count means this event has no
-- eligible public memberships, not that private articles exist.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.graph_event_article_memberships (
  event_node_id uuid not null references public.nodes(id),
  article_id uuid not null references public.articles(id),
  recorded_at timestamptz not null default now(),
  primary key (event_node_id, article_id)
);

create or replace function public.graph_event_article_memberships_require_event_node()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.nodes n
    where n.id = new.event_node_id and n.type = 'event'
  ) then
    raise exception 'graph_event_article_memberships.event_node_id must reference a node of type event';
  end if;
  return new;
end;
$$;

drop trigger if exists graph_event_article_memberships_require_event_node on public.graph_event_article_memberships;
create trigger graph_event_article_memberships_require_event_node
  before insert or update on public.graph_event_article_memberships
  for each row execute function public.graph_event_article_memberships_require_event_node();

alter table public.graph_event_article_memberships enable row level security;
revoke all on public.graph_event_article_memberships from public, anon, authenticated;
grant select on public.graph_event_article_memberships to anon, authenticated, service_role;
grant insert, update, delete on public.graph_event_article_memberships to service_role;

drop policy if exists graph_event_article_memberships_public_select on public.graph_event_article_memberships;
create policy graph_event_article_memberships_public_select
  on public.graph_event_article_memberships
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.articles a
      where a.id = graph_event_article_memberships.article_id
        and a.reader_state = 'eligible'
        and a.source_status = 'active'
    )
  );

create or replace view public.investigation_surface_public
with (security_invoker = true) as
select
  n.id as canonical_event_id,
  n.slug,
  n.label as event_label,
  n.type as event_type,
  n.occurred_at,
  exists (
    select 1 from public.spatial_projection_v1 p
    where p.subject_graph_node_id = n.id
  ) as has_released_geography,
  (
    select p.revision_id from public.spatial_projection_v1 p
    where p.subject_graph_node_id = n.id
    limit 1
  ) as spatial_revision_id,
  (
    select count(*)::integer
    from public.graph_event_article_memberships m
    join public.articles a on a.id = m.article_id
    where m.event_node_id = n.id
      and a.reader_state = 'eligible'
      and a.source_status = 'active'
  ) as public_article_count,
  0 as reviewed_claim_count,
  (
    select count(*)::integer from public.edges e
    where e.source_id = n.id or e.target_id = n.id
  ) as published_relationship_count,
  false as auto_approval_enabled
from public.nodes n
where n.type = 'event';

revoke all on public.investigation_surface_public from public;
grant select on public.investigation_surface_public to anon, authenticated, service_role;

comment on table public.graph_event_article_memberships is
  'Governed graph-event to article membership. Not inferred from titles, dates, or cross-family UUID strings. Zero public count means no eligible memberships, not that private articles exist.';
comment on view public.investigation_surface_public is
  'Anonymous investigation contract. Pending article text and private candidates are not exposed. public_article_count is event-scoped eligible memberships only.';
commit;
