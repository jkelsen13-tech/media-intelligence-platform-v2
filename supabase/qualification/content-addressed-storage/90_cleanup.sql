-- Drop only ledgered package identities. No public-table CASCADE, no secret wipe.
set session authorization postgres;
begin;
do $cleanup$
declare extra text;
        r record;
        drop_sql text;
begin
  if not exists (select 1 from pg_namespace where nspname='mip_cas_source_install') then
    raise exception 'mip_cas_install_ledger_missing';
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
  -- CASCADE here drops only trigger dependents of these functions (still inside mip_cas).
  select 'drop function '||string_agg(p.oid::regprocedure::text, ', ')||' cascade'
    into drop_sql
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='mip_cas';
  if drop_sql is not null then
    execute drop_sql;
  end if;
  select 'drop table '||string_agg(format('%I.%I', n.nspname, c.relname), ', ')
    into drop_sql
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='mip_cas' and c.relkind='r';
  if drop_sql is not null then
    execute drop_sql;
  end if;
  if exists (select 1 from pg_namespace where nspname='mip_cas') then
    execute 'drop schema mip_cas restrict';
  end if;
  for r in
    select mem.rolname as member_name, granted.rolname as role_name
    from pg_auth_members m
    join pg_roles granted on granted.oid=m.roleid
    join pg_roles mem on mem.oid=m.member
    where granted.rolname in (select identity from mip_cas_source_install.objects where kind='role')
  loop
    execute format('revoke %I from %I', r.role_name, r.member_name);
  end loop;
  for r in select identity from mip_cas_source_install.objects where kind='role' order by identity
  loop
    if exists (select 1 from pg_roles where rolname=r.identity) then
      execute format('drop role %I', r.identity);
    end if;
  end loop;
end
$cleanup$;
drop table mip_cas_source_install.objects;
drop schema mip_cas_source_install restrict;
commit;
