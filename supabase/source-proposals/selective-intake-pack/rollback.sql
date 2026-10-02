-- UNEXECUTED rollback: stop the new producer while retaining all native source and private history.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
revoke execute on function public.mip_selective_execution_v1(text,jsonb) from service_role;
commit;
-- This is the non-destructive operational rollback. Rows, criteria, rights/revocations,
-- native captures/candidates/assessments/workspaces and original annotation RPC remain retained.
-- Do not drop populated history or reopen a consumed source permit to retry HTTP.
