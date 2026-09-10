-- Isolated qualification only. Load after contract.sql and selection.sql.
-- Not a production migration, live grant change, publication activation or cutover.
begin;
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname='qual_public_reader') then create role qual_public_reader; end if;
  if not exists (select 1 from pg_roles where rolname='qual_comparison_producer') then create role qual_comparison_producer; end if;
  if not exists (select 1 from pg_roles where rolname='qual_comparison_worker') then create role qual_comparison_worker; end if;
  if not exists (select 1 from pg_roles where rolname='qual_comparison_scheduler') then create role qual_comparison_scheduler; end if;
  if not exists (select 1 from pg_roles where rolname='qual_selector') then create role qual_selector; end if;
  if not exists (select 1 from pg_roles where rolname='qual_publisher') then create role qual_publisher; end if;
  if not exists (select 1 from pg_roles where rolname='qual_membership_scorer') then create role qual_membership_scorer; end if;
end
$roles$;

-- Publication and automatic membership approval stay disabled unless an owner fixture flips a gate.
-- That fixture is isolated qualification, not production authorization.
create table comparison_qualification.operating_gates (
  id boolean primary key default true check(id),
  publication_release_enabled boolean not null default false,
  membership_auto_approval_enabled boolean not null default false
);
insert into comparison_qualification.operating_gates(id) values(true);

create table comparison_qualification.runtime_bindings (
  runtime_id text not null check(length(runtime_id) between 1 and 100),
  principal text not null check(length(principal) between 1 and 100),
  rpc_name text not null check(length(rpc_name) between 1 and 100),
  granted_at timestamptz not null default clock_timestamp() check(isfinite(granted_at)),
  revoked_at timestamptz,
  primary key(runtime_id,principal,rpc_name),
  check(revoked_at is null or (isfinite(revoked_at) and revoked_at>=granted_at))
);
create table comparison_qualification.principal_sessions (
  session_id uuid primary key,
  principal text not null check(length(principal) between 1 and 100),
  runtime_id text not null check(length(runtime_id) between 1 and 100),
  issued_at timestamptz not null default clock_timestamp() check(isfinite(issued_at)),
  expires_at timestamptz not null check(isfinite(expires_at) and expires_at>issued_at),
  revoked_at timestamptz,
  check(revoked_at is null or isfinite(revoked_at))
);
-- Correlation retains identities and outcomes, never lease tokens or credentials.
create table comparison_qualification.request_runs (
  request_id uuid not null,
  rpc_name text not null,
  principal text not null,
  runtime_id text not null,
  generation_id uuid,
  selection_id uuid,
  publication_id uuid,
  outcome text not null check(outcome in (
    'lease_issued','no_ready_work','completed','failed','selected','withdrawn',
    'proposed','released','parity_retained','replayed')),
  diagnostic_code text not null,
  observed_at timestamptz not null default clock_timestamp() check(isfinite(observed_at)),
  primary key(request_id,rpc_name)
);
create table comparison_qualification.publication_history (
  id uuid primary key default gen_random_uuid(),
  source_project text not null check(length(source_project) between 1 and 100),
  selection_id uuid references comparison_qualification.selection_history(id),
  generation_id uuid,
  output_hash text,
  input_hash text,
  implementation_ref text,
  dependency_hash text not null check(dependency_hash ~ '^[0-9a-f]{64}$'),
  state text not null check(state in ('unpublished','proposed','released','withdrawn','revoked')),
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  check((generation_id is null)=(state in ('withdrawn','revoked')) or state in ('unpublished','proposed','released'))
);
create table comparison_qualification.publication_heads (
  source_project text primary key check(length(source_project) between 1 and 100),
  publication_id uuid references comparison_qualification.publication_history(id)
);
create table comparison_qualification.retained_parity (
  archive_namespace text not null check(length(archive_namespace) between 1 and 100),
  source_project text not null,
  generation_id uuid not null references comparison_qualification.generations(id),
  input_hash text not null,
  output_hash text,
  job_state text not null,
  selection_id uuid,
  publication_state text,
  retained_at timestamptz not null default clock_timestamp() check(isfinite(retained_at)),
  primary key(archive_namespace,generation_id),
  check(job_state in ('pending','processing','completed','failed'))
);

create trigger immutable_request_runs before update or delete on comparison_qualification.request_runs
for each row execute function comparison_qualification.reject_rewrite();
create trigger no_request_run_truncate before truncate on comparison_qualification.request_runs
for each statement execute function comparison_qualification.reject_rewrite();
create trigger immutable_publication before update or delete on comparison_qualification.publication_history
for each row execute function comparison_qualification.reject_rewrite();
create trigger no_publication_truncate before truncate on comparison_qualification.publication_history
for each statement execute function comparison_qualification.reject_rewrite();
create trigger no_publication_head_truncate before truncate on comparison_qualification.publication_heads
for each statement execute function comparison_qualification.reject_rewrite();
create trigger immutable_parity before update or delete on comparison_qualification.retained_parity
for each row execute function comparison_qualification.reject_rewrite();
create trigger no_parity_truncate before truncate on comparison_qualification.retained_parity
for each statement execute function comparison_qualification.reject_rewrite();

create function comparison_qualification.deny(code text) returns void
language plpgsql security definer set search_path='' as $$
begin
  raise exception using errcode='42501', message=code;
end $$;

create function comparison_qualification.bound_code(
  p_principal text,p_rpc text,p_session_id uuid,p_runtime_id text
) returns text language plpgsql security definer set search_path='' as $$
declare s comparison_qualification.principal_sessions; b comparison_qualification.runtime_bindings;
begin
  if p_session_id is null or p_runtime_id is null or length(coalesce(p_runtime_id,'')) not between 1 and 100 then
    return 'mip_authz_missing_session';
  end if;
  select * into s from comparison_qualification.principal_sessions where session_id=p_session_id;
  if not found then return 'mip_authz_missing_session'; end if;
  if s.revoked_at is not null then return 'mip_authz_revoked_session'; end if;
  if s.expires_at<=clock_timestamp() then return 'mip_authz_stale_session'; end if;
  if s.principal is distinct from p_principal then return 'mip_authz_principal_mismatch'; end if;
  if s.runtime_id is distinct from p_runtime_id then return 'mip_authz_runtime_mismatch'; end if;
  select * into b from comparison_qualification.runtime_bindings
    where runtime_id=p_runtime_id and principal=p_principal and rpc_name=p_rpc;
  if not found then return 'mip_authz_unbound_principal'; end if;
  if b.revoked_at is not null then return 'mip_authz_revoked_principal'; end if;
  return 'ok';
end $$;

create function comparison_qualification.require_bound(
  p_principal text,p_rpc text,p_session_id uuid,p_runtime_id text
) returns void language plpgsql security definer set search_path='' as $$
declare code text;
begin
  code:=comparison_qualification.bound_code(p_principal,p_rpc,p_session_id,p_runtime_id);
  if code<>'ok' then perform comparison_qualification.deny(code); end if;
end $$;

create function comparison_qualification.replay(p_request uuid,p_rpc text)
returns comparison_qualification.request_runs language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs;
begin
  select * into existing from comparison_qualification.request_runs where request_id=p_request and rpc_name=p_rpc;
  return existing;
end $$;

create function comparison_qualification.record_run(
  p_request uuid,p_rpc text,p_principal text,p_runtime text,p_generation uuid,p_selection uuid,
  p_publication uuid,p_outcome text,p_code text
) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into comparison_qualification.request_runs(
    request_id,rpc_name,principal,runtime_id,generation_id,selection_id,publication_id,outcome,diagnostic_code)
  values(p_request,p_rpc,p_principal,p_runtime,p_generation,p_selection,p_publication,p_outcome,p_code);
end $$;

-- Owner/admin APIs. No grant to capability principals. Superuser test fixtures may call them.
create function comparison_qualification.issue_session(
  p_principal text,p_runtime_id text,p_expires timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid;
begin
  if p_principal is null or p_runtime_id is null or p_expires is null or not isfinite(p_expires)
    or p_expires<=clock_timestamp() then perform comparison_qualification.deny('mip_authz_missing_session'); end if;
  v:=gen_random_uuid();
  insert into comparison_qualification.principal_sessions(session_id,principal,runtime_id,expires_at)
  values(v,p_principal,p_runtime_id,p_expires);
  return v;
end $$;

create function comparison_qualification.revoke_session(p_session uuid) returns text
language plpgsql security definer set search_path='' as $$
begin
  update comparison_qualification.principal_sessions
    set revoked_at=coalesce(revoked_at,clock_timestamp()) where session_id=p_session;
  if not found then perform comparison_qualification.deny('mip_authz_missing_session'); end if;
  return 'revoked';
end $$;

create function comparison_qualification.bind_runtime(p_runtime text,p_principal text,p_rpc text) returns text
language plpgsql security definer set search_path='' as $$
begin
  insert into comparison_qualification.runtime_bindings(runtime_id,principal,rpc_name)
  values(p_runtime,p_principal,p_rpc)
  on conflict(runtime_id,principal,rpc_name) do update set revoked_at=null,granted_at=clock_timestamp();
  return 'bound';
end $$;

create function comparison_qualification.revoke_binding(p_runtime text,p_principal text,p_rpc text) returns text
language plpgsql security definer set search_path='' as $$
begin
  update comparison_qualification.runtime_bindings
    set revoked_at=coalesce(revoked_at,clock_timestamp())
    where runtime_id=p_runtime and principal=p_principal and rpc_name=p_rpc;
  if not found then perform comparison_qualification.deny('mip_authz_unbound_principal'); end if;
  return 'revoked';
end $$;

create function comparison_qualification.producer_enqueue(
  p_request uuid,p_session uuid,p_runtime text,p_source text,p_payload jsonb,p_implementation text,p_observed timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; v uuid;
begin
  perform comparison_qualification.require_bound('qual_comparison_producer','producer_enqueue',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'producer_enqueue');
  if existing.request_id is not null then return existing.generation_id; end if;
  v:=comparison_qualification.enqueue(p_source,p_payload,p_implementation,p_observed);
  perform comparison_qualification.record_run(p_request,'producer_enqueue','qual_comparison_producer',p_runtime,v,null,null,'completed','mip_request_accepted');
  return v;
end $$;

create function comparison_qualification.claim_payload(p_generation uuid,p_omit_token boolean,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_generation is null then return null; end if;
  return (select jsonb_build_object('generation_id',g.id,'input_hash',g.input_hash,
    'implementation_ref',g.implementation_ref,'source_project',g.source_project,
    'source_observed_at',g.source_observed_at,'input_text',g.input_payload::text,
    'lease_token',case when p_omit_token then null else j.lease_token end,
    'diagnostic_code',p_code)
    from comparison_qualification.generations g
    join comparison_qualification.jobs j on j.generation_id=g.id
    where g.id=p_generation);
end $$;

create function comparison_qualification.worker_claim(p_request uuid,p_session uuid,p_runtime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; claimed jsonb; v uuid;
begin
  perform comparison_qualification.require_bound('qual_comparison_worker','worker_claim',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'worker_claim');
  if existing.request_id is not null then
    if existing.outcome='no_ready_work' then return null; end if;
    return comparison_qualification.claim_payload(existing.generation_id,true,'mip_request_replay_omits_token');
  end if;
  claimed:=comparison_qualification.claim();
  v:=claimed->>'generation_id';
  if claimed is null then
    perform comparison_qualification.record_run(p_request,'worker_claim','qual_comparison_worker',p_runtime,null,null,null,'no_ready_work','mip_request_accepted');
    return null;
  end if;
  perform comparison_qualification.record_run(p_request,'worker_claim','qual_comparison_worker',p_runtime,v,null,null,'lease_issued','mip_request_accepted');
  return claimed||jsonb_build_object('diagnostic_code','mip_request_accepted');
end $$;

create function comparison_qualification.scheduler_claim(p_request uuid,p_session uuid,p_runtime text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; claimed jsonb; v uuid;
begin
  perform comparison_qualification.require_bound('qual_comparison_scheduler','scheduler_claim',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'scheduler_claim');
  if existing.request_id is not null then
    if existing.outcome='no_ready_work' then return null; end if;
    return comparison_qualification.claim_payload(existing.generation_id,true,'mip_request_replay_omits_token');
  end if;
  claimed:=comparison_qualification.claim();
  v:=claimed->>'generation_id';
  if claimed is null then
    perform comparison_qualification.record_run(p_request,'scheduler_claim','qual_comparison_scheduler',p_runtime,null,null,null,'no_ready_work','mip_request_accepted');
    return null;
  end if;
  perform comparison_qualification.record_run(p_request,'scheduler_claim','qual_comparison_scheduler',p_runtime,v,null,null,'lease_issued','mip_request_accepted');
  return claimed||jsonb_build_object('diagnostic_code','mip_request_accepted');
end $$;

create function comparison_qualification.worker_complete(
  p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,p_input_hash text,p_implementation text,p_output jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; state text;
begin
  perform comparison_qualification.require_bound('qual_comparison_worker','worker_complete',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'worker_complete');
  if existing.request_id is not null then return existing.outcome; end if;
  state:=comparison_qualification.complete(p_generation,p_token,p_input_hash,p_implementation,p_output);
  perform comparison_qualification.record_run(p_request,'worker_complete','qual_comparison_worker',p_runtime,p_generation,null,null,'completed','mip_request_accepted');
  return state;
end $$;

create function comparison_qualification.worker_fail(
  p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,p_input_hash text,p_implementation text
) returns text language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; state text;
begin
  perform comparison_qualification.require_bound('qual_comparison_worker','worker_fail',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'worker_fail');
  if existing.request_id is not null then return existing.outcome; end if;
  state:=comparison_qualification.fail(p_generation,p_token,p_input_hash,p_implementation);
  perform comparison_qualification.record_run(p_request,'worker_fail','qual_comparison_worker',p_runtime,p_generation,null,null,'failed','mip_request_accepted');
  return state;
end $$;

create function comparison_qualification.follow_publication(p_source text,p_selection uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare sel comparison_qualification.selection_history; prior comparison_qualification.publication_history;
  head uuid; pub uuid; dep text; st text; outp comparison_qualification.outputs; gen comparison_qualification.generations;
begin
  select * into strict sel from comparison_qualification.selection_history where id=p_selection;
  insert into comparison_qualification.publication_heads(source_project) values(p_source) on conflict do nothing;
  select publication_id into head from comparison_qualification.publication_heads where source_project=p_source for update;
  if head is not null then select * into prior from comparison_qualification.publication_history where id=head; end if;
  if sel.generation_id is null then
    st:=case when prior.state='released' then 'revoked' else 'withdrawn' end;
    dep:=encode(sha256(convert_to(coalesce(prior.dependency_hash,'')||':'||sel.context_hash||':withdrawn','UTF8')),'hex');
    insert into comparison_qualification.publication_history(
      source_project,selection_id,generation_id,output_hash,input_hash,implementation_ref,dependency_hash,state)
    values(p_source,p_selection,null,null,null,null,dep,st) returning id into pub;
  else
    select * into strict outp from comparison_qualification.outputs where generation_id=sel.generation_id;
    select * into strict gen from comparison_qualification.generations where id=sel.generation_id;
    dep:=encode(sha256(convert_to(gen.input_hash||':'||outp.output_hash||':'||gen.implementation_ref||':'||sel.context_hash,'UTF8')),'hex');
    insert into comparison_qualification.publication_history(
      source_project,selection_id,generation_id,output_hash,input_hash,implementation_ref,dependency_hash,state)
    values(p_source,p_selection,sel.generation_id,outp.output_hash,gen.input_hash,gen.implementation_ref,dep,'unpublished')
    returning id into pub;
  end if;
  update comparison_qualification.publication_heads set publication_id=pub where source_project=p_source;
  return pub;
end $$;

create function comparison_qualification.selector_select(
  p_request uuid,p_session uuid,p_runtime text,p_action uuid,p_source text,p_expected uuid,
  p_generation uuid,p_output_hash text,p_context jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; selected uuid; pub uuid; outcome text;
begin
  perform comparison_qualification.require_bound('qual_selector','selector_select',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'selector_select');
  if existing.request_id is not null then return existing.selection_id; end if;
  selected:=comparison_qualification.select_output(p_action,p_source,p_expected,p_generation,p_output_hash,p_context);
  pub:=comparison_qualification.follow_publication(p_source,selected);
  outcome:=case when p_generation is null then 'withdrawn' else 'selected' end;
  perform comparison_qualification.record_run(p_request,'selector_select','qual_selector',p_runtime,p_generation,selected,pub,outcome,'mip_request_accepted');
  return selected;
end $$;

create function comparison_qualification.publisher_propose(p_request uuid,p_session uuid,p_runtime text,p_source text)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; cur comparison_qualification.publication_history;
  head uuid; pub uuid;
begin
  perform comparison_qualification.require_bound('qual_publisher','publisher_propose',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'publisher_propose');
  if existing.request_id is not null then return existing.publication_id; end if;
  select publication_id into head from comparison_qualification.publication_heads where source_project=p_source for update;
  if head is null then raise exception 'unbound publication selection'; end if;
  select * into strict cur from comparison_qualification.publication_history where id=head;
  if cur.generation_id is null or cur.state not in ('unpublished','proposed') then
    raise exception 'unbound publication selection';
  end if;
  insert into comparison_qualification.publication_history(
    source_project,selection_id,generation_id,output_hash,input_hash,implementation_ref,dependency_hash,state)
  values(p_source,cur.selection_id,cur.generation_id,cur.output_hash,cur.input_hash,cur.implementation_ref,cur.dependency_hash,'proposed')
  returning id into pub;
  update comparison_qualification.publication_heads set publication_id=pub where source_project=p_source;
  perform comparison_qualification.record_run(p_request,'publisher_propose','qual_publisher',p_runtime,cur.generation_id,cur.selection_id,pub,'proposed','mip_request_accepted');
  return pub;
end $$;

create function comparison_qualification.publisher_release(p_request uuid,p_session uuid,p_runtime text,p_source text)
returns text language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; cur comparison_qualification.publication_history;
  enabled boolean; head uuid; pub uuid;
begin
  perform comparison_qualification.require_bound('qual_publisher','publisher_release',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'publisher_release');
  if existing.request_id is not null then return existing.outcome; end if;
  -- Re-check the gate after the head lock so a concurrent withdrawal or owner-fixture
  -- disable is observed. Checking the gate before the lock is not sufficient.
  select publication_id into head from comparison_qualification.publication_heads where source_project=p_source for update;
  if head is null then raise exception 'unbound publication selection'; end if;
  select * into strict cur from comparison_qualification.publication_history where id=head;
  select publication_release_enabled into strict enabled from comparison_qualification.operating_gates where id;
  if not enabled then perform comparison_qualification.deny('mip_publication_disabled'); end if;
  if cur.state<>'proposed' or cur.generation_id is null then raise exception 'unbound publication selection'; end if;
  insert into comparison_qualification.publication_history(
    source_project,selection_id,generation_id,output_hash,input_hash,implementation_ref,dependency_hash,state)
  values(p_source,cur.selection_id,cur.generation_id,cur.output_hash,cur.input_hash,cur.implementation_ref,cur.dependency_hash,'released')
  returning id into pub;
  update comparison_qualification.publication_heads set publication_id=pub where source_project=p_source;
  perform comparison_qualification.record_run(p_request,'publisher_release','qual_publisher',p_runtime,cur.generation_id,cur.selection_id,pub,'released','mip_request_accepted');
  return 'released';
end $$;

create function comparison_qualification.membership_auto_approve(p_request uuid,p_session uuid,p_runtime text,p_source text)
returns text language plpgsql security definer set search_path='' as $$
declare enabled boolean;
begin
  perform comparison_qualification.require_bound('qual_membership_scorer','membership_auto_approve',p_session,p_runtime);
  select membership_auto_approval_enabled into strict enabled from comparison_qualification.operating_gates where id;
  if not enabled then perform comparison_qualification.deny('mip_membership_auto_approval_disabled'); end if;
  raise exception 'membership auto-approval has no isolated release path';
end $$;

-- Copies hashes and operational state. Never completes pending jobs or publishes.
create function comparison_qualification.retain_parity(
  p_request uuid,p_session uuid,p_runtime text,p_archive text,p_source text
) returns integer language plpgsql security definer set search_path='' as $$
declare existing comparison_qualification.request_runs; n int;
begin
  perform comparison_qualification.require_bound('qual_comparison_producer','retain_parity',p_session,p_runtime);
  existing:=comparison_qualification.replay(p_request,'retain_parity');
  if existing.request_id is not null then
    select count(*)::int into n from comparison_qualification.retained_parity
      where archive_namespace=p_archive and source_project=p_source;
    return n;
  end if;
  insert into comparison_qualification.retained_parity(
    archive_namespace,source_project,generation_id,input_hash,output_hash,job_state,selection_id,publication_state)
  select p_archive,g.source_project,g.id,g.input_hash,o.output_hash,j.state,h.selection_id,ph.state
  from comparison_qualification.generations g
  join comparison_qualification.jobs j on j.generation_id=g.id
  left join comparison_qualification.outputs o on o.generation_id=g.id
  left join comparison_qualification.selection_heads h on h.source_project=g.source_project
  left join comparison_qualification.publication_heads p on p.source_project=g.source_project
  left join comparison_qualification.publication_history ph on ph.id=p.publication_id
  where g.source_project=p_source
  on conflict do nothing;
  get diagnostics n=row_count;
  if exists (
    select 1 from comparison_qualification.retained_parity r
    join comparison_qualification.jobs j on j.generation_id=r.generation_id
    where r.archive_namespace=p_archive and r.job_state in ('pending','processing') and j.state in ('pending','processing')
      and r.job_state is distinct from 'completed'
  ) then
    null; -- pending remains pending; the insert copied the live state rather than acknowledging it
  end if;
  perform comparison_qualification.record_run(p_request,'retain_parity','qual_comparison_producer',p_runtime,null,null,null,'parity_retained','mip_parity_pending_not_acknowledged');
  return n;
end $$;

create function comparison_qualification.diagnose_authorization(p_rpc text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r text:=current_user;
begin
  return jsonb_build_object(
    'current_user',r,
    'session_user',session_user,
    'schema_usage',has_schema_privilege(r,'comparison_qualification','usage'),
    'bypassrls',exists(select 1 from pg_roles where rolname=r and rolbypassrls),
    'superuser',exists(select 1 from pg_roles where rolname=r and rolsuper),
    'rpc',p_rpc,
    'execute_enqueue',has_function_privilege(r,'comparison_qualification.enqueue(text,jsonb,text,timestamptz)','execute'),
    'execute_claim',has_function_privilege(r,'comparison_qualification.claim()','execute'),
    'execute_complete',has_function_privilege(r,'comparison_qualification.complete(uuid,uuid,text,text,jsonb)','execute'),
    'execute_select_output',has_function_privilege(r,'comparison_qualification.select_output(uuid,text,uuid,uuid,text,jsonb)','execute'),
    'execute_worker_complete',has_function_privilege(r,'comparison_qualification.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)','execute'),
    'execute_publisher_release',has_function_privilege(r,'comparison_qualification.publisher_release(uuid,uuid,text,text)','execute'),
    'ambient_note','Unbound enqueue/claim/complete/select_output remain executable by service_role. Bound RPCs check sessions. Catalog GRANT denial is distinct from mip_authz_* codes.');
end $$;

-- INVOKER so current_user is the caller. bound_code is DEFINER so session rows stay unreadable.
create function comparison_qualification.diagnose_bound_call(
  p_rpc text,p_principal text,p_session_id uuid,p_runtime_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  return jsonb_build_object(
    'current_user',current_user,
    'session_user',session_user,
    'rpc',p_rpc,
    'principal',p_principal,
    'code',comparison_qualification.bound_code(p_principal,p_rpc,p_session_id,p_runtime_id),
    'catalog_note','If the caller lacks GRANT EXECUTE on the target RPC, PostgreSQL raises permission denied. That error is not an mip_authz_* code.');
end $$;

create function comparison_qualification.effective_authority()
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  return comparison_qualification.diagnose_authorization('effective_authority');
end $$;

alter table comparison_qualification.operating_gates enable row level security;
alter table comparison_qualification.runtime_bindings enable row level security;
alter table comparison_qualification.principal_sessions enable row level security;
alter table comparison_qualification.request_runs enable row level security;
alter table comparison_qualification.publication_history enable row level security;
alter table comparison_qualification.publication_heads enable row level security;
alter table comparison_qualification.retained_parity enable row level security;

create policy reader_released_history on comparison_qualification.publication_history
  for select to qual_public_reader using (state='released');
create policy reader_released_heads on comparison_qualification.publication_heads
  for select to qual_public_reader
  using (exists (select 1 from comparison_qualification.publication_history h
    where h.id=publication_id and h.state='released'));

revoke all on comparison_qualification.operating_gates,comparison_qualification.runtime_bindings,
  comparison_qualification.principal_sessions,comparison_qualification.request_runs,
  comparison_qualification.publication_history,comparison_qualification.publication_heads,
  comparison_qualification.retained_parity from public,anon,authenticated,service_role,
  qual_public_reader,qual_comparison_producer,qual_comparison_worker,qual_comparison_scheduler,
  qual_selector,qual_publisher,qual_membership_scorer;
grant select on comparison_qualification.operating_gates,comparison_qualification.runtime_bindings,
  comparison_qualification.principal_sessions,comparison_qualification.request_runs,
  comparison_qualification.publication_history,comparison_qualification.publication_heads,
  comparison_qualification.retained_parity to service_role;
grant select on comparison_qualification.publication_history,comparison_qualification.publication_heads
  to qual_public_reader;

grant usage on schema comparison_qualification to qual_public_reader,qual_comparison_producer,
  qual_comparison_worker,qual_comparison_scheduler,qual_selector,qual_publisher,qual_membership_scorer;

revoke all on function comparison_qualification.deny(text),
  comparison_qualification.bound_code(text,text,uuid,text),
  comparison_qualification.require_bound(text,text,uuid,text),
  comparison_qualification.replay(uuid,text),
  comparison_qualification.record_run(uuid,text,text,text,uuid,uuid,uuid,text,text),
  comparison_qualification.issue_session(text,text,timestamptz),
  comparison_qualification.revoke_session(uuid),
  comparison_qualification.bind_runtime(text,text,text),
  comparison_qualification.revoke_binding(text,text,text),
  comparison_qualification.producer_enqueue(uuid,uuid,text,text,jsonb,text,timestamptz),
  comparison_qualification.claim_payload(uuid,boolean,text),
  comparison_qualification.worker_claim(uuid,uuid,text),
  comparison_qualification.scheduler_claim(uuid,uuid,text),
  comparison_qualification.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb),
  comparison_qualification.worker_fail(uuid,uuid,text,uuid,uuid,text,text),
  comparison_qualification.follow_publication(text,uuid),
  comparison_qualification.selector_select(uuid,uuid,text,uuid,text,uuid,uuid,text,jsonb),
  comparison_qualification.publisher_propose(uuid,uuid,text,text),
  comparison_qualification.publisher_release(uuid,uuid,text,text),
  comparison_qualification.membership_auto_approve(uuid,uuid,text,text),
  comparison_qualification.retain_parity(uuid,uuid,text,text,text),
  comparison_qualification.diagnose_authorization(text),
  comparison_qualification.diagnose_bound_call(text,text,uuid,text),
  comparison_qualification.effective_authority()
from public,anon,authenticated,service_role,qual_public_reader,qual_comparison_producer,
  qual_comparison_worker,qual_comparison_scheduler,qual_selector,qual_publisher,qual_membership_scorer;

grant execute on function comparison_qualification.producer_enqueue(uuid,uuid,text,text,jsonb,text,timestamptz),
  comparison_qualification.retain_parity(uuid,uuid,text,text,text) to qual_comparison_producer;
grant execute on function comparison_qualification.worker_claim(uuid,uuid,text),
  comparison_qualification.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb),
  comparison_qualification.worker_fail(uuid,uuid,text,uuid,uuid,text,text) to qual_comparison_worker;
grant execute on function comparison_qualification.scheduler_claim(uuid,uuid,text) to qual_comparison_scheduler;
grant execute on function comparison_qualification.selector_select(uuid,uuid,text,uuid,text,uuid,uuid,text,jsonb) to qual_selector;
grant execute on function comparison_qualification.publisher_propose(uuid,uuid,text,text),
  comparison_qualification.publisher_release(uuid,uuid,text,text) to qual_publisher;
grant execute on function comparison_qualification.membership_auto_approve(uuid,uuid,text,text) to qual_membership_scorer;
grant execute on function comparison_qualification.bound_code(text,text,uuid,text),
  comparison_qualification.diagnose_authorization(text),
  comparison_qualification.diagnose_bound_call(text,text,uuid,text),
  comparison_qualification.effective_authority() to anon,authenticated,service_role,qual_public_reader,
  qual_comparison_producer,qual_comparison_worker,qual_comparison_scheduler,qual_selector,qual_publisher,
  qual_membership_scorer;
commit;
