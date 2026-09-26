-- Hosted-synthetic 005→20 window recovery. Same operation as the ledger.
-- Revokes ONLY public-source SELECT (table and column) this operation recorded
-- as introduced. Does not sweep public, drop tables, or touch unrelated grantees.
-- Not a production migration. qik (qikvmopbtijoebdqosyq) only.
begin;
do $require$
begin
  if to_regprocedure('hosted_synthetic_operation.recover_public_source_selects(boolean)') is null then
    raise exception 'hosted_synthetic_recovery_requires_ledger';
  end if;
end
$require$;
select hosted_synthetic_operation.recover_public_source_selects();
commit;
