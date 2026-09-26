-- C3 cleanup bound to THIS operation's ledger.
-- Drops only created_roles / created_namespaces / created_relations /
-- created_functions / created_policies / created_triggers / introduced_grants
-- recorded during install. Restores recorded collection constraints.
-- Refuses unexpected same-schema or same-role objects and unrelated public
-- privileges. No DROP OWNED. No schema CASCADE. No public table DROP.
-- Not a production migration.
begin;

do $require_ledger$
begin
  if to_regnamespace('qik_ingest_operation') is null
     or to_regclass('qik_ingest_operation.created_relations') is null then
    raise exception 'qik_ingest_cleanup_requires_ledger';
  end if;
end
$require_ledger$;

do $refuse_live$
begin
  if to_regclass('qik_ingest.collection_gate') is not null
     and coalesce((select collection_authorized from qik_ingest.collection_gate where id), false) then
    raise exception 'qik_ingest_cleanup_refused_gate_on' using errcode = '55000';
  end if;
  if to_regclass('public.ingest_sources') is not null
     and exists (select 1 from public.ingest_sources where collection_enabled) then
    raise exception 'qik_ingest_cleanup_refused_source_enabled' using errcode = '55000';
  end if;
end
$refuse_live$;

select qik_ingest_operation.refuse_unexpected_package_objects();
select qik_ingest_operation.refuse_unrelated_public_privileges();

do $drop_triggers$
declare rec record;
begin
  for rec in select nspname,relname,tgname from qik_ingest_operation.created_triggers loop
    if exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=rec.nspname and c.relname=rec.relname and t.tgname=rec.tgname
    ) then
      execute format('drop trigger %I on %I.%I', rec.tgname, rec.nspname, rec.relname);
    end if;
  end loop;
end
$drop_triggers$;

do $drop_policies$
declare rec record;
begin
  for rec in select schemaname,tablename,policyname from qik_ingest_operation.created_policies loop
    if exists (
      select 1 from pg_policy pol
      join pg_class c on c.oid=pol.polrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=rec.schemaname and c.relname=rec.tablename and pol.polname=rec.policyname
    ) then
      execute format('drop policy %I on %I.%I', rec.policyname, rec.schemaname, rec.tablename);
    end if;
  end loop;
end
$drop_policies$;

do $revoke_grants$
declare rec record;
begin
  for rec in
    select * from qik_ingest_operation.introduced_grants
    where status='introduced'
  loop
    begin
      if rec.object_kind='table' then
        execute format('revoke %s on %I.%I from %I',
          rec.privilege, rec.schema_name, rec.object_name, rec.grantee);
      elsif rec.object_kind='column' and rec.column_name <> '' then
        execute format('revoke %s (%I) on %I.%I from %I',
          rec.privilege, rec.column_name, rec.schema_name, rec.object_name, rec.grantee);
      elsif rec.object_kind='function' and rec.privilege='EXECUTE' then
        execute format('revoke execute on function %I.%I(%s) from %I',
          rec.schema_name,rec.object_name,rec.column_name,rec.grantee);
      elsif rec.object_kind='sequence' then
        execute format('revoke %s on sequence %I.%I from %I',
          rec.privilege,rec.schema_name,rec.object_name,rec.grantee);
      elsif rec.object_kind='schema' then
        execute format('revoke %s on schema %I from %I', rec.privilege,rec.schema_name,rec.grantee);
      end if;
    exception
      when undefined_object then
        null;
    end;
    update qik_ingest_operation.introduced_grants set status='revoked' where id=rec.id;
  end loop;
end
$revoke_grants$;

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
    for rec in select signature from qik_ingest_operation.created_functions loop
      remaining := remaining + 1;
      begin
        execute 'drop function '||rec.signature;
        delete from qik_ingest_operation.created_functions where signature=rec.signature;
        dropped := dropped + 1;
      exception
        when undefined_function then
          delete from qik_ingest_operation.created_functions where signature=rec.signature;
          dropped := dropped + 1;
        when dependent_objects_still_exist then
          null;
      end;
    end loop;
    exit when remaining = 0;
    if dropped = 0 then
      raise exception 'qik_ingest_function_dependents';
    end if;
  end loop;

  for attempt in 1..80 loop
    dropped := 0;
    remaining := 0;
    for rec in select nspname,relname,relkind from qik_ingest_operation.created_relations loop
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
        delete from qik_ingest_operation.created_relations
          where nspname=rec.nspname and relname=rec.relname;
        dropped := dropped + 1;
      exception
        when undefined_table then
          delete from qik_ingest_operation.created_relations
            where nspname=rec.nspname and relname=rec.relname;
          dropped := dropped + 1;
        when dependent_objects_still_exist then
          null;
      end;
    end loop;
    exit when remaining = 0;
    if dropped = 0 then
      raise exception 'qik_ingest_relation_dependents';
    end if;
  end loop;

  perform qik_ingest_operation.refuse_unexpected_package_objects();

  for rec in select nspname from qik_ingest_operation.created_namespaces loop
    execute format('drop schema %I', rec.nspname);
  end loop;
end
$drop_package_objects$;

do $restore_constraints$
declare rec record;
begin
  for rec in select * from qik_ingest_operation.dropped_constraints loop
    if to_regclass(format('%I.%I', rec.nspname, rec.relname)) is null then
      continue;
    end if;
    if not exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid=c.conrelid
      join pg_namespace n on n.oid=t.relnamespace
      where n.nspname=rec.nspname and t.relname=rec.relname and c.conname=rec.conname
    ) then
      execute format('alter table %I.%I add constraint %I %s',
        rec.nspname, rec.relname, rec.conname, rec.definition);
    end if;
  end loop;
end
$restore_constraints$;

do $drop_roles$
declare rec record; r text;
begin
  for rec in select member_role,granted_role from qik_ingest_operation.created_memberships loop
    begin
      execute format('revoke %I from %I', rec.granted_role, rec.member_role);
    exception
      when undefined_object then
        null;
    end;
  end loop;
  if exists (select 1 from pg_roles where rolname='authenticator') then
    for r in select rolname from qik_ingest_operation.created_roles loop
      begin
        execute format('revoke %I from authenticator', r);
      exception
        when undefined_object then
          null;
      end;
    end loop;
  end if;
  for r in select rolname from qik_ingest_operation.created_roles loop
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
      where own.rolname=r and n.nspname <> 'qik_ingest_operation'
    ) then
      raise exception 'qik_ingest_role_still_owns_objects: %', r;
    end if;
    begin
      execute format('drop role %I', r);
    exception
      when dependent_objects_still_exist then
        raise exception 'qik_ingest_role_has_unexpected_dependents: % %', r, sqlerrm;
    end;
  end loop;
end
$drop_roles$;

do $drop_ledger$
declare rec record; attempt int; dropped int; remaining int;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='qik_ingest_operation'
      and c.relkind in ('r','p','S','v','m')
      and c.relname not in (
        'package_role_names','package_schema_names',
        'baseline_roles','baseline_namespaces','baseline_relations',
        'created_roles','created_namespaces','created_relations',
        'created_functions','created_memberships','created_policies',
        'created_triggers','dropped_constraints','introduced_grants')
  ) then
    raise exception 'qik_ingest_unexpected_object: qik_ingest_operation leftover';
  end if;
  for attempt in 1..40 loop
    dropped := 0;
    remaining := 0;
    for rec in
      select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='qik_ingest_operation'
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
      raise exception 'qik_ingest_ledger_function_dependents';
    end if;
  end loop;
  for rec in
    select c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='qik_ingest_operation' and c.relkind in ('r','p','S','v')
  loop
    execute format('drop table qik_ingest_operation.%I', rec.relname);
  end loop;
  drop schema qik_ingest_operation;
end
$drop_ledger$;

commit;
