// Completeness is relative to the explicitly requested identities, not an atomic snapshot.
export function verifyRequestedArticleRows(ids, rows) {
  if (!Array.isArray(ids) || !Array.isArray(rows)) throw new Error('invalid article input read')
  const expected = new Set()
  for (const id of ids) {
    if (typeof id !== 'string' || !id.length || expected.has(id)) throw new Error('ambiguous requested article identity')
    expected.add(id)
  }
  const seen = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.id !== 'string' || !expected.has(row.id) || seen.has(row.id)) {
      throw new Error('unexpected or duplicate article input')
    }
    seen.add(row.id)
  }
  if (seen.size !== expected.size) throw new Error('missing requested article input')
}
