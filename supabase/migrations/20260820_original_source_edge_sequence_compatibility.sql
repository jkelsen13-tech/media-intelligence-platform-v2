-- Preserve the original project's temporal "sequence" graph edges during the
-- read-only cross-surface import. This applies ONLY to the isolated Version Two
-- sandbox; it does not contact or modify the original project.
alter table public.edges drop constraint if exists edges_type_check;
alter table public.edges add constraint edges_type_check check (
  type = any (array[
    'causal', 'actor', 'financial', 'conflict', 'documentary', 'enables',
    'constrains', 'enabled', 'constrained_by', 'amends', 'supersedes',
    'conflicts_with', 'triggered_compliance', 'violated', 'tested', 'sequence'
  ])
);
