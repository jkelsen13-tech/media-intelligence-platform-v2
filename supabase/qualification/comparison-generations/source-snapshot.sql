-- Isolated qualification only. Load after contract.sql and disposable source fixtures.
begin;
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
      (select jsonb_agg(jsonb_build_object('article',to_jsonb(a),'membership',to_jsonb(m)) order by m.article_id)
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
