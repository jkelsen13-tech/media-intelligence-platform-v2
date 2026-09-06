import { createHash } from 'node:crypto'
import { prepareCollection, digest } from './evaluateCaptureCollection.mjs'

// Private offline contract. No registry, database, model or publication writes.
export const CONTRACT = 'capture-context-proposal-2'
const FAMILIES = new Set(['entity', 'graph_event', 'comparison_event', 'primary_document', 'case', 'place'])
const EVENT_KEYS = new Set(['graph_event', 'comparison_event', 'primary_document', 'case'])
const FIELDS = new Set(['title', 'summary', 'body_text'])
const STOP = new Set('about after again also been before being between could from have into more most news only other over report reported reports said says some than that their them then there these they this those through under very were what when where which while will with would your'.split(' '))
const CHECKS = Object.freeze(['endpoint_identity', 'event_scope_and_dates', 'polarity_and_modality',
  'quantity_unit_subject_and_attribution', 'source_lineage', 'relation_type_and_endpoint_bound_support'])
const fail = message => { throw new Error(message) }
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const keyOf = binding => JSON.stringify([binding.family, binding.key])
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }; return value }
const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(value)
function exactKeys(object, keys, label) {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(k => !keys.includes(k))) fail(`invalid ${label} fields`)
}

export function selectedText(article) {
  // Preserve baseline field precedence even if stripping leaves an empty body.
  return { field: article.body_text != null && article.body_text !== '' ? 'body_text' : 'summary',
    text: article.body_text != null && article.body_text !== '' ? article.body_text : article.summary ?? '' }
}

export function proposalTerms(article) {
  const selected = selectedText(article)
  const text = selected.text.replace(/\s*Continue reading(?:\.{3}|…)\s*$/iu, '')
  // ASCII lexical baseline, with only terminal display-text filtering added.
  // Does not normalize Unicode identities or strip numbers/polarity from evidence.
  return [...new Set(`${article.title ?? ''} ${text}`.toLowerCase().split(/[^a-z0-9]+/)
    .filter(term => term.length >= 4 && term.length <= 80 && !/^\d+$/.test(term) && !STOP.has(term)))].sort()
}

function bindContext(row, input) {
  if (!input) return []
  exactKeys(input, ['source_id', 'article_sha256', 'bindings'], 'context')
  if (input.source_id !== row.source_id || input.article_sha256 !== row.article_sha256) fail('context article fingerprint mismatch')
  if (!Array.isArray(input.bindings) || input.bindings.length > 32) fail('bindings must contain 0..32 entries')
  if (Buffer.byteLength(JSON.stringify(input)) > 65536) fail('context exceeds 64 KiB budget')
  const bindings = input.bindings.map(binding => {
    exactKeys(binding, ['family', 'key', 'resolution_id', 'resolution_version', 'span'], 'binding')
    if (!FAMILIES.has(binding.family) || !token(binding.key) || !token(binding.resolution_id) || !token(binding.resolution_version)) fail('invalid identity or resolution reference')
    const span = binding.span
    exactKeys(span, ['field', 'start', 'end', 'quote'], 'span')
    if (!FIELDS.has(span.field) || typeof row.article[span.field] !== 'string' || typeof span.quote !== 'string' || !span.quote.trim()) fail('invalid raw span')
    const chars = Array.from(row.article[span.field])
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > chars.length ||
      chars.slice(span.start, span.end).join('') !== span.quote) fail('raw span does not match retained text (Unicode code-point offsets required)')
    return structuredClone(binding)
  })
  const unique = new Map(bindings.map(binding => [hash(binding), binding]))
  return [...unique.values()].sort((a, b) => hash(a).localeCompare(hash(b)))
}

function endpoint(row) {
  // source_id is a legacy article ID, NOT a v2 capture, graph node or change position.
  return { identity_family: 'source_article_snapshot', source_project: row.source_project,
    source_article_id: row.source_id, article_sha256: row.article_sha256, context_sha256: row.context_sha256 }
}

function inspectPair(a, b) {
  const [left, right] = [a, b].sort((x, y) => x.source_id.localeCompare(y.source_id))
  const sharedTerms = left.terms.filter(term => right.terms.includes(term))
  const rightKeys = new Set(right.bindings.map(keyOf))
  const sharedIdentities = [...new Set(left.bindings.filter(binding => rightKeys.has(keyOf(binding))).map(keyOf))]
    .sort().map(key => { const [family, value] = JSON.parse(key); return { family, key: value } })
  const contextSignal = sharedIdentities.some(identity => identity.family !== 'place')
  const lexicalSignal = sharedTerms.length >= 2
  const sameUrl = left.article.url === right.article.url
  const candidate = !sameUrl && (lexicalSignal || contextSignal)
  const eventBound = sharedIdentities.some(identity => EVENT_KEYS.has(identity.family))
  const disposition = sameUrl ? 'same_source_url' : candidate ? 'retrieval_proposal' : 'no_candidate_signal'
  const identity = { contract: CONTRACT, left: endpoint(left), right: endpoint(right) }
  return {
    proposal_id: hash(identity), ...identity, disposition,
    signals: { shared_terms: sharedTerms, shared_identities: sharedIdentities,
      lexical: lexicalSignal, supplied_identity: contextSignal },
    verification_state: !candidate ? 'not_applicable' : eventBound ? 'needs_semantic_verification' : 'insufficient_bound_context',
    remaining_checks: candidate ? [...CHECKS] : [],
    identity_authority: 'caller_supplied_versioned_annotations_not_registry_verified',
    publicly_eligible: false, release_state: 'private', confidence: null, independent_source_count: null,
    interpretation: 'Retrieval proposal only. Shared identity, words, dates or numbers do not establish a relationship or claim equivalence.'
  }
}

export function createProposalSession(rows, contexts = []) {
  // Copy before normalization: later caller edits cannot alter a frozen session.
  const collection = prepareCollection(structuredClone(rows))
  if (!Array.isArray(contexts) || contexts.length > 100) fail('contexts must contain 0..100 entries')
  const byId = new Map()
  for (const context of contexts) {
    exactKeys(context, ['source_id', 'article_sha256', 'bindings'], 'context')
    if (byId.has(context.source_id) || !collection.accepted.some(row => row.source_id === context.source_id)) fail('duplicate or unadmitted context identity')
    byId.set(context.source_id, context)
  }
  const admitted = collection.accepted.map(row => {
    if (digest(row.article) !== row.article_sha256) fail('article fingerprint mismatch')
    const bindings = bindContext(row, byId.get(row.source_id))
    return freeze({ ...row, bindings, context_sha256: hash(bindings), terms: proposalTerms(row.article) })
  }).sort((a, b) => a.source_id.localeCompare(b.source_id))
  const manifest = freeze({ contract: CONTRACT, original_snapshot_sha256: collection.original_snapshot_sha256,
    snapshot_sha256: hash({ contract: CONTRACT, records: admitted }), admitted: admitted.map(endpoint),
    rejected: collection.rejected, max_records: 100, coverage_scope: 'admitted_records_in_this_frozen_offline_snapshot',
    historical_knowledge_supported: false, live_database_mutated: false })
  return Object.freeze({ manifest, input(sourceId) {
    const row = admitted.find(record => record.source_id === sourceId)
    if (!row) fail('unknown or rejected source identity')
    return { ...endpoint(row), article: structuredClone(row.article),
      original_source_fetched_at: row.original_fetched_at, exported_at: row.exported_at,
      text_extent: row.text_extent, lineage: 'unknown', bindings: structuredClone(row.bindings) }
  }, page(options) {
    exactKeys(options, ['source_id', 'after', 'limit', 'as_of'], 'page')
    if (options.as_of != null) fail('historical knowledge queries are unsupported; source fetched_at is not MIP first-observed time')
    const source = admitted.find(row => row.source_id === options.source_id)
    if (!source) fail('unknown or rejected source identity')
    const limit = options.limit ?? 25
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) fail('limit must be 1..25')
    const targets = admitted.filter(row => row.source_id !== source.source_id)
    let index = 0
    if (options.after != null) {
      let cursor
      try { cursor = JSON.parse(Buffer.from(options.after, 'base64url').toString('utf8')) } catch { fail('invalid cursor') }
      if (!Array.isArray(cursor) || cursor.length !== 3 || cursor[0] !== manifest.snapshot_sha256 || cursor[1] !== source.source_id ||
        !Number.isInteger(cursor[2]) || cursor[2] < 1 || cursor[2] >= targets.length) fail('cursor belongs to another snapshot/source or invalid position')
      index = cursor[2]
    }
    const end = Math.min(index + limit, targets.length)
    const items = targets.slice(index, end).map(target => inspectPair(source, target))
    return { contract: CONTRACT, snapshot_sha256: manifest.snapshot_sha256, source: endpoint(source),
      coverage: end === targets.length ? 'complete' : 'partial', coverage_scope: manifest.coverage_scope,
      scanned_through: end, total_targets: targets.length, items,
      next_after: end < targets.length ? Buffer.from(JSON.stringify([manifest.snapshot_sha256, source.source_id, end])).toString('base64url') : null }
  } })
}
