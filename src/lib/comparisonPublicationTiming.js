import { retainedDateDisplay } from './investigationEvidenceTrail.js'

// Qualified clocks denote precision intervals, not invented exact instants.
// BigInt retains microseconds even for dates beyond Number's safe integer range.
function interval(value) {
  const display = retainedDateDisplay(value)
  const match = /^(.*T\d{2}:\d{2})(?::(\d{2})(\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/.exec(display.dateTime ?? '')
  if (!match) return null
  const millis = Date.parse(match[1] + ':' + (match[2] ?? '00') + match[5])
  if (!Number.isFinite(millis)) return null
  const start = BigInt(millis) * 1000n + BigInt((match[4] ?? '').padEnd(6, '0'))
  const width = match[2] === undefined ? 60000000n : 10n ** BigInt(6 - (match[4]?.length ?? 0))
  return { start, end: start + width, value }
}
const compare = (a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0

export function comparisonPublicationTiming(articles) {
  const outlets = [...new Set(articles.map(row => row.outlet))]
  const groups = outlets.map(outlet => {
    const records = articles.filter(row => row.outlet === outlet).map(row => interval(row.published_at))
    const complete = records.length > 0 && records.every(Boolean)
    const ordered = records.filter(Boolean).sort(compare)
    // A missing/unknown clock can precede any qualified clock in this outlet.
    return { outlet, complete, first: complete ? ordered[0] : null }
  })
  const ordered = [...groups].sort((a, b) => a.first && b.first ? compare(a.first, b.first) : a.first ? -1 : b.first ? 1 : 0)
  const candidate = ordered[0]
  const first = candidate?.first && groups.every(row => row.complete)
    && ordered.slice(1).every(row => candidate.first.end <= row.first.start) ? candidate : null
  return {
    firstOutlet: first?.outlet ?? null,
    timing: ordered.map(row => {
      let lagHours = null
      if (first && row.first) {
        if (row === first) lagHours = 0
        else {
          const low = Number(row.first.start - first.first.end) / 3600000000
          const high = Number(row.first.end - first.first.start) / 3600000000
          const rounded = Math.round(low * 10) / 10
          if (rounded === Math.round(high * 10) / 10) lagHours = rounded
        }
      }
      return { outlet: row.outlet, firstPublishedAt: row.first?.value ?? null, lagHours }
    }),
  }
}

// Missing dates are not ranks. Mixed or overlapping precision cannot prove
// which review is latest; individual retained dates remain inspectable.
export function latestComparableReview(values) {
  const recorded = [...new Set(values.filter(value => typeof value === 'string' && value))]
  if (!recorded.length) return null
  const displays = recorded.map(retainedDateDisplay)
  if (displays.some(display => display.label === 'Unrecognized retained date')) return null
  if (recorded.length === 1) return recorded[0]
  if (displays.every(display => display.dateTime?.length === 10)) return [...recorded].sort().at(-1)
  const dates = recorded.map(interval)
  if (dates.some(date => !date)) return null
  dates.sort(compare)
  const latest = dates.at(-1)
  return dates.slice(0, -1).every(date => date.end <= latest.start || (date.start === latest.start && date.end === latest.end))
    ? latest.value : null
}
