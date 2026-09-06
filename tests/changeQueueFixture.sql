
create role anon; create role authenticated; create role service_role bypassrls;
create schema spatial;
create table public.articles (
  id uuid primary key default gen_random_uuid(), feed text not null, outlet text not null, title text not null, url text not null unique,
  summary text, body_text text, published_at timestamptz, fetched_at timestamptz not null default now(),
  ingestion_run_id text, reader_state text not null default 'pending_review' check(reader_state in ('eligible','pending_review','withheld')),
  source_status text not null default 'active' check(source_status in ('active','corrected','withdrawn')), claims jsonb default '[]'
);
create table public.nodes (id uuid primary key default gen_random_uuid(), type text not null, label text, metadata jsonb default '{}');
create table public.geographic_places (id uuid primary key default gen_random_uuid(), canonical_name text);
create table public.pipeline_config (key text primary key, value jsonb);
create table spatial.assertions (id uuid primary key default gen_random_uuid(), graph_node_id uuid references public.nodes(id));
create table spatial.assertion_revisions (id uuid primary key default gen_random_uuid(), spatial_assertion_id uuid references spatial.assertions(id), canonical_place_id uuid references public.geographic_places(id));
create view public.spatial_projection_v1 as select r.id revision_id,r.canonical_place_id,a.graph_node_id subject_graph_node_id
  from spatial.assertion_revisions r join spatial.assertions a on a.id=r.spatial_assertion_id;
grant usage on schema public to anon, authenticated, service_role;
grant select on public.nodes,public.geographic_places,public.spatial_projection_v1 to service_role;
alter table public.articles enable row level security;
grant select on public.articles to anon,authenticated;
create policy reader_eligibility on public.articles for select to anon,authenticated using(reader_state='eligible' and source_status='active');
