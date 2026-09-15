-- Isolated adapter over existing retained workspace observations; no new permission registry.
grant select on evidence_pipeline.investigation_versions,evidence_pipeline.investigation_observations to mip_hypothesis_owner;
create policy hypothesis_version_reader on evidence_pipeline.investigation_versions for select to mip_hypothesis_owner using(true);
create policy hypothesis_observation_reader on evidence_pipeline.investigation_observations for select to mip_hypothesis_owner using(true);
grant usage on schema mip_identity to mip_hypothesis_owner;
grant execute on function mip_identity.operation_check(jsonb) to mip_hypothesis_owner;
set role mip_hypothesis_owner;
create function mip_hypothesis.observation_binding(p_user uuid,p_investigation uuid,p_version uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare access text; v evidence_pipeline.investigation_versions; o evidence_pipeline.investigation_observations;
 inputs jsonb:='[]'; i jsonb; rec jsonb; meta jsonb; kind text;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception using errcode='25001',message='hypothesis requires read committed';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||p_investigation::text||':'||p_user::text,0));
 select access_role into access from evidence_pipeline.investigation_memberships where investigation_id=p_investigation and user_id=p_user;
 if access is null or access not in ('viewer','reviewer') then raise exception using errcode='42501',message='hypothesis read denied';end if;
 select * into v from evidence_pipeline.investigation_versions where id=p_version and investigation_id=p_investigation;
 if not found then raise exception using errcode='42501',message='hypothesis version denied';end if;
 select * into strict o from evidence_pipeline.investigation_observations where id=v.observation_id;
 for i in select value from jsonb_array_elements(o.snapshot->'inputs') loop
  if (i->'capture' is null or i->'capture'='null'::jsonb)=(i->'record_version' is null or i->'record_version'='null'::jsonb) then
   raise exception using errcode='22023',message='ambiguous retained input';end if;
  kind:=case when i->'capture' is not null and i->'capture'<>'null'::jsonb then 'capture' else 'record_version' end;
  rec:=i->kind;
  meta:=(rec-'payload')||jsonb_build_object(
   'source_version_hash',encode(sha256(convert_to(rec::text,'UTF8')),'hex'),
   'payload',jsonb_strip_nulls(jsonb_build_object('published_at',rec->'payload'->'published_at','event_time',rec->'payload'->'event_time')));
  -- Only identity/time fields plus a native digest leave the DB before permission checks.
  inputs:=inputs||jsonb_build_array(jsonb_build_object('position',i->>'position',kind,
   jsonb_build_object('id',meta->>'id','captured_at',case when kind='capture' then to_char((rec->>'captured_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,'recorded_at',case when kind='record_version' then to_char((rec->>'recorded_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
    'source_version_hash',meta->>'source_version_hash','payload',meta->'payload')));
 end loop;
 return jsonb_build_object('investigation_id',p_investigation,'access_role',access,
  'version',jsonb_build_object('id',v.id,'observation_id',o.id,'state',jsonb_build_object('question',v.state->>'question')),
  'observation',jsonb_build_object('id',o.id,'snapshot',jsonb_build_object('contract_version','investigation-observation-1','publicly_eligible',false,'inputs',inputs)));
end $$;
create function mip_hypothesis.operation_permission(p_user uuid,p_investigation uuid,p_version uuid,p_position text,
 p_source_project text,p_operation text,p_domain text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare binding jsonb; i jsonb; rec jsonb; kind text; scope jsonb;
begin
 binding:=mip_hypothesis.observation_binding(p_user,p_investigation,p_version);
 if p_source_project is null or btrim(p_source_project)='' or p_source_project='cc-definition-batch-v1' then
  raise exception using errcode='42501',message='hypothesis source scope unavailable';end if;
 if p_operation is null or p_operation not in('retention','analysis','excerpt_display') or p_domain is null or p_domain not in('rights','privacy') then
  raise exception using errcode='42501',message='hypothesis operation denied';end if;
 if (select count(*) from jsonb_array_elements(binding->'observation'->'snapshot'->'inputs') x where x->>'position'=p_position)<>1 then
  raise exception using errcode='22023',message='retained identity missing or ambiguous';end if;
 select value into strict i from jsonb_array_elements(binding->'observation'->'snapshot'->'inputs') where value->>'position'=p_position;
 kind:=case when i ? 'capture' then 'capture' else 'record_version' end;rec:=i->kind;
 scope:=jsonb_build_object('source_project',p_source_project,'material_ref',kind||':'||(rec->>'id'),
  'material_version',rec->>'source_version_hash','source_version',rec->>'id',
  'audience','isolated_internal_review','operation',p_operation,'domain',p_domain);
 return mip_identity.operation_check(scope);
end $$;
create function mip_hypothesis.retained_excerpt(p_user uuid,p_investigation uuid,p_version uuid,p_position text,
 p_source_project text,p_field text,p_start integer,p_end integer,p_expected_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare binding jsonb; v evidence_pipeline.investigation_versions; o evidence_pipeline.investigation_observations;
 i jsonb; rec jsonb; kind text; digest text; scope jsonb; result jsonb; operation text; domain text; raw text; passage text;
begin
 -- Auth/membership is independently rechecked at the sensitive content read.
 binding:=mip_hypothesis.observation_binding(p_user,p_investigation,p_version);
 if p_source_project is null or btrim(p_source_project)='' or p_source_project='cc-definition-batch-v1' then
  raise exception using errcode='42501',message='hypothesis source scope unavailable';end if;
 if p_field is null or p_field not in('title','summary','body_text') or p_start is null or p_end is null or p_start<0 or p_end<=p_start
 or p_expected_hash is null or p_expected_hash !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='invalid retained span';end if;
 select * into strict v from evidence_pipeline.investigation_versions where id=p_version and investigation_id=p_investigation;
 select * into strict o from evidence_pipeline.investigation_observations where id=v.observation_id;
 if (select count(*) from jsonb_array_elements(o.snapshot->'inputs') x where x->>'position'=p_position)<>1 then
  raise exception using errcode='22023',message='retained identity missing or ambiguous';end if;
 select value into strict i from jsonb_array_elements(o.snapshot->'inputs') where value->>'position'=p_position;
 kind:=case when i->'capture' is not null and i->'capture'<>'null'::jsonb then 'capture' else 'record_version' end;
 rec:=i->kind;digest:=encode(sha256(convert_to(rec::text,'UTF8')),'hex');
 foreach operation in array array['retention','analysis','excerpt_display'] loop
 foreach domain in array array['rights','privacy'] loop
  scope:=jsonb_build_object('source_project',p_source_project,'material_ref',kind||':'||(rec->>'id'),
   'material_version',digest,'source_version',rec->>'id','audience','isolated_internal_review','operation',operation,'domain',domain);
  result:=mip_identity.operation_check(scope);
  if result->'allowed' is distinct from 'true'::jsonb or (
   (result->'synthetic'='true'::jsonb and result->>'reason'='synthetic_mechanism_only') or
   (result->'synthetic'='false'::jsonb and result->>'reason'='real_evidence_bound' and nullif(result->>'admission_revision','') is not null
    and result->>'material_hash'=digest and jsonb_typeof(result->'primary_evidence_refs')='array' and jsonb_array_length(result->'primary_evidence_refs')>0)
  ) is distinct from true then
   raise exception using errcode='42501',message='hypothesis operation denied';end if;
 end loop;end loop;
 -- operation_check holds its existing permission/revocation fence through transaction end.
 raw:=rec->'payload'->>p_field;
 if raw is null or p_end>char_length(raw) then raise exception using errcode='22023',message='retained span out of bounds';end if;
 passage:=substring(raw from p_start+1 for p_end-p_start);
 if encode(sha256(convert_to(passage,'UTF8')),'hex')<>p_expected_hash then
  raise exception using errcode='22023',message='retained span hash mismatch';end if;
 return jsonb_build_object('excerpt',passage,'material_hash',digest,'material_version',rec->>'id',
  'input_position',p_position,'source_field',p_field,'start',p_start,'end',p_end);
end $$;
revoke all on function mip_hypothesis.operation_permission(uuid,uuid,uuid,text,text,text,text),mip_hypothesis.observation_binding(uuid,uuid,uuid),
 mip_hypothesis.retained_excerpt(uuid,uuid,uuid,text,text,text,integer,integer,text) from public;
grant execute on function mip_hypothesis.operation_permission(uuid,uuid,uuid,text,text,text,text),mip_hypothesis.observation_binding(uuid,uuid,uuid),
 mip_hypothesis.retained_excerpt(uuid,uuid,uuid,text,text,text,integer,integer,text) to mip_hypothesis_gateway;
reset role;
