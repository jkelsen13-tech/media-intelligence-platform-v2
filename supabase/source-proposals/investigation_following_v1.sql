-- NONDEPLOYED SOURCE PROPOSAL: private investigation Following foundation only.
-- No public story/capture alias, policy classifier, delivery or external channel.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table evidence_pipeline.investigation_follows (
  investigation_id uuid not null,
  user_id uuid not null,
  subject_id uuid not null,
  anchor_version_id uuid not null,
  acknowledged_version_id uuid not null,
  status text not null check(status in ('active','unsubscribed','revoked')),
  current_event_id uuid,
  primary key(investigation_id,user_id),
  foreign key(investigation_id,user_id) references evidence_pipeline.investigation_memberships(investigation_id,user_id),
  foreign key(investigation_id,anchor_version_id) references evidence_pipeline.investigation_versions(investigation_id,id),
  foreign key(investigation_id,acknowledged_version_id) references evidence_pipeline.investigation_versions(investigation_id,id)
);
create index investigation_follows_user on evidence_pipeline.investigation_follows(user_id,investigation_id);

create table evidence_pipeline.investigation_follow_events (
  id uuid primary key,
  investigation_id uuid not null,
  user_id uuid not null,
  action text not null check(action in ('subscribe','unsubscribe','acknowledge','revoke','assignment_revoked')),
  previous_event_id uuid,
  request_fingerprint text not null,
  result jsonb not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(investigation_id,user_id,id),
  foreign key(investigation_id,user_id) references evidence_pipeline.investigation_follows(investigation_id,user_id),
  foreign key(investigation_id,user_id,previous_event_id) references evidence_pipeline.investigation_follow_events(investigation_id,user_id,id)
);
alter table evidence_pipeline.investigation_follows add constraint following_current_event_same_user
  foreign key(investigation_id,user_id,current_event_id) references evidence_pipeline.investigation_follow_events(investigation_id,user_id,id);

create table evidence_pipeline.investigation_material_changes (
  id uuid primary key,
  investigation_id uuid not null,
  subject_id uuid not null,
  before_version_id uuid not null,
  after_version_id uuid not null,
  before_observation_id uuid not null references evidence_pipeline.investigation_observations(id),
  after_observation_id uuid not null references evidence_pipeline.investigation_observations(id),
  declared_by uuid not null,
  materiality_reason text not null check(length(btrim(materiality_reason)) between 1 and 2000),
  changes jsonb not null,
  declared_at timestamptz not null default clock_timestamp(),
  unique(investigation_id,before_version_id,after_version_id),
  foreign key(investigation_id,before_version_id) references evidence_pipeline.investigation_versions(investigation_id,id),
  foreign key(investigation_id,after_version_id) references evidence_pipeline.investigation_versions(investigation_id,id),
  foreign key(investigation_id,declared_by) references evidence_pipeline.investigation_memberships(investigation_id,user_id)
);
create index investigation_material_changes_after on evidence_pipeline.investigation_material_changes(investigation_id,after_version_id);
comment on table evidence_pipeline.investigation_material_changes is
  'Private authorized-reviewer materiality declarations over exact nonempty immutable predecessor diffs. Not automatic editorial classification, independent sourcing, publication or notification delivery.';

create function evidence_pipeline.following_payload(p evidence_pipeline.investigation_follows) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('investigation_id',p.investigation_id,'subject',jsonb_build_object('type','graph_node','id',p.subject_id),
    'anchor_version_id',p.anchor_version_id,'acknowledged_version_id',p.acknowledged_version_id,'status',p.status,'current_event_id',p.current_event_id)
$$;

create function evidence_pipeline.following_read(p_user uuid,p_investigation uuid,p_limit integer default 20) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare f evidence_pipeline.investigation_follows; v evidence_pipeline.investigation_versions; ack evidence_pipeline.investigation_versions;
  items jsonb:='[]'; more boolean:=false; matches boolean;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid following limit'; end if;
  if not exists(select 1 from evidence_pipeline.investigation_memberships where investigation_id=p_investigation and user_id=p_user and access_role<>'revoked') then
    raise exception using errcode='42501',message='following access denied'; end if;
  select * into f from evidence_pipeline.investigation_follows where investigation_id=p_investigation and user_id=p_user;
  if not found then return jsonb_build_object('contract_version','private-investigation-following-1','scope','private_investigation',
    'investigation_id',p_investigation,'subscription',null,'changes','[]'::jsonb,'coverage','registered_material_changes_only','publicly_eligible',false); end if;
  select x.* into v from evidence_pipeline.investigations i join evidence_pipeline.investigation_versions x on x.id=i.current_version_id where i.id=p_investigation;
  select * into ack from evidence_pipeline.investigation_versions where id=f.acknowledged_version_id;
  matches:=v.state->'canonical_subject'=jsonb_build_object('type','graph_node','id',f.subject_id);
  if f.status='active' and matches then
    select coalesce(jsonb_agg(x.doc order by x.revision),'[]') into items from (
      select a.revision,to_jsonb(c)-'declared_by' doc from evidence_pipeline.investigation_material_changes c
      join evidence_pipeline.investigation_versions a on a.id=c.after_version_id
      where c.investigation_id=p_investigation and c.subject_id=f.subject_id and a.revision>ack.revision and a.revision<=v.revision
      order by a.revision limit p_limit+1) x;
    more:=jsonb_array_length(items)>p_limit;
    if more then items:=items-p_limit; end if;
  end if;
  return jsonb_build_object('contract_version','private-investigation-following-1','scope','private_investigation',
    'investigation_id',p_investigation,'subscription',evidence_pipeline.following_payload(f),'head_version_id',v.id,
    'head_observation_id',v.observation_id,'anchor_matches_head',matches,'version_advanced',v.revision>ack.revision,
    'changes',items,'has_more',more,'coverage','registered_material_changes_only',
    'unclassified_version_changes',exists(select 1 from evidence_pipeline.investigation_versions x
      where x.investigation_id=p_investigation and x.revision>ack.revision and x.revision<=v.revision
      and not exists(select 1 from evidence_pipeline.investigation_material_changes c where c.after_version_id=x.id)),
    'materiality','authorized_reviewer_declaration','publicly_eligible',false);
end $$;

create function evidence_pipeline.following_revoke(p_investigation uuid,p_user uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare f evidence_pipeline.investigation_follows; eid uuid:=gen_random_uuid(); result jsonb;
begin
  select * into f from evidence_pipeline.investigation_follows where investigation_id=p_investigation and user_id=p_user for update;
  if not found or f.status='revoked' then return; end if;
  f.status:='revoked';result:=evidence_pipeline.following_payload(f)||jsonb_build_object('current_event_id',eid);
  insert into evidence_pipeline.investigation_follow_events(id,investigation_id,user_id,action,previous_event_id,request_fingerprint,result)
    values(eid,p_investigation,p_user,'assignment_revoked',f.current_event_id,'assignment-revoked:'||eid::text,result);
  update evidence_pipeline.investigation_follows set status='revoked',current_event_id=eid where investigation_id=p_investigation and user_id=p_user;
end $$;
create function evidence_pipeline.following_membership_revoked() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.access_role='revoked' and old.access_role is distinct from new.access_role then
    perform evidence_pipeline.following_revoke(new.investigation_id,new.user_id);
  end if;
  return null;
end $$;
create trigger investigation_following_revocation after update of access_role on evidence_pipeline.investigation_memberships
for each row execute function evidence_pipeline.following_membership_revoked();

create function public.mip_investigation_following_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare iid uuid; uid uuid; eid uuid; expected uuid; vid uuid; subject uuid; fp text; items jsonb; more boolean; after_id uuid; page_limit integer;
  member evidence_pipeline.investigation_memberships; f evidence_pipeline.investigation_follows; prior evidence_pipeline.investigation_follow_events;
  v evidence_pipeline.investigation_versions; head evidence_pipeline.investigation_versions; acknowledged evidence_pipeline.investigation_versions;
  before_v evidence_pipeline.investigation_versions; before_o evidence_pipeline.investigation_observations; after_o evidence_pipeline.investigation_observations;
  change evidence_pipeline.investigation_material_changes; delta jsonb; definitions jsonb; nonempty boolean; section text; result jsonb;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>16384 then raise exception using errcode='22023',message='invalid following request'; end if;
  if p_action='list' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id'],array['after','limit']);
    uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');page_limit:=coalesce((p_input->>'limit')::integer,20);
    if p_input ? 'after' and p_input->'after'<>'null'::jsonb then after_id:=evidence_pipeline.workspace_uuid(p_input->'after');end if;
    if page_limit not between 1 and 50 then raise exception using errcode='22023',message='invalid following limit';end if;
    select coalesce(jsonb_agg(x.doc order by x.id),'[]') into items from (
      select preference.investigation_id id,evidence_pipeline.following_payload(preference) doc from evidence_pipeline.investigation_follows preference
      join evidence_pipeline.investigation_memberships m on m.investigation_id=preference.investigation_id and m.user_id=preference.user_id
      where preference.user_id=uid and m.access_role<>'revoked' and preference.status='active' and (after_id is null or preference.investigation_id>after_id)
      order by preference.investigation_id limit page_limit+1) x;
    more:=jsonb_array_length(items)>page_limit;if more then items:=items-page_limit;end if;
    return jsonb_build_object('contract_version','private-investigation-following-1','scope','private_investigation','items',items,'has_more',more,
      'next_after',case when more then items->(page_limit-1)->>'investigation_id' else null end,'publicly_eligible',false);
  end if;
  if p_action='read' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id'],array['limit']);
    return evidence_pipeline.following_read(evidence_pipeline.workspace_uuid(p_input->'user_id'),evidence_pipeline.workspace_uuid(p_input->'investigation_id'),coalesce((p_input->>'limit')::integer,20));
  end if;
  if p_action='register_material_change' then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','change_id','before_version_id','after_version_id','materiality_reason']);
  elsif p_action in ('subscribe','acknowledge') then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','event_id','previous_event_id','version_id','subject_id']);
  elsif p_action in ('unsubscribe','revoke') then
    perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','event_id','previous_event_id']);
  else raise exception using errcode='22023',message='unsupported following action';end if;
  iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');
  -- Same membership lock owner as substantive review and assignment changes.
  select * into member from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid for update;
  if not found or (member.access_role='revoked' and p_action<>'revoke') then raise exception using errcode='42501',message='following access denied';end if;
  if p_action='register_material_change' then
    if member.access_role<>'reviewer' then raise exception using errcode='42501',message='material declaration access denied';end if;
    eid:=evidence_pipeline.workspace_uuid(p_input->'change_id');
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('following-change:'||eid::text,0));perform evidence_pipeline.workspace_text(p_input->'materiality_reason');
    select * into before_v from evidence_pipeline.investigation_versions where investigation_id=iid and id=evidence_pipeline.workspace_uuid(p_input->'before_version_id');
    select * into v from evidence_pipeline.investigation_versions where investigation_id=iid and id=evidence_pipeline.workspace_uuid(p_input->'after_version_id');
    if before_v.id is null or v.id is null or v.predecessor_id is distinct from before_v.id then raise exception using errcode='22023',message='material change requires exact predecessor versions';end if;
    if before_v.state->'canonical_subject' is distinct from v.state->'canonical_subject' or v.state->'canonical_subject'='null'::jsonb then
      raise exception using errcode='22023',message='material change anchor mismatch';end if;
    select * into before_o from evidence_pipeline.investigation_observations where id=before_v.observation_id;
    select * into after_o from evidence_pipeline.investigation_observations where id=v.observation_id;
    if before_o.scope_candidate_ids<>after_o.scope_candidate_ids then raise exception using errcode='22023',message='material change scope mismatch';end if;
    delta:=evidence_pipeline.diff_investigation_snapshots(before_o.snapshot,after_o.snapshot);
    definitions:=evidence_pipeline.workspace_definition_diff(before_v.state,v.state);
    nonempty:=jsonb_array_length(delta)>0 or (definitions->>'question_changed')::boolean or (definitions->>'scope_changed')::boolean or (definitions->>'unresolved_questions_changed')::boolean;
    foreach section in array array['hypotheses','commitments','coverage'] loop
      nonempty:=nonempty or jsonb_array_length(definitions->section->'added')>0 or jsonb_array_length(definitions->section->'removed')>0 or jsonb_array_length(definitions->section->'updated')>0;
    end loop;
    if not nonempty then raise exception using errcode='22023',message='material declaration requires nonempty retained diff';end if;
    select * into change from evidence_pipeline.investigation_material_changes where id=eid;
    if found then
      if change.investigation_id<>iid or change.before_version_id<>before_v.id or change.after_version_id<>v.id or change.declared_by<>uid or change.materiality_reason<>p_input->>'materiality_reason' then
        raise exception using errcode='23505',message='material declaration identity conflict';end if;
      return to_jsonb(change)-'declared_by';
    end if;
    insert into evidence_pipeline.investigation_material_changes(id,investigation_id,subject_id,before_version_id,after_version_id,before_observation_id,after_observation_id,declared_by,materiality_reason,changes)
      values(eid,iid,(v.state->'canonical_subject'->>'id')::uuid,before_v.id,v.id,before_o.id,after_o.id,uid,p_input->>'materiality_reason',
        jsonb_build_object('evidence_changes',delta,'definition_changes',definitions)) returning * into change;
    return to_jsonb(change)-'declared_by';
  end if;
  eid:=evidence_pipeline.workspace_uuid(p_input->'event_id');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('following-event:'||eid::text,0));
  if p_input->'previous_event_id'<>'null'::jsonb then expected:=evidence_pipeline.workspace_uuid(p_input->'previous_event_id');end if;
  fp:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'input',p_input)::text,'UTF8')),'hex');
  select * into prior from evidence_pipeline.investigation_follow_events where id=eid;
  if found then
    if prior.investigation_id<>iid or prior.user_id<>uid or prior.request_fingerprint<>fp then raise exception using errcode='23505',message='following receipt identity conflict';end if;
    return prior.result;
  end if;
  select * into f from evidence_pipeline.investigation_follows where investigation_id=iid and user_id=uid for update;
  if f.current_event_id is distinct from expected then raise exception using errcode='40001',message='following baseline changed';end if;
  if p_action in ('subscribe','acknowledge') then
    vid:=evidence_pipeline.workspace_uuid(p_input->'version_id');subject:=evidence_pipeline.workspace_uuid(p_input->'subject_id');
    select * into v from evidence_pipeline.investigation_versions where investigation_id=iid and id=vid;
    select x.* into head from evidence_pipeline.investigations i join evidence_pipeline.investigation_versions x on x.id=i.current_version_id where i.id=iid;
    if v.id is null or v.state->'canonical_subject' is distinct from jsonb_build_object('type','graph_node','id',subject)
      or head.state->'canonical_subject' is distinct from v.state->'canonical_subject' then raise exception using errcode='22023',message='following anchor mismatch';end if;
    if f.investigation_id is not null then
      if f.subject_id<>subject then raise exception using errcode='22023',message='following anchor cannot change';end if;
      select * into acknowledged from evidence_pipeline.investigation_versions where id=f.acknowledged_version_id;
      if v.revision<acknowledged.revision then raise exception using errcode='40001',message='following acknowledgment cannot move backwards';end if;
    elsif p_action='acknowledge' then raise exception using errcode='22023',message='following subscription required';end if;
    if p_action='acknowledge' and f.status<>'active' then raise exception using errcode='22023',message='active following required';end if;
    insert into evidence_pipeline.investigation_follows(investigation_id,user_id,subject_id,anchor_version_id,acknowledged_version_id,status)
      values(iid,uid,subject,vid,vid,'active') on conflict(investigation_id,user_id) do update set acknowledged_version_id=excluded.acknowledged_version_id,status='active'
      returning * into f;
  else
    if f.investigation_id is null then raise exception using errcode='22023',message='following subscription required';end if;
    update evidence_pipeline.investigation_follows set status=case when p_action='revoke' then 'revoked' else 'unsubscribed' end
      where investigation_id=iid and user_id=uid returning * into f;
  end if;
  result:=evidence_pipeline.following_payload(f)||jsonb_build_object('current_event_id',eid,'receipt_id',eid,'action',p_action,'publicly_eligible',false);
  insert into evidence_pipeline.investigation_follow_events(id,investigation_id,user_id,action,previous_event_id,request_fingerprint,result)
    values(eid,iid,uid,p_action,expected,fp,result);
  update evidence_pipeline.investigation_follows set current_event_id=eid where investigation_id=iid and user_id=uid;
  return result;
end $$;

do $$ declare t text; f record; begin
  foreach t in array array['investigation_follows','investigation_follow_events','investigation_material_changes'] loop
    execute format('alter table evidence_pipeline.%I enable row level security',t);
    execute format('revoke all on evidence_pipeline.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert on evidence_pipeline.%I to service_role',t);
    execute format('create trigger no_truncate before truncate on evidence_pipeline.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
    if t<>'investigation_follows' then execute format('create trigger no_rewrite before update or delete on evidence_pipeline.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);end if;
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='evidence_pipeline' and p.proname like 'following\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant update(status,acknowledged_version_id,current_event_id) on evidence_pipeline.investigation_follows to service_role;
revoke all on function public.mip_investigation_following_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.mip_investigation_following_v1(text,jsonb) to service_role;
commit;
