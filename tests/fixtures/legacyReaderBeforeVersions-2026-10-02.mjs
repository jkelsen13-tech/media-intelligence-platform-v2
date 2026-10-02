// Exact predecessor reader function from 8f495ffe, retained for historical gap qualification.
import {isPostgrestPermissionDenied,articlesUnavailableReason,isPostgrestNoRow,loadPublicAuthorNameMap} from '../../src/lib/supabase.js'
const supabase=null
export async function loadArticleDetail(id, { supabaseClient } = {}) {
  const client = supabaseClient === undefined ? supabase : supabaseClient
  if (!client) return null
  const [artRes, citRes, newsDetailRes] = await Promise.all([
    client
      .from('articles')
      .select('id, title, url, summary, published_at, fetched_at, outlet, monoculture, unattributed, author_id')
      .eq('id', id)
      .eq('reader_state', 'eligible').eq('source_status', 'active')
      .single(),
    client
      .from('citations')
      .select('cited_entity, cited_type, documentation_strength')
      .eq('article_id', id)
      .order('documentation_strength', { ascending: false, nullsFirst: false }),
    // The security-barrier projection is the only anonymous contract for
    // reviewed claim text and linked evidence in an expanded News record.
    client
      .from('news_detail_public')
      .select('article_id, reviewed_claims')
      .eq('article_id', id)
      .maybeSingle(),
  ])
  if (artRes.error) {
    if (isPostgrestPermissionDenied(artRes.error)) {
      return { articlesUnavailable: articlesUnavailableReason(artRes.error) }
    }
    if (isPostgrestNoRow(artRes.error)) {
      return { articleMissing: true, articlesUnavailable: null }
    }
    throw artRes.error
  }
  if (citRes.error) throw citRes.error
  if (newsDetailRes.error) throw newsDetailRes.error
  const authorNames = await loadPublicAuthorNameMap([artRes.data.author_id], { supabaseClient: client })

  // Article-local extraction JSON has no admission/review contract. Only the
  // public projection may supply reader-facing analytical claims.
  const admittedClaimRows = (newsDetailRes.data?.reviewed_claims ?? [])
    .filter(row => row?.auditability_state === 'verified_retained_source')
  const reviewedClaims = admittedClaimRows.map((row) => ({
    kind: 'substantive',
    text: row.surface_text || row.canonical_text || 'Reviewed claim text not recorded.',
    stance: 'asserts',
    loaded_language: [],
    provenance: 'reviewed_claim_record',
    auditability_state: row.auditability_state ?? 'unverified_against_retained_source',
    auditability_note: row.auditability_note ?? 'No exact retained publisher excerpt supports this public claim surface.',
    evidence_source_field: row.evidence_source_field ?? null,
    evidence_excerpt: row.evidence_excerpt ?? null,
  }))
  const seenClaimText = new Set()
  const claims = reviewedClaims.filter((claim) => {
    const key = `${claim.kind ?? 'substantive'}|${String(claim.text ?? '').trim().toLowerCase()}`
    if (!key || seenClaimText.has(key)) return false
    seenClaimText.add(key)
    return true
  })
  const seenEvidence = new Set()
  const evidenceRecords = admittedClaimRows
    .flatMap((row) => (Array.isArray(row.evidence_records) ? row.evidence_records : []))
    .filter((row) => {
      const key = `${row.evidence_type ?? ''}|${row.evidence_url ?? ''}`
      if (!row.evidence_url || seenEvidence.has(key)) return false
      seenEvidence.add(key)
      return true
    })
  return {
    ...artRes.data,
    claims,
    author_name: authorNames.get(artRes.data.author_id) ?? null,
    author_id: undefined,
    arc_title: null,
    citations: citRes.data ?? [],
    evidenceRecords,
  }
}
