-- Isolated permission-checked historical delivery. No public route or historical-time claim.
set role mip_hypothesis_owner;
create function mip_hypothesis.read_bound_history(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access text; r mip_hypothesis.revisions; b mip_hypothesis.acceptance_bindings; item jsonb;
 e jsonb; permission jsonb; check_result jsonb; passage jsonb; allowed boolean; reason text; current_context boolean;
 result jsonb:='[]';
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||p_investigation::text||':'||p_user::text,0));
 select access_role into access from evidence_pipeline.investigation_memberships where investigation_id=p_investigation and user_id=p_user;
 if access is null or access not in('viewer','reviewer') then raise exception using errcode='42501',message='hypothesis read denied';end if;
 for r in select * from mip_hypothesis.revisions where investigation_id=p_investigation order by revision loop
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
  current_context:=mip_hypothesis.context_current(p_investigation,b.workspace_version_id,b.observation_id);
  result:=result||jsonb_build_array(item||jsonb_build_object('status','available','assessment',r.assessment,
   'workspace_version_id',b.workspace_version_id,'observation_id',b.observation_id,
   'current_context',current_context,'reassessment_pending',not current_context));
 end loop;
 return jsonb_build_object('contract_version','mip_hypothesis_history_v1','investigation_id',p_investigation,
  'entries',result,'temporal_scope','retained_versions_only','historical_commit_visibility_qualified',false,'publication_allowed',false);
end $$;
revoke all on function mip_hypothesis.read_bound_history(uuid,uuid) from public;
revoke execute on function mip_hypothesis.read_history(uuid,uuid) from mip_hypothesis_gateway;
grant execute on function mip_hypothesis.read_bound_history(uuid,uuid) to mip_hypothesis_gateway;
reset role;
