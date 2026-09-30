-- UNAPPLIED recovery only after independent review of exact index and failure.
-- Never run automatically following indexes.sql. No table/schema rollback.
-- psql -X -v ON_ERROR_STOP=1 -v requested_index=EXACT_REVIEWED_NAME -f index-recovery.sql
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

do $$
declare p record; r record;
begin
 select * into strict p from market_index_request;
 select pg_get_indexdef(i.indexrelid) definition,i.indisvalid,i.indisready,i.indislive into strict r
  from pg_index i where i.indexrelid=to_regclass('public.'||p.name);
 if r.definition<>p.expected or r.indisvalid or not r.indislive then
  raise exception 'Recovery requires exact invalid live index; wrong/missing/valid index is not authorized';
 end if;
 if exists(select 1 from pg_stat_progress_create_index where index_relid=to_regclass('public.'||p.name)) then raise exception 'Index operation still running'; end if;
end $$;
select format('REINDEX INDEX CONCURRENTLY public.%I',name) from market_index_request
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

drop table pg_temp.market_index_request,pg_temp.market_index_plan;
-- If REINDEX fails with _ccnew/_ccold artifacts, stop for a new catalog review.
-- Do not auto-drop these objects or run a broad REINDEX TABLE/SCHEMA/DATABASE.
