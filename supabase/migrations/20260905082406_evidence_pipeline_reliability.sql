-- Additive V2 foundation. No source discovery, cron activation, public release,
-- confidence recomputation, spatial-runtime mutation, or legacy corpus import.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.articles,public.nodes,public.pipeline_config in share row exclusive mode;

create schema evidence_pipeline;
revoke all on schema evidence_pipeline from public, anon, authenticated;
grant usage on schema evidence_pipeline to service_role;
alter default privileges in schema evidence_pipeline revoke execute on functions from public;

-- Conservative URL identity: preserve scheme, path, meaningful query parameters,
-- query order and trailing slashes; remove fragments and known tracking keys only.
create function evidence_pipeline.canonical_url(p_url text) returns text
language plpgsql immutable strict security invoker set search_path = '' as $$
declare u text; authority text; rest text; path text; query text;
begin
  u := split_part(btrim(p_url), '#', 1);
  if octet_length(p_url) > 2048 or u !~* '^https?://[a-z0-9]([a-z0-9.-]*[a-z0-9])?([/?]|$)'
     or u ~ '[[:space:][:cntrl:]]' then raise exception 'invalid article URL'; end if;
  authority := substring(u from '(?i)^https?://[^/?]+');
  rest := substr(u, length(authority) + 1);
  path := split_part(rest, '?', 1);
  if path = '' then path := '/'; end if;
  if position('?' in rest) > 0 then
    select string_agg(part, '&' order by ord) into query
    from unnest(string_to_array(substr(rest, position('?' in rest) + 1), '&')) with ordinality t(part, ord)
    where part <> '' and lower(split_part(part, '=', 1)) !~ '^(utm_.*|fbclid|gclid|dclid|msclkid)$';
  end if;
  return lower(authority) || path || case when query is null then '' else '?' || query end;
end $$;

create table evidence_pipeline.record_versions (
  id uuid primary key default gen_random_uuid(),
  record_kind text not null check (record_kind in ('article','graph_node','temporal_assessment')),
  record_key text not null,
  ordinal integer not null check (ordinal > 0),
  operation text not null check (operation in ('baseline','insert','update','delete')),
  payload jsonb not null,
  reason text not null,
  actor text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (record_kind, record_key, ordinal)
);

create function evidence_pipeline.reject_history_mutation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin raise exception 'history is append-only'; end $$;

create function evidence_pipeline.append_version(p_kind text, p_key text, p_operation text, p_payload jsonb, p_reason text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid; next_ordinal integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('mip-version:' || p_kind || ':' || p_key, 0));
  select coalesce(max(ordinal),0)+1 into next_ordinal from evidence_pipeline.record_versions
    where record_kind=p_kind and record_key=p_key;
  insert into evidence_pipeline.record_versions(record_kind,record_key,ordinal,operation,payload,reason,actor)
  values(p_kind,p_key,next_ordinal,p_operation,p_payload,coalesce(nullif(p_reason,''),'unspecified'),session_user)
  returning id into result;
  return result;
end $$;

create function evidence_pipeline.capture_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare before_row jsonb; after_row jsonb; k text; kind text := TG_ARGV[0];
begin
  if TG_OP <> 'INSERT' then before_row := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then after_row := to_jsonb(NEW); end if;
  if kind='temporal_assessment' then
    k := coalesce(after_row->>'key',before_row->>'key');
    if k not like 'temporal.assessment.%' and coalesce(before_row->>'key','') not like 'temporal.assessment.%' then return null; end if;
    if TG_OP='UPDATE' and before_row->>'key' is distinct from after_row->>'key' then
      raise exception 'temporal assessment keys are immutable; insert a new key';
    end if;
  else
    k := coalesce(after_row->>'id',before_row->>'id');
    if TG_OP='UPDATE' and before_row->>'id' is distinct from after_row->>'id' then
      raise exception 'versioned record identity is immutable';
    end if;
  end if;
  -- Embeddings are recomputable, and would dominate retained history size.
  before_row := before_row - 'embedding'; after_row := after_row - 'embedding';
  if TG_OP='UPDATE' and before_row is not distinct from after_row then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('mip-version:' || kind || ':' || k,0));
  if before_row is not null and not exists(select 1 from evidence_pipeline.record_versions where record_kind=kind and record_key=k) then
    perform evidence_pipeline.append_version(kind,k,'baseline',before_row,'first_observed_before_change');
  end if;
  perform evidence_pipeline.append_version(kind,k,lower(TG_OP),coalesce(after_row,before_row),
    coalesce(nullif(current_setting('mip.change_reason',true),''),'direct_database_change'));
  return null;
end $$;

create table evidence_pipeline.import_jobs (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null,
  input_hash text not null,
  payload jsonb not null,
  first_run_id text not null,
  state text not null default 'pending' check(state in ('pending','processing','retry_wait','completed','dead_letter')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 5),
  available_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  article_id uuid references public.articles(id),
  outcome text check(outcome in ('inserted','existing','revision_pending')),
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique(canonical_url,input_hash),
  check((state='processing') = (lease_token is not null and lease_expires_at is not null))
);
create index import_jobs_ready on evidence_pipeline.import_jobs(available_at,created_at,id) where state in ('pending','retry_wait');
create index import_jobs_expired on evidence_pipeline.import_jobs(lease_expires_at) where state='processing';
create index import_jobs_article on evidence_pipeline.import_jobs(article_id);

create table evidence_pipeline.import_receipts (
  run_id text not null,
  job_id uuid not null references evidence_pipeline.import_jobs(id),
  original_url text not null,
  received_at timestamptz not null default clock_timestamp(),
  primary key(run_id,job_id)
);
create index import_receipts_job on evidence_pipeline.import_receipts(job_id);
create table evidence_pipeline.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references evidence_pipeline.import_jobs(id),
  attempt integer not null,
  state text not null,
  code text,
  recorded_at timestamptz not null default clock_timestamp()
);
create index job_events_job on evidence_pipeline.job_events(job_id,id);

-- One identity maps to one existing article, even across concurrent workers.
create table evidence_pipeline.article_identities (
  canonical_url text primary key,
  article_id uuid not null unique references public.articles(id)
);

-- Incoming publisher versions are preserved separately. A correction never
-- overwrites an already reviewed article or silently inherits its eligibility.
create table evidence_pipeline.article_captures (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id),
  job_id uuid not null unique references evidence_pipeline.import_jobs(id),
  content_hash text not null,
  payload jsonb not null,
  captured_at timestamptz not null default clock_timestamp(),
  review_state text not null default 'pending' check(review_state='pending')
);
create index article_captures_article on evidence_pipeline.article_captures(article_id,captured_at,id);

create table evidence_pipeline.evidence_candidates (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references evidence_pipeline.article_captures(id),
  candidate_key text not null,
  candidate_kind text not null check(candidate_kind in ('claim','graph_relationship','timeline','geography')),
  statement text not null check(length(btrim(statement)) between 1 and 4000),
  source_field text not null check(source_field in ('title','summary','body_text')),
  span_start integer not null check(span_start>=0),
  span_end integer not null check(span_end>span_start),
  excerpt text not null,
  event_node_id uuid references public.nodes(id),
  related_node_id uuid references public.nodes(id),
  place_id uuid references public.geographic_places(id),
  -- Validated against the released projection at append time. The spatial
  -- owner intentionally does not grant REFERENCES on its private tables.
  spatial_revision_id uuid,
  predecessor_candidate_id uuid references evidence_pipeline.evidence_candidates(id),
  extractor_version text not null,
  remaining_uncertainty text not null check(length(btrim(remaining_uncertainty))>0),
  review_state text not null default 'pending' check(review_state='pending'),
  created_at timestamptz not null default clock_timestamp(),
  unique(capture_id,candidate_key,extractor_version),
  check(candidate_kind <> 'graph_relationship' or (event_node_id is not null and related_node_id is not null and event_node_id<>related_node_id)),
  check(candidate_kind <> 'timeline' or event_node_id is not null),
  check(candidate_kind <> 'geography' or (event_node_id is not null and place_id is not null and spatial_revision_id is not null))
);
create index evidence_candidates_event on evidence_pipeline.evidence_candidates(event_node_id,created_at,id);
create index evidence_candidates_related on evidence_pipeline.evidence_candidates(related_node_id);
create index evidence_candidates_place on evidence_pipeline.evidence_candidates(place_id);
create index evidence_candidates_spatial on evidence_pipeline.evidence_candidates(spatial_revision_id);
create index evidence_candidates_predecessor on evidence_pipeline.evidence_candidates(predecessor_candidate_id);

create function evidence_pipeline.enqueue(p_run_id text, p_payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare u text; h text; j uuid; canonical_payload jsonb;
begin
  if p_run_id is null or length(btrim(p_run_id)) not between 1 and 120 then raise exception 'run_id required, maximum 120 characters'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>262144 then raise exception 'invalid import payload'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('url','title','outlet','summary','body_text','published_at')) then
    raise exception 'unsupported import field'; end if;
  if exists(select 1 from jsonb_each(p_payload) t(k,v) where jsonb_typeof(v) not in ('string','null')) then raise exception 'import fields must be text'; end if;
  if length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 500
     or length(btrim(coalesce(p_payload->>'outlet',''))) not between 1 and 200 then raise exception 'title and outlet required'; end if;
  u := evidence_pipeline.canonical_url(p_payload->>'url');
  if u is null then raise exception 'URL required'; end if;
  if nullif(p_payload->>'published_at','') is not null then
    if not isfinite((p_payload->>'published_at')::timestamptz) then raise exception 'invalid publication time'; end if;
  end if;
  canonical_payload := jsonb_build_object('url',u,'title',btrim(p_payload->>'title'),'outlet',btrim(p_payload->>'outlet'),
    'summary',nullif(p_payload->>'summary',''),'body_text',nullif(p_payload->>'body_text',''),
    'published_at',nullif(p_payload->>'published_at','')::timestamptz);
  h := encode(sha256(convert_to(canonical_payload::text,'UTF8')),'hex');
  insert into evidence_pipeline.import_jobs(canonical_url,input_hash,payload,first_run_id)
    values(u,h,canonical_payload,p_run_id) on conflict(canonical_url,input_hash) do nothing returning id into j;
  if j is null then select id into j from evidence_pipeline.import_jobs where canonical_url=u and input_hash=h; end if;
  insert into evidence_pipeline.import_receipts(run_id,job_id,original_url) values(p_run_id,j,p_payload->>'url') on conflict do nothing;
  return j;
end $$;

create function evidence_pipeline.claim_job() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare j evidence_pipeline.import_jobs; t timestamptz := clock_timestamp();
begin
  -- Every expired final attempt becomes a visible terminal failure.
  with expired as (
    select id from evidence_pipeline.import_jobs where state='processing' and lease_expires_at<=t
    order by lease_expires_at limit 100 for update skip locked
  ), changed as (
    update evidence_pipeline.import_jobs x set state=case when attempt_count>=5 then 'dead_letter' else 'retry_wait' end,
      error_code='lease_expired',lease_token=null,lease_expires_at=null,
      available_at=t + make_interval(secs=>least(3600,30*(2^greatest(0,attempt_count-1))::integer))
    from expired e where x.id=e.id returning x.*
  ) insert into evidence_pipeline.job_events(job_id,attempt,state,code)
    select id,attempt_count,state,'lease_expired' from changed;
  select * into j from evidence_pipeline.import_jobs where state in ('pending','retry_wait') and available_at<=t and attempt_count<5
    order by available_at,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update evidence_pipeline.import_jobs set state='processing',attempt_count=attempt_count+1,
    lease_token=gen_random_uuid(),lease_expires_at=t+interval '2 minutes',error_code=null
    where id=j.id returning * into j;
  insert into evidence_pipeline.job_events(job_id,attempt,state) values(j.id,j.attempt_count,j.state);
  return to_jsonb(j);
end $$;

create function evidence_pipeline.finish_job(p_job uuid,p_token uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare j evidence_pipeline.import_jobs; a public.articles; capture uuid; result text;
begin
  select * into j from evidence_pipeline.import_jobs where id=p_job for update;
  if not found or j.state<>'processing' or j.lease_token is distinct from p_token or j.lease_expires_at<=clock_timestamp() then
    raise exception 'stale or invalid job lease'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mip-url:'||j.canonical_url,0));
  select ar.* into a from evidence_pipeline.article_identities i join public.articles ar on ar.id=i.article_id where i.canonical_url=j.canonical_url;
  if a.id is null then
    -- Adopt exact existing URLs; do not silently merge ambiguous legacy identities.
    select * into a from public.articles where url=j.canonical_url;
  end if;
  if a.id is null then
    perform set_config('mip.change_reason','ingestion:'||j.id,true);
    insert into public.articles(feed,outlet,title,url,summary,body_text,published_at,ingestion_run_id)
    values('pipeline-v1',j.payload->>'outlet',j.payload->>'title',j.canonical_url,j.payload->>'summary',j.payload->>'body_text',
      (j.payload->>'published_at')::timestamptz,j.first_run_id)
    on conflict(url) do nothing returning * into a;
    if a.id is not null then result:='inserted'; else select * into a from public.articles where url=j.canonical_url; end if;
  end if;
  insert into evidence_pipeline.article_identities(canonical_url,article_id) values(j.canonical_url,a.id) on conflict do nothing;
  if result is null then
    if a.title is not distinct from j.payload->>'title' and a.outlet is not distinct from j.payload->>'outlet'
      and nullif(a.summary,'') is not distinct from j.payload->>'summary' and nullif(a.body_text,'') is not distinct from j.payload->>'body_text'
      and a.published_at is not distinct from (j.payload->>'published_at')::timestamptz then result:='existing';
    else result:='revision_pending'; end if;
  end if;
  insert into evidence_pipeline.article_captures(article_id,job_id,content_hash,payload)
    values(a.id,j.id,j.input_hash,j.payload) returning id into capture;
  update evidence_pipeline.import_jobs set state='completed',article_id=a.id,outcome=result,
    completed_at=clock_timestamp(),lease_token=null,lease_expires_at=null where id=j.id;
  insert into evidence_pipeline.job_events(job_id,attempt,state,code) values(j.id,j.attempt_count,'completed',result);
  return jsonb_build_object('job_id',j.id,'article_id',a.id,'capture_id',capture,'outcome',result);
end $$;

create function evidence_pipeline.fail_job(p_job uuid,p_token uuid,p_code text,p_retryable boolean) returns text
language plpgsql security invoker set search_path = '' as $$
declare j evidence_pipeline.import_jobs; result text;
begin
  if p_code is null or p_code !~ '^[a-zA-Z0-9_]{1,80}$' then raise exception 'safe error code required'; end if;
  select * into j from evidence_pipeline.import_jobs where id=p_job for update;
  if not found or j.state<>'processing' or j.lease_token is distinct from p_token or j.lease_expires_at<=clock_timestamp() then raise exception 'stale or invalid job lease'; end if;
  result := case when p_retryable is true and j.attempt_count<5 then 'retry_wait' else 'dead_letter' end;
  update evidence_pipeline.import_jobs set state=result,error_code=p_code,lease_token=null,lease_expires_at=null,
    available_at=clock_timestamp()+make_interval(secs=>least(3600,30*(2^(j.attempt_count-1))::integer)) where id=j.id;
  insert into evidence_pipeline.job_events(job_id,attempt,state,code) values(j.id,j.attempt_count,result,p_code);
  return result;
end $$;

create function evidence_pipeline.append_candidate(p_candidate jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare c evidence_pipeline.evidence_candidates; old_c evidence_pipeline.evidence_candidates;
  cap evidence_pipeline.article_captures; old_cap evidence_pipeline.article_captures; result uuid;
begin
  if jsonb_typeof(p_candidate) is distinct from 'object' or octet_length(p_candidate::text)>32768 then raise exception 'invalid candidate'; end if;
  if exists(select 1 from jsonb_object_keys(p_candidate) k where k not in
    ('capture_id','candidate_key','candidate_kind','statement','source_field','span_start','span_end','excerpt','event_node_id','related_node_id','place_id','spatial_revision_id','predecessor_candidate_id','extractor_version','remaining_uncertainty')) then raise exception 'unsupported candidate field'; end if;
  c := jsonb_populate_record(null::evidence_pipeline.evidence_candidates,p_candidate);
  if length(btrim(coalesce(c.candidate_key,''))) not between 1 and 120 or length(btrim(coalesce(c.extractor_version,''))) not between 1 and 120 then raise exception 'candidate identity and extractor version required'; end if;
  select * into cap from evidence_pipeline.article_captures where id=c.capture_id;
  if not found then raise exception 'unknown capture'; end if;
  if c.source_field is null or c.span_start is null or c.span_end is null or c.excerpt is null or c.span_start<0 or c.span_end<=c.span_start
    or c.span_end>coalesce(char_length(cap.payload->>c.source_field),0)
    or substring(cap.payload->>c.source_field from c.span_start+1 for c.span_end-c.span_start) is distinct from c.excerpt then
    raise exception 'evidence span must exactly match retained source text (Unicode code points)'; end if;
  if c.event_node_id is not null and not exists(select 1 from public.nodes where id=c.event_node_id and type='event') then raise exception 'canonical event node required'; end if;
  if c.spatial_revision_id is not null and not exists(
    select 1 from public.spatial_projection_v1 r
    where r.revision_id=c.spatial_revision_id and r.canonical_place_id=c.place_id and r.subject_graph_node_id=c.event_node_id
  ) then raise exception 'spatial revision must match event and place'; end if;
  if c.predecessor_candidate_id is not null then
    select * into old_c from evidence_pipeline.evidence_candidates where id=c.predecessor_candidate_id;
    select * into old_cap from evidence_pipeline.article_captures where id=old_c.capture_id;
    if old_c.id is null or old_cap.article_id<>cap.article_id or old_c.candidate_key<>c.candidate_key or old_c.candidate_kind<>c.candidate_kind then
      raise exception 'revision predecessor must belong to the same article and candidate identity'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mip-candidate:'||c.capture_id||':'||c.candidate_key||':'||c.extractor_version,0));
  select * into old_c from evidence_pipeline.evidence_candidates where capture_id=c.capture_id and candidate_key=c.candidate_key and extractor_version=c.extractor_version;
  if found then
    if (to_jsonb(old_c)-'id'-'created_at'-'review_state') is distinct from (to_jsonb(c)-'id'-'created_at'-'review_state') then raise exception 'candidate idempotency conflict'; end if;
    return old_c.id;
  end if;
  insert into evidence_pipeline.evidence_candidates(capture_id,candidate_key,candidate_kind,statement,source_field,span_start,span_end,excerpt,
    event_node_id,related_node_id,place_id,spatial_revision_id,predecessor_candidate_id,extractor_version,remaining_uncertainty)
  values(c.capture_id,c.candidate_key,c.candidate_kind,c.statement,c.source_field,c.span_start,c.span_end,c.excerpt,
    c.event_node_id,c.related_node_id,c.place_id,c.spatial_revision_id,c.predecessor_candidate_id,c.extractor_version,c.remaining_uncertainty)
  returning id into result;
  return result;
end $$;

-- Single server-only Data API entrypoint. Invoker privileges, never a browser key.
create function public.mip_pipeline_v1(p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  case p_action
    when 'enqueue' then return to_jsonb(evidence_pipeline.enqueue(p_input->>'run_id',p_input->'article'));
    when 'claim' then return evidence_pipeline.claim_job();
    when 'finish' then return evidence_pipeline.finish_job((p_input->>'job_id')::uuid,(p_input->>'lease_token')::uuid);
    when 'fail' then return to_jsonb(evidence_pipeline.fail_job((p_input->>'job_id')::uuid,(p_input->>'lease_token')::uuid,p_input->>'code',(p_input->>'retryable')::boolean));
    when 'candidate' then return to_jsonb(evidence_pipeline.append_candidate(p_input));
    when 'status' then return (select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (
      select j.state,count(*) jobs from evidence_pipeline.import_jobs j
      where exists(select 1 from evidence_pipeline.import_receipts r where r.job_id=j.id and r.run_id=p_input->>'run_id') group by j.state
    ) s);
    when 'history' then return (select coalesce(jsonb_agg(to_jsonb(h) order by h.ordinal),'[]'::jsonb) from (
      select * from evidence_pipeline.record_versions where record_kind=p_input->>'record_kind' and record_key=p_input->>'record_key'
        and ordinal>coalesce((p_input->>'after_ordinal')::integer,0) order by ordinal limit 100
    ) h);
    when 'evidence' then return (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]'::jsonb) from (
      select c.*, a.article_id, a.payload->>'url' source_url, a.content_hash from evidence_pipeline.evidence_candidates c
      join evidence_pipeline.article_captures a on a.id=c.capture_id where c.event_node_id=(p_input->>'event_node_id')::uuid
        and (c.created_at,c.id)>(coalesce((p_input->>'after_time')::timestamptz,'-infinity'),coalesce((p_input->>'after_id')::uuid,'00000000-0000-0000-0000-000000000000'))
      order by c.created_at,c.id limit 100
    ) e);
    else raise exception 'unsupported pipeline action';
  end case;
end $$;
revoke all on function public.mip_pipeline_v1(text,jsonb) from public,anon,authenticated;
grant execute on function public.mip_pipeline_v1(text,jsonb) to service_role;

-- Capture only new changes; baseline is the current observation, not past truth.
create trigger mip_pipeline_article_history after insert or update or delete on public.articles for each row execute function evidence_pipeline.capture_version('article');
create trigger mip_pipeline_event_history after insert or update or delete on public.nodes for each row execute function evidence_pipeline.capture_version('graph_node');
create trigger mip_pipeline_temporal_history after insert or update or delete on public.pipeline_config for each row execute function evidence_pipeline.capture_version('temporal_assessment');
create trigger mip_pipeline_article_no_truncate before truncate on public.articles for each statement execute function evidence_pipeline.reject_history_mutation();
create trigger mip_pipeline_node_no_truncate before truncate on public.nodes for each statement execute function evidence_pipeline.reject_history_mutation();
create trigger mip_pipeline_temporal_no_truncate before truncate on public.pipeline_config for each statement execute function evidence_pipeline.reject_history_mutation();
select evidence_pipeline.append_version('article',id::text,'baseline',to_jsonb(a)-'embedding','installation_baseline') from public.articles a;
select evidence_pipeline.append_version('graph_node',id::text,'baseline',to_jsonb(n),'installation_baseline') from public.nodes n;
select evidence_pipeline.append_version('temporal_assessment',key,'baseline',to_jsonb(c),'installation_baseline') from public.pipeline_config c where key like 'temporal.assessment.%';

-- Reject ambiguous canonical legacy identities rather than choosing a winner.
insert into evidence_pipeline.article_identities(canonical_url,article_id)
  select evidence_pipeline.canonical_url(url),id from public.articles;

do $$ declare t text; begin
  foreach t in array array['record_versions','import_jobs','import_receipts','job_events','article_identities','article_captures','evidence_candidates'] loop
    execute format('alter table evidence_pipeline.%I enable row level security',t);
    execute format('revoke all on evidence_pipeline.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert on evidence_pipeline.%I to service_role',t);
  end loop;
  foreach t in array array['record_versions','import_receipts','job_events','article_captures','evidence_candidates'] loop
    execute format('create trigger immutable_history before update or delete on evidence_pipeline.%I for each row execute function evidence_pipeline.reject_history_mutation()',t);
    execute format('create trigger immutable_history_truncate before truncate on evidence_pipeline.%I for each statement execute function evidence_pipeline.reject_history_mutation()',t);
  end loop;
end $$;
grant update on evidence_pipeline.import_jobs to service_role;
-- New ingestion authority is insert-only and cannot set reader_state, claims,
-- confidence, source_status or any publication/review field. No spatial grants.
do $$ begin
  if (select column_default from information_schema.columns where table_schema='public' and table_name='articles' and column_name='reader_state')
    is distinct from '''pending_review''::text' then raise exception 'articles must default to pending_review'; end if;
end $$;
grant select on public.articles to service_role;
grant insert(feed,outlet,title,url,summary,body_text,published_at,ingestion_run_id) on public.articles to service_role;
grant usage,select on all sequences in schema evidence_pipeline to service_role;
revoke all on all functions in schema evidence_pipeline from public,anon,authenticated;
grant execute on all functions in schema evidence_pipeline to service_role;
comment on schema evidence_pipeline is 'V1 private ingestion reliability, exact-source candidate linkage and append-only revision history. No public evidence promotion.';
commit;
