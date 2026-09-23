-- Isolated nie event/article custody finish. Candidate only: do not apply on live qik
-- without separate schema authorization. Requires installed legacy_graph_staging v1.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function legacy_graph_staging.finish_nie_parent_job(
  p_job uuid, p_token uuid, p_run text, p_page_sha256 text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  job legacy_graph_staging.import_jobs%rowtype;
  rec jsonb;
  staged jsonb := '[]'::jsonb;
  item jsonb;
  expected_fields text[];
  expected_family text;
  actual_fields text[];
  n integer := 0;
begin
  update legacy_graph_staging.import_jobs
    set cursor_after_id = cursor_after_id
    where id = p_job
      and run_id = p_run
      and page_sha256 = p_page_sha256
      and source_project_ref = 'niejaejtbxgakyrsntxm'
      and source_table in ('events', 'articles')
      and lease_token = p_token
      and state = 'processing'
      and lease_expires_at is not null
      and lease_expires_at > clock_timestamp()
    returning * into job;
  if job.id is null then
    raise exception 'invalid or expired nie parent job lease';
  end if;
  if job.page_size <> jsonb_array_length(job.page)
     or job.page_size < 1 or job.page_size > 100
     or legacy_graph_staging.fingerprint_payload(job.page) <> p_page_sha256 then
    raise exception 'nie parent job page mismatch';
  end if;
  if job.source_table = 'events' then
    expected_family := 'source_comparison_event';
    expected_fields := array[
      'arc_event_id','arc_id','canonical_title','created_at','id','location_text',
      'occurred_at_end','occurred_at_start','rule_version','status'
    ];
  else
    expected_family := 'article';
    expected_fields := array[
      'arc_assign_attempted_at','arc_assignment_evidence','arc_id','author_id','body_text',
      'claims','different_causal_chain','embedding','entities_extracted_at','feed','fetched_at',
      'id','image_alt','image_url','ingestion_run_id','is_digest','monoculture','outlet',
      'outlet_id','published_at','source_status','source_status_changed_at','source_status_note',
      'summary','title','unattributed','url','is_pre_ruling'
    ];
  end if;
  select array_agg(k order by k) into expected_fields
    from unnest(expected_fields) as keys(k);
  for rec in select value from jsonb_array_elements(job.page) as rows(value)
  loop
    select array_agg(k order by k) into actual_fields
      from jsonb_object_keys(rec->'payload') as keys(k);
    if (rec->>'source_project_ref') is distinct from job.source_project_ref
       or (rec->>'source_table') is distinct from job.source_table
       or (rec->>'source_id') is distinct from (rec->'payload'->>'id')
       or (rec->>'object_family') is distinct from expected_family
       or actual_fields is distinct from expected_fields
       or (rec->'payload_json') is null
       or ((rec->>'payload_json')::jsonb) is distinct from (rec->'payload')
       or (rec->>'source_imported_at') is not null
       or (rec->>'recovery_status') is not null then
      raise exception 'nie parent job record outside exact custody contract';
    end if;
    item := legacy_graph_staging.stage_record(job.id, job.run_id, rec);
    staged := staged || jsonb_build_array(item);
    n := n + 1;
  end loop;

  -- Event and article parents have no graph endpoint validation. The generic
  -- finish_job scans every staged dependent row; this scoped finish does not.
  update legacy_graph_staging.import_jobs
    set state = 'completed', lease_token = null, lease_expires_at = null,
        processed_count = n,
        cursor_after_id = nullif((job.page->-1->>'source_id'), '')::uuid
    where id = job.id and run_id = p_run and lease_token = p_token and state = 'processing'
    returning * into job;
  if job.id is null then
    raise exception 'nie parent job lease superseded';
  end if;
  insert into legacy_graph_staging.job_events(job_id, event_kind, detail)
  values (job.id, 'finished_nie_parent', jsonb_build_object('processed', n));
  return jsonb_build_object(
    'job_id', job.id, 'run_id', job.run_id, 'state', job.state,
    'staged', n, 'results', legacy_graph_staging.job_results(job.id, job.page, staged)
  );
end; $$;

revoke all on function legacy_graph_staging.finish_nie_parent_job(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function legacy_graph_staging.finish_nie_parent_job(uuid,uuid,text,text)
  to service_role;
comment on function legacy_graph_staging.finish_nie_parent_job(uuid,uuid,text,text) is
  'Exact nie event/article parent finish; no global endpoint validation, no publication.';
commit;
