-- ISOLATED QUALIFICATION ONLY.
-- This is not a Supabase migration and must not be applied to a live project.
-- It creates no schedule, network path, provider call, publication path, or
-- canonical-domain write. The prerequisite roles are listed in README.md.

begin;

do $$
declare missing_count integer; unsafe_count integer; membership_count integer;
begin
  select count(*) into missing_count from unnest(array[
    'mip_shadow_store_owner_v1','mip_shadow_worker_fn_owner_v1',
    'mip_shadow_authority_fn_owner_v1','mip_shadow_runtime_a_fixture',
    'mip_shadow_runtime_b_fixture','mip_shadow_admitter_fixture',
    'mip_shadow_recovery_fixture','anon','authenticated','service_role','authenticator'
  ]) required(name) left join pg_roles r on r.rolname=required.name where r.oid is null;
  if missing_count<>0 then raise exception 'mip_shadow_required_role_missing'; end if;

  select count(*) into unsafe_count from pg_roles where rolname like 'mip_shadow_%'
    and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit
      or (rolname like '%_owner_%' and rolcanlogin)
      or (rolname not like '%_owner_%' and not rolcanlogin));
  if unsafe_count<>0 then raise exception 'mip_shadow_unsafe_role_attributes'; end if;

  select count(*) into membership_count from pg_auth_members m
    join pg_roles member_role on member_role.oid=m.member
    join pg_roles granted_role on granted_role.oid=m.roleid
    where member_role.rolname like 'mip_shadow_%' or granted_role.rolname like 'mip_shadow_%';
  if membership_count<>0 then raise exception 'mip_shadow_role_membership_forbidden'; end if;
end $$;

create schema collector_shadow_private authorization mip_shadow_store_owner_v1;
create schema collector_shadow_api authorization mip_shadow_store_owner_v1;
create schema collector_shadow_control authorization mip_shadow_store_owner_v1;

revoke all on schema collector_shadow_private, collector_shadow_api,
  collector_shadow_control from public, anon, authenticated, service_role,
  authenticator;

alter default privileges for role mip_shadow_store_owner_v1
  revoke execute on functions from public;
alter default privileges for role mip_shadow_worker_fn_owner_v1
  revoke execute on functions from public;
alter default privileges for role mip_shadow_authority_fn_owner_v1
  revoke execute on functions from public;

set role mip_shadow_store_owner_v1;

create table collector_shadow_private.authorization_fence (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 1 check(revision > 0),
  changed_at timestamptz not null default clock_timestamp() check(isfinite(changed_at))
);
insert into collector_shadow_private.authorization_fence(singleton) values(true);

create table collector_shadow_private.source_revisions (
  id uuid primary key default gen_random_uuid(),
  project_ref text not null check(length(project_ref) between 1 and 100),
  source_id text not null check(length(source_id) between 1 and 200),
  feed_url text not null check(length(feed_url) between 8 and 2000),
  registry_revision text not null check(length(registry_revision) between 1 and 300),
  binding_sha256 text not null check(binding_sha256 ~ '^[0-9a-f]{64}$'),
  admitted_at timestamptz not null default clock_timestamp() check(isfinite(admitted_at)),
  retired_at timestamptz check(retired_at is null or isfinite(retired_at)),
  unique(project_ref, source_id, registry_revision, binding_sha256)
);

create table collector_shadow_private.capture_revisions (
  id uuid primary key default gen_random_uuid(),
  source_revision uuid not null references collector_shadow_private.source_revisions(id),
  observed_at timestamptz not null check(isfinite(observed_at)),
  content_type text not null check(content_type in
    ('application/rss+xml','application/atom+xml','application/xml','text/xml')),
  payload_text text not null check(octet_length(payload_text) between 1 and 2000000),
  payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
  retained_at timestamptz not null default clock_timestamp() check(isfinite(retained_at)),
  check(observed_at <= retained_at),
  check(payload_sha256 = encode(sha256(convert_to(payload_text,'UTF8')),'hex')),
  unique(source_revision, observed_at, payload_sha256)
);

create table collector_shadow_private.rights_revisions (
  id uuid primary key default gen_random_uuid(),
  capture_revision uuid not null references collector_shadow_private.capture_revisions(id),
  visibility text not null check(visibility = 'public'),
  basis text not null check(length(basis) between 1 and 200),
  policy_version text not null check(length(policy_version) between 1 and 100),
  approval_id text not null check(length(approval_id) between 1 and 300),
  envelope_sha256 text not null check(envelope_sha256 ~ '^[0-9a-f]{64}$'),
  valid_until timestamptz check(valid_until is null or isfinite(valid_until)),
  approved_at timestamptz not null default clock_timestamp() check(isfinite(approved_at)),
  revoked_at timestamptz check(revoked_at is null or isfinite(revoked_at)),
  unique(capture_revision, approval_id, policy_version)
);

create table collector_shadow_private.implementations (
  implementation_ref text primary key check(length(implementation_ref) between 1 and 300),
  adapter text not null check(length(adapter) between 1 and 300),
  edge_package_sha256 text not null check(edge_package_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_source_sha256 text not null check(normalized_source_sha256 ~ '^[0-9a-f]{64}$'),
  provider_state text not null check(provider_state = 'disabled'),
  approved_at timestamptz not null default clock_timestamp() check(isfinite(approved_at)),
  retired_at timestamptz check(retired_at is null or isfinite(retired_at))
);

create table collector_shadow_private.config_revisions (
  id uuid primary key default gen_random_uuid(),
  implementation_ref text not null references collector_shadow_private.implementations(implementation_ref),
  config jsonb not null check(jsonb_typeof(config)='object' and octet_length(config::text)<=1048576),
  canonical_sha256 text not null check(canonical_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz not null default clock_timestamp() check(isfinite(approved_at)),
  retired_at timestamptz check(retired_at is null or isfinite(retired_at)),
  unique(implementation_ref, canonical_sha256)
);

create table collector_shadow_private.runtime_bindings (
  runtime_id uuid primary key,
  principal_login name not null,
  source_revision uuid not null references collector_shadow_private.source_revisions(id),
  implementation_ref text not null references collector_shadow_private.implementations(implementation_ref),
  authority_revision bigint not null check(authority_revision > 0),
  active boolean not null default true,
  bound_at timestamptz not null default clock_timestamp() check(isfinite(bound_at)),
  revoked_at timestamptz check(revoked_at is null or isfinite(revoked_at)),
  unique(principal_login, runtime_id)
);

create table collector_shadow_private.runtime_sessions (
  id uuid primary key,
  token_sha256 text not null check(token_sha256 ~ '^[0-9a-f]{64}$'),
  runtime_id uuid not null references collector_shadow_private.runtime_bindings(runtime_id),
  principal_login name not null,
  authority_revision bigint not null check(authority_revision > 0),
  issued_at timestamptz not null default clock_timestamp() check(isfinite(issued_at)),
  expires_at timestamptz not null check(isfinite(expires_at)),
  revoked_at timestamptz check(revoked_at is null or isfinite(revoked_at)),
  check(expires_at > issued_at),
  unique(token_sha256)
);

create table collector_shadow_private.generations (
  id uuid primary key default gen_random_uuid(),
  source_revision uuid not null references collector_shadow_private.source_revisions(id),
  capture_revision uuid not null references collector_shadow_private.capture_revisions(id),
  rights_revision uuid not null references collector_shadow_private.rights_revisions(id),
  config_revision uuid not null references collector_shadow_private.config_revisions(id),
  implementation_ref text not null references collector_shadow_private.implementations(implementation_ref),
  knowledge_change_cause text not null check(knowledge_change_cause in
    ('new_relevant_evidence','source_corrected','source_retracted','source_revised',
     'source_lineage_changed','entity_merged','entity_split','entity_remapped',
     'relationship_reassessed','assessment_revised','temporal_reinterpreted',
     'algorithm_changed','policy_changed','domain_adapter_changed',
     'provider_model_or_method_changed','visibility_changed','human_review_or_override')),
  prior_revision uuid references collector_shadow_private.generations(id),
  input_payload jsonb not null check(jsonb_typeof(input_payload)='object' and octet_length(input_payload::text)<=2100000),
  input_hash text not null check(input_hash=encode(sha256(convert_to(input_payload::text,'UTF8')),'hex')),
  admitted_at timestamptz not null default clock_timestamp() check(isfinite(admitted_at)),
  check(prior_revision is null or prior_revision <> id),
  unique nulls not distinct(capture_revision, rights_revision, config_revision, implementation_ref,
    knowledge_change_cause, prior_revision)
);

create table collector_shadow_private.jobs (
  generation_id uuid primary key references collector_shadow_private.generations(id),
  state text not null default 'pending' check(state in ('pending','processing','completed','failed')),
  attempt integer not null default 0 check(attempt between 0 and 3),
  runtime_id uuid references collector_shadow_private.runtime_bindings(runtime_id),
  lease_token_sha256 text check(lease_token_sha256 is null or lease_token_sha256 ~ '^[0-9a-f]{64}$'),
  lease_expires_at timestamptz check(lease_expires_at is null or isfinite(lease_expires_at)),
  available_at timestamptz not null default clock_timestamp() check(isfinite(available_at)),
  failure_code text check(failure_code is null or failure_code in
    ('mip_shadow_lease_attempts_exhausted','mip_shadow_unsupported_or_malformed_feed',
     'mip_shadow_input_shape','mip_shadow_source_binding','mip_shadow_payload_binding',
     'mip_shadow_rights_binding','mip_shadow_method_binding','mip_shadow_config_binding',
     'mip_shadow_change_binding','mip_shadow_implementation_mismatch',
     'mip_shadow_retained_input_size','mip_shadow_retained_input_hash_mismatch',
     'mip_shadow_bounded_algorithm_failure')),
  check((state='processing' and runtime_id is not null and lease_token_sha256 is not null
      and lease_expires_at is not null and failure_code is null)
    or (state<>'processing' and runtime_id is null and lease_token_sha256 is null
      and lease_expires_at is null)),
  check((state='failed')=(failure_code is not null))
);

create table collector_shadow_private.outputs (
  generation_id uuid primary key references collector_shadow_private.generations(id),
  attempt integer not null check(attempt between 1 and 3),
  runtime_id uuid not null,
  input_hash text not null,
  implementation_ref text not null,
  output_payload jsonb not null check(jsonb_typeof(output_payload)='object' and octet_length(output_payload::text)<=2097152),
  database_payload_sha256 text not null,
  worker_canonical_sha256 text not null check(worker_canonical_sha256 ~ '^[0-9a-f]{64}$'),
  lease_token_sha256 text not null check(lease_token_sha256 ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz not null default clock_timestamp() check(isfinite(completed_at)),
  check(database_payload_sha256=encode(sha256(convert_to(output_payload::text,'UTF8')),'hex'))
);

create table collector_shadow_private.failure_reports (
  generation_id uuid primary key references collector_shadow_private.generations(id),
  attempt integer not null check(attempt between 1 and 3),
  runtime_id uuid not null,
  input_hash text not null,
  implementation_ref text not null,
  failure_code text not null,
  lease_token_sha256 text not null check(lease_token_sha256 ~ '^[0-9a-f]{64}$'),
  reported_at timestamptz not null default clock_timestamp() check(isfinite(reported_at))
);

create table collector_shadow_private.request_runs (
  request_id uuid primary key,
  operation text not null check(operation in ('shadow_claim','shadow_complete','shadow_fail')),
  principal_login name not null,
  runtime_id uuid not null,
  argument_sha256 text not null check(argument_sha256 ~ '^[0-9a-f]{64}$'),
  generation_id uuid,
  attempt integer,
  result jsonb not null,
  committed_at timestamptz not null default clock_timestamp() check(isfinite(committed_at)),
  check((generation_id is null and attempt is null) or
    (generation_id is not null and attempt between 1 and 3))
);

create table collector_shadow_private.recovery_events (
  id bigint generated always as identity primary key,
  generation_id uuid not null references collector_shadow_private.generations(id),
  prior_attempt integer not null check(prior_attempt between 1 and 3),
  action text not null check(action in ('expired_requeued','attempts_exhausted')),
  recovery_principal name not null,
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at))
);

create function collector_shadow_private.reject_rewrite() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'mip_shadow_immutable_history'; end $$;

create function collector_shadow_private.allow_one_way_retirement() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_name in ('source_revisions','implementations','config_revisions')
    and to_jsonb(old)->'retired_at'='null'::jsonb and to_jsonb(new)->'retired_at'<>'null'::jsonb
    and (to_jsonb(new)-'retired_at')=(to_jsonb(old)-'retired_at') then return new;
  elsif tg_table_name='rights_revisions'
    and to_jsonb(old)->'revoked_at'='null'::jsonb and to_jsonb(new)->'revoked_at'<>'null'::jsonb
    and (to_jsonb(new)-'revoked_at')=(to_jsonb(old)-'revoked_at') then return new;
  elsif tg_table_name='runtime_sessions'
    and to_jsonb(old)->'revoked_at'='null'::jsonb and to_jsonb(new)->'revoked_at'<>'null'::jsonb
    and (to_jsonb(new)-'revoked_at')=(to_jsonb(old)-'revoked_at') then return new;
  elsif tg_table_name='runtime_bindings'
    and (to_jsonb(old)->>'active')::boolean and not (to_jsonb(new)->>'active')::boolean
    and to_jsonb(old)->'revoked_at'='null'::jsonb and to_jsonb(new)->'revoked_at'<>'null'::jsonb
    and (to_jsonb(new)-array['active','revoked_at'])=(to_jsonb(old)-array['active','revoked_at']) then return new;
  end if;
  raise exception 'mip_shadow_immutable_history';
end $$;

create function collector_shadow_private.require_read_committed() returns void
language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'mip_shadow_read_committed_required';
  end if;
end $$;

create function collector_shadow_private.require_runtime_session(
  p_session uuid, p_runtime uuid
) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from collector_shadow_private.runtime_bindings b
    join collector_shadow_private.runtime_sessions s on s.runtime_id=b.runtime_id
    join collector_shadow_private.source_revisions src on src.id=b.source_revision
    join collector_shadow_private.implementations impl on impl.implementation_ref=b.implementation_ref
    where b.runtime_id=p_runtime and b.principal_login=session_user and b.active
      and b.revoked_at is null and s.id=p_session
      and s.token_sha256=encode(sha256(convert_to(p_session::text,'UTF8')),'hex')
      and s.principal_login=session_user and s.authority_revision=b.authority_revision
      and s.revoked_at is null and s.expires_at>clock_timestamp()
      and src.retired_at is null and impl.retired_at is null;
  if not found then raise exception 'mip_shadow_runtime_session_not_authorized'; end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['capture_revisions','generations','outputs','failure_reports',
    'request_runs','recovery_events']
  loop
    execute format('create trigger reject_rewrite before update or delete on collector_shadow_private.%I for each row execute function collector_shadow_private.reject_rewrite()',t);
    execute format('create trigger reject_truncate before truncate on collector_shadow_private.%I for each statement execute function collector_shadow_private.reject_rewrite()',t);
  end loop;
  foreach t in array array['source_revisions','implementations','config_revisions']
  loop
    execute format('create trigger allow_retirement before update on collector_shadow_private.%I for each row execute function collector_shadow_private.allow_one_way_retirement()',t);
    execute format('create trigger reject_delete before delete on collector_shadow_private.%I for each row execute function collector_shadow_private.reject_rewrite()',t);
    execute format('create trigger reject_truncate before truncate on collector_shadow_private.%I for each statement execute function collector_shadow_private.reject_rewrite()',t);
  end loop;
  create trigger allow_rights_revocation before update on collector_shadow_private.rights_revisions
    for each row execute function collector_shadow_private.allow_one_way_retirement();
  create trigger reject_rights_delete before delete on collector_shadow_private.rights_revisions
    for each row execute function collector_shadow_private.reject_rewrite();
  create trigger reject_rights_truncate before truncate on collector_shadow_private.rights_revisions
    for each statement execute function collector_shadow_private.reject_rewrite();
  create trigger reject_binding_delete before delete on collector_shadow_private.runtime_bindings
    for each row execute function collector_shadow_private.reject_rewrite();
  create trigger allow_binding_revocation before update on collector_shadow_private.runtime_bindings
    for each row execute function collector_shadow_private.allow_one_way_retirement();
  create trigger reject_binding_truncate before truncate on collector_shadow_private.runtime_bindings
    for each statement execute function collector_shadow_private.reject_rewrite();
  create trigger reject_session_delete before delete on collector_shadow_private.runtime_sessions
    for each row execute function collector_shadow_private.reject_rewrite();
  create trigger allow_session_revocation before update on collector_shadow_private.runtime_sessions
    for each row execute function collector_shadow_private.allow_one_way_retirement();
  create trigger reject_session_truncate before truncate on collector_shadow_private.runtime_sessions
    for each statement execute function collector_shadow_private.reject_rewrite();
end $$;

do $$
declare t text;
begin
  foreach t in array array['authorization_fence','source_revisions','capture_revisions',
    'rights_revisions','implementations','config_revisions','runtime_bindings','runtime_sessions',
    'generations','jobs','outputs','failure_reports','request_runs','recovery_events']
  loop
    execute format('alter table collector_shadow_private.%I enable row level security',t);
    execute format('alter table collector_shadow_private.%I force row level security',t);
    execute format('create policy worker_owner on collector_shadow_private.%I for all to mip_shadow_worker_fn_owner_v1 using (true) with check (true)',t);
    execute format('create policy authority_owner on collector_shadow_private.%I for all to mip_shadow_authority_fn_owner_v1 using (true) with check (true)',t);
  end loop;
end $$;

reset role;

grant usage on schema collector_shadow_private to mip_shadow_worker_fn_owner_v1,
  mip_shadow_authority_fn_owner_v1;
grant usage, create on schema collector_shadow_api to mip_shadow_worker_fn_owner_v1;
grant usage, create on schema collector_shadow_control to mip_shadow_authority_fn_owner_v1;

grant select on all tables in schema collector_shadow_private to
  mip_shadow_worker_fn_owner_v1, mip_shadow_authority_fn_owner_v1;
grant insert on collector_shadow_private.outputs, collector_shadow_private.failure_reports,
  collector_shadow_private.request_runs to mip_shadow_worker_fn_owner_v1;
grant update(state,attempt,runtime_id,lease_token_sha256,lease_expires_at,available_at,failure_code)
  on collector_shadow_private.jobs to mip_shadow_worker_fn_owner_v1;
grant insert, update on all tables in schema collector_shadow_private to
  mip_shadow_authority_fn_owner_v1;
grant usage, select on all sequences in schema collector_shadow_private to
  mip_shadow_authority_fn_owner_v1;
grant execute on function collector_shadow_private.require_read_committed() to
  mip_shadow_worker_fn_owner_v1, mip_shadow_authority_fn_owner_v1;
grant execute on function collector_shadow_private.require_runtime_session(uuid,uuid) to
  mip_shadow_worker_fn_owner_v1;

set role mip_shadow_authority_fn_owner_v1;

create function collector_shadow_control.register_bundle(
  p_project_ref text, p_source_id text, p_feed_url text, p_registry_revision text,
  p_source_binding_sha256 text, p_observed_at timestamptz, p_content_type text,
  p_payload_text text, p_payload_sha256 text, p_visibility text, p_basis text,
  p_policy_version text, p_approval_id text, p_rights_envelope_sha256 text,
  p_valid_until timestamptz, p_implementation text, p_adapter text,
  p_edge_package_sha256 text, p_normalized_source_sha256 text,
  p_config jsonb, p_config_canonical_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; c uuid; r uuid; cfg uuid;
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  perform 1 from collector_shadow_private.authorization_fence where singleton;
  if p_feed_url !~ '^https://[^?#]+$' or p_visibility <> 'public'
    or p_observed_at is null or not isfinite(p_observed_at) or p_observed_at > clock_timestamp()
    or p_valid_until is not null and p_valid_until <= clock_timestamp()
    or p_payload_sha256 is distinct from encode(sha256(convert_to(p_payload_text,'UTF8')),'hex')
    or p_config is null or jsonb_typeof(p_config)<>'object' then
    raise exception 'mip_shadow_authority_bundle_invalid';
  end if;
  insert into collector_shadow_private.source_revisions(project_ref,source_id,feed_url,
    registry_revision,binding_sha256) values(p_project_ref,p_source_id,p_feed_url,
    p_registry_revision,p_source_binding_sha256)
    on conflict(project_ref,source_id,registry_revision,binding_sha256) do nothing returning id into s;
  if s is null then
    select id into strict s from collector_shadow_private.source_revisions
      where project_ref=p_project_ref and source_id=p_source_id and feed_url=p_feed_url
        and registry_revision=p_registry_revision and binding_sha256=p_source_binding_sha256
        and retired_at is null;
  end if;
  insert into collector_shadow_private.capture_revisions(source_revision,observed_at,
    content_type,payload_text,payload_sha256) values(s,p_observed_at,p_content_type,
    p_payload_text,p_payload_sha256)
    on conflict(source_revision,observed_at,payload_sha256) do nothing returning id into c;
  if c is null then
    select id into strict c from collector_shadow_private.capture_revisions
      where source_revision=s and observed_at=p_observed_at and content_type=p_content_type
        and payload_text=p_payload_text and payload_sha256=p_payload_sha256;
  end if;
  insert into collector_shadow_private.rights_revisions(capture_revision,visibility,basis,
    policy_version,approval_id,envelope_sha256,valid_until) values(c,p_visibility,p_basis,
    p_policy_version,p_approval_id,p_rights_envelope_sha256,p_valid_until)
    on conflict(capture_revision,approval_id,policy_version) do nothing returning id into r;
  if r is null then
    select id into strict r from collector_shadow_private.rights_revisions
      where capture_revision=c and visibility=p_visibility and basis=p_basis
        and policy_version=p_policy_version and approval_id=p_approval_id
        and envelope_sha256=p_rights_envelope_sha256
        and valid_until is not distinct from p_valid_until and revoked_at is null;
  end if;
  insert into collector_shadow_private.implementations(implementation_ref,adapter,
    edge_package_sha256,normalized_source_sha256,provider_state)
    values(p_implementation,p_adapter,p_edge_package_sha256,p_normalized_source_sha256,'disabled')
    on conflict(implementation_ref) do nothing;
  perform 1 from collector_shadow_private.implementations where implementation_ref=p_implementation
    and adapter=p_adapter and edge_package_sha256=p_edge_package_sha256
    and normalized_source_sha256=p_normalized_source_sha256 and provider_state='disabled'
    and retired_at is null;
  if not found then raise exception 'mip_shadow_implementation_conflict'; end if;
  insert into collector_shadow_private.config_revisions(implementation_ref,config,canonical_sha256)
    values(p_implementation,p_config,p_config_canonical_sha256)
    on conflict(implementation_ref,canonical_sha256) do nothing returning id into cfg;
  if cfg is null then
    select id into strict cfg from collector_shadow_private.config_revisions
      where implementation_ref=p_implementation and config=p_config
        and canonical_sha256=p_config_canonical_sha256 and retired_at is null;
  end if;
  update collector_shadow_private.authorization_fence set revision=revision+1,changed_at=clock_timestamp()
    where singleton;
  return jsonb_build_object('source_revision',s,'capture_revision',c,
    'rights_revision',r,'config_revision',cfg);
end $$;

create function collector_shadow_control.bind_runtime(
  p_runtime uuid, p_principal name, p_source_revision uuid, p_implementation text
) returns void language plpgsql security definer set search_path='' as $$
declare rev bigint;
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  if p_principal not in ('mip_shadow_runtime_a_fixture','mip_shadow_runtime_b_fixture') then
    raise exception 'mip_shadow_principal_not_allowlisted';
  end if;
  select revision into strict rev from collector_shadow_private.authorization_fence
    where singleton;
  perform 1 from collector_shadow_private.source_revisions where id=p_source_revision and retired_at is null;
  if not found then raise exception 'mip_shadow_source_not_active'; end if;
  perform 1 from collector_shadow_private.implementations where implementation_ref=p_implementation and retired_at is null;
  if not found then raise exception 'mip_shadow_implementation_not_active'; end if;
  insert into collector_shadow_private.runtime_bindings(runtime_id,principal_login,
    source_revision,implementation_ref,authority_revision)
    values(p_runtime,p_principal,p_source_revision,p_implementation,rev);
end $$;

create function collector_shadow_control.issue_session(
  p_runtime uuid, p_ttl interval default interval '15 minutes'
) returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid:=gen_random_uuid(); b collector_shadow_private.runtime_bindings;
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  perform 1 from collector_shadow_private.authorization_fence where singleton;
  if p_ttl <= interval '0 seconds' or p_ttl > interval '30 minutes' then
    raise exception 'mip_shadow_session_ttl';
  end if;
  select * into strict b from collector_shadow_private.runtime_bindings
    where runtime_id=p_runtime and active and revoked_at is null;
  insert into collector_shadow_private.runtime_sessions(id,token_sha256,runtime_id,
    principal_login,authority_revision,expires_at)
    values(token,encode(sha256(convert_to(token::text,'UTF8')),'hex'),p_runtime,
      b.principal_login,b.authority_revision,clock_timestamp()+p_ttl);
  return token;
end $$;

create function collector_shadow_control.admit_generation(
  p_capture uuid, p_rights uuid, p_config uuid, p_cause text, p_prior uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare c collector_shadow_private.capture_revisions;
  s collector_shadow_private.source_revisions;
  r collector_shadow_private.rights_revisions;
  cfg collector_shadow_private.config_revisions;
  impl collector_shadow_private.implementations;
  payload jsonb; gid uuid;
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  perform 1 from collector_shadow_private.authorization_fence where singleton;
  select * into strict c from collector_shadow_private.capture_revisions where id=p_capture;
  select * into strict s from collector_shadow_private.source_revisions
    where id=c.source_revision and retired_at is null;
  select * into strict r from collector_shadow_private.rights_revisions
    where id=p_rights and capture_revision=p_capture and revoked_at is null
      and (valid_until is null or valid_until>clock_timestamp());
  select * into strict cfg from collector_shadow_private.config_revisions
    where id=p_config and retired_at is null;
  select * into strict impl from collector_shadow_private.implementations
    where implementation_ref=cfg.implementation_ref and retired_at is null;
  if p_prior is not null then
    perform 1 from collector_shadow_private.generations
      where id=p_prior and source_revision=s.id;
    if not found then raise exception 'mip_shadow_prior_revision_invalid'; end if;
  end if;
  payload:=jsonb_build_object(
    'version',1,
    'source',jsonb_build_object('project_ref',s.project_ref,'source_id',s.source_id,
      'feed_url',s.feed_url,'observed_at',c.observed_at,'registry_revision',s.registry_revision,
      'binding_sha256',s.binding_sha256),
    'payload',jsonb_build_object('content_type',c.content_type,'sha256',c.payload_sha256,'text',c.payload_text),
    'rights',jsonb_build_object('visibility',r.visibility,'basis',r.basis,
      'policy_version',r.policy_version,'approval_id',r.approval_id,'envelope_sha256',r.envelope_sha256),
    'method',jsonb_build_object('adapter',impl.adapter,'edge_package_sha256',impl.edge_package_sha256,
      'normalized_source_sha256',impl.normalized_source_sha256,'provider_state',impl.provider_state,
      'config_snapshot_sha256',cfg.canonical_sha256),
    'config',cfg.config,
    'knowledge_change',jsonb_build_object('cause',p_cause,'prior_revision',p_prior));
  insert into collector_shadow_private.generations(source_revision,capture_revision,rights_revision,
    config_revision,implementation_ref,knowledge_change_cause,prior_revision,input_payload,input_hash)
    values(s.id,c.id,r.id,cfg.id,impl.implementation_ref,p_cause,p_prior,payload,
      encode(sha256(convert_to(payload::text,'UTF8')),'hex'))
    on conflict(capture_revision,rights_revision,config_revision,implementation_ref,
      knowledge_change_cause,prior_revision) do nothing returning id into gid;
  if gid is null then
    select id into strict gid from collector_shadow_private.generations
      where capture_revision=c.id and rights_revision=r.id and config_revision=cfg.id
        and implementation_ref=impl.implementation_ref and knowledge_change_cause=p_cause
        and prior_revision is not distinct from p_prior and input_payload=payload;
  end if;
  insert into collector_shadow_private.jobs(generation_id) values(gid)
    on conflict(generation_id) do nothing;
  return gid;
end $$;

create function collector_shadow_control.revoke_rights(p_rights uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  perform 1 from collector_shadow_private.authorization_fence where singleton;
  update collector_shadow_private.rights_revisions set revoked_at=clock_timestamp()
    where id=p_rights and revoked_at is null;
  if not found then raise exception 'mip_shadow_rights_not_active'; end if;
  update collector_shadow_private.authorization_fence set revision=revision+1,changed_at=clock_timestamp()
    where singleton;
end $$;

create function collector_shadow_control.revoke_session(p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  update collector_shadow_private.runtime_sessions set revoked_at=clock_timestamp()
    where id=p_session and revoked_at is null;
  if not found then raise exception 'mip_shadow_session_not_active'; end if;
  update collector_shadow_private.authorization_fence set revision=revision+1,changed_at=clock_timestamp()
    where singleton;
end $$;

create function collector_shadow_control.revoke_runtime(p_runtime uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  update collector_shadow_private.runtime_bindings set active=false,revoked_at=clock_timestamp()
    where runtime_id=p_runtime and active and revoked_at is null;
  if not found then raise exception 'mip_shadow_runtime_not_active'; end if;
  update collector_shadow_private.runtime_sessions set revoked_at=clock_timestamp()
    where runtime_id=p_runtime and revoked_at is null;
  update collector_shadow_private.authorization_fence set revision=revision+1,changed_at=clock_timestamp()
    where singleton;
end $$;

create function collector_shadow_control.retire_source(p_source uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  update collector_shadow_private.source_revisions set retired_at=clock_timestamp()
    where id=p_source and retired_at is null;
  if not found then raise exception 'mip_shadow_source_not_active'; end if;
  update collector_shadow_private.authorization_fence set revision=revision+1,changed_at=clock_timestamp()
    where singleton;
end $$;

create function collector_shadow_control.retire_implementation(p_implementation text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  update collector_shadow_private.implementations set retired_at=clock_timestamp()
    where implementation_ref=p_implementation and retired_at is null;
  if not found then raise exception 'mip_shadow_implementation_not_active'; end if;
  update collector_shadow_private.authorization_fence set revision=revision+1,changed_at=clock_timestamp()
    where singleton;
end $$;

create function collector_shadow_control.retire_config(p_config uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  update collector_shadow_private.config_revisions set retired_at=clock_timestamp()
    where id=p_config and retired_at is null;
  if not found then raise exception 'mip_shadow_config_not_active'; end if;
  update collector_shadow_private.authorization_fence set revision=revision+1,changed_at=clock_timestamp()
    where singleton;
end $$;

create function collector_shadow_control.requeue_expired(
  p_generation uuid, p_expected_attempt integer
) returns text language plpgsql security definer set search_path='' as $$
declare j collector_shadow_private.jobs;
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock(720260920);
  perform 1 from collector_shadow_private.authorization_fence where singleton;
  select * into strict j from collector_shadow_private.jobs
    where generation_id=p_generation for update;
  if j.state<>'processing' or j.attempt is distinct from p_expected_attempt
    or j.lease_expires_at>clock_timestamp() then
    raise exception 'mip_shadow_recovery_precondition';
  end if;
  if j.attempt>=3 then
    update collector_shadow_private.jobs set state='failed',runtime_id=null,
      lease_token_sha256=null,lease_expires_at=null,
      failure_code='mip_shadow_lease_attempts_exhausted' where generation_id=p_generation;
    insert into collector_shadow_private.recovery_events(generation_id,prior_attempt,action,recovery_principal)
      values(p_generation,j.attempt,'attempts_exhausted',session_user);
    return 'failed';
  end if;
  update collector_shadow_private.jobs set state='pending',runtime_id=null,
    lease_token_sha256=null,lease_expires_at=null,
    available_at=clock_timestamp()+interval '5 seconds'*power(2,j.attempt-1)
    where generation_id=p_generation;
  insert into collector_shadow_private.recovery_events(generation_id,prior_attempt,action,recovery_principal)
    values(p_generation,j.attempt,'expired_requeued',session_user);
  return 'requeued';
end $$;

reset role;

set role mip_shadow_worker_fn_owner_v1;

create function collector_shadow_api.shadow_claim(
  p_session uuid, p_runtime uuid, p_request uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b collector_shadow_private.runtime_bindings;
  sess collector_shadow_private.runtime_sessions;
  prior collector_shadow_private.request_runs;
  g collector_shadow_private.generations;
  token uuid; arg_hash text; answer jsonb; next_attempt integer;
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock_shared(720260920);
  perform 1 from collector_shadow_private.authorization_fence where singleton;
  select * into strict b from collector_shadow_private.runtime_bindings
    where runtime_id=p_runtime and principal_login=session_user and active and revoked_at is null;
  select * into strict sess from collector_shadow_private.runtime_sessions
    where id=p_session and token_sha256=encode(sha256(convert_to(p_session::text,'UTF8')),'hex')
      and runtime_id=p_runtime and principal_login=session_user
      and authority_revision=b.authority_revision and revoked_at is null
      and expires_at>clock_timestamp();
  -- Session credentials are deliberately excluded from replay identity so a
  -- fresh currently-authorized session can recover the same durable request.
  arg_hash:=encode(sha256(convert_to(jsonb_build_object('runtime',p_runtime)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  perform collector_shadow_private.require_runtime_session(p_session,p_runtime);
  select * into prior from collector_shadow_private.request_runs where request_id=p_request;
  if found then
    if prior.operation<>'shadow_claim' or prior.principal_login<>session_user
      or prior.runtime_id<>p_runtime or prior.argument_sha256<>arg_hash then
      raise exception 'mip_shadow_request_conflict';
    end if;
    if prior.generation_id is not null then
      perform 1 from collector_shadow_private.generations gen
        join collector_shadow_private.rights_revisions rights on rights.id=gen.rights_revision
        join collector_shadow_private.source_revisions src on src.id=gen.source_revision
        join collector_shadow_private.implementations impl on impl.implementation_ref=gen.implementation_ref
        join collector_shadow_private.config_revisions cfg on cfg.id=gen.config_revision
        where gen.id=prior.generation_id and gen.source_revision=b.source_revision
          and gen.implementation_ref=b.implementation_ref and rights.revoked_at is null
          and (rights.valid_until is null or rights.valid_until>clock_timestamp())
          and src.retired_at is null and impl.retired_at is null and cfg.retired_at is null;
      if not found then raise exception 'mip_shadow_replay_not_authorized'; end if;
    end if;
    if prior.result='null'::jsonb then return null; end if;
    return prior.result || jsonb_build_object('replay',true);
  end if;
  select gen.* into g from collector_shadow_private.generations gen
    join collector_shadow_private.jobs j on j.generation_id=gen.id
    join collector_shadow_private.rights_revisions rr on rr.id=gen.rights_revision
    join collector_shadow_private.source_revisions src on src.id=gen.source_revision
    join collector_shadow_private.implementations i on i.implementation_ref=gen.implementation_ref
    join collector_shadow_private.config_revisions cfg on cfg.id=gen.config_revision
    where j.state='pending' and j.available_at<=clock_timestamp()
      and gen.source_revision=b.source_revision and gen.implementation_ref=b.implementation_ref
      and rr.revoked_at is null and (rr.valid_until is null or rr.valid_until>clock_timestamp())
      and src.retired_at is null and i.retired_at is null and cfg.retired_at is null
    order by gen.admitted_at,gen.id limit 1 for update of j skip locked;
  if g.id is null then
    perform collector_shadow_private.require_runtime_session(p_session,p_runtime);
    insert into collector_shadow_private.request_runs(request_id,operation,principal_login,
      runtime_id,argument_sha256,result) values(p_request,'shadow_claim',session_user,
      p_runtime,arg_hash,'null'::jsonb);
    return null;
  end if;
  perform collector_shadow_private.require_runtime_session(p_session,p_runtime);
  token:=gen_random_uuid();
  select attempt+1 into next_attempt from collector_shadow_private.jobs
    where generation_id=g.id for update;
  update collector_shadow_private.jobs set state='processing',attempt=next_attempt,
    runtime_id=p_runtime,lease_token_sha256=encode(sha256(convert_to(token::text,'UTF8')),'hex'),
    lease_expires_at=clock_timestamp()+interval '2 minutes'
    where generation_id=g.id;
  answer:=jsonb_build_object('generation_id',g.id,'lease_token',token,'attempt',next_attempt,
    'input_hash',g.input_hash,'implementation_ref',g.implementation_ref,'input_text',g.input_payload::text);
  insert into collector_shadow_private.request_runs(request_id,operation,principal_login,
    runtime_id,argument_sha256,generation_id,attempt,result)
    values(p_request,'shadow_claim',session_user,p_runtime,arg_hash,g.id,next_attempt,
      jsonb_build_object('generation_id',g.id,'attempt',next_attempt));
  return answer;
end $$;

create function collector_shadow_api.shadow_complete(
  p_session uuid, p_runtime uuid, p_request uuid, p_generation uuid, p_token uuid,
  p_input_hash text, p_implementation text, p_output jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare b collector_shadow_private.runtime_bindings;
  sess collector_shadow_private.runtime_sessions;
  prior collector_shadow_private.request_runs;
  j collector_shadow_private.jobs; g collector_shadow_private.generations;
  rr collector_shadow_private.rights_revisions; arg_hash text; token_hash text;
  worker_hash text; db_hash text;
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock_shared(720260920);
  perform 1 from collector_shadow_private.authorization_fence where singleton;
  select * into strict b from collector_shadow_private.runtime_bindings
    where runtime_id=p_runtime and principal_login=session_user and active and revoked_at is null;
  select * into strict sess from collector_shadow_private.runtime_sessions
    where id=p_session and token_sha256=encode(sha256(convert_to(p_session::text,'UTF8')),'hex')
      and runtime_id=p_runtime and principal_login=session_user
      and authority_revision=b.authority_revision and revoked_at is null
      and expires_at>clock_timestamp();
  if p_token is null or p_output is null or jsonb_typeof(p_output)<>'object'
    or octet_length(p_output::text)>2097152 then raise exception 'mip_shadow_output_invalid'; end if;
  arg_hash:=encode(sha256(convert_to(jsonb_build_object('runtime',p_runtime,
    'generation',p_generation,'token',p_token,'input_hash',p_input_hash,
    'implementation',p_implementation,'output',p_output)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  perform collector_shadow_private.require_runtime_session(p_session,p_runtime);
  select * into prior from collector_shadow_private.request_runs where request_id=p_request;
  if found then
    if prior.operation<>'shadow_complete' or prior.principal_login<>session_user
      or prior.runtime_id<>p_runtime or prior.argument_sha256<>arg_hash then
      raise exception 'mip_shadow_request_conflict';
    end if;
    perform 1 from collector_shadow_private.generations gen
      join collector_shadow_private.rights_revisions rights on rights.id=gen.rights_revision
      join collector_shadow_private.source_revisions src on src.id=gen.source_revision
      join collector_shadow_private.implementations impl on impl.implementation_ref=gen.implementation_ref
      join collector_shadow_private.config_revisions cfg on cfg.id=gen.config_revision
      where gen.id=prior.generation_id and gen.source_revision=b.source_revision
        and gen.implementation_ref=b.implementation_ref and rights.revoked_at is null
        and (rights.valid_until is null or rights.valid_until>clock_timestamp())
        and src.retired_at is null and impl.retired_at is null and cfg.retired_at is null;
    if not found then raise exception 'mip_shadow_replay_not_authorized'; end if;
    return prior.result->>'state';
  end if;
  select * into strict j from collector_shadow_private.jobs where generation_id=p_generation for update;
  perform collector_shadow_private.require_runtime_session(p_session,p_runtime);
  select * into strict g from collector_shadow_private.generations where id=p_generation;
  select * into strict rr from collector_shadow_private.rights_revisions where id=g.rights_revision;
  perform 1 from collector_shadow_private.config_revisions
    where id=g.config_revision and retired_at is null;
  if not found then raise exception 'mip_shadow_config_not_active'; end if;
  if g.source_revision<>b.source_revision or g.implementation_ref<>b.implementation_ref
    or rr.revoked_at is not null or rr.valid_until is not null and rr.valid_until<=clock_timestamp()
    or p_input_hash is distinct from g.input_hash or p_implementation is distinct from g.implementation_ref
    or j.state<>'processing' or j.runtime_id<>p_runtime or j.lease_expires_at<=clock_timestamp() then
    raise exception 'mip_shadow_completion_not_authorized';
  end if;
  token_hash:=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
  if j.lease_token_sha256<>token_hash then raise exception 'mip_shadow_lease_invalid'; end if;
  if (p_output->>'contract_version')::integer is distinct from 2
    or p_output#>>'{source,project_ref}' is distinct from g.input_payload#>>'{source,project_ref}'
    or p_output#>>'{source,source_id}' is distinct from g.input_payload#>>'{source,source_id}'
    or p_output#>>'{source,feed_url}' is distinct from g.input_payload#>>'{source,feed_url}'
    or p_output#>>'{source,registry_revision}' is distinct from g.input_payload#>>'{source,registry_revision}'
    or p_output#>>'{source,binding_sha256}' is distinct from g.input_payload#>>'{source,binding_sha256}'
    or (p_output#>>'{source,observed_at}')::timestamptz is distinct from
      (g.input_payload#>>'{source,observed_at}')::timestamptz
    or p_output->'rights' is distinct from g.input_payload->'rights'
    or p_output->'knowledge_change' is distinct from g.input_payload->'knowledge_change'
    or p_output#>>'{method,adapter}' is distinct from g.input_payload#>>'{method,adapter}'
    or p_output#>>'{method,edge_package_sha256}' is distinct from g.input_payload#>>'{method,edge_package_sha256}'
    or p_output#>>'{method,normalized_source_sha256}' is distinct from g.input_payload#>>'{method,normalized_source_sha256}'
    or p_output#>>'{method,config_snapshot_sha256}' is distinct from g.input_payload#>>'{method,config_snapshot_sha256}'
    or p_output#>>'{method,provider_state}' is distinct from g.input_payload#>>'{method,provider_state}'
    or coalesce(p_output#>>'{method,provider_result}','')<>'disabled'
    or coalesce(p_output#>>'{method,qualification}','')<>'unverified_host_assertions'
    or coalesce(p_output#>>'{declared_effect_scope,canonical_domain_writes}','')<>'forbidden'
    or coalesce(p_output#>>'{declared_effect_scope,publication_writes}','')<>'forbidden'
    or coalesce(p_output#>>'{declared_effect_scope,predecessor_acknowledgements}','')<>'forbidden'
    or coalesce(p_output#>>'{declared_effect_scope,provider_calls}','')<>'forbidden'
    or coalesce(p_output#>>'{declared_effect_scope,evidence_status}','')<>'requires_independent_host_and_database_audit'
    or jsonb_path_exists(p_output,'$.**.promotion_eligible ? (@ == true)') then
    raise exception 'mip_shadow_output_binding';
  end if;
  worker_hash:=p_output->>'output_sha256';
  if worker_hash is null or worker_hash !~ '^[0-9a-f]{64}$' then raise exception 'mip_shadow_output_hash'; end if;
  db_hash:=encode(sha256(convert_to(p_output::text,'UTF8')),'hex');
  insert into collector_shadow_private.outputs(generation_id,attempt,runtime_id,input_hash,
    implementation_ref,output_payload,database_payload_sha256,worker_canonical_sha256,lease_token_sha256)
    values(p_generation,j.attempt,p_runtime,p_input_hash,p_implementation,p_output,db_hash,worker_hash,token_hash);
  update collector_shadow_private.jobs set state='completed',runtime_id=null,
    lease_token_sha256=null,lease_expires_at=null where generation_id=p_generation;
  insert into collector_shadow_private.request_runs(request_id,operation,principal_login,
    runtime_id,argument_sha256,generation_id,attempt,result)
    values(p_request,'shadow_complete',session_user,p_runtime,arg_hash,p_generation,j.attempt,
      jsonb_build_object('state','completed'));
  return 'completed';
end $$;

create function collector_shadow_api.shadow_fail(
  p_session uuid, p_runtime uuid, p_request uuid, p_generation uuid, p_token uuid,
  p_input_hash text, p_implementation text, p_failure_code text
) returns text language plpgsql security definer set search_path='' as $$
declare b collector_shadow_private.runtime_bindings;
  sess collector_shadow_private.runtime_sessions;
  prior collector_shadow_private.request_runs;
  j collector_shadow_private.jobs; g collector_shadow_private.generations;
  rr collector_shadow_private.rights_revisions; arg_hash text; token_hash text;
begin
  perform collector_shadow_private.require_read_committed();
  perform pg_advisory_xact_lock_shared(720260920);
  perform 1 from collector_shadow_private.authorization_fence where singleton;
  select * into strict b from collector_shadow_private.runtime_bindings
    where runtime_id=p_runtime and principal_login=session_user and active and revoked_at is null;
  select * into strict sess from collector_shadow_private.runtime_sessions
    where id=p_session and token_sha256=encode(sha256(convert_to(p_session::text,'UTF8')),'hex')
      and runtime_id=p_runtime and principal_login=session_user
      and authority_revision=b.authority_revision and revoked_at is null
      and expires_at>clock_timestamp();
  if p_token is null or p_failure_code is null or length(p_failure_code)>100
    or p_failure_code not like 'mip_shadow_%' then raise exception 'mip_shadow_failure_invalid'; end if;
  arg_hash:=encode(sha256(convert_to(jsonb_build_object('runtime',p_runtime,
    'generation',p_generation,'token',p_token,'input_hash',p_input_hash,
    'implementation',p_implementation,'failure_code',p_failure_code)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  perform collector_shadow_private.require_runtime_session(p_session,p_runtime);
  select * into prior from collector_shadow_private.request_runs where request_id=p_request;
  if found then
    if prior.operation<>'shadow_fail' or prior.principal_login<>session_user
      or prior.runtime_id<>p_runtime or prior.argument_sha256<>arg_hash then
      raise exception 'mip_shadow_request_conflict';
    end if;
    perform 1 from collector_shadow_private.generations gen
      join collector_shadow_private.rights_revisions rights on rights.id=gen.rights_revision
      join collector_shadow_private.source_revisions src on src.id=gen.source_revision
      join collector_shadow_private.implementations impl on impl.implementation_ref=gen.implementation_ref
      join collector_shadow_private.config_revisions cfg on cfg.id=gen.config_revision
      where gen.id=prior.generation_id and gen.source_revision=b.source_revision
        and gen.implementation_ref=b.implementation_ref and rights.revoked_at is null
        and (rights.valid_until is null or rights.valid_until>clock_timestamp())
        and src.retired_at is null and impl.retired_at is null and cfg.retired_at is null;
    if not found then raise exception 'mip_shadow_replay_not_authorized'; end if;
    return prior.result->>'state';
  end if;
  select * into strict j from collector_shadow_private.jobs where generation_id=p_generation for update;
  perform collector_shadow_private.require_runtime_session(p_session,p_runtime);
  select * into strict g from collector_shadow_private.generations where id=p_generation;
  select * into strict rr from collector_shadow_private.rights_revisions where id=g.rights_revision;
  perform 1 from collector_shadow_private.config_revisions
    where id=g.config_revision and retired_at is null;
  if not found then raise exception 'mip_shadow_config_not_active'; end if;
  token_hash:=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
  if g.source_revision<>b.source_revision or g.implementation_ref<>b.implementation_ref
    or rr.revoked_at is not null or rr.valid_until is not null and rr.valid_until<=clock_timestamp()
    or p_input_hash is distinct from g.input_hash or p_implementation is distinct from g.implementation_ref
    or j.state<>'processing' or j.runtime_id<>p_runtime or j.lease_expires_at<=clock_timestamp()
    or j.lease_token_sha256<>token_hash then raise exception 'mip_shadow_failure_not_authorized'; end if;
  insert into collector_shadow_private.failure_reports(generation_id,attempt,runtime_id,
    input_hash,implementation_ref,failure_code,lease_token_sha256)
    values(p_generation,j.attempt,p_runtime,p_input_hash,p_implementation,p_failure_code,token_hash);
  update collector_shadow_private.jobs set state='failed',runtime_id=null,
    lease_token_sha256=null,lease_expires_at=null,failure_code=p_failure_code
    where generation_id=p_generation;
  insert into collector_shadow_private.request_runs(request_id,operation,principal_login,
    runtime_id,argument_sha256,generation_id,attempt,result)
    values(p_request,'shadow_fail',session_user,p_runtime,arg_hash,p_generation,j.attempt,
      jsonb_build_object('state','failed'));
  return 'failed';
end $$;

reset role;

revoke all on all tables in schema collector_shadow_private from public, anon,
  authenticated, service_role, authenticator;
revoke all on all functions in schema collector_shadow_private from public, anon,
  authenticated, service_role, authenticator;
revoke all on all functions in schema collector_shadow_api from public, anon,
  authenticated, service_role, authenticator;
revoke all on all functions in schema collector_shadow_control from public, anon,
  authenticated, service_role, authenticator;

grant usage on schema collector_shadow_api to mip_shadow_runtime_a_fixture,
  mip_shadow_runtime_b_fixture;
grant execute on function collector_shadow_api.shadow_claim(uuid,uuid,uuid),
  collector_shadow_api.shadow_complete(uuid,uuid,uuid,uuid,uuid,text,text,jsonb),
  collector_shadow_api.shadow_fail(uuid,uuid,uuid,uuid,uuid,text,text,text)
  to mip_shadow_runtime_a_fixture, mip_shadow_runtime_b_fixture;

grant usage on schema collector_shadow_control to mip_shadow_admitter_fixture,
  mip_shadow_recovery_fixture;
grant execute on function collector_shadow_control.register_bundle(text,text,text,text,text,
  timestamptz,text,text,text,text,text,text,text,text,timestamptz,text,text,text,text,jsonb,text),
  collector_shadow_control.bind_runtime(uuid,name,uuid,text),
  collector_shadow_control.issue_session(uuid,interval),
  collector_shadow_control.admit_generation(uuid,uuid,uuid,text,uuid),
  collector_shadow_control.revoke_rights(uuid),
  collector_shadow_control.revoke_session(uuid),
  collector_shadow_control.revoke_runtime(uuid),
  collector_shadow_control.retire_source(uuid),
  collector_shadow_control.retire_implementation(text),
  collector_shadow_control.retire_config(uuid)
  to mip_shadow_admitter_fixture;
grant execute on function collector_shadow_control.requeue_expired(uuid,integer)
  to mip_shadow_recovery_fixture;

commit;
