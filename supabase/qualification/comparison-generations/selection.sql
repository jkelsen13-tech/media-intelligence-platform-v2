-- Isolated qualification only. No public reader, publication authority or production migration.
begin;
create table comparison_qualification.selection_history (
  id uuid primary key,
  source_project text not null check(length(source_project) between 1 and 100),
  predecessor uuid references comparison_qualification.selection_history(id),
  generation_id uuid references comparison_qualification.outputs(generation_id),
  output_hash text,
  context_payload jsonb not null check(jsonb_typeof(context_payload)='object' and octet_length(context_payload::text)<=2097152),
  context_hash text not null check(context_hash=encode(sha256(convert_to(context_payload::text,'UTF8')),'hex')),
  recorded_at timestamptz not null default clock_timestamp() check(isfinite(recorded_at)),
  check((generation_id is null and output_hash is null) or
    (generation_id is not null and output_hash is not null and output_hash ~ '^[0-9a-f]{64}$'))
);
create table comparison_qualification.selection_heads (
  source_project text primary key check(length(source_project) between 1 and 100),
  selection_id uuid references comparison_qualification.selection_history(id)
);
create trigger immutable_selection before update or delete on comparison_qualification.selection_history
for each row execute function comparison_qualification.reject_rewrite();
create trigger no_selection_truncate before truncate on comparison_qualification.selection_history
for each statement execute function comparison_qualification.reject_rewrite();
create trigger no_selection_head_truncate before truncate on comparison_qualification.selection_heads
for each statement execute function comparison_qualification.reject_rewrite();

-- Caller context is retained, not independently approved. NULL generation means explicit withdrawal.
-- Exact retry returns its historical receipt without restoring a superseded selection.
create function comparison_qualification.select_output(
  p_action uuid,p_source text,p_expected uuid,p_generation uuid,p_output_hash text,p_context jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare head uuid; prior comparison_qualification.selection_history; expected_hash text;
begin
  if p_action is null or p_source is null or length(p_source) not between 1 and 100
    or p_context is null or jsonb_typeof(p_context)<>'object' or octet_length(p_context::text)>2097152
    or (p_generation is null)<>(p_output_hash is null) then
    raise exception 'invalid selection request';
  end if;
  insert into comparison_qualification.selection_heads(source_project) values(p_source) on conflict do nothing;
  select selection_id into head from comparison_qualification.selection_heads where source_project=p_source for update;
  select * into prior from comparison_qualification.selection_history where id=p_action;
  if found then
    if prior.source_project=p_source and prior.predecessor is not distinct from p_expected
      and prior.generation_id is not distinct from p_generation
      and prior.output_hash is not distinct from p_output_hash and prior.context_payload=p_context then
      return prior.id;
    end if;
    raise exception 'selection retry conflict';
  end if;
  if head is distinct from p_expected then raise exception 'stale selection predecessor'; end if;
  if p_generation is not null then
    select o.output_hash into expected_hash
    from comparison_qualification.outputs o
    join comparison_qualification.generations g on g.id=o.generation_id
    join comparison_qualification.jobs j on j.generation_id=g.id
    where g.id=p_generation and g.source_project=p_source and j.state='completed'
      and o.input_hash=g.input_hash and o.implementation_ref=g.implementation_ref;
    if not found or expected_hash is distinct from p_output_hash then
      raise exception 'unbound selection output';
    end if;
  end if;
  insert into comparison_qualification.selection_history
    (id,source_project,predecessor,generation_id,output_hash,context_payload,context_hash)
    values(p_action,p_source,p_expected,p_generation,p_output_hash,p_context,
      encode(sha256(convert_to(p_context::text,'UTF8')),'hex'));
  update comparison_qualification.selection_heads set selection_id=p_action where source_project=p_source;
  return p_action;
end $$;
alter table comparison_qualification.selection_history enable row level security;
alter table comparison_qualification.selection_heads enable row level security;
revoke all on comparison_qualification.selection_history,comparison_qualification.selection_heads
from public,anon,authenticated,service_role;
grant select on comparison_qualification.selection_history,comparison_qualification.selection_heads to service_role;
revoke all on function comparison_qualification.select_output(uuid,text,uuid,uuid,text,jsonb)
from public,anon,authenticated,service_role;
grant execute on function comparison_qualification.select_output(uuid,text,uuid,uuid,text,jsonb) to service_role;
commit;
