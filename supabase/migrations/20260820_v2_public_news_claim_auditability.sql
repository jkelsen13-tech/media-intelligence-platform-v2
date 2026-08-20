-- Isolated V2 only. Extends the existing narrow News-detail contract with the
-- claim auditability fields rendered in the expanded News card. It does not
-- expose IDs, review identities, pipeline state, article body text, or any
-- base-table grant.

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
