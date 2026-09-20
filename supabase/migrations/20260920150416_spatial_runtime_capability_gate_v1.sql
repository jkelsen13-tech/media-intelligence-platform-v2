create table mip_private.spatial_runtime_principal_capabilities (
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  capability text not null check (capability in ('write','review','release')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  granted_by text not null,
  reason text not null,
  primary key (auth_user_id, capability, granted_at),
  check (revoked_at is null or revoked_at >= granted_at)
);

create unique index spatial_runtime_principal_capabilities_one_active
  on mip_private.spatial_runtime_principal_capabilities(auth_user_id, capability)
  where revoked_at is null;

alter table mip_private.spatial_runtime_principal_capabilities enable row level security;
alter table mip_private.spatial_runtime_principal_capabilities force row level security;
revoke all on table mip_private.spatial_runtime_principal_capabilities
  from public, anon, authenticated, service_role, spatial_writer_runtime;

insert into mip_private.spatial_runtime_principal_capabilities
  (auth_user_id, capability, granted_by, reason)
select p.id, c.capability, current_user,
  'preserve_preexisting_spatial_runtime_principal_20260920'
from public.mip_profiles p
cross join (values ('write'), ('review'), ('release')) as c(capability)
join auth.users u on u.id = p.id
where not u.is_anonymous and u.email_confirmed_at is not null;

create function public.spatial_runtime_operation_allowed(
  p_auth_user_id uuid,
  p_operation text
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from auth.users u
    join mip_private.spatial_runtime_principal_capabilities c
      on c.auth_user_id = u.id
    where u.id = p_auth_user_id
      and not u.is_anonymous
      and u.email_confirmed_at is not null
      and c.revoked_at is null
      and c.capability = case
        when p_operation = 'append_review_decision' then 'review'
        when p_operation = 'append_release_decision' then 'release'
        when p_operation in (
          'append_policy_artifact',
          'append_audience_scope',
          'append_assertion',
          'append_assertion_revision',
          'append_revision_lineage',
          'register_evidence_artifact',
          'append_evidence_snapshot',
          'append_revision_evidence',
          'append_geometry_snapshot',
          'append_evidence_condition_event'
        ) then 'write'
        else null
      end
  )
$$;

revoke all on function public.spatial_runtime_operation_allowed(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.spatial_runtime_operation_allowed(uuid,text)
  to spatial_writer_runtime;
