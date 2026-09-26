-- Hosted-synthetic operation ledger. Isolated qualification only.
-- Created first. Records EXACT roles/schemas/relations/functions/grants this
-- operation introduces. Cleanup may drop only ledger rows. Pre-existing
-- package roles/schemas are refused. Not a production migration. qik only.
begin;

create schema hosted_synthetic_operation;
revoke all on schema hosted_synthetic_operation from public,anon,authenticated,service_role;

create table hosted_synthetic_operation.operation(
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  producer_session_id uuid,
  producer_expires_at timestamptz,
  window_005_20 text not null default 'pending'
    check(window_005_20 in ('pending','atomic_closed','needs_recovery','recovered'))
);
insert into hosted_synthetic_operation.operation default values;

create table hosted_synthetic_operation.package_role_names(
  rolname text primary key
);
insert into hosted_synthetic_operation.package_role_names(rolname) values
  ('qual_public_reader'),('qual_comparison_producer'),('qual_comparison_worker'),
  ('qual_comparison_scheduler'),('qual_selector'),('qual_publisher'),('qual_membership_scorer'),
  ('mip_identity_broker_v2'),('mip_journal_gateway_v2'),('mip_journal_owner_v2'),
  ('mip_identity_owner_v2'),('mip_kernel_owner_v2'),
  ('mip_comparison_worker_v1'),('mip_comparison_producer_v1'),('mip_projection_publisher_v1'),
  ('mip_comparison_worker_owner_v1'),('mip_comparison_producer_owner_v1'),
  ('mip_projection_publisher_owner_v1'),
  ('mip_collector_scheduler_v1'),('mip_collector_worker_v1'),('mip_projection_builder_v1'),
  ('mip_cutover_authority_admin_v1'),('mip_cutover_recovery_v1'),
  ('mip_retention_writer_v1'),('mip_retention_reader_v1'),
  ('mip_cutover_schema_owner_v1');

create table hosted_synthetic_operation.package_schema_names(
  nspname text primary key
);
insert into hosted_synthetic_operation.package_schema_names(nspname) values
  ('comparison_qualification'),('mip_identity'),('mip_cutover_authority');

create table hosted_synthetic_operation.baseline_roles(rolname text primary key);
create table hosted_synthetic_operation.baseline_namespaces(nspname text primary key);
create table hosted_synthetic_operation.baseline_relations(
  nspname text not null,relname text not null,primary key(nspname,relname));

create table hosted_synthetic_operation.created_roles(rolname text primary key);
create table hosted_synthetic_operation.created_namespaces(nspname text primary key);
create table hosted_synthetic_operation.created_relations(
  nspname text not null,relname text not null,relkind text not null,
  primary key(nspname,relname));
create table hosted_synthetic_operation.created_functions(
  signature text primary key);
create table hosted_synthetic_operation.created_memberships(
  member_role text not null,granted_role text not null,
  primary key(member_role,granted_role));
create table hosted_synthetic_operation.introduced_grants(
  id uuid primary key default gen_random_uuid(),
  grantee text not null,object_kind text not null
    check(object_kind in ('table','column','schema')),
  schema_name text not null,object_name text not null,column_name text not null default '',
  privilege text not null,status text not null
    check(status in ('introduced','revoked')),
  unique(grantee,object_kind,schema_name,object_name,column_name,privilege)
);

create function hosted_synthetic_operation.snapshot_baseline()
returns void language plpgsql as $$
begin
  insert into hosted_synthetic_operation.baseline_roles
    select rolname::text from pg_roles on conflict do nothing;
  insert into hosted_synthetic_operation.baseline_namespaces
    select nspname::text from pg_namespace on conflict do nothing;
  insert into hosted_synthetic_operation.baseline_relations
    select n.nspname::text,c.relname::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','S','v','m')
    on conflict do nothing;
end $$;

create function hosted_synthetic_operation.refuse_preexisting()
returns void language plpgsql as $$
declare rec record;
begin
  for rec in
    select p.rolname from hosted_synthetic_operation.package_role_names p
    join pg_roles r on r.rolname=p.rolname
  loop
    raise exception 'hosted_synthetic_preexisting_role: %', rec.rolname;
  end loop;
  for rec in
    select s.nspname from hosted_synthetic_operation.package_schema_names s
    where to_regnamespace(s.nspname) is not null
  loop
    raise exception 'hosted_synthetic_preexisting_schema: %', rec.nspname;
  end loop;
end $$;

create function hosted_synthetic_operation.capture_step(p_step text)
returns void language plpgsql as $$
begin
  insert into hosted_synthetic_operation.created_roles(rolname)
  select p.rolname from hosted_synthetic_operation.package_role_names p
  join pg_roles r on r.rolname=p.rolname
  where p.rolname not in (select rolname from hosted_synthetic_operation.baseline_roles)
  on conflict do nothing;

  insert into hosted_synthetic_operation.created_namespaces(nspname)
  select s.nspname from hosted_synthetic_operation.package_schema_names s
  where to_regnamespace(s.nspname) is not null
    and s.nspname not in (select nspname from hosted_synthetic_operation.baseline_namespaces)
  on conflict do nothing;

  insert into hosted_synthetic_operation.created_relations(nspname,relname,relkind)
  select n.nspname::text,c.relname::text,c.relkind::text
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  join hosted_synthetic_operation.package_schema_names s on s.nspname=n.nspname
  where c.relkind in ('r','p','S','v','m')
    and not exists (
      select 1 from hosted_synthetic_operation.baseline_relations b
      where b.nspname=n.nspname::text and b.relname=c.relname::text)
  on conflict do nothing;

  insert into hosted_synthetic_operation.created_functions(signature)
  select p.oid::regprocedure::text
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join hosted_synthetic_operation.package_schema_names s on s.nspname=n.nspname
  on conflict do nothing;

  insert into hosted_synthetic_operation.created_memberships(member_role,granted_role)
  select mem.rolname::text,rol.rolname::text
  from pg_auth_members m
  join pg_roles mem on mem.oid=m.member
  join pg_roles rol on rol.oid=m.roleid
  where mem.rolname in (select rolname from hosted_synthetic_operation.created_roles)
     or rol.rolname in (select rolname from hosted_synthetic_operation.created_roles)
  on conflict do nothing;

  perform hosted_synthetic_operation.record_public_source_grants();
end $$;

create function hosted_synthetic_operation.record_public_source_grants()
returns void language plpgsql as $$
declare r text; rel text; col text;
        rels text[] := array['events','event_articles','articles','pipeline_config'];
begin
  for r in select rolname from hosted_synthetic_operation.created_roles loop
    foreach rel in array rels loop
      if to_regclass('public.'||rel) is null then continue; end if;
      if has_table_privilege(r, format('public.%I', rel), 'SELECT') then
        insert into hosted_synthetic_operation.introduced_grants
          (grantee,object_kind,schema_name,object_name,column_name,privilege,status)
        values (r,'table','public',rel,'','SELECT','introduced')
        on conflict (grantee,object_kind,schema_name,object_name,column_name,privilege)
          do update set status='introduced';
      else
        for col in
          select a.attname::text
          from pg_attribute a
          join pg_class c on c.oid=a.attrelid
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname=rel and a.attnum>0 and not a.attisdropped
        loop
          if has_column_privilege(r, format('public.%I', rel), col, 'SELECT') then
            insert into hosted_synthetic_operation.introduced_grants
              (grantee,object_kind,schema_name,object_name,column_name,privilege,status)
            values (r,'column','public',rel,col,'SELECT','introduced')
            on conflict (grantee,object_kind,schema_name,object_name,column_name,privilege)
              do update set status='introduced';
          end if;
        end loop;
      end if;
    end loop;
  end loop;
  -- Exact 005 grant, not has_schema_privilege (PUBLIC keeps default USAGE).
  if exists (select 1 from hosted_synthetic_operation.created_roles where rolname='mip_kernel_owner_v2') then
    insert into hosted_synthetic_operation.introduced_grants
      (grantee,object_kind,schema_name,object_name,column_name,privilege,status)
    values ('mip_kernel_owner_v2','schema','public','','','USAGE','introduced')
    on conflict (grantee,object_kind,schema_name,object_name,column_name,privilege) do nothing;
  end if;
end $$;

create function hosted_synthetic_operation.mark_cleared_public_source_grants()
returns void language plpgsql as $$
declare rec record;
        still boolean;
begin
  for rec in select * from hosted_synthetic_operation.introduced_grants
    where status='introduced' and privilege='SELECT' and schema_name='public'
  loop
    if rec.object_kind='table' then
      still := has_table_privilege(rec.grantee, format('public.%I', rec.object_name), 'SELECT');
    else
      still := has_column_privilege(rec.grantee, format('public.%I', rec.object_name), rec.column_name, 'SELECT');
    end if;
    if not still then
      update hosted_synthetic_operation.introduced_grants set status='revoked' where id=rec.id;
    end if;
  end loop;
end $$;

create function hosted_synthetic_operation.recover_public_source_selects(p_clear_created_role_source_select boolean default true)
returns void language plpgsql as $$
declare rec record;
        r text; rel text; col text;
        cols text;
        rels text[] := array['events','event_articles','articles','pipeline_config'];
begin
  if not exists (select 1 from hosted_synthetic_operation.operation) then
    raise exception 'hosted_synthetic_recovery_requires_ledger';
  end if;
  if p_clear_created_role_source_select then
    -- Sync roles this operation created vs baseline. Do not capture relations
    -- (that would treat unexpected same-schema objects as owned).
    insert into hosted_synthetic_operation.created_roles(rolname)
    select p.rolname from hosted_synthetic_operation.package_role_names p
    join pg_roles pr on pr.rolname=p.rolname
    where p.rolname not in (select rolname from hosted_synthetic_operation.baseline_roles)
    on conflict do nothing;
    perform hosted_synthetic_operation.record_public_source_grants();
  end if;

  for rec in select * from hosted_synthetic_operation.introduced_grants
    where status='introduced' and schema_name='public'
      and (
        (privilege='SELECT' and object_name in ('events','event_articles','articles','pipeline_config'))
        or (object_kind='schema' and privilege='USAGE')
      )
  loop
    if rec.object_kind='table' and rec.privilege='SELECT' then
      execute format('revoke select on public.%I from %I', rec.object_name, rec.grantee);
    elsif rec.object_kind='column' and rec.privilege='SELECT' and rec.column_name <> '' then
      execute format('revoke select (%I) on public.%I from %I',
        rec.column_name, rec.object_name, rec.grantee);
    elsif rec.object_kind='schema' and rec.privilege='USAGE' then
      execute format('revoke usage on schema %I from %I', rec.schema_name, rec.grantee);
    end if;
    update hosted_synthetic_operation.introduced_grants set status='revoked' where id=rec.id;
  end loop;

  if p_clear_created_role_source_select then
    -- Exact 005/20 contract. Do not REVOKE FROM PUBLIC. Inherited leftovers refuse.
    for r in select rolname from hosted_synthetic_operation.created_roles loop
      foreach rel in array rels loop
        if to_regclass('public.'||rel) is null then continue; end if;
        execute format('revoke select on public.%I from %I', rel, r);
        cols := null;
        for rec in
          select column_name
          from information_schema.column_privileges
          where grantee=r and table_schema='public' and table_name=rel
            and privilege_type='SELECT'
        loop
          cols := coalesce(cols || ',','') || quote_ident(rec.column_name);
        end loop;
        if cols is not null then
          execute format('revoke select (%s) on public.%I from %I', cols, rel, r);
        end if;
        if has_table_privilege(r, format('public.%I', rel), 'SELECT') then
          raise exception 'hosted_synthetic_residual_public_select: % public.%', r, rel;
        end if;
        for col in
          select a.attname::text
          from pg_attribute a
          join pg_class c on c.oid=a.attrelid
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname=rel and a.attnum>0 and not a.attisdropped
        loop
          if has_column_privilege(r, format('public.%I', rel), col, 'SELECT') then
            raise exception 'hosted_synthetic_residual_public_column_select: % public.%.%',
              r, rel, col;
          end if;
        end loop;
      end loop;
    end loop;
    update hosted_synthetic_operation.operation set window_005_20='recovered'
      where window_005_20 in ('pending','needs_recovery');
  end if;
end $$;

create function hosted_synthetic_operation.refuse_unexpected_package_objects()
returns void language plpgsql as $$
declare rec record;
begin
  for rec in
    select n.nspname::text as nspname,c.relname::text as relname,
           pg_get_userbyid(c.relowner) as owner
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join hosted_synthetic_operation.package_schema_names s on s.nspname=n.nspname
    where c.relkind in ('r','p','S','v','m')
  loop
    if not exists (
      select 1 from hosted_synthetic_operation.created_relations x
      where x.nspname=rec.nspname and x.relname=rec.relname
    ) then
      raise exception 'hosted_synthetic_unexpected_object: %.% owner=%',
        rec.nspname, rec.relname, rec.owner;
    end if;
  end loop;
  for rec in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    join hosted_synthetic_operation.package_schema_names s on s.nspname=n.nspname
  loop
    if not exists (
      select 1 from hosted_synthetic_operation.created_functions x
      where x.signature=rec.signature
    ) then
      raise exception 'hosted_synthetic_unexpected_function: %', rec.signature;
    end if;
  end loop;
end $$;

create function hosted_synthetic_operation.refuse_unrelated_public_privileges()
returns void language plpgsql as $$
declare rec record;
        r text; rel text; col text;
        rels text[] := array['events','event_articles','articles','pipeline_config'];
begin
  -- Effective table and column SELECT (direct or inherited). Do not REVOKE FROM PUBLIC.
  for r in select rolname from hosted_synthetic_operation.created_roles loop
    foreach rel in array rels loop
      if to_regclass('public.'||rel) is null then continue; end if;
      if has_table_privilege(r, format('public.%I', rel), 'SELECT') then
        raise exception 'hosted_synthetic_residual_public_select: % public.%', r, rel;
      end if;
      for col in
        select a.attname::text
        from pg_attribute a
        join pg_class c on c.oid=a.attrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname=rel and a.attnum>0 and not a.attisdropped
      loop
        if has_column_privilege(r, format('public.%I', rel), col, 'SELECT') then
          raise exception 'hosted_synthetic_residual_public_column_select: % public.%.%',
            r, rel, col;
        end if;
      end loop;
    end loop;
  end loop;
  for rec in
    select tp.grantee::text as grantee,tp.table_name::text as table_name
    from information_schema.table_privileges tp
    join hosted_synthetic_operation.created_roles c on c.rolname=tp.grantee
    where tp.table_schema='public' and tp.privilege_type='SELECT'
      and tp.table_name <> all(rels)
  loop
    raise exception 'hosted_synthetic_unrelated_privilege: % SELECT public.%',
      rec.grantee, rec.table_name;
  end loop;
  for rec in
    select cp.grantee::text as grantee,cp.table_name::text as table_name,
           cp.column_name::text as column_name
    from information_schema.column_privileges cp
    join hosted_synthetic_operation.created_roles c on c.rolname=cp.grantee
    where cp.table_schema='public' and cp.privilege_type='SELECT'
      and cp.table_name <> all(rels)
  loop
    raise exception 'hosted_synthetic_unrelated_privilege: % SELECT public.%.%',
      rec.grantee, rec.table_name, rec.column_name;
  end loop;
end $$;

select hosted_synthetic_operation.snapshot_baseline();
select hosted_synthetic_operation.refuse_preexisting();
commit;
