// Source Comparison (03_BACKLOG Item 1) read path — beta only.
//
// Gate: pipeline_config.source_comparison_beta must be exactly true. When the
// flag is false (or unreadable) every fetch is skipped and the disabled view
// is returned — same withhold posture as phase3ReadPath / 02B provenance_ui.
// source_comparison_public is NOT consulted: public exposure is a separate
// owner-authorized gate and this UI never enables it.
//
// Hard rules honored at the read seam:
//   - no composite score is computed or served — dimensions stay separate;
//   - omission (extracted coverage, no matching claim) is structurally
//     distinct from coverage_unknown (extraction has not run / nothing to
//     compare against) — never collapsed;
//   - thin_extraction claims (title/summary-grain) carry a visible marker;
//   - syndicated copies collapse to one original source (canonical URL);
//   - no outlet-count gating — thin columns are honest signal;
//   - every surface claim carries its Phase 2 explanation object for the
//     details disclosure.

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|ref$|spm$)/
const V2_EVENT_PROJECTION_RULE_VERSION = 'sc-v2-event-projection'

export function canonicalUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    return host + path + (params ? '?' + params : '')
  } catch {
    return String(url).toLowerCase().trim()
  }
}

/** Map(articleId -> syndicateId) over event member articles (canonical URL). */
export function collapseBySyndication(articles) {
  const byUrl = new Map()
  for (const a of articles) {
    const key = canonicalUrl(a.url)
    if (!key) continue
    if (!byUrl.has(key)) byUrl.set(key, [])
    byUrl.get(key).push(a.id)
  }
  const out = new Map()
  let n = 0
  for (const ids of byUrl.values()) {
    if (ids.length < 2) continue
    const sid = 'syn-' + ++n
    for (const id of ids) out.set(id, sid)
  }
  return out
}

/** Distinct outlets after syndicate collapse. One syndicate = one source. */
export function independentOutlets(articleIds, articlesById, syndicates) {
  const seen = new Set()
  const outlets = []
  for (const id of articleIds) {
    const syn = syndicates.get(id)
    if (syn) {
      if (seen.has(syn)) continue
      seen.add(syn)
    }
    const outlet = articlesById.get(id)?.outlet
    if (outlet && !outlets.includes(outlet)) outlets.push(outlet)
  }
  return outlets
}

/**
 * Outlet reliability tiers per G2 Axis 1 worked examples (editorial judgment,
 * locked 2026-07-28). Outlets not tiered in the G2 record return null ->
 * rendered as "not yet tiered", never guessed.
 */
export const OUTLET_RELIABILITY = {
  'BBC': 'R1',
  'New York Times': 'R1',
  'The Guardian': 'R1',
  'NPR': 'R1',
  'Al Jazeera': 'R2',
  'South China Morning Post': 'R2',
  'Fox News': 'R3',
  'Democracy Now!': 'R3',
  'Times of India': 'R4',
}

export const R_LEVEL_NAMES = {
  R1: 'R1 established-primary',
  R2: 'R2 established-secondary',
  R3: 'R3 partisan-weighted',
  R4: 'R4 unvetted-origin',
}

// Package 1 item 4 (22_NOTE): "corroborated" implies independently verified
// sourcing. Source lineage is not tracked (write path never persists the
// syndication union-find; this read path collapses canonical-URL duplicates
// only), so a wire story surfaced under several URLs would overclaim as
// corroboration. The chip therefore says what the data actually shows.
export const E_LEVEL_NAMES = {
  E1: 'E1 documented',
  E2: 'E2 multi-outlet (lineage unverified)',
  E4: 'E4 asserted',
}

/**
 * Claim-level evidence strength (G2 Axis 2 mapping):
 *   primary-evidence link -> E1 documented
 *   >=2 outlets after syndicate collapse -> E2 multi-outlet (lineage unverified)
 *   single source -> E4 asserted
 * (E3 circumstantial is not produced by this read path.)
 */
export function evidenceStrength({ independentOutletCount, hasPrimaryEvidence }) {
  if (hasPrimaryEvidence) return 'E1'
  if (independentOutletCount >= 2) return 'E2'
  return 'E4'
}

/** Pure seam: per-claim presentation object. */
export function buildClaimView(claim, surfaces, ctx) {
  const { articlesById, syndicates, eventOutlets, evidenceLinks, corrections, explanationsByArticle } = ctx
  const surfaceViews = surfaces.map((s) => {
    const article = articlesById.get(s.article_id) ?? {}
    return {
      id: s.id,
      articleId: s.article_id,
      outlet: article.outlet ?? 'unknown',
      surfaceText: s.surface_text,
      publishedAt: article.published_at ?? null,
      url: article.url ?? null,
      loadedLanguage: Array.isArray(s.loaded_language) ? s.loaded_language : [],
      explanation: explanationsByArticle.get(s.article_id) ?? null,
      reviewedAt: explanationsByArticle.get(s.article_id)?.reviewed_at ?? null,
      reviewStatus: explanationsByArticle.get(s.article_id)?.review_status ?? null,
    }
  })
  const independent = independentOutlets(surfaces.map((s) => s.article_id), articlesById, syndicates)
  const syndicatedExtra = surfaces.length - independent.length
  const claimingOutlets = new Set(surfaceViews.map((s) => s.outlet))
  const omittedBy = []
  const coverageUnknown = []
  for (const outlet of eventOutlets) {
    if (claimingOutlets.has(outlet)) continue
    // Omission requires extracted coverage: the outlet's event articles must
    // have produced claim rows (or carry a non-empty claims payload). Empty
    // extraction means we cannot say "didn't cover" — only "nothing extracted".
    const outletArticles = ctx.eventArticlesByOutlet.get(outlet) ?? []
    const anyExtracted = outletArticles.some((a) => ctx.extractedArticleIds.has(a.id))
    if (anyExtracted) omittedBy.push(outlet)
    else coverageUnknown.push(outlet)
  }
  const links = evidenceLinks.filter((l) => l.claim_id === claim.id)
  const claimCorrections = corrections.filter((c) => c.claim_id === claim.id)
  return {
    id: claim.id,
    canonicalText: claim.canonical_text,
    classification: independent.length >= 2 ? 'shared' : 'unique',
    thinExtraction: claim.thin_extraction === true,
    independentOutlets: independent,
    syndicatedExtra,
    omittedBy,
    coverageUnknown,
    evidenceStrength: evidenceStrength({
      independentOutletCount: independent.length,
      hasPrimaryEvidence: links.length > 0,
    }),
    evidenceLinks: links,
    corrections: claimCorrections,
    surfaces: surfaceViews.sort((a, b) => String(a.publishedAt ?? '').localeCompare(String(b.publishedAt ?? ''))),
  }
}

/** Pure seam: per-event presentation object. No outlet-count gating. */
export function buildEventView(event, memberRows, ctx) {
  const articles = memberRows.map((m) => ctx.articlesById.get(m.article_id)).filter(Boolean)
  const outlets = [...new Set(articles.map((a) => a.outlet))]
  const timing = outlets
    .map((outlet) => {
      const times = articles.filter((a) => a.outlet === outlet).map((a) => a.published_at).filter(Boolean).sort()
      return { outlet, firstPublishedAt: times[0] ?? null }
    })
    .sort((a, b) => String(a.firstPublishedAt ?? '\uFFFF').localeCompare(String(b.firstPublishedAt ?? '\uFFFF')))
  const first = timing.find((t) => t.firstPublishedAt) ?? null
  const timingView = timing.map((t) => ({
    ...t,
    lagHours:
      first && t.firstPublishedAt
        ? Math.round(((new Date(t.firstPublishedAt) - new Date(first.firstPublishedAt)) / 3600000) * 10) / 10
        : null,
  }))
  const outletCoverage = outlets.map((outlet) => {
    const rows = ctx.claimViews.flatMap((claim) =>
      claim.surfaces
        .filter((surface) => surface.outlet === outlet)
        .map((surface) => ({
          claimId: claim.id,
          claimText: claim.canonicalText,
          surfaceText: surface.surfaceText,
          explanationState: surface.explanation?.state ?? 'explanation_pending',
          reviewedAt: surface.reviewedAt ?? null,
          reviewStatus: surface.reviewStatus ?? null,
        })),
    )
    const latestReviewedAt = rows
      .map((row) => row.reviewedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
    const reviewStatuses = [...new Set(rows.map((row) => row.reviewStatus).filter(Boolean))]
    return {
      outlet,
      articleCount: articles.filter((article) => article.outlet === outlet).length,
      includedClaimCount: new Set(rows.map((row) => row.claimId)).size,
      framing: rows,
      explanationStates: [...new Set(rows.map((row) => row.explanationState))],
      latestReviewedAt,
      reviewStatuses,
    }
  })
  const evidenceLinkCount = ctx.claimViews.reduce((total, claim) => total + claim.evidenceLinks.length, 0)
  const reviewedAt = outletCoverage.map((coverage) => coverage.latestReviewedAt).filter(Boolean).sort().at(-1) ?? null
  const reviewStatuses = [...new Set(outletCoverage.flatMap((coverage) => coverage.reviewStatuses ?? []))]
  return {
    id: event.id,
    title: event.canonical_title,
    occurredAtStart: event.occurred_at_start,
    occurredAtEnd: event.occurred_at_end,
    status: event.status,
    outlets, // all of them, thin included — no gating
    singleSource: outlets.length <= 1,
    firstOutlet: first?.outlet ?? null,
    timing: timingView,
    claims: ctx.claimViews,
    outletCoverage,
    evidenceTotals: { claims: ctx.claimViews.length, primaryLinks: evidenceLinkCount, outlets: outlets.length },
    reviewedAt,
    reviewStatuses,
  }
}

// Doc 13 fix (owner-authorized 2026-08-11, site 1): complete reads past the
// PostgREST 1000-row ceiling. PostgREST silently truncates any select without
// an explicit range at 1000 rows — the sc-v1 explanations set was 1,311 rows
// at audit time, so this read path was ACTIVELY dropping explanation objects
// before this fix. Two patterns, following the in-repo EntityResolver.load /
// source-comparison-run pagedSelect precedent:
//   - keysetAll: keyset pagination on the unique id column — immune to
//     concurrent inserts shifting page boundaries mid-read;
//   - selectInChunks: bounded lookups by the already-filtered eligible event
//     IDs. This keeps Timeline-only material from forcing Source Comparison to
//     scan every chronological event membership before it can render.
async function keysetAll(supabase, table, cols, { filter = (q) => q, pageSize = 1000 } = {}) {
  const out = []
  let last = null
  for (;;) {
    let q = filter(supabase.from(table).select(cols)).order('id', { ascending: true })
    if (last !== null) q = q.gt('id', last)
    const { data, error } = await q.limit(pageSize)
    if (error) return { data: null, error }
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: out, error: null }
    last = data[data.length - 1].id
  }
}

async function pagedAll(supabase, table, cols, orderCols, { pageSize = 1000 } = {}) {
  const out = []
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select(cols)
    for (const c of orderCols) q = q.order(c, { ascending: true })
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: out, error: null }
  }
}

// IN-lists are chunked at 100 ids: each chunk's result is provably bounded
// (<= chunk size rows for a unique-column lookup) and a single .in() with
// hundreds of UUIDs exceeds the PostgREST URL ceiling (hit live 2026-08-09 in
// source-comparison-run, commit 68c5ddfc; same constraint on this read path).
async function selectInChunks(supabase, table, cols, col, ids, chunkSize = 100) {
  const out = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await supabase.from(table).select(cols).in(col, ids.slice(i, i + chunkSize))
    if (error) return { data: null, error }
    out.push(...(data ?? []))
  }
  return { data: out, error: null }
}

// The comparison route is now publicly gated by the narrow
// `comparison_public` projection, not by a readable operational configuration
// row. The projection is present only when the feature is deployed, so the
// former pipeline_config feature-flag read is intentionally removed.
export async function loadSourceComparisonBetaFlag() {
  return true
}

async function projectionAll(supabase, pageSize = 100) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('comparison_public')
      .select('event_key, canonical_title, occurred_at_start, occurred_at_end, articles, claims')
      .order('event_key', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}

function projectionEventView(row) {
  const articles = (Array.isArray(row.articles) ? row.articles : []).map((article) => ({
    id: article.article_key,
    outlet: article.outlet,
    url: article.article_url,
    published_at: article.published_at,
    arc_slug: article.arc_slug ?? null,
    arc_title: article.arc_title ?? null,
    timeline_key: article.timeline_key ?? null,
    has_extracted_claim: article.has_extracted_claim === true,
  }))
  const articlesById = new Map(articles.map((article) => [article.id, article]))
  const memberRows = articles.map((article) => ({ article_id: article.id }))
  const syndicates = collapseBySyndication(articles)
  const eventArticlesByOutlet = new Map()
  for (const article of articles) {
    if (!eventArticlesByOutlet.has(article.outlet)) eventArticlesByOutlet.set(article.outlet, [])
    eventArticlesByOutlet.get(article.outlet).push(article)
  }
  const outlets = [...new Set(articles.map((article) => article.outlet).filter(Boolean))]
  const extractedArticleIds = new Set(articles.filter((article) => article.has_extracted_claim).map((article) => article.id))
  const claimViews = (Array.isArray(row.claims) ? row.claims : [])
    .map((claim) => {
      const surfaces = (Array.isArray(claim.surfaces) ? claim.surfaces : []).map((surface, index) => ({
        id: `${claim.claim_key}:${surface.article_key}:${index}`,
        article_id: surface.article_key,
        surface_text: surface.surface_text,
        loaded_language: Array.isArray(surface.loaded_language) ? surface.loaded_language : [],
        explanation: surface.explanation ?? null,
      }))
      const evidenceLinks = (Array.isArray(claim.evidence_links) ? claim.evidence_links : []).map((link, index) => ({
        id: `${claim.claim_key}:evidence:${index}`,
        claim_id: claim.claim_key,
        evidence_url: link.evidence_url,
        evidence_type: link.evidence_type,
      }))
      const corrections = (Array.isArray(claim.corrections) ? claim.corrections : []).map((correction, index) => ({
        id: `${claim.claim_key}:correction:${index}`,
        claim_id: claim.claim_key,
        correction_text: correction.correction_text,
        occurred_at: correction.occurred_at,
      }))
      const explanationsByArticle = new Map(
        surfaces.filter((surface) => surface.explanation).map((surface) => [surface.article_id, surface.explanation]),
      )
      return buildClaimView({
        id: claim.claim_key,
        canonical_text: claim.canonical_text,
        thin_extraction: claim.thin_extraction === true,
      }, surfaces, {
        articlesById,
        syndicates,
        eventOutlets: outlets,
        eventArticlesByOutlet,
        extractedArticleIds,
        evidenceLinks,
        corrections,
        explanationsByArticle,
      })
    })
    .sort((a, b) => (a.classification === b.classification ? a.canonicalText.localeCompare(b.canonicalText) : a.classification === 'shared' ? -1 : 1))
  const arcLinks = []
  const seenArcs = new Set()
  for (const article of articles) {
    if (!article.arc_slug || seenArcs.has(article.arc_slug)) continue
    seenArcs.add(article.arc_slug)
    arcLinks.push({ arcId: article.arc_slug, title: article.arc_title, timelineKey: article.timeline_key })
  }
  return {
    ...buildEventView({
      id: row.event_key,
      canonical_title: row.canonical_title,
      occurred_at_start: row.occurred_at_start,
      occurred_at_end: row.occurred_at_end,
      status: 'active',
    }, memberRows, { articlesById, claimViews }),
    arcLinks,
  }
}

/**
 * Public comparison loader. It reads only `comparison_public`, a deliberately
 * narrow view with opaque keys and card-rendered fields. Base claims and the
 * operational pipeline_config table are never requested by the browser.
 */
export async function loadSourceComparisonView({ supabaseClient } = {}) {
  const supabase = supabaseClient ?? (await import('./supabase.js')).supabase
  if (!supabase) return { enabled: false, events: [] }
  const projectionRes = await projectionAll(supabase)
  if (projectionRes.error) return { enabled: true, events: [], loadError: projectionRes.error.message }
  const events = (projectionRes.data ?? [])
    .map(projectionEventView)
    .filter((event) => event.outlets.length >= 2)
    .sort((a, b) => String(b.occurredAtStart ?? '').localeCompare(String(a.occurredAtStart ?? '')))
  return { enabled: true, events }
}
