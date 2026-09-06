-- Private assessments and dependency processing; no semantic model or publication.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create view evidence_pipeline.change_subjects with (security_invoker=true) as
select c.position, 'article:'||a.article_id::text watch_key from evidence_pipeline.evidence_changes c
join evidence_pipeline.article_captures a on a.id=c.capture_id
union all
select c.position,v.record_kind||':'||v.record_key from evidence_pipeline.evidence_changes c
join evidence_pipeline.record_versions v on v.id=c.record_version_id;
revoke all on evidence_pipeline.change_subjects from public,anon,authenticated;
grant select on evidence_pipeline.change_subjects to service_role;

create table evidence_pipeline.assessments (
  id uuid primary key default gen_random_uuid(),
  ordinal bigint generated always as identity unique,
  candidate_id uuid not null references evidence_pipeline.evidence_candidates(id),
  algorithm_key text not null check(length(btrim(algorithm_key)) between 1 and 120),
  algorithm_version text not null check(length(btrim(algorithm_version)) between 1 and 120),
  outcome text not null check(outcome in ('supported','contested','insufficient_evidence','not_supported')),
  rationale text not null check(length(btrim(rationale)) between 1 and 8000),
  remaining_uncertainty text not null check(length(btrim(remaining_uncertainty)) between 1 and 4000),
  extra_positions bigint[] not null default '{}',
  parent_ids uuid[] not null default '{}',
  ancestor_ids uuid[] not null default '{}',
  watch_keys text[] not null,
  context_positions bigint[] not null,
  predecessor_id uuid unique references evidence_pipeline.assessments(id),
  assessed_at timestamptz not null default clock_timestamp(),
  input_fingerprint text not null unique,
  release_state text not null default 'private' check(release_state='private'),
  check(cardinality(context_positions) between 1 and 500),
  check(cardinality(parent_ids)<=8 and cardinality(ancestor_ids)<=128 and cardinality(extra_positions)<=32)
);
create index assessments_watch on evidence_pipeline.assessments using gin(watch_keys);
create index assessments_ancestors on evidence_pipeline.assessments using gin(ancestor_ids);
create index assessments_candidate on evidence_pipeline.assessments(candidate_id,ordinal);

create table evidence_pipeline.assessment_invalidations (
  id bigint generated always as identity primary key,
  assessment_id uuid not null references evidence_pipeline.assessments(id),
  change_position bigint references evidence_pipeline.evidence_changes(position),
  superseding_assessment_id uuid references evidence_pipeline.assessments(id),
  recorded_at timestamptz not null default clock_timestamp(),
  check(num_nonnulls(change_position,superseding_assessment_id)=1)
);
create unique index assessment_invalidation_change on evidence_pipeline.assessment_invalidations(assessment_id,change_position) where change_position is not null;
create unique index assessment_invalidation_supersession on evidence_pipeline.assessment_invalidations(assessment_id,superseding_assessment_id) where superseding_assessment_id is not null;
create index assessment_invalidation_change_lookup on evidence_pipeline.assessment_invalidations(change_position) where change_position is not null;
create index assessment_invalidation_supersession_lookup on evidence_pipeline.assessment_invalidations(superseding_assessment_id) where superseding_assessment_id is not null;

create table evidence_pipeline.dependency_runs (
  job_id uuid primary key references evidence_pipeline.change_jobs(id),
  pages integer not null default 0 check(pages>=0),
  completed_at timestamptz
);

create function evidence_pipeline.assessment_causes(p_id uuid)
returns table(change_position bigint,superseding_assessment_id uuid)
language sql stable security invoker set search_path='' as $$
  select s.position,null::uuid from evidence_pipeline.assessments a
  join evidence_pipeline.change_subjects s on s.watch_key=any(a.watch_keys)
  where a.id=p_id and not (s.position=any(a.context_positions))
  union all
  select null::bigint,n.id from evidence_pipeline.assessments a
  join evidence_pipeline.assessments n on n.predecessor_id=any(a.ancestor_ids)
  where a.id=p_id
$$;

create function evidence_pipeline.assessment_context(p_candidate uuid,p_parents uuid[] default '{}',p_extra bigint[] default '{}') returns jsonb
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

-- Append validates an exact observed context set, not a timestamp/high-water mark.
create function evidence_pipeline.append_assessment(p jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c jsonb; parents uuid[]; extras bigint[]; supplied bigint[]; expected bigint[];
  fp text; old evidence_pipeline.assessments; result uuid; previous uuid;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>64000 then raise exception 'invalid assessment input'; end if;
  if exists(select 1 from jsonb_object_keys(p) k where k not in
    ('candidate_id','algorithm_key','algorithm_version','outcome','rationale','remaining_uncertainty','parents','extra_positions','context_positions','predecessor_id')) then raise exception 'unsupported assessment field'; end if;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}') into parents from jsonb_array_elements_text(coalesce(p->'parents','[]'))x;
  select coalesce(array_agg(distinct x::bigint order by x::bigint),'{}') into extras from jsonb_array_elements_text(coalesce(p->'extra_positions','[]'))x;
  select coalesce(array_agg(distinct x::bigint order by x::bigint),'{}') into supplied from jsonb_array_elements_text(p->'context_positions')x;
  if cardinality(supplied)=0 then raise exception 'observed context required'; end if;
  previous:=(p->>'predecessor_id')::uuid;
  fp:=encode(sha256(convert_to(jsonb_build_object('candidate',p->>'candidate_id','algorithm',p->>'algorithm_key',
    'version',p->>'algorithm_version','context',supplied,'parents',parents,'extras',extras)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('mip-assessment:'||fp,0));
  select * into old from evidence_pipeline.assessments where input_fingerprint=fp;
  if found then
    if old.outcome is distinct from p->>'outcome' or old.rationale is distinct from p->>'rationale'
      or old.remaining_uncertainty is distinct from p->>'remaining_uncertainty' or old.predecessor_id is distinct from previous then raise exception 'assessment idempotency conflict'; end if;
    return old.id; -- Retry returns the historical result even if now stale; read status.
  end if;
  c:=evidence_pipeline.assessment_context((p->>'candidate_id')::uuid,parents,extras);
  select array_agg(x::bigint order by x::bigint) into expected from jsonb_array_elements_text(c->'context_positions')x;
  if supplied is distinct from expected then raise exception 'evidence context changed; refetch and reassess'; end if;
  if previous is not null then
    if not exists(select 1 from evidence_pipeline.assessments where id=previous and candidate_id=(p->>'candidate_id')::uuid and algorithm_key=p->>'algorithm_key')
      then raise exception 'predecessor must belong to same candidate and algorithm'; end if;
    if previous=any(array(select x::uuid from jsonb_array_elements_text(c->'ancestor_ids')x)) then raise exception 'cannot supersede own dependency'; end if;
  end if;
  insert into evidence_pipeline.assessments(candidate_id,algorithm_key,algorithm_version,outcome,rationale,remaining_uncertainty,
    extra_positions,parent_ids,ancestor_ids,watch_keys,context_positions,predecessor_id,input_fingerprint)
  values((p->>'candidate_id')::uuid,p->>'algorithm_key',p->>'algorithm_version',p->>'outcome',p->>'rationale',p->>'remaining_uncertainty',
    extras,parents,array(select x::uuid from jsonb_array_elements_text(c->'ancestor_ids')x),
    array(select x from jsonb_array_elements_text(c->'watch_keys')x),expected,previous,fp) returning id into result;
  return result;
end $$;

create function evidence_pipeline.read_assessment(p_id uuid,p_as_of timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare a evidence_pipeline.assessments; causes jsonb; replacements uuid[];
begin
  select * into a from evidence_pipeline.assessments where id=p_id;
  if not found or (p_as_of is not null and a.assessed_at>p_as_of) then return null; end if;
  if p_as_of is not null then raise exception 'historical freshness requires committed observation snapshots; not implemented'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('change_position',change_position::text,'superseding_assessment_id',superseding_assessment_id)),'[]') into causes from evidence_pipeline.assessment_causes(p_id);
  select coalesce(array_agg(id),'{}') into replacements from evidence_pipeline.assessments where predecessor_id=p_id;
  return to_jsonb(a)||jsonb_build_object('context_positions',a.context_positions::text[],'extra_positions',a.extra_positions::text[],
    'stale',jsonb_array_length(causes)>0,'stale_causes',causes,'superseded_by',replacements,'publicly_eligible',false);
end $$;

-- Performs one bounded dependency page. Source corrections are visible as stale
-- to readers immediately; durable invalidation rows can be filled asynchronously.
create function evidence_pipeline.process_dependency_job(p_id uuid,p_token uuid,p_limit integer default 100) returns jsonb
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
  where a.watch_keys @> array[k] and not (j.change_position=any(a.context_positions))
    and not exists(select 1 from evidence_pipeline.assessment_invalidations i where i.assessment_id=a.id and i.change_position=j.change_position)
  order by a.ordinal limit p_limit on conflict do nothing;
  get diagnostics n=row_count;
  update evidence_pipeline.dependency_runs set pages=pages+1 where job_id=p_id;
  select exists(select 1 from evidence_pipeline.assessments a where a.watch_keys @> array[k]
    and not (j.change_position=any(a.context_positions)) and not exists(select 1 from evidence_pipeline.assessment_invalidations i
    where i.assessment_id=a.id and i.change_position=j.change_position)) into remaining;
  if remaining then return jsonb_build_object('coverage','partial','recorded',n,'job_id',p_id); end if;
  update evidence_pipeline.dependency_runs set completed_at=clock_timestamp() where job_id=p_id;
  receipt:=jsonb_build_object('work_ref','dependency-run:'||p_id::text,'coverage','complete',
    'change_position',j.change_position::text,'meaning','dependency invalidation scan only; no semantic reassessment or new-pair search');
  perform evidence_pipeline.finish_change_job(p_id,p_token,receipt);
  return receipt;
end $$;

-- Reconciliation pages by assessment ordinal, rescanned from zero periodically.
-- Never treat the cursor as proof that earlier uncommitted assessments are covered.
create function evidence_pipeline.reconcile_assessment_invalidations(p_after bigint default 0,p_limit integer default 100) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a evidence_pipeline.assessments; last_pos bigint:=p_after; n integer:=0; written integer:=0; batch integer;
begin
  if p_after is null or p_after<0 or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid page'; end if;
  for a in select * from evidence_pipeline.assessments where ordinal>p_after order by ordinal limit p_limit loop
    insert into evidence_pipeline.assessment_invalidations(assessment_id,change_position,superseding_assessment_id)
    select a.id,c.change_position,c.superseding_assessment_id from evidence_pipeline.assessment_causes(a.id)c
    where not exists(select 1 from evidence_pipeline.assessment_invalidations i where i.assessment_id=a.id
      and i.change_position is not distinct from c.change_position
      and i.superseding_assessment_id is not distinct from c.superseding_assessment_id)
    limit (100-written) on conflict do nothing;
    get diagnostics batch=row_count; written:=written+batch;
    if exists(select 1 from evidence_pipeline.assessment_causes(a.id)c where not exists(
      select 1 from evidence_pipeline.assessment_invalidations i where i.assessment_id=a.id
      and i.change_position is not distinct from c.change_position
      and i.superseding_assessment_id is not distinct from c.superseding_assessment_id)) then
      return jsonb_build_object('scanned',n,'recorded',written,'next_after',last_pos::text,'has_more',true);
    end if;
    last_pos:=a.ordinal; n:=n+1;
  end loop;
  return jsonb_build_object('scanned',n,'recorded',written,'next_after',last_pos::text,'has_more',exists(select 1 from evidence_pipeline.assessments where ordinal>last_pos));
end $$;

create function public.mip_assessments_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'input must be object'; end if;
  case p_action
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

do $$ declare t text; f record; begin
  foreach t in array array['assessments','assessment_invalidations','dependency_runs'] loop
    execute format('alter table evidence_pipeline.%I enable row level security',t);
    execute format('revoke all on evidence_pipeline.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert on evidence_pipeline.%I to service_role',t);
    execute format('create trigger no_truncate before truncate on evidence_pipeline.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
  end loop;
  foreach t in array array['assessments','assessment_invalidations'] loop
    execute format('create trigger no_rewrite before update or delete on evidence_pipeline.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='evidence_pipeline' and p.proname in ('assessment_causes','assessment_context','append_assessment',
      'read_assessment','process_dependency_job','reconcile_assessment_invalidations') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant update on evidence_pipeline.dependency_runs to service_role;
revoke all on sequence evidence_pipeline.assessments_ordinal_seq,evidence_pipeline.assessment_invalidations_id_seq from public,anon,authenticated;
grant usage,select on sequence evidence_pipeline.assessments_ordinal_seq,evidence_pipeline.assessment_invalidations_id_seq to service_role;
revoke all on function public.mip_assessments_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.mip_assessments_v1(text,jsonb) to service_role;
commit;
