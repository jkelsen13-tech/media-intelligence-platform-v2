-- UNINSTALLED qik candidate layered on 002_narrow_worker_candidate.sql.
-- This replaces the enqueue wrapper with exact manifest-derived row/field
-- enforcement. Do not apply to qik without separate reviewed authorization.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table legacy_graph_staging.nie_parent_page_scope
  add column expected_rows jsonb,
  add column expected_fields jsonb,
  add constraint nie_parent_expected_rows_array check (
    expected_rows is null or jsonb_typeof(expected_rows)='array'),
  add constraint nie_parent_expected_fields_array check (
    expected_fields is null or jsonb_typeof(expected_fields)='array');

-- The wrapper remains owned by the NOBYPASSRLS executor. Its temporary
-- CREATE and installer SET ability are removed again before commit.
do $$ begin
  if current_setting('is_superuser') <> 'on'
      and pg_has_role(current_user,'nie_parent_worker_exec','SET') then
    raise exception 'installer unexpectedly could SET ROLE NIE executor';
  end if;
end $$;
grant nie_parent_worker_exec to current_user with inherit false, set true;
grant create on schema legacy_graph_staging to nie_parent_worker_exec;
set role nie_parent_worker_exec;
create or replace function legacy_graph_staging.nie_parent_enqueue_scoped(
  p_run text, p_records jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare prepared jsonb;
  digest text;
  page_table text;
  scope_row legacy_graph_staging.nie_parent_page_scope%rowtype;
  rec jsonb;
  expected jsonb;
  actual_fields jsonb;
  actual_outer_fields jsonb;
  ord bigint;
begin
  prepared := legacy_graph_staging.prepare_page(p_records);
  digest := legacy_graph_staging.fingerprint_payload(prepared);
  page_table := prepared->0->>'source_table';
  select * into scope_row from legacy_graph_staging.nie_parent_page_scope s
    where s.run_id=p_run and s.page_sha256=digest
      and s.page_size=jsonb_array_length(prepared) and s.source_table=page_table;
  if not found or scope_row.expected_rows is null
      or scope_row.expected_fields is null
      or jsonb_array_length(scope_row.expected_rows)<>scope_row.page_size then
    raise exception 'nie page outside exact approved worker scope';
  end if;
  for rec,ord in select value,ordinality
    from jsonb_array_elements(prepared) with ordinality as r(value,ordinality) loop
    expected := scope_row.expected_rows->((ord-1)::integer);
    select to_jsonb(array_agg(k order by k)) into actual_fields
      from jsonb_object_keys(rec->'payload') as keys(k);
    select to_jsonb(array_agg(k order by k)) into actual_outer_fields
      from jsonb_object_keys(rec) as keys(k);
    if expected is null or actual_fields is distinct from scope_row.expected_fields
        or actual_outer_fields is distinct from
          '["object_family","payload","payload_json","payload_sha256",
             "recovery_status","source_id","source_imported_at",
             "source_project_ref","source_table"]'::jsonb
        or rec->>'source_project_ref' is distinct from 'niejaejtbxgakyrsntxm'
        or rec->>'source_table' is distinct from scope_row.source_table
        or rec->>'source_id' is distinct from expected->>'id'
        or rec->'payload'->>'id' is distinct from expected->>'id'
        or rec->>'payload_sha256' is distinct from expected->>'sha256'
        or legacy_graph_staging.fingerprint_payload(rec->'payload')
            is distinct from expected->>'sha256'
        or (rec->>'payload_json')::jsonb is distinct from rec->'payload'
        or rec->'source_imported_at' is distinct from 'null'::jsonb
        or rec->'recovery_status' is distinct from 'null'::jsonb
        or rec->>'object_family' is distinct from (case
          when page_table='events' then 'source_comparison_event' else 'article' end)
    then
      raise exception 'nie page row or field outside approved manifest';
    end if;
  end loop;
  return legacy_graph_staging.enqueue(p_run,p_records,'[]'::jsonb);
end $$;
reset role;
revoke create on schema legacy_graph_staging from nie_parent_worker_exec;
revoke set option for nie_parent_worker_exec from current_user;
do $$ begin
  if current_setting('is_superuser') <> 'on'
      and (pg_has_role(current_user,'nie_parent_worker_exec','SET')
        or pg_has_role(current_user,'nie_parent_worker_exec','USAGE')) then
    raise exception 'installer retained effective NIE executor rights';
  end if;
  if has_schema_privilege('nie_parent_worker_exec',
      'legacy_graph_staging','CREATE') then
    raise exception 'NIE executor retained schema CREATE';
  end if;
end $$;
commit;
