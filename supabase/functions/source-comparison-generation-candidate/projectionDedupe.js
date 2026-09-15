// Exact deterministic deduplication used by the observed v15/frozen v16 runner.
export function dedupeArticleClaims(rows) {
  const winners = new Map()
  for (const row of rows) {
    const key = `${row.claim_key}|${row.article_id}`
    const current = winners.get(key)
    if (!current ||
      row.extraction_confidence > current.extraction_confidence ||
      (row.extraction_confidence === current.extraction_confidence &&
        (row.surface_text.length > current.surface_text.length ||
          (row.surface_text.length === current.surface_text.length && row.surface_text < current.surface_text)))) {
      winners.set(key, row)
    }
  }
  return { winners, rows: rows.filter((row) => winners.get(`${row.claim_key}|${row.article_id}`) === row) }
}

export function dedupeProjectionExplanations(rows, winners) {
  return rows.filter((row) => {
    const parts = String(row.assertion_id).split(':')
    const articleId = parts.at(-1)
    const ordinal = parts.at(-2)
    const eventId = parts.at(-3)
    const winner = winners.get(`${eventId}:c${ordinal}|${articleId}`)
    return !!winner && String(row.supporting_passage).startsWith(`Surface claim "${winner.surface_text}" grouped under canonical "`)
  })
}

