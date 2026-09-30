-- Isolated atomic reassessment completion; no worker, publication or production deployment.
set role mip_hypothesis_owner;
create table mip_hypothesis.reassessment_completion_receipts(
 investigation_id uuid not null,
 request_id uuid not null,
 revision_id uuid not null unique,
 cause_ids uuid[] not null check(cardinality(cause_ids)>0),
 closure_bindings jsonb not null check(jsonb_typeof(closure_bindings)='array'),
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(investigation_id,request_id),
 foreign key(investigation_id,revision_id) references mip_hypothesis.revisions(investigation_id,id)
);
create table mip_hypothesis.reassessment_resolutions(
 cause_id uuid primary key references mip_hypothesis.reassessment_causes(id),
 investigation_id uuid not null,
 completion_revision_id uuid not null,
 resolved_by uuid not null,
 recorded_at timestamptz not null default clock_timestamp(),
 foreign key(investigation_id,completion_revision_id) references mip_hypothesis.revisions(investigation_id,id)
);
create index reassessment_resolutions_revision on mip_hypothesis.reassessment_resolutions(investigation_id,completion_revision_id);
alter table mip_hypothesis.reassessment_completion_receipts enable row level security;
alter table mip_hypothesis.reassessment_completion_receipts force row level security;
alter table mip_hypothesis.reassessment_resolutions enable row level security;
alter table mip_hypothesis.reassessment_resolutions force row level security;
create policy owner_only on mip_hypothesis.reassessment_completion_receipts to mip_hypothesis_owner using(true) with check(true);
create policy owner_only on mip_hypothesis.reassessment_resolutions to mip_hypothesis_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_hypothesis.reassessment_completion_receipts
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.reassessment_completion_receipts
 for each statement execute function mip_hypothesis.reject_mutation();
create trigger immutable_rows before update or delete on mip_hypothesis.reassessment_resolutions
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.reassessment_resolutions
 for each statement execute function mip_hypothesis.reject_mutation();

-- The prior acceptance kernel remains available only to the NOLOGIN owner.
alter function mip_hypothesis.append_bound_revision(uuid,uuid,uuid,text,uuid,uuid,jsonb) rename to append_bound_revision_v1;
revoke execute on function mip_hypothesis.append_bound_revision_v1(uuid,uuid,uuid,text,uuid,uuid,jsonb) from mip_hypothesis_gateway;
create function mip_hypothesis.append_bound_revision(p_user uuid,p_investigation uuid,p_version uuid,p_source_project text,
 p_request uuid,p_predecessor uuid,p_assessment jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb; head uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 b:=mip_hypothesis.observation_binding(p_user,p_investigation,p_version);
 if b->>'access_role' is distinct from 'reviewer' then raise exception using errcode='42501',message='hypothesis append denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 if p_assessment ? 'reassessment_causes' then raise exception using errcode='22023',message='explicit reassessment completion required';end if;
 if not exists(select 1 from mip_hypothesis.revisions where investigation_id=p_investigation and request_id=p_request) then
  select id into head from mip_hypothesis.revisions where investigation_id=p_investigation order by revision desc limit 1;
  if head is distinct from p_predecessor then raise exception using errcode='40001',message='hypothesis predecessor changed';end if;
  perform mip_hypothesis.discover_reassessment_causes(p_investigation);
  if head is not null or exists(select 1 from mip_hypothesis.reassessment_causes c where c.investigation_id=p_investigation
    and not exists(select 1 from mip_hypothesis.reassessment_resolutions x where x.cause_id=c.id)) then
   raise exception using errcode='40001',message='hypothesis context changed; explicit reassessment completion required';
  end if;
 end if;
 return mip_hypothesis.append_bound_revision_v1(p_user,p_investigation,p_version,p_source_project,p_request,p_predecessor,p_assessment);
end $$;

create function mip_hypothesis.require_observed_operations(p_user uuid,p_investigation uuid,p_version uuid,
 p_source_project text,p_position text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operation text; domain text; checked jsonb; receipts jsonb:='[]';
begin
 foreach operation in array array['retention','analysis','excerpt_display'] loop
 foreach domain in array array['rights','privacy'] loop
  checked:=mip_hypothesis.operation_permission(p_user,p_investigation,p_version,p_position,p_source_project,operation,domain);
  if checked->'allowed' is distinct from 'true'::jsonb or (
   (checked->'synthetic'='true'::jsonb and checked->>'reason'='synthetic_mechanism_only') or
   (checked->'synthetic'='false'::jsonb and checked->>'reason'='real_evidence_bound'
    and nullif(checked->>'admission_revision','') is not null
    and checked->>'material_hash'=checked->'scope'->>'material_version'
    and jsonb_typeof(checked->'primary_evidence_refs')='array' and jsonb_array_length(checked->'primary_evidence_refs')>0)
  ) is distinct from true then raise exception using errcode='42501',message='hypothesis operation denied';end if;
  receipts:=receipts||jsonb_build_array(jsonb_build_object('operation',operation,'domain',domain,
    'revision',checked->'revision','admission_revision',checked->'admission_revision','scope',checked->'scope'));
 end loop;end loop;
 return receipts;
end $$;

create function mip_hypothesis.validate_reassessment_closure(p_user uuid,p_investigation uuid,p_version uuid,
 p_source_project text,p_causes uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v evidence_pipeline.investigation_versions; o evidence_pipeline.investigation_observations;
 c mip_hypothesis.reassessment_causes; b mip_hypothesis.acceptance_bindings; e jsonb; prior jsonb; checked jsonb; receipts jsonb; bindings jsonb:='[]';
begin
 select * into strict v from evidence_pipeline.investigation_versions where id=p_version and investigation_id=p_investigation;
 select * into strict o from evidence_pipeline.investigation_observations where id=v.observation_id;
 -- Reassessment considers the retained observation/dependency closure, not a caller-selected rights subset.
 for e in select value from jsonb_array_elements(o.snapshot->'inputs') loop
  receipts:=mip_hypothesis.require_observed_operations(p_user,p_investigation,p_version,p_source_project,e->>'position');
  bindings:=bindings||jsonb_build_array(jsonb_build_object('workspace_version_id',p_version,'input_position',e->>'position','permissions',receipts));
 end loop;
 for c in select * from mip_hypothesis.reassessment_causes where id=any(p_causes) order by case kind when 'retained_source_change' then 0 when 'retained_assessment_change' then 1 when 'workspace_changed' then 2 else 3 end,id loop
  if c.investigation_id<>p_investigation then raise exception using errcode='42501',message='reassessment cause scope denied';end if;
  select * into strict b from mip_hypothesis.acceptance_bindings where revision_id=c.revision_id;
  if b.source_project is distinct from p_source_project then raise exception using errcode='42501',message='reassessment source scope denied';end if;
  -- Preserve the complete prior completion closure even when the workspace scope narrows.
  for prior in select x.value from mip_hypothesis.reassessment_completion_receipts r
   cross join lateral jsonb_array_elements(r.closure_bindings) x where r.revision_id=c.revision_id loop
   receipts:=mip_hypothesis.require_observed_operations(p_user,p_investigation,
    (prior->>'workspace_version_id')::uuid,p_source_project,prior->>'input_position');
   bindings:=bindings||jsonb_build_array(jsonb_build_object('workspace_version_id',prior->>'workspace_version_id',
    'input_position',prior->>'input_position','permissions',receipts));
  end loop;
  -- Current authority over previously used material is required; old acceptance is not continuing permission.
  for e in select value from jsonb_array_elements(b.metadata) loop
   receipts:=mip_hypothesis.require_observed_operations(p_user,p_investigation,b.workspace_version_id,p_source_project,e->>'input_position');
   bindings:=bindings||jsonb_build_array(jsonb_build_object('workspace_version_id',b.workspace_version_id,'input_position',e->>'input_position','permissions',receipts));
  end loop;
  if c.kind='retained_source_change' and not exists(
   select 1 from jsonb_array_elements(o.snapshot->'inputs') i where i->>'position'=c.change_position::text) then
   raise exception using errcode='22023',message='reassessment missing retained source change';
  elsif c.kind='retained_assessment_change' and not exists(
   select 1 from jsonb_array_elements(o.snapshot->'assessments') a where a->>'id'=c.related_version_id::text) then
   raise exception using errcode='22023',message='reassessment missing retained assessment revision';
  elsif c.kind='workspace_changed' and not exists(
   with recursive lineage(id,predecessor_id) as (
    select id,predecessor_id from evidence_pipeline.investigation_versions where id=p_version and investigation_id=p_investigation
    union all select a.id,a.predecessor_id from evidence_pipeline.investigation_versions a join lineage l on a.id=l.predecessor_id
   ) select 1 from lineage where id=c.related_version_id
  ) then raise exception using errcode='22023',message='reassessment workspace lineage mismatch';
  elsif c.kind='permission_changed' then
   receipts:=mip_hypothesis.require_observed_operations(p_user,p_investigation,coalesce((c.detail->>'bound_workspace_version')::uuid,b.workspace_version_id),p_source_project,c.detail->>'input_position');
   select value into strict checked from jsonb_array_elements(receipts) p
    where p->>'operation'=c.detail->>'operation' and p->>'domain'=c.detail->>'domain';
   if checked->'revision' is not distinct from c.detail->'accepted_permission_revision' then
    raise exception using errcode='42501',message='fresh internal permission authorization required';
   end if;
  end if;
 end loop;
 -- Canonical unique bindings keep exact retries stable without multiplying inherited references.
 select coalesce(jsonb_agg(unique_bindings.v order by unique_bindings.v::text),'[]'::jsonb) into bindings
  from (select distinct value v from jsonb_array_elements(bindings)) unique_bindings;
 return bindings;
end $$;

create function mip_hypothesis.complete_reassessment(p_user uuid,p_investigation uuid,p_version uuid,p_source_project text,
 p_request uuid,p_predecessor uuid,p_assessment jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb; annotation jsonb; supplied uuid[]; expected uuid[]; result jsonb; closure jsonb; receipt mip_hypothesis.reassessment_completion_receipts;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 if p_request is null or p_predecessor is null then raise exception using errcode='22023',message='reassessment identity required';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 b:=mip_hypothesis.observation_binding(p_user,p_investigation,p_version);
 if b->>'access_role' is distinct from 'reviewer' then raise exception using errcode='42501',message='hypothesis completion denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 if jsonb_typeof(p_assessment->'reassessment_causes') is distinct from 'array' or jsonb_array_length(p_assessment->'reassessment_causes')=0 then
  raise exception using errcode='22023',message='explicit reassessment cause explanations required';end if;
 for annotation in select value from jsonb_array_elements(p_assessment->'reassessment_causes') loop
  if jsonb_typeof(annotation) is distinct from 'object' or not annotation ?& array['cause_id','reason']
    or exists(select 1 from jsonb_object_keys(annotation) k where k not in('cause_id','reason'))
    or nullif(btrim(annotation->>'reason'),'') is null then
   raise exception using errcode='22023',message='invalid reassessment cause explanation';end if;
 end loop;
 select array_agg((a->>'cause_id')::uuid order by (a->>'cause_id')::uuid) into supplied
  from jsonb_array_elements(p_assessment->'reassessment_causes') a;
 if array_position(supplied,null) is not null or cardinality(supplied)<>(select count(distinct x) from unnest(supplied) x) then
  raise exception using errcode='22023',message='ambiguous reassessment causes';end if;
 select * into receipt from mip_hypothesis.reassessment_completion_receipts where investigation_id=p_investigation and request_id=p_request;
 if found then
  if supplied is distinct from receipt.cause_ids then raise exception using errcode='23505',message='reassessment retry conflict';end if;
 else
  if exists(select 1 from mip_hypothesis.revisions where investigation_id=p_investigation and request_id=p_request) then
   raise exception using errcode='23505',message='reassessment request already used';end if;
  perform mip_hypothesis.discover_reassessment_causes(p_investigation);
  select array_agg(c.id order by c.id) into expected from mip_hypothesis.reassessment_causes c
   where c.investigation_id=p_investigation and not exists(select 1 from mip_hypothesis.reassessment_resolutions x where x.cause_id=c.id);
  if expected is null or supplied is distinct from expected then
   raise exception using errcode='40001',message='reassessment pending cause set changed';end if;
 end if;
 closure:=mip_hypothesis.validate_reassessment_closure(p_user,p_investigation,p_version,p_source_project,supplied);
 if receipt.request_id is not null and closure is distinct from receipt.closure_bindings then
  raise exception using errcode='42501',message='fresh bound reassessment required';end if;
 -- Kernel rechecks current context/permissions and exact owner/arguments for receipt replay.
 result:=mip_hypothesis.append_bound_revision_v1(p_user,p_investigation,p_version,p_source_project,p_request,p_predecessor,p_assessment);
 if receipt.request_id is null then
  insert into mip_hypothesis.reassessment_completion_receipts(investigation_id,request_id,revision_id,cause_ids,closure_bindings)
   values(p_investigation,p_request,(result->'assessment'->>'id')::uuid,supplied,closure) returning * into receipt;
  insert into mip_hypothesis.reassessment_resolutions(cause_id,investigation_id,completion_revision_id,resolved_by)
   select x,p_investigation,receipt.revision_id,p_user from unnest(supplied) x;
 end if;
 return result||jsonb_build_object('completed_reassessment',true,'completion_receipt',
  jsonb_build_object('request_id',receipt.request_id,'revision_id',receipt.revision_id,'cause_ids',receipt.cause_ids),
  'reassessment_pending',(result->'reassessment_pending'='true'::jsonb) or exists(
   select 1 from mip_hypothesis.reassessment_causes c where c.investigation_id=p_investigation
    and not exists(select 1 from mip_hypothesis.reassessment_resolutions x where x.cause_id=c.id)));
end $$;

alter function mip_hypothesis.reassessment_backlog(uuid,uuid) rename to reassessment_backlog_v1;
revoke execute on function mip_hypothesis.reassessment_backlog_v1(uuid,uuid) from mip_hypothesis_gateway;
create function mip_hypothesis.reassessment_backlog(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; causes jsonb;
begin
 result:=mip_hypothesis.reassessment_backlog_v1(p_user,p_investigation);
 select coalesce(jsonb_agg(c||case when x.cause_id is null then '{}'::jsonb else jsonb_build_object(
   'state','reassessment_recorded','resolution_revision_id',x.completion_revision_id,'resolved_at',x.recorded_at) end
   order by c->>'recorded_at',c->>'cause_id'),'[]'::jsonb) into causes
 from jsonb_array_elements(result->'causes') c left join mip_hypothesis.reassessment_resolutions x on x.cause_id=(c->>'cause_id')::uuid;
 return result||jsonb_build_object('contract_version','mip_hypothesis_reassessment_backlog_v2','causes',causes,'is_completion_receipt',false);
end $$;

-- Extend current-head discovery to every permission that the completion actually depended on.
alter function mip_hypothesis.discover_reassessment_causes(uuid) rename to discover_reassessment_causes_v1;
create function mip_hypothesis.discover_reassessment_causes(p_investigation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r mip_hypothesis.revisions; receipt mip_hypothesis.reassessment_completion_receipts; b jsonb; p jsonb; checked jsonb; reason text; key text;
begin
 perform mip_hypothesis.discover_reassessment_causes_v1(p_investigation);
 select * into r from mip_hypothesis.revisions where investigation_id=p_investigation order by revision desc limit 1;
 if not found then return;end if;
 select * into receipt from mip_hypothesis.reassessment_completion_receipts where revision_id=r.id;
 if not found then return;end if;
 for b in select value from jsonb_array_elements(receipt.closure_bindings) loop
 for p in select value from jsonb_array_elements(b->'permissions') loop
  checked:=mip_identity.operation_check(p->'scope');
  reason:=case when checked->'allowed' is distinct from 'true'::jsonb then 'current_permission_denied'
   when checked->'revision' is distinct from p->'revision' or
    coalesce(checked->'admission_revision','null'::jsonb) is distinct from coalesce(p->'admission_revision','null'::jsonb)
   then 'permission_binding_changed' else null end;
  if reason is not null then
   key:='permission:'||encode(sha256(convert_to((p->'scope')::text,'UTF8')),'hex')||':'||coalesce(checked->>'revision','missing')||':'||reason;
   insert into mip_hypothesis.reassessment_causes(investigation_id,revision_id,cause_key,kind,detail)
   values(p_investigation,r.id,key,'permission_changed',jsonb_build_object('input_position',b->>'input_position',
    'bound_workspace_version',b->>'workspace_version_id','operation',p->>'operation','domain',p->>'domain',
    'accepted_permission_revision',p->'revision','observed_permission_revision',checked->'revision','reason',reason))
   on conflict(revision_id,cause_key) do nothing;
  end if;
 end loop;end loop;
end $$;
create function mip_hypothesis.completion_permission_change_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare scope jsonb; iid uuid;
begin
 for scope in select distinct v from (values
  (case when tg_op<>'INSERT' then old.scope end),(case when tg_op<>'DELETE' then new.scope end)) changed(v) where v is not null loop
  for iid in select distinct r.investigation_id from mip_hypothesis.revisions r
   join mip_hypothesis.reassessment_completion_receipts c on c.revision_id=r.id
   where not exists(select 1 from mip_hypothesis.revisions n where n.investigation_id=r.investigation_id and n.revision>r.revision)
    and exists(select 1 from jsonb_array_elements(c.closure_bindings) b
      cross join lateral jsonb_array_elements(b->'permissions') p where p->'scope'=scope)
  loop perform mip_hypothesis.discover_reassessment_causes(iid);end loop;
 end loop;
 return null;
end $$;
-- A restored permission cannot reveal an old completed payload as if a fresh assessment occurred.
alter function mip_hypothesis.read_bound_history(uuid,uuid) rename to read_bound_history_v1;
revoke execute on function mip_hypothesis.read_bound_history_v1(uuid,uuid) from mip_hypothesis_gateway;
create function mip_hypothesis.read_bound_history(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; entries jsonb:='[]'; e jsonb; receipt mip_hypothesis.reassessment_completion_receipts;
 b mip_hypothesis.acceptance_bindings; current_bindings jsonb; allowed boolean;
begin
 result:=mip_hypothesis.read_bound_history_v1(p_user,p_investigation);
 for e in select value from jsonb_array_elements(result->'entries') loop
  select * into receipt from mip_hypothesis.reassessment_completion_receipts where revision_id=(e->>'revision_id')::uuid;
  if found and e->>'status'='available' then
   select * into strict b from mip_hypothesis.acceptance_bindings where revision_id=receipt.revision_id;
   allowed:=true;
   begin
    current_bindings:=mip_hypothesis.validate_reassessment_closure(p_user,p_investigation,b.workspace_version_id,b.source_project,receipt.cause_ids);
    allowed:=current_bindings=receipt.closure_bindings;
   exception when insufficient_privilege or invalid_parameter_value or no_data_found then allowed:=false;
   end;
   if not allowed then e:=(e-'assessment'-'current_context'-'reassessment_pending')||
     jsonb_build_object('status','withheld','reason','permission_binding_changed_fresh_review_required');end if;
  end if;
  entries:=entries||jsonb_build_array(e);
 end loop;
 return result||jsonb_build_object('entries',entries);
end $$;

revoke all on all functions in schema mip_hypothesis from public;
revoke all on mip_hypothesis.reassessment_completion_receipts,mip_hypothesis.reassessment_resolutions from public;
grant execute on function mip_hypothesis.append_bound_revision(uuid,uuid,uuid,text,uuid,uuid,jsonb),
 mip_hypothesis.complete_reassessment(uuid,uuid,uuid,text,uuid,uuid,jsonb),
 mip_hypothesis.reassessment_backlog(uuid,uuid),mip_hypothesis.read_bound_history(uuid,uuid) to mip_hypothesis_gateway;
reset role;

create trigger hypothesis_completion_permission after insert or update or delete on mip_identity.operation_evidence_heads
 for each row execute function mip_hypothesis.completion_permission_change_trigger();
