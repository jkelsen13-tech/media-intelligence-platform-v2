-- UNAPPLIED, independently gated, one named index per invocation.
-- psql -X -v ON_ERROR_STOP=1 -v requested_index=market_graph_edges_source -f indexes.sql
-- Run AFTER compatibility.sql; never use --single-transaction.
\set ON_ERROR_STOP on
set lock_timeout='3s';
set statement_timeout='30min';
create temporary table market_index_plan(name text primary key, ddl text not null, expected text not null);
insert into market_index_plan values
 ('market_graph_edges_source','CREATE INDEX CONCURRENTLY market_graph_edges_source ON public.edges USING btree (source_id, id) WHERE (NOT private_candidate)','CREATE INDEX market_graph_edges_source ON public.edges USING btree (source_id, id) WHERE (NOT private_candidate)'),
 ('market_graph_edges_target','CREATE INDEX CONCURRENTLY market_graph_edges_target ON public.edges USING btree (target_id, id) WHERE (NOT private_candidate)','CREATE INDEX market_graph_edges_target ON public.edges USING btree (target_id, id) WHERE (NOT private_candidate)'),
 ('market_graph_public_nodes','CREATE INDEX CONCURRENTLY market_graph_public_nodes ON public.nodes USING btree (id) WHERE (NOT private_candidate)','CREATE INDEX market_graph_public_nodes ON public.nodes USING btree (id) WHERE (NOT private_candidate)'),
 ('market_graph_citation_node','CREATE INDEX CONCURRENTLY market_graph_citation_node ON public.citations USING btree (resolved_node_id, article_id) WHERE (public_eligible AND (resolved_node_id IS NOT NULL))','CREATE INDEX market_graph_citation_node ON public.citations USING btree (resolved_node_id, article_id) WHERE (public_eligible AND (resolved_node_id IS NOT NULL))');
create temporary table market_index_request as select * from market_index_plan where name=:'requested_index';
do $$ begin
 if (select count(*) from market_index_request)<>1 then raise exception 'Unknown requested_index'; end if;
end $$;
-- An existing object must already match and be ready/valid; never silently accept
-- a wrong object or skip an interrupted build.
do $$
declare p record; r record;
begin
 select * into strict p from market_index_request;
 if to_regclass('public.'||p.name) is not null then
  select pg_get_indexdef(i.indexrelid) definition,i.indisvalid,i.indisready,i.indislive into strict r
   from pg_index i where i.indexrelid=to_regclass('public.'||p.name);
  if r.definition<>p.expected or not r.indisvalid or not r.indisready or not r.indislive then
   raise exception 'Index requires independent recovery review: %',p.name;
  end if;
 end if;
end $$;
select ddl from market_index_request where to_regclass('public.'||name) is null
\gexec
do $$
declare p record; r record;
begin
 select * into strict p from market_index_request;
 select pg_get_indexdef(i.indexrelid) definition,i.indisvalid,i.indisready,i.indislive into strict r
  from pg_index i where i.indexrelid=to_regclass('public.'||p.name);
 if r.definition<>p.expected or not r.indisvalid or not r.indisready or not r.indislive then
  raise exception 'Index postcondition failed: %',p.name;
 end if;
end $$;
select p.name,pg_get_indexdef(i.indexrelid) as definition,i.indisvalid,i.indisready,i.indislive
 from market_index_request p join pg_index i on i.indexrelid=to_regclass('public.'||p.name);
-- Repeat only after this command exits 0. Exact global counts remain O(n).

-- Only session-local planning tables; indexes and graph data are retained.
drop table pg_temp.market_index_request,pg_temp.market_index_plan;
