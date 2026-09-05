// Source Comparison (03_BACKLOG Item 1) — deterministic pipeline, pure logic.
// RULE_VERSION sc-v1. Owner-locked decisions 2026-08-06:
//   deterministic-only grouping (no LLM); floors 0.6 (grouping) / 0.55 (membership);
//   hash/URL syndication detection; no outlet gating; thin-extraction labeling.
// Shared constraints (G2 / Phase 2): no composite score anywhere in outputs;
// missing evidence is never contradicting evidence; every decision emits an
// explanation row with method + rule_version.
// This module is runtime-agnostic (Node tests + Deno edge function): no Deno.*,
// no process.*, only node:crypto.

import { createHash } from 'node:crypto'

export const RULE_VERSION = 'sc-v1'

const STOPWORDS = new Set(('a,an,the,and,or,but,of,to,in,on,for,with,at,by,from,as,is,was,were,are,be,been,has,have,had,it,its,that,this,these,those,he,she,they,his,her,their,after,said,says,say,new,over,under,amid,will,would,could,than,into,about,between,against,during,before,while,not,no,us,we,who,whom,which,what,when,where,why,how,all,any,both,each,more,most,other,some,such,only,own,same,so,too,very,can,just,also,up,out,off,again,further,then,once').split(','))

export function tokenize(text) {
  const tokens = String(text || '').toLowerCase().replace(/[“”"''`]/g, "'").split(/[^a-z0-9']+/).filter(Boolean)
  return new Set(tokens.filter((t) => t.length > 1 && !STOPWORDS.has(t)))
}

export function jaccard(a, b) {
  if (!a.size && !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter || 1)
}

export function containment(a, b) {
  // fraction of the smaller token set contained in the larger
  if (!a.size || !b.size) return 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  let hit = 0
  for (const t of small) if (large.has(t)) hit++
  return hit / small.size
}

// tokenize is pure/deterministic, so token sets may be precomputed once and
// reused; similarity over precomputed sets is identical to claimSimilarity.
function similarityFromSets(a, b) {
  return Math.max(jaccard(a, b), containment(a, b))
}

export function claimSimilarity(textA, textB) {
  const a = tokenize(textA)
  const b = tokenize(textB)
  return similarityFromSets(a, b)
}

export function parseEmbedding(raw) {
  if (Array.isArray(raw)) return raw.map(Number)
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1).split(',').map(Number)
  }
  return null
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Date-parse cache: new Date(s).getTime() is deterministic per string, so
// caching by input string returns the identical value (incl. NaN) with no
// behavior change; avoids ~n² re-parses in clusterArticles.
const dateTimeCache = new Map()
function parseTimeCached(s) {
  let t = dateTimeCache.get(s)
  if (t === undefined) {
    t = new Date(s).getTime()
    dateTimeCache.set(s, t)
  }
  return t
}

export function daysBetween(d1, d2) {
  if (!d1 || !d2) return null
  return Math.abs(parseTimeCached(d1) - parseTimeCached(d2)) / 86400000
}

// ---- union-find ----------------------------------------------------------------
function makeUF(n) {
  const p = [...Array(n).keys()]
  const find = (x) => (p[x] === x ? x : (p[x] = find(p[x])))
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) p[rb] = ra }
  return { find, union }
}

// ---- event clustering ------------------------------------------------------------
// articles: [{id, outlet, published_at, embedding(array|null), ...}]
// entityIndex: Map(articleId -> Set(entityId))
// cfg: {similarityThreshold, windowDays, minSharedEntities, membershipFloor}
export function clusterArticles(articles, entityIndex, cfg) {
  const n = articles.length
  const uf = makeUF(n)
  const bestConf = new Array(n).fill(0)
  const method = new Array(n).fill(null)
  const dayMs = cfg.windowDays

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = articles[i], B = articles[j]
      const dd = daysBetween(A.published_at, B.published_at)
      if (dd !== null && dd > dayMs) continue

      let conf = 0, m = null
      const embA = A.embedding, embB = B.embedding
      if (embA && embB) {
        const c = cosine(embA, embB)
        if (c >= cfg.similarityThreshold) { conf = c; m = 'embedding_cluster' }
      }
      const ea = entityIndex.get(A.id), eb = entityIndex.get(B.id)
      if (!m && ea && eb) {
        let shared = 0
        for (const e of ea) if (eb.has(e)) shared++
        if (shared >= cfg.minSharedEntities) {
          conf = Math.min(1, shared / 3)
          m = 'entity_overlap'
        }
      }
      if (m) {
        uf.union(i, j)
        for (const [k, c] of [[i, conf], [j, conf]]) {
          if (c > bestConf[k]) { bestConf[k] = c; method[k] = m }
        }
      }
    }
  }

  const groups = new Map()
  for (let i = 0; i < n; i++) {
    const r = uf.find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(i)
  }
  return [...groups.values()].map((idxs) => ({
    members: idxs.map((i) => ({
      article: articles[i],
      // singleton (never paired) gets 0 confidence — excluded by the membership floor,
      // surfaced as low-confidence instead (B5: low-confidence gating)
      confidence: idxs.length === 1 ? 0 : (bestConf[i] || cfg.membershipFloor),
      method: idxs.length === 1 ? null : (method[i] || 'embedding_cluster'),
    })),
    multiOutlet: new Set(idxs.map((i) => articles[i].outlet)).size > 1,
  }))
}

// ---- syndication (Q5: content hash + canonical URL) ------------------------------
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|ref$|spm$)/

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

export function bodyHash(text) {
  if (!text) return null
  const norm = String(text).toLowerCase().replace(/\s+/g, ' ').trim()
  if (norm.length < 200) return null // too short to prove syndication
  return createHash('sha256').update(norm).digest('hex')
}

// Returns Map(articleId -> syndicateId). A syndicate = same canonical URL or same
// body hash across >=2 articles. One syndicate counts as ONE source (G2 Axis 2e).
export function detectSyndicates(articles) {
  const byKey = new Map()
  for (const a of articles) {
    for (const key of [canonicalUrl(a.url) && 'u:' + canonicalUrl(a.url), bodyHash(a.body_text) && 'h:' + bodyHash(a.body_text)]) {
      if (!key) continue
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(a.id)
    }
  }
  const out = new Map()
  let n = 0
  // merge keys that share an article (union-find over keys)
  const keys = [...byKey.keys()].filter((k) => byKey.get(k).length >= 2)
  const uf = makeUF(keys.length)
  const seen = new Map()
  keys.forEach((k, i) => {
    for (const id of byKey.get(k)) {
      if (seen.has(id)) uf.union(i, seen.get(id))
      else seen.set(id, i)
    }
  })
  const groups = new Map()
  keys.forEach((k, i) => {
    const r = uf.find(i)
    if (!groups.has(r)) groups.set(r, new Set())
    for (const id of byKey.get(k)) groups.get(r).add(id)
  })
  for (const ids of groups.values()) {
    const sid = 'syn-' + (++n)
    for (const id of ids) out.set(id, sid)
  }
  return out
}

// Independent-source count: distinct outlets after collapsing syndicates.
export function independentOutlets(articleIds, articlesById, syndicates) {
  const seen = new Set()
  const outlets = new Set()
  for (const id of articleIds) {
    const syn = syndicates.get(id)
    if (syn) {
      if (seen.has(syn)) continue
      seen.add(syn)
    }
    outlets.add(articlesById.get(id).outlet)
  }
  return [...outlets]
}

// ---- loaded language (lexicon, versioned) ----------------------------------------
export function scanLoadedLanguage(text, lexicon) {
  const hits = []
  const body = String(text || '')
  for (const entry of lexicon.entries) {
    const re = new RegExp('\\b' + entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\b', 'gi')
    let m
    while ((m = re.exec(body)) !== null) {
      hits.push({ term: entry.term, span: [m.index, m.index + m[0].length], category: entry.category })
    }
  }
  return hits.sort((a, b) => a.span[0] - b.span[0])
}

// ---- claim grouping (deterministic, floor 0.6) ------------------------------------
// items: [{articleId, text, kind?, extractionMethod?, fallback?}]
function firstSentence(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  const match = text.match(/^(.{24,420}?[.!?])(?:\s|$)/)
  return (match?.[1] ?? text.slice(0, 420)).trim()
}

export function projectionClaimSurfaces(article) {
  const existing = Array.isArray(article?.claims)
    ? article.claims.filter((claim) => claim?.text && String(claim.text).trim()).map((claim) => ({
      text: String(claim.text).trim(), extractionMethod: 'existing_claims_jsonb', fallback: false,
    }))
    : []
  if (existing.length) return existing

  // Imported RSS and legacy records can lack claims JSON. Preserve an
  // attributable literal framing surface instead of fabricating a proposition.
  const title = String(article?.title ?? '').replace(/\s+/g, ' ').trim()
  const summary = firstSentence(article?.summary ?? article?.body_text ?? '')
  const usefulTitle = title.length >= 12 && !/^https?:\/\//i.test(title) && !/^here(?:’|'| is)\s+the\s+latest\.?$/i.test(title)
  const usefulSummary = summary.length >= 24
  if (!usefulTitle && !usefulSummary) return []
  const text = usefulTitle && usefulSummary && !summary.toLowerCase().startsWith(title.toLowerCase())
    ? `${title} — ${summary}`.slice(0, 600)
    : (usefulTitle ? title : summary).slice(0, 600)
  return [{ text, extractionMethod: 'title_summary_fallback_v1', fallback: true }]
}

export function groupClaims(items, floor) {
  const n = items.length
  const uf = makeUF(n)
  const sims = Array.from({ length: n }, () => new Array(n).fill(0))
  // Precompute each claim's token set once (was: re-tokenized per pair).
  const tokenSets = items.map((it) => tokenize(it.text))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = similarityFromSets(tokenSets[i], tokenSets[j])
      sims[i][j] = sims[j][i] = s
      if (s >= floor) uf.union(i, j)
    }
  }
  const groups = new Map()
  for (let i = 0; i < n; i++) {
    const r = uf.find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(i)
  }
  return [...groups.values()].map((idxs) => {
    // canonical = medoid (max mean sim); deterministic tiebreak: longer text, then lexical
    let canonicalIdx = idxs[0], best = -1
    for (const i of idxs) {
      const mean = idxs.reduce((s, j) => s + (i === j ? 1 : sims[i][j]), 0) / idxs.length
      if (mean > best + 1e-9 ||
        (Math.abs(mean - best) <= 1e-9 && (items[i].text.length > items[canonicalIdx].text.length ||
          (items[i].text.length === items[canonicalIdx].text.length && items[i].text < items[canonicalIdx].text)))) {
        best = mean
        canonicalIdx = i
      }
    }
    return {
      canonicalText: items[canonicalIdx].text,
      members: idxs.map((i) => ({
        articleId: items[i].articleId,
        surfaceText: items[i].text,
        extractionMethod: items[i].extractionMethod ?? 'existing_claims_jsonb',
        fallback: !!items[i].fallback,
        confidence: i === canonicalIdx ? 1 : sims[i][canonicalIdx],
      })),
    }
  })
}

// ---- comparison sets (acceptance criteria B4) --------------------------------------
// event: {members:[{article, confidence, method}], extracted: Map(articleId->bool)}
// groupedClaims: output of groupClaims for this event
// Floors applied HERE: membership below floor is excluded from sets and reported.
export function computeComparison(event, groupedClaims, articlesById, syndicates, floors) {
  const included = event.members.filter((m) => m.confidence >= floors.membershipFloor)
  const excludedLowConf = event.members.filter((m) => m.confidence < floors.membershipFloor)
    .map((m) => ({ articleId: m.article.id, confidence: m.confidence, u_level: 'U1' }))
  const includedIds = new Set(included.map((m) => m.article.id))
  const outlets = [...new Set(included.map((m) => m.article.outlet))]

  const claims = groupedClaims.map((g) => {
    const inMembers = g.members.filter((m) => includedIds.has(m.articleId))
    const outletsIndependent = independentOutlets(inMembers.map((m) => m.articleId), articlesById, syndicates)
    const syndicatedOnly = inMembers.length > 1 && outletsIndependent.length === 1
    const kind = outletsIndependent.length >= 2 ? 'shared' : 'unique'
    const omissions = []
    let unknown = []
    if (kind === 'shared' || inMembers.length > 0) {
      const claimingOutlets = new Set(inMembers.map((m) => articlesById.get(m.articleId).outlet))
      for (const outlet of outlets) {
        if (claimingOutlets.has(outlet)) continue
        const outletArticles = included.filter((m) => m.article.outlet === outlet)
        const allExtracted = outletArticles.every((m) => event.extracted.get(m.article.id))
        if (allExtracted) omissions.push(outlet)
        else unknown.push(outlet)
      }
    }
    return {
      canonicalText: g.canonicalText,
      classification: kind,                       // shared|unique — never a score
      independent_outlets: outletsIndependent,
      syndicated_single_source: syndicatedOnly,   // B5: wire collapse case
      omitted_by: omissions,                      // extracted coverage, NOT real-world coverage
      coverage_unknown: unknown,                  // distinct from omission (B4.3)
      members: inMembers,
    }
  })

  return {
    single_source: outlets.length <= 1,           // B5: comparison unavailable banner
    outlets,
    claims,
    low_confidence_excluded: excludedLowConf,
  }
}

// ---- explanation rows (Phase 2 object; every decision gets one) --------------------
function explanationRow(assertionId, assertionType, passage, method, sourceIds) {
  return {
    assertion_id: assertionId,
    assertion_type: assertionType,
    version: 1,
    is_current: true,
    source_ids: sourceIds || [],
    archived_sources: [],
    source_roles: {},
    supporting_passage: passage,
    contradicting_evidence: [],
    missing_evidence: [],
    shared_entities: [],
    relationship_type: null,
    rule_version: RULE_VERSION + '|' + method,
    provenance_class: 'machine',
    review_status: 'awaiting_review',
    state: 'ok',
    correction_history: [],
    remaining_uncertainty: null,
  }
}

export function buildExplanationRows(decisions) {
  const rows = []
  for (const d of decisions) {
    if (d.type === 'event_membership') {
      rows.push(explanationRow(
        `sc:event_membership:${d.eventKey}:${d.articleId}`,
        'event_membership',
        `Article ${d.articleId} assigned to event "${d.eventTitle}" by ${d.method} (confidence ${d.confidence}).`,
        d.method, d.sourceIds))
    } else if (d.type === 'claim_grouping') {
      rows.push(explanationRow(
        `sc:claim_grouping:${d.claimKey}:${d.articleId}`,
        'claim_grouping',
        `Surface claim "${d.surfaceText}" grouped under canonical "${d.canonicalText}" (similarity ${d.confidence}).`,
        'deterministic_text_similarity', d.sourceIds))
    }
  }
  return rows
}

// ---- full pipeline (pure; index.ts handles IO) --------------------------------------
// articles rows must include: id, outlet, title, url, summary, body_text,
// published_at, claims(jsonb array), embedding(parsed array|null),
// unattributed, monoculture, is_digest
export function runPipeline(articles, entityPairs, cfg, lexicon) {
  const articlesById = new Map(articles.map((a) => [a.id, a]))
  const entityIndex = new Map()
  for (const { article_id, entity_id } of entityPairs) {
    if (!entityIndex.has(article_id)) entityIndex.set(article_id, new Set())
    entityIndex.get(article_id).add(entity_id)
  }
  const syndicates = detectSyndicates(articles)
  const clusters = clusterArticles(articles, entityIndex, cfg)

  const plan = { events: [], claims: [], article_claims: [], event_articles: [], explanations: [], stats: {} }
  const decisions = []
  let eventN = 0, claimN = 0, comparisons = []

  for (const cluster of clusters) {
    eventN++
    const eventKey = 'evt-' + String(eventN).padStart(4, '0')
    const memberArticles = cluster.members.map((m) => m.article)
    const titleArticle = memberArticles.reduce((a, b) => (a.title.length <= b.title.length ? a : b))
    const dates = memberArticles.map((a) => a.published_at).filter(Boolean).sort()

    plan.events.push({
      event_key: eventKey,
      canonical_title: titleArticle.title,
      occurred_at_start: dates[0] ? dates[0].slice(0, 10) : null,
      occurred_at_end: dates.length > 1 ? dates[dates.length - 1].slice(0, 10) : null,
      status: 'candidate',
      rule_version: RULE_VERSION,
    })

    const extracted = new Map(memberArticles.map((a) => [a.id, Array.isArray(a.claims)]))
    for (const m of cluster.members) {
      if (m.confidence >= cfg.membershipFloor) {
        plan.event_articles.push({
          event_key: eventKey, article_id: m.article.id,
          membership_method: m.method, membership_confidence: m.confidence,
        })
        decisions.push({ type: 'event_membership', eventKey, articleId: m.article.id, eventTitle: titleArticle.title, method: m.method, confidence: m.confidence, sourceIds: [] })
      }
    }

    // claim items from included members only
    const included = cluster.members.filter((m) => m.confidence >= cfg.membershipFloor)
    const items = []
    for (const m of included) {
      const claims = Array.isArray(m.article.claims) ? m.article.claims : []
      for (const c of claims) {
        if (c && c.text) items.push({ articleId: m.article.id, text: String(c.text), kind: c.kind })
      }
    }
    const grouped = groupClaims(items, cfg.groupFloor)
    for (const g of grouped) {
      claimN++
      const claimKey = eventKey + '-c' + claimN
      const thin = g.members.some((mm) => !articlesById.get(mm.articleId).body_text)
      plan.claims.push({
        claim_key: claimKey, event_key: eventKey, canonical_text: g.canonicalText,
        claim_kind: 'fact', thin_extraction: thin, status: 'active', rule_version: RULE_VERSION,
      })
      for (const mm of g.members) {
        plan.article_claims.push({
          claim_key: claimKey, article_id: mm.articleId, surface_text: mm.surfaceText,
          extraction_method: 'existing_claims_jsonb', extraction_confidence: mm.confidence,
          stance: 'asserts', loaded_language: scanLoadedLanguage(mm.surfaceText, lexicon),
        })
        decisions.push({ type: 'claim_grouping', claimKey, articleId: mm.articleId, surfaceText: mm.surfaceText, canonicalText: g.canonicalText, confidence: mm.confidence, sourceIds: [] })
      }
    }

    comparisons.push(computeComparison(
      { members: cluster.members, extracted }, grouped, articlesById, syndicates,
      { membershipFloor: cfg.membershipFloor }))
  }

  plan.explanations = buildExplanationRows(decisions)
  plan.stats = {
    events: plan.events.length,
    multi_outlet_events: clusters.filter((c) => c.multiOutlet).length,
    claims: plan.claims.length,
    article_claims: plan.article_claims.length,
    explanations: plan.explanations.length,
    syndicated_articles: syndicates.size,
    comparisons,
  }
  return plan
}

// V2 event projection: Version Two already carries imported, source-backed
// events and event_articles. Re-clustering its 12k+ article corpus with the V1
// O(n²) event builder would create a duplicate event namespace and exceed the
// worker budget. This planner therefore treats the existing event membership as
// the cluster boundary and deterministically rebuilds only the comparison
// derived tables for multi-outlet events. It never edits articles, events, or
// event_articles.
export const EVENT_PROJECTION_RULE_VERSION = 'sc-v2-event-projection'

function eventProjectionExplanation(eventId, claimOrdinal, articleId, surfaceText, canonicalText, confidence) {
  return {
    assertion_id: `sc:claim_grouping:${eventId}:${claimOrdinal}:${articleId}`,
    assertion_type: 'claim_grouping',
    version: 1,
    is_current: true,
    source_ids: [],
    archived_sources: [],
    source_roles: {},
    supporting_passage: `Surface claim "${surfaceText}" grouped under canonical "${canonicalText}" (similarity ${confidence}).`,
    contradicting_evidence: [],
    missing_evidence: [],
    shared_entities: [],
    relationship_type: null,
    rule_version: EVENT_PROJECTION_RULE_VERSION + '|deterministic_text_similarity',
    provenance_class: 'machine',
    review_status: 'awaiting_review',
    state: 'ok',
    correction_history: [],
    remaining_uncertainty: 'Machine grouping is not a human review; primary evidence links are omitted unless an explicit primary-record URL exists.',
  }
}

// Membership is an upstream correctness boundary. Similarity, shared entities,
// or imported event status can produce a candidate, but none can establish that
// all member articles concern the same world event. Projection is therefore
// default-deny: a reviewer must explicitly admit an event before any downstream
// comparison metric can be derived.
export function isComparisonApprovedEvent(event) {
  return event?.comparison_validation_state === 'approved'
}

export function runEventProjection(eventInputs, cfg, lexicon) {
  const plan = { claims: [], article_claims: [], explanations: [], stats: {} }
  let claimCount = 0
  let eventCount = 0
  let withheldEventCount = 0
  for (const { event, members } of eventInputs) {
    if (!isComparisonApprovedEvent(event)) {
      withheldEventCount++
      continue
    }
    const articles = members.map((m) => m.article).filter(Boolean)
    const outlets = new Set(articles.map((a) => a.outlet).filter(Boolean))
    if (outlets.size < 2) continue
    eventCount++
    const items = []
    for (const article of articles) {
      for (const surface of projectionClaimSurfaces(article)) {
        items.push({ articleId: article.id, text: surface.text, extractionMethod: surface.extractionMethod, fallback: surface.fallback })
      }
    }
    const groups = groupClaims(items, cfg.groupFloor)
    let ordinal = 0
    for (const group of groups) {
      ordinal++
      claimCount++
      const claimKey = `${event.id}:c${ordinal}`
      const byArticle = new Map(articles.map((article) => [article.id, article]))
      plan.claims.push({
        claim_key: claimKey,
        event_id: event.id,
        canonical_text: group.canonicalText,
        claim_kind: 'fact',
        thin_extraction: group.members.some((member) => member.fallback || !byArticle.get(member.articleId)?.body_text),
        status: 'active',
        rule_version: EVENT_PROJECTION_RULE_VERSION,
      })
      for (const member of group.members) {
        const surfaceText = member.surfaceText
        plan.article_claims.push({
          claim_key: claimKey,
          article_id: member.articleId,
          surface_text: surfaceText,
          extraction_method: member.extractionMethod,
          extraction_confidence: member.confidence,
          stance: 'asserts',
          loaded_language: scanLoadedLanguage(surfaceText, lexicon),
        })
        plan.explanations.push(eventProjectionExplanation(
          event.id, ordinal, member.articleId, surfaceText, group.canonicalText, member.confidence,
        ))
      }
    }
  }
  plan.stats = {
    mode: 'event_projection',
    events_processed: eventCount,
    events_withheld_pending_membership_validation: withheldEventCount,
    claims: plan.claims.length,
    article_claims: plan.article_claims.length,
    explanations: plan.explanations.length,
  }
  return plan
}

// Doc 13 site 9: shared paged read with an optional caller filter. Plain ESM
// JavaScript so the same file runs in the Deno edge runtime and node:test.
export async function pagedSelect(supabase, table, cols, orderCols, pageSize, filter = (q) => q) {
  const out = []
  for (let from = 0; ; from += pageSize) {
    let q = filter(supabase.from(table).select(cols))
    for (const c of orderCols) q = q.order(c)
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    out.push(...(data || []))
    if (!data || data.length < pageSize) return { data: out, error: null }
  }
}


// ---- V2 semantic membership scoring ---------------------------------------------
//
// This scorer is intentionally upstream of the reader-facing comparison projection.
// Its confidence is an internal admission-control value, never a public comparison
// metric. A cluster is only eligible for automatic admission after a passing
// regression fixture, an enabled policy, and an empirically justified threshold.
export const MEMBERSHIP_SCORER_RULE_VERSION = 'sc-v2-membership-2026-08-23.5'

const MEMBERSHIP_WEIGHTS = Object.freeze({
  semantic: 0.24,
  actor: 0.26,
  topic: 0.20,
  temporal: 0.15,
  action: 0.15,
})

const GENERIC_NAME_TOKENS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'with', 'from', 'after', 'before',
  'new', 'news', 'world', 'us', 'u', 'uk', 'united', 'states', 'state', 'english',
  'international', 'report', 'reports', 'says', 'say', 'said', 'will', 'may', 'could',
  'how', 'why', 'what', 'when', 'where', 'who', 'in', 'on', 'at', 'of', 'to', 'by',
])

const TOPIC_NOISE_TOKENS = new Set([
  'new', 'latest', 'live', 'update', 'updates', 'report', 'reports', 'says', 'said',
  'say', 'after', 'amid', 'over', 'with', 'from', 'into', 'about', 'will', 'could',
  'may', 'set', 'back', 'first', 'one', 'two', 'three', 'today', 'yesterday',
])

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function articleText(article) {
  return [article?.title, article?.summary, String(article?.body_text || '').slice(0, 900)]
    .filter(Boolean).join(' ')
}

function titleText(article) {
  return String(article?.title || article?.summary || '')
}

function similarityOrMissing(textA, textB) {
  const a = tokenize(textA)
  const b = tokenize(textB)
  if (!a.size || !b.size) return null
  return similarityFromSets(a, b)
}

function normalizedStem(token) {
  const value = String(token || '').toLowerCase()
  if (value.endsWith('ies') && value.length > 4) return value.slice(0, -3) + 'y'
  if (value.endsWith('ing') && value.length > 5) return value.slice(0, -3)
  if (value.endsWith('ed') && value.length > 4) return value.slice(0, -2)
  if (value.endsWith('es') && value.length > 4) return value.slice(0, -2)
  if (value.endsWith('s') && value.length > 4) return value.slice(0, -1)
  return value
}

function properNameTokens(text) {
  const out = new Set()
  const matches = String(text || '').match(/\b(?:[A-Z][A-Za-z]{2,}|[A-Z]{2,}(?:[A-Z0-9-]{1,})?)\b/g) || []
  for (const value of matches) {
    const token = value.toLowerCase()
    if (!GENERIC_NAME_TOKENS.has(token)) out.add(token)
  }
  return out
}

function topicTokens(article) {
  const raw = tokenize(`${titleText(article)} ${String(article?.summary || '').slice(0, 450)}`)
  const names = properNameTokens(`${titleText(article)} ${String(article?.summary || '').slice(0, 450)}`)
  const out = new Set()
  for (const token of raw) {
    const stem = normalizedStem(token)
    if (stem.length > 2 && !TOPIC_NOISE_TOKENS.has(stem) && !names.has(stem)) out.add(stem)
  }
  return out
}

function actionTokens(article) {
  const raw = tokenize(titleText(article))
  const out = new Set()
  for (const token of raw) {
    const stem = normalizedStem(token)
    if (stem.length >= 3 && !TOPIC_NOISE_TOKENS.has(stem)) out.add(stem)
  }
  return out
}

function setOverlap(a, b) {
  if (!a?.size || !b?.size) return null
  return Math.max(jaccard(a, b), containment(a, b))
}

function temporalCoherence(articleA, articleB) {
  const days = daysBetween(articleA?.published_at, articleB?.published_at)
  if (days === null || !Number.isFinite(days)) return null
  if (days >= 45) return 0
  return clamp01(1 - days / 45)
}

function semanticCoherence(articleA, articleB) {
  const titleSimilarity = similarityOrMissing(titleText(articleA), titleText(articleB))
  const leadSimilarity = similarityOrMissing(articleText(articleA), articleText(articleB))
  const lexical = maxObserved([titleSimilarity, leadSimilarity])
  const embA = parseEmbedding(articleA?.embedding)
  const embB = parseEmbedding(articleB?.embedding)
  const embedding = embA && embB ? clamp01(cosine(embA, embB)) : null
  if (lexical === null && embedding === null) return null
  if (lexical === null) return embedding
  if (embedding === null) return lexical
  return clamp01(0.55 * lexical + 0.45 * embedding)
}

function pairMembershipSignals(articleA, articleB) {
  return {
    semantic: semanticCoherence(articleA, articleB),
    actor: setOverlap(properNameTokens(articleText(articleA)), properNameTokens(articleText(articleB))),
    topic: setOverlap(topicTokens(articleA), topicTokens(articleB)),
    temporal: temporalCoherence(articleA, articleB),
    action: setOverlap(actionTokens(articleA), actionTokens(articleB)),
  }
}

function maxObserved(values) {
  const observed = values.filter((value) => value !== null && Number.isFinite(value))
  return observed.length ? Math.max(...observed) : null
}

function canonicalAnchorSignals(event, article) {
  const anchor = { title: String(event?.canonical_title || '') }
  if (!anchor.title) return { semantic: null, actor: null, topic: null, action: null }
  const anchorArticle = { title: anchor.title, summary: '' }
  return {
    semantic: maxObserved([
      similarityOrMissing(anchor.title, titleText(article)),
      similarityOrMissing(anchor.title, articleText(article)),
    ]),
    actor: setOverlap(properNameTokens(anchor.title), properNameTokens(articleText(article))),
    topic: setOverlap(topicTokens(anchorArticle), topicTokens(article)),
    action: setOverlap(actionTokens(anchorArticle), actionTokens({ title: articleText(article) })),
  }
}

function scoreMemberAgainstPeers(article, peers, event) {
  const pairSignals = peers.map((peer) => pairMembershipSignals(article, peer))
  const signals = {}
  for (const name of Object.keys(MEMBERSHIP_WEIGHTS)) signals[name] = maxObserved(pairSignals.map((pair) => pair[name]))

  const observed = Object.entries(signals).filter(([, value]) => value !== null)
  const observedWeight = observed.reduce((sum, [name]) => sum + MEMBERSHIP_WEIGHTS[name], 0)
  const weighted = observedWeight
    ? observed.reduce((sum, [name, value]) => sum + MEMBERSHIP_WEIGHTS[name] * value, 0) / observedWeight
    : 0
  const coveragePenalty = clamp01(1 - observedWeight) * 0.15
  const hardRejections = []

  if (signals.topic !== null && signals.actor !== null && signals.topic < 0.15 && signals.actor < 0.20) {
    hardRejections.push('cross_topic_no_actor')
  }
  if (signals.temporal !== null && signals.temporal < 0.05) hardRejections.push('temporal_conflict')
  if (observed.length < 2) hardRejections.push('insufficient_evidence')

  // Peer-majority evidence alone is unsafe: a contaminated cluster can contain
  // several mutually similar off-topic articles. Every candidate member must
  // also have a semantic/topic/action relationship to the event's canonical
  // anchor. The anchor uses both headline and lead text because valid event
  // details often name the outcome rather than repeat the canonical wording.
  const canonical_anchor = canonicalAnchorSignals(event, article)
  const canonicalSupportsMembership =
    (canonical_anchor.semantic !== null && canonical_anchor.semantic >= 0.25) ||
    (canonical_anchor.topic !== null && canonical_anchor.topic >= 0.20) ||
    (canonical_anchor.action !== null && canonical_anchor.action >= 0.20) ||
    (canonical_anchor.actor !== null && canonical_anchor.actor >= 0.40)
  // Actor overlap alone is intentionally insufficient to establish membership.
  // It occurs in profiles, commentary, and generic institutional coverage that
  // share a person/court but not the event. Require stronger topical, semantic,
  // or action support before actor similarity can rescue a topic-void member.
  const canonicalTopicalSupport =
    (canonical_anchor.semantic !== null && canonical_anchor.semantic >= 0.50) ||
    (canonical_anchor.topic !== null && canonical_anchor.topic >= 0.50) ||
    (canonical_anchor.action !== null && canonical_anchor.action >= 0.50)
  if (signals.topic !== null && signals.topic < 0.15 &&
    canonical_anchor.actor !== null && canonical_anchor.actor >= 0.40 &&
    !canonicalTopicalSupport) {
    hardRejections.push('actor_only_topic_void')
  }
  if (signals.semantic !== null && signals.action !== null && signals.semantic < 0.25 && signals.action < 0.20 && !canonicalSupportsMembership) {
    hardRejections.push('no_semantic_anchor')
  }
  if (canonical_anchor.semantic !== null && canonical_anchor.topic !== null && canonical_anchor.action !== null &&
    !canonicalSupportsMembership) {
    hardRejections.push('canonical_title_mismatch')
  }

  return {
    article_id: article?.id ?? null,
    signals,
    canonical_anchor,
    observed_signal_count: observed.length,
    evidence_coverage: clamp01(observedWeight),
    raw_confidence: clamp01(weighted - coveragePenalty),
    confidence: hardRejections.length ? 0 : clamp01(weighted - coveragePenalty),
    hard_rejections: hardRejections,
  }
}

/**
 * Scores an existing V2 event's article membership. It does not mutate state.
 * `releaseGate` is intentionally supplied by the caller, so a raw score cannot
 * accidentally turn into an approval without persisted audit evidence.
 */
export function scoreEventMembership(event, members, releaseGate = {}) {
  const articles = (members || []).map((member) => member?.article || member).filter(Boolean)
  const memberScores = articles.map((article, index) => scoreMemberAgainstPeers(article, articles.filter((_, peerIndex) => peerIndex !== index), event))

  // A generic canonical title such as "Supreme Court — legal ruling" can share
  // institution tokens with mutually different stories. When every member has
  // no peer-topic agreement and none has a strong canonical topical anchor, the
  // cluster is unsafe even if actor and temporal signals are high.
  const genericAnchorTopicVoid = articles.length >= 2 && memberScores.every((member) => {
    const signals = member.signals || {}
    const anchor = member.canonical_anchor || {}
    const genericAnchor =
      (anchor.topic === null || anchor.topic < 0.20) &&
      (anchor.semantic === null || anchor.semantic <= 0.50) &&
      (anchor.action === null || anchor.action <= 0.50)
    const noStrongAnchor =
      (anchor.semantic === null || anchor.semantic < 0.70) &&
      (anchor.topic === null || anchor.topic < 0.50) &&
      (anchor.action === null || anchor.action < 0.70)
    return signals.topic !== null && signals.topic < 0.15 && genericAnchor && noStrongAnchor
  })
  if (genericAnchorTopicVoid) {
    for (const member of memberScores) member.hard_rejections.push('generic_anchor_topic_void')
  }

  const hardRejections = memberScores.flatMap((member) => member.hard_rejections.map((code) => ({ article_id: member.article_id, code })))
  const confidences = memberScores.map((member) => member.confidence)
  const minimum = confidences.length ? Math.min(...confidences) : 0
  const dispersion = confidences.length ? Math.max(...confidences) - minimum : 1
  const clusterConfidence = hardRejections.length || articles.length < 2 ? 0 : clamp01(minimum - dispersion * 0.10)
  const threshold = Number(releaseGate.autoApprovalThreshold)
  const thresholdConfigured = Number.isFinite(threshold) && threshold >= 0 && threshold <= 1
  const eligible = hardRejections.length === 0 &&
    !!releaseGate.fixturePassed &&
    !!releaseGate.autoApprovalEnabled &&
    thresholdConfigured &&
    clusterConfidence >= threshold

  return {
    event_id: event?.id ?? null,
    model_version: MEMBERSHIP_SCORER_RULE_VERSION,
    article_count: articles.length,
    cluster_confidence: clusterConfidence,
    member_scores: memberScores,
    hard_rejections: hardRejections,
    decision: hardRejections.length || articles.length < 2 ? 'rejected' : 'candidate',
    eligible_for_auto_approval: eligible,
    release_gate: {
      fixture_passed: !!releaseGate.fixturePassed,
      auto_approval_enabled: !!releaseGate.autoApprovalEnabled,
      auto_approval_threshold: thresholdConfigured ? threshold : null,
    },
  }
}

function seededHash(value, seed) {
  let hash = 2166136261
  const input = `${seed}|${value}`
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

/** Select every low-confidence cluster and a reproducible random high-confidence slice. */
export function buildMembershipAuditSample(scores, options = {}) {
  const lowConfidence = Number.isFinite(options.lowConfidence) ? options.lowConfidence : 0.70
  const highSampleSize = Number.isFinite(options.highSampleSize) ? Math.max(0, Math.floor(options.highSampleSize)) : 25
  const seed = String(options.seed ?? 'membership-audit-v2')
  const low = []
  const high = []
  for (const score of scores || []) {
    const confidence = Number(score?.cluster_confidence ?? score?.confidence ?? 0)
    const hasHardRejection = Array.isArray(score?.hard_rejections) && score.hard_rejections.length > 0
    if (hasHardRejection || confidence < lowConfidence) low.push({ ...score, audit_stratum: 'low_confidence_all' })
    else high.push({ ...score, audit_stratum: 'high_confidence_random' })
  }
  const selectedHigh = high
    .sort((a, b) => seededHash(a.event_id || '', seed) - seededHash(b.event_id || '', seed) || String(a.event_id).localeCompare(String(b.event_id)))
    .slice(0, highSampleSize)
  return {
    seed,
    low_confidence_cutoff: lowConfidence,
    population: { low_confidence: low.length, high_confidence: high.length },
    sample: [...low, ...selectedHigh],
  }
}

export function oneSidedWilsonUpper(errors, total, z = 1.6448536269514722) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(errors) || errors < 0 || errors > total) return null
  const p = errors / total
  const denominator = 1 + z * z / total
  const centre = p + z * z / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
  return clamp01((centre + margin) / denominator)
}

/**
 * Proposes the lowest observed confidence threshold with a sufficient, fully
 * reviewed sample and an acceptable upper error bound. It never enables policy.
 */
export function proposeAutoApprovalThreshold(audits, options = {}) {
  const minSampleSize = Number.isFinite(options.minSampleSize) ? Math.max(1, Math.floor(options.minSampleSize)) : 30
  const maxWilsonUpper = Number.isFinite(options.maxWilsonUpper) ? options.maxWilsonUpper : 0.10
  const labelled = (audits || []).filter((audit) => ['correct', 'incorrect'].includes(audit?.audit_status || audit?.outcome))
  const thresholds = [...new Set(labelled.map((audit) => Number(audit.cluster_confidence)).filter(Number.isFinite))].sort((a, b) => a - b)
  const candidates = thresholds.map((threshold) => {
    const sample = labelled.filter((audit) => Number(audit.cluster_confidence) >= threshold)
    const errors = sample.filter((audit) => (audit.audit_status || audit.outcome) === 'incorrect').length
    const errorRate = sample.length ? errors / sample.length : null
    const wilsonUpper = oneSidedWilsonUpper(errors, sample.length)
    return { threshold, sample_size: sample.length, errors, error_rate: errorRate, wilson_upper_95: wilsonUpper,
      eligible: sample.length >= minSampleSize && errors === 0 && wilsonUpper !== null && wilsonUpper <= maxWilsonUpper }
  })
  const selected = candidates.find((candidate) => candidate.eligible) || null
  return {
    model_version: MEMBERSHIP_SCORER_RULE_VERSION,
    threshold: selected?.threshold ?? null,
    auto_approval_enabled: false,
    rationale: selected
      ? 'Threshold proposal is audit-supported but remains disabled until a release policy is explicitly enabled.'
      : 'No threshold meets the minimum reviewed-sample and zero-observed-error requirements.',
    candidates,
  }
}

export function regressionMixedTopicMembershipFixture() {
  const event = { id: 'fixture-pochettino-iran', canonical_title: 'Pochettino agrees to new manager contract with US Soccer' }
  const members = [
    { id: 'fixture-coach-a', outlet: 'sport-a', title: 'Pochettino agrees to new manager contract with US Soccer', summary: 'Mauricio Pochettino agreed a new contract to manage the US national team.', published_at: '2026-08-01T12:00:00Z' },
    { id: 'fixture-coach-b', outlet: 'sport-b', title: 'USMNT agree to new contract with coach Mauricio Pochettino', summary: 'The United States team agreed a contract with Mauricio Pochettino.', published_at: '2026-08-01T16:00:00Z' },
    { id: 'fixture-iran-a', outlet: 'world-a', title: 'Iran says it is in talks with Oman but not the US', summary: 'Iran and Oman discussed regional diplomacy and shipping security.', published_at: '2026-08-01T14:00:00Z' },
  ]
  return { event, members }
}

export function runMembershipRegressionFixture() {
  const fixture = regressionMixedTopicMembershipFixture()
  const result = scoreEventMembership(fixture.event, fixture.members)
  return {
    fixture: 'pochettino-contract-plus-iran-hormuz-style-article',
    passed: result.cluster_confidence === 0 && !result.eligible_for_auto_approval && result.hard_rejections.length > 0,
    result,
  }
}

export function regressionPeerMajorityMembershipFixture() {
  const event = { id: 'fixture-pochettino-peer-majority', canonical_title: 'Pochettino agrees to new manager contract with US Soccer' }
  const members = [
    { id: 'fixture-soccer-a', title: 'USMNT agree to new contract with coach Mauricio Pochettino through 2030 World Cup', summary: 'US Soccer agreed an extension with Mauricio Pochettino.', published_at: '2026-08-03T17:38:35Z' },
    { id: 'fixture-soccer-b', title: 'Pochettino agrees to new manager contract with US Soccer', summary: 'Mauricio Pochettino signed a US Soccer contract.', published_at: '2026-08-03T14:24:24Z' },
    { id: 'fixture-fifa-a', title: 'English FA set to withdraw support for Fifa president Infantino', summary: 'The English Football Association may withdraw support for Gianni Infantino.', published_at: '2026-08-03T07:49:33Z' },
    { id: 'fixture-fifa-b', title: 'FIFA’s Infantino sought Trump backing after World Cup selloff plan: Report', summary: 'FIFA president Gianni Infantino sought political backing for a World Cup plan.', published_at: '2026-08-03T14:18:48Z' },
    { id: 'fixture-iran-a', title: 'Iran says it is in talks with Oman but not the US after Trump says negotiations to resume', summary: 'Iran says negotiations with Oman are separate from the United States.', published_at: '2026-08-03T17:41:27Z' },
    { id: 'fixture-iran-b', title: 'Trump blasts ‘duplicitous’ Iran after Tehran denies it is in talks with the US', summary: 'Iran denied negotiations with the United States.', published_at: '2026-08-03T17:38:01Z' },
    { id: 'fixture-iran-c', title: 'Iran Says No Current Talks With U.S. After Trump Cites Progress on the Strait of Hormuz', summary: 'Iran denied current talks with the United States after Strait of Hormuz comments.', published_at: '2026-08-03T16:11:52Z' },
  ]
  return { event, members }
}

export function regressionActorOnlyTopicVoidFixture() {
  const event = { id: 'fixture-actor-only-topic-void', canonical_title: 'Andy Burnham — domestic policy agenda' }
  const members = [
    { id: 'fixture-policy-a', title: 'New UK PM to cut taxes for struggling pubs', summary: 'Prime Minister Andy Burnham announced a business-rate cut for pubs, clubs and music venues.', published_at: '2026-07-23T11:21:59Z' },
    { id: 'fixture-policy-b', title: 'Andy Burnham to cut tax for pubs and clubs in England', summary: 'Andy Burnham set out business-tax changes for pubs, clubs and live music venues.', published_at: '2026-07-23T06:44:40Z' },
    { id: 'fixture-profile-outlier', title: 'Behind the scenes with Andy Burnham in his first week as PM', summary: 'A profile follows Andy Burnham during his first week in office.', published_at: '2026-07-25T12:26:14Z' },
  ]
  return { event, members }
}

export function runMembershipRegressionSuite() {
  const mixedTopic = runMembershipRegressionFixture()
  const peerMajority = (() => {
    const fixture = regressionPeerMajorityMembershipFixture()
    const result = scoreEventMembership(fixture.event, fixture.members)
    return {
      fixture: 'pochettino-fifa-iran-peer-majority',
      passed: result.cluster_confidence === 0 && result.hard_rejections.some((entry) => entry.article_id === 'fixture-iran-a' && entry.code === 'canonical_title_mismatch'),
      result,
    }
  })()
  const actorOnlyTopicVoid = (() => {
    const fixture = regressionActorOnlyTopicVoidFixture()
    const result = scoreEventMembership(fixture.event, fixture.members)
    return {
      fixture: 'actor-only-topic-void-profile-contamination',
      passed: result.cluster_confidence === 0 && result.hard_rejections.some((entry) => entry.article_id === 'fixture-profile-outlier' && entry.code === 'actor_only_topic_void'),
      result,
    }
  })()
  const fixtures = [mixedTopic, peerMajority, actorOnlyTopicVoid]
  return { passed: fixtures.every((fixture) => fixture.passed), fixtures }
}
