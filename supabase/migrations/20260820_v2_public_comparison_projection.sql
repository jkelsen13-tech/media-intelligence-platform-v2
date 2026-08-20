-- Isolated Version Two only. This public view replaces direct anonymous reads
-- from claims, article_claims, claim_evidence_links, and pipeline_config for
-- the Source Comparison card. It exposes no raw UUIDs, pipeline settings,
-- article bodies, author/source records, or review-pipeline metadata.

create or replace view public.comparison_public
with (security_barrier = true, security_invoker = false)
as
select
  md5(e.id::text) as event_key,
  e.canonical_title,
  e.occurred_at_start,
  e.occurred_at_end,
  coalesce((
    select jsonb_agg(article_row.article order by article_row.published_at nulls last, article_row.article_key)
    from (
      select
        a.published_at,
        md5(a.id::text) as article_key,
        jsonb_build_object(
          'article_key', md5(a.id::text),
          'outlet', a.outlet,
          'article_url', a.url,
          'published_at', a.published_at,
          'arc_slug', arc.slug,
          'arc_title', arc.title,
          'timeline_key', timeline.timeline_key,
          'has_extracted_claim', exists (
            select 1
            from public.article_claims existing_surface
            join public.claims existing_claim on existing_claim.id = existing_surface.claim_id
            where existing_surface.article_id = a.id
              and existing_surface.is_current = true
              and existing_claim.status = 'active'
              and existing_claim.rule_version = 'sc-v2-event-projection'
          )
        ) as article
      from public.event_articles ea
      join public.articles a on a.id = ea.article_id
      left join public.story_arcs arc on arc.id = a.arc_id
      left join lateral (
        select right(n.slug, 8) as timeline_key
        from public.nodes n
        where n.type = 'event'
          and n.arc_id = a.arc_id
        order by (n.slug like 'evt-%') desc, n.slug
        limit 1
      ) timeline on true
      where ea.event_id = e.id
    ) article_row
  ), '[]'::jsonb) as articles,
  coalesce((
    select jsonb_agg(claim_row.claim order by claim_row.canonical_text)
    from (
      select
        c.canonical_text,
        jsonb_build_object(
          'claim_key', md5(c.id::text),
          'canonical_text', c.canonical_text,
          'thin_extraction', c.thin_extraction,
          'surfaces', coalesce((
            select jsonb_agg(surface_row.surface order by surface_row.published_at nulls last, surface_row.article_key)
            from (
              select
                a.published_at,
                md5(a.id::text) as article_key,
                jsonb_build_object(
                  'article_key', md5(a.id::text),
                  'surface_text', ac.surface_text,
                  'loaded_language', ac.loaded_language,
                  'explanation', explanation.explanation
                ) as surface
              from public.article_claims ac
              join public.articles a on a.id = ac.article_id
              left join lateral (
                select jsonb_build_object(
                  'supporting_passage', x.supporting_passage,
                  'rule_version', x.rule_version,
                  'provenance_class', x.provenance_class,
                  'reviewed_at', x.reviewed_at,
                  'review_status', x.review_status,
                  'state', x.state,
                  'remaining_uncertainty', x.remaining_uncertainty
                ) as explanation
                from public.explanations x
                where x.assertion_type = 'claim_grouping'
                  and x.is_current = true
                  and x.rule_version like 'sc-v2-event-projection|%'
                  and right(x.assertion_id, 36) = ac.article_id::text
                  and position(format('Surface claim "%s" grouped under canonical "', ac.surface_text) in coalesce(x.supporting_passage, '')) = 1
                order by x.recomputed_at desc nulls last, x.id
                limit 1
              ) explanation on true
              where ac.claim_id = c.id
                and ac.is_current = true
            ) surface_row
          ), '[]'::jsonb),
          'evidence_links', coalesce((
            select jsonb_agg(jsonb_build_object(
              'evidence_url', cel.evidence_url,
              'evidence_type', cel.evidence_type
            ) order by cel.evidence_type, cel.evidence_url)
            from public.claim_evidence_links cel
            where cel.claim_id = c.id
          ), '[]'::jsonb),
          'corrections', coalesce((
            select jsonb_agg(jsonb_build_object(
              'correction_text', cc.correction_text,
              'occurred_at', cc.occurred_at
            ) order by cc.occurred_at nulls last)
            from public.claim_corrections cc
            where cc.claim_id = c.id
          ), '[]'::jsonb)
        ) as claim
      from public.claims c
      where c.event_id = e.id
        and c.status = 'active'
        and c.rule_version = 'sc-v2-event-projection'
    ) claim_row
  ), '[]'::jsonb) as claims
from public.events e
where e.status <> 'timeline_only'
  and exists (
    select 1
    from public.event_articles ea
    join public.articles a on a.id = ea.article_id
    where ea.event_id = e.id
    group by ea.event_id
    having count(distinct a.outlet) >= 2
  );

-- The view is the only anonymous comparison data contract. Base-table grants
-- remain untouched in this migration and are revoked only after live validation.
grant select on table public.comparison_public to anon;
