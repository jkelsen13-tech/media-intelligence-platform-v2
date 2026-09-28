-- Explicit qik storage qualification successor, NOT a deployment migration.
-- No existing corpus mutation, source SELECT, identity admission or release.
begin;
set local lock_timeout='5s';
set local statement_timeout='5s';
-- Validate before creating any objects. Existing compatibility tables require
-- reconciliation, not CREATE IF NOT EXISTS pretending their shape matches.
do $source$
declare relation_name text;key_table text;target oid;
begin
 if to_regclass('public.article_entities') is not null
  or to_regclass('public.arc_membership_release_policy') is not null
  or to_regnamespace('mip_arc_qik_source') is not null
  or exists(select 1 from pg_roles where rolname='mip_arc_qik_source_owner')
 then raise exception 'arc_qik_source_existing_contract';end if;
 foreach relation_name in array array['articles','entities','story_arcs','pipeline_config','arc_membership_candidates'] loop
  target:=to_regclass('public.'||relation_name);
  if target is null or not exists(select 1 from pg_class where oid=target and relkind='r' and relrowsecurity)
   then raise exception 'arc_qik_source_relation_shape';end if;
 end loop;
 -- Pin validated source relation definitions until this installation commits.
 lock table public.articles,public.entities,public.story_arcs,public.pipeline_config,
  public.arc_membership_candidates in access share mode;
 -- An earlier catalog read is not the selected shape: concurrent DDL may have
 -- committed while these locks waited. Recheck every source under the locks.
 foreach relation_name in array array['articles','entities','story_arcs','pipeline_config','arc_membership_candidates'] loop
  target:=to_regclass('public.'||relation_name);
  if target is null or not exists(select 1 from pg_class where oid=target and relkind='r' and relrowsecurity)
   then raise exception 'arc_qik_source_relation_shape';end if;
 end loop;
 foreach key_table in array array['articles','entities','story_arcs'] loop
  target:=to_regclass('public.'||key_table);
  if not exists(select 1 from pg_attribute a where a.attrelid=target and a.attname='id'
    and a.atttypid='uuid'::regtype and a.attnotnull and not a.attisdropped
    and exists(select 1 from pg_constraint c where c.conrelid=target and c.contype='p'
      and c.conkey=array[a.attnum]::smallint[]))
   then raise exception 'arc_qik_source_identity_shape';end if;
 end loop;
 if not exists(select 1 from pg_attribute where attrelid='public.story_arcs'::regclass
   and attname='started_at' and atttypid='date'::regtype and attnotnull and not attisdropped)
 then raise exception 'arc_qik_source_date_shape';end if;
end $source$;
create role mip_arc_qik_source_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant mip_arc_qik_source_owner to current_user with set true;
create schema mip_arc_qik_source authorization mip_arc_qik_source_owner;
revoke all on schema mip_arc_qik_source from public;
-- Temporary CREATE is only for new compatibility tables in public.
grant usage,create on schema public to mip_arc_qik_source_owner;
grant references(id) on public.articles,public.entities to mip_arc_qik_source_owner;
set role mip_arc_qik_source_owner;
create table public.article_entities(
 article_id uuid not null references public.articles(id),
 entity_id uuid not null references public.entities(id),
 confidence numeric not null check(confidence between 0 and 1),
 extraction_method text not null check(octet_length(extraction_method) between 1 and 128),
 role text check(role is null or octet_length(role)<=256),
 created_at timestamptz not null default now(),
 primary key(article_id,entity_id));
create index article_entities_entity_idx on public.article_entities(entity_id);
create table public.arc_membership_release_policy(
 model_version text primary key check(octet_length(model_version) between 1 and 128),
 fixture_passed boolean not null default false,
 auto_approval_enabled boolean not null default false,
 auto_approval_threshold numeric,
 constraint qik_arc_release_closed check(not auto_approval_enabled and auto_approval_threshold is null));
alter table public.article_entities enable row level security;
alter table public.article_entities force row level security;
alter table public.arc_membership_release_policy enable row level security;
alter table public.arc_membership_release_policy force row level security;
-- No policies or runtime roles: visibility cannot imply complete admitted input.
-- No default confidence/method: neither is fabricated from a label or rank.
create function mip_arc_qik_source.require_entity_authority() returns void
language plpgsql set search_path='' as $authority$
begin
 raise exception 'arc_qik_source_entity_authority_unqualified';
end $authority$;
create function mip_arc_qik_source.reject_unqualified_write() returns trigger
language plpgsql set search_path='' as $write$
begin
 if tg_table_name='article_entities' then
  perform mip_arc_qik_source.require_entity_authority();
 else
  raise exception 'arc_qik_source_release_authority_unqualified';
 end if;
 return null;
end $write$;
-- Even privileged DML must not seed a plausible empty-to-ready transition.
-- A reviewed successor must explicitly replace these fences and define actual
-- admission before writing. Trigger disabling/owner DDL is outside the contract.
create trigger qik_entity_authority before insert or update or delete on public.article_entities
 for each statement execute function mip_arc_qik_source.reject_unqualified_write();
create trigger qik_entity_authority_truncate before truncate on public.article_entities
 for each statement execute function mip_arc_qik_source.reject_unqualified_write();
create trigger qik_arc_release_authority before insert or update or delete on public.arc_membership_release_policy
 for each statement execute function mip_arc_qik_source.reject_unqualified_write();
create trigger qik_arc_release_authority_truncate before truncate on public.arc_membership_release_policy
 for each statement execute function mip_arc_qik_source.reject_unqualified_write();
alter table public.article_entities enable always trigger qik_entity_authority;
alter table public.article_entities enable always trigger qik_entity_authority_truncate;
alter table public.arc_membership_release_policy enable always trigger qik_arc_release_authority;
alter table public.arc_membership_release_policy enable always trigger qik_arc_release_authority_truncate;
revoke all on all functions in schema mip_arc_qik_source from public;
revoke all on public.article_entities,public.arc_membership_release_policy from public;
reset role;
revoke create on schema public from mip_arc_qik_source_owner;
revoke mip_arc_qik_source_owner from current_user;
do $assert$
declare owner_id oid:='mip_arc_qik_source_owner'::regrole;
 r record;f record;table_id oid;source_name text;col record;fence record;
begin
 select * into r from pg_roles where oid=owner_id;
 if r.rolcanlogin or r.rolinherit or r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls
  or exists(select 1 from pg_auth_members where member=owner_id or roleid=owner_id)
  or has_schema_privilege(owner_id,'public','CREATE')
 then raise exception 'arc_qik_source_role_boundary';end if;
 if (select nspowner from pg_namespace where nspname='mip_arc_qik_source')<>owner_id
  or exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
   where n.nspname='mip_arc_qik_source' and a.grantee<>owner_id)
 then raise exception 'arc_qik_source_schema_boundary';end if;
 if (select count(*) from pg_proc where pronamespace='mip_arc_qik_source'::regnamespace)<>2
 then raise exception 'arc_qik_source_function_boundary';end if;
 for f in select * from pg_proc where pronamespace='mip_arc_qik_source'::regnamespace loop
  if f.proowner<>owner_id or f.prosecdef or not coalesce(f.proconfig @> array['search_path=""'],false)
   or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee<>owner_id)
  then raise exception 'arc_qik_source_function_boundary';end if;
 end loop;
 foreach table_id in array array['public.article_entities'::regclass,'public.arc_membership_release_policy'::regclass] loop
  select * into r from pg_class where oid=table_id;
  if r.relowner<>owner_id or not r.relrowsecurity or not r.relforcerowsecurity
   or exists(select 1 from pg_policy where polrelid=table_id)
   or exists(select 1 from aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a where a.grantee<>owner_id)
   or exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) x
     where a.attrelid=table_id and x.grantee<>owner_id)
  then raise exception 'arc_qik_source_table_boundary';end if;
 end loop;
 for fence in select * from(values
  ('public.article_entities','qik_entity_authority',30),
  ('public.article_entities','qik_entity_authority_truncate',34),
  ('public.arc_membership_release_policy','qik_arc_release_authority',30),
  ('public.arc_membership_release_policy','qik_arc_release_authority_truncate',34)
 ) v(relation_name,trigger_name,trigger_type) loop
  if (select count(*) from pg_trigger t where t.tgrelid=fence.relation_name::regclass and not t.tgisinternal)<>2
   or (select count(*) from pg_trigger t where t.tgrelid=fence.relation_name::regclass
    and not t.tgisinternal and t.tgname=fence.trigger_name
    and t.tgfoid='mip_arc_qik_source.reject_unqualified_write()'::regprocedure
    and t.tgtype=fence.trigger_type and t.tgenabled='A' and t.tgqual is null
    and t.tgnargs=0 and t.tgconstraint=0 and t.tgparentid=0
    and not t.tgdeferrable and not t.tginitdeferred)<>1
   then raise exception 'arc_qik_source_trigger_boundary';end if;
 end loop;
 foreach source_name in array array['articles','entities','story_arcs','pipeline_config','arc_membership_candidates'] loop
  table_id:=to_regclass('public.'||source_name);
  if (select relowner from pg_class where oid=table_id)=owner_id
   or has_table_privilege(owner_id,table_id,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(owner_id,table_id,'SELECT,INSERT,UPDATE')
  then raise exception 'arc_qik_source_source_acl_boundary';end if;
  for col in select attname from pg_attribute where attrelid=table_id and attnum>0 and not attisdropped loop
   if has_column_privilege(owner_id,table_id,col.attname,'REFERENCES')
     is distinct from(source_name in('articles','entities') and col.attname='id')
    then raise exception 'arc_qik_source_reference_boundary';end if;
  end loop;
 end loop;
 -- PUBLIC effective rights are covered above; check named ambient roles if present.
 for r in select oid from pg_roles where rolname in('anon','authenticated','service_role') loop
  if pg_has_role(r.oid,owner_id,'MEMBER') or has_schema_privilege(r.oid,'mip_arc_qik_source','USAGE,CREATE')
   or has_table_privilege(r.oid,'public.article_entities','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(r.oid,'public.article_entities','SELECT,INSERT,UPDATE,REFERENCES')
   or has_table_privilege(r.oid,'public.arc_membership_release_policy','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   or has_any_column_privilege(r.oid,'public.arc_membership_release_policy','SELECT,INSERT,UPDATE,REFERENCES')
  then raise exception 'arc_qik_source_ambient_boundary';end if;
  for f in select oid from pg_proc where pronamespace='mip_arc_qik_source'::regnamespace loop
   if has_function_privilege(r.oid,f.oid,'EXECUTE') then raise exception 'arc_qik_source_ambient_boundary';end if;
  end loop;
 end loop;
end $assert$;
commit;
