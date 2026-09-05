-- Close the public-surface publication bypass.
-- Citations follow the established article eligibility contract.
-- Geography and sky base tables return to the V2 revoke contract.
-- graph_coverage_public counts only eligible+active articles.
-- Does not invent approval states, auto-approve records, or open a second
-- geographic publication path. Released geography remains spatial_projection_v1.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop policy if exists citations_public_read on public.citations;
create policy citations_public_read
  on public.citations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.articles a
      where a.id = citations.article_id
        and a.reader_state = 'eligible'
        and a.source_status = 'active'
    )
  );

drop policy if exists node_location_mentions_public_read on public.node_location_mentions;
drop policy if exists sky_verifications_public_read on public.sky_verifications;

revoke select on table public.node_location_mentions from anon, authenticated, public;
revoke select on table public.sky_verifications from anon, authenticated, public;
grant select on table public.node_location_mentions, public.sky_verifications to service_role;

create or replace view public.graph_coverage_public
with (security_barrier = true, security_invoker = false)
as
with article_totals as (
  select count(*)::integer as article_count
  from public.articles
  where reader_state = 'eligible'
    and source_status = 'active'
),
resolved_article_totals as (
  select count(distinct c.article_id)::integer as articles_with_published_node
  from public.citations c
  inner join public.articles a
    on a.id = c.article_id
   and a.reader_state = 'eligible'
   and a.source_status = 'active'
  where c.resolved_node_id is not null
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

revoke insert, update, delete, truncate on public.graph_coverage_public from public, anon, authenticated;
grant select on public.graph_coverage_public to anon, authenticated, service_role;

comment on view public.graph_coverage_public is
  'Anonymous aggregate coverage disclosure. Article and resolved-citation counts follow the eligible+active reader contract. Pending, withheld, and withdrawn records are excluded. Review-state candidate counts remain aggregates only.';

commit;
