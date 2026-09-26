-- Execute-only permanent caller seam over the existing native queue.
-- No login credential, scheduler, new queue, or publication authority is installed.
grant update(native_job_id) on qik_ingest.observed_items to qik_ingest_fn_owner;
grant usage on schema evidence_pipeline to qik_ingest_fn_owner;
grant select,insert on evidence_pipeline.import_jobs,evidence_pipeline.import_receipts,
  evidence_pipeline.article_identities,evidence_pipeline.article_captures,
  evidence_pipeline.evidence_candidates to qik_ingest_fn_owner;
grant update(state,attempt_count,available_at,lease_token,lease_expires_at,error_code,
  article_id,outcome,completed_at) on evidence_pipeline.import_jobs to qik_ingest_fn_owner;
grant insert on evidence_pipeline.job_events,evidence_pipeline.record_versions to qik_ingest_fn_owner;
grant select(id,record_kind,record_key,ordinal) on evidence_pipeline.record_versions to qik_ingest_fn_owner;
grant usage on sequence evidence_pipeline.job_events_id_seq to qik_ingest_fn_owner;
grant insert(feed,outlet,title,url,summary,body_text,published_at,ingestion_run_id)
  on public.articles to qik_ingest_fn_owner;
grant select(id,type) on public.nodes to qik_ingest_fn_owner;
grant select(revision_id,canonical_place_id,subject_graph_node_id)
  on public.spatial_projection_v1 to qik_ingest_fn_owner;
grant execute on function evidence_pipeline.enqueue(text,jsonb),
 evidence_pipeline.canonical_url(text),evidence_pipeline.finish_job(uuid,uuid),
 evidence_pipeline.append_candidate(jsonb),
 evidence_pipeline.append_version(text,text,text,jsonb,text),
 public.mip_qik_ingest_claim_bound(uuid[]),
 public.mip_qik_ingest_bound_job_states(uuid[]),
 public.mip_qik_ingest_capture_for_job(uuid,uuid) to qik_ingest_fn_owner;

-- Only the NOLOGIN function owner receives these substrate privileges.
do $$ declare tab text; begin
 foreach tab in array array['import_jobs','import_receipts','article_identities',
   'article_captures','evidence_candidates','record_versions'] loop
   execute format('create policy qik_ingest_native_select on evidence_pipeline.%I for select to qik_ingest_fn_owner using(true)',tab);
 end loop;
 foreach tab in array array['import_jobs','import_receipts','article_identities',
   'article_captures','evidence_candidates','record_versions','job_events'] loop
   execute format('create policy qik_ingest_native_insert on evidence_pipeline.%I for insert to qik_ingest_fn_owner with check(true)',tab);
 end loop;
 -- The installed evidence change triggers are optional in the small fixture.
 -- When present, they append notifications; no discovery worker authority.
 if to_regclass('evidence_pipeline.evidence_changes') is not null then
   grant insert on evidence_pipeline.evidence_changes,evidence_pipeline.change_jobs to qik_ingest_fn_owner;
   grant select(capture_id,record_version_id) on evidence_pipeline.evidence_changes to qik_ingest_fn_owner;
   grant usage on sequence evidence_pipeline.evidence_changes_position_seq to qik_ingest_fn_owner;
   create policy qik_ingest_native_select on evidence_pipeline.evidence_changes for select to qik_ingest_fn_owner using(true);
   create policy qik_ingest_native_insert on evidence_pipeline.evidence_changes for insert to qik_ingest_fn_owner with check(true);
   create policy qik_ingest_native_insert on evidence_pipeline.change_jobs for insert to qik_ingest_fn_owner with check(true);
 end if;
end $$;
create policy qik_ingest_native_update on evidence_pipeline.import_jobs
 for update to qik_ingest_fn_owner using(true) with check(true);
create policy qik_ingest_native_article_insert on public.articles
 for insert to qik_ingest_fn_owner with check(reader_state='pending_review');

create function public.mip_qik_ingest_native(p_token text,p_run_id text,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare obs qik_ingest.observed_items; ids uuid[]; jid uuid; cid uuid; result jsonb;
 hash text := encode(sha256(convert_to(p_token,'UTF8')),'hex');
begin
 perform qik_ingest.require_token(p_token);
 if not coalesce((select collection_authorized from qik_ingest.collection_gate where id),false)
   then raise exception 'qik_ingest_collection_not_authorized' using errcode='42501'; end if;
 -- Hold the run row through this transaction. Finalization uses the same lock;
 -- PostgreSQL rechecks the running predicate after a concurrent writer commits.
 perform 1 from public.ingestion_runs where run_id=p_run_id and state='running' for update;
 if not found
   then raise exception 'qik_ingest_run_not_running' using errcode='55000'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object'
   then raise exception 'qik_ingest_native_input_invalid' using errcode='22023'; end if;
 if p_action='enqueue' then
   if exists(select 1 from jsonb_object_keys(p_input) k where k<>'observation_id')
     then raise exception 'qik_ingest_native_input_invalid' using errcode='22023'; end if;
   select * into obs from qik_ingest.observed_items
    where id=(p_input->>'observation_id')::uuid and run_id=p_run_id and credential_hash=hash for update;
   if not found then raise exception 'qik_ingest_native_binding_denied' using errcode='42501'; end if;
   if not exists(select 1 from public.ingest_sources where id=obs.source_id and enabled and collection_enabled)
     then raise exception 'qik_ingest_source_not_enabled' using errcode='42501'; end if;
   if obs.native_job_id is null then
     jid:=evidence_pipeline.enqueue(p_run_id,jsonb_build_object('url',obs.url,'title',obs.title,
       'outlet',obs.outlet,'summary',obs.summary,'body_text',obs.body_text,'published_at',obs.published_at));
     update qik_ingest.observed_items set native_job_id=jid where id=obs.id;
   else jid:=obs.native_job_id; end if;
   return to_jsonb(jid);
 end if;
 if p_action in ('claim','states') then
   if exists(select 1 from jsonb_object_keys(p_input) k where k<>'job_ids')
      or jsonb_typeof(p_input->'job_ids') is distinct from 'array'
     then raise exception 'qik_ingest_native_input_invalid' using errcode='22023'; end if;
   select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_input->'job_ids');
 else
   jid:=(p_input->>'job_id')::uuid;
   ids:=array[jid];
 end if;
 if coalesce(cardinality(ids),0)=0 or cardinality(ids)>100 or exists(
   select 1 from unnest(ids) j(id) where j.id is null or not exists(
     select 1 from qik_ingest.observed_items o
     join evidence_pipeline.import_receipts r on r.job_id=o.native_job_id and r.run_id=o.run_id
     where o.native_job_id=j.id and o.run_id=p_run_id and o.credential_hash=hash))
   then raise exception 'qik_ingest_native_binding_denied' using errcode='42501'; end if;
 case p_action
 when 'claim' then return public.mip_qik_ingest_claim_bound(ids);
 when 'states' then return public.mip_qik_ingest_bound_job_states(ids);
 when 'finish' then
   if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('job_id','lease_token'))
     then raise exception 'qik_ingest_native_input_invalid' using errcode='22023'; end if;
   return evidence_pipeline.finish_job(jid,(p_input->>'lease_token')::uuid);
 when 'capture' then
   if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('job_id','capture_id'))
     then raise exception 'qik_ingest_native_input_invalid' using errcode='22023'; end if;
   return public.mip_qik_ingest_capture_for_job(jid,(p_input->>'capture_id')::uuid);
 when 'candidate' then
   if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('job_id','candidate'))
      or jsonb_typeof(p_input->'candidate') is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(p_input->'candidate') k where k not in
       ('capture_id','candidate_key','candidate_kind','statement','source_field','span_start','span_end','excerpt','extractor_version','remaining_uncertainty'))
      or p_input->'candidate'->>'candidate_kind' is distinct from 'claim'
     then raise exception 'qik_ingest_native_candidate_forbidden' using errcode='42501'; end if;
   cid:=(p_input->'candidate'->>'capture_id')::uuid;
   perform public.mip_qik_ingest_capture_for_job(jid,cid);
   return to_jsonb(evidence_pipeline.append_candidate(p_input->'candidate'));
 else raise exception 'qik_ingest_native_action_forbidden' using errcode='42501';
 end case;
end $$;
revoke all on function public.mip_qik_ingest_native(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mip_qik_ingest_native(text,text,text,jsonb) to qik_ingest_runtime;
-- Ownership transfer requires target CREATE even with explicit SET membership.
grant create on schema public to qik_ingest_fn_owner;
alter function public.mip_qik_ingest_native(text,text,text,jsonb) owner to qik_ingest_fn_owner;
revoke create on schema public from qik_ingest_fn_owner;
