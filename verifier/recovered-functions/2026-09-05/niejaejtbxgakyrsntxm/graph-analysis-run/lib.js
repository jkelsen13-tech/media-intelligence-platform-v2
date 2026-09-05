// G-ALG-1: shared runtime for the graph-analysis-run edge function.
//
// Plain ESM JavaScript (no Deno- or Node-only APIs) so the SAME FILE runs in
// the Deno edge runtime and under node:test. That gives byte-level equivalence
// with the Node reference modules for free — the equivalence suite
// (tests/analysis/hashEquivalence.test.mjs) pins this file against
// src/analysis/checkpoint.js and src/analysis/layoutSeed.js on the frozen
// fixture and proves identical hashes and positions.
//
// Hashing uses Web Crypto (globalThis.crypto.subtle, async) instead of
// node:crypto so the module is runtime-portable. Canonicalization rules are
// the stable contract shipped in G-ALG-0 and must never change:
//   - rows reduced to whitelisted model attributes;
//   - object keys sorted lexicographically at every depth;
//   - rows sorted by id (nodes) and by (source_id, target_id, id) (edges);
//   - undefined values dropped, null preserved.

export const NODE_ATTRIBUTES = Object.freeze(['id', 'slug', 'label', 'type', 'arc_id', 'confidence', 'occurred_at'])
export const EDGE_ATTRIBUTES = Object.freeze(['id', 'source_id', 'target_id', 'type', 'signal_source', 'doc_strength', 'reliability', 'similarity'])

// Doc 13 site 3: PostgREST silently truncates any unpaginated select at 1000
// rows — and the checkpoint hash is computed JS-side over whatever the read
// returned, so a truncated read would mint a hash describing a PARTIAL graph.
// Keyset-paginate by the unique `id` column until a short page returns.
// Keyset (cursor) is preferred over offset because ingest writes
// concurrently — offsets can skip/duplicate rows as inserts shift pages.
// Lives in lib.js (runtime-portable) so node:test pins the read path itself.
export async function keysetAll(client, table, cols, { pageSize = 1000 } = {}) {
  const out = []
  let last = null
  for (;;) {
    let q = client.from(table).select(cols).order('id', { ascending: true })
    if (last !== null) q = q.gt('id', last)
    const { data, error } = await q.limit(pageSize)
    if (error) return { data: null, error }
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: out, error: null }
    last = data[data.length - 1].id
  }
}

export const LAYOUT_ALGORITHM = 'phyllotaxis-seed'
export const LAYOUT_ALGORITHM_VERSION = '1.0.0'
export const LAYOUT_SEED = 'fnv1a-32'
export const LAYOUT_CONFIG = Object.freeze({ spacing: 40 })

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalize(value[key])
    }
    return out
  }
  return value
}

function pickDefined(row, keys) {
  const out = {}
  for (const k of keys) {
    if (row[k] !== undefined) out[k] = row[k]
  }
  return out
}

export function canonicalNodeRows(nodeRows) {
  return (nodeRows ?? [])
    .map((r) => pickDefined(r, NODE_ATTRIBUTES))
    .map(canonicalize)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

export function canonicalEdgeRows(edgeRows) {
  return (edgeRows ?? [])
    .map((r) => pickDefined(r, EDGE_ATTRIBUTES))
    .map(canonicalize)
    .sort((a, b) => {
      const s = String(a.source_id).localeCompare(String(b.source_id))
      if (s !== 0) return s
      const t = String(a.target_id).localeCompare(String(b.target_id))
      if (t !== 0) return t
      return String(a.id ?? '').localeCompare(String(b.id ?? ''))
    })
}

export async function hashRows(rows) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(rows)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Async twin of src/analysis/checkpoint.js computeCheckpoint (Web Crypto). */
export async function computeCheckpoint(nodeRows, edgeRows) {
  const nodes = canonicalNodeRows(nodeRows)
  const edges = canonicalEdgeRows(edgeRows)
  return {
    node_count: nodes.length,
    edge_count: edges.length,
    nodes_hash: await hashRows(nodes),
    edges_hash: await hashRows(edges),
  }
}

// --- deterministic layout seed (twin of src/analysis/layoutSeed.js) --------

export function hashId(id) {
  let h = 0x811c9dc5
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export function seedPosition(id, { spacing = 40 } = {}) {
  const h = hashId(id)
  const index = h % 100000
  const angle = index * GOLDEN_ANGLE + (h / 0xffffffff) * Math.PI * 2
  const radius = spacing * Math.sqrt(index + 0.5)
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
}

export function seedPositions(nodeIds, opts) {
  const positions = {}
  for (const id of nodeIds ?? []) positions[String(id)] = seedPosition(String(id), opts)
  return positions
}

// --- writer planning (pure; the edge function only executes the plan) ------

/**
 * Decide what to persist, given what is already stored.
 * Idempotent: a checkpoint with matching hashes is reused, never duplicated;
 * a layout version for that checkpoint with identical algorithm identity
 * (algorithm + version + seed + config) is reused, never duplicated.
 *
 * @param {object} checkpoint - fresh computeCheckpoint() result
 * @param {Array<object>} existingCheckpoints - rows with id/nodes_hash/edges_hash
 * @param {Array<object>} existingLayouts - graph_layout_versions rows
 * @returns {{ checkpointAction: 'reuse'|'insert', checkpointId: string|null,
 *             layoutAction: 'reuse'|'insert', layoutId: string|null,
 *             supersedes: string|null }}
 */
export function planWrites(checkpoint, existingCheckpoints, existingLayouts) {
  const match = (existingCheckpoints ?? []).find(
    (c) => c.nodes_hash === checkpoint.nodes_hash && c.edges_hash === checkpoint.edges_hash,
  )
  const checkpointAction = match ? 'reuse' : 'insert'
  const checkpointId = match ? match.id : null

  const sameIdentity = (l) =>
    l.algorithm === LAYOUT_ALGORITHM &&
    l.algorithm_version === LAYOUT_ALGORITHM_VERSION &&
    l.seed === LAYOUT_SEED &&
    JSON.stringify(l.config) === JSON.stringify(LAYOUT_CONFIG)

  const layouts = existingLayouts ?? []
  const forCheckpoint = checkpointId ? layouts.filter((l) => l.checkpoint_id === checkpointId) : []
  const layoutMatch = forCheckpoint.find(sameIdentity)
  const layoutAction = layoutMatch ? 'reuse' : 'insert'

  // New layout supersedes the most recent prior version for this checkpoint,
  // if any (list order from the query is generated_at desc).
  const supersedes = layoutMatch ? null : (forCheckpoint[0]?.id ?? null)

  return { checkpointAction, checkpointId, layoutAction, layoutId: layoutMatch?.id ?? null, supersedes }
}

/**
 * Build the graph_layout_versions insert payload (minus checkpoint_id, which
 * the caller knows only after the checkpoint row exists).
 */
export function buildLayoutPayload(nodeRows, { supersedes = null } = {}) {
  const positions = seedPositions((nodeRows ?? []).map((n) => String(n.id)))
  return {
    algorithm: LAYOUT_ALGORITHM,
    algorithm_version: LAYOUT_ALGORITHM_VERSION,
    config: { ...LAYOUT_CONFIG },
    seed: LAYOUT_SEED,
    positions,
    supersedes,
  }
}
