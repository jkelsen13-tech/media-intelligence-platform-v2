-- Historical canary: requires revision 1 head; refuses replay after successful release.
-- Bounded operator source comparison; one private pending-review article/capture.
-- Reviewed primary source: NASA Science, Looking Back on Looking Up, Aug 22 2024.
-- Not a qualified autonomous worker, independent corroboration, or publication.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
set local role service_role;
do $batch$
declare old evidence_pipeline.investigation_versions; q jsonb; j jsonb; cap jsonb; ctx jsonb; assessment jsonb; obs jsonb; result jsonb;
 new_position text; old_position text; original_text text; state jsonb; refs jsonb; v_id uuid:=gen_random_uuid(); o_id uuid:=gen_random_uuid();
 summary text:=$source$In Cleveland, the eclipse began at 1:59 PM EDT, with totality spanning 3:13–3:17 PM. The eclipse concluded at 4:28 PM.$source$;
begin
 select * into old from evidence_pipeline.investigation_versions where id='8e1d032d-f982-4de0-914a-32e99c31d4d1';
 if old.id is null or (select current_version_id from evidence_pipeline.investigations where id=old.investigation_id)<>old.id then raise exception 'expected revision 1 head'; end if;
 if exists(select 1 from evidence_pipeline.import_jobs ij where ij.state in ('pending','processing','retry_wait')) then raise exception 'intake active; do not claim unrelated job'; end if;
 q:=public.mip_pipeline_v1('enqueue',jsonb_build_object('run_id','nasa-bounded-comparison-2026-09-08','article',jsonb_build_object(
  'url','https://science.nasa.gov/science-research/earth-science/looking-back-on-looking-up-the-2024-total-solar-eclipse/',
  'title','Looking Back on Looking Up: The 2024 Total Solar Eclipse','outlet','NASA Science',
  'summary',summary,'published_at',null)));
 j:=public.mip_pipeline_v1('claim');
 if j->'id' is distinct from q then raise exception 'unrelated intake claimed'; end if;
 cap:=public.mip_pipeline_v1('finish',jsonb_build_object('job_id',j->>'id','lease_token',j->>'lease_token'));
 if (select reader_state from public.articles where id=(cap->>'article_id')::uuid)<>'pending_review' then raise exception 'source must remain unpublished'; end if;
 select position::text into new_position from evidence_pipeline.evidence_changes where capture_id=(cap->>'capture_id')::uuid;
 select c.position::text,a.payload->>'summary' into old_position,original_text from evidence_pipeline.evidence_changes c join evidence_pipeline.article_captures a on a.id=c.capture_id where a.id='73a15890-58df-4b7d-8c3d-cb1c67cecddd';
 ctx:=public.mip_assessments_v1('context',jsonb_build_object('candidate_id','6d5caaa5-16b1-4736-b0e5-45f9768eb84c','extra_positions',jsonb_build_array(new_position)));
 assessment:=public.mip_assessments_v1('append',jsonb_build_object(
  'candidate_id','6d5caaa5-16b1-4736-b0e5-45f9768eb84c','algorithm_key','agent-assisted-source-comparison','algorithm_version','nasa-bounded-2026-09-08',
  'outcome','supported','context_positions',ctx->'context_positions','extra_positions',jsonb_build_array(new_position),
  'rationale','Bounded agent-assisted reassessment of source attribution: the retained NASA table summary gives totality 3:13-3:17 p.m. EDT; the separately retained NASA retrospective excerpt also gives 3:13-3:17 PM after identifying EDT. This supports what NASA reports, not an independently measured event time. The primary pages were inspected directly on 2026-09-08 UTC. The retrospective displays Aug 22, 2024 and last updated Apr 30, 2025; an exact publication time is not asserted.',
  'remaining_uncertainty','Both pages are NASA-origin records; independence is not established. Partial-end values differ (4:29 versus 4:28). Observation coordinates, rounding, source correction history and independent timing measurements remain unresolved. Retained text is a summary/excerpt, not full source text. This manual bounded comparison does not qualify an autonomous candidate worker.'));
 obs:=public.mip_investigation_briefings_v1('observe',jsonb_build_object('observation_id',o_id,'previous_observation_id',old.observation_id,
  'candidate_ids',jsonb_build_array('05e33ffd-e36b-4823-9dd2-a0ae68c56067','6d5caaa5-16b1-4736-b0e5-45f9768eb84c')));
 if not (obs->'snapshot'->'selected_assessment_ids' ? (assessment#>>'{}')) then raise exception 'new assessment missing from snapshot'; end if;
 refs:=jsonb_build_array(
  jsonb_build_object('position',old_position,'source_field','summary','span_start',0,'span_end',length(original_text),'excerpt',original_text,'relation','supports','note','Retained NASA table summary supports the reported totality interval; the table was rechecked directly.'),
  jsonb_build_object('position',new_position,'source_field','summary','span_start',0,'span_end',length(summary),'excerpt',summary,'relation','supports','note','Exact two-sentence retrospective excerpt supports the same reported totality interval. Same NASA origin; not independent corroboration.'));
 state:=old.state;
 state:=jsonb_set(state,'{scope_note}',to_jsonb('Bounded comparison of the existing NASA table summary and one newly retained two-sentence NASA retrospective excerpt. The totality interval agrees; partial-eclipse end time differs by one minute. This is a source-attribution assessment, not independent event verification. Geography remains outside the private assessment scope.'::text));
 state:=jsonb_set(state,'{hypotheses}',jsonb_build_array(
  jsonb_build_object('id',gen_random_uuid(),'statement','Both retained NASA sources report Cleveland totality from 3:13 to 3:17 p.m. EDT.','assessment_ids',jsonb_build_array(assessment),'evidence',refs,
    'assumptions',jsonb_build_array('The retrospective PM interval uses the EDT context stated in the same sentence.'),
    'would_strengthen',jsonb_build_array('Retained precise-location timing data and independent observations.'),
    'would_weaken',jsonb_build_array('A retained NASA correction changing the totality interval or event identity.'),
    'remaining_uncertainty','Agreement is within one institutional source family; it does not resolve timing precision or independent corroboration.'),
  jsonb_build_object('id',gen_random_uuid(),'statement','The retained NASA sources agree on the partial-eclipse end time.','assessment_ids','[]'::jsonb,
    'evidence',jsonb_build_array(
      refs->0 || jsonb_build_object('relation','context','note','The retained table summary reports partial ends 4:29 p.m. EDT.'),
      refs->1 || jsonb_build_object('relation','contradicts','note','The retrospective reports 4:28 PM, one minute earlier than the table. This contradicts exact agreement between these reports, not necessarily either physical observation.')),
    'assumptions',jsonb_build_array('Both city-level reports refer to the Cleveland event; precise observation coordinates are not retained.'),
    'would_strengthen',jsonb_build_array('A source correction or location/rounding explanation reconciling the values.'),
    'would_weaken',jsonb_build_array('Additional retained records confirming different values for the same precisely specified location.'),
    'remaining_uncertainty','The discrepancy is unresolved. No correction, retraction, falsehood or changed totality interval is inferred.')));
 state:=jsonb_set(state,'{coverage}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'label','Bounded NASA table and retrospective comparison','status','limited',
  'source_classes',jsonb_build_array('NASA Science table','NASA Science retrospective'),'languages',jsonb_build_array('en'),'regions',jsonb_build_array('Cleveland, Ohio, United States'),
  'from',old.state->'time_range'->'from','to',old.state->'time_range'->'to','retained_text','summary_only','search_status','completed_for_declared_scope',
  'searched_at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'method','Directly inspected the NASA Where & When table and Looking Back on Looking Up retrospective. Retained one additional exact two-sentence excerpt. No general crawl, external autonomous retrieval, or independent-source search was completed.',
  'limitations',jsonb_build_array('Two NASA-origin pages do not establish independence.','Source publication dates have day precision; exact publication timestamps remain absent.','Full texts, correction history and precise timing coordinates are not retained.','The one-minute partial-end discrepancy is unresolved.'))));
 state:=jsonb_set(state,'{unresolved_questions}',(old.state->'unresolved_questions')||jsonb_build_array('Why does the NASA retrospective report 4:28 PM while the table reports 4:29 p.m. EDT for partial-eclipse end?'));
 result:=public.mip_investigation_workspace_v1('put',jsonb_build_object('investigation_id',old.investigation_id,'version_id',v_id,'previous_version_id',old.id,'observation_id',o_id,'state',state,
  'change_reason','Explicit bounded reassessment adds a retained NASA retrospective: matching reported totality and a one-minute partial-end discrepancy; independent verification remains unresolved.'));
 if md5((select to_jsonb(x)::text from evidence_pipeline.investigation_versions x where id=old.id))<>'ba4b3667e94ab2fbb63ca594ac95328a' then raise exception 'revision 1 changed'; end if;
 if (select count(*) from public.articles where reader_state='eligible' and source_status='active')<>3 then raise exception 'public feed changed'; end if;
 if (select count(*) from evidence_pipeline.change_jobs cj where cj.id in ('c67dc1f6-7318-4c13-ae05-53769dc39b94','2c34170d-2ba2-429d-becf-a41430903ebe','e83e921f-e0ea-461d-be5c-72d223d1cef1','ccff0012-0dfd-4710-8057-148da9200140','0c437f64-a5a0-45a0-a362-e36252101991','af5d65e6-69dc-4c9a-8eb0-21a9f050352a') and cj.state='pending' and cj.attempt_count=0)<>6 then raise exception 'original candidate backlog changed'; end if;
end $batch$;
rollback;
select 'bounded NASA revision 2 canary passed; rolled back' result;
