-- Private qik collector shadow: source-health and byte-fingerprint receipts only.
--
-- The shadow may fetch a source and record bounded metadata. It cannot write
-- articles, evidence, graph state, publication state, or predecessor queues.

create table if not exists mip_private.collector_shadow_sources (
  source_project text not null check (source_project = 'yhbwnrtlqbjtcrrlpbge'),
  source_id uuid primary key,
  feed_url text not null unique check (feed_url ~ '^https?://'),
  outlet_name text not null check (length(outlet_name) between 1 and 200),
  enabled_at_source boolean not null,
  source_observed_at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists mip_private.collector_shadow_config (
  id boolean primary key default true check (id),
  source_project text not null check (source_project = 'yhbwnrtlqbjtcrrlpbge'),
  feed_fetch_timeout_ms integer not null check (feed_fetch_timeout_ms between 500 and 15000),
  feeds_per_run integer not null check (feeds_per_run between 1 and 7),
  schedule_slot_minutes integer not null check (schedule_slot_minutes between 1 and 60),
  max_items_per_feed integer not null check (max_items_per_feed between 1 and 100),
  max_new_per_run integer not null check (max_new_per_run between 1 and 100),
  source_observed_at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists mip_private.collector_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references mip_private.collector_shadow_sources(source_id),
  started_at timestamptz not null,
  completed_at timestamptz not null check (completed_at >= started_at),
  state text not null check (state in ('succeeded', 'failed')),
  http_status integer check (http_status between 100 and 599),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_count integer not null check (byte_count >= 0),
  item_count integer not null check (item_count >= 0),
  entry_count integer not null check (entry_count >= 0),
  content_type text,
  error_note text check (error_note is null or length(error_note) <= 1000),
  receipt jsonb not null default '{}'::jsonb check (jsonb_typeof(receipt) = 'object' and octet_length(receipt::text) <= 65536),
  recorded_at timestamptz not null default clock_timestamp(),
  check ((state = 'succeeded' and http_status between 200 and 299 and content_sha256 is not null and error_note is null)
      or (state = 'failed' and error_note is not null))
);
create index if not exists collector_shadow_runs_source_time_idx
  on mip_private.collector_shadow_runs (source_id, completed_at desc);

do $$
declare relation_name text;
begin
  foreach relation_name in array array['collector_shadow_sources', 'collector_shadow_config', 'collector_shadow_runs'] loop
    execute format('alter table mip_private.%I enable row level security', relation_name);
    execute format('alter table mip_private.%I force row level security', relation_name);
    execute format('revoke all on table mip_private.%I from public, anon, authenticated, service_role', relation_name);
  end loop;
end
$$;

create or replace function mip_private.reject_collector_shadow_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'collector_shadow_receipt_is_immutable' using errcode = '55000';
end
$$;
revoke all on function mip_private.reject_collector_shadow_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists collector_shadow_runs_no_mutation on mip_private.collector_shadow_runs;
create trigger collector_shadow_runs_no_mutation
before update or delete on mip_private.collector_shadow_runs
for each row execute function mip_private.reject_collector_shadow_mutation();
drop trigger if exists collector_shadow_runs_no_truncate on mip_private.collector_shadow_runs;
create trigger collector_shadow_runs_no_truncate
before truncate on mip_private.collector_shadow_runs
for each statement execute function mip_private.reject_collector_shadow_mutation();

with source_rows(source_id, feed_url, outlet_name, enabled_at_source) as (
  values
    ('236f8366-d4eb-4a96-92dd-86c5d34f7ba3'::uuid, 'https://moxie.foxnews.com/google-publisher/latest.xml', 'Fox News', true),
    ('39ec7381-b754-4756-bf35-a3c5fef2c9f7'::uuid, 'https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera', true),
    ('77107734-89d7-45e4-80bf-0e559a39fa95'::uuid, 'https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC News', true),
    ('830f693e-a3cc-41e3-974d-7c4f793243ab'::uuid, 'http://rss.cnn.com/rss/edition.rss', 'CNN', true),
    ('90067bd7-c0d2-4375-b526-633a0f71e608'::uuid, 'https://www.theguardian.com/world/rss', 'The Guardian', true),
    ('9703eb9d-7773-45af-9240-97b8019473e4'::uuid, 'https://www.cbc.ca/webfeed/rss/rss-world', 'CBC News', true),
    ('a86ccdd9-951d-4fc9-b4b7-3c72c846a480'::uuid, 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'The New York Times', true)
), prepared as (
  select source_id, feed_url, outlet_name, enabled_at_source,
    jsonb_build_object(
      'source_id', source_id,
      'feed_url', feed_url,
      'outlet_name', outlet_name,
      'enabled_at_source', enabled_at_source
    ) as payload
  from source_rows
)
insert into mip_private.collector_shadow_sources(
  source_project, source_id, feed_url, outlet_name, enabled_at_source,
  source_observed_at, payload_hash
)
select 'yhbwnrtlqbjtcrrlpbge', source_id, feed_url, outlet_name, enabled_at_source,
  '2026-09-20T15:30:00Z'::timestamptz,
  encode(sha256(convert_to(payload::text, 'UTF8')), 'hex')
from prepared
on conflict (source_id) do update
set feed_url = excluded.feed_url,
    outlet_name = excluded.outlet_name,
    enabled_at_source = excluded.enabled_at_source,
    source_observed_at = excluded.source_observed_at,
    payload_hash = excluded.payload_hash;

with prepared as (
  select jsonb_build_object(
    'feed_fetch_timeout_ms', 2500,
    'feeds_per_run', 1,
    'schedule_slot_minutes', 5,
    'max_items_per_feed', 4,
    'max_new_per_run', 4
  ) as payload
)
insert into mip_private.collector_shadow_config(
  id, source_project, feed_fetch_timeout_ms, feeds_per_run,
  schedule_slot_minutes, max_items_per_feed, max_new_per_run,
  source_observed_at, payload_hash
)
select true, 'yhbwnrtlqbjtcrrlpbge', 2500, 1, 5, 4, 4,
  '2026-09-20T15:30:00Z'::timestamptz,
  encode(sha256(convert_to(payload::text, 'UTF8')), 'hex')
from prepared
on conflict (id) do update
set source_project = excluded.source_project,
    feed_fetch_timeout_ms = excluded.feed_fetch_timeout_ms,
    feeds_per_run = excluded.feeds_per_run,
    schedule_slot_minutes = excluded.schedule_slot_minutes,
    max_items_per_feed = excluded.max_items_per_feed,
    max_new_per_run = excluded.max_new_per_run,
    source_observed_at = excluded.source_observed_at,
    payload_hash = excluded.payload_hash;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'mip_collector_shadow_scheduler_token') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'mip_collector_shadow_scheduler_token',
      'qik collector-shadow custom authorization token; generated 2026-09-20'
    );
  end if;
end
$$;

create or replace function public.mip_collector_shadow_schedule_authorized(p_token text)
returns boolean
language sql
security definer
set search_path = 'pg_catalog', 'vault'
as $$
  select p_token is not null and exists (
    select 1 from vault.decrypted_secrets
    where name = 'mip_collector_shadow_scheduler_token'
      and decrypted_secret = p_token
  )
$$;

create or replace function public.mip_collector_shadow_plan()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'source_project', c.source_project,
    'config', jsonb_build_object(
      'feed_fetch_timeout_ms', c.feed_fetch_timeout_ms,
      'feeds_per_run', c.feeds_per_run,
      'schedule_slot_minutes', c.schedule_slot_minutes,
      'max_items_per_feed', c.max_items_per_feed,
      'max_new_per_run', c.max_new_per_run,
      'source_observed_at', c.source_observed_at,
      'payload_hash', c.payload_hash
    ),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_id', s.source_id,
        'feed_url', s.feed_url,
        'outlet_name', s.outlet_name,
        'enabled_at_source', s.enabled_at_source,
        'source_observed_at', s.source_observed_at,
        'payload_hash', s.payload_hash
      ) order by s.source_id)
      from mip_private.collector_shadow_sources s
      where s.enabled_at_source
    ), '[]'::jsonb)
  )
  from mip_private.collector_shadow_config c
  where c.id
$$;

create or replace function public.mip_collector_shadow_record(
  p_source_id uuid,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_state text,
  p_http_status integer,
  p_content_sha256 text,
  p_byte_count integer,
  p_item_count integer,
  p_entry_count integer,
  p_content_type text,
  p_error_note text,
  p_receipt jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  insert into mip_private.collector_shadow_runs(
    source_id, started_at, completed_at, state, http_status,
    content_sha256, byte_count, item_count, entry_count, content_type,
    error_note, receipt
  ) values (
    p_source_id, p_started_at, p_completed_at, p_state, p_http_status,
    p_content_sha256, p_byte_count, p_item_count, p_entry_count,
    left(p_content_type, 250), left(p_error_note, 1000), coalesce(p_receipt, '{}'::jsonb)
  ) returning id into result_id;
  return result_id;
end
$$;

revoke all on function public.mip_collector_shadow_schedule_authorized(text),
  public.mip_collector_shadow_plan(),
  public.mip_collector_shadow_record(uuid,timestamptz,timestamptz,text,integer,text,integer,integer,integer,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.mip_collector_shadow_schedule_authorized(text),
  public.mip_collector_shadow_plan(),
  public.mip_collector_shadow_record(uuid,timestamptz,timestamptz,text,integer,text,integer,integer,integer,text,text,jsonb)
  to service_role;

comment on table mip_private.collector_shadow_sources is
  'Source-qualified yhb feed registry snapshot for qik shadow verification. No caller cutover.';
comment on table mip_private.collector_shadow_runs is
  'Immutable network/source receipts only; no article, graph, evidence, publication, or acknowledgement writes.';
