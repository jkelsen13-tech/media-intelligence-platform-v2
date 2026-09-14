-- Isolated hypothesis worker data plane. No deployable migration, production method or credentials.
-- Prerequisites: broker/session and operation evidence schemas; hypothesis 001-008.
grant usage on schema mip_identity,comparison_qualification to mip_hypothesis_owner;
grant execute on function mip_identity.current_mapping(text,text),mip_identity.authorize(uuid,text,text),
 comparison_qualification.require_bound_final(text,text,uuid,text),
 comparison_qualification.require_source_scope(text,text),
 comparison_qualification.require_evaluated_implementation(text,text) to mip_hypothesis_owner;
set role mip_hypothesis_owner;
create table mip_hypothesis.method_versions(
 revision uuid primary key, implementation text not null, model_version text not null,
 qualification text not null check(qualification in('synthetic_mechanism_only','owner_authorized_method')),
 authorization_ref text not null check(btrim(authorization_ref)<>''), parameters jsonb not null check(jsonb_typeof(parameters)='object'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table mip_hypothesis.method_heads(
 implementation text primary key, revision uuid not null references mip_hypothesis.method_versions,
 active boolean not null
);
create table mip_hypothesis.generations(
 id uuid primary key, request_id uuid not null unique, author_id uuid not null,
 investigation_id uuid not null, workspace_version_id uuid not null, observation_id uuid not null,
 predecessor_id uuid, runtime text not null, source_project text not null,
 implementation text not null, method_revision uuid not null references mip_hypothesis.method_versions,
 mapping_revision uuid not null, key_revision uuid not null, request_arguments jsonb not null,
 inputs jsonb not null, input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
 closure_bindings jsonb not null, cause_ids uuid[] not null,
 recorded_at timestamptz not null default clock_timestamp(),
 check(octet_length(inputs::text)<=2097152)
);
create table mip_hypothesis.generation_jobs(
 generation_id uuid primary key references mip_hypothesis.generations,
 state text not null check(state in('pending','processing','completed','failed')),
 lease_token_hash text, lease_expires_at timestamptz, claimed_at timestamptz
);
create table mip_hypothesis.generation_requests(
 runtime text not null, operation text not null check(operation in('worker_claim','worker_complete','worker_fail')),
 request_id uuid not null, argument_hash text not null, generation_id uuid references mip_hypothesis.generations,
 result jsonb not null, recorded_at timestamptz not null default clock_timestamp(),
 primary key(operation,request_id)
);
create table mip_hypothesis.generation_outputs(
 generation_id uuid primary key references mip_hypothesis.generations,
 assessment_revision_id uuid not null unique references mip_hypothesis.revisions,
 output_hash text not null, output jsonb not null, receipt jsonb not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create table mip_hypothesis.generation_blocks(
 generation_id uuid primary key references mip_hypothesis.generations,
 reason text not null check(reason='current_authority_or_context_unavailable'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table mip_hypothesis.generation_turns(
 runtime text not null, investigation_id uuid not null, last_claimed_at timestamptz not null,
 primary key(runtime,investigation_id)
);
do $tables$
declare t text;
begin
 foreach t in array array['method_versions','method_heads','generations','generation_jobs','generation_requests','generation_outputs','generation_blocks','generation_turns'] loop
  execute format('alter table mip_hypothesis.%I enable row level security',t);
  execute format('alter table mip_hypothesis.%I force row level security',t);
  execute format('create policy owner_only on mip_hypothesis.%I to mip_hypothesis_owner using(true) with check(true)',t);
  if t not in('method_heads','generation_jobs','generation_turns') then
   execute format('create trigger immutable_rows before update or delete on mip_hypothesis.%I for each row execute function mip_hypothesis.reject_mutation()',t);
   execute format('create trigger immutable_table before truncate on mip_hypothesis.%I for each statement execute function mip_hypothesis.reject_mutation()',t);
  end if;
 end loop;
end $tables$;
create function mip_hypothesis.digest(p_value jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p_value::text,'UTF8')),'hex')
$$;
create function mip_hypothesis.method_current(p_revision uuid,p_implementation text)
returns mip_hypothesis.method_versions language plpgsql security definer set search_path='' as $$
declare m mip_hypothesis.method_versions;
begin
 select v.* into m from mip_hypothesis.method_versions v join mip_hypothesis.method_heads h on h.revision=v.revision
 where v.revision=p_revision and v.implementation=p_implementation and h.implementation=v.implementation and h.active for share of h;
 if not found then raise exception 'mip_hypothesis_method_unavailable';end if;
 return m;
end $$;
-- Shared broker identity fence must always precede publication, membership and question fences.
create function mip_hypothesis.generation_authority(p_runtime text,p_source text,p_implementation text,p_method uuid)
returns mip_identity.mapping_versions language plpgsql security definer set search_path='' as $$
declare m mip_identity.mapping_versions;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'mip_hypothesis_isolation';end if;
 m:=mip_identity.current_mapping(p_runtime,'mip_comparison_worker_v1');
 perform comparison_qualification.require_source_scope(p_runtime,p_source);
 perform comparison_qualification.require_evaluated_implementation(p_runtime,p_implementation);
 perform mip_hypothesis.method_current(p_method,p_implementation);
 return m;
end $$;
create function mip_hypothesis.capture_generation(p_user uuid,p_investigation uuid,p_version uuid,p_source_project text,
 p_request uuid,p_runtime text,p_method uuid,p_spec jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m mip_hypothesis.method_versions; mapping mip_identity.mapping_versions; context jsonb; old mip_hypothesis.generations;
 args jsonb; spans jsonb:='[]'; details jsonb:='[]'; x jsonb; s jsonb; inputs jsonb; closure jsonb; causes uuid[]; gid uuid:=gen_random_uuid(); predecessor uuid;
begin
 select * into strict m from mip_hypothesis.method_versions where revision=p_method;
 mapping:=mip_hypothesis.generation_authority(p_runtime,p_source_project,m.implementation,p_method);
 if p_request is null or jsonb_typeof(p_spec) is distinct from 'object'
  or not p_spec ?& array['hypotheses','hypothesis_relationship','spans']
  or exists(select 1 from jsonb_object_keys(p_spec) k where k not in('hypotheses','hypothesis_relationship','spans'))
  or jsonb_typeof(p_spec->'hypotheses') is distinct from 'array'
  or jsonb_array_length(p_spec->'hypotheses') not between 2 and 64
  or p_spec->>'hypothesis_relationship' is null
  or p_spec->>'hypothesis_relationship' not in('overlapping','mutually_exclusive','not_established')
  or jsonb_typeof(p_spec->'spans') is distinct from 'array' or jsonb_array_length(p_spec->'spans')>256 then
  raise exception 'mip_hypothesis_generation_spec';end if;
 for x in select value from jsonb_array_elements(p_spec->'hypotheses') loop
  if jsonb_typeof(x) is distinct from 'object' or (select count(*) from jsonb_object_keys(x))<>2
   or nullif(btrim(x->>'id'),'') is null or nullif(btrim(x->>'definition'),'') is null
   or jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'definition') is distinct from 'string' then
   raise exception 'mip_hypothesis_generation_spec';end if;
 end loop;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_spec->'hypotheses') x)<>jsonb_array_length(p_spec->'hypotheses') then
  raise exception 'mip_hypothesis_generation_spec';end if;
 context:=mip_hypothesis.authoring_context(p_user,p_investigation,p_version,p_source_project);
 args:=jsonb_build_object('user',p_user,'investigation',p_investigation,'version',p_version,'source',p_source_project,
  'runtime',p_runtime,'method',p_method,'spec',p_spec);
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-generation-request:'||p_request::text,0));
 select * into old from mip_hypothesis.generations where request_id=p_request;
 if found then
  if old.request_arguments is distinct from args then raise exception 'mip_hypothesis_generation_retry_conflict';end if;
  perform mip_hypothesis.require_generation(old,false);
  return jsonb_build_object('generation_id',old.id,'input_hash',old.input_hash,'publication_allowed',false);
 end if;
 select coalesce(array_agg((c->>'cause_id')::uuid order by (c->>'cause_id')::uuid),'{}'::uuid[]) into causes
  from jsonb_array_elements(context->'backlog'->'causes') c where c->>'state'='pending_explicit_reconciliation';
 predecessor:=(context->'head'->>'revision_id')::uuid;
 if predecessor is not null and cardinality(causes)=0 then raise exception 'mip_hypothesis_reassessment_cause_required';end if;
 closure:=mip_hypothesis.validate_reassessment_closure(p_user,p_investigation,p_version,p_source_project,causes);
 -- Synthetic methods cannot process real permission-backed material. No real method is installed by this file.
 if m.qualification='synthetic_mechanism_only' and exists(
  select 1 from jsonb_array_elements(closure) b cross join lateral jsonb_array_elements(b->'permissions') e
  where (mip_identity.operation_check(e->'scope')->'synthetic') is distinct from 'true'::jsonb) then
  raise exception 'mip_hypothesis_synthetic_scope_only';end if;
 for x in select value from jsonb_array_elements(p_spec->'spans') loop
  if jsonb_typeof(x) is distinct from 'object' or not x ?& array['id','input_position','source_field','start','end']
    or exists(select 1 from jsonb_object_keys(x) k where k not in('id','input_position','source_field','start','end'))
    or nullif(btrim(x->>'id'),'') is null or jsonb_typeof(x->'id') is distinct from 'string'
    or jsonb_typeof(x->'input_position') is distinct from 'string' or x->>'input_position' !~ '^[1-9][0-9]*$'
    or jsonb_typeof(x->'start') is distinct from 'number' or jsonb_typeof(x->'end') is distinct from 'number'
    or x->>'start' !~ '^[0-9]+$' or x->>'end' !~ '^[0-9]+$' then raise exception 'mip_hypothesis_generation_span';end if;
  s:=mip_hypothesis.authoring_span(p_user,p_investigation,p_version,p_source_project,x->>'input_position',
   x->>'source_field',(x->>'start')::integer,(x->>'end')::integer);
  spans:=spans||jsonb_build_array(s||jsonb_build_object('id',x->>'id','source_span',
   jsonb_build_object('source_field',x->>'source_field','start',x->'start','end',x->'end','excerpt_sha256',s->'excerpt_sha256')));
 end loop;
 if (select count(distinct x->>'id') from jsonb_array_elements(spans) x)<>jsonb_array_length(spans) then raise exception 'mip_hypothesis_generation_span';end if;
 for x in select value from jsonb_array_elements(context->'backlog'->'causes') c
  where c->>'state'='pending_explicit_reconciliation' and c->>'kind'='human_reconsideration' loop
  s:=mip_hypothesis.read_reassessment_request(p_user,p_investigation,(x->'detail'->>'request_id')::uuid);
  if s->>'status' is distinct from 'available' then raise exception 'mip_hypothesis_reconsideration_unavailable';end if;
  details:=details||jsonb_build_array(s);
 end loop;
 inputs:=jsonb_build_object('cause_details',details,'contract_version','mip_hypothesis_generation_v1','generation_id',gid,
  'context',context,'hypotheses',p_spec->'hypotheses','hypothesis_relationship',p_spec->'hypothesis_relationship',
  'spans',spans,'method',jsonb_build_object('revision',m.revision,'implementation',m.implementation,'model_version',m.model_version,
   'qualification',m.qualification,'authorization_ref',m.authorization_ref,'parameters',m.parameters));
 insert into mip_hypothesis.generations(id,request_id,author_id,investigation_id,workspace_version_id,observation_id,
  predecessor_id,runtime,source_project,implementation,method_revision,mapping_revision,key_revision,request_arguments,inputs,input_hash,closure_bindings,cause_ids)
 values(gid,p_request,p_user,p_investigation,p_version,(context->>'observation_id')::uuid,
  predecessor,p_runtime,p_source_project,m.implementation,m.revision,mapping.revision,mapping.key_revision,args,inputs,mip_hypothesis.digest(inputs),closure,causes);
 insert into mip_hypothesis.generation_jobs values(gid,'pending',null,null,null);
 return jsonb_build_object('generation_id',gid,'input_hash',mip_hypothesis.digest(inputs),'publication_allowed',false);
end $$;
create function mip_hypothesis.require_generation(g mip_hypothesis.generations,p_completed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare mapping mip_identity.mapping_versions; context jsonb; closure jsonb; causes uuid[];
begin
 mapping:=mip_hypothesis.generation_authority(g.runtime,g.source_project,g.implementation,g.method_revision);
 if mapping.revision<>g.mapping_revision or mapping.key_revision<>g.key_revision then raise exception 'mip_hypothesis_generation_identity_changed';end if;
 context:=mip_hypothesis.authoring_context(g.author_id,g.investigation_id,g.workspace_version_id,g.source_project);
 closure:=mip_hypothesis.validate_reassessment_closure(g.author_id,g.investigation_id,g.workspace_version_id,g.source_project,g.cause_ids);
 if closure is distinct from g.closure_bindings then raise exception 'mip_hypothesis_generation_permission_changed';end if;
 if not p_completed then
  select coalesce(array_agg((c->>'cause_id')::uuid order by (c->>'cause_id')::uuid),'{}'::uuid[]) into causes
   from jsonb_array_elements(context->'backlog'->'causes') c where c->>'state'='pending_explicit_reconciliation';
  if (context->'head'->>'revision_id')::uuid is distinct from g.predecessor_id or causes is distinct from g.cause_ids then
   raise exception 'mip_hypothesis_generation_context_changed';end if;
 end if;
end $$;
create function mip_hypothesis.worker_session(p_session uuid,p_runtime text,p_operation text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_comparison_worker_v1');
 perform comparison_qualification.require_bound_final('mip_comparison_worker_v1','hypothesis_'||p_operation,p_session,p_runtime);
end $$;
create function mip_hypothesis.worker_claim(p_request uuid,p_session uuid,p_runtime text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g mip_hypothesis.generations; old mip_hypothesis.generation_requests; token uuid; result jsonb;
begin
 perform mip_hypothesis.worker_session(p_session,p_runtime,'worker_claim');
 if p_request is null then raise exception 'mip_hypothesis_request_required';end if;
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-worker:'||p_runtime,0));
 select * into old from mip_hypothesis.generation_requests where operation='worker_claim' and request_id=p_request;
 if found then
  if old.runtime<>p_runtime then raise exception 'mip_hypothesis_request_owner';end if;
  if old.generation_id is not null then
   select * into strict g from mip_hypothesis.generations where id=old.generation_id;
   perform mip_hypothesis.require_generation(g,(select state='completed' from mip_hypothesis.generation_jobs where generation_id=g.id));
  end if;
  return old.result;
 end if;
 -- Rotating investigation turn; oldest retained generation within a turn. No lease recycling.
 -- A blocked candidate remains retained; it does not obstruct later eligible candidates.
 for g in select gen.* from mip_hypothesis.generations gen join mip_hypothesis.generation_jobs j on j.generation_id=gen.id
  left join mip_hypothesis.generation_turns t on t.runtime=gen.runtime and t.investigation_id=gen.investigation_id
  where gen.runtime=p_runtime and j.state='pending'
  order by t.last_claimed_at nulls first,gen.recorded_at,gen.id for update of j skip locked
 loop
  begin perform mip_hypothesis.require_generation(g,false);
  exception when others then
   if sqlstate not in('P0001','42501','40001','22023','P0002') then raise;end if;
   insert into mip_hypothesis.generation_blocks values(g.id,'current_authority_or_context_unavailable',clock_timestamp()) on conflict do nothing;
   continue;
  end;
  token:=gen_random_uuid();
  update mip_hypothesis.generation_jobs set state='processing',lease_token_hash=encode(sha256(convert_to(token::text,'UTF8')),'hex'),
   lease_expires_at=clock_timestamp()+interval '2 minutes',claimed_at=clock_timestamp() where generation_id=g.id;
  insert into mip_hypothesis.generation_turns values(p_runtime,g.investigation_id,clock_timestamp())
   on conflict(runtime,investigation_id) do update set last_claimed_at=excluded.last_claimed_at;
  insert into mip_hypothesis.generation_requests values(p_runtime,'worker_claim',p_request,mip_hypothesis.digest(jsonb_build_object('runtime',p_runtime)),g.id,
   jsonb_build_object('generation_id',g.id),clock_timestamp());
  perform mip_hypothesis.worker_session(p_session,p_runtime,'worker_claim');
  return jsonb_build_object('generation_id',g.id,'lease_token',token,'input_hash',g.input_hash,'input_text',g.inputs::text,
   'implementation_ref',g.implementation,'method_revision',g.method_revision,'publication_allowed',false);
 end loop;
 insert into mip_hypothesis.generation_requests values(p_runtime,'worker_claim',p_request,mip_hypothesis.digest(jsonb_build_object('runtime',p_runtime)),null,'null',clock_timestamp());
 return null;
end $$;
-- Database structural validation is independent of the worker's JS validator.
create function mip_hypothesis.worker_rating(r jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(r)='object' and r->>'kind'='not_estimated' and jsonb_typeof(r->'reason')='string'
 and btrim(r->>'reason')<>'' and (r-'kind'-'reason')='{}'::jsonb,false)
$$;
create function mip_hypothesis.validate_worker_output(g mip_hypothesis.generations,a jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare x jsonb; s jsonb; c jsonb:=a->'comparison'; hids text[]; eids text[]; n integer; head jsonb:=g.inputs->'context'->'head';
begin
 if jsonb_typeof(a) is distinct from 'object' or octet_length(a::text)>2097152 or not a ?& array['id','contract_version','question_id','question','method_version','model_version',
  'revision','predecessor_id','knowledge_cutoff','completed_at','release_state','review_state','hypotheses','hypothesis_relationship','evidence',
  'arguments','comparison','assumptions','gaps','change_tests','revision_reason','revision_trigger','revision_effect']
  or exists(select 1 from jsonb_object_keys(a) k where k not in('id','contract_version','question_id','question','method_version','model_version',
  'revision','predecessor_id','knowledge_cutoff','completed_at','release_state','review_state','hypotheses','hypothesis_relationship','evidence',
  'arguments','comparison','assumptions','gaps','change_tests','revision_reason','revision_trigger','revision_effect','reassessment_causes'))
  or a->>'contract_version' is distinct from 'mip_hypothesis_assessment_v1'
  or a->>'question_id' is distinct from g.investigation_id::text
  or a->>'question' is distinct from g.inputs->'context'->>'question'
  or a->>'method_version' is distinct from g.implementation or a->>'model_version' is distinct from g.inputs->'method'->>'model_version'
  or a->>'release_state' is distinct from 'private' or a->>'review_state' is distinct from 'unreviewed'
  or a->>'knowledge_cutoff' is distinct from g.inputs->'context'->>'knowledge_cutoff'
  or a->>'predecessor_id' is distinct from g.predecessor_id::text
  or a->>'revision' is distinct from (coalesce((head->>'revision')::integer,0)+1)::text
  or a->>'hypothesis_relationship' is distinct from g.inputs->>'hypothesis_relationship'
  or jsonb_typeof(a->'hypotheses') is distinct from 'array' or jsonb_typeof(a->'evidence') is distinct from 'array'
  or jsonb_typeof(a->'arguments') is distinct from 'array' then raise exception 'mip_hypothesis_output_binding';end if;
 if (select coalesce(jsonb_agg(x-'likelihood'-'confidence'),'[]'::jsonb) from jsonb_array_elements(a->'hypotheses') x)
   is distinct from g.inputs->'hypotheses' then raise exception 'mip_hypothesis_output_hypotheses';end if;
 for x in select value from jsonb_array_elements(a->'hypotheses') loop
  if not mip_hypothesis.worker_rating(x->'likelihood') or not mip_hypothesis.worker_rating(x->'confidence') then raise exception 'mip_hypothesis_estimation_not_qualified';end if;
 end loop;
 select array_agg(x->>'id') into hids from jsonb_array_elements(a->'hypotheses') x;
 if jsonb_array_length(a->'evidence')<>jsonb_array_length(g.inputs->'spans') then raise exception 'mip_hypothesis_output_evidence';end if;
 for x in select value from jsonb_array_elements(a->'evidence') loop
  select value into s from jsonb_array_elements(g.inputs->'spans') z where z->>'id'=x->>'id';
  if not found or jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'input_position') is distinct from 'string' or x->>'input_position' is distinct from s->>'input_position' or x->>'material_version' is distinct from s->>'material_version'
   or x->'source_span' is distinct from s->'source_span' or x->'acquired_at' is distinct from s->'acquired_at'
   or x->'published_at' is distinct from s->'published_at' or x->'event_time' is distinct from s->'event_time'
   or x->'origin_group' is distinct from 'null'::jsonb or jsonb_typeof(x->'documented_claim') is distinct from 'string'
   or nullif(btrim(x->>'documented_claim'),'') is null or not mip_hypothesis.worker_rating(x->'quality')
   or exists(select 1 from jsonb_object_keys(x) k where k not in('id','input_position','material_version','source_span','acquired_at','published_at','event_time','origin_group','documented_claim','quality'))
   then raise exception 'mip_hypothesis_output_evidence';end if;
 end loop;
 select array_agg(x->>'id'),count(distinct x->>'id') into eids,n from jsonb_array_elements(a->'evidence') x;
 if n<>jsonb_array_length(a->'evidence') then raise exception 'mip_hypothesis_output_evidence';end if;
 for x in select value from jsonb_array_elements(a->'arguments') loop
  if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'hypothesis_id') is distinct from 'string' or nullif(btrim(x->>'id'),'') is null
   or (x->>'hypothesis_id'=any(hids)) is distinct from true
   or x->>'relation' is null or x->>'relation' not in('reports_allegation','supports','weakens','compatible','context')
   or jsonb_typeof(x->'evidence_ids') is distinct from 'array' or jsonb_array_length(x->'evidence_ids')=0
   or exists(select 1 from jsonb_array_elements(x->'evidence_ids') e where jsonb_typeof(e)<>'string')
   or exists(select 1 from jsonb_array_elements_text(x->'evidence_ids') e where (e=any(eids)) is distinct from true)
   or (select count(distinct e) from jsonb_array_elements_text(x->'evidence_ids') e)<>jsonb_array_length(x->'evidence_ids')
   or jsonb_typeof(x->'inference') is distinct from 'string' or nullif(btrim(x->>'inference'),'') is null
   or jsonb_typeof(x->'limitation') is distinct from 'string' or nullif(btrim(x->>'limitation'),'') is null
   or not mip_hypothesis.worker_rating(x->'relevance')
   or exists(select 1 from jsonb_object_keys(x) k where k not in('id','hypothesis_id','relation','evidence_ids','inference','limitation','relevance'))
  then raise exception 'mip_hypothesis_output_argument';end if;
 end loop;
 if (select count(distinct x->>'id') from jsonb_array_elements(a->'arguments') x)<>jsonb_array_length(a->'arguments') then raise exception 'mip_hypothesis_output_argument';end if;
 if jsonb_typeof(c) is distinct from 'object' or c->>'state' is null or c->>'state' not in('better_supported','difficult_to_distinguish','insufficient_to_rank')
  or jsonb_typeof(c->'rationale') is distinct from 'string' or nullif(btrim(c->>'rationale'),'') is null
  or jsonb_typeof(c->'main_limitation') is distinct from 'string' or nullif(btrim(c->>'main_limitation'),'') is null
  or not mip_hypothesis.worker_rating(c->'confidence') or jsonb_typeof(c->'favored_ids') is distinct from 'array'
  or exists(select 1 from jsonb_array_elements(c->'favored_ids') e where jsonb_typeof(e)<>'string')
  or exists(select 1 from jsonb_array_elements_text(c->'favored_ids') e where (e=any(hids)) is distinct from true)
  or (select count(distinct e) from jsonb_array_elements_text(c->'favored_ids') e)<>jsonb_array_length(c->'favored_ids')
  or (case when c->>'state'='better_supported' then jsonb_array_length(c->'favored_ids') not between 1 and cardinality(hids)-1
       else jsonb_array_length(c->'favored_ids')<>0 end)
  or exists(select 1 from jsonb_object_keys(c) k where k not in('state','rationale','main_limitation','confidence','favored_ids'))
 then raise exception 'mip_hypothesis_output_comparison';end if;
 for s in select a->k from unnest(array['assumptions','gaps','change_tests']) k loop
  if jsonb_typeof(s) is distinct from 'array' or exists(select 1 from jsonb_array_elements(s) x where jsonb_typeof(x)<>'string' or btrim(x#>>'{}')='') then raise exception 'mip_hypothesis_output_reasoning';end if;
 end loop;
 if jsonb_typeof(a->'revision_reason') is distinct from 'string' or nullif(btrim(a->>'revision_reason'),'') is null
  or a->>'revision_trigger' is null or a->>'revision_effect' is null
  or (case when g.predecessor_id is null then a->>'revision_trigger'<>'initial' or a->>'revision_effect'<>'initial' or a ? 'reassessment_causes'
   else a->>'revision_trigger' not in('new_evidence','correction','withdrawal','contradiction','shared_origin','methodology')
    or a->>'revision_effect' not in('changed','unchanged','less_certain') end) then raise exception 'mip_hypothesis_output_revision';end if;
end $$;
create function mip_hypothesis.worker_complete(p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,
 p_input_hash text,p_implementation text,p_output jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g mip_hypothesis.generations; j mip_hypothesis.generation_jobs; old mip_hypothesis.generation_requests;
 args text; result jsonb;
begin
 perform mip_hypothesis.worker_session(p_session,p_runtime,'worker_complete');
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-worker:'||p_runtime,0));
 select * into strict g from mip_hypothesis.generations where id=p_generation and runtime=p_runtime;
 select * into strict j from mip_hypothesis.generation_jobs where generation_id=p_generation for update;
 perform mip_hypothesis.require_generation(g,j.state='completed');
 if p_request is null or p_token is null or p_input_hash is distinct from g.input_hash or p_implementation is distinct from g.implementation
  or j.lease_token_hash is distinct from encode(sha256(convert_to(p_token::text,'UTF8')),'hex') then raise exception 'mip_hypothesis_completion_binding';end if;
 args:=mip_hypothesis.digest(jsonb_build_object('generation',p_generation,'token_hash',j.lease_token_hash,'input_hash',p_input_hash,
  'implementation',p_implementation,'output',p_output));
 select * into old from mip_hypothesis.generation_requests where operation='worker_complete' and request_id=p_request;
 if found then
  if old.runtime<>p_runtime or old.argument_hash<>args then raise exception 'mip_hypothesis_generation_retry_conflict';end if;
  return old.result;
 end if;
 if j.state<>'processing' or j.lease_expires_at<=clock_timestamp() then raise exception 'mip_hypothesis_lease_unavailable';end if;
 perform mip_hypothesis.validate_worker_output(g,p_output);
 if g.predecessor_id is null then
  result:=mip_hypothesis.append_bound_revision(g.author_id,g.investigation_id,g.workspace_version_id,g.source_project,p_generation,null,p_output);
 else
  result:=mip_hypothesis.complete_reassessment(g.author_id,g.investigation_id,g.workspace_version_id,g.source_project,p_generation,g.predecessor_id,p_output);
 end if;
 perform mip_hypothesis.worker_session(p_session,p_runtime,'worker_complete');
 insert into mip_hypothesis.generation_outputs values(g.id,(result->'assessment'->>'id')::uuid,mip_hypothesis.digest(p_output),p_output,result,clock_timestamp());
 update mip_hypothesis.generation_jobs set state='completed' where generation_id=g.id;
 -- No output text in the worker acknowledgement. The private history reader controls access.
 result:=jsonb_build_object('state','completed','generation_id',g.id,'revision_id',result->'assessment'->>'id',
  'output_hash',mip_hypothesis.digest(p_output),'publication_allowed',false);
 insert into mip_hypothesis.generation_requests values(p_runtime,'worker_complete',p_request,args,g.id,result,clock_timestamp());
 return result;
end $$;
create function mip_hypothesis.worker_fail(p_request uuid,p_session uuid,p_runtime text,p_generation uuid,p_token uuid,
 p_input_hash text,p_implementation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g mip_hypothesis.generations; j mip_hypothesis.generation_jobs; old mip_hypothesis.generation_requests; args text; result jsonb;
begin
 perform mip_hypothesis.worker_session(p_session,p_runtime,'worker_fail');
 perform pg_advisory_xact_lock(hashtextextended('mip-hypothesis-worker:'||p_runtime,0));
 select * into strict g from mip_hypothesis.generations where id=p_generation and runtime=p_runtime;
 select * into strict j from mip_hypothesis.generation_jobs where generation_id=p_generation for update;
 perform mip_hypothesis.require_generation(g,false);
 if p_request is null or p_token is null or p_input_hash is distinct from g.input_hash or p_implementation is distinct from g.implementation
  or j.lease_token_hash is distinct from encode(sha256(convert_to(p_token::text,'UTF8')),'hex') then raise exception 'mip_hypothesis_completion_binding';end if;
 args:=mip_hypothesis.digest(jsonb_build_object('generation',p_generation,'token_hash',j.lease_token_hash,'input_hash',p_input_hash,'implementation',p_implementation));
 select * into old from mip_hypothesis.generation_requests where operation='worker_fail' and request_id=p_request;
 if found then
  if old.runtime<>p_runtime or old.argument_hash<>args then raise exception 'mip_hypothesis_generation_retry_conflict';end if;
  return old.result;
 end if;
 if j.state<>'processing' or j.lease_expires_at<=clock_timestamp() then raise exception 'mip_hypothesis_lease_unavailable';end if;
 update mip_hypothesis.generation_jobs set state='failed' where generation_id=g.id;
 result:=jsonb_build_object('state','failed','generation_id',g.id,'retained_for_reconciliation',true);
 insert into mip_hypothesis.generation_requests values(p_runtime,'worker_fail',p_request,args,g.id,result,clock_timestamp());
 return result;
end $$;

-- Saved generated reasoning depends on the full captured closure, including undisplayed inputs.
alter function mip_hypothesis.read_bound_history(uuid,uuid) rename to read_bound_history_pre_worker;
revoke execute on function mip_hypothesis.read_bound_history_pre_worker(uuid,uuid) from mip_hypothesis_gateway;
create function mip_hypothesis.read_bound_history(p_user uuid,p_investigation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; entries jsonb:='[]'; e jsonb; g mip_hypothesis.generations; b jsonb; p jsonb; current_receipts jsonb; allowed boolean;
begin
 result:=mip_hypothesis.read_bound_history_pre_worker(p_user,p_investigation);
 for e in select value from jsonb_array_elements(result->'entries') loop
  select gen.* into g from mip_hypothesis.generations gen join mip_hypothesis.generation_outputs o on o.generation_id=gen.id
   where o.assessment_revision_id=(e->>'revision_id')::uuid;
  if found and e->>'status'='available' then
   allowed:=true;
   begin
    for b in select value from jsonb_array_elements(g.closure_bindings) loop
     current_receipts:=mip_hypothesis.require_observed_operations(p_user,p_investigation,(b->>'workspace_version_id')::uuid,g.source_project,b->>'input_position');
     if current_receipts is distinct from b->'permissions' then allowed:=false;end if;
    end loop;
   exception when insufficient_privilege or invalid_parameter_value or no_data_found then allowed:=false;
   end;
   if not allowed then
    e:=(e-'assessment'-'current_context'-'reassessment_pending')||jsonb_build_object('status','withheld','reason','permission_binding_changed_fresh_review_required');
   elsif not exists(select 1 from mip_hypothesis.method_heads h where h.implementation=g.implementation and h.revision=g.method_revision and h.active) then
    e:=e||jsonb_build_object('current_context',false,'reassessment_pending',true);
   end if;
  end if;
  entries:=entries||jsonb_build_array(e);
 end loop;
 return result||jsonb_build_object('entries',entries);
end $$;
alter function mip_hypothesis.validate_reassessment_closure(uuid,uuid,uuid,text,uuid[]) rename to validate_reassessment_closure_pre_worker;
create function mip_hypothesis.validate_reassessment_closure(p_user uuid,p_investigation uuid,p_version uuid,p_source_project text,p_causes uuid[])
 returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; b jsonb; checked jsonb;
begin
 result:=mip_hypothesis.validate_reassessment_closure_pre_worker(p_user,p_investigation,p_version,p_source_project,p_causes);
 for b in select distinct j.value from mip_hypothesis.reassessment_causes c
  join mip_hypothesis.generation_outputs o on o.assessment_revision_id=c.revision_id
  join mip_hypothesis.generations g on g.id=o.generation_id cross join lateral jsonb_array_elements(g.closure_bindings) j
  where c.id=any(p_causes) and c.investigation_id=p_investigation loop
  checked:=mip_hypothesis.require_observed_operations(p_user,p_investigation,(b->>'workspace_version_id')::uuid,p_source_project,b->>'input_position');
  result:=result||jsonb_build_array(b||jsonb_build_object('permissions',checked));
 end loop;
 select coalesce(jsonb_agg(u.v order by u.v::text),'[]'::jsonb) into result from (select distinct value v from jsonb_array_elements(result)) u;
 return result;
end $$;
alter function mip_hypothesis.discover_reassessment_causes(uuid) rename to discover_reassessment_causes_pre_worker;
create function mip_hypothesis.discover_reassessment_causes(p_investigation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g mip_hypothesis.generations; rid uuid; b jsonb; p jsonb; checked jsonb; reason text; key text;
begin
 perform mip_hypothesis.discover_reassessment_causes_pre_worker(p_investigation);
 select id into rid from mip_hypothesis.revisions where investigation_id=p_investigation order by revision desc limit 1;
 select gen.* into g from mip_hypothesis.generations gen join mip_hypothesis.generation_outputs o on o.generation_id=gen.id where o.assessment_revision_id=rid;
 if not found then return;end if;
 for b in select value from jsonb_array_elements(g.closure_bindings) loop
 for p in select value from jsonb_array_elements(b->'permissions') loop
  checked:=mip_identity.operation_check(p->'scope');
  reason:=case when checked->'allowed' is distinct from 'true'::jsonb then 'current_permission_denied'
   when checked->'revision' is distinct from p->'revision' or coalesce(checked->'admission_revision','null'::jsonb) is distinct from coalesce(p->'admission_revision','null'::jsonb)
   then 'permission_binding_changed' else null end;
  if reason is not null then
   key:='permission:'||encode(sha256(convert_to((p->'scope')::text,'UTF8')),'hex')||':'||coalesce(checked->>'revision','missing')||':'||reason;
   insert into mip_hypothesis.reassessment_causes(investigation_id,revision_id,cause_key,kind,detail)
    values(p_investigation,rid,key,'permission_changed',jsonb_build_object('input_position',b->>'input_position',
    'bound_workspace_version',b->>'workspace_version_id','operation',p->>'operation','domain',p->>'domain',
    'accepted_permission_revision',p->'revision','observed_permission_revision',checked->'revision','reason',reason))
    on conflict(revision_id,cause_key) do nothing;
  end if;
 end loop;end loop;
end $$;
create function mip_hypothesis.generation_permission_change() returns trigger language plpgsql security definer set search_path='' as $$
declare iid uuid; s jsonb;
begin
 for s in select distinct v from (values(case when tg_op<>'INSERT' then old.scope end),(case when tg_op<>'DELETE' then new.scope end)) x(v) where v is not null loop
  for iid in select distinct g.investigation_id from mip_hypothesis.generations g join mip_hypothesis.generation_outputs o on o.generation_id=g.id
   where exists(select 1 from jsonb_array_elements(g.closure_bindings) b cross join lateral jsonb_array_elements(b->'permissions') p where p->'scope'=s)
  loop perform mip_hypothesis.discover_reassessment_causes(iid);end loop;
 end loop;
 return null;
end $$;
grant execute on function mip_hypothesis.read_bound_history(uuid,uuid) to mip_hypothesis_gateway;

revoke all on all functions in schema mip_hypothesis from public;
revoke all on all tables in schema mip_hypothesis from public;
grant usage on schema mip_hypothesis to mip_comparison_worker_v1;
grant execute on function mip_hypothesis.capture_generation(uuid,uuid,uuid,text,uuid,text,uuid,jsonb) to mip_hypothesis_gateway;
grant execute on function mip_hypothesis.worker_claim(uuid,uuid,text),
 mip_hypothesis.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb),
 mip_hypothesis.worker_fail(uuid,uuid,text,uuid,uuid,text,text) to mip_comparison_worker_v1;
reset role;
-- No head/method write grants to reviewer, gateway, broker or worker.
create trigger a_identity_fence before insert or update or delete or truncate on mip_hypothesis.method_heads
 for each statement execute function mip_identity.serialize_change();
create trigger b_publication_fence before insert or update or delete or truncate on mip_hypothesis.method_heads
 for each statement execute function mip_hypothesis.source_change_fence();
create trigger c_no_revision_reuse before insert or update or delete on mip_hypothesis.method_heads
 for each row execute function mip_identity.guard_revision_reuse();

create trigger hypothesis_generation_permission after insert or update or delete on mip_identity.operation_evidence_heads
 for each row execute function mip_hypothesis.generation_permission_change();
