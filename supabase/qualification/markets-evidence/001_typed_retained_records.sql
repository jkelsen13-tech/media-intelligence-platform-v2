-- ISOLATED QUALIFICATION ONLY. No production installation or asset ingestion.
begin;
create schema mip_markets;
revoke all on schema mip_markets from public;
alter table public.nodes add column private_candidate boolean not null default false;
alter table public.edges add column private_candidate boolean not null default false;
alter table public.nodes drop constraint nodes_type_check;
alter table public.nodes add constraint nodes_type_check check(type in
 ('event','actor','institution','document','anomaly','policy','topic','equity','cryptoasset','network'));
alter table public.nodes enable row level security;
alter table public.edges enable row level security;
create policy markets_private_nodes on public.nodes as restrictive for select to anon,authenticated using(not private_candidate);
create policy markets_private_edges on public.edges as restrictive for select to anon,authenticated
 using(not private_candidate and exists(select 1 from public.nodes n where n.id=source_id and not n.private_candidate) and exists(select 1 from public.nodes n where n.id=target_id and not n.private_candidate));
-- A privileged reader must explicitly filter; restrictive policies do not govern definer views.
-- Recreate the known aggregate independently of caller RLS.
create or replace view public.graph_coverage_public with(security_barrier=true,security_invoker=false) as
with article_totals as(select count(*)::integer article_count from public.articles where reader_state='eligible' and source_status='active'),
resolved_article_totals as(select count(distinct c.article_id)::integer articles_with_published_node from public.citations c join public.articles a on a.id=c.article_id and a.reader_state='eligible' and a.source_status='active'
 join public.nodes n on n.id=c.resolved_node_id and not n.private_candidate),
pending_graph_candidates as(select count(*)::integer pending_graph_candidate_count from public.cross_surface_candidates where candidate_type in('graph_node','graph_edge') and review_state in('pending','owner_hold')),
published_graph as(select
 (select count(*)::integer from public.nodes where not private_candidate) published_node_count,
 (select count(*)::integer from public.edges e join public.nodes s on s.id=e.source_id join public.nodes t on t.id=e.target_id where not e.private_candidate and not s.private_candidate and not t.private_candidate) documented_relationship_count)
select a.article_count,r.articles_with_published_node,greatest(a.article_count-r.articles_with_published_node,0)::integer articles_without_published_node,
 p.pending_graph_candidate_count,g.published_node_count,g.documented_relationship_count
from article_totals a cross join resolved_article_totals r cross join pending_graph_candidates p cross join published_graph g;
grant select on public.graph_coverage_public to anon,authenticated;
create function mip_markets.guard_private_graph() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 if tg_op='UPDATE' and old.private_candidate and not new.private_candidate then raise exception 'mip_market_no_public_promotion';end if;
 if tg_table_name='nodes' then
  if new.type in('equity','cryptoasset','network') and not new.private_candidate then raise exception 'mip_market_private_required';end if;
 else
  if not new.private_candidate and exists(select 1 from public.nodes where id in(new.source_id,new.target_id) and private_candidate) then raise exception 'mip_market_private_endpoint';end if;
 end if;
 return new;
end $$;
create trigger markets_graph_guard before insert or update on public.nodes for each row execute function mip_markets.guard_private_graph();
create trigger markets_graph_guard before insert or update on public.edges for each row execute function mip_markets.guard_private_graph();
alter table evidence_pipeline.record_versions drop constraint record_versions_record_kind_check;
alter table evidence_pipeline.record_versions add constraint record_versions_record_kind_check check(record_kind in('article','graph_node','temporal_assessment','graph_edge'));
create trigger mip_edge_version after insert or update or delete on public.edges for each row execute function evidence_pipeline.capture_version('graph_edge');
alter table evidence_pipeline.evidence_candidates drop constraint evidence_candidates_candidate_kind_check;
alter table evidence_pipeline.evidence_candidates add constraint evidence_candidates_candidate_kind_check check(candidate_kind in('claim','graph_relationship','timeline','geography','typed_graph_relationship'));
alter table evidence_pipeline.evidence_candidates
 add column typed_edge_id uuid references public.edges(id),
 add column subject_version_id uuid references evidence_pipeline.record_versions(id),
 add column object_version_id uuid references evidence_pipeline.record_versions(id),
 add column edge_version_id uuid references evidence_pipeline.record_versions(id),
 add column relationship_kind text,
 add column valid_from timestamptz,
 add column valid_to timestamptz;
alter table evidence_pipeline.evidence_candidates add constraint typed_candidate_shape check(
 (candidate_kind='typed_graph_relationship' and typed_edge_id is not null and subject_version_id is not null and object_version_id is not null and edge_version_id is not null
 and relationship_kind in('direct_reporting','ownership','operation','supply','regulation','financing','protocol_dependency')
 and valid_from is not null and isfinite(valid_from) and (valid_to is null or(isfinite(valid_to) and valid_to>valid_from))
 and event_node_id is null and related_node_id is null and place_id is null and spatial_revision_id is null)
 or(candidate_kind<>'typed_graph_relationship' and typed_edge_id is null and subject_version_id is null and object_version_id is null and edge_version_id is null and relationship_kind is null and valid_from is null and valid_to is null));
create index market_candidate_edge on evidence_pipeline.evidence_candidates(typed_edge_id);
create index market_candidate_subject_version on evidence_pipeline.evidence_candidates(subject_version_id);
create index market_candidate_object_version on evidence_pipeline.evidence_candidates(object_version_id);
create index market_candidate_edge_version on evidence_pipeline.evidence_candidates(edge_version_id);
create function mip_markets.guard_candidate() returns trigger language plpgsql set search_path='' as $$
declare s evidence_pipeline.record_versions;o evidence_pipeline.record_versions;e evidence_pipeline.record_versions;c evidence_pipeline.article_captures;
 edge public.edges;latest uuid;
begin
 if new.candidate_kind<>'typed_graph_relationship' then return new;end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 select * into strict edge from public.edges where id=new.typed_edge_id;
 select * into strict s from evidence_pipeline.record_versions where id=new.subject_version_id;
 select * into strict o from evidence_pipeline.record_versions where id=new.object_version_id;
 select * into strict e from evidence_pipeline.record_versions where id=new.edge_version_id;
 if s.record_kind<>'graph_node' or o.record_kind<>'graph_node' or e.record_kind<>'graph_edge'
 or s.record_key<>edge.source_id::text or o.record_key<>edge.target_id::text or e.record_key<>edge.id::text
 or e.payload->>'source_id'<>s.record_key or e.payload->>'target_id'<>o.record_key
 or e.payload->>'type' is distinct from new.relationship_kind
 or not edge.private_candidate or edge.type<>new.relationship_kind
 or e.operation='delete' or s.operation='delete' or o.operation='delete'
 then raise exception 'mip_market_exact_endpoint_binding';end if;
 if exists(select 1 from evidence_pipeline.record_versions v where (v.record_kind,v.record_key) in((s.record_kind,s.record_key),(o.record_kind,o.record_key),(e.record_kind,e.record_key))
 and v.ordinal>case when v.record_kind=e.record_kind and v.record_key=e.record_key then e.ordinal when v.record_key=s.record_key then s.ordinal else o.ordinal end)
 then raise exception 'mip_market_stale_identity';end if;
 select * into strict c from evidence_pipeline.article_captures where id=new.capture_id;
 if new.span_end>char_length(c.payload->>new.source_field) or substring(c.payload->>new.source_field from new.span_start+1 for new.span_end-new.span_start) is distinct from new.excerpt then raise exception 'mip_market_exact_span';end if;
 return new;
end $$;
create trigger market_candidate_binding before insert on evidence_pipeline.evidence_candidates for each row execute function mip_markets.guard_candidate();
alter function evidence_pipeline.assessment_context(uuid,uuid[],bigint[]) rename to assessment_context_before_markets;
create function evidence_pipeline.assessment_context(p_candidate uuid,p_parents uuid[] default '{}',p_extra bigint[] default '{}') returns jsonb language plpgsql set search_path='' as $$
declare c evidence_pipeline.evidence_candidates;positions bigint[];
begin
 select * into strict c from evidence_pipeline.evidence_candidates where id=p_candidate;
 if c.candidate_kind='typed_graph_relationship' then
  select array_agg(position order by position) into positions from evidence_pipeline.evidence_changes where record_version_id in(c.subject_version_id,c.object_version_id,c.edge_version_id);
  if cardinality(positions)<>3 then raise exception 'mip_market_missing_retained_change';end if;
  select array_agg(distinct x order by x) into p_extra from unnest(p_extra||positions)x;
 end if;
 return evidence_pipeline.assessment_context_before_markets(p_candidate,p_parents,p_extra);
end $$;
revoke all on function evidence_pipeline.assessment_context(uuid,uuid[],bigint[]) from public,anon,authenticated;
grant execute on function evidence_pipeline.assessment_context(uuid,uuid[],bigint[]) to service_role;
revoke all on all functions in schema mip_markets from public,anon,authenticated,service_role;
commit;
