-- Isolated-only successor for the five coupled staged-GDELT operations.
-- This file is not authorization for live application.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
revoke execute on function public.mip_v2_gdelt_stage_batch(text, jsonb) from anon, authenticated;
revoke execute on function public.mip_v2_gdelt_materialize_batch(text, integer) from anon, authenticated;
revoke execute on function public.mip_v2_gdelt_attach_batch(text, integer) from anon, authenticated;
revoke execute on function public.mip_v2_gdelt_originate_batch(text, integer) from anon, authenticated;
revoke execute on function public.mip_v2_gdelt_close_staging(text) from anon, authenticated;
commit;
