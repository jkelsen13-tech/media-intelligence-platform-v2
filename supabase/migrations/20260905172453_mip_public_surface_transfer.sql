-- Production-recorded public-surface transfer chunk.
-- Applied on qikvmopbtijoebdqosyq as 20260905172453 / mip_public_surface_transfer.
-- Restored verbatim from supabase_migrations.schema_migrations.statements.
-- Do not replay this file on production; it is already recorded there.

-- Destination delta: transfer Manus public-surface relations, private predicates, and publication gates onto the existing production stubs.
create schema if not exists mip_private;
revoke all on schema mip_private from public, anon, authenticated;
grant usage on schema mip_private to anon, authenticated, service_role;
alter table public.articles add column if not exists arc_id uuid;
alter table public.articles add column if not exists author_id uuid;
alter table public.articles add column if not exists arc_assignment_evidence jsonb;
alter table public.articles add column if not exists unattributed boolean not null default false;
alter table public.articles add column if not exists monoculture boolean not null default false;
alter table public.articles add column if not exists is_digest boolean not null default false;
