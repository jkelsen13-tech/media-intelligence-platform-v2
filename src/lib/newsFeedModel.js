// Track B Step 4 (News Feed, addendum Screen 1): pure seam for the feed's
// derived display model — grouping, provenance footer, freshness label,
// last-visit count. No DOM, no supabase imports — unit-testable in node:test
// (same seam pattern as listFilters.js / timelineScreenModel.js).

// Owner ruling 2026-08-18 (#6/provenance): the citations.cited_type
// vocabulary DOES carry a primary-document discriminator — court_doc and
// agency_release are primary filings; named_official / anonymous_official /
// study are general source citations. "Primary filing linked" renders only
// when a real citation of a primary type exists; otherwise url+summary
// articles render "Source-linked summary"; articles with neither render no
// provenance line rather than a fabricated one.
export const PRIMARY_CITATION_TYPES = new Set(['court_doc', 'agency_release'])

/**
 * Per-article provenance footer basis (addendum: "Distinct per article, not
 * boilerplate").
 * @param {{url?: string|null, summary?: string|null}} article
 * @param {Iterable<string>|null} citedTypes - cited_type values resolved for
 *   this article (null/empty = no citations recorded)
 * @returns {'primary'|'source-linked'|null}
 */
export function provenanceBasis(article, citedTypes) {
  for (const t of citedTypes ?? []) {
    if (PRIMARY_CITATION_TYPES.has(t)) return 'primary'
  }
  if (article?.url && article?.summary) return 'source-linked'
  return null
}

export const PROVENANCE_LABELS = {
  primary: 'Primary filing linked',
  'source-linked': 'Source-linked summary',
}

/**
 * Header freshness label (owner ruling #7): real relative age under 24h,
 * absolute date at/after 24h — a static corpus must never read as freshly
 * updated.
 * @param {string|Date|null} latestFetchedAt
 * @param {number} now - ms epoch (injected for tests)
 * @returns {string|null} null when no fetch timestamp exists
 */
export function freshnessLabel(latestFetchedAt, now) {
  if (!latestFetchedAt) return null
  const t = new Date(latestFetchedAt).getTime()
  if (!Number.isFinite(t)) return null
  const ageMin = Math.max(0, Math.floor((now - t) / 60000))
  if (ageMin < 60) return `updated ${ageMin} min ago`
  if (ageMin < 1440) {
    const h = Math.floor(ageMin / 60)
    return `updated ${h} hour${h === 1 ? '' : 's'} ago`
  }
  return `updated ${new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
}

/**
 * Full header line replacing the machine-facing "data: supabase" label
 * (addendum carried-forward requirement): article_count is a live token.
 * @returns {string|null} null when count is unknown — the label then does
 *   not render at all rather than pinning a stale number.
 */
export function liveCorpusLabel(articleCount, latestFetchedAt, now) {
  if (articleCount == null || !Number.isFinite(articleCount)) return null
  const fresh = freshnessLabel(latestFetchedAt, now)
  const base = `Live corpus — ${articleCount} article${articleCount === 1 ? '' : 's'}`
  return fresh ? `${base} — ${fresh}` : base
}

/**
 * Event grouping (parent-doc Step 4: "7 outlets reporting rather than seven
 * duplicate cards"). Articles sharing an event collapse into ONE group card;
 * single-article events and eventless articles stay flat.
 * @param {Array} articles - the current page, in feed order
 * @param {Map<string, {eventId: string, title: string|null}>} eventByArticleId
 * @returns {Array<{kind:'group', eventId, title, articles, outlets, latest}|{kind:'article', article}>}
 *   Feed order preserved by each entry's newest article.
 */
export function groupArticlesByEvent(articles, eventByArticleId) {
  const groups = new Map() // eventId -> { eventId, title, articles: [] }
  const entries = [] // ordered: group stubs and flat articles interleaved
  const groupEntryByEventId = new Map()
  for (const a of articles ?? []) {
    const ev = eventByArticleId?.get(a.id)
    if (!ev) {
      entries.push({ kind: 'article', article: a })
      continue
    }
    if (!groups.has(ev.eventId)) {
      const g = { kind: 'group', eventId: ev.eventId, title: ev.title ?? null, articles: [] }
      groups.set(ev.eventId, g)
      groupEntryByEventId.set(ev.eventId, g)
      entries.push(g)
    }
    groups.get(ev.eventId).articles.push(a)
  }
  const out = []
  for (const entry of entries) {
    if (entry.kind === 'article') {
      out.push(entry)
      continue
    }
    // Single-article "group" is not a group — render the article flat.
    if (entry.articles.length === 1) {
      out.push({ kind: 'article', article: entry.articles[0] })
      continue
    }
    const outlets = [...new Set(entry.articles.map((a) => a.outlet).filter(Boolean))]
    const latest = entry.articles
      .map((a) => a.published_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
    out.push({ ...entry, outlets, latest })
  }
  return out
}

/**
 * "New since your last visit on this device" — pure count over ISO
 * timestamps (the count itself comes from an exact-count query; this helper
 * is the unit-pinned comparison rule).
 */
export function isNewSince(fetchedAt, lastVisitMs) {
  if (!fetchedAt || !Number.isFinite(lastVisitMs)) return false
  const t = new Date(fetchedAt).getTime()
  return Number.isFinite(t) && t > lastVisitMs
}

// localStorage key for the browser-local last-visit timestamp (owner ruling
// #1: browser-local, labeled "on this device"). Read once per mount, THEN
// overwritten — the previous value drives the count.
export const LAST_VISIT_STORAGE_KEY = 'mip-news-last-visit-ms'

/**
 * Read-then-advance the last-visit marker. Returns the PREVIOUS marker
 * (null on first visit) and stores `now`. Storage failures (private mode)
 * degrade to null — the line then renders without a count, honestly.
 */
export function readThenAdvanceLastVisit(storage, now) {
  try {
    const prev = Number(storage.getItem(LAST_VISIT_STORAGE_KEY))
    storage.setItem(LAST_VISIT_STORAGE_KEY, String(now))
    return Number.isFinite(prev) && prev > 0 ? prev : null
  } catch {
    return null
  }
}

// Shared native Home/Story display seam; never derive story identity from page groups.
export { evaluateNewsStoryState, reconstructNewsStateHistory, newsSourceReports } from './newsStoryState.js'
