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
    for col in
      select a.attname::text as column_name
      from pg_attribute a
      join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=rel and a.attnum>0 and not a.attisdropped
    loop
      if has_column_privilege('mip_kernel_owner_v2', format('public.%I', rel), col.column_name, 'SELECT') then
        raise exception 'hosted_synthetic_public_column_select_not_revoked: public.%.%',
          rel, col.column_name;
      end if;
    end loop;
  end loop;
end
$revoke_public_select$;

-- 005 also grants USAGE on schema public to mip_kernel_owner_v2. The SELECT
-- revoke and has_table_privilege assertion above run first, while schema USAGE
-- still exists so the privilege probe is meaningful. Then revoke 005's explicit
-- USAGE grant. PostgreSQL still grants USAGE on schema public to PUBLIC by
-- default; do not REVOKE FROM PUBLIC (that would be a live catalog change).
-- Isolation of source rows is the SELECT revoke, not schema USAGE.
revoke usage on schema public from mip_kernel_owner_v2;

revoke all on function comparison_qualification.source_snapshot(jsonb,text),
  comparison_qualification.capture_source(jsonb,text)
  from public,anon,authenticated,service_role,mip_comparison_worker_v1,
       mip_comparison_producer_v1;

do $snapshot_binding$
declare def text;
begin
  def := pg_get_functiondef('comparison_qualification.source_snapshot(jsonb,text)'::regprocedure);
  if def ~ 'public\.events' or def ~ 'public\.articles'
     or def ~ 'public\.event_articles' or def ~ 'public\.pipeline_config' then
    raise exception 'hosted_synthetic_snapshot_still_binds_public';
  end if;
  if def !~ 'comparison_qualification\.synthetic_events' then
    raise exception 'hosted_synthetic_snapshot_missing_synthetic_bind';
  end if;
  def := pg_get_functiondef('comparison_qualification.capture_source(jsonb,text)'::regprocedure);
  if def ~ 'public\.events' or def ~ 'public\.articles' then
    raise exception 'hosted_synthetic_capture_still_binds_public';
  end if;
  if has_function_privilege('service_role',
       'comparison_qualification.source_snapshot(jsonb,text)', 'EXECUTE')
     or has_function_privilege('anon',
       'comparison_qualification.source_snapshot(jsonb,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'comparison_qualification.source_snapshot(jsonb,text)', 'EXECUTE')
     or has_function_privilege('mip_comparison_worker_v1',
       'comparison_qualification.source_snapshot(jsonb,text)', 'EXECUTE') then
    raise exception 'hosted_synthetic_snapshot_execute_unintended';
  end if;
  if not has_function_privilege('mip_comparison_producer_owner_v1',
       'comparison_qualification.source_snapshot(jsonb,text)', 'EXECUTE') then
    raise exception 'hosted_synthetic_producer_owner_snapshot_execute_missing';
  end if;
end
$snapshot_binding$;

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

do $ledger$
begin
  if to_regprocedure('hosted_synthetic_operation.mark_cleared_public_source_grants()') is not null then
    perform hosted_synthetic_operation.mark_cleared_public_source_grants();
    update hosted_synthetic_operation.introduced_grants
      set status='revoked'
      where object_kind='schema' and privilege='USAGE' and schema_name='public'
        and grantee='mip_kernel_owner_v2' and status='introduced';
    perform hosted_synthetic_operation.capture_step('20');
    update hosted_synthetic_operation.operation set window_005_20='atomic_closed'
      where window_005_20 in ('pending','needs_recovery','recovered');
  end if;
end
$ledger$;

commit;
