-- Exact direct-ACL inverse for isolated recovery qualification only.
-- UNAPPLIED. This is not authorization to restore browser execution.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
grant execute on function public.mip_retract_arc_membership_projection(uuid)
  to anon, authenticated;
commit;
