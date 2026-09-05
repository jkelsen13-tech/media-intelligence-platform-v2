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
// items: [{articleId, text, kind?}]
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