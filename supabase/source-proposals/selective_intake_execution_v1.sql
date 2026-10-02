-- UNAPPLIED SOURCE PROPOSAL. Extends the existing private intake/observation/receipt owners.
-- Installation creates NO accepted criteria, enabled source grant, public eligibility or scheduled producer.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table evidence_pipeline.selective_criteria_versions (
  criteria_key text not null, criteria_version text not null, policy_version text not null,
  acceptance_ref text not null check(length(btrim(acceptance_ref)) between 1 and 2000),
  rules jsonb not null,
  primary key(criteria_key,criteria_version),
  check(length(btrim(criteria_key)) between 1 and 120 and length(btrim(criteria_version)) between 1 and 120),
  check(length(btrim(policy_version)) between 1 and 120),
  check(jsonb_typeof(rules)='object' and rules ?& array['contract_version','analyze_signals','low_value_domains','religion_shared_scope']
    and rules - array['contract_version','analyze_signals','low_value_domains','religion_shared_scope']='{}'::jsonb
    and rules->>'contract_version'='selective-metadata-rules-1'),
  check(jsonb_typeof(rules->'analyze_signals')='array' and jsonb_typeof(rules->'low_value_domains')='array'),
  check(rules->'analyze_signals' @> '["explicit_scope","correction","new_relevant_input"]'::jsonb),
  check(rules->'analyze_signals' <@ '["explicit_scope","primary_document","public_safety","institutional_accountability","economy","correction","new_relevant_input"]'::jsonb),
  check(rules->'low_value_domains' <@ '["sports","entertainment"]'::jsonb),
  check(rules->'religion_shared_scope'='true'::jsonb)
);
comment on table evidence_pipeline.selective_criteria_versions is
  'Administrator-registered immutable accepted criteria. Empty at install. No numeric threshold or factual source admission is inferred from a registry row.';

create table evidence_pipeline.selective_source_authorizations (
  authorization_id uuid primary key, investigation_id uuid not null,
  actor_id uuid not null, criteria_key text not null, criteria_version text not null,
  source_url text not null check(source_url ~ '^https://[^/]+/' and length(source_url)<=2048),
  format text not null check(format='mip_article_json_v1'),
  rights_ref text not null check(length(btrim(rights_ref)) between 1 and 2000),
  acquire_allowed boolean not null default false, retain_allowed boolean not null default false,
  analyze_allowed boolean not null default false, enabled boolean not null default false,
  expires_at timestamptz not null, max_bytes integer not null check(max_bytes between 1 and 240000),
  max_requests integer not null check(max_requests between 1 and 100),
  incremental_cost_usd numeric not null default 0 check(incremental_cost_usd=0),
  foreign key(investigation_id,actor_id) references evidence_pipeline.investigation_memberships(investigation_id,user_id),
  foreign key(criteria_key,criteria_version) references evidence_pipeline.selective_criteria_versions(criteria_key,criteria_version)
);
comment on table evidence_pipeline.selective_source_authorizations is
  'Exact endpoint, assigned actor, operation rights, expiry and zero-cost bounded authorization. Empty/default disabled; source discovery and public metadata do not authorize acquisition.';
create table evidence_pipeline.selective_authorization_revocations (
  authorization_id uuid primary key references evidence_pipeline.selective_source_authorizations(authorization_id),
  revocation_ref text not null check(length(btrim(revocation_ref)) between 1 and 2000),
  revoked_at timestamptz not null default clock_timestamp()
);

create table evidence_pipeline.selective_discovery_receipts (
  selection_id uuid primary key, ordinal bigint generated always as identity unique,
  investigation_id uuid not null, actor_id uuid not null, version_id uuid not null,
  authorization_id uuid not null references evidence_pipeline.selective_source_authorizations(authorization_id),
  previous_selection_id uuid references evidence_pipeline.selective_discovery_receipts(selection_id),
  criteria_key text not null, criteria_version text not null, policy_version text not null,
  metadata jsonb not null check(octet_length(metadata::text)<=16384),
  disposition text not null check(disposition in ('analyze_now','retain_deferred','skip_for_now')),
  reason text not null, fingerprint text not null, recorded_at timestamptz not null default clock_timestamp(),
  foreign key(investigation_id,version_id) references evidence_pipeline.investigation_versions(investigation_id,id),
  foreign key(investigation_id,actor_id) references evidence_pipeline.investigation_memberships(investigation_id,user_id),
  foreign key(criteria_key,criteria_version) references evidence_pipeline.selective_criteria_versions(criteria_key,criteria_version)
);
create index selective_discovery_head on evidence_pipeline.selective_discovery_receipts(investigation_id,(metadata->>'url'),ordinal desc);
create table evidence_pipeline.selective_fetch_permits (
  permit_id uuid primary key, selection_id uuid not null unique references evidence_pipeline.selective_discovery_receipts(selection_id),
  authorization_id uuid not null references evidence_pipeline.selective_source_authorizations(authorization_id),
  issued_at timestamptz not null default clock_timestamp(), valid_until timestamptz not null
);
create table evidence_pipeline.selective_execution_receipts (
  execution_id uuid primary key, ordinal bigint generated always as identity unique,
  selection_id uuid not null references evidence_pipeline.selective_discovery_receipts(selection_id),
  previous_execution_id uuid unique references evidence_pipeline.selective_execution_receipts(execution_id),
  declaration_receipt_id uuid not null unique references evidence_pipeline.investigation_selective_intake_receipts(receipt_id),
  reconsideration_receipt_id uuid unique references evidence_pipeline.investigation_selective_intake_receipts(receipt_id),
  assessment_id uuid not null references evidence_pipeline.assessments(id),
  disposition text not null check(disposition in ('analyze_now','retain_deferred','skip_for_now')),
  recorded_at timestamptz not null default clock_timestamp()
);

create function evidence_pipeline.selective_metadata_decision(rules jsonb, metadata jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
begin
  perform evidence_pipeline.workspace_keys(metadata,array['url','domain_declarations','signals']);
  if jsonb_typeof(metadata->'domain_declarations') is distinct from 'array' or jsonb_array_length(metadata->'domain_declarations') not between 1 and 20
    or jsonb_typeof(metadata->'signals') is distinct from 'array' or jsonb_array_length(metadata->'signals')>20
    or exists(select 1 from jsonb_array_elements(metadata->'signals') s where jsonb_typeof(s)<>'string'
      or s #>> '{}' not in ('explicit_scope','primary_document','public_safety','institutional_accountability','economy','correction','new_relevant_input'))
    or exists(select 1 from jsonb_array_elements(metadata->'domain_declarations') d where jsonb_typeof(d)<>'object'
      or not d ?& array['domain_ref','classification_ref'] or (select count(*) from jsonb_object_keys(d))<>2
      or jsonb_typeof(d->'domain_ref') is distinct from 'string' or jsonb_typeof(d->'classification_ref') is distinct from 'string'
      or d->>'domain_ref'<>btrim(d->>'domain_ref') or d->>'classification_ref'<>btrim(d->>'classification_ref')
      or length(btrim(coalesce(d->>'domain_ref',''))) not between 1 and 200
      or length(btrim(coalesce(d->>'classification_ref',''))) not between 1 and 2000)
    or (select count(*) from jsonb_array_elements(metadata->'domain_declarations'))<>(select count(distinct d->>'domain_ref') from jsonb_array_elements(metadata->'domain_declarations') d)
    or (select count(*) from jsonb_array_elements(metadata->'signals'))<>(select count(distinct s) from jsonb_array_elements(metadata->'signals') s) then
    raise exception using errcode='22023',message='invalid registered selection metadata'; end if;
  -- Signals are explicit discovery/classification provenance, not semantic proof.
  if exists(select 1 from jsonb_array_elements_text(metadata->'signals') s where rules->'analyze_signals' ? s) then
    return jsonb_build_object('disposition','analyze_now','reason','registered_priority_signal');
  elsif exists(select 1 from jsonb_array_elements(metadata->'domain_declarations') d where d->>'domain_ref' in ('religion','religious_institution')) then
    return jsonb_build_object('disposition','retain_deferred','reason','religion_shared_scope_requires_context');
  elsif not exists(select 1 from jsonb_array_elements(metadata->'domain_declarations') d where not (rules->'low_value_domains' ? (d->>'domain_ref'))) then
    return jsonb_build_object('disposition','skip_for_now','reason','routine_low_value_metadata');
  else return jsonb_build_object('disposition','retain_deferred','reason','insufficient_selection_context'); end if;
end $$;

create function public.mip_selective_execution_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare iid uuid; uid uuid; vid uuid; sid uuid; expected uuid; rid uuid; fp text; head uuid;
  member evidence_pipeline.investigation_memberships; authz evidence_pipeline.selective_source_authorizations;
  criteria evidence_pipeline.selective_criteria_versions; sel evidence_pipeline.selective_discovery_receipts;
  permit evidence_pipeline.selective_fetch_permits; execution evidence_pipeline.selective_execution_receipts;
  prior_execution evidence_pipeline.selective_execution_receipts; post evidence_pipeline.investigation_selective_intake_receipts;
  reconsideration evidence_pipeline.investigation_selective_intake_receipts; a evidence_pipeline.assessments;
  decision jsonb; doc jsonb; metadata jsonb; annotated jsonb; input jsonb; job evidence_pipeline.import_jobs;
  job_id uuid; token uuid; cap evidence_pipeline.article_captures;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>147456 then
    raise exception using errcode='22023',message='invalid selective execution input'; end if;
  if p_action='select' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','version_id','selection_id','previous_selection_id','authorization_id','metadata']);
  elsif p_action='permit' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id','permit_id']);
  elsif p_action='read' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id']);
  elsif p_action='capture' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id','permit_id','article']);
  elsif p_action='annotate' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id','execution_id','previous_execution_id','assessment_id','annotation'],array['reconsideration_receipt_id']);
  elsif p_action='reconsider' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','selection_id','previous_execution_id','annotation']);
  else raise exception using errcode='22023',message='unsupported selective execution action';end if;
  iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');
  sid:=evidence_pipeline.workspace_uuid(p_input->'selection_id');
  perform pg_advisory_xact_lock(hashtextextended('mip-workspace:'||iid::text,0));
  select * into member from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid for update;
  if not found or member.access_role='revoked' or (p_action<>'read' and member.access_role<>'reviewer') then
    raise exception using errcode='42501',message='selective execution access denied';end if;
  if p_action='select' then
    fp:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
    select * into sel from evidence_pipeline.selective_discovery_receipts where selection_id=sid;
    if found then
      if sel.investigation_id<>iid or sel.actor_id<>uid or sel.fingerprint<>fp then raise exception using errcode='23505',message='selection identity conflict';end if;
      return (to_jsonb(sel)-'fingerprint')||jsonb_build_object('ordinal',sel.ordinal::text,'replayed',true,'publicly_eligible',false);end if;
    vid:=evidence_pipeline.workspace_uuid(p_input->'version_id');
    if not exists(select 1 from evidence_pipeline.investigations where id=iid and current_version_id=vid) then
      raise exception using errcode='40001',message='selection workspace head changed';end if;
    select * into authz from evidence_pipeline.selective_source_authorizations where authorization_id=evidence_pipeline.workspace_uuid(p_input->'authorization_id') for update;
    if not found or authz.investigation_id<>iid or authz.actor_id<>uid then raise exception using errcode='42501',message='source authorization unavailable';end if;
    metadata:=p_input->'metadata';
    if metadata->>'url' is distinct from authz.source_url then raise exception using errcode='42501',message='endpoint outside authorization';end if;
    select * into criteria from evidence_pipeline.selective_criteria_versions where criteria_key=authz.criteria_key and criteria_version=authz.criteria_version;
    decision:=evidence_pipeline.selective_metadata_decision(criteria.rules,metadata);
    select r.selection_id into head from evidence_pipeline.selective_discovery_receipts r where r.investigation_id=iid and r.metadata->>'url'=authz.source_url order by r.ordinal desc limit 1;
    expected:=(p_input->>'previous_selection_id')::uuid;
    if head is distinct from expected then raise exception using errcode='40001',message='discovery receipt head changed';end if;
    insert into evidence_pipeline.selective_discovery_receipts(selection_id,investigation_id,actor_id,version_id,authorization_id,previous_selection_id,
      criteria_key,criteria_version,policy_version,metadata,disposition,reason,fingerprint)
      values(sid,iid,uid,vid,authz.authorization_id,expected,criteria.criteria_key,criteria.criteria_version,criteria.policy_version,metadata,
        decision->>'disposition',decision->>'reason',fp) returning * into sel;
    return (to_jsonb(sel)-'fingerprint')||jsonb_build_object('ordinal',sel.ordinal::text,'replayed',false,'publicly_eligible',false);
  end if;
  select * into sel from evidence_pipeline.selective_discovery_receipts where selection_id=sid and investigation_id=iid;
  if not found then raise exception using errcode='42501',message='selection unavailable';end if;
  select * into criteria from evidence_pipeline.selective_criteria_versions where criteria_key=sel.criteria_key and criteria_version=sel.criteria_version;
  select * into execution from evidence_pipeline.selective_execution_receipts where selection_id=sid order by ordinal desc limit 1;
  if p_action='read' then
    select * into post from evidence_pipeline.investigation_selective_intake_receipts where receipt_id=execution.declaration_receipt_id;
    return jsonb_build_object('selection',(to_jsonb(sel)-'fingerprint')||jsonb_build_object('ordinal',sel.ordinal::text),'criteria',to_jsonb(criteria),
      'execution',case when execution.execution_id is null then null else to_jsonb(execution)||jsonb_build_object('ordinal',execution.ordinal::text) end,
      'declaration',case when post.receipt_id is null then null else evidence_pipeline.selective_intake_payload(post) end,'publicly_eligible',false);
  end if;
  if sel.actor_id<>uid then raise exception using errcode='42501',message='selection producer mismatch';end if;
  if p_action='capture' then
    select * into permit from evidence_pipeline.selective_fetch_permits where selection_id=sid and permit_id=(p_input->>'permit_id')::uuid;
    if not found or sel.disposition<>'analyze_now' or p_input->'article'->>'url' is distinct from sel.metadata->>'url' then
      raise exception using errcode='42501',message='capture permit mismatch';end if;
    select * into authz from evidence_pipeline.selective_source_authorizations where authorization_id=sel.authorization_id for update;
    if not authz.enabled or not authz.retain_allowed or not authz.analyze_allowed or authz.expires_at<=clock_timestamp()
      or exists(select 1 from evidence_pipeline.selective_authorization_revocations where authorization_id=authz.authorization_id) then
      raise exception using errcode='42501',message='capture rights expired';end if;
    if not exists(select 1 from evidence_pipeline.investigations where id=iid and current_version_id=sel.version_id) then
      raise exception using errcode='40001',message='capture workspace head changed';end if;
    job_id:=evidence_pipeline.enqueue('selective:'||sid::text,p_input->'article');
    select * into job from evidence_pipeline.import_jobs where id=job_id for update;
    if job.state='completed' then
      select c.* into cap from evidence_pipeline.article_captures c where c.job_id=job.id;
      return jsonb_build_object('job_id',job.id,'article_id',cap.article_id,'capture_id',cap.id,'outcome',job.outcome,'payload',cap.payload,'replayed',true);end if;
    if permit.valid_until<=clock_timestamp() or job.state not in ('pending','retry_wait') or job.available_at>clock_timestamp() or job.attempt_count>=5 then
      raise exception using errcode='40001',message='capture delivery or native lease unavailable';end if;
    -- Targeted acquisition uses the SAME native import job/lease/events and finish owner.
    -- It never claims unrelated queued jobs and creates no second evidence queue.
    token:=gen_random_uuid();
    update evidence_pipeline.import_jobs set state='processing',attempt_count=attempt_count+1,lease_token=token,
      lease_expires_at=clock_timestamp()+interval '2 minutes',error_code=null where id=job.id returning * into job;
    insert into evidence_pipeline.job_events(job_id,attempt,state) values(job.id,job.attempt_count,job.state);
    doc:=evidence_pipeline.finish_job(job.id,token);
    select c.* into cap from evidence_pipeline.article_captures c where c.id=(doc->>'capture_id')::uuid;
    return doc||jsonb_build_object('payload',cap.payload);
  end if;
  if p_action='permit' then
    select * into authz from evidence_pipeline.selective_source_authorizations where authorization_id=sel.authorization_id for update;
    select r.selection_id into head from evidence_pipeline.selective_discovery_receipts r where r.investigation_id=iid and r.metadata->>'url'=authz.source_url order by r.ordinal desc limit 1;
    if head is distinct from sid or not exists(select 1 from evidence_pipeline.investigations where id=iid and current_version_id=sel.version_id) then
      raise exception using errcode='40001',message='pre-fetch selection stale';end if;
    if sel.disposition<>'analyze_now' or not authz.enabled or not authz.acquire_allowed or not authz.retain_allowed or not authz.analyze_allowed or authz.expires_at<=clock_timestamp()
      or exists(select 1 from evidence_pipeline.selective_authorization_revocations where authorization_id=authz.authorization_id) then
      raise exception using errcode='42501',message='source acquisition denied';end if;
    if exists(select 1 from evidence_pipeline.selective_fetch_permits where selection_id=sid) then
      raise exception using errcode='40001',message='permit already consumed; inspect durable state';end if;
    if (select count(*) from evidence_pipeline.selective_fetch_permits where authorization_id=authz.authorization_id)>=authz.max_requests then
      raise exception using errcode='42501',message='source request quota exhausted';end if;
    rid:=evidence_pipeline.workspace_uuid(p_input->'permit_id');
    insert into evidence_pipeline.selective_fetch_permits(permit_id,selection_id,authorization_id,valid_until)
      values(rid,sid,authz.authorization_id,least(authz.expires_at,clock_timestamp()+interval '30 seconds')) returning * into permit;
    return to_jsonb(permit)||jsonb_build_object('url',authz.source_url,'max_bytes',authz.max_bytes,'format',authz.format,'publicly_eligible',false);
  end if;
  expected:=(p_input->>'previous_execution_id')::uuid;
  if p_action='annotate' then
    rid:=evidence_pipeline.workspace_uuid(p_input->'execution_id');
    select * into prior_execution from evidence_pipeline.selective_execution_receipts where execution_id=rid;
    if found then
      -- Delegate exact request replay validation to the canonical annotation owner.
      annotated:=public.mip_investigation_selective_intake_v1('declare',p_input->'annotation');
      if prior_execution.selection_id<>sid or prior_execution.previous_execution_id is distinct from expected
        or prior_execution.declaration_receipt_id<> (annotated->>'receipt_id')::uuid
        or prior_execution.assessment_id<> (p_input->>'assessment_id')::uuid
        or prior_execution.reconsideration_receipt_id is distinct from (p_input->>'reconsideration_receipt_id')::uuid then
        raise exception using errcode='23505',message='registered execution identity conflict';end if;
      return to_jsonb(prior_execution)||jsonb_build_object('ordinal',prior_execution.ordinal::text,'replayed',true,'publicly_eligible',false);end if;
  end if;
  if execution.execution_id is distinct from expected then raise exception using errcode='40001',message='registered execution head changed';end if;
  select * into authz from evidence_pipeline.selective_source_authorizations where authorization_id=sel.authorization_id for update;
  if not authz.enabled or not authz.retain_allowed or not authz.analyze_allowed or authz.expires_at<=clock_timestamp()
    or exists(select 1 from evidence_pipeline.selective_authorization_revocations where authorization_id=authz.authorization_id) then
    raise exception using errcode='42501',message='registered analysis authorization unavailable';end if;
  input:=p_input->'annotation';
  if input->>'user_id' is distinct from uid::text or input->>'investigation_id' is distinct from iid::text then
    raise exception using errcode='42501',message='annotation owner mismatch';end if;
  if p_action='reconsider' then
    if execution.execution_id is null or input->>'declaration_receipt_id' is distinct from execution.declaration_receipt_id::text then
      raise exception using errcode='40001',message='registered declaration changed';end if;
    annotated:=public.mip_investigation_selective_intake_v1('reconsider',input);
    metadata:=jsonb_set(sel.metadata,'{signals}',jsonb_build_array(case when annotated->'result'->'trigger'->>'kind'='dependency_change' then 'correction' else 'new_relevant_input' end));
    decision:=evidence_pipeline.selective_metadata_decision(criteria.rules,metadata);
    return jsonb_build_object('receipt',annotated,'decision',decision,'publicly_eligible',false);
  end if;
  if execution.execution_id is null then
    if not exists(select 1 from evidence_pipeline.selective_fetch_permits where selection_id=sid) then
      raise exception using errcode='42501',message='source execution has no permit';end if;
    decision:=jsonb_build_object('disposition',sel.disposition);
  else
    select * into reconsideration from evidence_pipeline.investigation_selective_intake_receipts where receipt_id=(p_input->>'reconsideration_receipt_id')::uuid;
    if not found or reconsideration.investigation_id<>iid or reconsideration.actor_id<>uid or reconsideration.declaration_receipt_id<>execution.declaration_receipt_id
      or input->>'previous_receipt_id' is distinct from reconsideration.receipt_id::text then
      raise exception using errcode='40001',message='registered reconsideration binding changed';end if;
    metadata:=jsonb_set(sel.metadata,'{signals}',jsonb_build_array(case when reconsideration.result->'trigger'->>'kind'='dependency_change' then 'correction' else 'new_relevant_input' end));
    decision:=evidence_pipeline.selective_metadata_decision(criteria.rules,metadata);
  end if;
  doc:=input->'result';
  if doc->>'method_key' is distinct from criteria.criteria_key or doc->>'method_version' is distinct from criteria.criteria_version
    or doc->>'policy_version' is distinct from criteria.policy_version or doc->>'disposition' is distinct from decision->>'disposition'
    or doc->'domain_declarations' is distinct from sel.metadata->'domain_declarations' then
    raise exception using errcode='22023',message='annotation does not execute registered criteria';end if;
  select * into a from evidence_pipeline.assessments where id=(p_input->>'assessment_id')::uuid;
  if not found or a.candidate_id<>(doc->>'candidate_id')::uuid or a.algorithm_key<>'selective-exact-span-baseline'
    or a.algorithm_version<>'1' or a.outcome<>'insufficient_evidence'
    or not exists(select 1 from evidence_pipeline.article_captures c join evidence_pipeline.import_receipts r on r.job_id=c.job_id
      where c.id=(doc->>'capture_id')::uuid and c.payload->>'url'=sel.metadata->>'url' and r.run_id='selective:'||sid::text) then
    raise exception using errcode='22023',message='registered analysis/capture binding mismatch';end if;
  if not exists(select 1 from jsonb_array_elements(doc->'reconsideration_triggers') t where t->>'kind'='dependency_change' and t->>'assessment_id'=a.id::text) then
    raise exception using errcode='22023',message='registered analysis dependency missing';end if;
  annotated:=public.mip_investigation_selective_intake_v1('declare',input);
  insert into evidence_pipeline.selective_execution_receipts(execution_id,selection_id,previous_execution_id,declaration_receipt_id,reconsideration_receipt_id,assessment_id,disposition)
    values(rid,sid,expected,(annotated->>'receipt_id')::uuid,reconsideration.receipt_id,a.id,decision->>'disposition') returning * into execution;
  return to_jsonb(execution)||jsonb_build_object('ordinal',execution.ordinal::text,'replayed',false,'publicly_eligible',false);
end $$;

do $$ declare t text; begin
  foreach t in array array['selective_criteria_versions','selective_source_authorizations','selective_authorization_revocations','selective_discovery_receipts','selective_fetch_permits','selective_execution_receipts'] loop
    execute format('alter table evidence_pipeline.%I enable row level security',t);
    execute format('revoke all on evidence_pipeline.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on evidence_pipeline.%I to service_role',t);
    execute format('create trigger no_rewrite before update or delete on evidence_pipeline.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);
    execute format('create trigger no_truncate before truncate on evidence_pipeline.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
  end loop;
end $$;
grant insert on evidence_pipeline.selective_discovery_receipts,evidence_pipeline.selective_fetch_permits,evidence_pipeline.selective_execution_receipts to service_role;
-- Row locks require UPDATE privilege; no column can actually be updated through these grants.
grant update(authorization_id) on evidence_pipeline.selective_source_authorizations to service_role;
grant usage,select on sequence evidence_pipeline.selective_discovery_receipts_ordinal_seq,evidence_pipeline.selective_execution_receipts_ordinal_seq to service_role;
revoke all on function evidence_pipeline.selective_metadata_decision(jsonb,jsonb),public.mip_selective_execution_v1(text,jsonb) from public,anon,authenticated;
grant execute on function evidence_pipeline.selective_metadata_decision(jsonb,jsonb),public.mip_selective_execution_v1(text,jsonb) to service_role;
commit;
