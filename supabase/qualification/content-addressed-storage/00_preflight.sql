-- Disposable/source install preflight. Does not mutate qik/YHB/NIE.
-- Refuse leftover package identities so a second install cannot share state.
do $preflight$
begin
  if exists (select 1 from pg_namespace where nspname in ('mip_cas','mip_cas_source_install')) then
    raise exception 'mip_cas_already_present';
  end if;
  if exists (
    select 1 from pg_roles
    where rolname in ('mip_cas_owner','mip_cas_gateway','mip_cas_codec_verifier')
  ) then
    raise exception 'mip_cas_role_already_present';
  end if;
end
$preflight$;
