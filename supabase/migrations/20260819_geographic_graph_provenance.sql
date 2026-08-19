-- Geographic Graph provenance model — isolated v2 sandbox only.
--
-- Purpose: support a scalable Geography lens without treating a source's
-- publication location, a named organization, or a headline guess as an event
-- coordinate. Every displayed location remains traceable to a source span and
-- its literal/ambiguity/review state.
--
-- This migration intentionally does NOT install PostGIS or auto-geocode the
-- corpus. Geographic aggregation is based only on populated, resolved rows.

create table if not exists public.geographic_places (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  country_code text,
  admin1_name text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  precision text not null check (precision in ('country', 'region', 'city', 'area', 'facility')),
  gazetteer_provider text,
  gazetteer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180)),
  unique nulls not distinct (gazetteer_provider, gazetteer_id)
);

create table if not exists public.node_location_mentions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  article_id uuid references public.articles(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  place_id uuid references public.geographic_places(id) on delete set null,
  mention_text text not null,
  text_field text not null check (text_field in ('headline', 'summary', 'lead', 'body', 'event_record', 'manual')),
  mention_start integer,
  mention_end integer,
  location_role text not null check (location_role in ('event', 'jurisdiction', 'facility', 'publisher', 'context')),
  literal_status text not null check (literal_status in ('literal', 'associative', 'ambiguous', 'rejected')),
  resolution_method text not null check (resolution_method in ('source_record', 'human_verified', 'deterministic_gazetteer', 'automated_candidate')),
  review_state text not null check (review_state in ('confirmed', 'review_pending', 'ambiguous', 'rejected')),
  remaining_uncertainty text,
  extraction_version text not null default 'geography-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (mention_start is null and mention_end is null)
    or (mention_start is not null and mention_end is not null and mention_start >= 0 and mention_end > mention_start)
  ),
  check (
    (review_state = 'confirmed' and literal_status = 'literal' and place_id is not null and resolution_method in ('source_record', 'human_verified'))
    or review_state <> 'confirmed'
  )
);

create index if not exists geographic_places_country_precision_idx
  on public.geographic_places (country_code, precision);
create index if not exists node_location_mentions_node_review_idx
  on public.node_location_mentions (node_id, review_state);
create index if not exists node_location_mentions_article_idx
  on public.node_location_mentions (article_id) where article_id is not null;
create index if not exists node_location_mentions_place_idx
  on public.node_location_mentions (place_id) where place_id is not null;

alter table public.geographic_places enable row level security;
alter table public.node_location_mentions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'geographic_places' and policyname = 'geographic_places_read') then
    create policy geographic_places_read on public.geographic_places for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'node_location_mentions' and policyname = 'node_location_mentions_read') then
    create policy node_location_mentions_read on public.node_location_mentions for select to anon, authenticated using (true);
  end if;
end $$;

comment on table public.geographic_places is
  'Canonical geographic records for the v2 Geography lens. Coordinates are optional and precision is explicit; this table does not establish a graph relationship.';
comment on table public.node_location_mentions is
  'Source-span-backed location mentions attached to graph nodes. Literal, resolution, review, and uncertainty fields prevent automated text candidates from appearing as confirmed event locations.';
