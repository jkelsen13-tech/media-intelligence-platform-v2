-- Isolated Version Two only. This narrow view replaces browser joins to the
-- private authors table for News byline rendering. It intentionally omits
-- profiling, analytic, source-network, and operational author fields.

create or replace view public.authors_public
with (security_barrier = true, security_invoker = false)
as
select
  a.id,
  a.name
from public.authors a;

grant select on table public.authors_public to anon;
