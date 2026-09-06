-- Shared private investigation records and assigned-user access. No publication.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table evidence_pipeline.investigations (
  id uuid primary key,
  current_version_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create table evidence_pipeline.investigation_versions (
  id uuid primary key,
  investigation_id uuid not null references evidence_pipeline.investigations(id),
  revision integer not null check(revision>0),
  predecessor_id uuid unique,
  observation_id uuid not null references evidence_pipeline.investigation_observations(id),
  state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=131072),
  change_reason text not null check(length(btrim(change_reason)) between 1 and 2000),
  recorded_at timestamptz not null default clock_timestamp(),
  unique(investigation_id,id), unique(investigation_id,revision),
  foreign key(investigation_id,predecessor_id) references evidence_pipeline.investigation_versions(investigation_id,id)
);
alter table evidence_pipeline.investigations add constraint investigation_head_same_identity
  foreign key(id,current_version_id) references evidence_pipeline.investigation_versions(investigation_id,id);
create index investigation_versions_observation on evidence_pipeline.investigation_versions(observation_id);

create table evidence_pipeline.investigation_memberships (
  investigation_id uuid not null references evidence_pipeline.investigations(id),
  user_id uuid not null references public.mip_profiles(id),
  access_role text not null check(access_role in ('viewer','reviewer','revoked')),
  current_review_id uuid,
  primary key(investigation_id,user_id)
);
create index investigation_memberships_user on evidence_pipeline.investigation_memberships(user_id,investigation_id);
create table evidence_pipeline.investigation_review_receipts (
  id uuid primary key,
  investigation_id uuid not null,
  user_id uuid not null,
  version_id uuid not null,
  previous_receipt_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(investigation_id,user_id,id),
  foreign key(investigation_id,user_id) references evidence_pipeline.investigation_memberships(investigation_id,user_id),
  foreign key(investigation_id,version_id) references evidence_pipeline.investigation_versions(investigation_id,id),
  foreign key(investigation_id,user_id,previous_receipt_id) references evidence_pipeline.investigation_review_receipts(investigation_id,user_id,id)
);
alter table evidence_pipeline.investigation_memberships add constraint investigation_review_same_member
  foreign key(investigation_id,user_id,current_review_id) references evidence_pipeline.investigation_review_receipts(investigation_id,user_id,id);
create index investigation_reviews_version on evidence_pipeline.investigation_review_receipts(version_id);
create index investigation_reviews_previous on evidence_pipeline.investigation_review_receipts(previous_receipt_id);
create table evidence_pipeline.investigation_access_events (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null,
  user_id uuid not null,
  previous_role text,
  access_role text not null check(access_role in ('viewer','reviewer','revoked')),
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key(investigation_id,user_id) references evidence_pipeline.investigation_memberships(investigation_id,user_id)
);
create index investigation_access_events_member on evidence_pipeline.investigation_access_events(investigation_id,user_id,recorded_at);

-- Shape validators never echo private supplied values in exceptions.
create function evidence_pipeline.workspace_keys(p jsonb,required text[],optional text[] default '{}') returns void
language plpgsql immutable security invoker set search_path='' as $$ begin
  if p is null or jsonb_typeof(p)<>'object' or not p ?& required
    or exists(select 1 from jsonb_object_keys(p) k where not k=any(required||optional)) then
    raise exception using errcode='22023',message='invalid workspace object fields'; end if;
end $$;
create function evidence_pipeline.workspace_text(p jsonb,max_length integer default 2000) returns void
language plpgsql immutable security invoker set search_path='' as $$ begin
  if p is null or jsonb_typeof(p)<>'string' or length(btrim(p#>>'{}')) not between 1 and max_length then
    raise exception using errcode='22023',message='invalid workspace text'; end if;
end $$;
create function evidence_pipeline.workspace_choice(p jsonb,choices text[]) returns void
language plpgsql immutable security invoker set search_path='' as $$ begin
  if p is null or jsonb_typeof(p)<>'string' or not (p#>>'{}')=any(choices) then
    raise exception using errcode='22023',message='invalid workspace enum'; end if;
end $$;
create function evidence_pipeline.workspace_array(p jsonb,max_items integer default 30) returns void
language plpgsql immutable security invoker set search_path='' as $$ begin
  if p is null or jsonb_typeof(p)<>'array' or jsonb_array_length(p)>max_items then
    raise exception using errcode='22023',message='invalid workspace array'; end if;
end $$;
create function evidence_pipeline.workspace_texts(p jsonb,max_items integer default 20) returns void
language plpgsql immutable security invoker set search_path='' as $$ declare v jsonb; begin
  perform evidence_pipeline.workspace_array(p,max_items);
  for v in select value from jsonb_array_elements(p) loop perform evidence_pipeline.workspace_text(v); end loop;
end $$;
create function evidence_pipeline.workspace_uuid(p jsonb) returns uuid
language plpgsql immutable security invoker set search_path='' as $$ begin
  if p is null or jsonb_typeof(p)<>'string' or (p#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='invalid workspace UUID'; end if;
  return (p#>>'{}')::uuid;
end $$;
create function evidence_pipeline.workspace_nullable_time(p jsonb) returns timestamptz
language plpgsql stable security invoker set search_path='' as $$ begin
  if p='null'::jsonb then return null; end if;
  if p is null or jsonb_typeof(p)<>'string' or (p#>>'{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then
    raise exception using errcode='22023',message='workspace times require explicit timezone or null'; end if;
  return (p#>>'{}')::timestamptz;
end $$;

-- Every citation binds to exact raw text retained in the named observation.
create function evidence_pipeline.workspace_evidence(p jsonb,snapshot jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare e jsonb; input jsonb; raw text; start_at integer; end_at integer; seen jsonb:='[]'; identity jsonb;
begin
  perform evidence_pipeline.workspace_array(p,32);
  for e in select value from jsonb_array_elements(p) loop
    perform evidence_pipeline.workspace_keys(e,array['position','source_field','span_start','span_end','excerpt','relation','note']);
    perform evidence_pipeline.workspace_choice(e->'source_field',array['title','summary','body_text','label']);
    perform evidence_pipeline.workspace_choice(e->'relation',array['supports','contradicts','context']);
    if jsonb_typeof(e->'position')<>'string' or e->>'position' !~ '^[1-9][0-9]{0,18}$'
      or e->>'source_field' not in ('title','summary','body_text','label')
      or e->>'relation' not in ('supports','contradicts','context')
      or jsonb_typeof(e->'span_start')<>'number' or jsonb_typeof(e->'span_end')<>'number'
      or e->>'span_start' !~ '^[0-9]{1,9}$' or e->>'span_end' !~ '^[0-9]{1,9}$' then
      raise exception using errcode='22023',message='invalid evidence reference'; end if;
    perform evidence_pipeline.workspace_text(e->'excerpt',4000); perform evidence_pipeline.workspace_text(e->'note');
    select value into input from jsonb_array_elements(snapshot->'inputs') v where v->>'position'=e->>'position';
    if input is null then raise exception using errcode='22023',message='evidence outside observation'; end if;
    if input->'capture'<>'null'::jsonb then input:=input->'capture'->'payload'; else input:=input->'record_version'->'payload'; end if;
    if jsonb_typeof(input->(e->>'source_field')) is distinct from 'string' then
      raise exception using errcode='22023',message='evidence field not retained'; end if;
    raw:=input->>(e->>'source_field'); start_at:=(e->>'span_start')::integer; end_at:=(e->>'span_end')::integer;
    if start_at<0 or end_at<=start_at or end_at>length(raw) or substring(raw from start_at+1 for end_at-start_at)<>e->>'excerpt' then
      raise exception using errcode='22023',message='evidence span mismatch'; end if;
    identity:=jsonb_build_array(e->'position',e->'source_field',start_at,end_at,e->'relation');
    if seen @> jsonb_build_array(identity) then raise exception using errcode='22023',message='duplicate evidence reference'; end if;
    seen:=seen||jsonb_build_array(identity);
  end loop;
end $$;

create function evidence_pipeline.workspace_validate_state(p jsonb,snapshot jsonb) returns void
language plpgsql stable security invoker set search_path='' as $$
declare o jsonb; s jsonb; v jsonb; ids uuid[]; stage_ids uuid[]; coverage_ids uuid[]:='{}'; id uuid; target uuid; from_at timestamptz; to_at timestamptz;
begin
  perform evidence_pipeline.workspace_keys(p,array['question','scope_note','canonical_subject','time_range','unresolved_questions','hypotheses','commitments','coverage']);
  if octet_length(p::text)>131072 then raise exception using errcode='22023',message='workspace state exceeds 128 KiB'; end if;
  perform evidence_pipeline.workspace_text(p->'question',1000); perform evidence_pipeline.workspace_text(p->'scope_note',4000);
  perform evidence_pipeline.workspace_texts(p->'unresolved_questions',30);
  perform evidence_pipeline.workspace_keys(p->'time_range',array['from','to','meaning']);
  from_at:=evidence_pipeline.workspace_nullable_time(p->'time_range'->'from');
  to_at:=evidence_pipeline.workspace_nullable_time(p->'time_range'->'to');
  if from_at>to_at then raise exception using errcode='22023',message='reversed time range'; end if;
  perform evidence_pipeline.workspace_text(p->'time_range'->'meaning');
  if p->'canonical_subject'<>'null'::jsonb then
    perform evidence_pipeline.workspace_keys(p->'canonical_subject',array['type','id']);
    target:=evidence_pipeline.workspace_uuid(p->'canonical_subject'->'id');
    perform evidence_pipeline.workspace_choice(p->'canonical_subject'->'type',array['graph_node']);
    if p->'canonical_subject'->>'type'<>'graph_node' or not exists(
      select 1 from jsonb_array_elements(snapshot->'candidates') c where c->>'event_node_id'=target::text or c->>'related_node_id'=target::text) then
      raise exception using errcode='22023',message='canonical subject is not a retained graph identity'; end if;
  end if;
  perform evidence_pipeline.workspace_array(p->'coverage',20);
  for o in select value from jsonb_array_elements(p->'coverage') loop
    perform evidence_pipeline.workspace_keys(o,array['id','label','status','source_classes','languages','regions','from','to','retained_text','search_status','searched_at','method','limitations']);
    id:=evidence_pipeline.workspace_uuid(o->'id');
    if id=any(coverage_ids) then raise exception using errcode='22023',message='duplicate coverage identity'; end if;
    coverage_ids:=array_append(coverage_ids,id);
    perform evidence_pipeline.workspace_text(o->'label'); perform evidence_pipeline.workspace_text(o->'method');
    perform evidence_pipeline.workspace_texts(o->'source_classes');perform evidence_pipeline.workspace_texts(o->'languages');
    perform evidence_pipeline.workspace_texts(o->'regions');perform evidence_pipeline.workspace_texts(o->'limitations');
    perform evidence_pipeline.workspace_choice(o->'status',array['not_assessed','limited','documented_scope']);
    perform evidence_pipeline.workspace_choice(o->'retained_text',array['full_text','summary_only','mixed','unknown']);
    perform evidence_pipeline.workspace_choice(o->'search_status',array['not_run','partial','completed_for_declared_scope']);
    if o->>'status' not in ('not_assessed','limited','documented_scope') or o->>'retained_text' not in ('full_text','summary_only','mixed','unknown')
      or o->>'search_status' not in ('not_run','partial','completed_for_declared_scope') then
      raise exception using errcode='22023',message='invalid coverage state'; end if;
    from_at:=evidence_pipeline.workspace_nullable_time(o->'from');to_at:=evidence_pipeline.workspace_nullable_time(o->'to');
    if from_at>to_at then raise exception using errcode='22023',message='reversed coverage time range'; end if;
    perform evidence_pipeline.workspace_nullable_time(o->'searched_at');
    if o->>'search_status'<>'not_run' and (o->'searched_at'='null'::jsonb or jsonb_array_length(o->'source_classes')=0
      or jsonb_array_length(o->'limitations')=0) then
      raise exception using errcode='22023',message='search claims require declared sources, time and limitations'; end if;
  end loop;
  perform evidence_pipeline.workspace_array(p->'hypotheses',20); ids:='{}';
  for o in select value from jsonb_array_elements(p->'hypotheses') loop
    perform evidence_pipeline.workspace_keys(o,array['id','statement','assessment_ids','evidence','assumptions','would_strengthen','would_weaken','remaining_uncertainty']);
    id:=evidence_pipeline.workspace_uuid(o->'id');
    if id=any(ids) then raise exception using errcode='22023',message='duplicate hypothesis identity'; end if; ids:=array_append(ids,id);
    perform evidence_pipeline.workspace_text(o->'statement',4000);perform evidence_pipeline.workspace_text(o->'remaining_uncertainty',4000);
    perform evidence_pipeline.workspace_texts(o->'assumptions');perform evidence_pipeline.workspace_texts(o->'would_strengthen');perform evidence_pipeline.workspace_texts(o->'would_weaken');
    if jsonb_array_length(o->'would_strengthen')=0 or jsonb_array_length(o->'would_weaken')=0 then
      raise exception using errcode='22023',message='hypothesis requires discriminating evidence criteria'; end if;
    perform evidence_pipeline.workspace_array(o->'assessment_ids',32);
    for v in select value from jsonb_array_elements(o->'assessment_ids') loop
      target:=evidence_pipeline.workspace_uuid(v);
      if not snapshot->'selected_assessment_ids' ? target::text then raise exception using errcode='22023',message='assessment outside selected scope'; end if;
    end loop;
    perform evidence_pipeline.workspace_evidence(o->'evidence',snapshot);
  end loop;
  perform evidence_pipeline.workspace_array(p->'commitments',20);ids:='{}';
  for o in select value from jsonb_array_elements(p->'commitments') loop
    perform evidence_pipeline.workspace_keys(o,array['id','actor','statement','scope','conditions','deadline_text','success_criterion','remaining_uncertainty','stages']);
    id:=evidence_pipeline.workspace_uuid(o->'id');
    if id=any(ids) then raise exception using errcode='22023',message='duplicate commitment identity'; end if;ids:=array_append(ids,id);
    perform evidence_pipeline.workspace_text(o->'actor');perform evidence_pipeline.workspace_text(o->'statement',4000);
    perform evidence_pipeline.workspace_text(o->'scope');perform evidence_pipeline.workspace_texts(o->'conditions');
    perform evidence_pipeline.workspace_text(o->'deadline_text');perform evidence_pipeline.workspace_text(o->'success_criterion');
    perform evidence_pipeline.workspace_text(o->'remaining_uncertainty',4000);
    perform evidence_pipeline.workspace_array(o->'stages',30);stage_ids:='{}';
    for s in select value from jsonb_array_elements(o->'stages') loop
      perform evidence_pipeline.workspace_keys(s,array['id','kind','status','depends_on','coverage_ids','evidence','note']);
      id:=evidence_pipeline.workspace_uuid(s->'id');
      if id=any(stage_ids) then raise exception using errcode='22023',message='duplicate commitment stage'; end if;
      perform evidence_pipeline.workspace_choice(s->'kind',array['commitment','prerequisite','action','implementation','outcome']);
      perform evidence_pipeline.workspace_choice(s->'status',array['unknown','reported','observed','no_followup_found','not_applicable','cancelled']);
      if s->>'kind' not in ('commitment','prerequisite','action','implementation','outcome')
        or s->>'status' not in ('unknown','reported','observed','no_followup_found','not_applicable','cancelled') then
        raise exception using errcode='22023',message='invalid commitment stage'; end if;
      perform evidence_pipeline.workspace_text(s->'note');perform evidence_pipeline.workspace_array(s->'depends_on',30);
      for v in select value from jsonb_array_elements(s->'depends_on') loop
        if not evidence_pipeline.workspace_uuid(v)=any(stage_ids) then
          raise exception using errcode='22023',message='stage dependencies must precede stage; cycles and missing stages rejected'; end if;
      end loop;
      stage_ids:=array_append(stage_ids,id);
      perform evidence_pipeline.workspace_array(s->'coverage_ids',20);
      for v in select value from jsonb_array_elements(s->'coverage_ids') loop
        if not evidence_pipeline.workspace_uuid(v)=any(coverage_ids) then raise exception using errcode='22023',message='unknown coverage reference'; end if;
      end loop;
      perform evidence_pipeline.workspace_evidence(s->'evidence',snapshot);
      if s->>'status' in ('reported','observed','cancelled') and jsonb_array_length(s->'evidence')=0 then
        raise exception using errcode='22023',message='stage status requires retained evidence'; end if;
      if s->>'status'='no_followup_found' and not exists(select 1 from jsonb_array_elements(p->'coverage') c
        where s->'coverage_ids' ? (c->>'id') and c->>'search_status'='completed_for_declared_scope') then
        raise exception using errcode='22023',message='no-followup observation requires completed bounded search'; end if;
    end loop;
  end loop;
end $$;

create function evidence_pipeline.workspace_definition_diff(p_before jsonb,p_after jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='{}'; section text; added jsonb; removed jsonb; changed jsonb;
begin
  if p_before is null then return null; end if;
  foreach section in array array['hypotheses','commitments','coverage'] loop
    select coalesce(jsonb_agg(a->'id' order by a->>'id'),'[]') into added from jsonb_array_elements(p_after->section) a
      where not exists(select 1 from jsonb_array_elements(p_before->section)b where b->'id'=a->'id');
    select coalesce(jsonb_agg(b->'id' order by b->>'id'),'[]') into removed from jsonb_array_elements(p_before->section) b
      where not exists(select 1 from jsonb_array_elements(p_after->section)a where a->'id'=b->'id');
    select coalesce(jsonb_agg(a->'id' order by a->>'id'),'[]') into changed from jsonb_array_elements(p_after->section) a
      join jsonb_array_elements(p_before->section) b on a->'id'=b->'id' where a<>b;
    result:=result||jsonb_build_object(section,jsonb_build_object('added',added,'removed',removed,'updated',changed));
  end loop;
  return result||jsonb_build_object('question_changed',p_before->'question'<>p_after->'question',
    'scope_changed',p_before->'scope_note'<>p_after->'scope_note' or p_before->'canonical_subject'<>p_after->'canonical_subject' or p_before->'time_range'<>p_after->'time_range',
    'unresolved_questions_changed',p_before->'unresolved_questions'<>p_after->'unresolved_questions');
end $$;

-- The Edge Function supplies a verified Auth user UUID. This function is never
-- executable by the browser roles; membership is enforced again in the DB.
create function evidence_pipeline.workspace_read(p_user uuid,p_investigation uuid,p_version uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare member evidence_pipeline.investigation_memberships; head uuid; v evidence_pipeline.investigation_versions;
  prior evidence_pipeline.investigation_versions; receipt evidence_pipeline.investigation_review_receipts;
  obs evidence_pipeline.investigation_observations; baseline evidence_pipeline.investigation_observations;
  mode text; delta jsonb;
begin
  select * into member from evidence_pipeline.investigation_memberships where investigation_id=p_investigation and user_id=p_user and access_role<>'revoked';
  if not found then raise exception using errcode='42501',message='investigation access denied'; end if;
  select current_version_id into head from evidence_pipeline.investigations where id=p_investigation;
  select * into v from evidence_pipeline.investigation_versions where investigation_id=p_investigation and id=coalesce(p_version,head);
  if not found then raise exception using errcode='42501',message='investigation access denied'; end if;
  select * into obs from evidence_pipeline.investigation_observations where id=v.observation_id;
  if member.current_review_id is not null then
    select * into receipt from evidence_pipeline.investigation_review_receipts where id=member.current_review_id;
    select * into prior from evidence_pipeline.investigation_versions where id=receipt.version_id;
    select * into baseline from evidence_pipeline.investigation_observations where id=prior.observation_id;
  end if;
  if receipt.id is null then mode:='not_reviewed';
  elsif v.revision<prior.revision then mode:='historical_before_review';
  elsif baseline.scope_candidate_ids<>obs.scope_candidate_ids then mode:='scope_changed';
  else mode:='comparable';delta:=evidence_pipeline.diff_investigation_snapshots(baseline.snapshot,obs.snapshot);end if;
  return jsonb_build_object('contract_version','investigation-workspace-1','investigation_id',p_investigation,'head_version_id',head,
    'access_role',member.access_role,'version',to_jsonb(v),'observation',to_jsonb(obs),
    'review',case when receipt.id is null then null else to_jsonb(receipt)-'user_id' end,
    'comparison',jsonb_build_object('mode',mode,'before_version_id',prior.id,'before_observation_id',baseline.id,
      'after_version_id',v.id,'after_observation_id',obs.id,'evidence_changes',delta,
      'definition_changes',case when prior.id is not null and v.revision>=prior.revision then evidence_pipeline.workspace_definition_diff(prior.state,v.state) else null end),
    'publicly_eligible',false,'annotation_status','private_analyst_record');
end $$;

create function public.mip_investigation_workspace_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare iid uuid; vid uuid; previous uuid; uid uuid; oid uuid; rid uuid; expected uuid; old_head uuid;
  current_v evidence_pipeline.investigation_versions; existing evidence_pipeline.investigation_versions;
  obs evidence_pipeline.investigation_observations; old_obs evidence_pipeline.investigation_observations;
  member evidence_pipeline.investigation_memberships; receipt evidence_pipeline.investigation_review_receipts;
  previous_role text; revision integer; after_id uuid; page_limit integer; items jsonb; more boolean;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>147456 then
    raise exception using errcode='22023',message='invalid workspace request'; end if;
  if p_action='put' then
    perform evidence_pipeline.workspace_keys(p_input,array['investigation_id','version_id','previous_version_id','observation_id','state','change_reason']);
    iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');vid:=evidence_pipeline.workspace_uuid(p_input->'version_id');
    oid:=evidence_pipeline.workspace_uuid(p_input->'observation_id');
    if p_input->'previous_version_id'<>'null'::jsonb then previous:=evidence_pipeline.workspace_uuid(p_input->'previous_version_id'); end if;
    perform evidence_pipeline.workspace_text(p_input->'change_reason');
    perform pg_advisory_xact_lock(hashtextextended('mip-workspace:'||iid::text,0));
    select * into existing from evidence_pipeline.investigation_versions where id=vid;
    if found then
      if existing.investigation_id<>iid or existing.predecessor_id is distinct from previous or existing.observation_id<>oid
        or existing.state<>p_input->'state' or existing.change_reason<>p_input->>'change_reason' then
        raise exception using errcode='23505',message='workspace version identity conflict'; end if;
      return to_jsonb(existing);
    end if;
    select current_version_id into old_head from evidence_pipeline.investigations where id=iid;
    if old_head is distinct from previous then raise exception using errcode='40001',message='workspace head changed'; end if;
    select * into obs from evidence_pipeline.investigation_observations where id=oid;
    if not found then raise exception using errcode='22023',message='unknown workspace observation'; end if;
    if old_head is not null then
      select * into current_v from evidence_pipeline.investigation_versions where id=old_head;
      select * into old_obs from evidence_pipeline.investigation_observations where id=current_v.observation_id;
      if old_obs.scope_candidate_ids=obs.scope_candidate_ids then
        if oid<>old_obs.id and obs.previous_observation_id is distinct from old_obs.id then
          raise exception using errcode='22023',message='new observation must directly extend current observation'; end if;
      elsif obs.previous_observation_id is not null then raise exception using errcode='22023',message='changed candidate scope requires fresh baseline'; end if;
    elsif obs.previous_observation_id is not null then raise exception using errcode='22023',message='initial workspace requires fresh observation baseline'; end if;
    perform evidence_pipeline.workspace_validate_state(p_input->'state',obs.snapshot);
    insert into evidence_pipeline.investigations(id) values(iid) on conflict(id) do nothing;
    insert into evidence_pipeline.investigation_versions(id,investigation_id,revision,predecessor_id,observation_id,state,change_reason)
      values(vid,iid,coalesce(current_v.revision,0)+1,previous,oid,p_input->'state',p_input->>'change_reason') returning * into existing;
    update evidence_pipeline.investigations set current_version_id=vid where id=iid;
    return to_jsonb(existing);
  elsif p_action='set_access' then
    perform evidence_pipeline.workspace_keys(p_input,array['investigation_id','user_id','access_role','reason']);
    iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');
    perform evidence_pipeline.workspace_text(p_input->'reason');
    perform evidence_pipeline.workspace_choice(p_input->'access_role',array['viewer','reviewer','revoked']);
    if p_input->>'access_role' not in ('viewer','reviewer','revoked') then raise exception using errcode='22023',message='invalid workspace access role'; end if;
    perform pg_advisory_xact_lock(hashtextextended('mip-workspace-access:'||iid::text||':'||uid::text,0));
    select access_role into previous_role from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid for update;
    if previous_role is distinct from p_input->>'access_role' then
      insert into evidence_pipeline.investigation_memberships(investigation_id,user_id,access_role) values(iid,uid,p_input->>'access_role')
        on conflict(investigation_id,user_id) do update set access_role=excluded.access_role;
      insert into evidence_pipeline.investigation_access_events(investigation_id,user_id,previous_role,access_role,reason)
        values(iid,uid,previous_role,p_input->>'access_role',p_input->>'reason');
    end if;
    return jsonb_build_object('investigation_id',iid,'user_id',uid,'access_role',p_input->>'access_role');
  elsif p_action='list' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id'],array['after','limit']);
    uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');
    if p_input ? 'after' and p_input->'after'<>'null'::jsonb then after_id:=evidence_pipeline.workspace_uuid(p_input->'after'); end if;
    page_limit:=coalesce((p_input->>'limit')::integer,20);
    if page_limit not between 1 and 50 then raise exception using errcode='22023',message='workspace list limit must be 1..50'; end if;
    select coalesce(jsonb_agg(x.doc order by x.id),'[]') into items from (
      select i.id,jsonb_build_object('investigation_id',i.id,'version_id',v.id,'revision',v.revision,'question',v.state->>'question',
        'access_role',m.access_role,'reviewed_version_id',r.version_id) doc
      from evidence_pipeline.investigation_memberships m join evidence_pipeline.investigations i on i.id=m.investigation_id
      join evidence_pipeline.investigation_versions v on v.id=i.current_version_id
      left join evidence_pipeline.investigation_review_receipts r on r.id=m.current_review_id
      where m.user_id=uid and m.access_role<>'revoked' and (after_id is null or i.id>after_id)
      order by i.id limit page_limit+1) x;
    more:=jsonb_array_length(items)>page_limit;
    if more then items:=items-page_limit; end if;
    return jsonb_build_object('contract_version','investigation-workspace-1','items',items,'has_more',more,
      'next_after',case when more then items->(page_limit-1)->>'investigation_id' else null end,'publicly_eligible',false);
  elsif p_action='read' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id'],array['version_id']);
    uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');
    if p_input ? 'version_id' then vid:=evidence_pipeline.workspace_uuid(p_input->'version_id'); end if;
    return evidence_pipeline.workspace_read(uid,iid,vid);
  elsif p_action='mark_review' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','version_id','receipt_id','previous_receipt_id']);
    uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');
    vid:=evidence_pipeline.workspace_uuid(p_input->'version_id');rid:=evidence_pipeline.workspace_uuid(p_input->'receipt_id');
    if p_input->'previous_receipt_id'<>'null'::jsonb then expected:=evidence_pipeline.workspace_uuid(p_input->'previous_receipt_id'); end if;
    select * into member from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid for update;
    if not found or member.access_role<>'reviewer' then raise exception using errcode='42501',message='investigation review access denied'; end if;
    select * into receipt from evidence_pipeline.investigation_review_receipts where id=rid;
    if found then
      if receipt.investigation_id<>iid or receipt.user_id<>uid or receipt.version_id<>vid or receipt.previous_receipt_id is distinct from expected then
        raise exception using errcode='23505',message='review receipt identity conflict'; end if;
      return to_jsonb(receipt)-'user_id';
    end if;
    if member.current_review_id is distinct from expected then raise exception using errcode='40001',message='review baseline changed'; end if;
    select * into current_v from evidence_pipeline.investigation_versions where id=vid and investigation_id=iid;
    if not found then raise exception using errcode='42501',message='investigation review access denied'; end if;
    if expected is not null then
      select v.revision into revision from evidence_pipeline.investigation_review_receipts r
        join evidence_pipeline.investigation_versions v on v.id=r.version_id where r.id=expected;
      if current_v.revision<revision then raise exception using errcode='40001',message='review baseline cannot move backwards'; end if;
    end if;
    insert into evidence_pipeline.investigation_review_receipts(id,investigation_id,user_id,version_id,previous_receipt_id)
      values(rid,iid,uid,vid,expected) returning * into receipt;
    update evidence_pipeline.investigation_memberships set current_review_id=rid where investigation_id=iid and user_id=uid;
    return to_jsonb(receipt)-'user_id';
  else raise exception using errcode='22023',message='unsupported workspace action'; end if;
end $$;

do $$ declare t text; f record; begin
  foreach t in array array['investigations','investigation_versions','investigation_memberships','investigation_review_receipts','investigation_access_events'] loop
    execute format('alter table evidence_pipeline.%I enable row level security',t);
    execute format('revoke all on evidence_pipeline.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert on evidence_pipeline.%I to service_role',t);
    execute format('create trigger no_truncate before truncate on evidence_pipeline.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
    if t in ('investigation_versions','investigation_review_receipts','investigation_access_events') then
      execute format('create trigger no_rewrite before update or delete on evidence_pipeline.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);
    end if;
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='evidence_pipeline' and p.proname like 'workspace\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant update(current_version_id) on evidence_pipeline.investigations to service_role;
grant update(access_role,current_review_id) on evidence_pipeline.investigation_memberships to service_role;
revoke all on function public.mip_investigation_workspace_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.mip_investigation_workspace_v1(text,jsonb) to service_role;
commit;
