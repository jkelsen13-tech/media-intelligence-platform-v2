-- Drop only ledgered package identities. No public-table CASCADE, no secret wipe.
-- Selecting mip_cas functions and DROP FUNCTION CASCADE is not schema-limited:
-- refuse unapproved external dependents, then drop recorded objects RESTRICT.
begin;
do $cleanup$
declare extra text;
        r record;
        drop_sql text;
        attempt int;
        dropped int;
        remaining int;
begin
  if not exists (select 1 from pg_namespace where nspname='mip_cas_source_install') then
    raise exception 'mip_cas_install_ledger_missing';
  end if;
  if exists (
    with current_memberships as (
      select mem.rolname::text member_role,rol.rolname::text granted_role,
             pg_get_userbyid(m.grantor)::text grantor,m.admin_option,m.inherit_option,m.set_option
      from pg_auth_members m
      join pg_roles mem on mem.oid=m.member
      join pg_roles rol on rol.oid=m.roleid
      where mem.rolname in (select identity from mip_cas_source_install.objects where kind='role')
         or rol.rolname in (select identity from mip_cas_source_install.objects where kind='role')
    )
    (select * from current_memberships except select * from mip_cas_source_install.memberships)
    union all
    (select * from mip_cas_source_install.memberships except select * from current_memberships)
  ) then
    raise exception 'mip_cas_membership_drift';
  end if;
  select string_agg(n.nspname||'.'||c.relname, ',' order by 1) into extra
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='mip_cas' and c.relkind='r'
    and not exists (
      select 1 from mip_cas_source_install.objects o
      where o.kind='table' and o.identity=n.nspname||'.'||c.relname
    );
  if extra is not null then
    raise exception 'mip_cas_unexpected_object:%', extra;
  end if;
  select string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', ',' order by 1) into extra
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='mip_cas'
    and not exists (
      select 1 from mip_cas_source_install.objects o
      where o.kind='function'
        and o.identity=n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
    );
  if extra is not null then
    raise exception 'mip_cas_unexpected_object:%', extra;
  end if;
  perform mip_cas_source_install.refuse_external_dependents();

  for r in
    select n.nspname, c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='mip_cas' and not t.tgisinternal
  loop
    execute 'set local role mip_cas_owner';
    execute format('drop trigger %I on %I.%I', r.tgname, r.nspname, r.relname);
    execute 'reset role';
  end loop;

  for attempt in 1..80 loop
    dropped := 0;
    remaining := 0;
    for r in
      select identity from mip_cas_source_install.objects where kind='function'
    loop
      remaining := remaining + 1;
      begin
        execute 'set local role mip_cas_owner';
        execute 'drop function '||r.identity;
        execute 'reset role';
        delete from mip_cas_source_install.objects
          where kind='function' and identity=r.identity;
        dropped := dropped + 1;
      exception
        when undefined_function then
          delete from mip_cas_source_install.objects
            where kind='function' and identity=r.identity;
          dropped := dropped + 1;
        when dependent_objects_still_exist then
          null;
      end;
    end loop;
    exit when remaining = 0;
    if dropped = 0 then
      raise exception 'mip_cas_function_dependents';
    end if;
  end loop;

  select 'drop table '||string_agg(format('%I.%I', n.nspname, c.relname), ', ')
    into drop_sql
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  join mip_cas_source_install.objects o
    on o.kind='table' and o.identity=n.nspname||'.'||c.relname
  where n.nspname='mip_cas' and c.relkind='r';
  if drop_sql is not null then
    execute 'set local role mip_cas_owner';
    execute drop_sql;
    execute 'reset role';
  end if;
  if exists (select 1 from pg_namespace where nspname='mip_cas') then
    execute 'set local role mip_cas_owner';
    execute 'drop schema mip_cas restrict';
    execute 'reset role';
  end if;
  -- Keep creator ADMIN until DROP ROLE; it removes the verified memberships.
  for r in select identity from mip_cas_source_install.objects where kind='role' order by identity
  loop
    if exists (
      select 1 from pg_class c
      join pg_roles own on own.oid=c.relowner
      where own.rolname=r.identity
    ) or exists (
      select 1 from pg_proc p
      join pg_roles own on own.oid=p.proowner
      where own.rolname=r.identity
    ) then
      raise exception 'mip_cas_role_still_owns_objects: %', r.identity;
    end if;
    if exists (select 1 from pg_roles where rolname=r.identity) then
      execute format('drop role %I', r.identity);
    end if;
  end loop;
end
$cleanup$;
drop function if exists mip_cas_source_install.refuse_external_dependents();
drop table mip_cas_source_install.memberships;
drop table mip_cas_source_install.objects;
drop schema mip_cas_source_install restrict;
commit;
