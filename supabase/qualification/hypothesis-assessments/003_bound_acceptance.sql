-- Atomic isolated acceptance over the retained-observation reader and existing permission fence.
grant select,update on mip_cutover_authority.publication_fence to mip_hypothesis_owner;
create policy hypothesis_fence_owner on mip_cutover_authority.publication_fence to mip_hypothesis_owner using(true) with check(true);
grant select on evidence_pipeline.investigations,evidence_pipeline.change_subjects to mip_hypothesis_owner;
create policy hypothesis_head_reader on evidence_pipeline.investigations for select to mip_hypothesis_owner using(true);
grant references on evidence_pipeline.investigation_versions,evidence_pipeline.investigation_observations to mip_hypothesis_owner;
grant usage on schema mip_cutover_authority to mip_hypothesis_owner;
-- change_subjects is SECURITY INVOKER. Its owner receives only the columns it actually reads.
grant select(position,capture_id,record_version_id) on evidence_pipeline.evidence_changes to mip_hypothesis_owner;
grant select(id,article_id) on evidence_pipeline.article_captures to mip_hypothesis_owner;
grant select(id,record_kind,record_key) on evidence_pipeline.record_versions to mip_hypothesis_owner;
create policy hypothesis_change_reader on evidence_pipeline.evidence_changes for select to mip_hypothesis_owner using(true);
create policy hypothesis_capture_identity_reader on evidence_pipeline.article_captures for select to mip_hypothesis_owner using(true);
create policy hypothesis_record_identity_reader on evidence_pipeline.record_versions for select to mip_hypothesis_owner using(true);
set role mip_hypothesis_owner;
create table mip_hypothesis.acceptance_bindings(
 revision_id uuid primary key references mip_hypothesis.revisions(id),
 workspace_version_id uuid not null references evidence_pipeline.investigation_versions(id),
 observation_id uuid not null references evidence_pipeline.investigation_observations(id),
 source_project text not null,
 metadata jsonb not null,
 recorded_at timestamptz not null default clock_timestamp()
);
alter table mip_hypothesis.acceptance_bindings enable row level security;
alter table mip_hypothesis.acceptance_bindings force row level security;
create policy owner_only on mip_hypothesis.acceptance_bindings to mip_hypothesis_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_hypothesis.acceptance_bindings
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.acceptance_bindings
 for each statement execute function mip_hypothesis.reject_mutation();

create function mip_hypothesis.source_change_fence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for update;
 return null;
end $$;
create function mip_hypothesis.context_current(p_investigation uuid,p_version uuid,p_observation uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from evidence_pipeline.investigations where id=p_investigation and current_version_id=p_version)
 and not exists(
  select 1 from evidence_pipeline.investigation_observations o
  cross join lateral jsonb_array_elements_text(o.snapshot->'watch_keys') k
  join evidence_pipeline.change_subjects s on s.watch_key=k.value
  where o.id=p_observation and not exists(
   select 1 from jsonb_array_elements(o.snapshot->'inputs') i where i->>'position'=s.position::text
  )
 )
$$;
create function mip_hypothesis.append_bound_revision(p_user uuid,p_investigation uuid,p_version uuid,p_source_project text,
 p_request uuid,p_predecessor uuid,p_assessment jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b jsonb; e jsonb; i jsonb; rec jsonb; kind text; span jsonb; passage jsonb; checked jsonb;
 operation text; domain text; permissions jsonb; bindings jsonb:='[]'; result jsonb;
 prior mip_hypothesis.revisions; receipt mip_hypothesis.acceptance_bindings; observation uuid; current_context boolean;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 if p_source_project is null or btrim(p_source_project)='' or p_source_project='cc-definition-batch-v1' then raise exception using errcode='42501',message='hypothesis source scope unavailable';end if;
 -- Source/head changes and permission revocation all serialize against this same pre-existing fence.
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 b:=mip_hypothesis.observation_binding(p_user,p_investigation,p_version);
 if b->>'access_role'<>'reviewer' then raise exception using errcode='42501',message='hypothesis append denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 observation:=(b->'observation'->>'id')::uuid;
 select * into prior from mip_hypothesis.revisions where investigation_id=p_investigation and request_id=p_request;
 if found then
  select * into receipt from mip_hypothesis.acceptance_bindings where revision_id=prior.id;
  if not found or receipt.workspace_version_id<>p_version or receipt.source_project<>p_source_project then
   raise exception using errcode='23505',message='bound hypothesis retry conflict';end if;
 end if;
 current_context:=mip_hypothesis.context_current(p_investigation,p_version,observation);
 if prior.id is null and not current_context then raise exception using errcode='40001',message='hypothesis context changed; reassessment required';end if;
 if p_assessment->>'question' is distinct from b->'version'->'state'->>'question' then
  raise exception using errcode='22023',message='hypothesis question binding mismatch';end if;
 if p_assessment->'comparison'->>'state'='better_supported' and exists(
  select 1 from jsonb_array_elements_text(p_assessment->'comparison'->'favored_ids') favored
  where not exists(select 1 from jsonb_array_elements(p_assessment->'arguments') a
   where a->>'hypothesis_id'=favored.value and a->>'relation'='supports' and jsonb_array_length(a->'evidence_ids')>0)
 ) then raise exception using errcode='22023',message='favored hypothesis requires a supporting argument';end if;
 for e in select value from jsonb_array_elements(p_assessment->'evidence') loop
  if (select count(*) from jsonb_array_elements(b->'observation'->'snapshot'->'inputs') x where x->>'position'=e->>'input_position')<>1 then
   raise exception using errcode='22023',message='hypothesis input binding mismatch';end if;
  select value into strict i from jsonb_array_elements(b->'observation'->'snapshot'->'inputs') where value->>'position'=e->>'input_position';
  kind:=case when i ? 'capture' then 'capture' else 'record_version' end;rec:=i->kind;span:=e->'source_span';
  if rec->>'id' is distinct from e->>'material_version' or
   (e->>'acquired_at')::timestamptz is distinct from (coalesce(rec->>'captured_at',rec->>'recorded_at'))::timestamptz or
   coalesce(e->'published_at','null'::jsonb) is distinct from coalesce(rec->'payload'->'published_at','null'::jsonb) or
   coalesce(e->'event_time','null'::jsonb) is distinct from coalesce(rec->'payload'->'event_time','null'::jsonb) then
   raise exception using errcode='22023',message='hypothesis version or time binding mismatch';end if;
  passage:=mip_hypothesis.retained_excerpt(p_user,p_investigation,p_version,e->>'input_position',p_source_project,
   span->>'source_field',(span->>'start')::integer,(span->>'end')::integer,span->>'excerpt_sha256');
  permissions:='[]';
  foreach operation in array array['retention','analysis','excerpt_display'] loop
  foreach domain in array array['rights','privacy'] loop
   checked:=mip_hypothesis.operation_permission(p_user,p_investigation,p_version,e->>'input_position',p_source_project,operation,domain);
   if checked->'allowed' is distinct from 'true'::jsonb then raise exception using errcode='42501',message='hypothesis operation denied';end if;
   permissions:=permissions||jsonb_build_array(jsonb_build_object('operation',operation,'domain',domain,
    'revision',checked->'revision','admission_revision',checked->'admission_revision','synthetic',checked->'synthetic'));
  end loop;end loop;
  -- No new source-text copy in the binding receipt.
  bindings:=bindings||jsonb_build_array((passage-'excerpt')||jsonb_build_object('evidence_id',e->>'id','permissions',permissions));
 end loop;
 result:=mip_hypothesis.append_revision(p_user,p_investigation,p_request,p_predecessor,p_assessment);
 if prior.id is null then
  insert into mip_hypothesis.acceptance_bindings(revision_id,workspace_version_id,observation_id,source_project,metadata)
   values((result->>'id')::uuid,p_version,observation,p_source_project,bindings);
 else
  current_context:=current_context and receipt.metadata=bindings;
 end if;
 return jsonb_build_object('assessment',result,'workspace_version_id',p_version,'observation_id',observation,
  'current_context',current_context,'reassessment_pending',not current_context,'publication_allowed',false);
end $$;
revoke all on all functions in schema mip_hypothesis from public;
revoke all on mip_hypothesis.acceptance_bindings from public;
revoke execute on function mip_hypothesis.append_revision(uuid,uuid,uuid,uuid,jsonb) from mip_hypothesis_gateway;
grant execute on function mip_hypothesis.append_bound_revision(uuid,uuid,uuid,text,uuid,uuid,jsonb) to mip_hypothesis_gateway;
reset role;
create trigger hypothesis_change_fence before insert or update or delete or truncate on evidence_pipeline.evidence_changes
 for each statement execute function mip_hypothesis.source_change_fence();
create trigger hypothesis_workspace_fence before update or delete on evidence_pipeline.investigations
 for each statement execute function mip_hypothesis.source_change_fence();
