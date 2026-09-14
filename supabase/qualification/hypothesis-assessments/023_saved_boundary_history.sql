-- Isolated synthetic qualification only. No live installation or role admission.
begin;
create role mip_boundary_history_gateway nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_boundary_proof_issuer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role mip_boundary_permit_cleanup nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema mip_temporal to mip_boundary_history_gateway,mip_boundary_proof_issuer,mip_boundary_permit_cleanup;
grant usage on schema mip_hypothesis to mip_temporal_advance_owner;
create function mip_hypothesis.read_selected_bound_history(p_user uuid,p_investigation uuid,p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access text; r mip_hypothesis.revisions; b mip_hypothesis.acceptance_bindings; item jsonb;
 e jsonb; permission jsonb; check_result jsonb; passage jsonb; allowed boolean; reason text; current_context boolean;
 result jsonb:='[]'; receipt mip_hypothesis.reassessment_completion_receipts;
 g mip_hypothesis.generations; closure_binding jsonb; current_bindings jsonb; selected_count integer:=0;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||p_investigation::text||':'||p_user::text,0));
 select access_role into access from evidence_pipeline.investigation_memberships where investigation_id=p_investigation and user_id=p_user;
 if access is null or access not in('viewer','reviewer') then raise exception using errcode='42501',message='hypothesis read denied';end if;
 if p_ids is null or cardinality(p_ids)>512 or array_position(p_ids,null) is not null then raise exception 'mip_boundary_prefix_limit';end if;
 -- Select the bounded IDs before loading any assessment or evaluating unrelated permissions.
 if (select count(*) from mip_hypothesis.revisions where investigation_id=p_investigation and id=any(p_ids))>128
 then raise exception 'mip_boundary_payload_limit';end if;
 for r in select * from mip_hypothesis.revisions where investigation_id=p_investigation and id=any(p_ids) order by revision loop
  selected_count:=selected_count+1;
  if selected_count>128 or octet_length(r.assessment::text)>1048576 then raise exception 'mip_boundary_payload_limit';end if;
  item:=jsonb_build_object('revision_id',r.id,'revision',r.revision,'completed_at',r.assessment->>'completed_at');
  select * into b from mip_hypothesis.acceptance_bindings where revision_id=r.id;
  if not found then
   result:=result||jsonb_build_array(item||jsonb_build_object('status','withheld','reason','missing_acceptance_binding'));
   continue;
  end if;
  allowed:=true;reason:=null;
  -- The original receipt is a binding, never enduring permission to reveal a rationale.
  for e in select value from jsonb_array_elements(b.metadata) loop
   begin
    passage:=mip_hypothesis.retained_excerpt(p_user,p_investigation,b.workspace_version_id,e->>'input_position',b.source_project,
      e->>'source_field',(e->>'start')::int,(e->>'end')::int,
      (select v->'source_span'->>'excerpt_sha256' from jsonb_array_elements(r.assessment->'evidence') v where v->>'id'=e->>'evidence_id'));
   exception when insufficient_privilege or invalid_parameter_value or no_data_found then
    allowed:=false;reason:='current_permission_or_binding_denied';exit;
   end;
   for permission in select value from jsonb_array_elements(e->'permissions') loop
    check_result:=mip_hypothesis.operation_permission(p_user,p_investigation,b.workspace_version_id,e->>'input_position',b.source_project,
      permission->>'operation',permission->>'domain');
    if check_result->'allowed' is distinct from 'true'::jsonb then
     allowed:=false;reason:='current_permission_or_binding_denied';exit;
    elsif check_result->'revision' is distinct from permission->'revision' or
      coalesce(check_result->'admission_revision','null'::jsonb) is distinct from coalesce(permission->'admission_revision','null'::jsonb) then
     allowed:=false;reason:='permission_binding_changed_fresh_review_required';exit;
    end if;
   end loop;
   exit when not allowed;
  end loop;
  if not allowed then
   result:=result||jsonb_build_array(item||jsonb_build_object('status','withheld','reason',reason));
   continue;
  end if;
  -- Preserve the later reassessment and worker closure checks from SQL006/009.
  select * into receipt from mip_hypothesis.reassessment_completion_receipts where revision_id=r.id;
  if found then
   begin
    current_bindings:=mip_hypothesis.validate_reassessment_closure(p_user,p_investigation,b.workspace_version_id,b.source_project,receipt.cause_ids);
    allowed:=current_bindings=receipt.closure_bindings;
   exception when insufficient_privilege or invalid_parameter_value or no_data_found then allowed:=false;
   end;
  end if;
  select gen.* into g from mip_hypothesis.generations gen join mip_hypothesis.generation_outputs o on o.generation_id=gen.id
   where o.assessment_revision_id=r.id;
  if found and allowed then
   begin
    for closure_binding in select value from jsonb_array_elements(g.closure_bindings) loop
     current_bindings:=mip_hypothesis.require_observed_operations(p_user,p_investigation,(closure_binding->>'workspace_version_id')::uuid,g.source_project,closure_binding->>'input_position');
     if current_bindings is distinct from closure_binding->'permissions' then allowed:=false;end if;
    end loop;
   exception when insufficient_privilege or invalid_parameter_value or no_data_found then allowed:=false;
   end;
  end if;
  if not allowed then
   result:=result||jsonb_build_array(item||jsonb_build_object('status','withheld','reason','permission_binding_changed_fresh_review_required'));
   continue;
  end if;
  current_context:=mip_hypothesis.context_current(p_investigation,b.workspace_version_id,b.observation_id);
  if g.id is not null and not exists(select 1 from mip_hypothesis.method_heads h where h.implementation=g.implementation and h.revision=g.method_revision and h.active)
  then current_context:=false;end if;
  result:=result||jsonb_build_array(item||jsonb_build_object('status','available','assessment',r.assessment,
   'workspace_version_id',b.workspace_version_id,'observation_id',b.observation_id,
   'current_context',current_context,'reassessment_pending',not current_context));
  if octet_length(result::text)>1048576 then raise exception 'mip_boundary_payload_limit';end if;
 end loop;
 return jsonb_build_object('contract_version','mip_hypothesis_history_v1','investigation_id',p_investigation,
  'entries',result,'temporal_scope','retained_versions_only','historical_commit_visibility_qualified',false,'publication_allowed',false);
end $$;
alter function mip_hypothesis.read_selected_bound_history(uuid,uuid,uuid[]) owner to mip_hypothesis_owner;
revoke all on function mip_hypothesis.read_selected_bound_history(uuid,uuid,uuid[]) from public,anon,authenticated,service_role,mip_boundary_history_gateway,mip_boundary_proof_issuer;
grant execute on function mip_hypothesis.read_selected_bound_history(uuid,uuid,uuid[]) to mip_temporal_advance_owner;

-- Narrow expiry projections: no raw identity/material tables are exposed to either service.
create function mip_identity.boundary_session_expiry(p_session uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare result timestamptz;
begin
 perform mip_identity.journal_runtime(p_session);
 select least(s.expires_at,k.valid_until,p.expires_at) into strict result
 from mip_identity.sessions s join mip_identity.key_versions k on k.revision=s.key_revision
 join comparison_qualification.principal_sessions p using(session_id) where s.session_id=p_session;
 return result;
end $$;
alter function mip_identity.boundary_session_expiry(uuid) owner to mip_identity_owner_v2;
revoke all on function mip_identity.boundary_session_expiry(uuid) from public;
grant execute on function mip_identity.boundary_session_expiry(uuid) to mip_temporal_advance_owner;

create function mip_identity.boundary_permission_expiry(p_revision uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare v mip_identity.operation_evidence_versions;c jsonb;
begin
 select * into strict v from mip_identity.operation_evidence_versions where revision=p_revision;
 c:=mip_identity.operation_check(v.scope);
 if c->'allowed' is distinct from 'true'::jsonb or (c->>'revision')::uuid is distinct from p_revision
 then raise exception 'mip_boundary_permission_expired';end if;
 return v.expires_at;
end $$;
alter function mip_identity.boundary_permission_expiry(uuid) owner to mip_publication_owner_v2;
revoke all on function mip_identity.boundary_permission_expiry(uuid) from public;
grant execute on function mip_identity.boundary_permission_expiry(uuid) to mip_hypothesis_owner;

create function mip_hypothesis.boundary_payload_expiry(p_payload jsonb) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare ids uuid[];r record;result timestamptz:='infinity';until_time timestamptz;
begin
 select array_agg((e->>'revision_id')::uuid) into ids from jsonb_array_elements(p_payload->'entries') e where e->>'status'='available';
 for r in
  with bindings as(
   select metadata as bindings from mip_hypothesis.acceptance_bindings where revision_id=any(ids)
   union all select closure_bindings from mip_hypothesis.reassessment_completion_receipts where revision_id=any(ids)
   union all select g.closure_bindings from mip_hypothesis.generations g join mip_hypothesis.generation_outputs o on o.generation_id=g.id where o.assessment_revision_id=any(ids)
  ) select distinct (p->>'revision')::uuid as revision from bindings
  cross join lateral jsonb_array_elements(bindings.bindings) b
  cross join lateral jsonb_array_elements(b->'permissions') p
 loop
  until_time:=mip_identity.boundary_permission_expiry(r.revision);
  result:=least(result,until_time);
 end loop;
 return result;
end $$;
alter function mip_hypothesis.boundary_payload_expiry(jsonb) owner to mip_hypothesis_owner;
revoke all on function mip_hypothesis.boundary_payload_expiry(jsonb) from public;
grant execute on function mip_hypothesis.boundary_payload_expiry(jsonb) to mip_temporal_advance_owner;

create table mip_temporal.boundary_history_permits(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 backend_pid integer not null,transaction_id xid8 not null,
 source_session uuid not null,binding_id uuid not null,incarnation_id uuid not null,contract_digest text not null,
 source_id uuid not null,stream_epoch uuid not null,observation_epoch uuid not null,
 terminal_capture uuid not null,target_marker uuid not null,covered_through pg_lsn not null,
 user_id uuid not null,investigation_id uuid not null,revision_ids uuid[] not null,prefix_digest text not null,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
 payload_bytes integer not null check(payload_bytes between 1 and 1048576),
 payload_entries integer not null check(payload_entries between 0 and 128),
 consumed boolean not null default false,
 check(cardinality(revision_ids)<=512),check(octet_length(contract_digest)<=128),check(octet_length(prefix_digest)<=128),
 check(expires_at>created_at and expires_at<=created_at+interval '10 seconds')
);
alter table mip_temporal.boundary_history_permits owner to mip_temporal_advance_owner;
alter table mip_temporal.boundary_history_permits enable row level security;
alter table mip_temporal.boundary_history_permits force row level security;
create policy owner_only on mip_temporal.boundary_history_permits to mip_temporal_advance_owner using(true) with check(true);
revoke all on mip_temporal.boundary_history_permits from public,anon,authenticated,service_role,mip_boundary_history_gateway,mip_boundary_proof_issuer,mip_boundary_permit_cleanup;
create index boundary_history_permits_expiry on mip_temporal.boundary_history_permits(expires_at,id);
create index boundary_history_permits_user on mip_temporal.boundary_history_permits(user_id);
-- Lock order: quota advisory lock precedes source/permission locks for issuance.
-- Consume does not take quota lock. Cleanup skips locked permits, never waits for a reader.
create function mip_temporal.cleanup_boundary_history_permits() returns integer
language plpgsql security definer set search_path='' as $cleanup$
declare removed integer;
begin
 perform pg_advisory_xact_lock(74190231,172);
 with expired as (
  select id from mip_temporal.boundary_history_permits where expires_at<=clock_timestamp()
  order by expires_at,id limit 256 for update skip locked
 )
 delete from mip_temporal.boundary_history_permits p using expired e where p.id=e.id;
 get diagnostics removed=row_count;
 return removed;
end $cleanup$;
create function mip_temporal.guard_history_permit_insert() returns trigger
language plpgsql set search_path='' as $quota$
begin
 perform pg_advisory_xact_lock(74190231,172);
 if octet_length(to_jsonb(new)::text)>32768 or
  (select count(*) from mip_temporal.boundary_history_permits)>=1024 or
  (select count(*) from mip_temporal.boundary_history_permits where user_id=new.user_id)>=32
 then raise exception 'mip_boundary_permit_quota';end if;
 return new;
end $quota$;
create trigger bounded_rows before insert on mip_temporal.boundary_history_permits
 for each row execute function mip_temporal.guard_history_permit_insert();
create function mip_temporal.boundary_history_challenge(p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_request is null or current_setting('transaction_isolation')<>'read committed' then raise exception 'mip_boundary_challenge_denied';end if;
 return jsonb_build_object('schema','mip_boundary_challenge_v1','request_id',p_request,
  'backend_pid',pg_backend_pid(),'transaction_id',pg_current_xact_id()::text);
end $$;
create function mip_temporal.boundary_history_payload(p_user uuid,p_investigation uuid,p_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare h jsonb;entries jsonb;result jsonb;
begin
 h:=mip_hypothesis.read_selected_bound_history(p_user,p_investigation,p_ids);
 -- Defensive intersection over an already selected, bounded history.
 select coalesce(jsonb_agg(e order by (e->>'revision')::bigint),'[]'::jsonb) into entries
 from jsonb_array_elements(h->'entries') e where (e->>'revision_id')::uuid=any(p_ids);
 if jsonb_array_length(entries)>128 then raise exception 'mip_boundary_payload_limit';end if;
 result:=jsonb_build_object('contract_version','mip_hypothesis_history_v1','investigation_id',p_investigation,
  'entries',entries,'temporal_scope','saved_boundary_current_permission','historical_commit_visibility_qualified',false,
  'source_authority_qualified',false,'user_history_qualified',false,'historical_time_qualified',false,'publication_allowed',false);
 if octet_length(result::text)>1048576 then raise exception 'mip_boundary_payload_limit';end if;
 return result;
end $$;
create function mip_temporal.issue_boundary_history_permit(p_session uuid,p_claim jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v mip_temporal.source_versions;c mip_temporal.stream_captures;k mip_temporal.boundary_capture_types;
 h mip_temporal.stream_heads;p mip_temporal.boundary_history_permits;actual pg_lsn;ids uuid[];auth_until timestamptz;lease_until timestamptz;sealed_payload jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' or jsonb_typeof(p_claim) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_claim))<>17 or not(p_claim ?& array[
   'schema','request_id','backend_pid','transaction_id','binding_id','incarnation_id','contract_digest',
   'source_id','stream_epoch','observation_epoch','terminal_capture','target_marker','covered_through',
   'user_id','investigation_id','revision_ids','auth_until']) or p_claim->>'schema'<>'mip_boundary_identity_proof_v1'
 then raise exception 'mip_boundary_claim_denied';end if;
 -- Serialized cleanup/quota precedes every source and permission lock.
 perform mip_temporal.cleanup_boundary_history_permits();
 v:=mip_temporal.check_boundary_stream(p_session,(p_claim->>'binding_id')::uuid,
  (p_claim->>'incarnation_id')::uuid,p_claim->>'contract_digest');
 if v.source_id is distinct from (p_claim->>'source_id')::uuid or v.stream_epoch is distinct from (p_claim->>'stream_epoch')::uuid
  or v.observation_epoch is distinct from (p_claim->>'observation_epoch')::uuid then raise exception 'mip_boundary_claim_scope';end if;
 select * into c from mip_temporal.stream_captures where id=(p_claim->>'terminal_capture')::uuid;
 select * into k from mip_temporal.boundary_capture_types where capture_id=c.id;
 select * into h from mip_temporal.stream_heads where binding_id=v.id;
 select confirmed_flush_lsn into actual from pg_catalog.pg_replication_slots where slot_name=v.slot_name;
 if c.binding_id is distinct from v.id or k.kind is distinct from 'marker'
  or k.target_request is distinct from (p_claim->>'target_marker')::uuid or c.end_lsn is distinct from (p_claim->>'covered_through')::pg_lsn
  or not exists(select 1 from mip_temporal.stream_checkpoints where capture_id=c.id)
  or h.last_lsn<c.end_lsn or actual is distinct from h.last_lsn then raise exception 'mip_boundary_claim_terminal';end if;
 if jsonb_typeof(p_claim->'revision_ids') is distinct from 'array' or jsonb_array_length(p_claim->'revision_ids')>512 then raise exception 'mip_boundary_prefix_limit';end if;
 select coalesce(array_agg(x::uuid order by x),'{}'::uuid[]) into ids from jsonb_array_elements_text(p_claim->'revision_ids') x;
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'mip_boundary_prefix_duplicate';end if;
 auth_until:=(p_claim->>'auth_until')::timestamptz;
 if not isfinite(auth_until) or auth_until<=clock_timestamp() then raise exception 'mip_boundary_auth_expired';end if;
 sealed_payload:=mip_temporal.boundary_history_payload((p_claim->>'user_id')::uuid,(p_claim->>'investigation_id')::uuid,ids);
 -- Native session authority is checked again after all permission waits.
 perform mip_temporal.check_boundary_stream(p_session,v.id,(p_claim->>'incarnation_id')::uuid,p_claim->>'contract_digest');
 lease_until:=least(auth_until,clock_timestamp()+interval '10 seconds',mip_identity.boundary_session_expiry(p_session),mip_hypothesis.boundary_payload_expiry(sealed_payload));
 if lease_until<=clock_timestamp() then raise exception 'mip_boundary_auth_expired';end if;
 insert into mip_temporal.boundary_history_permits(request_id,backend_pid,transaction_id,source_session,binding_id,
  incarnation_id,contract_digest,source_id,stream_epoch,observation_epoch,terminal_capture,target_marker,covered_through,
  user_id,investigation_id,revision_ids,prefix_digest,expires_at,payload_digest,payload_bytes,payload_entries)
 values((p_claim->>'request_id')::uuid,(p_claim->>'backend_pid')::integer,(p_claim->>'transaction_id')::xid8,p_session,v.id,
  (p_claim->>'incarnation_id')::uuid,p_claim->>'contract_digest',v.source_id,v.stream_epoch,v.observation_epoch,c.id,k.target_request,c.end_lsn,
  (p_claim->>'user_id')::uuid,(p_claim->>'investigation_id')::uuid,ids,
  encode(sha256(convert_to(array_to_string(ids,','),'UTF8')),'hex'),lease_until,encode(sha256(convert_to(sealed_payload::text,'UTF8')),'hex'),octet_length(sealed_payload::text),jsonb_array_length(sealed_payload->'entries'))
 returning * into p;
 return jsonb_build_object('schema','mip_boundary_permit_v1','permit_id',p.id,'request_id',p.request_id,
  'expires_at',p.expires_at,'prefix_digest',p.prefix_digest,'claim',p_claim);
end $$;
create function mip_temporal.consume_boundary_history_permit(p_permit uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p mip_temporal.boundary_history_permits;current_payload jsonb;v mip_temporal.source_versions;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'mip_boundary_history_isolation';end if;
 select * into p from mip_temporal.boundary_history_permits where id=p_permit for update;
 if not found or p.consumed or p.request_id is distinct from p_request or p.backend_pid<>pg_backend_pid()
  or p.transaction_id<>pg_current_xact_id() or p.expires_at<=clock_timestamp() then raise exception 'mip_boundary_permit_denied';end if;
 v:=mip_temporal.check_boundary_stream(p.source_session,p.binding_id,p.incarnation_id,p.contract_digest);
 if v.source_id<>p.source_id or v.stream_epoch<>p.stream_epoch or v.observation_epoch<>p.observation_epoch then raise exception 'mip_boundary_permit_scope';end if;
 if not exists(select 1 from mip_temporal.stream_checkpoints where capture_id=p.terminal_capture and end_lsn=p.covered_through)
  or (select confirmed_flush_lsn from pg_catalog.pg_replication_slots where slot_name=v.slot_name)
   is distinct from (select last_lsn from mip_temporal.stream_heads where binding_id=p.binding_id)
 then raise exception 'mip_boundary_permit_terminal';end if;
 current_payload:=mip_temporal.boundary_history_payload(p.user_id,p.investigation_id,p.revision_ids);
 -- No changed disclosure on savepoint replay: exact sealed payload or deny.
 if encode(sha256(convert_to(current_payload::text,'UTF8')),'hex') is distinct from p.payload_digest
  or octet_length(current_payload::text)<>p.payload_bytes or jsonb_array_length(current_payload->'entries')<>p.payload_entries or p.expires_at<=clock_timestamp() then raise exception 'mip_boundary_snapshot_changed';end if;
 perform mip_temporal.check_boundary_stream(p.source_session,p.binding_id,p.incarnation_id,p.contract_digest);
 if p.expires_at<=clock_timestamp() then raise exception 'mip_boundary_permit_expired';end if;
 update mip_temporal.boundary_history_permits set consumed=true where id=p.id;
 return jsonb_build_object('schema','mip_boundary_delivery_v1','permit_id',p.id,'request_id',p.request_id,'expires_at',p.expires_at,'remaining_ms',floor(extract(epoch from (p.expires_at-clock_timestamp()))*1000)::integer,'payload',current_payload);
end $$;
create function mip_temporal.guard_history_permit() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.expires_at>clock_timestamp() then raise exception 'mip_boundary_permit_unexpired';end if;
  return old;
 end if;
 if tg_op<>'UPDATE' or old.consumed or not new.consumed or (to_jsonb(old)-'consumed') is distinct from (to_jsonb(new)-'consumed')
 then raise exception 'mip_boundary_permit_immutable';end if;
 return new;
end $$;
create trigger immutable_rows before update or delete on mip_temporal.boundary_history_permits for each row execute function mip_temporal.guard_history_permit();
create trigger immutable_table before truncate on mip_temporal.boundary_history_permits for each statement execute function mip_hypothesis.reject_mutation();
do $owners$
declare r record;
begin
 for r in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='mip_temporal' and p.proname in('boundary_history_challenge','boundary_history_payload','issue_boundary_history_permit','consume_boundary_history_permit','guard_history_permit','cleanup_boundary_history_permits','guard_history_permit_insert') loop
  execute 'alter function '||r.signature||' owner to mip_temporal_advance_owner';
  execute 'revoke all on function '||r.signature||' from public,anon,authenticated,service_role,mip_temporal_recorder,mip_temporal_ack_gateway,mip_comparison_worker_v1,mip_boundary_history_gateway,mip_boundary_proof_issuer,mip_boundary_permit_cleanup';
 end loop;
end $owners$;
grant execute on function mip_temporal.boundary_history_challenge(uuid),mip_temporal.consume_boundary_history_permit(uuid,uuid) to mip_boundary_history_gateway;
grant execute on function mip_temporal.issue_boundary_history_permit(uuid,jsonb) to mip_boundary_proof_issuer;
grant execute on function mip_temporal.cleanup_boundary_history_permits() to mip_boundary_permit_cleanup;
commit;
