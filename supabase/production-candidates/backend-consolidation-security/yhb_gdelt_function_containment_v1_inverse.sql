-- Exact proposed inverse for the recorded 2026-09-21 pre-state.
-- Execute only as postgres under a separate recovery authorization.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
grant execute on function public.mip_v2_gdelt_stage_batch(text, jsonb) to anon, authenticated;
grant execute on function public.mip_v2_gdelt_materialize_batch(text, integer) to anon, authenticated;
grant execute on function public.mip_v2_gdelt_attach_batch(text, integer) to anon, authenticated;
grant execute on function public.mip_v2_gdelt_originate_batch(text, integer) to anon, authenticated;
grant execute on function public.mip_v2_gdelt_close_staging(text) to anon, authenticated;
commit;
