-- Additive, private, version-bound diagnostics. No evidence or assessment writes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table evidence_pipeline.investigation_evidence_check_reports (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null,
  version_id uuid not null,
  algorithm_version text not null check(algorithm_version='retained-evidence-checks-1'),
  result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=1048576),
  recorded_by uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique(version_id,algorithm_version),
  foreign key(investigation_id,version_id) references evidence_pipeline.investigation_versions(investigation_id,id),
  foreign key(investigation_id,recorded_by) references evidence_pipeline.investigation_memberships(investigation_id,user_id)
);
create index evidence_checks_investigation_version on evidence_pipeline.investigation_evidence_check_reports(investigation_id,version_id);
create index evidence_checks_member on evidence_pipeline.investigation_evidence_check_reports(investigation_id,recorded_by);
alter table evidence_pipeline.investigation_evidence_check_reports enable row level security;
revoke all on evidence_pipeline.investigation_evidence_check_reports from public,anon,authenticated,service_role;
grant select,insert on evidence_pipeline.investigation_evidence_check_reports to service_role;
create trigger no_rewrite before update or delete on evidence_pipeline.investigation_evidence_check_reports
  for each row execute function evidence_pipeline.reject_history_mutation();
create trigger no_truncate before truncate on evidence_pipeline.investigation_evidence_check_reports
  for each statement execute function evidence_pipeline.reject_history_mutation();

-- Pure functions read only the immutable observation passed by the RPC.
-- Positions remain decimal strings in JSON, including values above JS 2^53.
create function evidence_pipeline.evidence_check_inputs(p_snapshot jsonb)
returns table("position" bigint,kind text,capture_id text,article_id text,record_version_id text,record_kind text,payload jsonb)
language sql immutable security invoker set search_path='' as $$
  select (v->>'position')::bigint,
    case when v->'capture'<>'null'::jsonb then 'capture' else 'record_version' end,
    v->'capture'->>'id',v->'capture'->>'article_id',v->'record_version'->>'id',v->'record_version'->>'record_kind',
    coalesce(nullif(v->'capture'->'payload','null'::jsonb),v->'record_version'->'payload')
  from jsonb_array_elements(p_snapshot->'inputs') v
$$;

create function evidence_pipeline.evidence_check_excerpt(p_position bigint,p_field text,p_text text,p_start integer,p_end integer)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('position',p_position::text,'source_field',p_field,'span_start',p_start,'span_end',p_end,
    'excerpt',substring(p_text from p_start+1 for p_end-p_start))
$$;

create function evidence_pipeline.evidence_check_build(p_snapshot jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare caps jsonb; links jsonb; cues jsonb; coverage jsonb; result jsonb; total_links integer; total_cues integer;
begin
  if p_snapshot->>'contract_version' is distinct from 'investigation-observation-1'
    or jsonb_typeof(p_snapshot->'inputs') is distinct from 'array'
    or jsonb_array_length(p_snapshot->'inputs')>2000 or octet_length(p_snapshot::text)>4194304 then
    raise exception using errcode='22023',message='unsupported saved observation'; end if;

  -- Pair work is bounded to the first 100 captures by durable input position.
  -- No URL canonicalization or text normalization occurs here.
  select coalesce(jsonb_agg(to_jsonb(q) order by q.position),'[]') into caps from (
    select position,capture_id,article_id,payload->>'url' url,
      case when length(btrim(coalesce(payload->>'body_text','')))>0 then 'body_text' else 'summary' end source_field,
      case when length(btrim(coalesce(payload->>'body_text','')))>0 then payload->>'body_text' else coalesce(payload->>'summary','') end raw
    from evidence_pipeline.evidence_check_inputs(p_snapshot) where kind='capture' order by position limit 100
  ) q;
  -- Rank the full raw strings once under bytewise C collation. Equal ranks
  -- mean exact equal text, without treating a hash collision as a match or
  -- repeatedly comparing/decompressing full documents for every pair.
  with c as materialized (
    select position,capture_id,article_id,url,length(raw) raw_length,
      dense_rank() over(order by raw collate "C") text_group,
      case when length(raw)>0 then evidence_pipeline.evidence_check_excerpt(position,source_field,raw,0,least(160,length(raw))) else null end witness
    from jsonb_to_recordset(caps) as x("position" bigint,capture_id text,article_id text,url text,source_field text,raw text)
  ), matches as (
    select a.position,a.capture_id,a.witness,b.position b_position,b.capture_id b_capture_id,b.witness b_witness,
      array_remove(array[
        case when a.article_id=b.article_id then 'same_saved_article' end,
        case when a.url<>'' and a.url=b.url then 'same_retained_url' end,
        case when a.raw_length>=80 and a.text_group=b.text_group then 'identical_retained_text' end
      ],null) reasons
    from c a join c b on a.position<b.position
    where a.article_id=b.article_id or (a.url<>'' and a.url=b.url) or (a.raw_length>=80 and a.text_group=b.text_group)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id','pair:'||position::text||':'||b_position::text,'status','needs_review','independence','unknown',
      'left_position',position::text,'right_position',b_position::text,'left_capture_id',capture_id,'right_capture_id',b_capture_id,
      'reasons',to_jsonb(reasons),'direction','undetermined','left_excerpt',witness,'right_excerpt',b_witness
    ) order by position,b_position),'[]'),count(*)::integer into links,total_links from matches;
  if total_links>200 then select jsonb_agg(v order by n) into links from jsonb_array_elements(links) with ordinality x(v,n) where n<=200; end if;

  -- Deliberate counter-evidence cues, not semantic contradiction classification.
  -- Every supported text field is searched, including summaries when body exists.
  with inputs as materialized (select * from evidence_pipeline.evidence_check_inputs(p_snapshot)),
  fields as (
    select i.position,i.capture_id,i.record_version_id,f.source_field,i.payload->>f.source_field raw
    from inputs i cross join (values('title'),('summary'),('body_text')) f(source_field)
    where (i.kind='capture' or i.record_kind='article') and jsonb_typeof(i.payload->f.source_field)='string'
  ),
  patterns(cue,pattern) as (values
    ('correction_language','\m(correction|corrections|corrected|erratum)\M'),
    ('withdrawal_language','\m(retraction|retractions|retracted|withdrawn)\M')),
  hits as (
    select f.*,p.cue,regexp_instr(f.raw,p.pattern,1,1,0,'i')-1 a,
      regexp_instr(f.raw,p.pattern,1,1,1,'i')-1 b
    from fields f cross join patterns p where f.raw ~* p.pattern
  ),
  all_cues as (
    select position,source_field,cue,jsonb_build_object(
      'id','cue:'||position::text||':'||source_field||':'||cue,'kind',cue,'status','needs_review',
      'position',position::text,'capture_id',capture_id,'record_version_id',record_version_id,
      'reference',evidence_pipeline.evidence_check_excerpt(position,source_field,raw,a,b),'metadata_reference',null) doc from hits
    union all
    select position,'source_status','recorded_source_status',jsonb_build_object(
      'id','cue:'||position::text||':source_status','kind','recorded_source_status','status','needs_review',
      'position',position::text,'capture_id',null,'record_version_id',record_version_id,'reference',null,
      'metadata_reference',jsonb_build_object('position',position::text,'source_field','source_status','value',payload->>'source_status'))
    from inputs where record_kind='article' and payload->>'source_status' in ('corrected','withdrawn')
  )
  select coalesce(jsonb_agg(doc order by position,source_field,cue),'[]'),count(*)::integer into cues,total_cues from all_cues;
  if total_cues>200 then select jsonb_agg(v order by n) into cues from jsonb_array_elements(cues) with ordinality x(v,n) where n<=200; end if;

  with i as materialized (select * from evidence_pipeline.evidence_check_inputs(p_snapshot))
  select jsonb_build_object(
    'scope','saved_observation_dependency_inputs','scope_candidate_ids',p_snapshot->'scope_candidate_ids',
    'input_count',count(*),'input_positions',coalesce(jsonb_agg(position::text order by position),'[]'),
    'capture_count',count(*) filter(where kind='capture'),
    'text_scan_positions',coalesce(jsonb_agg(position::text order by position) filter(where kind='capture' or record_kind='article'),'[]'),
    'text_fields_scanned',(select count(*) from i cross join (values('title'),('summary'),('body_text')) f(k)
      where (kind='capture' or record_kind='article') and jsonb_typeof(payload->f.k)='string'),
    'metadata_scan_positions',coalesce(jsonb_agg(position::text order by position) filter(where record_kind='article'),'[]'),
    'unsupported_inputs',coalesce(jsonb_agg(jsonb_build_object('position',position::text,'record_kind',record_kind,
      'reason','no_check_for_this_record_kind') order by position) filter(where kind<>'capture' and record_kind is distinct from 'article'),'[]'),
    'missing_body_positions',coalesce(jsonb_agg(position::text order by position) filter(where (kind='capture' or record_kind='article')
      and length(btrim(coalesce(payload->>'body_text','')))=0),'[]'),
    'lineage_scanned_positions',(select coalesce(jsonb_agg(v->>'position' order by (v->>'position')::bigint),'[]') from jsonb_array_elements(caps) v),
    'lineage_excluded_positions',coalesce(jsonb_agg(position::text order by position) filter(where kind='capture' and not exists(
      select 1 from jsonb_array_elements(caps) v where (v->>'position')::bigint=i.position)),'[]'),
    'pairs_compared',jsonb_array_length(caps)*(jsonb_array_length(caps)-1)/2,
    'lineage_candidates_found',total_links,'lineage_candidates_returned',jsonb_array_length(links),
    'challenge_cues_found',total_cues,'challenge_cues_returned',jsonb_array_length(cues),
    'external_retrieval','not_run','languages_verified',false,'semantic_adjudication','not_performed'
  ) into coverage from i;
  result:=jsonb_build_object('contract_version','investigation-evidence-checks-1','algorithm_version','retained-evidence-checks-1',
    'completion',case when jsonb_array_length(coverage->'lineage_excluded_positions')>0 or total_links>200 or total_cues>200
      then 'partial' else 'completed_bounded_checks' end,
    'lineage_candidates',links,'challenge_cues',cues,'coverage',coverage,
    'limits',jsonb_build_object('lineage_capture_limit',100,'results_per_section',200,'identical_text_min_codepoints',80,
      'text_matches_per_field_per_cue',1,'cue_language','English'),
    'limitations',jsonb_build_array(
      'Only retained inputs in this saved observation were searched; this is not the whole source collection or the web.',
      'Matching text or URLs proposes a source relationship; independence and transmission direction remain unknown.',
      'Correction and withdrawal words may concern another claim, be negated, or refer to a different event.',
      'Source status describes this retained record version, not the current live source.',
      'The cue vocabulary is English only. Language, geography and source-class coverage are not verified.',
      'Empty results do not establish that a claim is true or that no follow-up occurred.'),
    'publicly_eligible',false);
  return result;
end $$;

create function public.mip_investigation_evidence_checks_v1(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare uid uuid; iid uuid; vid uuid; member evidence_pipeline.investigation_memberships;
  v evidence_pipeline.investigation_versions; r evidence_pipeline.investigation_evidence_check_reports; snapshot jsonb;
begin
  if p_action is null or p_action not in ('read','run') or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>8192 then
    raise exception using errcode='22023',message='invalid evidence checks request'; end if;
  perform evidence_pipeline.workspace_keys(p_input,array['user_id','investigation_id','version_id']);
  uid:=evidence_pipeline.workspace_uuid(p_input->'user_id');iid:=evidence_pipeline.workspace_uuid(p_input->'investigation_id');
  vid:=evidence_pipeline.workspace_uuid(p_input->'version_id');
  -- Runs share the membership row lock with revocation; no write can race past it.
  if p_action='run' then
    select * into member from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid for update;
  else
    select * into member from evidence_pipeline.investigation_memberships where investigation_id=iid and user_id=uid;
  end if;
  if member.user_id is null or member.access_role='revoked' or (p_action='run' and member.access_role<>'reviewer') then
    raise exception using errcode='42501',message='investigation access denied'; end if;
  select * into v from evidence_pipeline.investigation_versions where investigation_id=iid and id=vid;
  if not found then raise exception using errcode='42501',message='investigation access denied'; end if;
  if p_action='run' then perform pg_advisory_xact_lock(hashtextextended('mip-evidence-checks:'||vid::text,0)); end if;
  select * into r from evidence_pipeline.investigation_evidence_check_reports where version_id=vid and algorithm_version='retained-evidence-checks-1';
  if r.id is null and p_action='run' then
    select o.snapshot into snapshot from evidence_pipeline.investigation_observations o where o.id=v.observation_id;
    insert into evidence_pipeline.investigation_evidence_check_reports(investigation_id,version_id,algorithm_version,result,recorded_by)
      values(iid,vid,'retained-evidence-checks-1',evidence_pipeline.evidence_check_build(snapshot),uid) returning * into r;
  end if;
  return jsonb_build_object('contract_version','investigation-evidence-checks-1','investigation_id',iid,'version_id',vid,
    'observation_id',v.observation_id,'access_role',member.access_role,'status',case when r.id is null then 'not_run' else 'saved' end,
    'report',case when r.id is null then null else to_jsonb(r)-'recorded_by' end,'publicly_eligible',false);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='evidence_pipeline' and p.proname in ('evidence_check_inputs','evidence_check_excerpt','evidence_check_build') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
revoke all on function public.mip_investigation_evidence_checks_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.mip_investigation_evidence_checks_v1(text,jsonb) to service_role;
commit;
