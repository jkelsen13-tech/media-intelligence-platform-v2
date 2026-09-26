-- Hosted-synthetic grant rebind. Isolated qualification only.
-- Apply AFTER mip-cutover-authority/005_broker_sessions.sql.
-- 005 grants SELECT on public.events, public.event_articles, public.articles,
-- and public.pipeline_config to mip_kernel_owner_v2. That is the live-qik gap:
-- omitting source-fixture.sql is not enough because 005 still binds the kernel
-- to public.* when those relations already exist.
-- This file revokes those public grants and grants SELECT on synthetic_* only.
-- Not a production migration. qik (qikvmopbtijoebdqosyq) only.
begin;

do $require_005$
begin
  if not exists (select 1 from pg_roles where rolname='mip_kernel_owner_v2') then
    raise exception 'hosted_synthetic_grant_rebind_requires_005';
  end if;
  if to_regclass('comparison_qualification.synthetic_events') is null
     or to_regclass('comparison_qualification.synthetic_articles') is null
     or to_regclass('comparison_qualification.synthetic_event_articles') is null
     or to_regclass('comparison_qualification.synthetic_pipeline_config') is null then
    raise exception 'hosted_synthetic_grant_rebind_requires_10_synthetic_adapter';
  end if;
  if to_regclass('public.events') is null
     or to_regclass('public.event_articles') is null
     or to_regclass('public.articles') is null
     or to_regclass('public.pipeline_config') is null then
    raise exception 'hosted_synthetic_qik_public_relation_missing';
  end if;
end
$require_005$;

revoke select on public.events, public.event_articles, public.articles, public.pipeline_config
  from mip_kernel_owner_v2;

do $revoke_public_select$
declare rel text;
        col record;
        cols text;
begin
  foreach rel in array array['events','event_articles','articles','pipeline_config'] loop
    -- Column-level SELECT would survive a table-level REVOKE.
    cols := null;
    for col in
      select column_name
      from information_schema.column_privileges
      where grantee='mip_kernel_owner_v2'
        and table_schema='public'
        and table_name=rel
        and privilege_type='SELECT'
    loop
      cols := coalesce(cols || ',','') || quote_ident(col.column_name);
    end loop;
    if cols is not null then
      execute format('revoke select (%s) on public.%I from mip_kernel_owner_v2', cols, rel);
    end if;
    if has_table_privilege('mip_kernel_owner_v2', format('public.%I', rel), 'SELECT') then
      raise exception 'hosted_synthetic_public_select_not_revoked: public.%', rel;
    end if;
  end loop;
end
$revoke_public_select$;

grant select on comparison_qualification.synthetic_events,
  comparison_qualification.synthetic_articles,
  comparison_qualification.synthetic_event_articles,
  comparison_qualification.synthetic_pipeline_config
  to mip_kernel_owner_v2;
-- 005 granted insert,update on every comparison_qualification table, including
-- these synthetic sources. Snapshot is read-only for the kernel owner.
revoke insert, update, delete, truncate, references, trigger
  on comparison_qualification.synthetic_events,
     comparison_qualification.synthetic_articles,
     comparison_qualification.synthetic_event_articles,
     comparison_qualification.synthetic_pipeline_config
  from mip_kernel_owner_v2;

do $force_rls$
declare rel text;
        pol text := 'hosted_synthetic_kernel_select';
begin
  foreach rel in array array[
    'synthetic_events','synthetic_articles','synthetic_event_articles','synthetic_pipeline_config'
  ] loop
    execute format('alter table comparison_qualification.%I enable row level security', rel);
    execute format('alter table comparison_qualification.%I force row level security', rel);
    -- 005 already creates kernel_only_v2 (ALL) when the synthetic tables exist
    -- before 005. FORCE RLS still requires an explicit SELECT-capable policy for
    -- mip_kernel_owner_v2; add one if this package's named policy is absent.
    if not exists (
      select 1 from pg_policies
      where schemaname='comparison_qualification' and tablename=rel and policyname=pol
    ) then
      execute format(
        'create policy %I on comparison_qualification.%I for select to mip_kernel_owner_v2 using (true)',
        pol, rel);
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname='comparison_qualification' and tablename=rel
        and roles && array['mip_kernel_owner_v2']::name[]
        and cmd in ('*','SELECT')
    ) then
      raise exception 'hosted_synthetic_kernel_select_policy_missing: %', rel;
    end if;
  end loop;
end
$force_rls$;

commit;
