-- SOURCE PROPOSAL ONLY. Not a migration, live approval, or deployment receipt.
-- A separately reviewed execution wrapper must supply the exact fresh catalog
-- baseline as JSON in mip.profile_acl_expected_catalog. Missing/drifted inputs
-- abort before any privilege change. This baseline includes all ACL grantors.
-- Apply only as the verified table owner; preserve existing CRUD grants, RLS,
-- owner, policies, schema, function bytes and scoped signup trigger.
-- No CASCADE and no grants. Any remaining effective broad privilege aborts the
-- transaction rather than extending the revoke to PUBLIC, inherited roles or
-- other grantors. Those cases need separate diagnosis and approval.
begin;
do $proposal$
declare
  expected_text text := current_setting('mip.profile_acl_expected_catalog', true);
  actual jsonb;
begin
  if expected_text is null or expected_text = '' then
    raise exception 'mip_profiles proposal requires an exact reviewed catalog baseline';
  end if;
  -- BEGIN BASELINE QUERY
  select jsonb_build_object(
    'owner', pg_get_userbyid(c.relowner),
    'acl', c.relacl::text,
    'row_security', c.relrowsecurity,
    'force_row_security', c.relforcerowsecurity,
    'columns', (select jsonb_agg(jsonb_build_object('name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull, 'acl', a.attacl::text,
      'default', pg_get_expr(d.adbin, d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'constraints', (select jsonb_agg(jsonb_build_object('name', conname,
      'definition', pg_get_constraintdef(oid), 'validated', convalidated) order by conname)
      from pg_constraint where conrelid=c.oid),
    'policies', (select jsonb_agg(jsonb_build_object('name', polname,
      'command', polcmd, 'roles', polroles::text, 'permissive', polpermissive,
      'using', pg_get_expr(polqual, polrelid), 'check', pg_get_expr(polwithcheck, polrelid)) order by polname)
      from pg_policy where polrelid=c.oid),
    'signup_trigger', (select jsonb_build_object('enabled', t.tgenabled,
      'definition', pg_get_triggerdef(t.oid), 'function', pg_get_functiondef(t.tgfoid),
      'function_acl', p.proacl::text, 'function_owner', pg_get_userbyid(p.proowner))
      from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid='auth.users'::regclass and t.tgname='on_auth_user_created_mip' and not t.tgisinternal)
  ) into actual
  from pg_class c where c.oid='public.mip_profiles'::regclass;
  -- END BASELINE QUERY
  if actual is distinct from expected_text::jsonb then
    raise exception 'mip_profiles proposal catalog baseline drift';
  end if;
  if actual->>'owner' is distinct from current_user then
    raise exception 'mip_profiles proposal requires verified table owner';
  end if;
  if actual->>'row_security' is distinct from 'true'
    or actual->'signup_trigger' is null
    or actual->'signup_trigger'->>'enabled' is distinct from 'O' then
    raise exception 'mip_profiles proposal identity prerequisites missing';
  end if;
end
$proposal$;

revoke truncate, trigger, references, maintain
  on table public.mip_profiles from anon, authenticated;

do $proposal$
begin
  if exists (select 1 from (values ('anon'), ('authenticated')) roles(name)
    cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) privileges(name)
    where has_table_privilege(roles.name, 'public.mip_profiles', privileges.name))
    or has_any_column_privilege('anon', 'public.mip_profiles', 'REFERENCES')
    or has_any_column_privilege('authenticated', 'public.mip_profiles', 'REFERENCES') then
    raise exception 'mip_profiles proposal broad privileges remain; separate grantor or inheritance review required';
  end if;
end
$proposal$;
commit;
