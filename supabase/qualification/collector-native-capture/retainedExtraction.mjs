// C5 source-only adapter for the existing native capture/candidate owners.
// No new queue, service, public claims, review mutation, or publication authority.
import {createHash} from 'node:crypto'
import {Buffer} from 'node:buffer'
import {extractClaims} from '../../functions/collector-algorithm-shadow-candidate/predecessorV8.js'

export const EXTRACTOR_VERSION = 'yhb-v8-extractClaims-retained-v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex')

function captureId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw Error('capture_id_required')
  return value
}

// Native SQL, not a new RPC owner. The caller must already hold private
// evidence_pipeline read/append authority. Never use this adapter in a browser.
export function createRetainedExtractionBackend(db) {
  if (!db || typeof db.query !== 'function') throw Error('native_database_required')
  return Object.freeze({
    async readCapture(id) {
      captureId(id)
      const result = await db.query(`select id::text, article_id::text, content_hash,
        payload::text as payload_text
        from evidence_pipeline.article_captures where id=$1::uuid`, [id])
      if (result.rows?.length !== 1) throw Error('retained_capture_unavailable')
      return result.rows[0]
    },
    async appendCandidate(candidate) {
      const result = await db.query(
        "select public.mip_pipeline_v1('candidate',$1::jsonb) as candidate_id",
        [JSON.stringify(candidate)],
      )
      return captureId(result.rows?.[0]?.candidate_id)
    },
  })
}

export function buildRetainedClaimCandidates(capture) {
  captureId(capture?.id)
  captureId(capture?.article_id)
  // Hash the database's retained JSONB text exactly. Re-serializing JSON would
  // change its bytes and cannot establish the native content_hash binding.
  if (typeof capture.payload_text !== 'string' || Buffer.byteLength(capture.payload_text, 'utf8') > 262144
    || !/^[0-9a-f]{64}$/.test(capture.content_hash ?? '')
    || sha256(capture.payload_text) !== capture.content_hash) throw Error('retained_capture_hash_mismatch')
  const payload = JSON.parse(capture.payload_text)
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw Error('retained_capture_shape')
  // Use one explicitly named retained field; do not fabricate a concatenated
  // document or pretend title/summary extraction represents full article text.
  const field = ['body_text', 'summary', 'title'].find(key => typeof payload[key] === 'string' && payload[key].trim())
  if (!field) return {capture_id: capture.id, content_hash: capture.content_hash,
    extractor_version: EXTRACTOR_VERSION, source_field: null, candidates: []}
  const source = payload[field]
  const extracted = extractClaims(source)
  // Preserve the predecessor's actual split boundaries. Searching extracted
  // text globally can bind a substring inside an excluded long sentence.
  const segments = []
  let boundary = 0
  for (const separator of source.matchAll(/(?<=[.!?])\s+/g)) {
    segments.push({start: boundary, text: source.slice(boundary, separator.index)})
    boundary = separator.index + separator[0].length
  }
  segments.push({start: boundary, text: source.slice(boundary)})
  // Reuse the predecessor to qualify each raw segment (including pre-trim
  // length limits), rather than silently defining a second extraction policy.
  const selected = segments.filter(segment => extractClaims(segment.text).length > 0)
  const candidates = extracted.map((item, index) => {
    const segment = selected[index]
    if (!segment || segment.text.trim() !== item.text || !item.text)
      throw Error('extractor_source_span_unavailable')
    const start = segment.start + segment.text.indexOf(item.text)
    const end = start + item.text.length
    const spanStart = Array.from(source.slice(0, start)).length
    const spanEnd = spanStart + Array.from(item.text).length
    return {
      capture_id: capture.id,
      candidate_key: 'claim:' + field + ':' + spanStart + ':' + spanEnd,
      candidate_kind: 'claim',
      statement: item.text,
      source_field: field,
      span_start: spanStart,
      span_end: spanEnd,
      excerpt: item.text,
      extractor_version: EXTRACTOR_VERSION,
      remaining_uncertainty: 'Unreviewed source-text candidate from the YHB v8 sentence heuristic (' + item.kind
        + ', ' + field + '). Not fact verification, independent corroboration, or publication approval.',
    }
  })
  return {capture_id: capture.id, content_hash: capture.content_hash,
    extractor_version: EXTRACTOR_VERSION, source_field: field, candidates}
}

export async function extractRetainedCapture({backend, capture_id}) {
  captureId(capture_id)
  if (typeof backend?.readCapture !== 'function' || typeof backend?.appendCandidate !== 'function')
    throw Error('retained_extraction_backend_required')
  const capture = await backend.readCapture(capture_id)
  if (capture?.id !== capture_id) throw Error('retained_capture_binding_mismatch')
  // Build and verify the complete bounded candidate set before the first write.
  const plan = buildRetainedClaimCandidates(capture)
  const candidateIds = []
  for (const candidate of plan.candidates) {
    try {
      candidateIds.push(captureId(await backend.appendCandidate(candidate)))
    } catch {
      // A lost response can hide a committed candidate. Retry this same capture
      // and extractor version: native append_candidate compares exact content
      // and reuses its immutable identity. Never delete or reset candidates.
      return {state: 'incomplete', capture_id, content_hash: plan.content_hash,
        extractor_version: EXTRACTOR_VERSION, source_field: plan.source_field,
        acknowledged_candidate_ids: candidateIds, attempted_candidates: candidateIds.length + 1,
        planned_candidates: plan.candidates.length, retry_same_capture: true}
    }
  }
  return {state: plan.candidates.length ? 'candidates_retained' : 'no_candidates',
    capture_id, content_hash: plan.content_hash, extractor_version: EXTRACTOR_VERSION,
    source_field: plan.source_field, candidate_ids: candidateIds, review_state: 'pending',
    coverage: 'bounded_sentence_heuristic'}
}
