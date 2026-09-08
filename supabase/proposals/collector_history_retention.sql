-- Private source-qualified collector history. This is retention, not worker activation.
create table mip_private.collector_row_versions (
  source_project text not null check (source_project in ('yhbwnrtlqbjtcrrlpbge','niejaejtbxgakyrsntxm','jfnzyvzthzqtczlxhjll')),
  source_relation text not null check (source_relation in ('ingestion_runs','ingestion_source_runs','ingest_sources')),
  source_key text not null check (length(source_key) between 1 and 512),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  source_observed_at timestamptz not null,
  retained_at timestamptz not null default clock_timestamp(),
  primary key (source_project, source_relation, source_key, payload_hash),
  check (payload_hash = encode(sha256(convert_to(payload::text,'UTF8')),'hex')),
  check (payload ? case when source_relation='ingestion_runs' then 'run_id' else 'id' end),
  check (source_key = case when source_relation='ingestion_runs' then payload->>'run_id' else payload->>'id' end),
  check (case when source_relation='ingestion_runs' then payload->>'run_id' else payload->>'id' end is not null)
);
alter table mip_private.collector_row_versions enable row level security;
revoke all on mip_private.collector_row_versions from public, anon, authenticated;
grant select, insert on mip_private.collector_row_versions to service_role;

create function mip_private.reject_collector_history_mutation() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'collector_history_is_immutable' using errcode='55000'; end $$;
revoke all on function mip_private.reject_collector_history_mutation() from public, anon, authenticated, service_role;
create trigger collector_history_no_mutation before update or delete on mip_private.collector_row_versions
for each row execute function mip_private.reject_collector_history_mutation();
create trigger collector_history_no_truncate before truncate on mip_private.collector_row_versions
for each statement execute function mip_private.reject_collector_history_mutation();

create function mip_private.retain_collector_rows(
  p_source_project text, p_source_relation text, p_observed_at timestamptz, p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row jsonb; v_key text; v_hash text; v_existing jsonb; v_added integer:=0; v_count integer;
begin
  if p_source_project is null or p_source_project not in ('yhbwnrtlqbjtcrrlpbge','niejaejtbxgakyrsntxm','jfnzyvzthzqtczlxhjll')
    or p_source_relation is null or p_source_relation not in ('ingestion_runs','ingestion_source_runs','ingest_sources')
    or p_observed_at is null or p_observed_at > clock_timestamp()
    or p_rows is null or jsonb_typeof(p_rows) <> 'array'
    or octet_length(p_rows::text) > 2097152 then
    raise exception 'invalid_collector_batch' using errcode='22023';
  end if;
  v_count:=jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 250 then raise exception 'invalid_collector_batch' using errcode='22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) <> 'object')
    or (select count(distinct case when p_source_relation='ingestion_runs' then r->>'run_id' else r->>'id' end) from jsonb_array_elements(p_rows) r) <> v_count then
    raise exception 'ambiguous_collector_identity' using errcode='22023';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_key:=case when p_source_relation='ingestion_runs' then v_row->>'run_id' else v_row->>'id' end;
    v_hash:=encode(sha256(convert_to(v_row::text,'UTF8')),'hex');
    insert into mip_private.collector_row_versions(source_project,source_relation,source_key,payload_hash,payload,source_observed_at)
      values(p_source_project,p_source_relation,v_key,v_hash,v_row,p_observed_at) on conflict do nothing;
    if found then v_added:=v_added+1; end if;
    select payload into strict v_existing from mip_private.collector_row_versions
      where source_project=p_source_project and source_relation=p_source_relation and source_key=v_key and payload_hash=v_hash;
    if v_existing is distinct from v_row then raise exception 'collector_hash_conflict' using errcode='22000'; end if;
  end loop;
  return jsonb_build_object('source_project',p_source_project,'source_relation',p_source_relation,
    'received',v_count,'inserted',v_added,'already_retained',v_count-v_added);
end $$;
revoke all on function mip_private.retain_collector_rows(text,text,timestamptz,jsonb) from public, anon, authenticated;
grant usage on schema mip_private to service_role;
grant execute on function mip_private.retain_collector_rows(text,text,timestamptz,jsonb) to service_role;
comment on table mip_private.collector_row_versions is
  'Exact source-qualified snapshots retained during backend consolidation. Append-only; not publication, evidence admission, or proof of historical source states before observation.';
