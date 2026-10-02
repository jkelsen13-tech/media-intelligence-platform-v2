-- NONDEPLOYED SOURCE PROPOSAL. Not a migration and not authorized for live apply.
-- Extends the existing assessment/context/invalidation/observation foundation.
-- Selection is a trusted-server declaration, not semantic proof or publication.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table evidence_pipeline.candidate_input_relevance (
  candidate_id uuid not null references evidence_pipeline.evidence_candidates(id),
  change_position bigint not null references evidence_pipeline.evidence_changes(position),
  selection_method text not null check(length(btrim(selection_method)) between 1 and 120),
  selection_ref text not null check(length(btrim(selection_ref)) between 1 and 1000),
  rationale text not null check(length(btrim(rationale)) between 1 and 4000),
  declared_at timestamptz not null default clock_timestamp(),
  primary key(candidate_id,change_position)
);
comment on table evidence_pipeline.candidate_input_relevance is
  'Immutable, private candidate-to-exact-retained-input relevance declarations. A method/reference/rationale is not proof of retrieval quality, support, independent sourcing, or truth. No queue completion or reassessment is implied.';
create index candidate_input_relevance_change on evidence_pipeline.candidate_input_relevance(change_position);
alter table evidence_pipeline.candidate_input_relevance enable row level security;
revoke all on evidence_pipeline.candidate_input_relevance from public,anon,authenticated,service_role;
grant select,insert on evidence_pipeline.candidate_input_relevance to service_role;
create trigger no_rewrite before update or delete on evidence_pipeline.candidate_input_relevance
for each row execute function evidence_pipeline.reject_history_mutation();
create trigger no_truncate before truncate on evidence_pipeline.candidate_input_relevance
for each statement execute function evidence_pipeline.reject_history_mutation();

-- Derive subjects through canonical candidates and exact retained positions.
-- Frozen descendant watches also inherit later relevance of ancestor candidates.
create function evidence_pipeline.assessment_relevance_keys(p_candidate uuid,p_ancestors uuid[] default '{}')
returns table(watch_key text)
language sql stable security invoker set search_path='' as $$
  select distinct s.watch_key from evidence_pipeline.candidate_input_relevance r
  join evidence_pipeline.change_subjects s on s.position=r.change_position
  where r.candidate_id=p_candidate or exists (
    select 1 from evidence_pipeline.assessments a where a.id=any(p_ancestors) and a.candidate_id=r.candidate_id)
$$;

-- Additive action in the existing RPC. Exact duplicate declarations retry safely;
-- changed wording for the same candidate/input is a conflict, never an overwrite.
create function evidence_pipeline.declare_candidate_input_relevance(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cid uuid; pos bigint; prior evidence_pipeline.candidate_input_relevance;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>16384 then raise exception 'invalid relevance declaration'; end if;
  if exists(select 1 from jsonb_object_keys(p) k where k not in
    ('candidate_id','position','selection_method','selection_ref','rationale')) then raise exception 'unsupported relevance field'; end if;
  if jsonb_typeof(p->'candidate_id') is distinct from 'string'
    or jsonb_typeof(p->'position') is distinct from 'string'
    or (p->>'position') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p->'selection_method') is distinct from 'string'
    or length(btrim(p->>'selection_method')) not between 1 and 120
    or jsonb_typeof(p->'selection_ref') is distinct from 'string'
    or length(btrim(p->>'selection_ref')) not between 1 and 1000
    or jsonb_typeof(p->'rationale') is distinct from 'string'
    or length(btrim(p->>'rationale')) not between 1 and 4000 then raise exception 'invalid relevance declaration'; end if;
  cid:=(p->>'candidate_id')::uuid; pos:=(p->>'position')::bigint;
  if not exists(select 1 from evidence_pipeline.evidence_candidates where id=cid) then raise exception 'unknown candidate'; end if;
  if exists(select 1 from evidence_pipeline.evidence_candidates where id=cid and candidate_kind='geography') then
    raise exception 'geography requires spatial revision notifications; unsupported in this slice'; end if;
  if not exists(select 1 from evidence_pipeline.change_subjects where position=pos) then raise exception 'unknown retained input'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mip-relevance:'||cid::text||':'||pos::text,0));
  select * into prior from evidence_pipeline.candidate_input_relevance where candidate_id=cid and change_position=pos;
  if found then
    if prior.selection_method is distinct from p->>'selection_method'
      or prior.selection_ref is distinct from p->>'selection_ref'
      or prior.rationale is distinct from p->>'rationale' then raise exception 'relevance idempotency conflict'; end if;
  else
    insert into evidence_pipeline.candidate_input_relevance(candidate_id,change_position,selection_method,selection_ref,rationale)
      values(cid,pos,p->>'selection_method',p->>'selection_ref',p->>'rationale') returning * into prior;
  end if;
  return to_jsonb(prior)||jsonb_build_object('change_position',prior.change_position::text,
    'meaning','relevance declared; no semantic reassessment or search completion','publicly_eligible',false);
end $$;

create or replace function evidence_pipeline.assessment_causes(p_id uuid)
returns table(change_position bigint,superseding_assessment_id uuid)
language sql stable security invoker set search_path='' as $$
  select s.position,null::uuid from evidence_pipeline.assessments a
  join evidence_pipeline.change_subjects s on s.watch_key=any(a.watch_keys)
    or s.watch_key in (select k.watch_key from evidence_pipeline.assessment_relevance_keys(a.candidate_id,a.ancestor_ids) k)
  where a.id=p_id and not (s.position=any(a.context_positions))
  union
  select null::bigint,n.id from evidence_pipeline.assessments a
  join evidence_pipeline.assessments n on n.predecessor_id=any(a.ancestor_ids)
  where a.id=p_id
$$;

revoke all on function evidence_pipeline.assessment_relevance_keys(uuid,uuid[]),evidence_pipeline.declare_candidate_input_relevance(jsonb) from public,anon,authenticated;
grant execute on function evidence_pipeline.assessment_relevance_keys(uuid,uuid[]),evidence_pipeline.declare_candidate_input_relevance(jsonb) to service_role;


-- Existing context: include declared relevant subjects; inherited parent checks stay authoritative.
create or replace function evidence_pipeline.assessment_context(p_candidate uuid,p_parents uuid[] default '{}',p_extra bigint[] default '{}') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c evidence_pipeline.evidence_candidates; keys text[]; positions bigint[]; ancestors uuid[]; parent uuid;
begin
  if p_parents is null or p_extra is null or cardinality(p_parents)>8 or cardinality(p_extra)>32
    or array_position(p_parents,null) is not null or array_position(p_extra,null) is not null then raise exception 'invalid dependency list'; end if;
  select * into c from evidence_pipeline.evidence_candidates where id=p_candidate;
  if not found then raise exception 'unknown candidate'; end if;
  if c.candidate_kind='geography' then raise exception 'geography requires spatial revision notifications; unsupported in this slice'; end if;
  select array['article:'||a.article_id::text] into keys from evidence_pipeline.article_captures a where a.id=c.capture_id;
  if c.event_node_id is not null then keys:=array_append(keys,'graph_node:'||c.event_node_id::text); end if;
  if c.related_node_id is not null then keys:=array_append(keys,'graph_node:'||c.related_node_id::text); end if;
  ancestors:='{}';
  foreach parent in array p_parents loop
    if not exists(select 1 from evidence_pipeline.assessments where id=parent) then raise exception 'unknown parent assessment'; end if;
    if exists(select 1 from evidence_pipeline.assessment_causes(parent))
      or exists(select 1 from evidence_pipeline.assessments where predecessor_id=parent) then raise exception 'stale or superseded parent'; end if;
    select keys||a.watch_keys,ancestors||array[parent]||a.ancestor_ids into keys,ancestors from evidence_pipeline.assessments a where a.id=parent;
  end loop;
  if exists(select 1 from unnest(p_extra) x where not exists(select 1 from evidence_pipeline.change_subjects s where s.position=x)) then raise exception 'unknown extra input'; end if;
  keys:=keys||array(select watch_key from evidence_pipeline.change_subjects where position=any(p_extra));
  keys:=keys||array(select k.watch_key from evidence_pipeline.assessment_relevance_keys(p_candidate) k);
  select array_agg(distinct k order by k) into keys from unnest(keys) k;
  select coalesce(array_agg(distinct x order by x),'{}') into ancestors from unnest(ancestors) x;
  if cardinality(ancestors)>128 then raise exception 'dependency ancestry budget exceeded'; end if;
  if exists(select 1 from unnest(keys) k where not exists(select 1 from evidence_pipeline.change_subjects s where s.watch_key=k)) then raise exception 'watched identity lacks retained history'; end if;
  select array_agg(position order by position) into positions from
    (select position from evidence_pipeline.change_subjects where watch_key=any(keys) order by position limit 501)s;
  if cardinality(positions)>500 then raise exception 'context budget exceeded; partition work explicitly'; end if;
  return jsonb_build_object('candidate',to_jsonb(c),'watch_keys',keys,'context_positions',positions::text[],
    'ancestor_ids',ancestors,'parents',p_parents,'extra_positions',p_extra::text[]);
end $$;


-- Existing bounded dependency worker: match the same authoritative causes as read/reconcile.
create or replace function evidence_pipeline.process_dependency_job(p_id uuid,p_token uuid,p_limit integer default 100) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j evidence_pipeline.change_jobs; k text; n integer; remaining boolean; receipt jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'limit must be 1..100'; end if;
  select * into j from evidence_pipeline.change_jobs where id=p_id for update;
  if not found or j.route<>'dependency_lookup' then raise exception 'dependency job required'; end if;
  if j.state='completed' then
    select detail into receipt from evidence_pipeline.change_job_events where job_id=p_id and event='completed' and lease_token=p_token;
    if found and receipt->>'work_ref'='dependency-run:'||p_id::text then return receipt; end if;
    raise exception 'completion receipt conflict';
  end if;
  if j.state<>'processing' or p_token is null or j.lease_token is distinct from p_token or j.lease_expires_at<=clock_timestamp() then raise exception 'invalid or expired lease'; end if;
  select watch_key into k from evidence_pipeline.change_subjects where position=j.change_position;
  if k is null then raise exception 'change subject missing'; end if;
  insert into evidence_pipeline.dependency_runs(job_id) values(p_id) on conflict do nothing;
  insert into evidence_pipeline.assessment_invalidations(assessment_id,change_position)
  select a.id,j.change_position from evidence_pipeline.assessments a
  where exists(select 1 from evidence_pipeline.assessment_causes(a.id) c where c.change_position=j.change_position)
    and not exists(select 1 from evidence_pipeline.assessment_invalidations i where i.assessment_id=a.id and i.change_position=j.change_position)
  order by a.ordinal limit p_limit on conflict do nothing;
  get diagnostics n=row_count;
  update evidence_pipeline.dependency_runs set pages=pages+1 where job_id=p_id;
  select exists(select 1 from evidence_pipeline.assessments a where exists(select 1 from evidence_pipeline.assessment_causes(a.id) c where c.change_position=j.change_position) and not exists(select 1 from evidence_pipeline.assessment_invalidations i
    where i.assessment_id=a.id and i.change_position=j.change_position)) into remaining;
  if remaining then return jsonb_build_object('coverage','partial','recorded',n,'job_id',p_id); end if;
  update evidence_pipeline.dependency_runs set completed_at=clock_timestamp() where job_id=p_id;
  receipt:=jsonb_build_object('work_ref','dependency-run:'||p_id::text,'coverage','complete',
    'change_position',j.change_position::text,'meaning','dependency invalidation scan only; no semantic reassessment or new-pair search');
  perform evidence_pipeline.finish_change_job(p_id,p_token,receipt);
  return receipt;
end $$;


-- Existing observation collector: retain exact newly relevant inputs with their stale causes.
create or replace function evidence_pipeline.collect_investigation_snapshot(p_scope uuid[]) returns jsonb
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
    union select k.watch_key from unnest(cids) cid cross join lateral evidence_pipeline.assessment_relevance_keys(cid) k
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
    'watch_keys',keys,'coverage','complete_for_explicit_scope','publicly_eligible',false,
    'relevance_declarations',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('change_position',r.change_position::text)
      order by r.candidate_id,r.change_position),'[]') from evidence_pipeline.candidate_input_relevance r where r.candidate_id=any(cids)));
  if octet_length(result::text)>4194304 then raise exception 'snapshot exceeds 4 MiB; narrow scope'; end if;
  return result;
end $$;


-- Additive declaration provenance over saved snapshots. No source arrival,
-- reassessment, truth judgment or public eligibility is implied by this event.
create function evidence_pipeline.diff_relevance_declarations(p_before jsonb,p_after jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare previous jsonb:=coalesce(p_before->'relevance_declarations','[]');
  current_rows jsonb:=coalesce(p_after->'relevance_declarations','[]'); rows jsonb; snapshot jsonb; row_value jsonb; prior jsonb;
  result jsonb:='[]';
begin
  if p_before is null then return result; end if;
  if p_before->'scope_candidate_ids' is distinct from p_after->'scope_candidate_ids' then raise exception 'comparison scope mismatch';end if;
  foreach snapshot in array array[p_before,p_after] loop
    rows:=coalesce(snapshot->'relevance_declarations','[]');
    if jsonb_typeof(snapshot->'scope_candidate_ids') is distinct from 'array' or jsonb_typeof(snapshot->'inputs') is distinct from 'array'
      or jsonb_typeof(snapshot->'candidates') is distinct from 'array' or jsonb_typeof(snapshot->'assessments') is distinct from 'array' then
      raise exception 'invalid retained relevance snapshot';end if;
    -- The collector retains selected candidates plus assessment-closure candidates.
    -- Keep that native closure authoritative; a direct-scope-only guard rejects
    -- legitimate ancestor declarations. Every selected/assessment candidate must
    -- still be retained, and unrelated fabricated closure entries are refused.
    if exists(select 1 from jsonb_array_elements(snapshot->'candidates') c
      where jsonb_typeof(c)<>'object' or jsonb_typeof(c->'id') is distinct from 'string'
      or (c->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      or exists(select 1 from jsonb_array_elements(snapshot->'candidates') c group by c->>'id' having count(*)>1)
      or exists(select 1 from jsonb_array_elements_text(snapshot->'scope_candidate_ids') cid
        where not exists(select 1 from jsonb_array_elements(snapshot->'candidates') c where c->>'id'=cid))
      or exists(select 1 from jsonb_array_elements(snapshot->'assessments') a
        where not exists(select 1 from jsonb_array_elements(snapshot->'candidates') c where c->>'id'=a->>'candidate_id'))
      or exists(select 1 from jsonb_array_elements(snapshot->'candidates') c
        where not(snapshot->'scope_candidate_ids' ? (c->>'id'))
        and not exists(select 1 from jsonb_array_elements(snapshot->'assessments') a where a->>'candidate_id'=c->>'id')) then
      raise exception 'invalid retained relevance snapshot candidate closure';end if;
    if jsonb_typeof(rows)<>'array' then raise exception 'invalid retained relevance declarations';end if;
    if exists(select 1 from jsonb_array_elements(rows) x group by x->>'candidate_id',x->>'change_position' having count(*)>1) then
      raise exception 'duplicate retained relevance identity';end if;
    for row_value in select value from jsonb_array_elements(rows) loop
      if jsonb_typeof(row_value)<>'object' or (select count(*) from jsonb_object_keys(row_value))<>6
        or jsonb_typeof(row_value->'candidate_id') is distinct from 'string'
        or (row_value->>'candidate_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(row_value->'change_position') is distinct from 'string'
        or (row_value->>'change_position') !~ '^[1-9][0-9]*$'
        or jsonb_typeof(row_value->'selection_method') is distinct from 'string'
        or length(btrim(row_value->>'selection_method')) not between 1 and 120
        or jsonb_typeof(row_value->'selection_ref') is distinct from 'string'
        or length(btrim(row_value->>'selection_ref')) not between 1 and 1000
        or jsonb_typeof(row_value->'rationale') is distinct from 'string'
        or length(btrim(row_value->>'rationale')) not between 1 and 4000
        or jsonb_typeof(row_value->'declared_at') is distinct from 'string'
        or (row_value->>'declared_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
        or not exists(select 1 from jsonb_array_elements(snapshot->'candidates') c where c->>'id'=row_value->>'candidate_id')
        or not exists(select 1 from jsonb_array_elements(snapshot->'inputs') x where x->>'position'=row_value->>'change_position') then
        raise exception 'invalid retained relevance declaration tuple';end if;
      -- Range-check without converting the returned decimal string to JSON numeric.
      perform (row_value->>'change_position')::bigint;
      perform (row_value->>'declared_at')::timestamptz;
    end loop;
  end loop;
  -- The retained table is append-only with this composite primary key. Changed
  -- or disappearing tuples are incompatible snapshots, never replacement events.
  for row_value in select value from jsonb_array_elements(previous) loop
    select value into prior from jsonb_array_elements(current_rows) x
      where x->>'candidate_id'=row_value->>'candidate_id' and x->>'change_position'=row_value->>'change_position';
    -- Timestamptz serialization can change offset with the observing session.
    -- Compare the retained instant; copy the after timestamp string unchanged.
    if prior is null or (prior-'declared_at') is distinct from (row_value-'declared_at')
      or (prior->>'declared_at')::timestamptz is distinct from (row_value->>'declared_at')::timestamptz then
      raise exception 'retained relevance identity changed';end if;
  end loop;
  for row_value in select value from jsonb_array_elements(current_rows) x order by x->>'candidate_id',(x->>'change_position')::bigint loop
    if not exists(select 1 from jsonb_array_elements(previous) x
      where x->>'candidate_id'=row_value->>'candidate_id' and x->>'change_position'=row_value->>'change_position') then
      result:=result||jsonb_build_array(jsonb_build_object('kind','relevant_input_declared','candidate_id',row_value->>'candidate_id',
        'position',row_value->>'change_position','selection_method',row_value->>'selection_method','selection_ref',row_value->>'selection_ref',
        'rationale',row_value->>'rationale','declared_at',row_value->>'declared_at'));
    end if;
  end loop;
  return result;
end $$;
revoke all on function evidence_pipeline.diff_relevance_declarations(jsonb,jsonb) from public,anon,authenticated;
grant execute on function evidence_pipeline.diff_relevance_declarations(jsonb,jsonb) to service_role;

-- Preserve the native event body and append the bounded declaration delta.
create or replace function evidence_pipeline.diff_investigation_snapshots(p_before jsonb,p_after jsonb) returns jsonb
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
  return changes||evidence_pipeline.diff_relevance_declarations(p_before,p_after);
end $$;

-- Existing private RPC: one additive action; historical actions preserved.
create or replace function public.mip_assessments_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'input must be object'; end if;
  case p_action
    when 'declare_relevance' then return evidence_pipeline.declare_candidate_input_relevance(p_input);
    when 'context' then return evidence_pipeline.assessment_context((p_input->>'candidate_id')::uuid,
      array(select x::uuid from jsonb_array_elements_text(coalesce(p_input->'parents','[]'))x),
      array(select x::bigint from jsonb_array_elements_text(coalesce(p_input->'extra_positions','[]'))x));
    when 'input' then
      select jsonb_build_object('position',c.position::text,'capture',to_jsonb(a),'record_version',to_jsonb(v)) into result
      from evidence_pipeline.evidence_changes c
      left join evidence_pipeline.article_captures a on a.id=c.capture_id
      left join evidence_pipeline.record_versions v on v.id=c.record_version_id
      where c.position=(p_input->>'position')::bigint;
      if result is null then raise exception 'unknown input position'; end if;
      return result;
    when 'append' then return to_jsonb(evidence_pipeline.append_assessment(p_input));
    when 'read' then return evidence_pipeline.read_assessment((p_input->>'assessment_id')::uuid,(p_input->>'as_of')::timestamptz);
    when 'process_dependency' then return evidence_pipeline.process_dependency_job((p_input->>'job_id')::uuid,(p_input->>'lease_token')::uuid,coalesce((p_input->>'limit')::integer,100));
    when 'reconcile' then return evidence_pipeline.reconcile_assessment_invalidations(coalesce((p_input->>'after')::bigint,0),coalesce((p_input->>'limit')::integer,100));
    else raise exception 'unsupported assessment action';
  end case;
end $$;

commit;
