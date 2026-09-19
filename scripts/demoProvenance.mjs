import retained from '../verifier/demo-corpus-20260916/retained-source-receipts.json' with { type: 'json' }
import expanded from '../verifier/demo-corpus-20260916/expanded-source-receipts.json' with { type: 'json' }

// Audited repeated institutional provenance labels, not canonical actors.
const allowedOrigins = ['doj-executive', 'us-whitehouse']
const identityFields = ['topic', 'origin_id', 'capture_id', 'article_id', 'candidate_id', 'content_hash', 'span_start', 'span_end', 'url']
const receipts = [...retained, ...expanded]

export function sharedDeclaredProvenance(sources) {
  return allowedOrigins.flatMap(origin => {
    const members = sources.filter(source => source.origin_id === origin && receipts.some(receipt =>
      identityFields.every(field => source[field] === receipt[field])))
    const memberships = [...new Set(members.map(source => source.topic))].sort()
    if (memberships.length < 2) return []
    return [{ id: `private:declared-origin:${origin}`, label: origin, type: 'declared_origin_identity',
      memberships, captures: members.map(source => source.capture_id), publication_allowed: false,
      reasoning: 'Exact repeated origin_id in the frozen receipts. Declared provenance only; no actor, role, substantive relationship or independent corroboration is asserted.',
      evidenceRoots: members.map(source => ({ capture_id: source.capture_id, article_id: source.article_id,
        candidate_id: source.candidate_id, content_hash: source.content_hash, span_start: source.span_start,
        span_end: source.span_end, receipt: `frozen-source-receipt:${source.capture_id}` })) }]
  })
}
