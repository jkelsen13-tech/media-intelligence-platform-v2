-- Isolated composer reads over retained observations. No source fetch, inference, policy approval or deployment.
set role mip_hypothesis_owner;
create function mip_hypothesis.authoring_context(p_user uuid,p_investigation uuid,p_version uuid,p_source_project text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare binding jsonb; history jsonb; backlog jsonb; v evidence_pipeline.investigation_versions;
 o evidence_pipeline.investigation_observations; i jsonb; rec jsonb; kind text; fields jsonb; materials jsonb:='[]'; meta jsonb; head jsonb; permission_state text;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 if p_source_project is null or btrim(p_source_project)='' or p_source_project='cc-definition-batch-v1' then
  raise exception using errcode='42501',message='hypothesis source scope unavailable';end if;
 binding:=mip_hypothesis.observation_binding(p_user,p_investigation,p_version);
 if binding->>'access_role' is distinct from 'reviewer' then raise exception using errcode='42501',message='hypothesis authoring denied';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-question:'||p_investigation::text,0));
 select * into strict v from evidence_pipeline.investigation_versions where id=p_version and investigation_id=p_investigation;
 select * into strict o from evidence_pipeline.investigation_observations where id=v.observation_id;
 if not mip_hypothesis.context_current(p_investigation,p_version,o.id) then
  raise exception using errcode='40001',message='current retained authoring observation required';end if;
 history:=mip_hypothesis.read_bound_history(p_user,p_investigation);
 backlog:=mip_hypothesis.reassessment_backlog(p_user,p_investigation);
 -- Do not return old rationale here or treat an open form as review/reconciliation.
 select value-'assessment' into head from jsonb_array_elements(history->'entries') e order by (e->>'revision')::integer desc limit 1;
 for i in select value from jsonb_array_elements(o.snapshot->'inputs') loop
  kind:=case when i->'capture' is not null and i->'capture'<>'null'::jsonb then 'capture' else 'record_version' end;rec:=i->kind;
  select value into strict meta from jsonb_array_elements(binding->'observation'->'snapshot'->'inputs') x where x->>'position'=i->>'position';
  permission_state:='checked_current';
  begin
   perform mip_hypothesis.require_observed_operations(p_user,p_investigation,p_version,p_source_project,i->>'position');
  exception when insufficient_privilege then permission_state:='blocked';
  end;
  fields:='[]'::jsonb;
  if permission_state='checked_current' then
  select coalesce(jsonb_agg(jsonb_build_object('name',f,'length',char_length(rec->'payload'->>f)) order by f),'[]'::jsonb)
   into fields from unnest(array['title','summary','body_text']) f where jsonb_typeof(rec->'payload'->f)='string';
  end if;
  materials:=materials||jsonb_build_array(jsonb_build_object('input_position',i->>'position','material_version',rec->>'id',
   'material_hash',meta->kind->>'source_version_hash','acquired_at',coalesce(meta->kind->>'captured_at',meta->kind->>'recorded_at'),
   'published_at',meta->kind->'payload'->'published_at','event_time',meta->kind->'payload'->'event_time',
   'fields',fields,'permission_state',permission_state));
 end loop;
 return jsonb_build_object('contract_version','mip_hypothesis_authoring_v1','investigation_id',p_investigation,
  'workspace_version_id',p_version,'observation_id',o.id,'question',v.state->>'question','access_role','reviewer',
  'head',head,'materials',materials,'backlog',backlog,'knowledge_cutoff',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'recording_method','human-argument-entry-v1','model_version','none','estimation_methods',jsonb_build_array(),
  'publication_allowed',false,'review_state','unreviewed','historical_commit_visibility_qualified',false);
end $$;

create function mip_hypothesis.authoring_span(p_user uuid,p_investigation uuid,p_version uuid,p_source_project text,
 p_position text,p_field text,p_start integer,p_end integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare binding jsonb; v evidence_pipeline.investigation_versions; o evidence_pipeline.investigation_observations;
 i jsonb; rec jsonb; kind text; meta jsonb; raw text; passage text; digest text; result jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 if not found then raise exception using errcode='55000',message='hypothesis fence unavailable';end if;
 binding:=mip_hypothesis.observation_binding(p_user,p_investigation,p_version);
 if binding->>'access_role' is distinct from 'reviewer' then raise exception using errcode='42501',message='hypothesis authoring denied';end if;
 if p_field is null or p_field not in('title','summary','body_text') or p_start is null or p_end is null
  or p_start<0 or p_end<=p_start or p_end::bigint-p_start::bigint>2000 then
  raise exception using errcode='22023',message='invalid bounded authoring span';end if;
 -- The 2000-code-point response limit is a transport bound, never a rights grant or semantic sample minimum.
 perform mip_hypothesis.require_observed_operations(p_user,p_investigation,p_version,p_source_project,p_position);
 select * into strict v from evidence_pipeline.investigation_versions where id=p_version and investigation_id=p_investigation;
 select * into strict o from evidence_pipeline.investigation_observations where id=v.observation_id;
 if not mip_hypothesis.context_current(p_investigation,p_version,o.id) then
  raise exception using errcode='40001',message='current retained authoring observation required';end if;
 select value into strict i from jsonb_array_elements(o.snapshot->'inputs') x where x->>'position'=p_position;
 select value into strict meta from jsonb_array_elements(binding->'observation'->'snapshot'->'inputs') x where x->>'position'=p_position;
 kind:=case when i->'capture' is not null and i->'capture'<>'null'::jsonb then 'capture' else 'record_version' end;rec:=i->kind;
 raw:=rec->'payload'->>p_field;
 if raw is null or p_end>char_length(raw) then raise exception using errcode='22023',message='retained span out of bounds';end if;
 passage:=substring(raw from p_start+1 for p_end-p_start);
 digest:=encode(sha256(convert_to(passage,'UTF8')),'hex');
 result:=mip_hypothesis.retained_excerpt(p_user,p_investigation,p_version,p_position,p_source_project,p_field,p_start,p_end,digest);
 return result||jsonb_build_object('contract_version','mip_hypothesis_authoring_span_v1','investigation_id',p_investigation,
  'workspace_version_id',p_version,'observation_id',o.id,'excerpt_sha256',digest,'publication_allowed',false,
  'acquired_at',coalesce(meta->kind->>'captured_at',meta->kind->>'recorded_at'),
  'published_at',meta->kind->'payload'->'published_at','event_time',meta->kind->'payload'->'event_time');
end $$;
revoke all on all functions in schema mip_hypothesis from public;
grant execute on function mip_hypothesis.authoring_context(uuid,uuid,uuid,text),
 mip_hypothesis.authoring_span(uuid,uuid,uuid,text,text,text,integer,integer) to mip_hypothesis_gateway;
reset role;
