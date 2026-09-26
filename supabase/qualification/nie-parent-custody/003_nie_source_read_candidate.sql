-- SOURCE-FREE NIE PROJECT CANDIDATE ONLY. Do not apply without a fresh
-- source catalog / PUBLIC-inheritance audit and owner access authorization.
-- A later short-lived LOGIN may inherit this role and no other role.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create role nie_parent_source_read nologin noinherit nobypassrls;
grant usage on schema public to nie_parent_source_read;
create schema nie_parent_access;
revoke all on schema nie_parent_access from public, anon, authenticated, service_role;
grant usage on schema nie_parent_access to nie_parent_source_read;
create table nie_parent_access.operations (
  login_name name primary key,
  operation_id uuid not null unique,
  source_project_ref text not null check (source_project_ref='niejaejtbxgakyrsntxm'),
  expires_at timestamptz not null,
  unique (login_name,operation_id)
);
alter table nie_parent_access.operations enable row level security;
revoke all on nie_parent_access.operations from public, anon, authenticated, service_role;
grant select on nie_parent_access.operations to nie_parent_source_read;
create policy nie_parent_source_operation_read on nie_parent_access.operations
  for select to nie_parent_source_read
  using (login_name=session_user and expires_at>clock_timestamp());
create table nie_parent_access.allowed_source_ids (
  login_name name not null,
  operation_id uuid not null,
  source_project_ref text not null check (source_project_ref='niejaejtbxgakyrsntxm'),
  source_table text not null check (source_table in ('events','articles')),
  source_id uuid not null,
  expires_at timestamptz not null,
  primary key (login_name,operation_id,source_table,source_id),
  foreign key (login_name,operation_id)
    references nie_parent_access.operations(login_name,operation_id)
);
alter table nie_parent_access.allowed_source_ids enable row level security;
revoke all on nie_parent_access.allowed_source_ids from public, anon, authenticated, service_role;
grant select (login_name,operation_id,source_project_ref,source_table,source_id,expires_at)
  on nie_parent_access.allowed_source_ids to nie_parent_source_read;
create policy nie_parent_source_scope_read on nie_parent_access.allowed_source_ids
  for select to nie_parent_source_read
  using (login_name=session_user and expires_at>clock_timestamp()
    and exists (select 1 from nie_parent_access.operations o
      where o.login_name=allowed_source_ids.login_name
        and o.operation_id=allowed_source_ids.operation_id));

do $$ begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('events','articles','event_articles')
      and not c.relrowsecurity) then
    raise exception 'NIE source parent RLS must be enabled';
  end if;
end $$;
grant select (
  id,canonical_title,occurred_at_start,occurred_at_end,location_text,
  arc_id,arc_event_id,status,rule_version,created_at
) on public.events to nie_parent_source_read;
grant select (
  id,feed,outlet,title,url,summary,published_at,fetched_at,outlet_id,
  author_id,body_text,embedding,claims,arc_id,unattributed,monoculture,
  is_digest,image_url,image_alt,entities_extracted_at,arc_assign_attempted_at,
  arc_assignment_evidence,source_status,source_status_changed_at,
  source_status_note,ingestion_run_id,is_pre_ruling,different_causal_chain
) on public.articles to nie_parent_source_read;
grant select (event_id,article_id) on public.event_articles to nie_parent_source_read;

-- Permissive policies permit the dedicated role; restrictive policies AND with
-- any existing PUBLIC read policy so an inherited broad policy cannot expose
-- rows outside the administrator-provisioned source-ID scope.
create policy nie_parent_source_events_read on public.events
  for select to nie_parent_source_read using (exists (
    select 1 from nie_parent_access.allowed_source_ids s
    where s.source_table='events' and s.source_id=events.id));
create policy nie_parent_source_events_scope on public.events as restrictive
  for select to nie_parent_source_read using (exists (
    select 1 from nie_parent_access.allowed_source_ids s
    where s.source_table='events' and s.source_id=events.id));
create policy nie_parent_source_articles_read on public.articles
  for select to nie_parent_source_read using (exists (
    select 1 from nie_parent_access.allowed_source_ids s
    where s.source_table='articles' and s.source_id=articles.id));
create policy nie_parent_source_articles_scope on public.articles as restrictive
  for select to nie_parent_source_read using (exists (
    select 1 from nie_parent_access.allowed_source_ids s
    where s.source_table='articles' and s.source_id=articles.id));
create policy nie_parent_source_membership_read on public.event_articles
  for select to nie_parent_source_read using (
    exists (select 1 from nie_parent_access.allowed_source_ids e
      where e.source_table='events' and e.source_id=event_articles.event_id)
    and exists (select 1 from nie_parent_access.allowed_source_ids a
      join nie_parent_access.allowed_source_ids e
        on e.operation_id=a.operation_id and e.login_name=a.login_name
      where a.source_table='articles' and a.source_id=event_articles.article_id
        and e.source_table='events' and e.source_id=event_articles.event_id));
create policy nie_parent_source_membership_scope on public.event_articles as restrictive
  for select to nie_parent_source_read using (
    exists (select 1 from nie_parent_access.allowed_source_ids e
      where e.source_table='events' and e.source_id=event_articles.event_id)
    and exists (select 1 from nie_parent_access.allowed_source_ids a
      join nie_parent_access.allowed_source_ids e
        on e.operation_id=a.operation_id and e.login_name=a.login_name
      where a.source_table='articles' and a.source_id=event_articles.article_id
        and e.source_table='events' and e.source_id=event_articles.event_id));

-- Fixed, metadata-only inventory detects membership links hidden by ID RLS
-- for this operation's selected event roots. It returns counts and hashes,
-- never unapproved IDs or payloads. This
-- deliberately runs as the table owner; its body and ACL are part of review.
create function nie_parent_access.full_parent_inventory() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare event_json text;
  article_json text;
  pair_json text;
  event_count bigint;
  article_count bigint;
  membership_count bigint;
  unapproved_membership_count bigint;
  active_operation uuid;
begin
  select o.operation_id into active_operation from nie_parent_access.operations o
    where o.login_name=session_user and o.expires_at>clock_timestamp();
  if active_operation is null then
    raise exception 'source operation is not active';
  end if;
  select '['||coalesce(string_agg(to_json(e.id::text)::text,',' order by e.id),'')||']', count(*)
    into event_json,event_count from public.events e
    join nie_parent_access.allowed_source_ids s on s.source_table='events'
      and s.source_id=e.id and s.operation_id=active_operation
      and s.login_name=session_user and s.expires_at>clock_timestamp();
  select '['||coalesce(string_agg(to_json(a.id::text)::text,',' order by a.id),'')||']', count(*)
    into article_json,article_count from public.articles a
    join nie_parent_access.allowed_source_ids s on s.source_table='articles'
      and s.source_id=a.id and s.operation_id=active_operation
      and s.login_name=session_user and s.expires_at>clock_timestamp();
  select '['||coalesce(string_agg('['||to_json(ea.event_id::text)::text||','||
    to_json(ea.article_id::text)::text||']',',' order by ea.event_id,ea.article_id),'')||']',
    count(*),count(*) filter (where article_scope.source_id is null)
    into pair_json,membership_count,unapproved_membership_count
    from public.event_articles ea
    join nie_parent_access.allowed_source_ids event_scope
      on event_scope.source_table='events' and event_scope.source_id=ea.event_id
      and event_scope.operation_id=active_operation
      and event_scope.login_name=session_user
      and event_scope.expires_at>clock_timestamp()
    left join nie_parent_access.allowed_source_ids article_scope
      on article_scope.source_table='articles' and article_scope.source_id=ea.article_id
      and article_scope.operation_id=active_operation
      and article_scope.login_name=session_user
      and article_scope.expires_at>clock_timestamp();
  return jsonb_build_object(
    'event_count',event_count,'article_count',article_count,
    'membership_count',membership_count,
    'unapproved_membership_count',unapproved_membership_count,
    'event_keys_sha256',encode(sha256(convert_to(event_json,'UTF8')),'hex'),
    'article_keys_sha256',encode(sha256(convert_to(article_json,'UTF8')),'hex'),
    'membership_keys_sha256',encode(sha256(convert_to(pair_json,'UTF8')),'hex'));
end $$;
alter function nie_parent_access.full_parent_inventory() owner to postgres;
revoke all on function nie_parent_access.full_parent_inventory() from public, anon, authenticated, service_role;
grant execute on function nie_parent_access.full_parent_inventory() to nie_parent_source_read;
do $$ begin
  if (select p.proowner from pg_proc p
    where p.oid='nie_parent_access.full_parent_inventory()'::regprocedure)
      <> 'postgres'::regrole then
    raise exception 'source inventory owner mismatch';
  end if;
  if not (select rolsuper or rolbypassrls from pg_roles where rolname='postgres')
    and exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('events','articles','event_articles')
        and (c.relowner<>'postgres'::regrole or c.relforcerowsecurity)) then
    raise exception 'source inventory cannot see full selected closure';
  end if;
end $$;

-- PUBLIC privileges are inherited by every login. Column grants cannot undo
-- them, so refuse candidate installation if they widen effective source
-- table access or expose privileged/volatile user functions. Re-run against
-- the actual LOGIN after provisioning; this static role audit is not enough.
do $$
declare a record;
  allowed boolean;
begin
  if has_schema_privilege('nie_parent_source_read','public','CREATE') then
    raise exception 'source role inherits public schema CREATE';
  end if;
  for a in
    select n.nspname,c.relname,att.attname,c.oid,n.oid as schema_oid
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute att on att.attrelid=c.oid
    where n.nspname not in ('pg_catalog','information_schema','pg_toast')
      and n.nspname not like 'pg_temp_%' and c.relkind in ('r','p','v','m','f')
      and att.attnum>0 and not att.attisdropped
  loop
    allowed := (a.nspname='nie_parent_access'
      and a.relname in ('operations','allowed_source_ids'))
      or (a.nspname='public' and a.relname='events' and a.attname=any(array[
      'id','canonical_title','occurred_at_start','occurred_at_end','location_text',
      'arc_id','arc_event_id','status','rule_version','created_at']))
      or (a.nspname='public' and a.relname='articles' and a.attname=any(array[
      'id','feed','outlet','title','url','summary','published_at','fetched_at',
      'outlet_id','author_id','body_text','embedding','claims','arc_id','unattributed',
      'monoculture','is_digest','image_url','image_alt','entities_extracted_at',
      'arc_assign_attempted_at','arc_assignment_evidence','source_status',
      'source_status_changed_at','source_status_note','ingestion_run_id',
      'is_pre_ruling','different_causal_chain']))
      or (a.nspname='public' and a.relname='event_articles'
        and a.attname=any(array['event_id','article_id']));
    if has_schema_privilege('nie_parent_source_read',a.schema_oid,'USAGE')
       and has_column_privilege('nie_parent_source_read',a.oid,a.attname,'SELECT')
       and not allowed then
      raise exception 'source role inherited unlisted column access';
    end if;
    if has_schema_privilege('nie_parent_source_read',a.schema_oid,'USAGE')
       and has_column_privilege('nie_parent_source_read',a.oid,a.attname,'INSERT,UPDATE') then
      raise exception 'source role inherited table write access';
    end if;
  end loop;
  for a in select n.oid as schema_oid,c.oid as relation_oid,n.nspname,c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname not in ('pg_catalog','information_schema','pg_toast')
      and n.nspname not like 'pg_temp_%' and c.relkind in ('r','p','v','m','f')
  loop
    if has_schema_privilege('nie_parent_source_read',a.schema_oid,'USAGE') then
      if has_table_privilege('nie_parent_source_read',a.relation_oid,
          'INSERT,UPDATE,DELETE,TRUNCATE') then
        raise exception 'source role inherited relation write access';
      end if;
      if not ((a.nspname='public' and a.relname in ('events','articles','event_articles'))
          or (a.nspname='nie_parent_access' and a.relname in ('operations','allowed_source_ids')))
        and has_table_privilege('nie_parent_source_read',a.relation_oid,'SELECT') then
        raise exception 'source role inherited unrelated relation read access';
      end if;
    end if;
  end loop;
  for a in select n.oid as schema_oid,c.oid as sequence_oid
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='S' and n.nspname not in ('pg_catalog','information_schema','pg_toast')
      and n.nspname not like 'pg_temp_%'
  loop
    if has_schema_privilege('nie_parent_source_read',a.schema_oid,'USAGE')
      and has_sequence_privilege('nie_parent_source_read',a.sequence_oid,'USAGE,SELECT,UPDATE') then
      raise exception 'source role inherited sequence access';
    end if;
  end loop;
  for a in select n.oid as schema_oid,p.oid as function_oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema','pg_toast')
      and n.nspname not like 'pg_temp_%'
  loop
    if a.function_oid <> 'nie_parent_access.full_parent_inventory()'::regprocedure
      and has_schema_privilege('nie_parent_source_read',a.schema_oid,'USAGE')
      and has_function_privilege('nie_parent_source_read',a.function_oid,'EXECUTE') then
      raise exception 'source role inherited unreviewed user-function execution';
    end if;
  end loop;
end $$;
commit;
