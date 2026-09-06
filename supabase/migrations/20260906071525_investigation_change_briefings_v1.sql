-- Private retained observations. No worker, semantic judgment or publication.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table evidence_pipeline.investigation_observations (
  id uuid primary key,
  previous_observation_id uuid references evidence_pipeline.investigation_observations(id),
  scope_candidate_ids uuid[] not null check(cardinality(scope_candidate_ids) between 1 and 50),
  observation_started_at timestamptz not null,
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  changes jsonb not null check(jsonb_typeof(changes)='array'),
  release_state text not null default 'private' check(release_state='private'),
  check(octet_length(snapshot::text)<=4194304),
  check(previous_observation_id is distinct from id)
);
comment on table evidence_pipeline.investigation_observations is
  'Caller-named, immutable observations of an explicit private candidate scope. Observation time is NOT commit order, a source event time, or proof of a human review. Previous IDs retain an explicit comparison chain; no historical as_of reconstruction.';
create index investigation_observations_previous on evidence_pipeline.investigation_observations(previous_observation_id);
alter table evidence_pipeline.investigation_observations enable row level security;
revoke all on evidence_pipeline.investigation_observations from public,anon,authenticated,service_role;
grant select,insert on evidence_pipeline.investigation_observations to service_role;
create trigger no_rewrite before update or delete on evidence_pipeline.investigation_observations
for each row execute function evidence_pipeline.reject_history_mutation();
create trigger no_truncate before truncate on evidence_pipeline.investigation_observations
for each statement execute function evidence_pipeline.reject_history_mutation();

-- Every query, including nested STABLE freshness reads, sees the same MVCC
-- snapshot. The volatile RPC calls this collector in ONE statement.
create function evidence_pipeline.collect_investigation_snapshot(p_scope uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare aids uuid[]; expanded uuid[]; cids uuid[]; keys text[]; positions bigint[]; aid uuid; entry jsonb;
  selected uuid[]; candidates jsonb; assessments jsonb; inputs jsonb; result jsonb;
begin
  if p_scope is null or cardinality(p_scope) not between 1 and 50
    or array_position(p_scope,null) is not null
    or cardinality(p_scope)<>(select count(distinct x) from unnest(p_scope)x) then
    raise exception 'scope must contain 1..50 distinct candidate IDs';
  end if;
  if (select count(*) from evidence_pipeline.evidence_candidates where id=any(p_scope))<>cardinality(p_scope) then
    raise exception 'unknown scope candidate';
  end if;
  select coalesce(array_agg(id order by id),'{}') into selected
    from evidence_pipeline.assessments where candidate_id=any(p_scope);
  aids:=selected;
  -- Retain dependency decisions and their explicit replacements as well as the
  -- selected decisions. Closure is bounded; nothing is silently omitted.
  loop
    if cardinality(aids)>200 then raise exception 'assessment closure exceeds 200; narrow scope'; end if;
    select coalesce(array_agg(distinct id order by id),'{}') into expanded from (
      select unnest(aids) id
      union select unnest(ancestor_ids) from evidence_pipeline.assessments where id=any(aids)
      union select id from evidence_pipeline.assessments where predecessor_id=any(aids)
    ) q;
    exit when expanded=aids;
    aids:=expanded;
  end loop;
  select array_agg(distinct id order by id) into cids from (
    select unnest(p_scope) id union select candidate_id from evidence_pipeline.assessments where id=any(aids)
  ) q;
  if exists(select 1 from evidence_pipeline.evidence_candidates where id=any(cids) and candidate_kind='geography') then
    raise exception 'geography observations require spatial dependency notifications; unsupported';
  end if;
  select array_agg(distinct k order by k) into keys from (
    select 'article:'||a.article_id::text k from evidence_pipeline.evidence_candidates c
      join evidence_pipeline.article_captures a on a.id=c.capture_id where c.id=any(cids)
    union select 'graph_node:'||event_node_id::text from evidence_pipeline.evidence_candidates where id=any(cids) and event_node_id is not null
    union select 'graph_node:'||related_node_id::text from evidence_pipeline.evidence_candidates where id=any(cids) and related_node_id is not null
    union select unnest(watch_keys) from evidence_pipeline.assessments where id=any(aids)
  ) q;
  if exists(select 1 from unnest(keys) k where not exists(select 1 from evidence_pipeline.change_subjects s where s.watch_key=k))
    or exists(select 1 from evidence_pipeline.evidence_candidates c where c.id=any(cids) and not exists(
      select 1 from evidence_pipeline.evidence_changes e where e.capture_id=c.capture_id)) then
    raise exception 'incomplete retained input history; reconcile first';
  end if;
  select coalesce(array_agg(distinct p order by p),'{}') into positions from (
    select position p from evidence_pipeline.change_subjects where watch_key=any(keys)
    union select unnest(context_positions) from evidence_pipeline.assessments where id=any(aids)
  ) q;
  if cardinality(positions)>2000 then raise exception 'input history exceeds 2000; narrow scope'; end if;
  if (select count(*) from evidence_pipeline.evidence_changes where position=any(positions))<>cardinality(positions) then
    raise exception 'missing assessment input';
  end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') into candidates
    from evidence_pipeline.evidence_candidates c where id=any(cids);
  assessments:='[]';
  foreach aid in array aids loop
    entry:=evidence_pipeline.read_assessment(aid);
    -- The older reader does not promise cause ordering. Canonicalize sets here
    -- so a query-plan change cannot manufacture an investigation change.
    entry:=entry||jsonb_build_object('ordinal',entry->>'ordinal','stale_causes',
      (select coalesce(jsonb_agg(v order by v::text),'[]') from jsonb_array_elements(entry->'stale_causes') v));
    assessments:=assessments||jsonb_build_array(entry);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('position',e.position::text,'queued_at',e.queued_at,
    'capture',to_jsonb(c),'record_version',to_jsonb(v)) order by e.position),'[]') into inputs
    from evidence_pipeline.evidence_changes e
    left join evidence_pipeline.article_captures c on c.id=e.capture_id
    left join evidence_pipeline.record_versions v on v.id=e.record_version_id where e.position=any(positions);
  result:=jsonb_build_object('contract_version','investigation-observation-1','scope_candidate_ids',p_scope,
    'selected_assessment_ids',selected,'candidates',candidates,'assessments',assessments,'inputs',inputs,
    'watch_keys',keys,'coverage','complete_for_explicit_scope','publicly_eligible',false);
  if octet_length(result::text)>4194304 then raise exception 'snapshot exceeds 4 MiB; narrow scope'; end if;
  return result;
end $$;

-- Deltas refer to retained snapshots, never to a fresh reconstruction of the
-- baseline. New input != contradiction; stale != false; repetition != support.
create function evidence_pipeline.diff_investigation_snapshots(p_before jsonb,p_after jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare changes jsonb:='[]'; a jsonb; b jsonb; x jsonb; prev jsonb;
begin
  if p_before is null then return changes; end if;
  if p_before->'scope_candidate_ids' is distinct from p_after->'scope_candidate_ids' then
    raise exception 'comparison scope mismatch';
  end if;
  for x in select value from jsonb_array_elements(p_after->'inputs') loop
    if not exists(select 1 from jsonb_array_elements(p_before->'inputs') v where v->>'position'=x->>'position') then
      changes:=changes||jsonb_build_array(jsonb_build_object('kind','evidence_entered_observation','position',x->>'position'));
    end if;
  end loop;
  for a in select value from jsonb_array_elements(p_after->'assessments')
    where p_after->'selected_assessment_ids' ? (value->>'id') loop
    select value into b from jsonb_array_elements(p_before->'assessments') where value->>'id'=a->>'id';
    if b is null then
      changes:=changes||jsonb_build_array(jsonb_build_object('kind','assessment_added','assessment_id',a->>'id','candidate_id',a->>'candidate_id'));
    else
      if a->'stale_causes' is distinct from b->'stale_causes' then
        changes:=changes||jsonb_build_array(jsonb_build_object('kind','assessment_dependency_change',
          'assessment_id',a->>'id','candidate_id',a->>'candidate_id',
          'before_stale',b->'stale','after_stale',a->'stale',
          'before_causes',b->'stale_causes','after_causes',a->'stale_causes'));
      end if;
      for x in select value from jsonb_array_elements(a->'superseded_by') loop
        if not (b->'superseded_by' @> jsonb_build_array(x)) then
          select value into prev from jsonb_array_elements(p_after->'assessments') where value->'id'=x;
          changes:=changes||jsonb_build_array(jsonb_build_object('kind','assessment_replaced','candidate_id',a->>'candidate_id',
            'before_assessment_id',a->>'id','after_assessment_id',x,'before_outcome',b->>'outcome','after_outcome',prev->>'outcome'));
        end if;
      end loop;
    end if;
  end loop;
  return changes;
end $$;

create function public.mip_investigation_briefings_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare obs evidence_pipeline.investigation_observations; baseline evidence_pipeline.investigation_observations;
  oid uuid; previous uuid; scope uuid[]; snap jsonb; delta jsonb; started timestamptz;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>16384 then raise exception 'invalid briefing input'; end if;
  if p_action='read' then
    if exists(select 1 from jsonb_object_keys(p_input) k where k<>'observation_id') or not p_input ? 'observation_id' then
      raise exception 'read requires only observation_id'; end if;
    select * into obs from evidence_pipeline.investigation_observations where id=(p_input->>'observation_id')::uuid;
    if not found then raise exception 'unknown observation'; end if;
  elsif p_action='observe' then
    if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('observation_id','previous_observation_id','candidate_ids'))
      or jsonb_typeof(p_input->'candidate_ids') is distinct from 'array'
      or jsonb_array_length(p_input->'candidate_ids') not between 1 and 50
      or exists(select 1 from jsonb_array_elements(p_input->'candidate_ids') v where jsonb_typeof(v)<>'string') then
      raise exception 'observe requires observation_id and 1..50 candidate IDs';
    end if;
    oid:=(p_input->>'observation_id')::uuid;
    previous:=(p_input->>'previous_observation_id')::uuid;
    if oid is null or oid=previous then raise exception 'invalid observation identity'; end if;
    select array_agg(x::uuid order by x::uuid) into scope from jsonb_array_elements_text(p_input->'candidate_ids') x;
    if cardinality(scope)<>(select count(distinct x) from unnest(scope)x) then raise exception 'duplicate scope candidate'; end if;
    perform pg_advisory_xact_lock(hashtextextended('mip-observation:'||oid::text,0));
    select * into obs from evidence_pipeline.investigation_observations where id=oid;
    if found then
      if obs.scope_candidate_ids<>scope or obs.previous_observation_id is distinct from previous then raise exception 'observation identity conflict'; end if;
      -- An idempotent retry returns the stored observation, even after changes.
    else
      if previous is not null then
        select * into baseline from evidence_pipeline.investigation_observations where id=previous;
        if not found then raise exception 'unknown previous observation'; end if;
        if baseline.scope_candidate_ids<>scope then raise exception 'comparison scope mismatch'; end if;
      end if;
      select statement_timestamp(),evidence_pipeline.collect_investigation_snapshot(scope) into started,snap;
      delta:=evidence_pipeline.diff_investigation_snapshots(baseline.snapshot,snap);
      insert into evidence_pipeline.investigation_observations(id,previous_observation_id,scope_candidate_ids,observation_started_at,snapshot,changes)
        values(oid,previous,scope,started,snap,delta) returning * into obs;
    end if;
  else raise exception 'unsupported briefing action'; end if;
  return to_jsonb(obs)||jsonb_build_object('publicly_eligible',false,'baseline_initialized',obs.previous_observation_id is null);
end $$;

revoke all on function evidence_pipeline.collect_investigation_snapshot(uuid[]),
  evidence_pipeline.diff_investigation_snapshots(jsonb,jsonb),public.mip_investigation_briefings_v1(text,jsonb) from public,anon,authenticated;
grant execute on function evidence_pipeline.collect_investigation_snapshot(uuid[]),
  evidence_pipeline.diff_investigation_snapshots(jsonb,jsonb),public.mip_investigation_briefings_v1(text,jsonb) to service_role;
commit;
