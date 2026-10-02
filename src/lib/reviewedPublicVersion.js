import { parseInspectionInstant, inspectionInstantNanoseconds } from './inspectionTime.js'
export const REVIEWED_ARTICLE_CONTRACT = 'mip-reviewed-public-version-v1'
export const REVIEWED_STORY_CONTRACT = 'mip-reviewed-public-story-v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/
export const publicVersionUuid = value => typeof value === 'string' && UUID.test(value)
const text = value => typeof value === 'string' && value.trim().length > 0
const instant = value => parseInspectionInstant(value) !== null
const compare = (a, b) => inspectionInstantNanoseconds(a) - inspectionInstantNanoseconds(b)
const nullableInstant = value => value === null || instant(value)
const nullableUuid = value => value === null || publicVersionUuid(value)
const sequence = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && value.length <= 19 && BigInt(value) <= 9223372036854775807n
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
function base(row, contract) {
  return row && !Array.isArray(row) && row.contract === contract && publicVersionUuid(row.public_version_id)
    && sequence(row.sequence) && nullableUuid(row.predecessor_public_version_id)
    && text(row.review_ref) && text(row.policy_version) && text(row.reviewed_by)
    && instant(row.reviewed_at) && instant(row.visible_at) && compare(row.visible_at,row.reviewed_at) >= 0n
    && row.review_state === 'reviewed' && row.visibility_state === 'public'
    && (row.correction_reason === null || text(row.correction_reason))
    && (row.predecessor_public_version_id === null ? row.sequence === '1' && row.correction_reason === null : row.sequence !== '1' && text(row.correction_reason))
}
function reviewFields(row) {
  return { public_version_id: row.public_version_id, sequence: row.sequence,
    predecessor_public_version_id: row.predecessor_public_version_id, correction_reason: row.correction_reason,
    review_ref: row.review_ref, reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at,
    visible_at: row.visible_at, policy_version: row.policy_version, review_state: 'reviewed', visibility_state: 'public' }
}

// This checks the installed publication projection's typed response. It confers
// no authority on an arbitrary object, newest capture, extraction or hash.
export function normalizeReviewedPublicVersion(row) {
  if (!base(row, REVIEWED_ARTICLE_CONTRACT) || !publicVersionUuid(row.article_id)
    || !publicVersionUuid(row.capture_id) || row.source_version_id !== row.capture_id || !HASH.test(row.capture_hash ?? '')
    || !['source_report', 'reviewed_proposition'].includes(row.admission_kind)
    || !text(row.title) || !text(row.source_url) || !text(row.source_outlet)
    || !(row.summary === null || typeof row.summary === 'string') || !nullableInstant(row.published_at)
    || !instant(row.fetched_at) || row.fetched_at_semantics !== 'article_original_fetch' || !instant(row.captured_at)
    || compare(row.reviewed_at,row.captured_at) < 0n || !text(row.remaining_uncertainty)
    || typeof row.is_current_source_version !== 'boolean' || !nullableUuid(row.superseded_by_public_version_id)
    || (row.is_current_source_version && row.superseded_by_public_version_id !== null)
    || typeof row.pending_revision !== 'boolean' || !Array.isArray(row.evidence) || row.evidence.length > 100) return null
  const seen = new Set(), evidence = []
  for (const e of row.evidence) {
    if (!e || !publicVersionUuid(e.article_claim_id) || !publicVersionUuid(e.claim_id) || seen.has(e.article_claim_id)
      || e.capture_id !== row.capture_id || e.capture_hash !== row.capture_hash
      || !['title', 'summary', 'body_text'].includes(e.source_field)
      || !Number.isSafeInteger(e.span_start) || e.span_start < 0 || !Number.isSafeInteger(e.span_end) || e.span_end <= e.span_start
      || !text(e.excerpt) || Array.from(e.excerpt).length !== e.span_end - e.span_start
      || !HASH.test(e.excerpt_hash ?? '') || !text(e.surface_text) || !text(e.canonical_text)) return null
    seen.add(e.article_claim_id)
    evidence.push({ article_claim_id: e.article_claim_id, claim_id: e.claim_id, capture_id: e.capture_id,
      capture_hash: e.capture_hash, source_field: e.source_field, span_start: e.span_start, span_end: e.span_end,
      excerpt: e.excerpt, excerpt_hash: e.excerpt_hash, surface_text: e.surface_text, canonical_text: e.canonical_text })
  }
  if ((row.admission_kind === 'source_report' && evidence.length !== 0)
    || (row.admission_kind === 'reviewed_proposition' && evidence.length === 0)) return null
  const m = row.display_metadata ?? {}
  if (!m || Array.isArray(m) || typeof m !== 'object'
    || !(m.author_name == null || typeof m.author_name === 'string') || !(m.arc_id == null || publicVersionUuid(m.arc_id))
    || !(m.feed == null || typeof m.feed === 'string') || !(m.monoculture == null || typeof m.monoculture === 'boolean')
    || !(m.unattributed == null || typeof m.unattributed === 'boolean')) return null
  const result = { contract: REVIEWED_ARTICLE_CONTRACT, ...reviewFields(row), article_id: row.article_id,
    capture_id: row.capture_id, source_version_id: row.capture_id, capture_hash: row.capture_hash,
    admission_kind: row.admission_kind, source_url: row.source_url, source_outlet: row.source_outlet,
    title: row.title, summary: row.summary, published_at: row.published_at, fetched_at: row.fetched_at,
    fetched_at_semantics: 'article_original_fetch', captured_at: row.captured_at,
    remaining_uncertainty: row.remaining_uncertainty, pending_revision: row.pending_revision, evidence,
    is_current_source_version: row.is_current_source_version, superseded_by_public_version_id: row.superseded_by_public_version_id,
    display_metadata: { author_name: m.author_name ?? null, arc_id: m.arc_id ?? null, feed: m.feed ?? null,
      monoculture: m.monoculture ?? null, unattributed: m.unattributed ?? null } }
  // Report permission is separate from proposition publication. These names
  // deliberately retain the absence of an exact capture-fetch observation.
  if (row.admission_kind === 'source_report') result.source_report = {
    source_id: row.article_id, source_version_id: row.capture_id, public_version_id: row.public_version_id,
    capture_hash: row.capture_hash, source_url: row.source_url, source_outlet: row.source_outlet,
    report_time: row.published_at, fetch_time: null, article_original_fetched_at: row.fetched_at,
    capture_retained_at: row.captured_at, review_uncertainty: row.remaining_uncertainty,
    predecessor_public_version_id: row.predecessor_public_version_id, correction_reason: row.correction_reason,
    is_current_source_version: row.is_current_source_version, superseded_by_public_version_id: row.superseded_by_public_version_id,
    review_ref: row.review_ref, policy_version: row.policy_version,
  }
  return freeze(result)
}

export function reviewedVersionToNewsArticle(version) {
  if (!version) return null
  const displayMetadata = version.display_metadata
  return freeze({ id: version.article_id, title: version.title, url: version.source_url,
    summary: version.summary, outlet: version.source_outlet, published_at: version.published_at,
    fetched_at: version.fetched_at, reader_state: 'eligible', source_status: 'active',
    monoculture: displayMetadata.monoculture === true, unattributed: displayMetadata.unattributed === true,
    arc_id: displayMetadata.arc_id ?? null, author_name: displayMetadata.author_name ?? null, arc_title: null,
    public_version_id: version.public_version_id, public_version: version, source_report: version.source_report ?? null,
    is_current_source_version: version.is_current_source_version, superseded_by_public_version_id: version.superseded_by_public_version_id,
    claims: version.evidence.map(e => ({ kind: 'substantive', text: e.surface_text, stance: 'asserts',
      loaded_language: [], provenance: 'reviewed_claim_record', auditability_state: 'verified_retained_source',
      evidence_source_field: e.source_field, evidence_excerpt: e.excerpt, capture_id: e.capture_id,
      capture_hash: e.capture_hash, article_claim_id: e.article_claim_id, claim_id: e.claim_id,
      public_version_id: version.public_version_id, span_start: e.span_start, span_end: e.span_end })),
    citations: [], evidenceRecords: [],
  })
}

export function normalizeReviewedPublicStoryVersion(row) {
  if (!base(row, REVIEWED_STORY_CONTRACT) || !publicVersionUuid(row.story_id)
    || !['article', 'graph_node'].includes(row.subject_type) || !publicVersionUuid(row.subject_id)
    || !text(row.subject_kind) || (row.subject_type === 'article' && row.subject_kind !== 'article')
    || !Array.isArray(row.members) || row.members.length < 1 || row.members.length > 100) return null
  const members = row.members.map(normalizeReviewedPublicVersion)
  if (members.some(member => !member) || new Set(members.map(member => member.article_id)).size !== members.length
    || members.some(member => compare(member.visible_at,row.reviewed_at) > 0n)
    || (row.subject_type === 'article' && (members.length !== 1 || members[0].article_id !== row.subject_id))) return null
  return freeze({ contract: REVIEWED_STORY_CONTRACT, ...reviewFields(row), story_id: row.story_id,
    subject_type: row.subject_type, subject_id: row.subject_id, subject_kind: row.subject_kind, members })
}
