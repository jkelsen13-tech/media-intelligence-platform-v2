-- Isolated reassessment cause ledger over existing retained changes and permission heads.
-- No semantic assessment, worker, schedule, policy approval, source copy or live migration.
grant references on evidence_pipeline.evidence_changes to mip_hypothesis_owner;
set role mip_hypothesis_owner;
create table mip_hypothesis.reassessment_causes(
 id uuid primary key default gen_random_uuid(),
 investigation_id uuid not null,
 revision_id uuid not null references mip_hypothesis.revisions(id),
 cause_key text not null,
 kind text not null check(kind in('retained_source_change','retained_assessment_change','workspace_changed','permission_changed')),
 change_position bigint references evidence_pipeline.evidence_changes(position),
 related_version_id uuid,
 detail jsonb not null check(jsonb_typeof(detail)='object'),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(revision_id,cause_key),
 check((kind='retained_source_change')=(change_position is not null))
);
create index reassessment_causes_question on mip_hypothesis.reassessment_causes(investigation_id,recorded_at,id);
alter table mip_hypothesis.reassessment_causes enable row level security;
alter table mip_hypothesis.reassessment_causes force row level security;
create policy owner_only on mip_hypothesis.reassessment_causes to mip_hypothesis_owner using(true) with check(true);
create trigger immutable_rows before update or delete on mip_hypothesis.reassessment_causes
 for each row execute function mip_hypothesis.reject_mutation();
create trigger immutable_table before truncate on mip_hypothesis.reassessment_causes
 for each statement execute function mip_hypothesis.reject_mutation();

create function mip_hypothesis.discover_reassessment_causes(p_investigation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r mip_hypothesis.revisions; b mip_hypothesis.acceptance_bindings; o evidence_pipeline.investigation_observations;
 head uuid; e jsonb; p jsonb; input jsonb; kind text; scope jsonb; checked jsonb; reason text; key text;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 -- Same order as acceptance, current source/head mutation and permission revocation.
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 select * into r from mip_hypothesis.revisions where investigation_id=p_investigation order by revision desc limit 1;
 if not found then return;end if;
 select * into b from mip_hypothesis.acceptance_bindings where revision_id=r.id;
 if not found then return;end if; -- Historical unbound primitives remain unavailable through the bound reader.
 select * into strict o from evidence_pipeline.investigation_observations where id=b.observation_id;
 -- Anti-membership, never a sequence/time watermark: old missed positions remain discoverable.
 insert into mip_hypothesis.reassessment_causes(investigation_id,revision_id,cause_key,kind,change_position,detail)
 select distinct p_investigation,r.id,'source:'||s.position::text,'retained_source_change',s.position,
  jsonb_build_object('observation_id',o.id,'input_change_position',s.position::text,'classification','requires_retained_evidence_review')
 from jsonb_array_elements_text(o.snapshot->'watch_keys') k
 join evidence_pipeline.change_subjects s on s.watch_key=k.value
 where not exists(select 1 from jsonb_array_elements(o.snapshot->'inputs') i where i->>'position'=s.position::text)
 on conflict(revision_id,cause_key) do nothing;
 insert into mip_hypothesis.reassessment_causes(investigation_id,revision_id,cause_key,kind,related_version_id,detail)
 select distinct p_investigation,r.id,'assessment:'||a.id::text,'retained_assessment_change',a.id,
  jsonb_build_object('observation_id',o.id,'retained_candidate_id',a.candidate_id,'assessment_version_id',a.id,
   'classification','requires_method_and_reasoning_review')
 from jsonb_array_elements(o.snapshot->'assessments') saved
 join evidence_pipeline.assessments a on a.candidate_id=(saved->>'candidate_id')::uuid
 where not exists(select 1 from jsonb_array_elements(o.snapshot->'assessments') retained where retained->>'id'=a.id::text)
 on conflict(revision_id,cause_key) do nothing;
 select current_version_id into head from evidence_pipeline.investigations where id=p_investigation;
 if head is distinct from b.workspace_version_id then
  insert into mip_hypothesis.reassessment_causes(investigation_id,revision_id,cause_key,kind,related_version_id,detail)
  values(p_investigation,r.id,'workspace:'||coalesce(head::text,'missing'),'workspace_changed',head,
   jsonb_build_object('accepted_workspace_version',b.workspace_version_id,'observed_workspace_version',head))
  on conflict(revision_id,cause_key) do nothing;
 end if;
 for e in select value from jsonb_array_elements(b.metadata) loop
  select value into strict input from jsonb_array_elements(o.snapshot->'inputs') i where i->>'position'=e->>'input_position';
  kind:=case when input->'capture' is not null and input->'capture'<>'null'::jsonb then 'capture' else 'record_version' end;
  for p in select value from jsonb_array_elements(e->'permissions') loop
   scope:=jsonb_build_object('source_project',b.source_project,'material_ref',kind||':'||(e->>'material_version'),
    'material_version',e->>'material_hash','source_version',e->>'material_version','audience','isolated_internal_review',
    'operation',p->>'operation','domain',p->>'domain');
   checked:=mip_identity.operation_check(scope);
   reason:=case when checked->'allowed' is distinct from 'true'::jsonb then 'current_permission_denied'
    when checked->'revision' is distinct from p->'revision' or
      coalesce(checked->'admission_revision','null'::jsonb) is distinct from coalesce(p->'admission_revision','null'::jsonb)
    then 'permission_binding_changed' else null end;
   if reason is not null then
    key:='permission:'||encode(sha256(convert_to(scope::text,'UTF8')),'hex')||':'||
      coalesce(checked->>'revision','missing')||':'||reason;
    insert into mip_hypothesis.reassessment_causes(investigation_id,revision_id,cause_key,kind,detail)
    values(p_investigation,r.id,key,'permission_changed',jsonb_build_object(
     'input_position',e->>'input_position','operation',p->>'operation','domain',p->>'domain',
     'accepted_permission_revision',p->'revision','observed_permission_revision',checked->'revision','reason',reason))
    on conflict(revision_id,cause_key) do nothing;
   end if;
  end loop;
 end loop;
end $$;

create function mip_hypothesis.reassessment_change_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare iid uuid; scope jsonb;
begin
 if tg_table_schema='evidence_pipeline' and tg_table_name='evidence_changes' then
  for iid in
   select distinct r.investigation_id from mip_hypothesis.revisions r
   join mip_hypothesis.acceptance_bindings b on b.revision_id=r.id
   join evidence_pipeline.investigation_observations o on o.id=b.observation_id
   where not exists(select 1 from mip_hypothesis.revisions newer where newer.investigation_id=r.investigation_id and newer.revision>r.revision)
    and exists(select 1 from evidence_pipeline.change_subjects s
      where s.position=new.position and o.snapshot->'watch_keys' ? s.watch_key)
  loop perform mip_hypothesis.discover_reassessment_causes(iid);end loop;
 elsif tg_table_schema='evidence_pipeline' and tg_table_name='assessments' then
  for iid in
   select distinct r.investigation_id from mip_hypothesis.revisions r
   join mip_hypothesis.acceptance_bindings b on b.revision_id=r.id
   join evidence_pipeline.investigation_observations o on o.id=b.observation_id
   where not exists(select 1 from mip_hypothesis.revisions newer where newer.investigation_id=r.investigation_id and newer.revision>r.revision)
    and exists(select 1 from jsonb_array_elements(o.snapshot->'assessments') a where a->>'candidate_id'=new.candidate_id::text)
  loop perform mip_hypothesis.discover_reassessment_causes(iid);end loop;
 elsif tg_table_schema='evidence_pipeline' and tg_table_name='investigations' then
  if old.current_version_id is distinct from new.current_version_id then
   perform mip_hypothesis.discover_reassessment_causes(new.id);
  end if;
 elsif tg_table_schema='mip_identity' and tg_table_name='operation_evidence_heads' then
  for scope in select distinct v from (values
   (case when tg_op<>'INSERT' then old.scope end),
   (case when tg_op<>'DELETE' then new.scope end)) changed(v) where v is not null loop
  for iid in
   select distinct r.investigation_id from mip_hypothesis.revisions r
   join mip_hypothesis.acceptance_bindings b on b.revision_id=r.id
   where b.source_project=scope->>'source_project'
    and not exists(select 1 from mip_hypothesis.revisions newer where newer.investigation_id=r.investigation_id and newer.revision>r.revision)
    and exists(select 1 from jsonb_array_elements(b.metadata) e
     where e->>'material_hash'=scope->>'material_version' and e->>'material_version'=scope->>'source_version')
  loop perform mip_hypothesis.discover_reassessment_causes(iid);end loop;
  end loop;
 end if;
 return null;
end $$;

create function mip_hypothesis.reassessment_backlog(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access text; entries jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||p_investigation::text||':'||p_user::text,0));
 select access_role into access from evidence_pipeline.investigation_memberships where investigation_id=p_investigation and user_id=p_user;
 if access is null or access not in('viewer','reviewer') then raise exception using errcode='42501',message='hypothesis backlog denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('cause_id',id,'revision_id',revision_id,'kind',kind,
  'change_position',change_position::text,'related_version_id',related_version_id,'detail',detail,'recorded_at',recorded_at,
  'state','pending_explicit_reconciliation') order by recorded_at,id),'[]'::jsonb) into entries
 from mip_hypothesis.reassessment_causes where investigation_id=p_investigation;
 return jsonb_build_object('contract_version','mip_hypothesis_reassessment_backlog_v1','investigation_id',p_investigation,
  'causes',entries,'coverage','retained_causes_only','completed_reassessment',false,'publication_allowed',false);
end $$;
create function mip_hypothesis.reconcile_reassessment_causes(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access text;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||p_investigation::text||':'||p_user::text,0));
 select access_role into access from evidence_pipeline.investigation_memberships where investigation_id=p_investigation and user_id=p_user;
 if access is distinct from 'reviewer' then raise exception using errcode='42501',message='hypothesis reconciliation denied';end if;
 perform mip_hypothesis.discover_reassessment_causes(p_investigation);
 return mip_hypothesis.reassessment_backlog(p_user,p_investigation)||
  jsonb_build_object('coverage','current_head_watch_scope_at_reconciliation','completed_reassessment',false);
end $$;
revoke all on all functions in schema mip_hypothesis from public;
revoke all on mip_hypothesis.reassessment_causes from public;
grant execute on function mip_hypothesis.reassessment_backlog(uuid,uuid),
 mip_hypothesis.reconcile_reassessment_causes(uuid,uuid) to mip_hypothesis_gateway;
reset role;
create trigger hypothesis_reassessment_source after insert on evidence_pipeline.evidence_changes
 for each row execute function mip_hypothesis.reassessment_change_trigger();
create trigger hypothesis_reassessment_workspace after update on evidence_pipeline.investigations
 for each row execute function mip_hypothesis.reassessment_change_trigger();
create trigger hypothesis_reassessment_permission after insert or update or delete on mip_identity.operation_evidence_heads
 for each row execute function mip_hypothesis.reassessment_change_trigger();

create trigger hypothesis_assessment_fence before insert or update or delete or truncate on evidence_pipeline.assessments
 for each statement execute function mip_hypothesis.source_change_fence();
create trigger hypothesis_reassessment_assessment after insert on evidence_pipeline.assessments
 for each row execute function mip_hypothesis.reassessment_change_trigger();
