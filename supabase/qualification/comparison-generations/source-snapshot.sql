-- Isolated qualification only. Load after contract.sql and disposable source fixtures.
begin;
-- Native lineage is optional for legacy qualification input, mandatory at 017
-- admission. Missing native owners are represented as NULL, never fabricated.
create function comparison_qualification.native_capture_lineage(p_article uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;bytes_valid boolean;
begin
 if to_regclass('evidence_pipeline.article_captures') is null
 or to_regclass('evidence_pipeline.evidence_candidates') is null then return null;end if;
 execute $read$
 select jsonb_build_object('contract_version','native-capture-lineage-v2',
  'capture_id',c.id,'article_id',c.article_id,
  'content_hash',c.content_hash,'review_state',c.review_state,
  'source_metadata',jsonb_build_object('url',c.payload->'url','outlet',c.payload->'outlet',
    'source_key',c.payload->'source_key','source_feed',c.payload->'source_feed',
    'published_at',c.payload->'published_at'),
  'candidates',coalesce((select jsonb_agg(jsonb_build_object(
    'candidate_id',k.id,'capture_id',k.capture_id,'candidate_kind',k.candidate_kind,
    'source_field',k.source_field,'span_start',k.span_start,'span_end',k.span_end,
    'excerpt',k.excerpt,'field_hash',encode(sha256(convert_to(c.payload->>k.source_field,'UTF8')),'hex'),
    'predecessor_candidate_id',k.predecessor_candidate_id,'extractor_version',k.extractor_version,
    'review_state',k.review_state) order by k.id)
   from evidence_pipeline.evidence_candidates k where k.capture_id=c.id
    and not exists(select 1 from evidence_pipeline.evidence_candidates successor
      where successor.predecessor_candidate_id=k.id)),'[]'::jsonb)),
  c.content_hash is not distinct from encode(sha256(convert_to(c.payload::text,'UTF8')),'hex')
  and not exists(select 1 from evidence_pipeline.evidence_candidates k
    where k.capture_id=c.id and not exists(
      select 1 from evidence_pipeline.evidence_candidates successor where successor.predecessor_candidate_id=k.id)
    and (jsonb_typeof(c.payload->k.source_field) is distinct from 'string'
      or k.span_start<0 or k.span_end<=k.span_start
      or k.span_end>char_length(c.payload->>k.source_field)
      or k.excerpt is distinct from substring(c.payload->>k.source_field
        from k.span_start+1 for k.span_end-k.span_start)))
 from evidence_pipeline.article_captures c where c.article_id=$1
 order by c.captured_at desc,c.id desc limit 1
 $read$ into result,bytes_valid using p_article;
 -- Raw native bytes are used only in this restricted statement; never returned.
 if result is not null and bytes_valid is distinct from true then
  raise exception 'mip_native_capture_bytes_invalid';end if;
 -- Reject nested metadata before the first durable source snapshot.
 if result is not null and exists(select 1 from jsonb_each(result->'source_metadata') kv
   where jsonb_typeof(kv.value) not in ('string','null'))
 then raise exception 'mip_native_lineage_shape';end if;
 return result;
end $$;
revoke all on function comparison_qualification.native_capture_lineage(uuid)
 from public,anon,authenticated,service_role;

-- Pure contract guard used before either durable worker-output boundary.
-- Dispatch is bound to the saved generation, never a caller's output marker.
create function comparison_qualification.check_native_lineage_output(p_input jsonb,p_output jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare entry jsonb;capture jsonb;candidate jsonb;expected jsonb;item jsonb;field text;scalar jsonb;projection jsonb;
 capture_keys text[]:=array['contract_version','capture_id','article_id','content_hash','review_state','source_metadata','candidates'];
 metadata_keys text[]:=array['url','outlet','source_key','source_feed','published_at'];
 candidate_keys text[]:=array['candidate_id','capture_id','candidate_kind','source_field','span_start','span_end','excerpt','field_hash','predecessor_candidate_id','extractor_version','review_state'];
begin
 if not(p_input?'native_lineage_version') then return;end if;
 if p_input->>'native_lineage_version' is distinct from 'native-capture-lineage-v2'
 then raise exception 'mip_native_lineage_version';end if;
 for entry in select m.value from jsonb_array_elements(p_input->'eventInputs') e
   cross join lateral jsonb_array_elements(e.value->'members') m loop
  capture:=entry->'retained_capture';
  if capture is null or capture='null'::jsonb then continue;end if;
  if jsonb_typeof(capture) is distinct from 'object' or not(capture?&capture_keys)
   or (capture-capture_keys)<>'{}'::jsonb
   or capture->>'contract_version' is distinct from 'native-capture-lineage-v2'
   or jsonb_typeof(capture->'source_metadata') is distinct from 'object'
   or not((capture->'source_metadata')?&metadata_keys)
   or ((capture->'source_metadata')-metadata_keys)<>'{}'::jsonb
   or jsonb_typeof(capture->'candidates') is distinct from 'array'
  then raise exception 'mip_native_lineage_shape';end if;
  if exists(select 1 from jsonb_each(capture->'source_metadata') kv where jsonb_typeof(kv.value) not in ('string','null'))
   or exists(select 1 from jsonb_each(capture-'source_metadata'-'candidates') kv where jsonb_typeof(kv.value)<>'string')
  then raise exception 'mip_native_lineage_shape';end if;
  for candidate in select value from jsonb_array_elements(capture->'candidates') loop
   if jsonb_typeof(candidate) is distinct from 'object' or not(candidate?&candidate_keys)
    or (candidate-candidate_keys)<>'{}'::jsonb
    or exists(select 1 from jsonb_each(candidate-array['span_start','span_end','predecessor_candidate_id']) kv where jsonb_typeof(kv.value)<>'string')
    or jsonb_typeof(candidate->'predecessor_candidate_id') not in ('string','null')
    or jsonb_typeof(candidate->'span_start') is distinct from 'number'
    or jsonb_typeof(candidate->'span_end') is distinct from 'number'
    or (candidate->>'span_start') !~ '^[0-9]+$' or (candidate->>'span_end') !~ '^[0-9]+$'
    or candidate->>'field_hash' !~ '^[0-9a-f]{64}$'
   then raise exception 'mip_native_lineage_shape';end if;
  end loop;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('event_id',e.value#>>'{event,id}',
   'article_id',m.value#>>'{article,id}','retained_capture',m.value->'retained_capture')
   order by e.ordinality,m.ordinality),'[]'::jsonb) into expected
 from jsonb_array_elements(p_input->'eventInputs') with ordinality e
 cross join lateral jsonb_array_elements(e.value->'members') with ordinality m;
 if jsonb_typeof(p_output) is distinct from 'object'
  or (p_output-array['projection','generation_id','input_hash','implementation_ref',
    'source_observed_at','snapshot_metadata','lineage_review_state','retained_lineage'])<>'{}'::jsonb
  or expected is distinct from p_output->'retained_lineage'
  or p_output->>'lineage_review_state' is distinct from 'pending'
 then raise exception 'mip_native_generation_lineage_mismatch';end if;

 -- V2 output schemas prevent native bytes reappearing in nested diagnostics.
 if jsonb_typeof(p_output->'snapshot_metadata') is distinct from 'object'
  or not((p_output->'snapshot_metadata')?&array['database_snapshot','statement_started_at','scope'])
  or ((p_output->'snapshot_metadata')-array['database_snapshot','statement_started_at','scope'])<>'{}'::jsonb
  or exists(select 1 from jsonb_each(p_output->'snapshot_metadata') kv where jsonb_typeof(kv.value)<>'string')
  or (p_output->'snapshot_metadata') is distinct from (p_input->'snapshot_metadata')
  or exists(select 1 from jsonb_each(p_output-array['projection','snapshot_metadata','retained_lineage']) kv where jsonb_typeof(kv.value)<>'string')
 then raise exception 'mip_native_output_shape';end if;
 projection:=p_output->'projection';
 if jsonb_typeof(projection) is distinct from 'object'
  or not(projection?&array['claims','article_claims','explanations','stats'])
  or (projection-array['claims','article_claims','explanations','stats'])<>'{}'::jsonb
  or jsonb_typeof(projection->'claims') is distinct from 'array'
  or jsonb_typeof(projection->'article_claims') is distinct from 'array'
  or jsonb_typeof(projection->'explanations') is distinct from 'array'
  or jsonb_typeof(projection->'stats') is distinct from 'object'
 then raise exception 'mip_native_output_shape';end if;
 for item in select value from jsonb_array_elements(projection->'claims') loop
  if jsonb_typeof(item) is distinct from 'object'
   or not(item?&array['claim_key','event_id','canonical_text','claim_kind','thin_extraction','status','rule_version'])
   or (item-array['claim_key','event_id','canonical_text','claim_kind','thin_extraction','status','rule_version'])<>'{}'::jsonb
   or jsonb_typeof(item->'thin_extraction') is distinct from 'boolean'
   or exists(select 1 from jsonb_each(item-'thin_extraction') kv where jsonb_typeof(kv.value)<>'string')
  then raise exception 'mip_native_output_shape';end if;
 end loop;
 for item in select value from jsonb_array_elements(projection->'article_claims') loop
  if jsonb_typeof(item) is distinct from 'object'
   or not(item?&array['claim_key','article_id','surface_text','extraction_method','extraction_confidence','stance','loaded_language'])
   or (item-array['claim_key','article_id','surface_text','extraction_method','extraction_confidence','stance','loaded_language'])<>'{}'::jsonb
   or jsonb_typeof(item->'extraction_confidence') is distinct from 'number'
   or jsonb_typeof(item->'loaded_language') is distinct from 'array'
   or exists(select 1 from jsonb_each(item-array['extraction_confidence','loaded_language']) kv where jsonb_typeof(kv.value)<>'string')
  then raise exception 'mip_native_output_shape';end if;
  for scalar in select value from jsonb_array_elements(item->'loaded_language') loop
   if jsonb_typeof(scalar) is distinct from 'object' or not(scalar?&array['term','span','category'])
    or (scalar-array['term','span','category'])<>'{}'::jsonb
    or jsonb_typeof(scalar->'term') is distinct from 'string' or jsonb_typeof(scalar->'category') is distinct from 'string'
    or jsonb_typeof(scalar->'span') is distinct from 'array'
   then raise exception 'mip_native_output_shape';end if;
   if jsonb_array_length(scalar->'span')<>2 or exists(select 1 from jsonb_array_elements(scalar->'span') v where jsonb_typeof(v.value)<>'number' or v.value::text !~ '^[0-9]+$')
   then raise exception 'mip_native_output_shape';end if;
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(projection->'explanations') loop
  if jsonb_typeof(item) is distinct from 'object'
   or not(item?&array['assertion_id','assertion_type','version','is_current','source_ids','archived_sources','source_roles','supporting_passage','contradicting_evidence','missing_evidence','shared_entities','relationship_type','rule_version','provenance_class','review_status','state','correction_history','remaining_uncertainty'])
   or (item-array['assertion_id','assertion_type','version','is_current','source_ids','archived_sources','source_roles','supporting_passage','contradicting_evidence','missing_evidence','shared_entities','relationship_type','rule_version','provenance_class','review_status','state','correction_history','remaining_uncertainty'])<>'{}'::jsonb
   or item->'version' is distinct from '1'::jsonb or item->'is_current' is distinct from 'true'::jsonb
   or item->'source_roles' is distinct from '{}'::jsonb or item->'relationship_type' is distinct from 'null'::jsonb
   or exists(select 1 from jsonb_each(item-array['version','is_current','source_ids','archived_sources','source_roles','contradicting_evidence','missing_evidence','shared_entities','relationship_type','correction_history']) kv where jsonb_typeof(kv.value)<>'string')
  then raise exception 'mip_native_output_shape';end if;
  foreach field in array array['source_ids','archived_sources','contradicting_evidence','missing_evidence','shared_entities','correction_history'] loop
   if item->field is distinct from '[]'::jsonb then raise exception 'mip_native_output_shape';end if;
  end loop;
 end loop;
 item:=projection->'stats';
 if not(item?&array['mode','events_processed','events_withheld_pending_membership_validation','claims','article_claims','explanations'])
  or (item-array['mode','events_processed','events_withheld_pending_membership_validation','claims','article_claims','explanations'])<>'{}'::jsonb
  or item->>'mode' is distinct from 'event_projection'
  or exists(select 1 from jsonb_each(item-'mode') kv where jsonb_typeof(kv.value)<>'number' or kv.value::text !~ '^[0-9]+$')
 then raise exception 'mip_native_output_shape';end if;
end $$;
revoke all on function comparison_qualification.check_native_lineage_output(jsonb,jsonb)
 from public,anon,authenticated,service_role;

-- Mechanism check only; this never grants review/publication authority. 017
-- calls it AFTER all existing factual, policy and operation-permission gates.
create function comparison_qualification.check_native_review_lineage(p_input jsonb,p_output jsonb,p_evidence jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare expected jsonb;entry jsonb;surface jsonb;claim jsonb;ev jsonb;k jsonb;
 lineage jsonb;native jsonb;valid boolean;event_id text;legacy boolean;native_legacy jsonb;
begin
 perform comparison_qualification.check_native_lineage_output(p_input,p_output);
 select coalesce(jsonb_agg(jsonb_build_object('event_id',e.value#>>'{event,id}',
   'article_id',m.value#>>'{article,id}','retained_capture',m.value->'retained_capture')
   order by e.ordinality,m.ordinality),'[]'::jsonb) into expected
 from jsonb_array_elements(p_input->'eventInputs') with ordinality e
 cross join lateral jsonb_array_elements(e.value->'members') with ordinality m;
 if jsonb_typeof(p_output->'retained_lineage') is distinct from 'array'
 or expected is distinct from p_output->'retained_lineage'
 or p_output->>'lineage_review_state' is distinct from 'pending'
 or jsonb_array_length(expected)=0 then raise exception 'mip_native_generation_lineage_mismatch';end if;
 for entry in select value from jsonb_array_elements(expected) loop
 lineage:=entry->'retained_capture';
 if lineage is null or lineage='null'::jsonb or lineage->>'article_id' is distinct from entry->>'article_id'
 or lineage->>'review_state' is distinct from 'pending'
 or (p_input->>'native_lineage_version'='native-capture-lineage-v2' and
   (lineage->>'contract_version' is distinct from 'native-capture-lineage-v2' or lineage?'payload'))
 then raise exception 'mip_native_capture_binding_missing';end if;
 native:=comparison_qualification.native_capture_lineage((entry->>'article_id')::uuid);
 legacy:=not(p_input?'native_lineage_version');
 if legacy then
  -- Read-only compatibility for already retained v1 generations. Never emitted
  -- by source_snapshot; keep their exact output/retry contract without rewriting.
  if lineage->>'content_hash' is distinct from encode(sha256(convert_to((lineage->'payload')::text,'UTF8')),'hex')
  then raise exception 'mip_native_capture_binding_missing';end if;
  native_legacy:=(native-'contract_version'-'source_metadata')||jsonb_build_object(
    'candidates',(select coalesce(jsonb_agg(value-'field_hash'-'predecessor_candidate_id' order by ordinality),'[]'::jsonb)
      from jsonb_array_elements(native->'candidates') with ordinality));
  if native_legacy is distinct from (lineage-'payload') then raise exception 'mip_native_capture_stale';end if;
 elsif p_input->>'native_lineage_version' is distinct from 'native-capture-lineage-v2'
   or native is distinct from lineage then raise exception 'mip_native_capture_stale';
 end if;
 end loop;
 if jsonb_typeof(p_evidence) is distinct from 'array'
 or jsonb_typeof(p_output#>'{projection,article_claims}') is distinct from 'array'
 or jsonb_array_length(p_output#>'{projection,article_claims}')=0
 then raise exception 'mip_native_review_evidence_missing';end if;
 for surface in select value from jsonb_array_elements(p_output#>'{projection,article_claims}') loop
 select value into claim from jsonb_array_elements(p_output#>'{projection,claims}')
 where value->>'claim_key'=surface->>'claim_key';
 event_id:=claim->>'event_id';valid:=false;
 select value->'retained_capture' into lineage from jsonb_array_elements(expected)
 where value->>'event_id'=event_id and value->>'article_id'=surface->>'article_id';
 for ev in select value from jsonb_array_elements(p_evidence)
 where value->>'article_id'=surface->>'article_id' and value->>'claim_key'=surface->>'claim_key' loop
 select value into k from jsonb_array_elements(lineage->'candidates')
 where value->>'candidate_id'=ev->>'candidate_id';
 if k is not null and k->>'candidate_kind'='claim' and k->>'review_state'='pending'
 and ev->>'capture_id'=lineage->>'capture_id' and k->>'capture_id'=lineage->>'capture_id'
 and ev->>'content_hash'=lineage->>'content_hash'
 and ev->>'field'=k->>'source_field' and ev->'span_start'=k->'span_start' and ev->'span_end'=k->'span_end'
 and ev->>'excerpt'=k->>'excerpt' and k->>'excerpt'=surface->>'surface_text'
 and ev->>'field_hash'=case when p_input?'native_lineage_version' then k->>'field_hash'
   else encode(sha256(convert_to(lineage->'payload'->>(k->>'source_field'),'UTF8')),'hex') end
 then valid:=true;end if;
 end loop;
 if not valid then raise exception 'mip_native_review_span_unbound';end if;
 end loop;
end $$;
revoke all on function comparison_qualification.check_native_review_lineage(jsonb,jsonb,jsonb)
 from public,anon,authenticated,service_role;

create function comparison_qualification.source_snapshot(p_lexicon jsonb,p_implementation text)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare payload jsonb;
begin
  if p_lexicon is null or jsonb_typeof(p_lexicon)<>'object' or p_implementation is null
    or length(p_implementation) not between 1 and 300 then
    raise exception 'invalid comparison snapshot binding';
  end if;
  -- STABLE pins all source reads to the calling statement's MVCC snapshot.
  -- Retain complete selected rows, including membership provenance and gate fields.
  with eligible as (
    select e.id from public.events e
    join public.event_articles m on m.event_id=e.id
    join public.articles a on a.id=m.article_id
    where e.status<>'timeline_only' and e.comparison_validation_state='approved'
    group by e.id having count(distinct nullif(a.outlet,''))>=2
  ), inputs as (
    select e.id,jsonb_build_object('event',to_jsonb(e),'members',
      (select jsonb_agg(jsonb_build_object('article',to_jsonb(a),'membership',to_jsonb(m),
        'retained_capture',comparison_qualification.native_capture_lineage(a.id)) order by m.article_id)
       from public.event_articles m join public.articles a on a.id=m.article_id where m.event_id=e.id)) value
    from public.events e join eligible chosen on chosen.id=e.id
  )
  select jsonb_build_object(
    'native_lineage_version','native-capture-lineage-v2',
    'eventInputs',coalesce((select jsonb_agg(value order by id) from inputs),'[]'::jsonb),
    'configRows',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from public.pipeline_config c
      where c.key='claim_group_confidence_floor'),'[]'::jsonb),
    'lexicon',p_lexicon,'implementation_ref',p_implementation,
    'snapshot_metadata',jsonb_build_object('database_snapshot',pg_current_snapshot()::text,
      'statement_started_at',statement_timestamp(),'scope','approved multi-outlet comparison inputs')
  ) into payload;
  return payload;
end $$;


-- Restricted original snapshot functions solely for immutable legacy generation validation.
create function comparison_qualification.native_capture_lineage_legacy(p_article uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if to_regclass('evidence_pipeline.article_captures') is null
 or to_regclass('evidence_pipeline.evidence_candidates') is null then return null;end if;
 execute $read$
 select jsonb_build_object('capture_id',c.id,'article_id',c.article_id,
  'content_hash',c.content_hash,'payload',c.payload,'review_state',c.review_state,
  'candidates',coalesce((select jsonb_agg(jsonb_build_object(
    'candidate_id',k.id,'capture_id',k.capture_id,'candidate_kind',k.candidate_kind,
    'source_field',k.source_field,'span_start',k.span_start,'span_end',k.span_end,
    'excerpt',k.excerpt,'extractor_version',k.extractor_version,
    'review_state',k.review_state) order by k.id)
   from evidence_pipeline.evidence_candidates k where k.capture_id=c.id
    and not exists(select 1 from evidence_pipeline.evidence_candidates successor
      where successor.predecessor_candidate_id=k.id)),'[]'::jsonb))
 from evidence_pipeline.article_captures c where c.article_id=$1
 order by c.captured_at desc,c.id desc limit 1
 $read$ into result using p_article;
 return result;
end $$;
create function comparison_qualification.source_snapshot_legacy(p_lexicon jsonb,p_implementation text)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare payload jsonb;
begin
  if p_lexicon is null or jsonb_typeof(p_lexicon)<>'object' or p_implementation is null
    or length(p_implementation) not between 1 and 300 then
    raise exception 'invalid comparison snapshot binding';
  end if;
  -- STABLE pins all source reads to the calling statement's MVCC snapshot.
  -- Retain complete selected rows, including membership provenance and gate fields.
  with eligible as (
    select e.id from public.events e
    join public.event_articles m on m.event_id=e.id
    join public.articles a on a.id=m.article_id
    where e.status<>'timeline_only' and e.comparison_validation_state='approved'
    group by e.id having count(distinct nullif(a.outlet,''))>=2
  ), inputs as (
    select e.id,jsonb_build_object('event',to_jsonb(e),'members',
      (select jsonb_agg(jsonb_build_object('article',to_jsonb(a),'membership',to_jsonb(m),
        'retained_capture',comparison_qualification.native_capture_lineage_legacy(a.id)) order by m.article_id)
       from public.event_articles m join public.articles a on a.id=m.article_id where m.event_id=e.id)) value
    from public.events e join eligible chosen on chosen.id=e.id
  )
  select jsonb_build_object(
    'eventInputs',coalesce((select jsonb_agg(value order by id) from inputs),'[]'::jsonb),
    'configRows',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from public.pipeline_config c
      where c.key='claim_group_confidence_floor'),'[]'::jsonb),
    'lexicon',p_lexicon,'implementation_ref',p_implementation,
    'snapshot_metadata',jsonb_build_object('database_snapshot',pg_current_snapshot()::text,
      'statement_started_at',statement_timestamp(),'scope','approved multi-outlet comparison inputs')
  ) into payload;
  return payload;
end $$;
revoke all on function comparison_qualification.native_capture_lineage_legacy(uuid),comparison_qualification.source_snapshot_legacy(jsonb,text) from public,anon,authenticated,service_role;
create function comparison_qualification.capture_source(p_lexicon jsonb,p_implementation text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare payload jsonb;
begin
  select comparison_qualification.source_snapshot(p_lexicon,p_implementation) into payload;
  -- The namespace is deliberately synthetic. Not a production source attestation.
  return comparison_qualification.enqueue('qualification-source',payload,p_implementation,clock_timestamp());
end $$;
revoke all on function comparison_qualification.source_snapshot(jsonb,text),
  comparison_qualification.capture_source(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function comparison_qualification.source_snapshot(jsonb,text),
  comparison_qualification.capture_source(jsonb,text) to service_role;
commit;
