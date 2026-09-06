-- Additive private review ledger. Original reports and evidence remain immutable.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table evidence_pipeline.investigation_evidence_review_events (
  id uuid primary key,
  report_id uuid not null references evidence_pipeline.investigation_evidence_check_reports(id),
  revision bigint not null check(revision>0),
  target_kind text not null check(target_kind in ('source_link','evidence_cue')),
  target_id text not null check(length(target_id) between 1 and 200),
  previous_event_id uuid,
  decision text not null check(decision in ('relevant','not_relevant','disputed','needs_review')),
  rationale text not null check(length(btrim(rationale)) between 1 and 2000),
  evidence jsonb not null check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence) between 1 and 8 and octet_length(evidence::text)<=49152),
  recorded_by uuid not null references public.mip_profiles(id),
  recorded_at timestamptz not null default clock_timestamp(),
  unique(report_id,revision),
  unique(report_id,target_kind,target_id,id),
  foreign key(report_id,target_kind,target_id,previous_event_id)
    references evidence_pipeline.investigation_evidence_review_events(report_id,target_kind,target_id,id)
);
create index evidence_review_target_history on evidence_pipeline.investigation_evidence_review_events(report_id,target_kind,target_id,revision desc);
create index evidence_review_predecessor on evidence_pipeline.investigation_evidence_review_events(report_id,target_kind,target_id,previous_event_id);
create index evidence_review_actor on evidence_pipeline.investigation_evidence_review_events(recorded_by);
alter table evidence_pipeline.investigation_evidence_review_events enable row level security;
revoke all on evidence_pipeline.investigation_evidence_review_events from public,anon,authenticated,service_role;
grant select,insert on evidence_pipeline.investigation_evidence_review_events to service_role;
create trigger no_rewrite before update or delete on evidence_pipeline.investigation_evidence_review_events
  for each row execute function evidence_pipeline.reject_history_mutation();
create trigger no_truncate before truncate on evidence_pipeline.investigation_evidence_review_events
  for each statement execute function evidence_pipeline.reject_history_mutation();

-- JSON positions/revisions are decimal strings, never JavaScript numbers.
create function evidence_pipeline.evidence_review_revision(p jsonb) returns bigint
language plpgsql immutable security invoker set search_path='' as $$ begin
  if p is null or jsonb_typeof(p)<>'string' or (p#>>'{}') !~ '^(0|[1-9][0-9]{0,17})$' then
    raise exception using errcode='22023',message='invalid review revision'; end if;
  return (p#>>'{}')::bigint;
end $$;

create function evidence_pipeline.evidence_review_event(p evidence_pipeline.investigation_evidence_review_events,uid uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select (to_jsonb(p)-'recorded_by')||jsonb_build_object('revision',p.revision::text,'authored_by_you',p.recorded_by=uid)
$$;

create function public.mip_investigation_evidence_reviews_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
#variable_conflict use_variable
declare uid uuid; iid uuid; vid uuid; rid uuid; eid uuid; previous_id uuid; role_name text;
  r evidence_pipeline.investigation_evidence_check_reports; e evidence_pipeline.investigation_evidence_review_events;
  prior evidence_pipeline.investigation_evidence_review_events; oid uuid; snapshot jsonb; item jsonb; ref jsonb; raw_input jsonb;
  target_kind text; target_id text; required text[]:=array['user_id','investigation_id','version_id','report_id'];
  current_revision bigint; at_revision bigint; before_revision bigint; entries jsonb; result jsonb; target_list jsonb;
  replayed boolean:=false; positions text[]; referenced_positions text[]:='{}'; metadata_seen jsonb:='[]'; page_has_more boolean;
begin
  if p_action is null or p_action not in ('read','decide','history') or p_input is null
    or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>65536 then
    raise exception using errcode='22023',message='invalid evidence review request'; end if;
  if p_action='decide' then
    required:=required||array['event_id','previous_event_id','target_kind','target_id','decision','rationale','evidence'];
  elsif p_action='history' then required:=required||array['target_kind','target_id','at_revision','before_revision']; end if;
  perform evidence_pipeline.workspace_keys(p_input,required);
  uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');
  vid:=evidence_pipeline.workspace_uuid(p_input->'version_id');rid:=evidence_pipeline.workspace_uuid(p_input->'report_id');
  -- Every operation checks current membership. Writes serialize with revocation.
  if p_action='decide' then
    select access_role into role_name from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid for update;
  else select access_role into role_name from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid; end if;
  if role_name is null or role_name='revoked' or (p_action='decide' and role_name<>'reviewer') then
    raise exception using errcode='42501',message='investigation access denied'; end if;
  select * into r from evidence_pipeline.investigation_evidence_check_reports where id=rid and investigation_id=iid and version_id=vid;
  if not found then raise exception using errcode='42501',message='investigation access denied'; end if;
  select observation_id into oid from evidence_pipeline.investigation_versions where id=vid and investigation_id=iid;
  if p_action='decide' then perform pg_advisory_xact_lock(hashtextextended('mip-evidence-review:'||rid::text,0)); end if;
  select coalesce(max(revision),0) into current_revision from evidence_pipeline.investigation_evidence_review_events where report_id=rid;
  result:=jsonb_build_object('contract_version','investigation-evidence-reviews-1','investigation_id',iid,'version_id',vid,
    'observation_id',oid,'report_id',rid,'access_role',role_name,'publicly_eligible',false);
  if p_action in ('decide','history') then
    perform evidence_pipeline.workspace_choice(p_input->'target_kind',array['source_link','evidence_cue']);
    perform evidence_pipeline.workspace_text(p_input->'target_id',200);
    target_kind:=p_input->>'target_kind';target_id:=p_input->>'target_id';
    select v into item from jsonb_array_elements(r.result->case when target_kind='source_link' then 'lineage_candidates' else 'challenge_cues' end) v
      where v->>'id'=target_id;
    if item is null then raise exception using errcode='22023',message='review target not in saved report'; end if;
  end if;
  if p_action='decide' then
    eid:=evidence_pipeline.workspace_uuid(p_input->'event_id');
    if p_input->'previous_event_id'<>'null'::jsonb then previous_id:=evidence_pipeline.workspace_uuid(p_input->'previous_event_id'); end if;
    perform evidence_pipeline.workspace_choice(p_input->'decision',array['relevant','not_relevant','disputed','needs_review']);
    perform evidence_pipeline.workspace_text(p_input->'rationale');
    perform evidence_pipeline.workspace_array(p_input->'evidence',8);
    if jsonb_array_length(p_input->'evidence')=0 or octet_length((p_input->'evidence')::text)>49152 then
      raise exception using errcode='22023',message='review requires bounded retained evidence'; end if;
    select o.snapshot into snapshot from evidence_pipeline.investigation_observations o where o.id=oid;
    positions:=case when target_kind='source_link' then array[item->>'left_position',item->>'right_position'] else array[item->>'position'] end;
    for ref in select value from jsonb_array_elements(p_input->'evidence') loop
      if ref->>'source_field'='source_status' then
        perform evidence_pipeline.workspace_keys(ref,array['position','source_field','value']);
        if jsonb_typeof(ref->'position') is distinct from 'string' or jsonb_typeof(ref->'value') is distinct from 'string' then
          raise exception using errcode='22023',message='invalid metadata reference'; end if;
        select v into raw_input from jsonb_array_elements(snapshot->'inputs') v where v->>'position'=ref->>'position';
        if raw_input is null or raw_input->'record_version'->>'record_kind' is distinct from 'article'
          or raw_input->'record_version'->'payload'->'source_status' is distinct from ref->'value' then
          raise exception using errcode='22023',message='metadata reference mismatch'; end if;
        if metadata_seen @> jsonb_build_array(ref) then raise exception using errcode='22023',message='duplicate metadata reference'; end if;
        metadata_seen:=metadata_seen||jsonb_build_array(ref);
      else
        perform evidence_pipeline.workspace_evidence(jsonb_build_array(ref),snapshot);
      end if;
      referenced_positions:=array_append(referenced_positions,ref->>'position');
    end loop;
    -- Validate the text array together as well, so duplicate spans cannot pad support.
    perform evidence_pipeline.workspace_evidence((select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(p_input->'evidence') v where v->>'source_field'<>'source_status'),snapshot);
    if not positions <@ referenced_positions then raise exception using errcode='22023',message='cite every reviewed target input'; end if;
    select * into e from evidence_pipeline.investigation_evidence_review_events where id=eid;
    if e.id is not null then
      if e.report_id<>rid or e.recorded_by<>uid or e.target_kind<>target_kind or e.target_id<>target_id
        or e.previous_event_id is distinct from previous_id or e.decision<>p_input->>'decision'
        or e.rationale<>p_input->>'rationale' or e.evidence<>p_input->'evidence' then
        raise exception using errcode='40001',message='review event identity conflict'; end if;
      replayed:=true;
    else
      select ev.* into prior from evidence_pipeline.investigation_evidence_review_events ev
        where ev.report_id=rid and ev.target_kind=target_kind and ev.target_id=target_id order by ev.revision desc limit 1;
      if prior.id is distinct from previous_id then raise exception using errcode='40001',message='review changed; refresh before deciding'; end if;
      if current_revision>=999999999999999999 then raise exception using errcode='22023',message='review revision limit'; end if;
      insert into evidence_pipeline.investigation_evidence_review_events(id,report_id,revision,target_kind,target_id,previous_event_id,decision,rationale,evidence,recorded_by)
        values(eid,rid,current_revision+1,target_kind,target_id,previous_id,p_input->>'decision',p_input->>'rationale',p_input->'evidence',uid) returning * into e;
      current_revision:=e.revision;
    end if;
    -- This is a receipt, not the current target state: a replay can be historical.
    return result||jsonb_build_object('mode','receipt','revision',current_revision::text,'replayed',replayed,'event',evidence_pipeline.evidence_review_event(e,uid));
  elsif p_action='history' then
    at_revision:=evidence_pipeline.evidence_review_revision(p_input->'at_revision');
    if at_revision>current_revision then raise exception using errcode='22023',message='unknown review revision'; end if;
    before_revision:=at_revision+1;
    if p_input->'before_revision'<>'null'::jsonb then
      before_revision:=evidence_pipeline.evidence_review_revision(p_input->'before_revision');
      if before_revision>at_revision+1 then raise exception using errcode='22023',message='invalid history cursor'; end if;
    end if;
    with page as (select ev.* from evidence_pipeline.investigation_evidence_review_events ev where ev.report_id=rid
      and ev.target_kind=target_kind and ev.target_id=target_id and ev.revision<=at_revision and ev.revision<before_revision
      order by ev.revision desc limit 21)
    , numbered as (select evidence_pipeline.evidence_review_event(p::evidence_pipeline.investigation_evidence_review_events,uid) doc,
      p.revision,row_number() over(order by p.revision desc) n from page p)
    select coalesce(jsonb_agg(doc order by revision desc) filter(where n<=20),'[]'),count(*)>20
      into entries,page_has_more from numbered;
    return result||jsonb_build_object('mode','history','revision',at_revision::text,'target_kind',target_kind,'target_id',target_id,'events',entries,
      'next_before_revision',case when page_has_more then entries->19->>'revision' else null end);
  end if;
  -- Pin a read to one revision before deriving all sections. No auto-review.
  with targets as (
    select 'source_link' kind,v->>'id' id,n from jsonb_array_elements(r.result->'lineage_candidates') with ordinality a(v,n)
    union all select 'evidence_cue',v->>'id',n from jsonb_array_elements(r.result->'challenge_cues') with ordinality a(v,n)
  )
  select coalesce(jsonb_agg(jsonb_build_object('target_kind',t.kind,'target_id',t.id,'decision',coalesce(last.decision,'needs_review'),
      'latest_event',case when last.id is null then null else (evidence_pipeline.evidence_review_event(last::evidence_pipeline.investigation_evidence_review_events,uid)-'evidence'-'rationale')||jsonb_build_object('rationale_preview',left(last.rationale,240)) end) order by t.kind,t.n),'[]')
    into target_list from targets t left join lateral (select ev.* from evidence_pipeline.investigation_evidence_review_events ev where ev.report_id=rid
      and ev.target_kind=t.kind and ev.target_id=t.id and ev.revision<=current_revision order by ev.revision desc limit 1) last on true;
  return result||jsonb_build_object('mode','overview','revision',current_revision::text,'targets',target_list,
    'summary',(select jsonb_build_object('returned_targets',count(*),'never_reviewed',count(*) filter(where v->'latest_event'='null'::jsonb),
      'needs_review',count(*) filter(where v->>'decision'='needs_review'),'relevant',count(*) filter(where v->>'decision'='relevant'),
      'not_relevant',count(*) filter(where v->>'decision'='not_relevant'),'disputed',count(*) filter(where v->>'decision'='disputed')) from jsonb_array_elements(target_list) v),
    'coverage',r.result->'coverage','review_scope','returned_report_targets_only','independence','unknown','assessment_effect','none');
end $$;
revoke all on function evidence_pipeline.evidence_review_revision(jsonb),
  evidence_pipeline.evidence_review_event(evidence_pipeline.investigation_evidence_review_events,uuid),
  public.mip_investigation_evidence_reviews_v1(text,jsonb) from public,anon,authenticated;
grant execute on function evidence_pipeline.evidence_review_revision(jsonb),
  evidence_pipeline.evidence_review_event(evidence_pipeline.investigation_evidence_review_events,uuid),
  public.mip_investigation_evidence_reviews_v1(text,jsonb) to service_role;
commit;
