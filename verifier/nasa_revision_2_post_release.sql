-- Read-only post-release verification; no job claims, review writes or ingestion.
select
 (select md5(to_jsonb(v)::text)='ba4b3667e94ab2fbb63ca594ac95328a' from evidence_pipeline.investigation_versions v where id='8e1d032d-f982-4de0-914a-32e99c31d4d1') revision_1_unchanged,
 (select revision=2 and predecessor_id='8e1d032d-f982-4de0-914a-32e99c31d4d1' from evidence_pipeline.investigation_versions where id='6bec5ecf-904f-4b8a-a328-4f611b0a23f0') revision_2_lineage,
 (select count(*)=3 from public.articles where reader_state='eligible' and source_status='active') eligible_feed_unchanged,
 (select reader_state='pending_review' from public.articles where id='377489a8-63f1-4226-9ef0-2479e7461843') new_source_unpublished,
 (select count(*)=6 from evidence_pipeline.change_jobs where id in ('c67dc1f6-7318-4c13-ae05-53769dc39b94','2c34170d-2ba2-429d-becf-a41430903ebe','e83e921f-e0ea-461d-be5c-72d223d1cef1','ccff0012-0dfd-4710-8057-148da9200140','0c437f64-a5a0-45a0-a362-e36252101991','af5d65e6-69dc-4c9a-8eb0-21a9f050352a') and state='pending' and attempt_count=0) original_jobs_untouched,
 (select count(*)=0 from evidence_pipeline.worker_evaluations) no_synthetic_qualification,
 (select version_id='6bec5ecf-904f-4b8a-a328-4f611b0a23f0' and previous_receipt_id='b063f36d-9fa0-48b4-a306-d91ca02e48f0' from evidence_pipeline.investigation_review_receipts where id='82d73ee6-e16a-4f5c-81e4-8475735e77ea') explicit_review_chain,
 (select outcome='supported' and release_state='private' from evidence_pipeline.assessments where id='429c5023-bab6-421d-adb7-32340c458611') private_source_assessment,
 (select count(*)=1 from evidence_pipeline.investigation_evidence_check_reports where id='67806afa-df2b-4b86-b6a3-3bd0589b5d31' and version_id='6bec5ecf-904f-4b8a-a328-4f611b0a23f0') durable_check_report;
