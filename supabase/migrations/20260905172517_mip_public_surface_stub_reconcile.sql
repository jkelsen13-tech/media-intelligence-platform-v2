-- Production-recorded public-surface transfer chunk.
-- Applied on qikvmopbtijoebdqosyq as 20260905172517 / mip_public_surface_stub_reconcile.
-- Restored verbatim from supabase_migrations.schema_migrations.statements.
-- Do not replay this file on production; it is already recorded there.

alter table public.story_arcs add column if not exists slug text;
alter table public.story_arcs add column if not exists title text;
alter table public.story_arcs add column if not exists category text;
alter table public.story_arcs add column if not exists status text;
alter table public.story_arcs add column if not exists root_node_id uuid;
alter table public.story_arcs add column if not exists coverage_gap boolean not null default false;
alter table public.story_arcs add column if not exists summary text;
alter table public.story_arcs add column if not exists started_at date not null default current_date;
alter table public.story_arcs add column if not exists last_update_at timestamptz not null default now();
alter table public.story_arcs add column if not exists last_assignment_run timestamptz;
alter table public.story_arcs add column if not exists seed_article_id uuid;
alter table public.story_arcs add column if not exists category_confidence numeric;
alter table public.story_arcs add column if not exists category_evidence text;
alter table public.story_arcs add column if not exists title_article_count integer not null default 0;
alter table public.story_arcs add column if not exists display_kind text not null default 'story_arc';
do $$
begin
  if exists (select 1 from pg_type where typname = 'vector') then
    execute 'alter table public.story_arcs add column if not exists embedding vector';
  end if;
end $$;
update public.story_arcs set slug = coalesce(slug, id::text), title = coalesce(title, 'Untitled arc'), category = coalesce(category, 'unclassified'), status = coalesce(status, 'active') where slug is null or title is null or category is null or status is null;
alter table public.story_arcs alter column slug set not null;
alter table public.story_arcs alter column title set not null;
alter table public.story_arcs alter column category set not null;
alter table public.story_arcs alter column status set not null;
create unique index if not exists story_arcs_slug_key on public.story_arcs (slug);
alter table public.authors add column if not exists name text;
alter table public.authors add column if not exists normalized_name text;
alter table public.authors add column if not exists outlet_ids uuid[] not null default '{}'::uuid[];
alter table public.authors add column if not exists beats text[] not null default '{}'::text[];
alter table public.authors add column if not exists article_count integer not null default 0;
alter table public.authors add column if not exists first_seen timestamptz not null default now();
alter table public.authors add column if not exists last_seen timestamptz not null default now();
alter table public.authors add column if not exists framing_profile jsonb;
alter table public.authors add column if not exists confidence numeric;
alter table public.authors add column if not exists last_computed timestamptz;
update public.authors set name = coalesce(name, 'Unknown author'), normalized_name = coalesce(normalized_name, lower(coalesce(name, 'unknown author'))) where name is null or normalized_name is null;
alter table public.authors alter column name set not null;
alter table public.authors alter column normalized_name set not null;
alter table public.outlets add column if not exists name text;
alter table public.outlets add column if not exists parent_ownership text;
alter table public.outlets add column if not exists country text;
alter table public.outlets add column if not exists known_editorial_stance text;
alter table public.outlets add column if not exists notes text;
alter table public.outlets add column if not exists created_at timestamptz not null default now();
update public.outlets set name = coalesce(name, 'Unknown outlet') where name is null;
alter table public.outlets alter column name set not null;
alter table public.policies add column if not exists name text;
alter table public.policies add column if not exists jurisdiction text;
alter table public.policies add column if not exists instrument_type text;
alter table public.policies add column if not exists enacted_date date;
alter table public.policies add column if not exists effective_date date;
alter table public.policies add column if not exists status text;
alter table public.policies add column if not exists source_url text;
alter table public.policies add column if not exists full_text_url text;
alter table public.policies add column if not exists external_id text;
alter table public.policies add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.policies add column if not exists created_at timestamptz not null default now();
update public.policies set name = coalesce(name, 'Untitled policy') where name is null;
alter table public.policies alter column name set not null;
create unique index if not exists policies_external_id_idx on public.policies (external_id);
create index if not exists policies_name_idx on public.policies (lower(name));
alter table public.arc_membership_candidates add column if not exists article_id uuid;
alter table public.arc_membership_candidates add column if not exists arc_id uuid;
alter table public.arc_membership_candidates add column if not exists generation_method text;
alter table public.arc_membership_candidates add column if not exists generation_evidence jsonb not null default '{}'::jsonb;
alter table public.arc_membership_candidates add column if not exists state text not null default 'pending';
alter table public.arc_membership_candidates add column if not exists membership_fingerprint text;
alter table public.arc_membership_candidates add column if not exists membership_fingerprint_hash text;
alter table public.arc_membership_candidates add column if not exists invalidated_at timestamptz;
alter table public.arc_membership_candidates add column if not exists created_at timestamptz not null default now();
alter table public.arc_membership_candidates add column if not exists updated_at timestamptz not null default now();
alter table public.arc_membership_candidates add column if not exists approved_score_id uuid;
alter table public.arc_membership_candidates add column if not exists approved_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'arc_membership_candidates_article_arc_key') then
    alter table public.arc_membership_candidates add constraint arc_membership_candidates_article_arc_key unique (article_id, arc_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'arc_membership_candidates_state_check') then
    alter table public.arc_membership_candidates add constraint arc_membership_candidates_state_check check (state in ('pending', 'approved', 'rejected', 'invalidated'));
  end if;
end $$;
