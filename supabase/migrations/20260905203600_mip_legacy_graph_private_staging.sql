-- Additive private staging for the legacy graph and its evidence
-- dependencies. Copying is not publishing. This migration must not insert
-- into public.nodes or public.edges, enable collectors, move Auth/storage,
-- change spatial gates, or retire any project.
--
-- Not applied on production by this revision. ChatGPT coordinates live apply.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema legacy_graph_staging;
revoke all on schema legacy_graph_staging from public, anon, authenticated;
grant usage on schema legacy_graph_staging to service_role;
alter default privileges in schema legacy_graph_staging revoke execute on functions from public;

create function legacy_graph_staging.reject_mutation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'legacy graph staging history is append-only';
end $$;

-- Canonical JSON matches scripts/mipLegacyGraphStaging.mjs stableStringify:
-- sorted object keys, no spaces, JSON string/boolean/null tokens.
-- Numbers use ECMAScript JSON formatting only when that token round-trips
-- to the exact jsonb numeric. Distinct source numbers never share a hash.
create function legacy_graph_staging.canonical_number_es(p_float double precision) returns text
language plpgsql immutable security invoker set search_path = '' as $$
declare
  n double precision := p_float;
  raw text;
  sign_prefix text := '';
  digits text;
  exp_first integer;
  es_n integer;
  k integer;
  dot integer;
  mant text;
  epos integer;
  exp_s text;
begin
  if n is null or n <> n then
    raise exception 'canonical number requires a finite value';
  end if;
  if n = 0 then return '0'; end if;
  if n = 'Infinity'::double precision or n = '-Infinity'::double precision then
    raise exception 'canonical number requires a finite value';
  end if;
  if n < 0 then
    sign_prefix := '-';
    n := -n;
  end if;
  raw := n::text;
  epos := nullif(position('e' in raw), 0);
  if epos is null then epos := nullif(position('E' in raw), 0); end if;
  if epos is not null then
    mant := substr(raw, 1, epos - 1);
    exp_first := substr(raw, epos + 1)::integer;
    dot := position('.' in mant);
    if dot > 0 then
      digits := replace(mant, '.', '');
      exp_first := exp_first + (dot - 2);
    else
      digits := mant;
      exp_first := exp_first + (char_length(mant) - 1);
    end if;
  else
    dot := position('.' in raw);
    if dot = 0 then
      digits := raw;
      exp_first := char_length(digits) - 1;
    elsif raw like '0.%' then
      digits := substr(raw, 3);
      exp_first := -1;
      while digits like '0%' loop
        digits := substr(digits, 2);
        exp_first := exp_first - 1;
      end loop;
    else
      digits := replace(raw, '.', '');
      exp_first := dot - 2;
    end if;
  end if;
  digits := ltrim(digits, '0');
  if digits is null or digits = '' then return '0'; end if;
  k := char_length(digits);
  es_n := exp_first + 1;
  if k <= es_n and es_n <= 21 then
    return sign_prefix || digits || repeat('0', es_n - k);
  elsif 0 < es_n and es_n <= 21 then
    return sign_prefix || substr(digits, 1, es_n) || '.' || substr(digits, es_n + 1);
  elsif -6 < es_n and es_n <= 0 then
    return sign_prefix || '0.' || repeat('0', -es_n) || digits;
  end if;
  if exp_first >= 0 then
    exp_s := 'e+' || exp_first::text;
  else
    exp_s := 'e' || exp_first::text;
  end if;
  if k = 1 then
    return sign_prefix || digits || exp_s;
  end if;
  return sign_prefix || substr(digits, 1, 1) || '.' || substr(digits, 2) || exp_s;
end $$;

create function legacy_graph_staging.canonical_number(p_value jsonb) returns text
language plpgsql immutable security invoker set search_path = '' as $$
declare
  original numeric;
  n double precision;
  rendered text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    raise exception 'canonical number requires a jsonb number';
  end if;
  original := (p_value #>> '{}')::numeric;
  if original = 0 then return '0'; end if;
  n := original::double precision;
  if n = n and n is not null
     and n <> 'Infinity'::double precision
     and n <> '-Infinity'::double precision then
    begin
      rendered := legacy_graph_staging.canonical_number_es(n);
      if rendered::numeric = original then
        return rendered;
      end if;
    exception when others then
      rendered := null;
    end;
  end if;
  return btrim(original::text);
end $$;

create function legacy_graph_staging.canonical_json(p_value jsonb) returns text
language plpgsql immutable security invoker set search_path = '' as $$
declare rendered text;
begin
  if p_value is null then return 'null'; end if;
  case jsonb_typeof(p_value)
    when 'null' then return 'null';
    when 'boolean' then return p_value#>>'{}';
    when 'number' then return legacy_graph_staging.canonical_number(p_value);
    when 'string' then return to_json(p_value#>>'{}')::text;
    when 'array' then
      select coalesce('[' || string_agg(legacy_graph_staging.canonical_json(elem), ',' order by ord) || ']', '[]')
        into rendered
      from jsonb_array_elements(p_value) with ordinality as t(elem, ord);
      return rendered;
    when 'object' then
      select coalesce('{' || string_agg(to_json(key)::text || ':' || legacy_graph_staging.canonical_json(val), ',' order by key) || '}', '{}')
        into rendered
      from jsonb_each(p_value) as t(key, val);
      return rendered;
    else raise exception 'unsupported jsonb type';
  end case;
end $$;

create function legacy_graph_staging.fingerprint_payload(p_value jsonb) returns text
language sql immutable security invoker set search_path = '' as $$
  select encode(sha256(convert_to(legacy_graph_staging.canonical_json(p_value), 'utf8')), 'hex')
$$;

create function legacy_graph_staging.verified_digest(p_payload jsonb, p_supplied text) returns text
language plpgsql immutable security invoker set search_path = '' as $$
declare computed text := legacy_graph_staging.fingerprint_payload(p_payload);
begin
  if p_supplied is not null and p_supplied !~ '^[0-9a-f]{64}$' then
    raise exception 'payload fingerprint mismatch';
  end if;
  if p_supplied is not null and p_supplied is distinct from computed then
    raise exception 'payload fingerprint mismatch';
  end if;
  return computed;
end $$;

create function legacy_graph_staging.object_family(p_table text, p_payload jsonb) returns text
language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_table = 'events' then return 'source_comparison_event'; end if;
  if p_table = 'nodes' then
    return case coalesce(p_payload->>'type', '')
      when 'event' then 'graph_event'
      when 'actor' then 'graph_actor'
      when 'institution' then 'graph_institution'
      when 'document' then 'graph_document'
      when 'anomaly' then 'graph_anomaly'
      when 'policy' then 'graph_policy'
      else 'graph_node'
    end;
  end if;
  if p_table = 'edges' then return 'graph_edge'; end if;
  if p_table = 'sources' then return 'graph_source'; end if;
  if p_table = 'citations' then return 'graph_citation'; end if;
  if p_table = 'story_arcs' then return 'graph_arc'; end if;
  if p_table = 'arc_events' then return 'graph_arc_event'; end if;
  if p_table = 'entities' then return 'graph_entity'; end if;
  if p_table = 'articles' then return 'article'; end if;
  if p_table in ('arc_membership_candidates', 'cross_surface_candidates', 'explanations') then
    return 'review_record';
  end if;
  return 'unclassified';
end $$;

create table legacy_graph_staging.import_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique check (char_length(btrim(run_id)) between 1 and 120),
  source_project_ref text not null,
  source_table text not null,
  page jsonb not null default '[]'::jsonb,
  mappings jsonb not null default '[]'::jsonb,
  page_sha256 text not null check (page_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'interrupted', 'completed', 'dead_letter')),
  page_size integer not null default 50 check (page_size between 1 and 100),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  cursor_after_id uuid,
  processed_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  available_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

create table legacy_graph_staging.staged_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references legacy_graph_staging.import_jobs(id),
  source_project_ref text not null,
  source_table text not null,
  source_id uuid not null,
  proposed_target_id uuid,
  object_family text not null,
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  source_url text,
  source_imported_at timestamptz,
  staged_at timestamptz not null default clock_timestamp(),
  review_state text not null default 'pending'
    check (review_state in ('pending', 'quarantined', 'gap_recorded')),
  decision text not null,
  identity_decision text not null,
  unique (source_project_ref, source_table, source_id)
);

create table legacy_graph_staging.record_conflicts (
  id uuid primary key default gen_random_uuid(),
  source_project_ref text not null,
  run_id text not null,
  source_table text not null,
  source_id uuid not null,
  target_id uuid,
  source_url text,
  conflict_kind text not null,
  recovery_status text not null,
  affected_fields text[] not null default '{}',
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default clock_timestamp(),
  unique (source_project_ref, run_id, source_table, source_id, conflict_kind)
);

create table legacy_graph_staging.payload_versions (
  id uuid primary key default gen_random_uuid(),
  staged_record_id uuid not null references legacy_graph_staging.staged_records(id),
  conflict_id uuid references legacy_graph_staging.record_conflicts(id),
  predecessor_id uuid references legacy_graph_staging.payload_versions(id),
  source_project_ref text not null,
  source_table text not null,
  source_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  origin text not null check (origin in ('staged_original', 'incoming_divergent', 'public_current')),
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (staged_record_id, ordinal),
  unique (staged_record_id, payload_sha256)
);

create table legacy_graph_staging.endpoint_checks (
  id uuid primary key default gen_random_uuid(),
  source_project_ref text not null,
  source_table text not null,
  source_id uuid not null,
  endpoint_role text not null,
  endpoint_id uuid,
  resolved boolean not null,
  resolution text not null,
  checked_at timestamptz not null default clock_timestamp(),
  unique (source_project_ref, source_table, source_id, endpoint_role)
);

create table legacy_graph_staging.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references legacy_graph_staging.import_jobs(id),
  event_kind text not null,
  detail jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default clock_timestamp()
);

create function legacy_graph_staging.review_for_decision(p_decision text) returns text
language sql immutable security invoker set search_path = '' as $$
  select case p_decision
    when 'historical_url_upsert_no_snapshot' then 'gap_recorded'
    when 'conflict_recorded' then 'quarantined'
    when 'title_collision_not_identity' then 'quarantined'
    when 'event_family_not_interchangeable' then 'quarantined'
    when 'identical_id_divergent_content' then 'quarantined'
    when 'orphan_endpoint' then 'quarantined'
    else 'pending'
  end
$$;

create function legacy_graph_staging.lookup_mapping_target(
  p_ref text,
  p_table text,
  p_id uuid,
  p_record jsonb,
  p_job uuid default null
) returns uuid
language plpgsql stable security invoker set search_path = '' as $$
declare
  mapped uuid;
  mapping jsonb := p_record->'mapping';
begin
  if mapping is not null and jsonb_typeof(mapping) = 'object'
     and mapping->>'source_project_ref' = p_ref
     and mapping->>'source_table' = p_table
     and (mapping->>'source_id')::uuid is not distinct from p_id then
    mapped := nullif(mapping->>'target_id', '')::uuid;
    if mapped is not null then return mapped; end if;
  end if;
  if p_job is not null then
    select nullif(m->>'target_id', '')::uuid into mapped
    from legacy_graph_staging.import_jobs j
    cross join lateral jsonb_array_elements(coalesce(j.mappings, '[]'::jsonb)) as m
    where j.id = p_job
      and m->>'source_project_ref' = p_ref
      and m->>'source_table' = p_table
      and (m->>'source_id')::uuid is not distinct from p_id
    limit 1;
    if mapped is not null then return mapped; end if;
  end if;
  if to_regclass('public.original_source_import_mappings') is not null then
    select m.target_id into mapped
    from public.original_source_import_mappings m
    where m.source_project_ref = p_ref
      and m.source_table = p_table
      and m.source_id = p_id;
    if mapped is not null then return mapped; end if;
  end if;
  return null;
end $$;

create function legacy_graph_staging.record_endpoint_id(p_record jsonb, p_role text) returns uuid
language plpgsql immutable security invoker set search_path = '' as $$
declare
  payload jsonb := coalesce(p_record->'payload', '{}'::jsonb);
  identity text := p_record->>'source_id';
begin
  return case p_role
    when 'endpoint_source' then nullif(coalesce(
      nullif(p_record->>'endpoint_source_id', ''),
      nullif(payload->>'endpoint_source_id', ''),
      nullif(payload->>'source_node_id', ''),
      case when payload->>'source_id' is distinct from identity then payload->>'source_id' end
    ), '')::uuid
    when 'endpoint_target' then nullif(coalesce(
      nullif(p_record->>'endpoint_target_id', ''),
      nullif(payload->>'endpoint_target_id', ''),
      nullif(payload->>'target_node_id', ''),
      case when payload->>'target_id' is distinct from identity then payload->>'target_id' end
    ), '')::uuid
    when 'node' then nullif(payload->>'node_id', '')::uuid
    when 'article' then nullif(payload->>'article_id', '')::uuid
    when 'resolved_node' then nullif(payload->>'resolved_node_id', '')::uuid
    when 'root_node' then nullif(payload->>'root_node_id', '')::uuid
    when 'arc' then nullif(payload->>'arc_id', '')::uuid
    else null
  end;
end $$;

create function legacy_graph_staging.family_collision(p_table text, p_id uuid) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_table = 'nodes' and to_regclass('public.events') is not null then
    return exists (select 1 from public.events e where e.id = p_id);
  end if;
  if p_table = 'events' and to_regclass('public.nodes') is not null then
    return exists (select 1 from public.nodes n where n.id = p_id);
  end if;
  return false;
end $$;

create function legacy_graph_staging.public_graph_row(p_table text, p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare existing jsonb;
begin
  if p_table = 'nodes' and to_regclass('public.nodes') is not null then
    select to_jsonb(n) into existing from public.nodes n where n.id = p_id;
  elsif p_table = 'edges' and to_regclass('public.edges') is not null then
    select to_jsonb(e) into existing from public.edges e where e.id = p_id;
  end if;
  return existing;
end $$;

create function legacy_graph_staging.public_graph_collision(p_table text, p_id uuid, p_fingerprint text, p_payload jsonb default null)
returns text
language plpgsql stable security invoker set search_path = '' as $$
declare existing jsonb := legacy_graph_staging.public_graph_row(p_table, p_id);
begin
  if existing is null then return null; end if;
  if p_payload is not null and existing = p_payload then
    return 'exact_public_match';
  end if;
  if legacy_graph_staging.fingerprint_payload(existing) = p_fingerprint then
    if p_payload is not null and existing is distinct from p_payload then
      return 'divergent_public_row';
    end if;
    return 'exact_public_match';
  end if;
  return 'divergent_public_row';
end $$;

create function legacy_graph_staging.record_conflict(
  p_run text,
  p_ref text,
  p_table text,
  p_source uuid,
  p_target uuid,
  p_url text,
  p_kind text,
  p_status text,
  p_fields text[],
  p_details jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  insert into legacy_graph_staging.record_conflicts (
    source_project_ref, run_id, source_table, source_id, target_id, source_url,
    conflict_kind, recovery_status, affected_fields, details
  ) values (
    p_ref, p_run, p_table, p_source, p_target, p_url, p_kind, p_status,
    coalesce(p_fields, '{}'), coalesce(p_details, '{}'::jsonb)
  )
  on conflict (source_project_ref, run_id, source_table, source_id, conflict_kind) do nothing
  returning id into result;
  if result is null then
    select id into result
    from legacy_graph_staging.record_conflicts
    where source_project_ref = p_ref and run_id = p_run and source_table = p_table
      and source_id = p_source and conflict_kind = p_kind;
  end if;
  return result;
end $$;

create function legacy_graph_staging.append_payload_version(
  p_staged uuid,
  p_conflict uuid,
  p_predecessor uuid,
  p_ref text,
  p_table text,
  p_source uuid,
  p_origin text,
  p_payload jsonb,
  p_digest text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare result uuid;
  next_ordinal integer;
begin
  select id into result
  from legacy_graph_staging.payload_versions
  where staged_record_id = p_staged and payload_sha256 = p_digest;
  if result is not null then return result; end if;
  select coalesce(max(ordinal), 0) + 1 into next_ordinal
  from legacy_graph_staging.payload_versions
  where staged_record_id = p_staged;
  insert into legacy_graph_staging.payload_versions (
    staged_record_id, conflict_id, predecessor_id, source_project_ref, source_table,
    source_id, ordinal, origin, payload, payload_sha256
  ) values (
    p_staged, p_conflict, p_predecessor, p_ref, p_table, p_source, next_ordinal,
    p_origin, p_payload, p_digest
  )
  returning id into result;
  return result;
end $$;

create function legacy_graph_staging.stage_record(p_job uuid, p_run text, p_record jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  rec jsonb := p_record;
  src_table text;
  src_ref text;
  src_id uuid;
  family text;
  payload jsonb;
  digest text;
  existing legacy_graph_staging.staged_records%rowtype;
  public_row jsonb;
  public_state text;
  public_digest text;
  decision text;
  review text := 'pending';
  proposed uuid;
  conflict_id uuid;
  original_version uuid;
  incoming_version uuid;
  public_version uuid;
begin
  src_ref := rec->>'source_project_ref';
  src_table := rec->>'source_table';
  src_id := (rec->>'source_id')::uuid;
  payload := rec->'payload';
  if src_ref is null or src_table is null or src_id is null or payload is null then
    raise exception 'staged record requires project, table, id, and payload';
  end if;
  digest := legacy_graph_staging.verified_digest(payload, rec->>'payload_sha256');
  proposed := legacy_graph_staging.lookup_mapping_target(src_ref, src_table, src_id, rec, p_job);
  if rec ? 'reader_state' or rec ? 'comparison_validation_state' or payload ? 'publish' then
    raise exception 'staging cannot carry publication directives';
  end if;
  family := coalesce(nullif(rec->>'object_family', ''), legacy_graph_staging.object_family(src_table, payload));
  if src_table = 'events' and family <> 'source_comparison_event' then
    raise exception 'Source Comparison events cannot be labeled as graph objects';
  end if;
  if src_table = 'nodes' and family = 'source_comparison_event' then
    raise exception 'graph nodes cannot be labeled as Source Comparison events';
  end if;
  if legacy_graph_staging.family_collision(src_table, src_id) then
    decision := 'event_family_not_interchangeable';
    review := 'quarantined';
    conflict_id := legacy_graph_staging.record_conflict(
      p_run, src_ref, src_table, src_id, src_id, rec->>'source_url',
      'event_family_not_interchangeable', 'unresolved_family_collision',
      array['id', 'object_family'],
      jsonb_build_object('note', 'Graph and Source Comparison event IDs are not interchangeable.')
    );
  elsif coalesce(rec->>'recovery_status', '') = 'not_restorable_no_pre_import_snapshot' then
    decision := 'historical_url_upsert_no_snapshot';
    review := 'gap_recorded';
    conflict_id := legacy_graph_staging.record_conflict(
      p_run, src_ref, src_table, src_id, proposed, rec->>'source_url',
      'historical_url_upsert_no_snapshot', 'not_restorable_no_pre_import_snapshot',
      array['title', 'url', 'body_text'],
      jsonb_build_object('note', 'Recorded historical gap. Missing versions are not invented.')
    );
  else
    public_row := legacy_graph_staging.public_graph_row(src_table, src_id);
    public_state := legacy_graph_staging.public_graph_collision(src_table, src_id, digest, payload);
    if public_state = 'divergent_public_row' then
      decision := 'identical_id_divergent_content';
      review := 'quarantined';
      public_digest := legacy_graph_staging.fingerprint_payload(public_row);
    elsif public_state = 'exact_public_match' then
      decision := 'use_existing_mapping';
      review := 'pending';
      proposed := src_id;
    elsif proposed is not null then
      decision := 'existing_import_mapping_skipped';
      review := 'pending';
    else
      decision := 'insert_unmapped_identity';
      review := 'pending';
    end if;
  end if;

  select * into existing
  from legacy_graph_staging.staged_records
  where source_project_ref = src_ref and source_table = src_table and source_id = src_id;
  if found then
    if existing.payload = payload then
      return jsonb_build_object(
        'id', existing.id, 'source_id', existing.source_id, 'decision', existing.decision,
        'review_state', existing.review_state, 'replayed', true,
        'payload_sha256', existing.payload_sha256, 'proposed_target_id', existing.proposed_target_id
      );
    end if;
    select id into original_version
    from legacy_graph_staging.payload_versions
    where staged_record_id = existing.id and payload_sha256 = existing.payload_sha256;
    incoming_version := legacy_graph_staging.append_payload_version(
      existing.id, null, original_version, src_ref, src_table, src_id,
      'incoming_divergent', payload, digest
    );
    conflict_id := legacy_graph_staging.record_conflict(
      p_run, src_ref, src_table, src_id, existing.proposed_target_id, rec->>'source_url',
      'identical_id_divergent_content', 'unresolved_id_collision',
      array['payload'],
      jsonb_build_object(
        'note', 'Existing staged payload is preserved. Divergent incoming payload is retained as a linked version.',
        'original_sha256', existing.payload_sha256,
        'incoming_sha256', digest,
        'original_version_id', original_version,
        'incoming_version_id', incoming_version
      )
    );
    update legacy_graph_staging.staged_records
      set review_state = 'quarantined', decision = 'identical_id_divergent_content'
      where id = existing.id;
    return jsonb_build_object(
      'id', existing.id, 'source_id', existing.source_id, 'decision', 'identical_id_divergent_content',
      'review_state', 'quarantined', 'replayed', false, 'payload_sha256', existing.payload_sha256,
      'incoming_sha256', digest, 'incoming_version_id', incoming_version, 'conflict_id', conflict_id,
      'proposed_target_id', existing.proposed_target_id
    );
  end if;

  insert into legacy_graph_staging.staged_records (
    job_id, source_project_ref, source_table, source_id, proposed_target_id,
    object_family, payload, payload_sha256, source_url, source_imported_at,
    review_state, decision, identity_decision
  ) values (
    p_job, src_ref, src_table, src_id, proposed, family, payload, digest,
    rec->>'source_url', nullif(rec->>'source_imported_at', '')::timestamptz,
    review, decision, decision
  ) returning * into existing;

  original_version := legacy_graph_staging.append_payload_version(
    existing.id, conflict_id, null, src_ref, src_table, src_id, 'staged_original', payload, digest
  );
  if public_row is not null and public_state = 'divergent_public_row' then
    public_version := legacy_graph_staging.append_payload_version(
      existing.id, null, original_version, src_ref, src_table, src_id,
      'public_current', public_row, public_digest
    );
    conflict_id := legacy_graph_staging.record_conflict(
      p_run, src_ref, src_table, src_id, src_id, rec->>'source_url',
      'identical_id_divergent_content', 'unresolved_id_collision',
      array['title', 'url', 'body_text', 'published_at'],
      jsonb_build_object(
        'note', 'Current production row is preserved. Incoming payload is quarantined.',
        'original_sha256', public_digest,
        'incoming_sha256', digest,
        'original_version_id', public_version,
        'incoming_version_id', original_version
      )
    );
  end if;

  return jsonb_build_object(
    'id', existing.id, 'source_id', existing.source_id, 'decision', decision,
    'review_state', review, 'replayed', false, 'payload_sha256', digest,
    'version_id', original_version, 'conflict_id', conflict_id,
    'proposed_target_id', existing.proposed_target_id
  );
end $$;

create function legacy_graph_staging.validate_endpoints(p_record jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  src_table text := p_record->>'source_table';
  src_ref text := p_record->>'source_project_ref';
  src_id uuid := (p_record->>'source_id')::uuid;
  checks jsonb := '[]'::jsonb;
  endpoint uuid;
  role text;
  roles text[];
  required boolean;
  resolved boolean;
  resolution text;
  orphan boolean := false;
  current legacy_graph_staging.staged_records%rowtype;
begin
  if src_table not in ('edges', 'sources', 'citations', 'story_arcs', 'arc_events') then
    return jsonb_build_object('source_id', src_id, 'checks', checks, 'orphan', false);
  end if;

  roles := case src_table
    when 'edges' then array['endpoint_source', 'endpoint_target']
    when 'sources' then array['node']
    when 'citations' then array['article', 'resolved_node']
    when 'story_arcs' then array['root_node']
    when 'arc_events' then array['arc']
  end;
  foreach role in array roles
  loop
    required := role in ('endpoint_source', 'endpoint_target', 'node', 'article', 'arc');
    endpoint := legacy_graph_staging.record_endpoint_id(p_record, role);
    if endpoint is null and not required then
      continue;
    end if;
    resolved := false;
    resolution := 'missing';
    if endpoint is not null and role in ('endpoint_source', 'endpoint_target', 'node', 'resolved_node', 'root_node') then
      if exists (
        select 1 from legacy_graph_staging.staged_records s
        where s.source_project_ref = src_ref and s.source_table = 'nodes' and s.source_id = endpoint
          and s.review_state <> 'quarantined'
      ) or exists (select 1 from public.nodes n where n.id = endpoint) then
        resolved := true;
        resolution := 'graph_node';
      elsif exists (select 1 from public.events e where e.id = endpoint) then
        resolution := 'source_comparison_event_not_graph_node';
      end if;
    elsif endpoint is not null and role = 'article' then
      if exists (
        select 1 from legacy_graph_staging.staged_records s
        where s.source_project_ref = src_ref and s.source_table = 'articles' and s.source_id = endpoint
          and s.review_state <> 'quarantined'
      ) or exists (select 1 from public.articles a where a.id = endpoint) then
        resolved := true;
        resolution := 'article';
      end if;
    elsif endpoint is not null and role = 'arc' then
      if exists (
        select 1 from legacy_graph_staging.staged_records s
        where s.source_project_ref = src_ref and s.source_table = 'story_arcs' and s.source_id = endpoint
          and s.review_state <> 'quarantined'
      ) or exists (select 1 from public.story_arcs a where a.id = endpoint) then
        resolved := true;
        resolution := 'story_arc';
      end if;
    end if;
    insert into legacy_graph_staging.endpoint_checks (
      source_project_ref, source_table, source_id, endpoint_role, endpoint_id, resolved, resolution
    ) values (src_ref, src_table, src_id, role, endpoint, resolved, resolution)
    on conflict (source_project_ref, source_table, source_id, endpoint_role) do update
      set endpoint_id = excluded.endpoint_id,
          resolved = excluded.resolved,
          resolution = excluded.resolution,
          checked_at = clock_timestamp();
    checks := checks || jsonb_build_array(jsonb_build_object(
      'role', role, 'endpoint_id', endpoint, 'resolved', resolved, 'resolution', resolution
    ));
    if not resolved then orphan := true; end if;
  end loop;

  select * into current
  from legacy_graph_staging.staged_records
  where source_project_ref = src_ref and source_table = src_table and source_id = src_id;

  if orphan then
    if current.id is not null and current.review_state = 'pending' then
      update legacy_graph_staging.staged_records
        set review_state = 'quarantined', decision = 'orphan_endpoint'
        where id = current.id;
    end if;
    perform legacy_graph_staging.record_conflict(
      coalesce(p_record->>'run_id', 'endpoint-validation'),
      src_ref, src_table, src_id, null, p_record->>'source_url',
      'orphan_endpoint', 'unresolved_endpoint_dependency',
      array['endpoints'],
      jsonb_build_object('note', 'Relationship endpoints are not rewritten. Missing or unknown endpoints stay private.')
    );
  elsif current.id is not null and current.decision = 'orphan_endpoint' then
    update legacy_graph_staging.staged_records
      set review_state = legacy_graph_staging.review_for_decision(current.identity_decision),
          decision = current.identity_decision
      where id = current.id;
  end if;

  return jsonb_build_object('source_id', src_id, 'checks', checks, 'orphan', orphan);
end $$;

create function legacy_graph_staging.staged_record_input(p_run text, p_ref text, p_table text, p_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'run_id', p_run,
    'source_project_ref', s.source_project_ref,
    'source_table', s.source_table,
    'source_id', s.source_id,
    'payload', s.payload,
    'source_url', s.source_url
  )
  from legacy_graph_staging.staged_records s
  where s.source_project_ref = p_ref and s.source_table = p_table and s.source_id = p_id
$$;

create function legacy_graph_staging.validate_until_stable(p_run text, p_page jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  rec jsonb;
  before jsonb;
  after jsonb;
  passes integer := 0;
begin
  loop
    passes := passes + 1;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'decision', s.decision, 'review_state', s.review_state
    ) order by s.id), '[]'::jsonb)
      into before
    from legacy_graph_staging.staged_records s;

    for rec in
      select value from jsonb_array_elements(p_page) as payload_rows(value)
    loop
      perform legacy_graph_staging.validate_endpoints(rec || jsonb_build_object('run_id', p_run));
    end loop;

    for rec in
      select legacy_graph_staging.staged_record_input(
        p_run, s.source_project_ref, s.source_table, s.source_id
      )
      from legacy_graph_staging.staged_records s
      where s.source_table in ('edges', 'sources', 'citations', 'story_arcs', 'arc_events')
    loop
      perform legacy_graph_staging.validate_endpoints(rec);
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'decision', s.decision, 'review_state', s.review_state
    ) order by s.id), '[]'::jsonb)
      into after
    from legacy_graph_staging.staged_records s;

    exit when before = after or passes >= 200;
  end loop;
  return passes;
end $$;

create function legacy_graph_staging.prepare_page(p_records jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare
  rec jsonb;
  prepared jsonb := '[]'::jsonb;
  payload jsonb;
  digest text;
begin
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) < 1 or jsonb_array_length(p_records) > 100 then
    raise exception 'page must contain 1-100 records';
  end if;
  for rec in select value from jsonb_array_elements(p_records) as payload_rows(value)
  loop
    payload := rec->'payload';
    digest := legacy_graph_staging.verified_digest(payload, rec->>'payload_sha256');
    prepared := prepared || jsonb_build_array(rec || jsonb_build_object('payload_sha256', digest));
  end loop;
  return prepared;
end $$;

create function legacy_graph_staging.job_results(p_job uuid, p_page jsonb default null, p_items jsonb default null)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'source_id', s.source_id,
    'decision', s.decision,
    'review_state', s.review_state,
    'replayed', coalesce((item->>'replayed')::boolean, p_items is null),
    'payload_sha256', s.payload_sha256,
    'proposed_target_id', s.proposed_target_id,
    'version_id', nullif(item->>'version_id', ''),
    'conflict_id', nullif(item->>'conflict_id', ''),
    'incoming_sha256', nullif(item->>'incoming_sha256', ''),
    'incoming_version_id', nullif(item->>'incoming_version_id', '')
  ) order by page.ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_page, (
    select j.page from legacy_graph_staging.import_jobs j where j.id = p_job
  ))) with ordinality as page(rec, ord)
  join legacy_graph_staging.staged_records s
    on s.source_project_ref = page.rec->>'source_project_ref'
   and s.source_table = page.rec->>'source_table'
   and s.source_id = (page.rec->>'source_id')::uuid
  left join lateral (
    select value
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as staged_items(value)
    where (value->>'source_id') is not distinct from page.rec->>'source_id'
    limit 1
  ) item_row(item) on true
$$;

create function legacy_graph_staging.enqueue(p_run_id text, p_records jsonb, p_mappings jsonb default '[]'::jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  job legacy_graph_staging.import_jobs%rowtype;
  prepared jsonb;
  page_digest text;
  first_row jsonb;
  mappings jsonb := coalesce(p_mappings, '[]'::jsonb);
begin
  if p_run_id is null or btrim(p_run_id) = '' or char_length(p_run_id) > 120 then
    raise exception 'run_id required';
  end if;
  if jsonb_typeof(mappings) <> 'array' then
    raise exception 'mappings must be an array';
  end if;
  prepared := legacy_graph_staging.prepare_page(p_records);
  page_digest := legacy_graph_staging.fingerprint_payload(prepared);
  first_row := prepared->0;

  insert into legacy_graph_staging.import_jobs (
    run_id, source_project_ref, source_table, page, mappings, page_sha256, page_size, state
  ) values (
    p_run_id,
    first_row->>'source_project_ref',
    first_row->>'source_table',
    prepared,
    mappings,
    page_digest,
    jsonb_array_length(prepared),
    'pending'
  )
  on conflict (run_id) do nothing
  returning * into job;

  if job.id is null then
    select * into job from legacy_graph_staging.import_jobs where run_id = p_run_id;
    if job.page_sha256 is distinct from page_digest then
      raise exception 'run_id page conflict';
    end if;
    if job.state = 'completed' then
      return jsonb_build_object(
        'job_id', job.id, 'run_id', p_run_id, 'staged', job.processed_count,
        'already_completed', true, 'results', legacy_graph_staging.job_results(job.id)
      );
    end if;
    return jsonb_build_object('job_id', job.id, 'run_id', p_run_id, 'queued', true, 'state', job.state);
  end if;

  insert into legacy_graph_staging.job_events (job_id, event_kind, detail)
  values (job.id, 'enqueued', jsonb_build_object('count', jsonb_array_length(prepared)));
  return jsonb_build_object('job_id', job.id, 'run_id', p_run_id, 'queued', true, 'state', job.state);
end $$;

create function legacy_graph_staging.claim_job(p_run_id text default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare job legacy_graph_staging.import_jobs%rowtype;
begin
  select * into job
  from legacy_graph_staging.import_jobs
  where (p_run_id is null or run_id = p_run_id)
    and available_at <= clock_timestamp()
    and (
      state in ('pending', 'interrupted')
      or (state = 'processing' and lease_expires_at is not null and lease_expires_at < clock_timestamp())
    )
  order by created_at
  for update skip locked
  limit 1;
  if not found then return null; end if;
  if job.attempt_count >= 5 then
    update legacy_graph_staging.import_jobs
      set state = 'dead_letter', lease_token = null, lease_expires_at = null
      where id = job.id;
    insert into legacy_graph_staging.job_events (job_id, event_kind, detail)
    values (job.id, 'dead_letter', jsonb_build_object('reason', 'attempt_budget_exhausted'));
    return null;
  end if;
  update legacy_graph_staging.import_jobs
    set state = 'processing',
        attempt_count = attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + interval '2 minutes'
    where id = job.id
    returning * into job;
  insert into legacy_graph_staging.job_events (job_id, event_kind, detail)
  values (job.id, 'claimed', jsonb_build_object('attempt', job.attempt_count));
  return to_jsonb(job);
end $$;

create function legacy_graph_staging.finish_job(p_job uuid, p_token uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  job legacy_graph_staging.import_jobs%rowtype;
  rec jsonb;
  staged jsonb := '[]'::jsonb;
  item jsonb;
  n integer := 0;
begin
  update legacy_graph_staging.import_jobs
    set cursor_after_id = cursor_after_id
    where id = p_job
      and lease_token = p_token
      and state = 'processing'
      and lease_expires_at is not null
      and lease_expires_at > clock_timestamp()
    returning * into job;
  if job.id is null then
    raise exception 'expired or superseded staging lease';
  end if;

  for rec in select value from jsonb_array_elements(job.page) as payload_rows(value)
  loop
    item := legacy_graph_staging.stage_record(job.id, job.run_id, rec);
    staged := staged || jsonb_build_array(item);
    n := n + 1;
  end loop;
  perform legacy_graph_staging.validate_until_stable(job.run_id, job.page);

  update legacy_graph_staging.import_jobs
    set state = 'completed',
        lease_token = null,
        lease_expires_at = null,
        processed_count = n,
        cursor_after_id = nullif((job.page->-1->>'source_id'), '')::uuid
    where id = job.id
      and lease_token = p_token
      and state = 'processing'
    returning * into job;
  if job.id is null then
    raise exception 'expired or superseded staging lease';
  end if;
  insert into legacy_graph_staging.job_events (job_id, event_kind, detail)
  values (job.id, 'finished', jsonb_build_object('processed', n));
  return jsonb_build_object(
    'job_id', job.id,
    'run_id', job.run_id,
    'state', job.state,
    'staged', n,
    'results', legacy_graph_staging.job_results(job.id, job.page, staged)
  );
end $$;

create function legacy_graph_staging.fail_job(p_job uuid, p_token uuid, p_code text, p_retryable boolean) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  job legacy_graph_staging.import_jobs%rowtype;
  next_state text;
begin
  if p_retryable and (
    select attempt_count < 5 from legacy_graph_staging.import_jobs where id = p_job
  ) then
    next_state := 'interrupted';
  else
    next_state := 'dead_letter';
  end if;
  update legacy_graph_staging.import_jobs
    set state = next_state,
        lease_token = null,
        lease_expires_at = null,
        available_at = clock_timestamp()
    where id = p_job
      and lease_token = p_token
      and state = 'processing'
      and lease_expires_at is not null
      and lease_expires_at > clock_timestamp()
    returning * into job;
  if job.id is null then
    raise exception 'expired or superseded staging lease';
  end if;
  insert into legacy_graph_staging.job_events (job_id, event_kind, detail)
  values (p_job, 'failed', jsonb_build_object('code', p_code, 'state', next_state));
  return next_state;
end $$;

create function legacy_graph_staging.status(p_run_id text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('state', j.state, 'jobs', j.jobs))
    from (
      select state, count(*)::int as jobs
      from legacy_graph_staging.import_jobs
      where run_id = p_run_id
      group by state
    ) j
  ), '[]'::jsonb);
end $$;

create function legacy_graph_staging.manifest() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  return jsonb_build_object(
    'staged', coalesce((
      select jsonb_object_agg(source_table, n) from (
        select source_table, count(*)::int as n from legacy_graph_staging.staged_records group by 1
      ) s
    ), '{}'::jsonb),
    'review_states', coalesce((
      select jsonb_object_agg(review_state, n) from (
        select review_state, count(*)::int as n from legacy_graph_staging.staged_records group by 1
      ) s
    ), '{}'::jsonb),
    'conflicts', coalesce((
      select jsonb_object_agg(conflict_kind, n) from (
        select conflict_kind, count(*)::int as n from legacy_graph_staging.record_conflicts group by 1
      ) s
    ), '{}'::jsonb),
    'payload_versions', (select count(*)::int from legacy_graph_staging.payload_versions),
    'orphans', (select count(*)::int from legacy_graph_staging.endpoint_checks where not resolved),
    'public_nodes', (select count(*)::int from public.nodes),
    'public_edges', (select count(*)::int from public.edges)
  );
end $$;

create function public.mip_legacy_graph_v1(p_action text, p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  case p_action
    when 'enqueue' then
      return legacy_graph_staging.enqueue(
        p_input->>'run_id',
        p_input->'records',
        coalesce(p_input->'mappings', '[]'::jsonb)
      );
    when 'claim' then
      return legacy_graph_staging.claim_job(nullif(p_input->>'run_id', ''));
    when 'finish' then
      return legacy_graph_staging.finish_job((p_input->>'job_id')::uuid, (p_input->>'lease_token')::uuid);
    when 'fail' then
      return to_jsonb(legacy_graph_staging.fail_job(
        (p_input->>'job_id')::uuid,
        (p_input->>'lease_token')::uuid,
        p_input->>'code',
        coalesce((p_input->>'retryable')::boolean, false)
      ));
    when 'status' then
      return legacy_graph_staging.status(p_input->>'run_id');
    when 'manifest' then
      return legacy_graph_staging.manifest();
    when 'endpoints' then
      return legacy_graph_staging.validate_endpoints(p_input);
    when 'fingerprint' then
      return jsonb_build_object('sha256', legacy_graph_staging.fingerprint_payload(p_input->'payload'));
    when 'publish' then
      raise exception 'publication is not implemented in this phase';
    else
      raise exception 'unsupported legacy graph staging action';
  end case;
end $$;

revoke all on function public.mip_legacy_graph_v1(text, jsonb) from public, anon, authenticated;
grant execute on function public.mip_legacy_graph_v1(text, jsonb) to service_role;

do $$
declare t text;
begin
  foreach t in array array['import_jobs', 'staged_records', 'record_conflicts', 'payload_versions', 'endpoint_checks', 'job_events']
  loop
    execute format('alter table legacy_graph_staging.%I enable row level security', t);
    execute format('revoke all on legacy_graph_staging.%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert on legacy_graph_staging.%I to service_role', t);
  end loop;
  foreach t in array array['record_conflicts', 'payload_versions', 'job_events']
  loop
    execute format(
      'create trigger immutable_legacy_graph_staging before update or delete on legacy_graph_staging.%I for each row execute function legacy_graph_staging.reject_mutation()',
      t
    );
    execute format(
      'create trigger immutable_legacy_graph_staging_truncate before truncate on legacy_graph_staging.%I for each statement execute function legacy_graph_staging.reject_mutation()',
      t
    );
  end loop;
  create trigger immutable_legacy_graph_staging_endpoint_checks_delete
    before delete on legacy_graph_staging.endpoint_checks
    for each row execute function legacy_graph_staging.reject_mutation();
  create trigger immutable_legacy_graph_staging_endpoint_checks_truncate
    before truncate on legacy_graph_staging.endpoint_checks
    for each statement execute function legacy_graph_staging.reject_mutation();
end $$;

grant update on legacy_graph_staging.import_jobs to service_role;
grant update (review_state, decision) on legacy_graph_staging.staged_records to service_role;
grant update on legacy_graph_staging.endpoint_checks to service_role;

create trigger immutable_legacy_graph_staging_delete
  before delete on legacy_graph_staging.staged_records
  for each row execute function legacy_graph_staging.reject_mutation();
create trigger immutable_legacy_graph_staging_no_truncate
  before truncate on legacy_graph_staging.staged_records
  for each statement execute function legacy_graph_staging.reject_mutation();

revoke all on all functions in schema legacy_graph_staging from public, anon, authenticated;
grant execute on all functions in schema legacy_graph_staging to service_role;
grant usage, select on all sequences in schema legacy_graph_staging to service_role;

comment on schema legacy_graph_staging is
  'Private legacy-graph staging and reconciliation. Records stay pending or quarantined. No public graph publication.';
comment on function public.mip_legacy_graph_v1(text, jsonb) is
  'Server-only legacy graph staging RPC. publish is rejected. Never writes public.nodes or public.edges.';
comment on function legacy_graph_staging.fingerprint_payload(jsonb) is
  'SHA-256 of canonical JSON matching scripts/mipLegacyGraphStaging.mjs fingerprintPayload. Distinct jsonb numbers never share a digest.';
commit;
