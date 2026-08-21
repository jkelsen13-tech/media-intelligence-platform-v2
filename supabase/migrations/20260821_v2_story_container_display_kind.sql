-- V2 story-container taxonomy.
--
-- `story_arcs` remains the stable storage relation for existing joins, but its
-- reader-facing display type must distinguish a longitudinal consequence arc
-- from a bounded research collection/watchlist. This changes no membership,
-- chronology, graph edge, causal, or outcome assertion.

alter table public.story_arcs
  add column if not exists display_kind text not null default 'story_arc';

alter table public.story_arcs
  drop constraint if exists story_arcs_display_kind_check;

alter table public.story_arcs
  add constraint story_arcs_display_kind_check
  check (display_kind in ('story_arc', 'research_collection'));

comment on column public.story_arcs.display_kind is
  'Reader-facing object type. story_arc means a longitudinal tracked development; research_collection means a bounded source-mapped container and does not assert a common outcome, causal relation, editorial lineage, or completeness.';

-- This collection already documents separate policy subjects and disclaims a
-- common trajectory. Its storage joins remain unchanged; only its reader-facing
-- taxonomy is corrected.
update public.story_arcs
set display_kind = 'research_collection'
where slug = 'february-2026-source-mapped-policy-watch';
