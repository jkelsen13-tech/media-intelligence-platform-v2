-- Isolated Version Two only. This public view replaces direct anonymous reads
-- of article_claims, claims, and claim_evidence_links from the expanded News
-- detail. It is article-keyed because comparison_public is event-keyed and
-- intentionally excludes reviewed claims outside its multi-outlet population.
--
-- The JSON contract contains only values rendered by News: current reviewed
-- surface/canonical text and linked evidence URL/type. It deliberately omits
-- claim IDs, status, kind, stance, loaded-language markers, corrections,
-- review workflow fields, and all internal pipeline metadata.

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
        ), '[]'::jsonb)
      )
      order by ac.id
    )
    from public.article_claims ac
    join public.claims c on c.id = ac.claim_id
    where ac.article_id = a.id
      and ac.is_current = true
  ), '[]'::jsonb) as reviewed_claims
from public.articles a;

grant select on table public.news_detail_public to anon;
