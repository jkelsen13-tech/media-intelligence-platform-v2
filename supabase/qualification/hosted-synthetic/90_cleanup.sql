-- Hosted-synthetic cleanup bound to THIS operation's ledger.
-- Drops only created_roles / created_namespaces / created_relations /
-- created_functions / created_memberships / introduced_grants recorded during
-- install. Refuses unexpected same-schema objects and unrelated public
-- privileges. Revokes only recorded public-source SELECT grants.
-- No CASCADE. No DISABLE TRIGGER. No journal DELETE. No public table DROP.
-- Not a production migration. qik (qikvmopbtijoebdqosyq) only.
begin;

do $require_ledger$
begin
  if to_regnamespace('hosted_synthetic_operation') is null
     or to_regclass('hosted_synthetic_operation.created_relations') is null then
    raise exception 'hosted_synthetic_cleanup_requires_ledger';
  end if;
end
$require_ledger$;

select hosted_synthetic_operation.refuse_unexpected_package_objects();
select hosted_synthetic_operation.recover_public_source_selects(false);
select hosted_synthetic_operation.refuse_unrelated_public_privileges();

-- Explicit seeding-authority cleanup before relations are dropped.
do $revoke_producer$
declare sid uuid;
begin
  select producer_session_id into sid from hosted_synthetic_operation.operation;
  if sid is not null
     and to_regprocedure('comparison_qualification.revoke_session(uuid)') is not null then
    perform comparison_qualification.revoke_session(sid);
  end if;
end
$revoke_producer$;

do $drop_cross_triggers$
declare rec record;
begin
  for rec in
    select n.nspname, c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join hosted_synthetic_operation.created_relations r
      on r.nspname=n.nspname and r.relname=c.relname
    where not t.tgisinternal
  loop
    execute format('drop trigger %I on %I.%I', rec.tgname, rec.nspname, rec.relname);
  end loop;
end
$drop_cross_triggers$;

do $drop_package_objects$
declare
  rec record;
  attempt int;
  dropped int;
  remaining int;
begin
  for attempt in 1..80 loop
    dropped := 0;
    remaining := 0;
    for rec in select signature from hosted_synthetic_operation.created_functions loop
      remaining := remaining + 1;
      begin
        execute 'drop function '||rec.signature;
        delete from hosted_synthetic_operation.created_functions where signature=rec.signature;
        dropped := dropped + 1;
      exception
        when undefined_function then
          delete from hosted_synthetic_operation.created_functions where signature=rec.signature;
          dropped := dropped + 1;
        when dependent_objects_still_exist then
          null;
      end;
    end loop;
    exit when remaining = 0;
    if dropped = 0 then
      raise exception 'hosted_synthetic_function_dependents';
    end if;
  end loop;

  for attempt in 1..80 loop
    dropped := 0;
    remaining := 0;
    for rec in select nspname,relname,relkind from hosted_synthetic_operation.created_relations loop
      remaining := remaining + 1;
      begin
        if rec.relkind = 'v' then
          execute format('drop view %I.%I', rec.nspname, rec.relname);
        elsif rec.relkind = 'm' then
          execute format('drop materialized view %I.%I', rec.nspname, rec.relname);
        elsif rec.relkind = 'S' then
          execute format('drop sequence %I.%I', rec.nspname, rec.relname);
        else
          execute format('drop table %I.%I', rec.nspname, rec.relname);
        end if;
        delete from hosted_synthetic_operation.created_relations
          where nspname=rec.nspname and relname=rec.relname;
        dropped := dropped + 1;
      exception
        when undefined_table then
          delete from hosted_synthetic_operation.created_relations
            where nspname=rec.nspname and relname=rec.relname;
          dropped := dropped + 1;
        when dependent_objects_still_exist then
          null;
      end;
    end loop;
    exit when remaining = 0;
    if dropped = 0 then
      raise exception 'hosted_synthetic_relation_dependents';
    end if;
  end loop;

  perform hosted_synthetic_operation.refuse_unexpected_package_objects();

  for rec in select nspname from hosted_synthetic_operation.created_namespaces loop
    execute format('drop schema %I', rec.nspname);
  end loop;
end
$drop_package_objects$;

do $drop_roles$
declare rec record; r text;
begin
  for rec in select member_role,granted_role from hosted_synthetic_operation.created_memberships loop
    begin
      execute format('revoke %I from %I', rec.granted_role, rec.member_role);
    exception
      when undefined_object then
        null;
    end;
  end loop;
  for rec in
    select grantee,schema_name from hosted_synthetic_operation.introduced_grants
    where object_kind='schema' and privilege='USAGE'
  loop
    begin
      execute format('revoke usage on schema %I from %I', rec.schema_name, rec.grantee);
    exception
      when undefined_object then
        null;
    end;
  end loop;
  -- Membership GRANT to authenticator is an owner Data-API step after last
  -- capture. The worker role did not exist at baseline, so this revoke is
  -- operation-owned. No-op when authenticator is absent (PGlite).
  if exists (select 1 from pg_roles where rolname='authenticator') then
    for r in select rolname from hosted_synthetic_operation.created_roles loop
      begin
        execute format('revoke %I from authenticator', r);
      exception
        when undefined_object then
          null;
      end;
    end loop;
  end if;
  for r in select rolname from hosted_synthetic_operation.created_roles loop
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
      where own.rolname=r and n.nspname <> 'hosted_synthetic_operation'
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

-- Drop this operation's ledger schema without CASCADE and without touching public.
do $drop_ledger$
declare rec record; attempt int; dropped int; remaining int;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='hosted_synthetic_operation'
      and c.relkind in ('r','p','S','v','m')
      and c.relname not in (
        'operation','package_role_names','package_schema_names',
        'baseline_roles','baseline_namespaces','baseline_relations',
        'created_roles','created_namespaces','created_relations',
        'created_functions','created_memberships','introduced_grants')
  ) then
    raise exception 'hosted_synthetic_unexpected_object: hosted_synthetic_operation leftover';
  end if;
  for attempt in 1..40 loop
    dropped := 0;
    remaining := 0;
    for rec in
      select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='hosted_synthetic_operation'
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
      raise exception 'hosted_synthetic_ledger_function_dependents';
    end if;
  end loop;
  for rec in
    select c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='hosted_synthetic_operation' and c.relkind in ('r','p','S','v')
  loop
    execute format('drop table hosted_synthetic_operation.%I', rec.relname);
  end loop;
  drop schema hosted_synthetic_operation;
end
$drop_ledger$;

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
-- 4. If this run granted mip_comparison_worker_v1 to authenticator, revoke that
--    membership. 90_cleanup.sql does so when authenticator exists and the worker
--    role is in created_roles.
