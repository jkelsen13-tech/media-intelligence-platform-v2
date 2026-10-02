// Separate publisher-behavior metrics for the News source list.
//
// The platform may calculate only measures supported by its stored data. Volume
// is a literal count of filtered article records. First-to-report is constrained
// to a unique earliest publisher timestamp within a *recorded event grouping*;
// it is not a claim about coverage outside the corpus. Independent corroboration
// remains unavailable until verified source-lineage records exist, because
// multiple outlets in an event grouping do not establish independence.

import { comparisonPublicationTiming } from './comparisonPublicationTiming.js'

const emptyMetric = () => ({
  volume: 0,
  firstToReportCount: 0,
  corroborationCount: null,
})

export function buildSourceMetrics(rows, eventMap) {
  const metrics = new Map()
  const eventArticles = new Map()

  for (const row of rows ?? []) {
    const outlet = String(row?.outlet ?? '').trim()
    if (!outlet) continue
    if (!metrics.has(outlet)) metrics.set(outlet, emptyMetric())
    metrics.get(outlet).volume += 1

    const eventId = eventMap?.get(row.id)?.eventId
    if (!eventId) continue
    if (!eventArticles.has(eventId)) eventArticles.set(eventId, [])
    // Unknown clocks remain in the group: they can precede a qualified record.
    eventArticles.get(eventId).push({ outlet, published_at: row.published_at })
  }

  for (const articles of eventArticles.values()) {
    if (new Set(articles.map(row => row.outlet)).size < 2) continue
    // Reuse Source Comparison's precision intervals, explicit UTC offsets,
    // retained microseconds, and complete-corpus-clock requirement.
    const { firstOutlet } = comparisonPublicationTiming(articles)
    if (firstOutlet !== null) metrics.get(firstOutlet).firstToReportCount += 1
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
