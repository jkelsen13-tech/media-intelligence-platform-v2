// Validate retained membership output before creating audit links or considering approval.
// This is readback qualification, not a transaction, input snapshot or publication decision.
const fields = [
  'event_id', 'model_version', 'membership_fingerprint_hash', 'membership_fingerprint',
  'cluster_confidence', 'decision', 'hard_rejections', 'member_scores', 'release_gate',
]
export const MEMBERSHIP_SCORE_READBACK_COLUMNS = ['id', ...fields].join(',')
const key = row => JSON.stringify([row.event_id, row.model_version, row.membership_fingerprint_hash])
function equalJson(a, b) {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ak = Object.keys(a), bk = Object.keys(b)
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && equalJson(a[k], b[k]))
}
export function verifiedMembershipScoreIds(expected, retained) {
  const wanted = new Map()
  for (const row of expected) {
    const k = key(row)
    if (wanted.has(k)) throw new Error('duplicate expected membership score')
    wanted.set(k, row)
  }
  const ids = new Map(), seenIds = new Set()
  for (const row of retained) {
    const k = key(row), original = wanted.get(k)
    if (!original) continue // Unrelated immutable history remains retained.
    if (ids.has(k) || typeof row.id !== 'string' || !row.id || seenIds.has(row.id))
      throw new Error('ambiguous retained membership score')
    if (!fields.every(field => Object.hasOwn(row, field) && equalJson(row[field], original[field])))
      throw new Error('retained membership score differs from computed output')
    ids.set(k, row.id)
    seenIds.add(row.id)
  }
  if (ids.size !== wanted.size) throw new Error('missing retained membership score')
  return new Map(expected.map(row => [`${row.event_id}|${row.membership_fingerprint_hash}`, ids.get(key(row))]))
}
