// Separate publisher-behavior metrics for the News source list.
//
// The platform may calculate only measures supported by its stored data. Volume
// is a literal count of filtered article records. First-to-report is constrained
// to a unique earliest publisher timestamp within a *recorded event grouping*;
// it is not a claim about coverage outside the corpus. Independent corroboration
// remains unavailable until verified source-lineage records exist, because
// multiple outlets in an event grouping do not establish independence.

const emptyMetric = () => ({
  volume: 0,
  firstToReportCount: 0,
  corroborationCount: null,
})

export function buildSourceMetrics(rows, eventMap) {
  const metrics = new Map()
  const eventOutlets = new Map()

  for (const row of rows ?? []) {
    const outlet = String(row?.outlet ?? '').trim()
    if (!outlet) continue
    if (!metrics.has(outlet)) metrics.set(outlet, emptyMetric())
    metrics.get(outlet).volume += 1

    const eventId = eventMap?.get(row.id)?.eventId
    const publishedAt = Date.parse(row.published_at ?? '')
    if (!eventId || Number.isNaN(publishedAt)) continue
    if (!eventOutlets.has(eventId)) eventOutlets.set(eventId, new Map())
    const byOutlet = eventOutlets.get(eventId)
    const prior = byOutlet.get(outlet)
    // One outlet can contribute multiple publisher records to a recorded event.
    // Its earliest retained timestamp is the only timestamp eligible here.
    if (prior == null || publishedAt < prior) byOutlet.set(outlet, publishedAt)
  }

  for (const byOutlet of eventOutlets.values()) {
    if (byOutlet.size < 2) continue
    const coverage = [...byOutlet.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    // Ties are deliberately not called first-to-report: neither outlet predates
    // the other in the retained event grouping.
    if (coverage[0][1] >= coverage[1][1]) continue
    metrics.get(coverage[0][0]).firstToReportCount += 1
  }

  return metrics
}

export function enrichOutletsWithMetrics(outlets, metrics) {
  return (outlets ?? []).map((outlet) => ({
    ...outlet,
    ...(metrics?.get(outlet.name) ?? emptyMetric()),
  }))
}

export function sortOutletsBySourceMetric(outlets, order) {
  const rows = [...(outlets ?? [])]
  if (order === 'name') return rows.sort((a, b) => a.name.localeCompare(b.name))
  if (order === 'first') {
    return rows.sort(
      (a, b) => b.firstToReportCount - a.firstToReportCount || a.name.localeCompare(b.name),
    )
  }
  // Corroboration has no sortable value until source lineage is verified. The
  // UI disables that choice and retains a stable literal-volume fallback.
  return rows.sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name))
}
