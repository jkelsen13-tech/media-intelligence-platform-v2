export const INGEST_REGISTER = 'ingest_sources'
export const INGESTION_REGISTER = 'ingestion_sources'
export const DISCOVERY_TYPES = Object.freeze(['gdelt_doc_api', 'gdelt_bigquery'])

export function isDiscoverySource(row = {}) {
  return DISCOVERY_TYPES.includes(row.source_type) || /^gdelt[-_]/i.test(row.source_key ?? '')
}

export function normalizeEndpoint(url) {
  return String(url ?? '').trim()
}

export function registerFingerprint(row, register) {
  if (register === INGEST_REGISTER) return `feed:${normalizeEndpoint(row.feed_url)}`
  return `key:${row.source_key}:${normalizeEndpoint(row.source_url)}`
}

/**
 * The two Manus source registers are different object families. A UNION must
 * never activate every endpoint or enable body collection. GDELT discovery is
 * not a publisher and not independent corroboration.
 */
export function reconcileSourceRegisters(ingestSources = [], ingestionSources = []) {
  const ingest = ingestSources.map((row) => ({
    register: INGEST_REGISTER,
    outlet_id: row.outlet_id ?? null,
    feed_url: normalizeEndpoint(row.feed_url),
    enabled: false,
    collection_enabled: false,
    allow_body_fetch: false,
    source_type: 'rss',
    label: row.label ?? null,
  }))
  const ingestion = ingestionSources.map((row) => ({
    register: INGESTION_REGISTER,
    source_key: row.source_key,
    label: row.label,
    source_url: normalizeEndpoint(row.source_url),
    source_type: row.source_type,
    outlet_domain: row.outlet_domain ?? null,
    active: false,
    collection_enabled: false,
    allow_body_fetch: false,
    notes: isDiscoverySource(row)
      ? 'Discovery index. Not a publisher and not an independent corroborating source.'
      : row.notes ?? null,
  }))

  const relationships = []
  for (const feed of ingest) {
    const sameEndpoint = ingestion.find((row) => row.source_url === feed.feed_url)
    if (sameEndpoint) {
      relationships.push({
        ingest_feed_url: feed.feed_url,
        ingestion_source_key: sameEndpoint.source_key,
        relationship: 'same_publisher_same_endpoint',
        collection_enabled: false,
        notes: 'Matching endpoints still stay in separate registers until an explicit collection enable.',
      })
      continue
    }
    const samePublisher = ingestion.find((row) => {
      try {
        const feedHost = new URL(feed.feed_url).hostname.replace(/^www\./, '')
        const sourceHost = new URL(row.source_url).hostname.replace(/^www\./, '')
        return feedHost === sourceHost && row.source_type === 'rss'
      } catch {
        return false
      }
    })
    if (samePublisher) {
      relationships.push({
        ingest_feed_url: feed.feed_url,
        ingestion_source_key: samePublisher.source_key,
        relationship: 'same_publisher_different_endpoint',
        collection_enabled: false,
        notes: 'BBC World and BBC News (or similar) remain distinct sources.',
      })
      continue
    }
    relationships.push({
      ingest_feed_url: feed.feed_url,
      ingestion_source_key: null,
      relationship: 'distinct_registers',
      collection_enabled: false,
      notes: 'No counterpart in the keyed ingestion register.',
    })
  }

  for (const row of ingestion) {
    if (!isDiscoverySource(row)) continue
    relationships.push({
      ingest_feed_url: null,
      ingestion_source_key: row.source_key,
      relationship: 'discovery_not_publisher',
      collection_enabled: false,
      notes: 'GDELT discovery cannot be activated as a publisher feed or corroborating source.',
    })
  }

  return {
    ingest_sources: ingest,
    ingestion_sources: ingestion,
    relationships,
    collection_enabled: false,
    union_forbidden: true,
  }
}

export function assertCollectionDisabled(reconciliation) {
  const enabled = [
    ...(reconciliation.ingest_sources ?? []),
    ...(reconciliation.ingestion_sources ?? []),
    ...(reconciliation.relationships ?? []),
  ].filter((row) => row.collection_enabled === true || row.enabled === true || row.active === true)
  if (enabled.length) throw new Error('collection remains disabled until registers are reconciled and monitoring works')
  return true
}
