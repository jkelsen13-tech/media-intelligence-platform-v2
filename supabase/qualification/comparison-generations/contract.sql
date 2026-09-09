-- Qualification only: not a migration, production route, evaluation approval or publication API.
begin;
create schema comparison_qualification;
revoke all on schema comparison_qualification from public,anon,authenticated,service_role;

create table comparison_qualification.generations (
  id uuid primary key default gen_random_uuid(),
  source_project text not null check(length(source_project) between 1 and 100),
  input_payload jsonb not null check(jsonb_typeof(input_payload)='object' and octet_length(input_payload::text)<=2097152),
  input_hash text not null check(input_hash=encode(sha256(convert_to(input_payload::text,'UTF8')),'hex')),
  implementation_ref text not null check(length(implementation_ref) between 1 and 300),
  source_observed_at timestamptz not null check(isfinite(source_observed_at)),
  retained_at timestamptz not null default clock_timestamp(),
  check(isfinite(retained_at) and source_observed_at<=retained_at),
  unique(source_project,input_hash,implementation_ref,source_observed_at)
);
create table comparison_qualification.jobs (
  generation_id uuid primary key references comparison_qualification.generations(id),
  state text not null default 'pending' check(state in ('pending','processing','completed','failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt integer not null default 0 check(attempt between 0 and 3),
  available_at timestamptz not null default clock_timestamp() check(isfinite(available_at)),
  failure_code text check(failure_code='lease_attempts_exhausted'),
  check((state='failed')=(failure_code is not null)),
  check((state='processing' and lease_token is not null and lease_expires_at is not null and isfinite(lease_expires_at))
    or (state<>'processing' and lease_token is null and lease_expires_at is null))
);
create table comparison_qualification.outputs (
  generation_id uuid primary key references comparison_qualification.generations(id),
  input_hash text not null,
  implementation_ref text not null,
  output_payload jsonb not null check(jsonb_typeof(output_payload)='object' and octet_length(output_payload::text)<=2097152),
  output_hash text not null check(output_hash=encode(sha256(convert_to(output_payload::text,'UTF8')),'hex')),
  lease_token uuid not null,
  completed_at timestamptz not null default clock_timestamp() check(isfinite(completed_at))
);

create function comparison_qualification.reject_rewrite() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'immutable comparison generation history'; end $$;
create trigger immutable_generation before update or delete on comparison_qualification.generations
for each row execute function comparison_qualification.reject_rewrite();
create trigger immutable_output before update or delete on comparison_qualification.outputs
for each row execute function comparison_qualification.reject_rewrite();
create trigger no_generation_truncate before truncate on comparison_qualification.generations
for each statement execute function comparison_qualification.reject_rewrite();
create trigger no_output_truncate before truncate on comparison_qualification.outputs
for each statement execute function comparison_qualification.reject_rewrite();
create trigger no_job_truncate before truncate on comparison_qualification.jobs
for each statement execute function comparison_qualification.reject_rewrite();

-- Each observation is retained separately. Identity is not event time or a commit-order watermark.
create function comparison_qualification.enqueue(
  p_source text,p_payload jsonb,p_implementation text,p_observed timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_hash text; v_id uuid;
begin
  if p_observed is null or not isfinite(p_observed) or p_observed>clock_timestamp() then
    raise exception 'invalid source observation';
  end if;
  v_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  insert into comparison_qualification.generations(source_project,input_payload,input_hash,implementation_ref,source_observed_at)
  values(p_source,p_payload,v_hash,p_implementation,p_observed)
  on conflict(source_project,input_hash,implementation_ref,source_observed_at) do nothing
  returning id into v_id;
  if v_id is null then
    select id into strict v_id from comparison_qualification.generations
    where source_project=p_source and input_hash=v_hash and implementation_ref=p_implementation and source_observed_at=p_observed
      and input_payload=p_payload;
  end if;
  insert into comparison_qualification.jobs(generation_id) values(v_id) on conflict do nothing;
  return v_id;
end $$;

create function comparison_qualification.claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare j comparison_qualification.jobs; token uuid;
begin
  -- Exhausted leases are terminal even when another pending generation is selected.
  -- SKIP LOCKED avoids blocking independent workers; the holder reconciles its own row.
  with exhausted as (
    select generation_id from comparison_qualification.jobs
    where state='processing' and attempt=3 and lease_expires_at<=clock_timestamp()
    for update skip locked
  )
  update comparison_qualification.jobs q set state='failed',
    lease_token=null,lease_expires_at=null,failure_code='lease_attempts_exhausted'
    from exhausted e where q.generation_id=e.generation_id;
  select * into j from comparison_qualification.jobs
  where (state='pending' and available_at<=clock_timestamp())
    or (state='processing' and attempt<3
      and lease_expires_at + interval '30 seconds' * power(2,attempt-1)<=clock_timestamp())
  order by generation_id limit 1 for update skip locked;
  if not found then return null; end if;
  token:=gen_random_uuid();
  update comparison_qualification.jobs set state='processing',lease_token=token,
    lease_expires_at=clock_timestamp()+interval '2 minutes',attempt=attempt+1
    where generation_id=j.generation_id;
  return (select jsonb_build_object('generation_id',g.id,'lease_token',token,
    'input_hash',g.input_hash,'implementation_ref',g.implementation_ref,
    'source_project',g.source_project,'source_observed_at',g.source_observed_at,
    'input_text',g.input_payload::text)
    from comparison_qualification.generations g where g.id=j.generation_id);
end $$;

-- A shape-valid output is trusted worker output, NOT evidence admission or semantic certification.
-- No work_ref-only completion exists: exact output and its input binding commit with job completion.
create function comparison_qualification.complete(
  p_generation uuid,p_token uuid,p_input_hash text,p_implementation text,p_output jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare j comparison_qualification.jobs; g comparison_qualification.generations;
  prior comparison_qualification.outputs; v_hash text;
begin
  if p_token is null or p_output is null or jsonb_typeof(p_output)<>'object'
    or octet_length(p_output::text)>2097152 then raise exception 'invalid comparison output'; end if;
  select * into j from comparison_qualification.jobs where generation_id=p_generation for update;
  if not found then raise exception 'unknown comparison generation'; end if;
  select * into strict g from comparison_qualification.generations where id=p_generation;
  if p_input_hash is distinct from g.input_hash or p_implementation is distinct from g.implementation_ref then
    raise exception 'comparison input binding mismatch';
  end if;
  v_hash:=encode(sha256(convert_to(p_output::text,'UTF8')),'hex');
  if j.state='completed' then
    select * into strict prior from comparison_qualification.outputs where generation_id=p_generation;
    if prior.lease_token=p_token and prior.input_hash=p_input_hash and prior.implementation_ref=p_implementation
      and prior.output_hash=v_hash and prior.output_payload=p_output then return 'completed'; end if;
    raise exception 'comparison completion conflict';
  end if;
  if j.state<>'processing' or j.lease_token is distinct from p_token or j.lease_expires_at<=clock_timestamp() then
    raise exception 'invalid or expired comparison lease';
  end if;
  insert into comparison_qualification.outputs(generation_id,input_hash,implementation_ref,output_payload,output_hash,lease_token)
    values(p_generation,p_input_hash,p_implementation,p_output,v_hash,p_token);
  update comparison_qualification.jobs set state='completed',lease_token=null,lease_expires_at=null
    where generation_id=p_generation;
  return 'completed';
end $$;

alter table comparison_qualification.generations enable row level security;
alter table comparison_qualification.jobs enable row level security;
alter table comparison_qualification.outputs enable row level security;
revoke all on all tables in schema comparison_qualification from public,anon,authenticated,service_role;
revoke all on all functions in schema comparison_qualification from public,anon,authenticated,service_role;
grant usage on schema comparison_qualification to service_role;
grant select on all tables in schema comparison_qualification to service_role;
grant execute on function comparison_qualification.enqueue(text,jsonb,text,timestamptz),
  comparison_qualification.claim(),
  comparison_qualification.complete(uuid,uuid,text,text,jsonb) to service_role;
commit;
