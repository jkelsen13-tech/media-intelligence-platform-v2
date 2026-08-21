-- V2 public graph-coverage disclosure.
--
-- This projection exposes only aggregate counts required to explain the
-- reader-facing graph boundary. It intentionally does not expose candidate
-- excerpts, private review identities, raw identifiers, or a completeness/
-- reliability score.

create or replace view public.graph_coverage_public
with (security_barrier = true, security_invoker = false)
as
with article_totals as (
  select count(*)::integer as article_count
  from public.articles
),
resolved_article_totals as (
  select count(distinct c.article_id)::integer as articles_with_published_node
  from public.citations c
  where c.article_id is not null
    and c.resolved_node_id is not null
),
pending_graph_candidates as (
  select count(*)::integer as pending_graph_candidate_count
  from public.cross_surface_candidates c
  where c.candidate_type in ('graph_node', 'graph_edge')
    and c.review_state in ('pending', 'owner_hold')
),
published_graph as (
  select
    (select count(*)::integer from public.nodes) as published_node_count,
    (select count(*)::integer from public.edges) as documented_relationship_count
)
select
  a.article_count,
  r.articles_with_published_node,
  greatest(a.article_count - r.articles_with_published_node, 0)::integer as articles_without_published_node,
  p.pending_graph_candidate_count,
  g.published_node_count,
  g.documented_relationship_count
from article_totals a
cross join resolved_article_totals r
cross join pending_graph_candidates p
cross join published_graph g;

comment on view public.graph_coverage_public is
  'Anonymous aggregate coverage disclosure for the V2 Knowledge Graph. Counts describe stored publication and review states only; they are not a completeness, reliability, causality, or outcome score.';

grant select on table public.graph_coverage_public to anon;
