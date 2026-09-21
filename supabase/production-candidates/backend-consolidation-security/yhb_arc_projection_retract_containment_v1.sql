-- Isolated successor candidate for the direct destructive projection retraction helper.
-- UNAPPLIED. Live use requires separate owner authorization after native qualification.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
revoke execute on function public.mip_retract_arc_membership_projection(uuid)
  from anon, authenticated;
commit;
