-- UNAPPLIED candidate: retain existing source registry identity in the private
-- native capture payload. Existing V1 callers without metadata remain valid.
-- Must be reviewed/migrated on an authorized backend before any live use.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create or replace function evidence_pipeline.enqueue(p_run_id text, p_payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare u text; h text; j uuid; canonical_payload jsonb;
begin
  if p_run_id is null or length(btrim(p_run_id)) not between 1 and 120 then raise exception 'run_id required, maximum 120 characters'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>262144 then raise exception 'invalid import payload'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('url','title','outlet','summary','body_text','published_at','source_key','source_feed','source_label')) then
    raise exception 'unsupported import field'; end if;
  if exists(select 1 from jsonb_each(p_payload) t(k,v) where jsonb_typeof(v) not in ('string','null')) then raise exception 'import fields must be text'; end if;
  if length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 500
     or length(btrim(coalesce(p_payload->>'outlet',''))) not between 1 and 200 then raise exception 'title and outlet required'; end if;
  if (p_payload ? 'source_key') <> (p_payload ? 'source_feed')
     or (p_payload ? 'source_key' and nullif(btrim(p_payload->>'source_key'),'') is null)
     or (p_payload ? 'source_feed' and nullif(btrim(p_payload->>'source_feed'),'') is null)
     or (p_payload ? 'source_label' and (not (p_payload ? 'source_key') or nullif(btrim(p_payload->>'source_label'),'') is null))
     or length(coalesce(p_payload->>'source_key',''))>120
     or length(coalesce(p_payload->>'source_feed',''))>120
     or length(coalesce(p_payload->>'source_label',''))>200 then
    raise exception 'source key/feed pair and bounded label required'; end if;
  u := evidence_pipeline.canonical_url(p_payload->>'url');
  if u is null then raise exception 'URL required'; end if;
  if nullif(p_payload->>'published_at','') is not null then
    if not isfinite((p_payload->>'published_at')::timestamptz) then raise exception 'invalid publication time'; end if;
  end if;
  canonical_payload := jsonb_build_object('url',u,'title',btrim(p_payload->>'title'),'outlet',btrim(p_payload->>'outlet'),
    'summary',nullif(p_payload->>'summary',''),'body_text',nullif(p_payload->>'body_text',''),
    'published_at',nullif(p_payload->>'published_at','')::timestamptz);
  -- Preserve byte-identical legacy V1 hashes for callers without source metadata.
  if p_payload ? 'source_key' then
    canonical_payload := canonical_payload || jsonb_build_object(
      'source_key',p_payload->>'source_key',
      'source_feed',p_payload->>'source_feed',
      'source_label',p_payload->>'source_label');
  end if;
  h := encode(sha256(convert_to(canonical_payload::text,'UTF8')),'hex');
  insert into evidence_pipeline.import_jobs(canonical_url,input_hash,payload,first_run_id)
    values(u,h,canonical_payload,p_run_id) on conflict(canonical_url,input_hash) do nothing returning id into j;
  if j is null then select id into j from evidence_pipeline.import_jobs where canonical_url=u and input_hash=h; end if;
  insert into evidence_pipeline.import_receipts(run_id,job_id,original_url) values(p_run_id,j,p_payload->>'url') on conflict do nothing;
  return j;
end $$;


create or replace function evidence_pipeline.finish_job(p_job uuid,p_token uuid) returns jsonb
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
    values(coalesce(j.payload->>'source_feed','pipeline-v1'),j.payload->>'outlet',j.payload->>'title',j.canonical_url,j.payload->>'summary',j.payload->>'body_text',
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


commit;
