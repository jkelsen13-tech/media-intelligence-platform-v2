// Isolated corpus analysis. No backend client, credentials, or publication code.
export const TOPICS = ['iran', 'epstein', 'project2025']
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
export function createPreview(records) {
  return TOPICS.map(topic => {
    const sources = records.filter(r => r.topic === topic).map(r => {
      if (r.reader_state !== 'pending_review' || r.capture_state !== 'pending' || (r.candidate_id && r.candidate_state !== 'pending')) throw new Error('Preview requires pending receipts')
      if (!r.capture_id || !r.article_id || !r.content_hash) throw new Error('Retained identity required')
      return { ...r, preview_id: `private:capture:${r.capture_id}`, public_node_id: null,
        publication_allowed: false, timeline_basis: 'source_publication_date_only',
        semantic_kind: r.semantic_kind ?? 'attributed_statement',
        geography: { state: 'unresolved', causal_inference: false } }
    })
    return { topic, sources, accounting: analyzeSources(sources),
      comparison: { state: 'provisional_topic_collection', event_identity: null, sources: sources.map(s => s.preview_id) },
      graph: { nodes: sources.map(s => ({ id: s.preview_id, type: 'private_source_capture' })), edges: [] },
      arc: { id: `private:collection:${topic}`, type: 'research_collection', members: sources.map(s => s.preview_id) },
      admission: { allowed: false, reason: 'Lane A unresolved; no authorized candidate promotion mechanism' } }
  })
}
