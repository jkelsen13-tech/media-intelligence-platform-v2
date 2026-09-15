-- DISPOSABLE DATABASE ONLY. Run with psql -X -v ON_ERROR_STOP=1 -f verifier.sql.
-- Requires an independently restored, sanitized live-schema fixture with public
-- articles, node_topics, edges, comparison and released spatial fixtures populated.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() !~ '^mip_disposable_' then raise exception 'Disposable database name required'; end if;
 if not exists(select 1 from public.node_topics) or not exists(select 1 from public.citations)
 or not exists(select 1 from public.graph_event_article_memberships)
 or not exists(select 1 from public.comparison_public)
 or not exists(select 1 from public.spatial_projection_v1)
 then raise exception 'Nonempty representative public relationship/projection fixtures required'; end if;
 if (select count(*) from public.nodes)>5000 or (select count(*) from public.edges)>10000
 then raise exception 'Use separate scale benchmark; this verifier fully snapshots a small fixture'; end if;
end $$;
do $$ begin
 execute 'create temporary view market_unfiltered_spatial as '||pg_get_viewdef('public.spatial_projection_v1'::regclass,true);
 execute 'create temporary view market_unfiltered_comparison as '||pg_get_viewdef('public.comparison_public'::regclass,true);
 revoke all on pg_temp.market_unfiltered_spatial,pg_temp.market_unfiltered_comparison from public,anon,authenticated;
end $$;
create temporary table market_baseline(role_name text primary key,payload jsonb);
grant select,insert on market_baseline to anon,authenticated;
create function pg_temp.market_snapshot() returns jsonb language plpgsql security invoker as $$
declare name text; rows jsonb; result jsonb:='{}';
begin
 foreach name in array array['nodes','edges','citations','node_topics','graph_event_article_memberships','comparison_public','investigation_surface_public','spatial_projection_v1','graph_coverage_public'] loop
  execute format('select coalesce(jsonb_agg(v order by v::text),''[]''::jsonb) from (select to_jsonb(t)-''private_candidate''-''public_eligible''-''pending_graph_candidate_count'' v from public.%I t %s) s',name,case when name='citations' then 'where resolved_node_id is not null' else '' end) into rows;
  result:=result||jsonb_build_object(name,rows);
 end loop;
 return result;
end $$;
set role anon;
do $$
declare name text; snapshot jsonb:=pg_temp.market_snapshot();
begin
 foreach name in array array['nodes','edges','citations','node_topics','graph_event_article_memberships','comparison_public','investigation_surface_public','spatial_projection_v1','graph_coverage_public'] loop
  if jsonb_array_length(snapshot->name)=0 then raise exception 'Role-visible sentinel missing: % %',current_user,name; end if;
 end loop;
end $$;
insert into market_baseline values(current_user,pg_temp.market_snapshot());
reset role;
set role authenticated;
insert into market_baseline values(current_user,pg_temp.market_snapshot());
reset role;
-- Both roles must see all fixtures, not merely the privileged owner.
do $$ begin
 if exists(select 1 from market_baseline b, lateral jsonb_each(b.payload) e where jsonb_array_length(e.value)=0) then raise exception 'Vacuous baseline'; end if;
end $$;
\ir compatibility.sql
\set requested_index market_graph_edges_source
\ir indexes.sql
\set requested_index market_graph_edges_target
\ir indexes.sql
\set requested_index market_graph_public_nodes
\ir indexes.sql
\set requested_index market_graph_citation_node
\ir indexes.sql
\set requested_index market_graph_edges_source
\ir indexes.sql
-- The repeat must validate and skip an already-correct index.
-- Public results must remain equal before inserting private material.
set role anon;
do $$ begin if pg_temp.market_snapshot()<>(select payload from market_baseline where role_name=current_user) then raise exception 'Public regression anon'; end if; end $$;
reset role;
set role authenticated;
do $$ begin if pg_temp.market_snapshot()<>(select payload from market_baseline where role_name=current_user) then raise exception 'Public regression authenticated'; end if; end $$;
reset role;
begin;
-- All fixtures remain confined to this disposable transaction.
insert into public.nodes(id,slug,label,type,private_candidate,arc_id)
 select 'f0000000-0000-0000-0000-000000000001','evt-0000000000000000000000000000-private','PRIVATE_MARKET_SENTINEL','event',true,arc_id
 from public.articles a where a.arc_id is not null and exists(
 select 1 from public.comparison_public c, lateral jsonb_array_elements(c.articles) j
 where j->>'article_key'=md5(a.id::text)) limit 1;
do $$ begin if not exists(select 1 from public.nodes where id='f0000000-0000-0000-0000-000000000001') then raise exception 'Public event arc fixture required'; end if; end $$;
insert into public.nodes(id,slug,label,type,private_candidate)
 values('f0000000-0000-0000-0000-000000000002','market-private-actor','PRIVATE_MARKET_ACTOR','actor',true);
insert into public.edges(id,source_id,target_id,type,private_candidate)
 values('f0000000-0000-0000-0000-000000000003','f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','direct_reporting',true);
insert into public.edges(id,source_id,target_id,type,private_candidate)
 select 'f0000000-0000-0000-0000-000000000004',id,'f0000000-0000-0000-0000-000000000002','direct_reporting',true from public.nodes where type='event' and not private_candidate limit 1;
insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id)
 select c.article_id,'PRIVATE_MARKET_CITATION',c.cited_type,c.documentation_strength,'f0000000-0000-0000-0000-000000000002' from public.citations c join public.articles a on a.id=c.article_id where a.reader_state='eligible' and a.source_status='active' limit 1;
-- Unresolved private citation on an otherwise PUBLIC article must be absent.
insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id)
 select c.article_id,'PRIVATE_UNRESOLVED_SENTINEL',c.cited_type,c.documentation_strength,null from public.citations c join public.articles a on a.id=c.article_id where a.reader_state='eligible' and a.source_status='active' limit 1;
-- Even explicit public classification cannot publish an unresolved citation.
insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id,public_eligible)
 select c.article_id,'PUBLIC_UNRESOLVED_SENTINEL',c.cited_type,c.documentation_strength,null,true from public.citations c join public.articles a on a.id=c.article_id where a.reader_state='eligible' and a.source_status='active' limit 1;
-- Reverse direction must not inflate the public event's relationship count.
insert into public.edges(id,source_id,target_id,type,private_candidate)
 select 'f0000000-0000-0000-0000-000000000005','f0000000-0000-0000-0000-000000000002',id,'direct_reporting',true from public.nodes where type='event' and not private_candidate limit 1;
insert into public.node_topics(node_id,topic_id)
 select 'f0000000-0000-0000-0000-000000000002',topic_id from public.node_topics limit 1;
insert into public.graph_event_article_memberships(event_node_id,article_id)
 select 'f0000000-0000-0000-0000-000000000001',article_id from public.graph_event_article_memberships limit 1;
-- Require the private event to win the original timeline ordering. A fixture
-- where it does not win is inadequate, not a passed negative test.
do $$
declare winner uuid;
begin
 select n.id into winner from public.nodes n where n.type='event'
 and n.arc_id=(select arc_id from public.nodes where id='f0000000-0000-0000-0000-000000000001')
 order by (n.slug like 'evt-%') desc,n.slug limit 1;
 if winner<>'f0000000-0000-0000-0000-000000000001' then raise exception 'Comparison ordering fixture does not force private winner'; end if;
 if not exists(select 1 from market_unfiltered_comparison c,lateral jsonb_array_elements(c.articles) j where j->>'timeline_key'=right('evt-0000000000000000000000000000-private',8)) then raise exception 'Original comparison cannot see sentinel'; end if;
end $$;
\ir spatial-fixture.sql
do $$ begin
 begin
  update public.nodes set private_candidate=false where id='f0000000-0000-0000-0000-000000000001';
  raise exception 'promotion erroneously allowed';
 exception when raise_exception then
  if sqlerrm<>'market_graph_classification_immutable' then raise; end if;
 end;
 begin
  insert into public.edges(source_id,target_id,type) values('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','direct_reporting');
  raise exception 'public edge erroneously allowed';
 exception when raise_exception then
  if sqlerrm<>'market_graph_public_edge_private_endpoint' then raise; end if;
 end;
end $$;
set local role anon;
do $$ begin if pg_temp.market_snapshot()<>(select payload from market_baseline where role_name=current_user) then raise exception 'Private leak anon'; end if; end $$;
reset role;
set local role authenticated;
do $$ begin if pg_temp.market_snapshot()<>(select payload from market_baseline where role_name=current_user) then raise exception 'Private leak authenticated'; end if; end $$;
reset role;
\ir acl-and-absence.sql
rollback;
-- Executable mechanism tests are not proof of RPC, GraphQL, CDC or scale.
