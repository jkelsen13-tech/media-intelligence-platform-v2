-- Synthetic PostgreSQL17.6 qualification only; never an application migration.
-- Bootstrap is used solely for fixture setup, inspection and cleanup.
do $guard$ begin
 if current_setting('mip.qualification',true) is distinct from 'synthetic-role-creator-pg17-only'
 or current_setting('server_version_num')::integer<>170006 then
  raise exception 'Explicit synthetic PostgreSQL17.6 context required';end if;
 if session_user<>current_user or not exists(select 1 from pg_roles where rolname=current_user and rolsuper) then
  raise exception 'Disposable fixture bootstrap required';end if;
 if exists(select 1 from pg_roles where rolname in ('nq17_parent','nq17_creator','nq17_owner'))
 or exists(select 1 from pg_namespace where nspname in ('nq17_stage','qik_ingest','qik_ingest_operation','evidence_pipeline','mip_identity','comparison_qualification','mip_comparison_kernel_v1'))
 or to_regclass('public.articles') is not null then
  raise exception 'Non-pristine or application-bearing target refused';end if;
end $guard$;

-- Catalog-only snapshots. No password, application row or secret is selected.
create temporary view nq17_catalog as select
 (select jsonb_agg(jsonb_build_object('oid',oid,'name',rolname,'super',rolsuper,'inherit',rolinherit,'createrole',rolcreaterole,'createdb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass',rolbypassrls,'connections',rolconnlimit,'valid_until',rolvaliduntil,'config',rolconfig) order by oid) from pg_roles) roles,
 (select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member,grantor),'[]'::jsonb) from pg_auth_members m) memberships;
create temporary table nq17_global_baseline as select * from nq17_catalog;
begin;
create role nq17_parent login createrole nosuperuser nocreatedb nobypassrls noreplication inherit;
create schema nq17_stage authorization nq17_parent;
commit;
create temporary table nq17_fixture_baseline as select * from nq17_catalog;

-- Successful non-superuser installer actions, followed by bootstrap inspection.
set session authorization nq17_parent;
do $identity$ begin
 if session_user<>'nq17_parent' or current_user<>'nq17_parent' or not exists(
  select 1 from pg_roles where rolname=current_user and rolcreaterole and not rolsuper and not rolbypassrls)
 then raise exception 'Non-superuser parent required';end if;
end $identity$;
begin;
create role nq17_creator nologin createrole noinherit nosuperuser nocreatedb nobypassrls noreplication;
grant nq17_creator to nq17_parent with inherit false,set true;
set role nq17_creator;
create role nq17_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication;
grant nq17_owner to nq17_parent with inherit true,set true;
reset role;
grant usage,create on schema nq17_stage to nq17_owner;
create table nq17_stage.sample(id integer primary key);
insert into nq17_stage.sample values(7);
alter table nq17_stage.sample owner to nq17_owner;
do $topology$ begin
 if not exists(select 1 from pg_auth_members where roleid='nq17_owner'::regrole and member='nq17_creator'::regrole and admin_option and not inherit_option and not set_option)
 then raise exception 'Automatic creator ADMIN edge missing or changed';end if;
 if not exists(select 1 from pg_auth_members where roleid='nq17_owner'::regrole and member='nq17_parent'::regrole and grantor='nq17_creator'::regrole and inherit_option and set_option)
 then raise exception 'Temporary owner authority missing or changed';end if;
end $topology$;
set role nq17_creator;
revoke nq17_owner from nq17_parent cascade;
reset role;
revoke nq17_creator from nq17_parent;
drop role nq17_creator;
do $success$ begin
 if session_user<>'nq17_parent' or current_user<>'nq17_parent' then raise exception 'Finalization escaped parent identity';end if;
 if exists(select 1 from pg_roles where rolname='nq17_creator') then raise exception 'Creator survived';end if;
 if not exists(select 1 from pg_roles where rolname='nq17_owner' and not(rolcanlogin or rolsuper or rolcreaterole or rolcreatedb or rolbypassrls or rolreplication)) then raise exception 'Owner missing or elevated';end if;
 if exists(select 1 from pg_auth_members where roleid='nq17_owner'::regrole or member='nq17_owner'::regrole) then raise exception 'Owner membership edges remain';end if;
 if not exists(select 1 from pg_class where oid='nq17_stage.sample'::regclass and relowner='nq17_owner'::regrole) then raise exception 'Transferred object missing';end if;
 begin perform id from nq17_stage.sample;raise exception 'Residual SELECT';exception when insufficient_privilege then null;end;
 begin execute 'set role nq17_owner';raise exception 'Residual SET ROLE';exception when insufficient_privilege then null;end;
 if current_user<>'nq17_parent' then raise exception 'Denied SET ROLE changed identity';end if;
end $success$;
reset session authorization;
do $retained$ begin
 if (select count(*) from nq17_stage.sample)<>1 or (select id from nq17_stage.sample)<>7 then raise exception 'Object/data did not survive creator removal';end if;
end $retained$;
rollback;
reset session authorization;

-- An actual failing installer subtransaction must roll back its DDL and grants.
set session authorization nq17_parent;
begin;
do $failure$ declare failed boolean:=false;begin
 if session_user<>'nq17_parent' or current_user<>'nq17_parent' or exists(select 1 from pg_roles where rolname=current_user and(rolsuper or rolbypassrls)) then raise exception 'Non-superuser failure context required';end if;
 begin
  create role nq17_creator nologin createrole noinherit nosuperuser nocreatedb nobypassrls noreplication;
  grant nq17_creator to nq17_parent with inherit false,set true;
  execute 'set role nq17_creator';
  create role nq17_owner nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication;
  grant nq17_owner to nq17_parent with inherit true,set true;
  execute 'reset role';
  grant usage,create on schema nq17_stage to nq17_owner;
  create table nq17_stage.sample(id integer primary key);
  insert into nq17_stage.sample values(11);
  alter table nq17_stage.sample owner to nq17_owner;
  perform 1/0;
 exception when division_by_zero then failed:=true;
 end;
 if not failed then raise exception 'Injected failure missing';end if;
 if session_user<>'nq17_parent' or current_user<>'nq17_parent' then raise exception 'Rollback changed identity';end if;
 if exists(select 1 from pg_roles where rolname in ('nq17_creator','nq17_owner')) or to_regclass('nq17_stage.sample') is not null then raise exception 'Failed subtransaction retained DDL';end if;
end $failure$;
rollback;
reset session authorization;
do $baseline$ begin
 if (select row_to_json(c)::jsonb from nq17_catalog c) is distinct from (select row_to_json(c)::jsonb from nq17_fixture_baseline c) then raise exception 'Fixture role/membership baseline changed';end if;
 if to_regclass('nq17_stage.sample') is not null or not exists(select 1 from pg_namespace where nspname='nq17_stage' and nspowner='nq17_parent'::regrole) then raise exception 'Fixture schema baseline changed';end if;
end $baseline$;
begin;
drop schema nq17_stage;
drop role nq17_parent;
commit;
do $cleanup$ begin
 if (select row_to_json(c)::jsonb from nq17_catalog c) is distinct from (select row_to_json(c)::jsonb from nq17_global_baseline c) then raise exception 'Global role/membership baseline changed';end if;
 if exists(select 1 from pg_namespace where nspname='nq17_stage') or exists(select 1 from pg_roles where rolname in ('nq17_parent','nq17_creator','nq17_owner')) then raise exception 'Synthetic residue remains';end if;
end $cleanup$;
drop table nq17_fixture_baseline;
drop table nq17_global_baseline;
drop view nq17_catalog;
select 'PASS: PostgreSQL17.6 creator isolation, denied residual authority, rollback and cleanup' as qualification;
