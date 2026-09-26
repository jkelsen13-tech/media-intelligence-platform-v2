-- Isolated qualification only. Load after contract.sql and disposable source fixtures.
begin;
-- Native lineage is optional for legacy qualification input, mandatory at 017
-- admission. Missing native owners are represented as NULL, never fabricated.
create function comparison_qualification.native_capture_lineage(p_article uuid)
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
revoke all on function comparison_qualification.native_capture_lineage(uuid)
 from public,anon,authenticated,service_role;

-- Mechanism check only; this never grants review/publication authority. 017
-- calls it AFTER all existing factual, policy and operation-permission gates.
create function comparison_qualification.check_native_review_lineage(p_input jsonb,p_output jsonb,p_evidence jsonb)
returns void language plpgsql stable security definer set search_path='' as $$
declare expected jsonb;entry jsonb;surface jsonb;claim jsonb;ev jsonb;k jsonb;
 lineage jsonb;native jsonb;valid boolean;event_id text;
begin
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
 or lineage->>'content_hash' is distinct from encode(sha256(convert_to((lineage->'payload')::text,'UTF8')),'hex')
 then raise exception 'mip_native_capture_binding_missing';end if;
 native:=comparison_qualification.native_capture_lineage((entry->>'article_id')::uuid);
 if native is distinct from lineage then raise exception 'mip_native_capture_stale';end if;
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
 and k->>'excerpt'=substring(lineage->'payload'->>(k->>'source_field')
   from (k->>'span_start')::int+1 for (k->>'span_end')::int-(k->>'span_start')::int)
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
    'eventInputs',coalesce((select jsonb_agg(value order by id) from inputs),'[]'::jsonb),
    'configRows',coalesce((select jsonb_agg(to_jsonb(c) order by c.key) from public.pipeline_config c
      where c.key='claim_group_confidence_floor'),'[]'::jsonb),
    'lexicon',p_lexicon,'implementation_ref',p_implementation,
    'snapshot_metadata',jsonb_build_object('database_snapshot',pg_current_snapshot()::text,
      'statement_started_at',statement_timestamp(),'scope','approved multi-outlet comparison inputs')
  ) into payload;
  return payload;
end $$;

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
