select now() as observed_at,
 count(*) as candidate_explanation_matches,
 count(*) filter(where x.assertion_id !~ ('^sc:claim_grouping:' || c.event_id::text || ':[0-9]+:' || ac.article_id::text || '$')) as nonmatching_event_assertions
from public.article_claims ac join public.claims c on c.id=ac.claim_id
join mip_private.reader_claim_surfaces rs on rs.id=ac.id
join public.explanations x on x.assertion_type='claim_grouping' and x.is_current=true
 and x.review_status='published' and x.state='ok'
 and nullif(btrim(x.supporting_passage),'') is not null
 and nullif(btrim(x.falsification_condition),'') is not null
 and btrim(x.falsification_condition) not ilike 'missing:%'
 and jsonb_typeof(x.archived_sources)='array'
 and not jsonb_path_exists(x.archived_sources,'$[*] ? (@.status == "missing")')
 and x.rule_version like 'sc-v2-event-projection|%'
 and right(x.assertion_id,36)=ac.article_id::text
 and position(format('Surface claim "%s" grouped under canonical "%s"',ac.surface_text,c.canonical_text) in coalesce(x.supporting_passage,''))=1;
