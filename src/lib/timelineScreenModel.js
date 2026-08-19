// Track B Step 3 item 4 — Screen 5 (Timeline) pure seam. No network, no
// flags, no DOM; unit tests pin the invariants in
// tests/timelineScreenModel.test.mjs. Criteria + locked decisions:
// verifier/trackb3-v4/trackb3-step3-item4.md.
//
// The renderer (src/components/ArcTimeline.jsx) is shared by this screen
// and (item 5) the ArcsView Timeline tab; this model gives both scopes —
// arc-scoped (arc_events) and global (canonical event nodes) — ONE entry
// shape, so the connector engine and the detail card never care which
// record a timeline row came from.

import { typePillLabel, confidenceToBadgeState } from './epistemicModel.js'
import { TIMELINE_CLOSING_FOOTNOTE } from './timelineEngine.js'

// --- Locked Screen 5 copy (verbatim; static-guarded) -------------------------
// The eyebrow names the SCREEN, the title names the selected arc (D3).
export const SCREEN5_EYEBROW = 'POLICY CHANGE OVER TIME'
export const SCREEN5_SUBTITLE =
  'Legislation, rulings, incidents, and reporting in one auditable sequence.'
export const SCREEN5_BANNER = 'Missing evidence is recorded, not treated as contradiction.'
// Re-exported so the screen consumes the item-3 constant through one seam.
export { TIMELINE_CLOSING_FOOTNOTE }

// Scope sentinel for the explicit global opt-in (D1). The arc selector
// never contains this value; it is set only by the "All events" control.
export const ALL_EVENTS_SCOPE = '__all_events__'

/**
 * Default arc for the screen (D1): the first ACTIVE arc in loadArcs order
 * (that loader already sorts last_update_at desc, so this is the most
 * recently updated active arc), else the first arc, else null.
 */
export function defaultArcSlug(arcs) {
  const list = Array.isArray(arcs) ? arcs : []
  if (list.length === 0) return null
  const active = list.find((a) => a && a.derived_status === 'active')
  return (active ?? list[0]).slug ?? null
}

const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : null)

/**
 * One timeline entry shape for both scopes.
 * Arc scope (arc_events rows): category is the event type; confidence is
 * the badge vocabulary; no article join exists (articleId null) — the
 * expanded detail card renders its explicit excerpt-unavailable state.
 */
export function normalizeArcEvent(e) {
  if (!e) return null
  return {
    key: e.id ?? e.slug ?? null,
    date: dateOf(e.occurred_at),
    type: e.category ?? null,
    title: e.title ?? 'Untitled event',
    description: e.description ?? null,
    confidence: typeof e.confidence === 'string' ? e.confidence : null,
    badgeState: confidenceToBadgeState(typeof e.confidence === 'string' ? e.confidence : null),
    outlet: null, // arc_events carry no source columns — no source line
    articleId: null,
  }
}

/**
 * Global scope (canonical event nodes from loadTimeline): node type is
 * always 'event' (not an event category), so the pill shows the humanized
 * 'Event' and the spine icon is the neutral marker; numeric node
 * confidence is NOT the badge vocabulary (badgeState null → no badge);
 * article_id comes from the Doc 05 suffix join when it resolved.
 */
export function normalizeNodeEvent(e) {
  if (!e) return null
  const key = e.id ?? e.slug ?? null
  return {
    key,
    slug: e.slug ?? null, // Doc 05 focus join: slug 8-hex suffix = group key
    date: dateOf(e.occurred_at),
    type: 'event',
    title: e.label ?? 'Untitled event',
    description: e.summary ?? e.description ?? null,
    confidence: null,
    badgeState: null,
    outlet: null,
    articleId: e.article_id ?? null,
    kind: 'graph_event',
    arcId: e.arc_id ?? null,
  }
}

/**
 * A News article assigned to a story arc but not represented by a published
 * graph-event node still belongs in the chronology as a **reporting record**.
 * This is deliberately a separate `news` entry type: publication date is not
 * silently converted into an occurrence date, and it creates no edge, causal
 * claim, or graph event. The entry preserves a direct News destination.
 */
export function normalizeArticleTimelineRecord(article) {
  if (!article?.id) return null
  return {
    key: `article-${article.id}`,
    slug: `article-${article.id}`,
    date: dateOf(article.published_at),
    type: 'news',
    title: article.title ?? 'Untitled news record',
    description: article.summary ?? 'Source-linked news record assigned to this story arc.',
    confidence: null,
    badgeState: null,
    outlet: article.outlet ?? null,
    articleId: article.id,
    kind: 'article_record',
    arcId: article.arc_id ?? null,
  }
}

export function sortTimelineEntries(entries) {
  return [...(entries ?? [])].sort((a, b) => {
    const dateA = a?.date ?? '9999-12-31'
    const dateB = b?.date ?? '9999-12-31'
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    // At the same date, preserve the underlying event record before the
    // publication record so reporting remains visibly distinct from the event.
    const kindA = a?.kind === 'article_record' ? 1 : 0
    const kindB = b?.kind === 'article_record' ? 1 : 0
    if (kindA !== kindB) return kindA - kindB
    return String(a?.title ?? '').localeCompare(String(b?.title ?? ''))
  })
}

// --- Filter pills (D5) ---------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthKeyOf(entry) {
  return entry?.date ? entry.date.slice(0, 7) : null // YYYY-MM
}

export function monthLabel(key) {
  const [y, m] = String(key).split('-')
  const name = MONTH_NAMES[Number(m) - 1]
  return name ? `${name} ${y}` : String(key)
}

/** Distinct month buckets present in the entries, oldest first. */
export function deriveDateOptions(entries) {
  const keys = new Set()
  for (const e of entries ?? []) {
    const k = monthKeyOf(e)
    if (k) keys.add(k)
  }
  return [...keys].sort().map((key) => ({ key, label: monthLabel(key) }))
}

/** Distinct entry types present, labeled via the locked pill vocabulary. */
export function deriveTypeOptions(entries) {
  const seen = new Map()
  for (const e of entries ?? []) {
    if (!e?.type) continue
    if (!seen.has(e.type)) seen.set(e.type, typePillLabel(e.type) ?? e.type)
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }))
}

/**
 * Entry filter. An active month excludes undated entries (they cannot
 * match a range — the count line reports the remainder); an active type
 * matches the raw type key.
 */
export function entryMatchesFilters(entry, { month = null, type = null } = {}) {
  if (month) {
    const k = monthKeyOf(entry)
    if (!k || k !== month) return false
  }
  if (type && entry?.type !== type) return false
  return true
}

// --- Footer counts (D6) --------------------------------------------------------

/**
 * Live footer counts — derivations, never literals.
 * Arc scope: articles = attached-article rows; connections = arc-edge rows.
 * Global scope: articles = distinct article identifiers across graph-event
 * joins and explicit News-record rows; connections = relation edges in scope.
 */
export function footerCounts({ scope, entries = [], articles = null, connections = null }) {
  if (scope === ALL_EVENTS_SCOPE) {
    return Object.freeze({
      articles: new Set(entries.map((entry) => entry?.articleId).filter(Boolean)).size,
      connections: Array.isArray(connections) ? connections.length : 0,
    })
  }
  return Object.freeze({
    articles: Array.isArray(articles) ? articles.length : 0,
    connections: Array.isArray(connections) ? connections.length : 0,
  })
}
