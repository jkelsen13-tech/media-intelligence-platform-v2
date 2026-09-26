-- Isolated N1 qualification adapter for nie Source Comparison membership.
-- Apply after the existing private legacy graph staging foundation. This file is
-- not a live migration and does not write or promote public comparison rows.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table legacy_graph_staging.nie_event_article_memberships (
  source_project_ref text not null check (source_project_ref = 'niejaejtbxgakyrsntxm'),
  event_id uuid not null,
  article_id uuid not null,
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  review_state text not null default 'pending_review'
    check (review_state in ('pending_review', 'quarantined')),
  staged_at timestamptz not null default clock_timestamp(),
  primary key (source_project_ref, event_id, article_id)
);

create table legacy_graph_staging.nie_event_article_versions (
  source_project_ref text not null,
  event_id uuid not null,
  article_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  predecessor_sha256 text,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (source_project_ref, event_id, article_id, ordinal),
  unique (source_project_ref, event_id, article_id, payload_sha256),
  foreign key (source_project_ref, event_id, article_id)
    references legacy_graph_staging.nie_event_article_memberships
      (source_project_ref, event_id, article_id)
);

create trigger immutable_nie_event_article_versions
  before update or delete on legacy_graph_staging.nie_event_article_versions
  for each row execute function legacy_graph_staging.reject_mutation();
create trigger immutable_nie_event_article_versions_truncate
  before truncate on legacy_graph_staging.nie_event_article_versions
  for each statement execute function legacy_graph_staging.reject_mutation();
create trigger immutable_nie_event_article_memberships_delete
  before delete on legacy_graph_staging.nie_event_article_memberships
  for each row execute function legacy_graph_staging.reject_mutation();
create trigger immutable_nie_event_article_memberships_truncate
  before truncate on legacy_graph_staging.nie_event_article_memberships
  for each statement execute function legacy_graph_staging.reject_mutation();

alter table legacy_graph_staging.nie_event_article_memberships enable row level security;
alter table legacy_graph_staging.nie_event_article_versions enable row level security;
revoke all on legacy_graph_staging.nie_event_article_memberships,
  legacy_graph_staging.nie_event_article_versions from public, anon, authenticated, service_role;
grant select, insert on legacy_graph_staging.nie_event_article_memberships
  to service_role;
grant update (review_state) on legacy_graph_staging.nie_event_article_memberships
  to service_role;
grant select, insert on legacy_graph_staging.nie_event_article_versions
  to service_role;

create function legacy_graph_staging.stage_nie_event_article(
  p_payload jsonb, p_sha256 text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  source_ref constant text := 'niejaejtbxgakyrsntxm';
  source_event uuid;
  source_article uuid;
  computed text;
  current_row legacy_graph_staging.nie_event_article_memberships%rowtype;
  previous_hash text;
  next_ordinal integer;
  inserted_rows integer;
  seen_version boolean;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or not (p_payload ?& array[
       'event_id', 'article_id', 'membership_method',
       'membership_confidence', 'created_at'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_payload) as k(name)
       where k.name <> all (array[
         'event_id', 'article_id', 'membership_method',
         'membership_confidence', 'created_at'
       ])
     ) then
    raise exception 'membership requires exact native event_articles fields';
  end if;
  if jsonb_typeof(p_payload->'event_id') <> 'string'
     or jsonb_typeof(p_payload->'article_id') <> 'string'
     or jsonb_typeof(p_payload->'membership_method') <> 'string'
     or jsonb_typeof(p_payload->'created_at') <> 'string'
     or nullif(btrim(p_payload->>'membership_method'), '') is null
     or nullif(p_payload->>'created_at', '') is null then
    raise exception 'membership requires event, article, method, and creation time';
  end if;
  source_event := (p_payload->>'event_id')::uuid;
  source_article := (p_payload->>'article_id')::uuid;
  perform (p_payload->>'created_at')::timestamptz;
  if jsonb_typeof(p_payload->'membership_confidence') not in ('number', 'null') then
    raise exception 'membership confidence must be numeric or null';
  end if;
  computed := legacy_graph_staging.verified_digest(p_payload, p_sha256);
  if p_sha256 is null then
    raise exception 'membership requires a deterministic source payload digest';
  end if;

  if not exists (
    select 1 from legacy_graph_staging.staged_records s
    where s.source_project_ref = source_ref
      and s.source_table = 'events'
      and s.source_id = source_event
      and s.object_family = 'source_comparison_event'
      and s.review_state = 'pending'
  ) then
    raise exception 'missing source-qualified Source Comparison event';
  end if;
  if not exists (
    select 1 from legacy_graph_staging.staged_records s
    where s.source_project_ref = source_ref
      and s.source_table = 'articles'
      and s.source_id = source_article
      and s.object_family = 'article'
      and s.review_state = 'pending'
  ) then
    raise exception 'missing source-qualified article';
  end if;

  insert into legacy_graph_staging.nie_event_article_memberships (
    source_project_ref, event_id, article_id, payload, payload_sha256
  ) values (source_ref, source_event, source_article, p_payload, computed)
  on conflict do nothing;
  get diagnostics inserted_rows = row_count;
  select * into current_row
    from legacy_graph_staging.nie_event_article_memberships
   where source_project_ref = source_ref
     and event_id = source_event and article_id = source_article
   for update;
  if current_row.payload_sha256 = computed then
    insert into legacy_graph_staging.nie_event_article_versions (
      source_project_ref, event_id, article_id, ordinal, payload,
      payload_sha256, predecessor_sha256
    ) values (source_ref, source_event, source_article, 1, p_payload,
              computed, null)
    on conflict do nothing;
    return jsonb_build_object(
      'source_project_ref', source_ref, 'event_id', source_event,
      'article_id', source_article, 'payload_sha256', computed,
      'review_state', current_row.review_state,
      'replayed', inserted_rows = 0
    );
  end if;
  select exists (
    select 1 from legacy_graph_staging.nie_event_article_versions v
    where v.source_project_ref = source_ref
      and v.event_id = source_event and v.article_id = source_article
      and v.payload_sha256 = computed
  ) into seen_version;
  if seen_version then
    return jsonb_build_object(
      'source_project_ref', source_ref, 'event_id', source_event,
      'article_id', source_article, 'payload_sha256', computed,
      'review_state', current_row.review_state, 'replayed', true
    );
  end if;
  select v.payload_sha256 into previous_hash
    from legacy_graph_staging.nie_event_article_versions v
   where v.source_project_ref = source_ref
     and v.event_id = source_event and v.article_id = source_article
   order by v.ordinal desc limit 1;
  select coalesce(max(v.ordinal), 0) + 1 into next_ordinal
    from legacy_graph_staging.nie_event_article_versions v
   where v.source_project_ref = source_ref
     and v.event_id = source_event and v.article_id = source_article;
  insert into legacy_graph_staging.nie_event_article_versions (
    source_project_ref, event_id, article_id, ordinal, payload,
    payload_sha256, predecessor_sha256
  ) values (source_ref, source_event, source_article, next_ordinal,
            p_payload, computed, previous_hash)
  on conflict (source_project_ref, event_id, article_id, payload_sha256) do nothing;
  update legacy_graph_staging.nie_event_article_memberships
     set review_state = 'quarantined'
   where source_project_ref = source_ref
     and event_id = source_event and article_id = source_article;
  return jsonb_build_object(
    'source_project_ref', source_ref, 'event_id', source_event,
    'article_id', source_article, 'payload_sha256', computed,
    'review_state', 'quarantined', 'replayed', false
  );
end $$;

revoke all on function legacy_graph_staging.stage_nie_event_article(jsonb, text)
  from public, anon, authenticated;
grant execute on function legacy_graph_staging.stage_nie_event_article(jsonb, text)
  to service_role;
comment on function legacy_graph_staging.stage_nie_event_article(jsonb, text) is
  'Private source-qualified preservation of nie event_articles composite membership. No publication or canonical promotion.';
commit;
