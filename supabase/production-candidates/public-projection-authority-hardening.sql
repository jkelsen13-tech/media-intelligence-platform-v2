-- PRODUCTION CANDIDATE ONLY. DO NOT APPLY WITHOUT THE OWNER GATE IN THE
-- accompanying README. This file is deliberately outside supabase/migrations.
--
-- Remaining scope after live migrations 20260920145928 and 20260920150006:
-- close permissive public-schema defaults for objects owned by supabase_admin.
-- The connected postgres migration role is not a member of supabase_admin, so
-- the platform correctly rejected this portion. It requires a platform-owner
-- path; do not emulate it by broadening role membership.

begin;

alter default privileges for role supabase_admin in schema public
  revoke all on tables from public, anon, authenticated;

alter default privileges for role supabase_admin in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
