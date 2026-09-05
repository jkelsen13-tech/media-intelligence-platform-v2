-- Applied on production as 20260905182355; SQL matches the recorded migration.
-- Forward correction: nested payloads obey the existing reader/publication contracts.
-- Historical migration files remain unchanged. No approvals or source records are changed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Internal composition view, never a new public endpoint. Both public payloads
-- use the same admitted claim surfaces. Unknown or unverified states fail closed.
create or replace view mip_private.reader_claim_surfaces
with (security_barrier = true, security_invoker = false)
as
select ac.id, ac.claim_id, ac.article_id
from public.article_claims ac
join public.claims c on c.id = ac.claim_id
join public.events e on e.id = c.event_id
join public.articles a on a.id = ac.article_id
join public.event_articles ea on ea.event_id = e.id and ea.article_id = a.id
where ac.is_current = true
  and ac.auditability_state = 'verified_retained_source'
  and c.status = 'active'
  and c.rule_version = 'sc-v2-event-projection'
  and e.comparison_validation_state = 'approved'
  and e.status <> 'timeline_only'
  and a.reader_state = 'eligible' and a.source_status = 'active'
  and (
    select count(distinct member.outlet)
    from public.event_articles membership
    join public.articles member on member.id = membership.article_id
    where membership.event_id = e.id
      and member.reader_state = 'eligible' and member.source_status = 'active'
  ) >= 2;
revoke all on mip_private.reader_claim_surfaces from public, anon, authenticated;
grant select on mip_private.reader_claim_surfaces to service_role;

create or replace view public.news_detail_public
with (security_barrier = true, security_invoker = false)
as
select
  a.id as article_id,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'surface_text', ac.surface_text,
        'canonical_text', c.canonical_text,
        'auditability_state', ac.auditability_state,
        'auditability_note', ac.auditability_note,
        'evidence_source_field', ac.evidence_source_field,
        'evidence_excerpt', ac.evidence_excerpt,
        'evidence_records', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'evidence_url', cel.evidence_url,
              'evidence_type', cel.evidence_type
            )
            order by cel.evidence_type, cel.evidence_url
          )
          from public.claim_evidence_links cel
          where cel.claim_id = c.id
            and exists (
              select 1 from mip_private.reader_claim_surfaces rs
              where rs.claim_id = c.id and rs.article_id = cel.linked_from_article_id
            )
        ), '[]'::jsonb)
      )
      order by ac.id
    )
    from public.article_claims ac
    join public.claims c on c.id = ac.claim_id
    where ac.article_id = a.id
      and ac.is_current = true
      and exists (select 1 from mip_private.reader_claim_surfaces rs where rs.id = ac.id)
  ), '[]'::jsonb) as reviewed_claims
from public.articles a
where a.reader_state = 'eligible'
  and a.source_status = 'active';

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
              and existing_claim.event_id = e.id
              and exists (select 1 from mip_private.reader_claim_surfaces rs where rs.id = existing_surface.id)
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
        and a.reader_state = 'eligible'
        and a.source_status = 'active'
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
                  and x.review_status = 'published'
                  and x.state = 'ok'
                  and nullif(btrim(x.supporting_passage), '') is not null
                  and nullif(btrim(x.falsification_condition), '') is not null
                  and btrim(x.falsification_condition) not ilike 'missing:%'
                  and jsonb_typeof(x.archived_sources) = 'array'
                  and not jsonb_path_exists(x.archived_sources, '$[*] ? (@.status == "missing")')
                  and x.rule_version like 'sc-v2-event-projection|%'
                  and right(x.assertion_id, 36) = ac.article_id::text
                  and position(format('Surface claim "%s" grouped under canonical "%s"', ac.surface_text, c.canonical_text) in coalesce(x.supporting_passage, '')) = 1
                order by x.recomputed_at desc nulls last, x.id
                limit 1
              ) explanation on true
              where ac.claim_id = c.id
                and ac.is_current = true
                and exists (select 1 from mip_private.reader_claim_surfaces rs where rs.id = ac.id)
                and a.reader_state = 'eligible'
                and a.source_status = 'active'
            ) surface_row
          ), '[]'::jsonb),
          'evidence_links', coalesce((
            select jsonb_agg(jsonb_build_object(
              'evidence_url', cel.evidence_url,
              'evidence_type', cel.evidence_type
            ) order by cel.evidence_type, cel.evidence_url)
            from public.claim_evidence_links cel
            where cel.claim_id = c.id
            and exists (
              select 1 from mip_private.reader_claim_surfaces rs
              where rs.claim_id = c.id and rs.article_id = cel.linked_from_article_id
            )
          ), '[]'::jsonb),
          'corrections', coalesce((
            select jsonb_agg(jsonb_build_object(
              'correction_text', cc.correction_text,
              'occurred_at', cc.occurred_at
            ) order by cc.occurred_at nulls last)
            from public.claim_corrections cc
            where cc.claim_id = c.id
              and exists (
                select 1 from public.articles ca
                join public.event_articles cea on cea.article_id = ca.id
                where ca.id = cc.correcting_article_id and cea.event_id = c.event_id
                  and ca.reader_state = 'eligible' and ca.source_status = 'active'
              )
          ), '[]'::jsonb)
        ) as claim
      from public.claims c
      where c.event_id = e.id
        and c.status = 'active'
        and c.rule_version = 'sc-v2-event-projection'
        and exists (select 1 from mip_private.reader_claim_surfaces rs where rs.claim_id = c.id)
    ) claim_row
  ), '[]'::jsonb) as claims
from public.events e
where e.status <> 'timeline_only'
  and e.comparison_validation_state = 'approved'
  and exists (
    select 1
    from public.event_articles ea
    join public.articles a on a.id = ea.article_id
    where ea.event_id = e.id
      and a.reader_state = 'eligible'
      and a.source_status = 'active'
    group by ea.event_id
    having count(distinct a.outlet) >= 2
  );

-- Public read contracts retain owner access; every nested payload is filtered
-- explicitly while base-table privileges stay revoked.
revoke all on public.news_detail_public, public.comparison_public from public;
grant select on public.news_detail_public, public.comparison_public to anon, authenticated, service_role;
comment on view public.news_detail_public is 'Eligible articles with verified current claim surfaces belonging to an approved multi-outlet event. Nested evidence requires an admitted source.';
comment on view public.comparison_public is 'Approved multi-outlet comparisons with admitted claim surfaces, published D4-eligible explanations, and eligible evidence/correction sources.';
commit;
