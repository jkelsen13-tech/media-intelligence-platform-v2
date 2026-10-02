-- NONDEPLOYED: append-only reviewer annotations on the existing assigned investigation owner.
-- No source acquisition, automatic selection, analysis dispatch, policy registry or publication.
-- Registered criteria/execution is an additive sibling proposal, selective_intake_execution_v1.sql.
-- The immutable inner result below remains the historical declaration contract;
-- registry/actual analysis linkage belongs to that sibling's outer execution receipt.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table evidence_pipeline.investigation_selective_intake_receipts (
  receipt_id uuid primary key,
  ordinal bigint generated always as identity unique,
  investigation_id uuid not null,
  candidate_id uuid not null references evidence_pipeline.evidence_candidates(id),
  capture_id uuid not null references evidence_pipeline.article_captures(id),
  input_position bigint not null references evidence_pipeline.evidence_changes(position),
  observation_id uuid not null references evidence_pipeline.investigation_observations(id),
  version_id uuid not null,
  actor_id uuid not null,
  previous_receipt_id uuid,
  declaration_receipt_id uuid,
  kind text not null check(kind in ('declare','reconsider')),
  disposition text not null check(disposition in ('analyze_now','retain_deferred','skip_for_now')),
  request_fingerprint text not null,
  result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=131072),
  recorded_at timestamptz not null default clock_timestamp(),
  unique(investigation_id,candidate_id,receipt_id),
  foreign key(investigation_id,actor_id) references evidence_pipeline.investigation_memberships(investigation_id,user_id),
  foreign key(investigation_id,version_id) references evidence_pipeline.investigation_versions(investigation_id,id),
  foreign key(investigation_id,candidate_id,previous_receipt_id) references evidence_pipeline.investigation_selective_intake_receipts(investigation_id,candidate_id,receipt_id),
  foreign key(investigation_id,candidate_id,declaration_receipt_id) references evidence_pipeline.investigation_selective_intake_receipts(investigation_id,candidate_id,receipt_id),
  check((kind='declare' and declaration_receipt_id is null) or (kind='reconsider' and declaration_receipt_id is not null))
);
create index investigation_selective_intake_history on evidence_pipeline.investigation_selective_intake_receipts(investigation_id,candidate_id,ordinal desc);
comment on table evidence_pipeline.investigation_selective_intake_receipts is
  'Authenticated reviewer self-assertions over exact native versions. Selection criteria/method/policy provenance, not registered policy, source rights, analysis execution or publication authority.';

create function evidence_pipeline.selective_intake_payload(p evidence_pipeline.investigation_selective_intake_receipts) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select (to_jsonb(p)-'request_fingerprint')||jsonb_build_object('ordinal',p.ordinal::text,'input_position',p.input_position::text,
    'contract_version','private-investigation-selective-intake-1','scope','assigned_investigation',
    'retention','durable_private_receipt','persisted',true,'actor_binding','assigned_reviewer_trusted_gateway_input',
    'publicly_eligible',false,'rights_admission','not_established','analysis_execution','none')
$$;
create function evidence_pipeline.selective_intake_subject(p jsonb) returns text
language sql immutable security invoker set search_path='' as $$
  select case when p->'capture'<>'null'::jsonb then 'article:'||(p->'capture'->>'article_id')
    else (p->'record_version'->>'record_kind')||':'||(p->'record_version'->>'record_key') end
$$;

create function public.mip_investigation_selective_intake_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare iid uuid; uid uuid; cid uuid; rid uuid; vid uuid; oid uuid; cap uuid; pos bigint; expected uuid; declared uuid; fp text;
  member evidence_pipeline.investigation_memberships; v evidence_pipeline.investigation_versions;
  obs evidence_pipeline.investigation_observations; before_obs evidence_pipeline.investigation_observations;
  prior evidence_pipeline.investigation_selective_intake_receipts; base evidence_pipeline.investigation_selective_intake_receipts;
  current_receipt evidence_pipeline.investigation_selective_intake_receipts; stored evidence_pipeline.investigation_selective_intake_receipts;
  d jsonb; candidate jsonb; input jsonb; t jsonb; a jsonb; before_a jsonb; dep jsonb; changed jsonb;
  page_limit integer; after_ordinal bigint; items jsonb; more boolean;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>147456 then
    raise exception using errcode='22023',message='invalid selective intake request'; end if;
  if p_action='read' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','candidate_id'],array['after_receipt_id','limit']);
  elsif p_action='receipt' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','receipt_id']);
  elsif p_action in ('declare','reconsider') then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','version_id','receipt_id','previous_receipt_id','result'],
      case when p_action='reconsider' then array['declaration_receipt_id'] else '{}'::text[] end);
  else raise exception using errcode='22023',message='unsupported selective intake action'; end if;
  iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');
  -- Same owner lock as native workspace versions. Membership lock covers concurrent revocation.
  perform pg_advisory_xact_lock(hashtextextended('mip-workspace:'||iid::text,0));
  select * into member from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid for update;
  if not found or member.access_role='revoked' or (p_action in ('declare','reconsider') and member.access_role<>'reviewer') then
    raise exception using errcode='42501',message='selective intake access denied'; end if;
  if p_action='receipt' then
    rid:=evidence_pipeline.workspace_uuid(p_input->'receipt_id');
    select * into stored from evidence_pipeline.investigation_selective_intake_receipts where investigation_id=iid and receipt_id=rid;
    if not found then raise exception using errcode='42501',message='selective intake receipt unavailable';end if;
    return evidence_pipeline.selective_intake_payload(stored);
  end if;
  if p_action='read' then
    cid:=evidence_pipeline.workspace_uuid(p_input->'candidate_id');page_limit:=coalesce((p_input->>'limit')::integer,20);
    if page_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid selective intake limit';end if;
    if p_input ? 'after_receipt_id' and p_input->'after_receipt_id'<>'null'::jsonb then
      rid:=evidence_pipeline.workspace_uuid(p_input->'after_receipt_id');
      select ordinal into after_ordinal from evidence_pipeline.investigation_selective_intake_receipts where investigation_id=iid and candidate_id=cid and receipt_id=rid;
      if not found then raise exception using errcode='22023',message='invalid selective intake cursor';end if;
    end if;
    select coalesce(jsonb_agg(x.doc order by x.ordinal),'[]') into items from (
      select r.ordinal,evidence_pipeline.selective_intake_payload(r) doc from evidence_pipeline.investigation_selective_intake_receipts r
      where r.investigation_id=iid and r.candidate_id=cid and (after_ordinal is null or r.ordinal>after_ordinal)
      order by r.ordinal limit page_limit+1) x;
    more:=jsonb_array_length(items)>page_limit;if more then items:=items-page_limit;end if;
    return jsonb_build_object('contract_version','private-investigation-selective-intake-1','scope','assigned_investigation',
      'investigation_id',iid,'candidate_id',cid,'receipts',items,'has_more',more,
      'next_after_receipt_id',case when more then items->(page_limit-1)->>'receipt_id' else null end,'publicly_eligible',false);
  end if;
  rid:=evidence_pipeline.workspace_uuid(p_input->'receipt_id');vid:=evidence_pipeline.workspace_uuid(p_input->'version_id');
  if p_input->'previous_receipt_id'<>'null'::jsonb then expected:=evidence_pipeline.workspace_uuid(p_input->'previous_receipt_id');end if;
  fp:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  select * into prior from evidence_pipeline.investigation_selective_intake_receipts where receipt_id=rid;
  if found then
    if prior.investigation_id<>iid or prior.actor_id<>uid or prior.kind<>p_action or prior.request_fingerprint<>fp then
      raise exception using errcode='23505',message='selective intake receipt identity conflict';end if;
    return evidence_pipeline.selective_intake_payload(prior)||jsonb_build_object('replayed',true);
  end if;
  select x.* into v from evidence_pipeline.investigations i join evidence_pipeline.investigation_versions x on x.id=i.current_version_id
    where i.id=iid and x.id=vid;
  if not found then raise exception using errcode='40001',message='selective intake workspace head changed';end if;
  select * into obs from evidence_pipeline.investigation_observations where id=v.observation_id;
  d:=p_input->'result';
  if d->'publicly_eligible' is distinct from 'false'::jsonb or d->>'rights_admission' is distinct from 'not_established'
    or d->'persisted' is distinct from 'false'::jsonb or d->>'execution' is distinct from 'none' or d->>'provenance' is distinct from 'caller_self_assertion' then
    raise exception using errcode='22023',message='selective intake authority escalation rejected';end if;
  cid:=evidence_pipeline.workspace_uuid(d->'candidate_id');
  if not cid=any(obs.scope_candidate_ids) then raise exception using errcode='22023',message='candidate outside explicit scope';end if;
  select * into current_receipt from evidence_pipeline.investigation_selective_intake_receipts where investigation_id=iid and candidate_id=cid order by ordinal desc limit 1;
  if current_receipt.receipt_id is distinct from expected then raise exception using errcode='40001',message='selective intake receipt baseline changed';end if;
  if p_action='declare' then
    perform evidence_pipeline.workspace_keys(d,array['contract_version','observation_id','observation_sha256','candidate_id','capture_id','content_hash','input_position','extractor_version',
      'disposition','method_key','method_version','policy_version','selection_ref','rationale','domain_declarations','reconsideration_triggers',
      'provenance','rights_admission','publicly_eligible','persisted','execution','declaration_sha256']);
    if d->>'contract_version' is distinct from 'selective-intake-declaration-1' or evidence_pipeline.workspace_uuid(d->'observation_id')<>obs.id then
      raise exception using errcode='22023',message='selective intake observation mismatch';end if;
    cap:=evidence_pipeline.workspace_uuid(d->'capture_id');
    if jsonb_typeof(d->'input_position') is distinct from 'string' or d->>'input_position' !~ '^[1-9][0-9]{0,18}$' then
      raise exception using errcode='22023',message='invalid selective intake position';end if;
    pos:=(d->>'input_position')::bigint;
    select x into candidate from jsonb_array_elements(obs.snapshot->'candidates') x where x->>'id'=cid::text;
    select x into input from jsonb_array_elements(obs.snapshot->'inputs') x where x->>'position'=pos::text;
    if candidate is null or input is null or candidate->>'capture_id' is distinct from cap::text or input->'capture'->>'id' is distinct from cap::text
      or input->'capture'->>'content_hash' is distinct from d->>'content_hash' or candidate->>'extractor_version' is distinct from d->>'extractor_version'
      or not exists(select 1 from evidence_pipeline.evidence_changes where position=pos and capture_id=cap) then
      raise exception using errcode='22023',message='selective intake immutable input mismatch';end if;
    perform evidence_pipeline.workspace_choice(d->'disposition',array['analyze_now','retain_deferred','skip_for_now']);
    foreach t in array array[d->'method_key',d->'method_version',d->'policy_version',d->'selection_ref',d->'rationale'] loop
      perform evidence_pipeline.workspace_text(t);end loop;
    if jsonb_typeof(d->'reconsideration_triggers') is distinct from 'array' or jsonb_array_length(d->'reconsideration_triggers') not between 1 and 50 then
      raise exception using errcode='22023',message='explicit selective intake triggers required';end if;
    for t in select value from jsonb_array_elements(d->'reconsideration_triggers') loop
      if t->>'kind'='dependency_change' then
        select x into a from jsonb_array_elements(obs.snapshot->'assessments') x where x->>'id'=t->>'assessment_id' and x->>'candidate_id'=cid::text;
        if a is null or a->'stale' is distinct from 'false'::jsonb or not (a->'context_positions') ? (t->>'dependency_position')
          or not exists(select 1 from jsonb_array_elements(obs.snapshot->'inputs') x where x->>'position'=t->>'dependency_position') then
          raise exception using errcode='22023',message='undeclared or stale selective intake dependency';end if;
      elsif t->>'kind'='new_relevant_input' then
        if not exists(select 1 from jsonb_array_elements(coalesce(obs.snapshot->'relevance_declarations','[]')) x where x->>'candidate_id'=cid::text
          and x->>'change_position'=t->>'change_position' and x->>'selection_ref'=t->>'selection_ref' and x->>'selection_method'=t->>'selection_method') then
          raise exception using errcode='22023',message='undeclared selective intake relevance';end if;
      else raise exception using errcode='22023',message='unsupported selective intake trigger';end if;
    end loop;
  else
    perform evidence_pipeline.workspace_keys(d,array['contract_version','declaration_sha256','baseline_observation_id','current_observation_id','current_observation_sha256','candidate_id',
      'disposition','status','trigger','selection_ref','rationale','provenance','rights_admission','publicly_eligible','persisted','execution']);
    declared:=evidence_pipeline.workspace_uuid(p_input->'declaration_receipt_id');
    select * into base from evidence_pipeline.investigation_selective_intake_receipts where investigation_id=iid and candidate_id=cid and receipt_id=declared and kind='declare';
    if not found or exists(select 1 from evidence_pipeline.investigation_selective_intake_receipts where investigation_id=iid and candidate_id=cid and kind='declare' and ordinal>base.ordinal) then
      raise exception using errcode='40001',message='selective intake declaration baseline changed';end if;
    select * into before_obs from evidence_pipeline.investigation_observations where id=base.observation_id;
    if d->>'contract_version' is distinct from 'selective-intake-reconsideration-1' or d->>'status' is distinct from 'needs_reconsideration'
      or d->>'declaration_sha256' is distinct from base.result->>'declaration_sha256'
      or d->>'baseline_observation_id' is distinct from before_obs.id::text or d->>'current_observation_id' is distinct from obs.id::text
      or obs.previous_observation_id is distinct from before_obs.id or obs.scope_candidate_ids<>before_obs.scope_candidate_ids
      or d->>'disposition' is distinct from base.disposition then
      raise exception using errcode='22023',message='selective intake reconsideration binding mismatch';end if;
    cap:=base.capture_id;pos:=base.input_position;t:=d->'trigger';
    if t->>'kind'='dependency_change' then
      select x into a from jsonb_array_elements(obs.snapshot->'assessments') x where x->>'id'=t->>'assessment_id' and x->>'candidate_id'=cid::text;
      select x into before_a from jsonb_array_elements(before_obs.snapshot->'assessments') x where x->>'id'=t->>'assessment_id' and x->>'candidate_id'=cid::text;
      select x into dep from jsonb_array_elements(before_obs.snapshot->'inputs') x where x->>'position'=t->>'dependency_position';
      select x into changed from jsonb_array_elements(obs.snapshot->'inputs') x where x->>'position'=t->>'change_position';
      if a is null or before_a is null or dep is null or changed is null or a->'stale' is distinct from 'true'::jsonb
        or not (before_a->'context_positions') ? (t->>'dependency_position')
        or not exists(select 1 from jsonb_array_elements(base.result->'reconsideration_triggers') x where x->>'kind'='dependency_change'
          and x->>'assessment_id'=t->>'assessment_id' and x->>'dependency_position'=t->>'dependency_position')
        or not exists(select 1 from jsonb_array_elements(a->'stale_causes') x where x->>'change_position'=t->>'change_position')
        or exists(select 1 from jsonb_array_elements(before_a->'stale_causes') x where x->>'change_position'=t->>'change_position')
        or evidence_pipeline.selective_intake_subject(dep) is distinct from evidence_pipeline.selective_intake_subject(changed) then
        raise exception using errcode='22023',message='new bound selective intake dependency cause required';end if;
    elsif t->>'kind'='new_relevant_input' then
      if not exists(select 1 from jsonb_array_elements(coalesce(obs.snapshot->'relevance_declarations','[]')) x where x->>'candidate_id'=cid::text
        and x->>'change_position'=t->>'change_position' and x->>'selection_ref'=t->>'selection_ref' and x->>'selection_method'=t->>'selection_method')
        or exists(select 1 from jsonb_array_elements(coalesce(before_obs.snapshot->'relevance_declarations','[]')) x where x->>'candidate_id'=cid::text and x->>'change_position'=t->>'change_position') then
        raise exception using errcode='22023',message='new bound selective intake relevance required';end if;
    else raise exception using errcode='22023',message='unsupported selective intake reconsideration';end if;
  end if;
  insert into evidence_pipeline.investigation_selective_intake_receipts(receipt_id,investigation_id,candidate_id,capture_id,input_position,observation_id,version_id,actor_id,
    previous_receipt_id,declaration_receipt_id,kind,disposition,request_fingerprint,result)
    values(rid,iid,cid,cap,pos,obs.id,vid,uid,expected,declared,p_action,d->>'disposition',fp,d) returning * into stored;
  return evidence_pipeline.selective_intake_payload(stored)||jsonb_build_object('replayed',false);
end $$;
alter table evidence_pipeline.investigation_selective_intake_receipts enable row level security;
revoke all on evidence_pipeline.investigation_selective_intake_receipts from public,anon,authenticated,service_role;
grant select,insert on evidence_pipeline.investigation_selective_intake_receipts to service_role;
grant usage,select on sequence evidence_pipeline.investigation_selective_intake_receipts_ordinal_seq to service_role;
create trigger no_rewrite before update or delete on evidence_pipeline.investigation_selective_intake_receipts for each row execute function evidence_pipeline.reject_history_mutation();
create trigger no_truncate before truncate on evidence_pipeline.investigation_selective_intake_receipts for each statement execute function evidence_pipeline.reject_history_mutation();
revoke all on function evidence_pipeline.selective_intake_payload(evidence_pipeline.investigation_selective_intake_receipts),evidence_pipeline.selective_intake_subject(jsonb),public.mip_investigation_selective_intake_v1(text,jsonb) from public,anon,authenticated;
grant execute on function evidence_pipeline.selective_intake_payload(evidence_pipeline.investigation_selective_intake_receipts),evidence_pipeline.selective_intake_subject(jsonb),public.mip_investigation_selective_intake_v1(text,jsonb) to service_role;
commit;
