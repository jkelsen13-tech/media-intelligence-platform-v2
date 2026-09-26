-- Private accepted comparison readback only. Install after 017.
-- No browser grants, public projection writes, or graph/timeline inference.
begin;
do $prerequisites$
begin
 if to_regprocedure('mip_identity.validate_review_before_native_v4(uuid)') is null
 or to_regprocedure('mip_identity.release_isolated(uuid,uuid,text,uuid)') is null then
  raise exception 'mip_comparison_reader_prerequisites_missing';
 end if;
end $prerequisites$;

create function mip_identity.read_isolated_comparison(p_session uuid,p_runtime text,p_release_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt mip_identity.private_releases;rev mip_identity.publication_reviews;
 g comparison_qualification.generations;approved jsonb;validated jsonb;result jsonb;
 event_input jsonb;event_id text;events jsonb:='[]';sources jsonb;claims jsonb;
 surface jsonb;member jsonb;capture jsonb;candidate jsonb;evidence jsonb;bound jsonb;
begin
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 -- Same fence order as staging; source changes and policy changes cannot race
 -- validation with materialization of this single response.
 perform 1 from mip_identity.collector_fence where id for share;
 perform 1 from mip_cutover_authority.publication_fence where id for share;
 select * into receipt from mip_identity.private_releases where request_id=p_release_request;
 if not found then raise exception 'mip_reader_release_missing';end if;
 if receipt.runtime is distinct from p_runtime then raise exception 'mip_reader_release_scope';end if;
 select * into strict rev from mip_identity.publication_reviews where revision=receipt.review_revision;
 select * into strict g from comparison_qualification.generations where id=rev.generation_id;
 perform comparison_qualification.require_source_scope(p_runtime,g.source_project);
 perform comparison_qualification.require_evaluated_implementation(p_runtime,g.implementation_ref);
 validated:=mip_identity.validate_review(rev.revision);
 approved:=mip_cutover_authority.check_publication_payload(receipt.approved_payload_id);
 if not exists(select 1 from mip_identity.review_stages
   where review_revision=rev.revision and approved_payload_id=receipt.approved_payload_id)
 or not exists(select 1 from mip_cutover_authority.publication_selections
   where approved_payload_id=receipt.approved_payload_id)
 or approved is distinct from validated
 or receipt.payload_hash is distinct from comparison_qualification.argument_digest(approved) then
  raise exception 'mip_reader_release_binding';
 end if;

 for event_input in select value from jsonb_array_elements(g.input_payload->'eventInputs') loop
  event_id:=event_input#>>'{event,id}';sources:='[]';evidence:='[]';
  select coalesce(jsonb_agg(value),'[]') into claims
   from jsonb_array_elements(approved#>'{projection,claims}') where value->>'event_id'=event_id;
  for member in select value from jsonb_array_elements(event_input->'members') loop
   capture:=member->'retained_capture';
   sources:=sources||jsonb_build_array(jsonb_build_object(
    'article_id',member#>>'{article,id}','capture_id',capture->>'capture_id',
    'content_hash',capture->>'content_hash','publisher_url',capture#>>'{payload,url}',
    'publisher',capture#>>'{payload,outlet}','source_key',capture#>'{payload,source_key}',
    'source_feed',capture#>'{payload,source_feed}','membership',member->'membership',
    'publication',jsonb_build_object('kind','publisher_publication',
      'at',capture#>'{payload,published_at}','source_field','article_captures.payload.published_at')));
  end loop;
  for surface in select a.value from jsonb_array_elements(approved#>'{projection,article_claims}') a
   where exists(select 1 from jsonb_array_elements(claims) c where c.value->>'claim_key'=a.value->>'claim_key') loop
   select value into strict member from jsonb_array_elements(event_input->'members')
    where value#>>'{article,id}'=surface->>'article_id';
   capture:=member->'retained_capture';
   -- Select the evidence actually validated by 017. Extra review entries must
   -- never become reader citations merely because another entry was valid.
   select k.value into candidate
   from jsonb_array_elements(capture->'candidates') k
   join jsonb_array_elements(rev.evidence) e on e.value->>'candidate_id'=k.value->>'candidate_id'
   where e.value->>'article_id'=surface->>'article_id' and e.value->>'claim_key'=surface->>'claim_key'
    and k.value->>'candidate_kind'='claim' and k.value->>'review_state'='pending'
    and e.value->>'capture_id'=capture->>'capture_id' and k.value->>'capture_id'=capture->>'capture_id'
    and e.value->>'content_hash'=capture->>'content_hash'
    and e.value->>'field'=k.value->>'source_field'
    and e.value->'span_start'=k.value->'span_start' and e.value->'span_end'=k.value->'span_end'
    and e.value->>'excerpt'=k.value->>'excerpt' and k.value->>'excerpt'=surface->>'surface_text'
    and k.value->>'excerpt'=substring(capture->'payload'->>(k.value->>'source_field')
     from (k.value->>'span_start')::int+1 for (k.value->>'span_end')::int-(k.value->>'span_start')::int)
   order by k.value->>'candidate_id' limit 1;
   if candidate is null then raise exception 'mip_reader_evidence_unbound';end if;
   bound:=jsonb_build_object('article_id',surface->>'article_id','claim_key',surface->>'claim_key',
    'capture_id',capture->>'capture_id','content_hash',capture->>'content_hash',
    'candidate_id',candidate->>'candidate_id','source_field',candidate->>'source_field',
    'span_start',candidate->'span_start','span_end',candidate->'span_end',
    'span_units','unicode_code_points','excerpt',candidate->>'excerpt',
    'extractor_version',candidate->>'extractor_version','candidate_review_state','pending',
    'review_revision',rev.revision);
   evidence:=evidence||jsonb_build_array(bound);
  end loop;
  events:=events||jsonb_build_array(jsonb_build_object(
   -- Legacy comparison v15 populated these date columns from publication
   -- dates. Comparison claim review does not establish temporal attribution.
   -- Keep the raw fields in an explicitly unverified proxy, never in the
   -- event's usable occurrence fields or a fabricated precision interval.
   'event',(event_input->'event')-'occurred_at_start'-'occurred_at_end',
   'sources',sources,'claims',claims,'evidence',evidence,
   'occurrence',jsonb_build_object('kind','event_occurrence','state','unverified',
    'start',null,'end',null,'precision','unknown',
    'reason','independent_temporal_attribution_missing'),
   'retained_event_date_proxy',jsonb_build_object('kind','unverified_event_date_proxy',
    'basis','publication_derived_or_unknown','occurrence_verified',false,
    'start',event_input#>'{event,occurred_at_start}','end',event_input#>'{event,occurred_at_end}',
    'source_fields',jsonb_build_array('events.occurred_at_start','events.occurred_at_end'),
    'precision','unknown')));
 end loop;
 result:=jsonb_build_object('contract_version','accepted-comparison-private-v2',
  'audience','isolated_internal_review','release_request',receipt.request_id,
  'generation_id',g.id,'source_project',g.source_project,'implementation_ref',g.implementation_ref,
  'input_hash',rev.input_hash,'output_hash',rev.output_hash,'approved_payload_hash',receipt.payload_hash,
  'review_revision',rev.revision,'policy_revision',rev.policy_revision,
  'observation',jsonb_build_object('kind','generation_source_observation','at',g.source_observed_at),
  'events',events,'explanations',approved#>'{projection,explanations}',
  'evidence_links',approved->'evidence_links','corrections',approved->'corrections');
 -- Session revocation is also checked at the return boundary.
 perform mip_identity.authorize(p_session,p_runtime,'mip_projection_publisher_v1');
 return result;
end $$;
alter function mip_identity.read_isolated_comparison(uuid,text,uuid) owner to mip_publication_owner_v2;
revoke all on function mip_identity.read_isolated_comparison(uuid,text,uuid)
 from public,anon,authenticated,service_role,mip_comparison_worker_v1,mip_comparison_producer_v1;
grant execute on function mip_identity.read_isolated_comparison(uuid,text,uuid) to mip_projection_publisher_v1;
commit;
