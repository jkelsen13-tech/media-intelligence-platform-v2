-- Read-only structural inventory; contains no evidence payloads or credentials.
select
 (select count(*) from evidence_pipeline.evidence_changes) as retained_changes,
 (select count(*) from evidence_pipeline.change_jobs) as jobs,
 (select count(*) from evidence_pipeline.change_jobs j left join evidence_pipeline.evidence_changes c on c.position=j.change_position where c.position is null) as orphan_jobs,
 (select count(*) from (select change_position,route,contract_version from evidence_pipeline.change_jobs group by 1,2,3 having count(*)>1) d) as duplicate_job_keys,
 (select count(*) from evidence_pipeline.change_jobs j where state='completed' and not exists(select 1 from evidence_pipeline.change_job_events e where e.job_id=j.id and e.event='completed')) as completed_without_history,
 (select count(*) from evidence_pipeline.change_jobs where state='processing' and (lease_token is null or lease_expires_at is null)) as processing_without_lease,
 (select jsonb_agg(to_jsonb(s)) from (select route,state,count(*) as jobs from evidence_pipeline.change_jobs group by route,state order by route,state) s) as state_counts;
