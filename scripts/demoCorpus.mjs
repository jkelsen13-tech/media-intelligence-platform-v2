// Isolated corpus analysis. No backend client, credentials, or publication code.
export const TOPICS = ['iran', 'epstein', 'project2025']
export const DEMO_SURFACES = ['context', 'news', 'evidence', 'compare', 'graph', 'timeline', 'arc']
export function parseDemoRoute(hash, records = []) {
  const fallback = { topic: 'iran', surface: 'context', capture: null }
  if (typeof hash !== 'string' || hash.length > 240 || /[\u0000-\u001f]/.test(hash)) return fallback
  let parts
  try { parts = hash.split('/').map(decodeURIComponent) } catch { return fallback }
  const [, root, topic, surface, capture, ...extra] = parts
  if (root !== 'demo' || !TOPICS.includes(topic) || !DEMO_SURFACES.includes(surface) || extra.length) return fallback
  if (!capture) return { topic, surface, capture: null }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(capture)) return { topic, surface: 'context', capture: null }
  const member = records.some((record) => record.topic === topic && record.capture_id === capture)
  return member ? { topic, surface, capture } : { topic, surface: 'context', capture: null }
}
export function serializeDemoRoute({ topic, surface, capture = null }) {
  if (!TOPICS.includes(topic) || !DEMO_SURFACES.includes(surface)) throw new Error('Invalid demo route')
  return `#/demo/${topic}/${surface}${capture ? `/${encodeURIComponent(capture)}` : ''}`
}
export function exactSpan(text, excerpt) {
  const haystack = Array.from(text), needle = Array.from(excerpt)
  if (!needle.length) throw new Error('Empty evidence')
  const matches = []
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((c, j) => haystack[i + j] === c)) matches.push(i)
  }
  if (matches.length !== 1) throw new Error('Evidence must have one exact occurrence')
  return { span_start: matches[0], span_end: matches[0] + needle.length }
}
export function canonicalUrl(value) {
  const u = new URL(value)
  if (!['https:', 'http:'].includes(u.protocol)) throw new Error('Unsupported URL')
  u.hash = ''
  for (const key of [...u.searchParams.keys()]) if (/^(utm_.*|fbclid|gclid|dclid|msclkid)$/i.test(key)) u.searchParams.delete(key)
  return u.href
}
export function analyzeSources(records) {
  const identities = new Map(), origins = new Set(), dependencies = new Map(), warnings = [], dependencyOrigins = new Map()
  for (const r of records) {
    const key = canonicalUrl(r.url)
    const versions = identities.get(key) ?? new Set()
    versions.add(r.content_hash ?? 'unretained')
    identities.set(key, versions)
    // Unknown provenance must not be counted as a fresh independent origin.
    if (r.origin_id) origins.add(r.origin_id)
    else warnings.push({ url: key, reason: 'origin_unresolved' })
    if (r.dependency_id) {
      dependencies.set(r.dependency_id, (dependencies.get(r.dependency_id) ?? 0) + 1)
      const group = dependencyOrigins.get(r.dependency_id) ?? new Set()
      if (r.origin_id) group.add(r.origin_id)
      dependencyOrigins.set(r.dependency_id, group)
    }
  }
  for (const [dependency, group] of dependencyOrigins) if (group.size > 1) {
    for (const origin of group) origins.delete(origin)
    warnings.push({ dependency, reason: 'conflicting_origin_assignment' })
  }
  return { records: records.length, unique_urls: identities.size,
    versions: [...identities.values()].reduce((n, s) => n + s.size, 0),
    independent_origins: origins.size, dependency_groups: [...dependencies.entries()], warnings }
}
export function resolveIdentity(reference, registry) {
  // Labels, fuzzy matches and ambiguous aliases do not confer canonical identity.
  if (!reference?.namespace || !reference?.id) return null
  const matches = registry.filter(r => r.namespace === reference.namespace && r.id === reference.id)
  return matches.length === 1 ? matches[0] : null
}
export function nearDuplicates(records, threshold = 0.8) {
  const tokens = s => new Set((s ?? '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
  const pairs = []
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
    const a = tokens(records[i].excerpt), b = tokens(records[j].excerpt)
    // Tiny generic excerpts cannot establish syndication or identity.
    if (Math.min(a.size, b.size) < 8) continue
    const intersection = [...a].filter(t => b.has(t)).length
    const similarity = intersection / new Set([...a, ...b]).size
    if (similarity >= threshold) pairs.push({ left: records[i].url, right: records[j].url, similarity, disposition: 'human_dependency_review_required' })
  }
  return pairs
}
export function validatePrivateRelation(relation, registry) {
  if (!['source_statement', 'attribution', 'research_membership', 'synthetic_event_place', 'synthetic_sequence'].includes(relation.type)) throw new Error('Unsupported inference')
  const from = resolveIdentity(relation.from, registry), to = resolveIdentity(relation.to, registry)
  if (!from || !to) throw new Error('Unresolved endpoint')
  if (relation.type.startsWith('synthetic_') && (!from.synthetic || !to.synthetic)) throw new Error('Synthetic relationship requires synthetic endpoints')
  if (relation.publication_allowed !== false) throw new Error('Publication forbidden')
  return { ...relation, from, to }
}
export function syntheticProjection(topic) {
  // Invented demonstration, deliberately unrelated to real people and places.
  const namespace = `synthetic:${topic}`
  const actor = { namespace, id: 'institution', label: 'Example Review Office', synthetic: true }
  const event = { namespace, id: 'event-1', label: 'Illustrative review meeting', synthetic: true, date: '2025-01-15' }
  const later = { namespace, id: 'event-2', label: 'Illustrative response', synthetic: true, date: '2025-01-20' }
  const place = { namespace, id: 'place', label: 'Example district (not a real location)', synthetic: true }
  const registry = [actor, event, later, place]
  const relationships = [
    { type: 'attribution', from: event, to: actor },
    { type: 'synthetic_event_place', from: event, to: place },
    { type: 'synthetic_sequence', from: event, to: later },
  ].map(r => validatePrivateRelation({ ...r, publication_allowed: false }, registry))
  return { registry, relationships, comparison_event: { namespace: `${namespace}:comparison`, id: 'comparison-1', graph_event: event },
    arc: { id: `${namespace}:arc`, members: [event, later] }, timeline: [event, later], geography: [{ event, place }], synthetic: true }
}

const RECEIPT_FIELDS = [
  'topic', 'origin_id', 'dependency_id', 'source_type', 'semantic_kind', 'run_id',
  'source_date', 'rights', 'manus_id', 'url', 'title', 'outlet', 'published_at',
  'publication_precision', 'retained_scope', 'statement', 'remaining_uncertainty',
  'article_id', 'reader_state', 'capture_id', 'capture_state', 'content_hash',
  'candidate_id', 'candidate_state', 'span_start', 'span_end',
  'retained_text_availability', 'source_verified_at',
]

export function projectReceipt(receipt) {
  if (!TOPICS.includes(receipt?.topic)) throw new Error('Unknown demo topic')
  if (receipt.reader_state !== 'pending_review' || receipt.capture_state !== 'pending' || receipt.candidate_state !== 'pending') throw new Error('Preview requires pending receipts')
  for (const key of ['article_id', 'capture_id', 'candidate_id', 'content_hash']) if (!receipt[key]) throw new Error(`Missing retained identity: ${key}`)
  if (!/^[a-f0-9]{64}$/.test(receipt.content_hash)) throw new Error('Invalid retained content hash')
  if (!Number.isInteger(receipt.span_start) || !Number.isInteger(receipt.span_end) || receipt.span_start < 0 || receipt.span_end <= receipt.span_start) throw new Error('Invalid exact span')
  const sourceUrl = new URL(receipt.url)
  if (sourceUrl.protocol !== 'https:') throw new Error('Demo sources require HTTPS')
  for (const forbidden of ['public_node_id', 'canonical_claim_id', 'canonical_event_id', 'relationship_id', 'admission_id']) if (receipt[forbidden] != null) throw new Error(`Canonical field forbidden: ${forbidden}`)
  const projected = Object.fromEntries(RECEIPT_FIELDS.map((key) => [key, receipt[key] ?? null]))
  return Object.freeze({ ...projected, preview_id: `private:capture:${receipt.capture_id}`, public_node_id: null,
    publication_allowed: false, timeline_basis: 'source_publication_date_only',
    geography: Object.freeze({ state: 'withheld_unreviewed', causal_inference: false }) })
}

export function createPreview(records, { requireComplete = false } = {}) {
  if (!Array.isArray(records)) throw new Error('Demo corpus must be an array')
  if (records.some((record) => !TOPICS.includes(record?.topic))) throw new Error('Unknown demo topic')
  for (const key of ['capture_id', 'candidate_id']) {
    const values = records.map((record) => record[key])
    if (new Set(values).size !== values.length) throw new Error(`Duplicate demo identity: ${key}`)
  }
  if (requireComplete) {
    for (const key of ['url', 'article_id']) {
      const values = records.map((record) => record[key])
      if (new Set(values).size !== values.length) throw new Error(`Duplicate bounded-corpus identity: ${key}`)
    }
    const counts = Object.fromEntries(TOPICS.map((topic) => [topic, records.filter((record) => record.topic === topic).length]))
    if (records.length !== 93 || counts.iran !== 30 || counts.epstein !== 30 || counts.project2025 !== 33) throw new Error('Incomplete bounded demo corpus')
  }
  return TOPICS.map(topic => {
    const sources = records.filter(r => r.topic === topic).map(projectReceipt)
    return { topic, sources, accounting: analyzeSources(sources),
      comparison: { state: 'provisional_topic_collection', event_identity: null, sources: sources.map(s => s.preview_id) },
      graph: { nodes: sources.map(s => ({ id: s.preview_id, type: 'private_source_capture' })), edges: [] },
      origins: [...new Set(sources.map(s => s.origin_id).filter(Boolean))].map(id => ({ id: `private:origin:${id}`, label: id })),
      statements: sources.filter(s => s.candidate_id).map(s => ({ id: `private:candidate:${s.candidate_id}`, capture: s.preview_id, statement: s.statement, origin: s.origin_id ? `private:origin:${s.origin_id}` : null, state: 'pending' })),
      dependencyGroups: [...new Set(sources.map(s => s.dependency_id).filter(Boolean))].map(id => ({ id, members: sources.filter(s => s.dependency_id === id).map(s => s.preview_id), interpretation: 'research_dependency_not_corroboration' })),
      synthetic: syntheticProjection(topic),
      arc: { id: `private:collection:${topic}`, type: 'research_collection', members: sources.map(s => s.preview_id) },
      admission: { allowed: false, reason: 'No reviewed and authorized candidate-promotion operation exists for this demo projection' } }
  })
}
