-- Hosted-synthetic cleanup. Isolated qualification only.
-- Removes ONLY objects this package's install order creates.
-- Explicit ownership checks. RAISE on unexpected dependents.
-- No DISABLE TRIGGER. No DELETE from immutable journals (DROP test-owned
-- relations instead). No CASCADE. No DROP of public.events/articles.
-- Not a production migration. qik (qikvmopbtijoebdqosyq) only.
begin;

do $ownership_and_deps$
declare rec record;
        allowed_owners text[] := array[
          'postgres',
          'mip_cutover_schema_owner_v1',
          'mip_kernel_owner_v2',
          'mip_identity_owner_v2',
          'mip_journal_owner_v2',
          'mip_journal_gateway_v2',
          'mip_identity_broker_v2',
          'mip_comparison_worker_owner_v1',
          'mip_comparison_producer_owner_v1',
          'mip_projection_publisher_owner_v1',
          'mip_comparison_worker_v1',
          'mip_comparison_producer_v1',
          'mip_projection_publisher_v1',
          'mip_cutover_authority_admin_v1'
        ];
        package_schemas text[] := array[
          'comparison_qualification','mip_identity','mip_cutover_authority'
        ];
begin
  if to_regclass('comparison_qualification.synthetic_events') is null then
    raise exception 'hosted_synthetic_cleanup_missing_synthetic_events';
  end if;

  for rec in
    select n.nspname, c.relname, pg_get_userbyid(c.relowner) as owner
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname = any(package_schemas)
      and c.relkind in ('r','p','S','v','m','i')
  loop
    if rec.owner <> all(allowed_owners) then
      raise exception 'hosted_synthetic_unexpected_owner: %.% owner=%',
        rec.nspname, rec.relname, rec.owner;
    end if;
  end loop;

  for rec in
    select n.nspname, p.proname, pg_get_userbyid(p.proowner) as owner
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname = any(package_schemas)
  loop
    if rec.owner <> all(allowed_owners) then
      raise exception 'hosted_synthetic_unexpected_function_owner: %.% owner=%',
        rec.nspname, rec.proname, rec.owner;
    end if;
  end loop;

  -- Objects outside this package that depend on package relations.
  for rec in
    select distinct n.nspname as dep_schema, c.relname as dep_name,
           rn.nspname as ref_schema, ref.relname as ref_name
    from pg_depend d
    join pg_class ref on ref.oid=d.refobjid
    join pg_namespace rn on rn.oid=ref.relnamespace
    join pg_class c on c.oid=d.objid and d.classid='pg_class'::regclass
    join pg_namespace n on n.oid=c.relnamespace
    where d.deptype in ('n','a')
      and rn.nspname = any(package_schemas)
      and n.nspname <> all(package_schemas || array['pg_catalog','pg_toast','information_schema'])
  loop
    raise exception 'hosted_synthetic_unexpected_relation_dependent: %.% -> %.%',
      rec.dep_schema, rec.dep_name, rec.ref_schema, rec.ref_name;
  end loop;

  for rec in
    select distinct n.nspname as dep_schema, p.oid::regprocedure::text as dep_sig,
           rn.nspname as ref_schema, ref.relname as ref_name
    from pg_depend d
    join pg_class ref on ref.oid=d.refobjid
    join pg_namespace rn on rn.oid=ref.relnamespace
    join pg_proc p on p.oid=d.objid and d.classid='pg_proc'::regclass
    join pg_namespace n on n.oid=p.pronamespace
    where d.deptype in ('n','a')
      and rn.nspname = any(package_schemas)
      and n.nspname <> all(package_schemas || array['pg_catalog','pg_toast','information_schema'])
  loop
    raise exception 'hosted_synthetic_unexpected_function_dependent: % -> %.%',
      rec.dep_sig, rec.ref_schema, rec.ref_name;
  end loop;
end
$ownership_and_deps$;

-- If 20 did not run, still drop the 005 public SELECT bind before dropping roles.
do $revoke_public$
begin
  if exists (select 1 from pg_roles where rolname='mip_kernel_owner_v2') then
    if to_regclass('public.events') is not null then
      execute 'revoke select on public.events from mip_kernel_owner_v2';
    end if;
    if to_regclass('public.event_articles') is not null then
      execute 'revoke select on public.event_articles from mip_kernel_owner_v2';
    end if;
    if to_regclass('public.articles') is not null then
      execute 'revoke select on public.articles from mip_kernel_owner_v2';
    end if;
    if to_regclass('public.pipeline_config') is not null then
      execute 'revoke select on public.pipeline_config from mip_kernel_owner_v2';
    end if;
  end if;
end
$revoke_public$;

-- Reverse 016→013 then 005→001 then comparison_qualification (including synthetic_*).
-- Cross-schema triggers first so function drops are not blocked.
do $drop_cross_triggers$
declare rec record;
begin
  for rec in
    select n.nspname, c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where not t.tgisinternal
      and n.nspname in ('comparison_qualification','mip_cutover_authority','mip_identity')
      and pn.nspname in ('comparison_qualification','mip_cutover_authority','mip_identity')
  loop
    execute format('drop trigger %I on %I.%I', rec.tgname, rec.nspname, rec.relname);
  end loop;
end
$drop_cross_triggers$;

do $drop_package_objects$
declare
  schemas text[] := array['mip_identity','mip_cutover_authority','comparison_qualification'];
  s text;
  rec record;
  attempt int;
  dropped int;
  remaining int;
begin
  foreach s in array schemas loop
    if to_regnamespace(s) is null then
      continue;
    end if;

    -- Functions (retry without CASCADE; stop if a pass cannot make progress).
    for attempt in 1..80 loop
      dropped := 0;
      remaining := 0;
      for rec in
        select p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname=s
      loop
        remaining := remaining + 1;
        begin
          execute 'drop function '||rec.sig;
          dropped := dropped + 1;
        exception
          when dependent_objects_still_exist then
            null;
        end;
      end loop;
      exit when remaining = 0;
      if dropped = 0 then
        raise exception 'hosted_synthetic_function_dependents_in_%', s;
      end if;
    end loop;

    -- Tables / sequences / views (retry FK order; no CASCADE).
    for attempt in 1..80 loop
      dropped := 0;
      remaining := 0;
      for rec in
        select c.relname, c.relkind
        from pg_class c
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname=s
          and c.relkind in ('v','m','r','p','S')
      loop
        remaining := remaining + 1;
        begin
          if rec.relkind = 'v' then
            execute format('drop view %I.%I', s, rec.relname);
          elsif rec.relkind = 'm' then
            execute format('drop materialized view %I.%I', s, rec.relname);
          elsif rec.relkind = 'S' then
            execute format('drop sequence %I.%I', s, rec.relname);
          else
            execute format('drop table %I.%I', s, rec.relname);
          end if;
          dropped := dropped + 1;
        exception
          when dependent_objects_still_exist then
            null;
        end;
      end loop;
      exit when remaining = 0;
      if dropped = 0 then
        raise exception 'hosted_synthetic_relation_dependents_in_%', s;
      end if;
    end loop;

    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=s
    ) or exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname=s
    ) then
      raise exception 'hosted_synthetic_schema_not_empty: %', s;
    end if;
    execute format('drop schema %I', s);
  end loop;
end
$drop_package_objects$;

do $drop_roles$
declare
  r text;
  rec record;
  roles text[] := array[
    'qual_public_reader','qual_comparison_producer','qual_comparison_worker',
    'qual_comparison_scheduler','qual_selector','qual_publisher','qual_membership_scorer',
    'mip_identity_broker_v2','mip_journal_gateway_v2','mip_journal_owner_v2',
    'mip_identity_owner_v2','mip_kernel_owner_v2',
    'mip_comparison_worker_v1','mip_comparison_producer_v1','mip_projection_publisher_v1',
    'mip_comparison_worker_owner_v1','mip_comparison_producer_owner_v1',
    'mip_projection_publisher_owner_v1',
    'mip_collector_scheduler_v1','mip_collector_worker_v1','mip_projection_builder_v1',
    'mip_cutover_authority_admin_v1','mip_cutover_recovery_v1',
    'mip_retention_writer_v1','mip_retention_reader_v1',
    'mip_cutover_schema_owner_v1'
  ];
begin
  foreach r in array roles loop
    if not exists (select 1 from pg_roles where rolname=r) then
      continue;
    end if;
    -- 005 grants USAGE on schema public to mip_kernel_owner_v2. Dropping our
    -- schemas does not remove that public-schema privilege; it blocks DROP ROLE.
    execute format('revoke all on schema public from %I', r);
    execute format('revoke all on all tables in schema public from %I', r);
    execute format('revoke all on all functions in schema public from %I', r);
    execute format('revoke all on all sequences in schema public from %I', r);
    -- Drop memberships that would block DROP ROLE (owner-gated authenticator grant).
    for rec in
      select a.rolname as member, b.rolname as target
      from pg_auth_members m
      join pg_roles a on a.oid=m.roleid
      join pg_roles b on b.oid=m.member
      where a.rolname=r or b.rolname=r
    loop
      execute format('revoke %I from %I', rec.member, rec.target);
    end loop;
    if exists (
      select 1 from pg_class c
      join pg_roles own on own.oid=c.relowner
      where own.rolname=r
    ) or exists (
      select 1 from pg_proc p
      join pg_roles own on own.oid=p.proowner
      where own.rolname=r
    ) or exists (
      select 1 from pg_namespace n
      join pg_roles own on own.oid=n.nspowner
      where own.rolname=r
    ) then
      raise exception 'hosted_synthetic_role_still_owns_objects: %', r;
    end if;
    begin
      execute format('drop role %I', r);
    exception
      when dependent_objects_still_exist then
        raise exception 'hosted_synthetic_role_has_unexpected_dependents: % %', r, sqlerrm;
    end;
  end loop;
end
$drop_roles$;

commit;

-- OWNER ACTIONS (not SQL; do not encode secrets here):
-- 1. Undeploy Edge function source-comparison-generation-candidate only if this
--    hosted-synthetic run deployed it.
-- 2. Delete only the following secret names, and only if this run created them:
--    MIP_QIK_WORKER_RPC_URL
--    MIP_QIK_PUBLISHABLE_KEY
--    MIP_QIK_WORKER_JWT
--    MIP_QIK_WORKER_INVOKE_TOKEN
--    MIP_QIK_WORKER_SESSION
--    MIP_QIK_WORKER_RUNTIME
--    MIP_QIK_WORKER_IMPLEMENTATION
-- 3. Do not overwrite existing secrets. Do not delete pre-existing secrets this
--    run did not create. Do not disable immutability triggers as a shortcut.
