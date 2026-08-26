-- V2 approved Spatial Foundation security cutover: geography base tables are
-- internal records, not a browser-readable contract. This migration changes
-- no application rows and creates no replacement projection or read policy.

begin;

-- Keep row level security enabled even if future defaults change.
alter table public.geographic_places enable row level security;
alter table public.node_location_mentions enable row level security;

-- Remove the legacy permissive base-table read policies.
drop policy if exists geographic_places_read on public.geographic_places;
drop policy if exists node_location_mentions_read on public.node_location_mentions;

-- Defense in depth: browser-facing roles must not read geography base tables.
revoke select on table public.geographic_places from anon, authenticated, public;
revoke select on table public.node_location_mentions from anon, authenticated, public;

-- Preserve only the server-side administrative read path. RLS still applies.
grant select on table public.geographic_places, public.node_location_mentions to service_role;

commit;
