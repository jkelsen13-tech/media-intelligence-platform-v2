-- C3 operation ledger. Created first. Records EXACT roles/namespaces/relations/
-- functions/policies/triggers/grants this package introduces, plus collection
-- constraints it temporarily drops. Cleanup may drop only ledger rows.
-- Refuse pre-existing package identities. Not a production migration.
begin;

do $refuse_leftover$
begin
  if to_regnamespace('qik_ingest_operation') is not null then
    raise exception 'qik_ingest_preexisting_schema: qik_ingest_operation';
  end if;
  if to_regnamespace('qik_ingest') is not null then
    raise exception 'qik_ingest_preexisting_schema: qik_ingest';
  end if;
  if exists (
    select 1 from pg_roles
    where rolname in ('qik_ingest_fn_owner','qik_ingest_runtime')
  ) then
    raise exception 'qik_ingest_preexisting_role';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'mip_qik_ingest_%'
  ) then
    raise exception 'qik_ingest_preexisting_function';
  end if;
  -- capture_step inventories this reserved prefix on every relation. Refuse
  -- pre-existing identities before installing or replacing any package object.
  if exists (select 1 from pg_policy where polname like 'qik_ingest_%') then
    raise exception 'qik_ingest_preexisting_policy';
  end if;
  if exists (select 1 from pg_trigger where tgname like 'qik_ingest_%' and not tgisinternal) then
    raise exception 'qik_ingest_preexisting_trigger';
  end if;
end
$refuse_leftover$;

create schema qik_ingest_operation;
revoke all on schema qik_ingest_operation from public,anon,authenticated,service_role;

create table qik_ingest_operation.package_role_names(rolname text primary key);
insert into qik_ingest_operation.package_role_names(rolname) values
  ('qik_ingest_fn_owner'),('qik_ingest_runtime');

create table qik_ingest_operation.package_schema_names(nspname text primary key);
insert into qik_ingest_operation.package_schema_names(nspname) values ('qik_ingest');

create table qik_ingest_operation.baseline_roles(rolname text primary key);
create table qik_ingest_operation.baseline_namespaces(nspname text primary key);
create table qik_ingest_operation.baseline_relations(
  nspname text not null,relname text not null,primary key(nspname,relname));

create table qik_ingest_operation.created_roles(rolname text primary key);
create table qik_ingest_operation.created_namespaces(nspname text primary key);
create table qik_ingest_operation.created_relations(
  nspname text not null,relname text not null,relkind text not null,
  primary key(nspname,relname));
create table qik_ingest_operation.created_functions(signature text primary key);
create table qik_ingest_operation.created_memberships(
  member_role text not null,granted_role text not null,grantor text not null,
  admin_option boolean not null,inherit_option boolean not null,set_option boolean not null,
  primary key(member_role,granted_role,grantor));
create table qik_ingest_operation.created_policies(
  schemaname text not null,tablename text not null,policyname text not null,
  primary key(schemaname,tablename,policyname));
create table qik_ingest_operation.created_triggers(
  nspname text not null,relname text not null,tgname text not null,
  primary key(nspname,relname,tgname));
create table qik_ingest_operation.dropped_constraints(
  nspname text not null,relname text not null,conname text not null,
  definition text not null,
  primary key(nspname,relname,conname));
create table qik_ingest_operation.introduced_grants(
  id uuid primary key default gen_random_uuid(),
  grantee text not null,object_kind text not null
    check(object_kind in ('table','column','schema','function','sequence')),
  schema_name text not null,object_name text not null,column_name text not null default '',
  privilege text not null,grantor text not null default current_user,
  is_grantable boolean not null default false,status text not null
    check(status in ('introduced','revoked')),
  unique(grantee,object_kind,schema_name,object_name,column_name,privilege,grantor)
);

create function qik_ingest_operation.snapshot_baseline()
returns void language plpgsql as $$
begin
  insert into qik_ingest_operation.baseline_roles
    select rolname::text from pg_roles on conflict do nothing;
  insert into qik_ingest_operation.baseline_namespaces
    select nspname::text from pg_namespace on conflict do nothing;
  insert into qik_ingest_operation.baseline_relations
    select n.nspname::text,c.relname::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','S','v','m')
    on conflict do nothing;
end $$;

create function qik_ingest_operation.current_external_grants()
returns table(grantee text,object_kind text,schema_name text,object_name text,column_name text,privilege text,grantor text,is_grantable boolean)
language sql set search_path='' as $$
 select r.rolname::text,case when c.relkind='S' then 'sequence' else 'table' end,
 n.nspname::text,c.relname::text,''::text,a.privilege_type::text,pg_get_userbyid(a.grantor)::text,a.is_grantable
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 cross join lateral aclexplode(c.relacl) a join pg_roles r on r.oid=a.grantee
 join qik_ingest_operation.created_roles own on own.rolname=r.rolname
 where n.nspname not in ('qik_ingest','qik_ingest_operation') and c.relowner<>r.oid
 union all
 select r.rolname::text,'column',n.nspname::text,c.relname::text,at.attname::text,a.privilege_type::text,pg_get_userbyid(a.grantor)::text,a.is_grantable
 from pg_attribute at join pg_class c on c.oid=at.attrelid join pg_namespace n on n.oid=c.relnamespace
 cross join lateral aclexplode(at.attacl) a join pg_roles r on r.oid=a.grantee
 join qik_ingest_operation.created_roles own on own.rolname=r.rolname
 where n.nspname not in ('qik_ingest','qik_ingest_operation') and c.relowner<>r.oid
 union all
 select r.rolname::text,'function',n.nspname::text,p.proname::text,pg_get_function_identity_arguments(p.oid),a.privilege_type::text,pg_get_userbyid(a.grantor)::text,a.is_grantable
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
 join qik_ingest_operation.created_roles own on own.rolname=r.rolname
 where n.nspname not in ('qik_ingest','qik_ingest_operation') and p.proowner<>r.oid
 union all
 select r.rolname::text,'schema',n.nspname::text,''::text,''::text,a.privilege_type::text,pg_get_userbyid(a.grantor)::text,a.is_grantable
 from pg_namespace n cross join lateral aclexplode(n.nspacl) a join pg_roles r on r.oid=a.grantee
 join qik_ingest_operation.created_roles own on own.rolname=r.rolname
 where n.nspname not in ('qik_ingest','qik_ingest_operation') and n.nspowner<>r.oid;
$$;

create function qik_ingest_operation.record_introduced_grants()
returns void language plpgsql as $$
begin
 insert into qik_ingest_operation.introduced_grants
 (grantee,object_kind,schema_name,object_name,column_name,privilege,grantor,is_grantable,status)
 select grantee,object_kind,schema_name,object_name,column_name,privilege,grantor,is_grantable,'introduced'
 from qik_ingest_operation.current_external_grants()
 on conflict(grantee,object_kind,schema_name,object_name,column_name,privilege,grantor)
 do update set status='introduced',is_grantable=excluded.is_grantable;
end $$;

create function qik_ingest_operation.capture_step(p_step text)
returns void language plpgsql as $$
begin
  insert into qik_ingest_operation.created_roles(rolname)
  select p.rolname from qik_ingest_operation.package_role_names p
  join pg_roles r on r.rolname=p.rolname
  where p.rolname not in (select rolname from qik_ingest_operation.baseline_roles)
  on conflict do nothing;

  insert into qik_ingest_operation.created_namespaces(nspname)
  select s.nspname from qik_ingest_operation.package_schema_names s
  where to_regnamespace(s.nspname) is not null
    and s.nspname not in (select nspname from qik_ingest_operation.baseline_namespaces)
  on conflict do nothing;

  insert into qik_ingest_operation.created_relations(nspname,relname,relkind)
  select n.nspname::text,c.relname::text,c.relkind::text
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  join qik_ingest_operation.package_schema_names s on s.nspname=n.nspname
  where c.relkind in ('r','p','S','v','m')
    and not exists (
      select 1 from qik_ingest_operation.baseline_relations b
      where b.nspname=n.nspname::text and b.relname=c.relname::text)
  on conflict do nothing;

  insert into qik_ingest_operation.created_functions(signature)
  select p.oid::regprocedure::text
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='qik_ingest'
     or (n.nspname='public' and p.proname like 'mip_qik_ingest_%')
  on conflict do nothing;

  insert into qik_ingest_operation.created_memberships(member_role,granted_role,grantor,admin_option,inherit_option,set_option)
  select mem.rolname::text,rol.rolname::text,pg_get_userbyid(m.grantor),
         m.admin_option,m.inherit_option,m.set_option
  from pg_auth_members m
  join pg_roles mem on mem.oid=m.member
  join pg_roles rol on rol.oid=m.roleid
  where mem.rolname in (select rolname from qik_ingest_operation.created_roles)
     or rol.rolname in (select rolname from qik_ingest_operation.created_roles)
  on conflict do nothing;

  insert into qik_ingest_operation.created_policies(schemaname,tablename,policyname)
  select n.nspname,c.relname,pol.polname
  from pg_policy pol
  join pg_class c on c.oid=pol.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where pol.polname like 'qik_ingest_%' or n.nspname='qik_ingest'
  on conflict do nothing;

  insert into qik_ingest_operation.created_triggers(nspname,relname,tgname)
  select n.nspname,c.relname,t.tgname
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where t.tgname like 'qik_ingest_%' and not t.tgisinternal
  on conflict do nothing;

  perform qik_ingest_operation.record_introduced_grants();
end $$;

create function qik_ingest_operation.refuse_unexpected_package_objects()
returns void language plpgsql as $$
declare rec record;
begin
  for rec in
    select n.nspname::text as nspname,c.relname::text as relname,
           pg_get_userbyid(c.relowner) as owner
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='qik_ingest' and c.relkind in ('r','p','S','v','m')
  loop
    if not exists (
      select 1 from qik_ingest_operation.created_relations x
      where x.nspname=rec.nspname and x.relname=rec.relname
    ) then
      raise exception 'qik_ingest_unexpected_object: %.% owner=%',
        rec.nspname, rec.relname, rec.owner;
    end if;
  end loop;
  for rec in
    select n.nspname::text as nspname,c.relname::text as relname,
           pg_get_userbyid(c.relowner) as owner
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_roles own on own.oid=c.relowner
    where own.rolname in (select rolname from qik_ingest_operation.created_roles)
      and n.nspname not in ('qik_ingest','qik_ingest_operation')
      and c.relkind in ('r','p','S','v','m')
  loop
    raise exception 'qik_ingest_unexpected_object: %.% owner=%',
      rec.nspname, rec.relname, rec.owner;
  end loop;
  for rec in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='qik_ingest'
       or (n.nspname='public' and p.proname like 'mip_qik_ingest_%')
  loop
    if not exists (
      select 1 from qik_ingest_operation.created_functions x
      where x.signature=rec.signature
    ) then
      raise exception 'qik_ingest_unexpected_function: %', rec.signature;
    end if;
  end loop;
end $$;

create function qik_ingest_operation.refuse_unrelated_public_privileges()
returns void language plpgsql as $$
begin
 if exists(
   select 1 from qik_ingest_operation.current_external_grants() a
   where not exists(select 1 from qik_ingest_operation.introduced_grants g
     where (g.grantee,g.object_kind,g.schema_name,g.object_name,g.column_name,g.privilege,g.grantor,g.is_grantable)
       =(a.grantee,a.object_kind,a.schema_name,a.object_name,a.column_name,a.privilege,a.grantor,a.is_grantable)
       and g.status='introduced')
 ) then raise exception 'qik_ingest_unrelated_privilege'; end if;
end $$;

create function qik_ingest_operation.refuse_membership_drift()
returns void language plpgsql as $
begin
  if exists (
    with current_memberships as (
      select mem.rolname::text member_role,rol.rolname::text granted_role,
             pg_get_userbyid(m.grantor)::text grantor,m.admin_option,m.inherit_option,m.set_option
      from pg_auth_members m
      join pg_roles mem on mem.oid=m.member
      join pg_roles rol on rol.oid=m.roleid
      where mem.rolname in (select rolname from qik_ingest_operation.created_roles)
         or rol.rolname in (select rolname from qik_ingest_operation.created_roles)
    )
    (select * from current_memberships except select * from qik_ingest_operation.created_memberships)
    union all
    (select * from qik_ingest_operation.created_memberships except select * from current_memberships)
  ) then
    raise exception 'qik_ingest_membership_drift';
  end if;
end $;

select qik_ingest_operation.snapshot_baseline();
commit;
