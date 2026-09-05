-- Run with a database administrator connection. ALL fixture changes roll back.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
set local role service_role;
do $$
declare job uuid; again uuid; lease jsonb; result jsonb; revision_result jsonb; event_row record; candidate uuid;
  run_tag text := 'mip-pipeline-rollback-smoke-'||gen_random_uuid();
  article jsonb; candidate_input jsonb;
begin
  article := jsonb_build_object('url','https://example.org/'||run_tag,'title','Rollback-only pipeline fixture',
    'outlet','MIP synthetic verifier','summary','Cleveland arrival.');
  job := (public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id',run_tag,'article',article))#>>'{}')::uuid;
  again := (public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id',run_tag,'article',article))#>>'{}')::uuid;
  if job<>again then raise exception 'duplicate import created another job'; end if;
  -- Do not consume any unrelated queued job during verification.
  update evidence_pipeline.import_jobs set available_at='-infinity' where id=job;
  lease := public.mip_pipeline_v1('claim');
  if (lease->>'id')::uuid<>job then raise exception 'unrelated queue activity; stop and retry in an isolated environment'; end if;
  result := public.mip_pipeline_v1('finish',jsonb_build_object('job_id',job,'lease_token',lease->>'lease_token'));
  if result->>'outcome'<>'inserted' then raise exception 'canary did not insert'; end if;
  if (select reader_state from public.articles where id=(result->>'article_id')::uuid)<>'pending_review' then raise exception 'import was exposed'; end if;
  begin
    perform public.mip_pipeline_v1('finish',jsonb_build_object('job_id',job,'lease_token',lease->>'lease_token'));
    raise exception 'repeat lease unexpectedly accepted';
  exception when raise_exception then if sqlerrm not like '%lease%' or sqlerrm='repeat lease unexpectedly accepted' then raise; end if; end;
  select * into event_row from public.spatial_projection_v1 order by mip_object_id limit 1;
  if event_row is null then raise exception 'released spatial fixture unavailable'; end if;
  candidate_input := jsonb_build_object('capture_id',result->>'capture_id','candidate_key','fixture-geography','candidate_kind','geography',
    'statement','Synthetic validation only','source_field','summary','span_start',0,'span_end',18,'excerpt','Cleveland arrival.',
    'event_node_id',event_row.subject_graph_node_id,'place_id',event_row.canonical_place_id,'spatial_revision_id',event_row.revision_id,
    'extractor_version','rollback-smoke-v1','remaining_uncertainty','Synthetic test, not evidence.');
  candidate := (public.mip_pipeline_v1('candidate',candidate_input)#>>'{}')::uuid;
  if candidate is null then raise exception 'candidate insert missing'; end if;
  begin
    perform public.mip_pipeline_v1('candidate',candidate_input||'{"excerpt":"invented"}'::jsonb);
    raise exception 'invalid quote unexpectedly accepted';
  exception when raise_exception then if sqlerrm not like '%evidence span%' then raise; end if; end;
  job := (public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id',run_tag,'article',article||'{"title":"Corrected fixture"}'::jsonb))#>>'{}')::uuid;
  update evidence_pipeline.import_jobs set available_at='-infinity' where id=job;
  lease := public.mip_pipeline_v1('claim');
  if (lease->>'id')::uuid<>job then raise exception 'unrelated queue activity'; end if;
  revision_result := public.mip_pipeline_v1('finish',jsonb_build_object('job_id',job,'lease_token',lease->>'lease_token'));
  if revision_result->>'outcome'<>'revision_pending' or revision_result->>'article_id'<>result->>'article_id' then raise exception 'correction overwrote or duplicated article'; end if;
  begin
    update public.articles set reader_state='eligible' where id=(result->>'article_id')::uuid;
    raise exception 'worker unexpectedly has approval rights';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.mip_pipeline_v1('claim'); raise exception 'anonymous writer access'; exception when insufficient_privilege then null; end;
  begin perform 1 from evidence_pipeline.record_versions; raise exception 'anonymous history access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: duplicate reuse, insert-only worker, pending imports, exact spans, canonical geography, correction capture, anonymous denial; rolled back' as smoke_result;
rollback;
