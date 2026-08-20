-- Isolated Version Two only. This narrow view replaces direct anonymous reads
-- of arc_milestones for public Story Arc and Timeline rendering. It exposes
-- only the parent key and the checklist fields rendered in the UI.

create or replace view public.arc_milestones_public
with (security_barrier = true, security_invoker = false)
as
select
  m.id,
  m.arc_id,
  m.title,
  m.status,
  m.notes,
  m.updated_at
from public.arc_milestones m;

grant select on table public.arc_milestones_public to anon;
