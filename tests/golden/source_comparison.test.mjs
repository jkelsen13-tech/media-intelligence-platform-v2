// Source Comparison (Item 1) — golden tests for the deterministic sc-v1 pipeline.
// Covers spec acceptance criteria B4.1–B4.7 and failure states B5:
//   shared facts identified with exact outlet set; syndication counts once;
//   distinct-fact claims never merged; unique claims labeled; omission defined
//   precisely and distinguished from coverage_unknown; floor gating; no
//   composite score; explanation rows carry method + rule_version.
// Fixture: tests/golden/fixtures/source_comparison.json (sc-fixture-v1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runPipeline, clusterArticles, groupClaims, detectSyndicates, independentOutlets,
  scanLoadedLanguage, computeComparison, canonicalUrl, claimSimilarity, RULE_VERSION,
  EVENT_PROJECTION_RULE_VERSION, runEventProjection,
} from '../../supabase/functions/source-comparison-run/lib.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const fixture = JSON.parse(readFileSync(join(repoRoot, 'tests/golden/fixtures/source_comparison.json'), 'utf8'))
const lexicon = JSON.parse(readFileSync(join(repoRoot, 'supabase/functions/source-comparison-run/loadedLanguageLexicon.json'), 'utf8'))

const CFG = fixture.config
const articles = fixture.articles.map((a) => ({ ...a, embedding: null }))
const articlesById = new Map(articles.map((a) => [a.id, a]))
const entityIndex = new Map()
for (const p of fixture.entity_pairs) {
  if (!entityIndex.has(p.article_id)) entityIndex.set(p.article_id, new Set())
  entityIndex.get(p.article_id).add(p.entity_id)
}
const E = fixture.expectations

function eventCluster() {
  const clusters = clusterArticles(articles, entityIndex, CFG)
  // the event cluster contains a1; the unrelated article is its own singleton
  const ev = clusters.find((c) => c.members.some((m) => m.article.id === 'a1'))
  assert.ok(ev, 'event cluster not found')
  return ev
}

function groupedEventClaims(ev) {
  const included = ev.members.filter((m) => m.confidence >= CFG.membershipFloor)
  const items = []
  for (const m of included) {
    for (const c of m.article.claims || []) if (c?.text) items.push({ articleId: m.article.id, text: c.text })
  }
  return groupClaims(items, CFG.groupFloor)
}

// B4.1 — shared facts correctly identified, exact independent outlet set
test('shared fact identified across o1/o2/o3 with paraphrase grouping', () => {
  const ev = eventCluster()
  const grouped = groupedEventClaims(ev)
  const shared = grouped.find((g) => g.canonicalText.includes(E.shared_fact_canonical))
  assert.ok(shared, 'shared canonical claim not found')
  const syndicates = detectSyndicates(articles)
  const outlets = independentOutlets(shared.members.map((m) => m.articleId), articlesById, syndicates).sort()
  assert.deepEqual(outlets, [...E.shared_fact_outlets].sort())
})

// B4.1 — distinct facts about the same entities must NOT merge
test('distinct-fact claims stay separate (signing vs critics vs Israel condition)', () => {
  const ev = eventCluster()
  const grouped = groupedEventClaims(ev)
  const signing = grouped.filter((g) => g.canonicalText.includes(E.shared_fact_canonical))
  assert.equal(signing.length, 1, 'paraphrases split into multiple canonical claims')
  assert.ok(!signing[0].canonicalText.includes('slams'), 'attack framing merged into factual claim')
  assert.ok(grouped.some((g) => g.canonicalText.includes('recognising Israel')), 'Israel condition claim missing')
  const israel = grouped.find((g) => g.canonicalText.includes('recognising Israel'))
  assert.ok(!israel.canonicalText.includes('signed'), 'distinct facts merged')
})

// B4.1/Q5 — syndication: wire copy adds no independent outlet
test('syndicated copy counts as one source (G2 Axis 2e)', () => {
  const syndicates = detectSyndicates(articles)
  const [x, y] = E.syndicated_pair
  assert.ok(syndicates.get(x) && syndicates.get(x) === syndicates.get(y), 'wire pair not detected as one syndicate')
  const ev = eventCluster()
  const grouped = groupedEventClaims(ev)
  const shared = grouped.find((g) => g.canonicalText.includes(E.shared_fact_canonical))
  const outlets = independentOutlets(shared.members.map((m) => m.articleId), articlesById, syndicates)
  assert.equal(outlets.filter((o) => o === 'o2wire').length, 0, 'wire outlet surfaced as independent source')
})

// B4.3 — omission precise definition; omitted_by contains o2 for enrichment claim
test('omission: outlet with extracted event coverage but no matching claim', () => {
  const ev = eventCluster()
  const grouped = groupedEventClaims(ev)
  const syndicates = detectSyndicates(articles)
  const extracted = new Map(articles.map((a) => [a.id, Array.isArray(a.claims)]))
  const cmp = computeComparison({ members: ev.members, extracted }, grouped, articlesById, syndicates, { membershipFloor: CFG.membershipFloor })
  const enr = cmp.claims.find((c) => c.canonicalText.includes('uranium enrichment'))
  assert.ok(enr, 'enrichment claim not found')
  assert.ok(enr.omitted_by.includes('o2'), `o2 omission missing: ${enr.omitted_by}`)
  assert.deepEqual(enr.coverage_unknown, [], 'extracted outlet misclassified as unknown')
})

// B4.3 — coverage_unknown ≠ omission when extraction has not run
test('coverage_unknown distinguished from omission (not-yet-ingested)', () => {
  const variant = articles.map((a) => a.id === 'a3' ? { ...a, claims: null } : a)
  const byId = new Map(variant.map((a) => [a.id, a]))
  const ev = eventCluster()
  const items = []
  for (const m of ev.members.filter((m) => m.confidence >= CFG.membershipFloor)) {
    const art = byId.get(m.article.id)
    for (const c of art.claims || []) if (c?.text) items.push({ articleId: art.id, text: c.text })
  }
  const grouped = groupClaims(items, CFG.groupFloor)
  const syndicates = detectSyndicates(variant)
  const extracted = new Map(variant.map((a) => [a.id, Array.isArray(a.claims)]))
  const cmp = computeComparison({ members: ev.members.map((m) => ({ ...m, article: byId.get(m.article.id) })), extracted }, grouped, byId, syndicates, { membershipFloor: CFG.membershipFloor })
  const enr = cmp.claims.find((c) => c.canonicalText.includes('uranium enrichment'))
  assert.ok(enr.coverage_unknown.includes('o3'), 'unextracted outlet not marked coverage_unknown')
  assert.ok(!enr.omitted_by.includes('o3'), 'unextracted outlet falsely reported as omission')
})

// B4.4 — membership floor gating: unrelated/singleton article excluded, surfaced as U1
test('floor gating: below-floor membership excluded from sets, surfaced as low-confidence', () => {
  const clusters = clusterArticles(articles, entityIndex, CFG)
  const singleton = clusters.find((c) => c.members.some((m) => m.article.id === E.unrelated_article_excluded))
  const m = singleton.members.find((m) => m.article.id === E.unrelated_article_excluded)
  assert.ok(m.confidence < CFG.membershipFloor)
  const extracted = new Map(articles.map((a) => [a.id, true]))
  const cmp = computeComparison({ members: singleton.members, extracted }, [], articlesById, new Map(), { membershipFloor: CFG.membershipFloor })
  assert.ok(cmp.low_confidence_excluded.some((x) => x.articleId === E.unrelated_article_excluded && x.u_level === 'U1'))
})

// B5 — single-source event: comparison unavailable
test('single-source event flagged (no comparable coverage state)', () => {
  const single = [{ id: 's1', outlet: 'o1', title: 't', url: null, published_at: '2026-08-01T00:00:00Z', claims: [{ text: 'x happened' }], embedding: null }]
  const clusters = clusterArticles(single, new Map(), CFG)
  const extracted = new Map([['s1', true]])
  const cmp = computeComparison({ members: clusters[0].members, extracted }, groupClaims([{ articleId: 's1', text: 'x happened' }], CFG.groupFloor), new Map(single.map((a) => [a.id, a])), new Map(), { membershipFloor: CFG.membershipFloor })
  assert.equal(cmp.single_source, true)
})

// B4.5 — no composite score anywhere in comparison output
test('no numeric composite in comparison output', () => {
  const ev = eventCluster()
  const grouped = groupedEventClaims(ev)
  const extracted = new Map(articles.map((a) => [a.id, true]))
  const cmp = computeComparison({ members: ev.members, extracted }, grouped, articlesById, detectSyndicates(articles), { membershipFloor: CFG.membershipFloor })
  const json = JSON.stringify(cmp, (k, v) => (k === 'confidence' ? undefined : v))
  assert.ok(!/"(score|composite|bias|rating|percentage)"/i.test(json), 'composite metric leaked into output')
  for (const c of cmp.claims) assert.ok(['shared', 'unique'].includes(c.classification))
})

// loaded language — spans on surface forms, lexicon-versioned
test('loaded language detected on surface form with spans and categories', () => {
  const a2claim = fixture.articles.find((a) => a.id === 'a2').claims[1].text
  const hits = scanLoadedLanguage(a2claim, lexicon)
  assert.deepEqual(hits.map((h) => h.term), E.loaded_terms_in_a2)
  assert.equal(hits[0].category, 'attack_verb')
  assert.equal(a2claim.slice(hits[0].span[0], hits[0].span[1]).toLowerCase(), 'slams')
  const body = fixture.articles.find((a) => a.id === 'a3').body_text
  assert.ok(scanLoadedLanguage(body, lexicon).some((h) => h.term === 'so-called'))
})

// B4.6 — every decision emits a Phase 2 explanation row with method + rule_version
test('explanation rows: one per membership and grouping decision, machine provenance', () => {
  const plan = runPipeline(articles, fixture.entity_pairs, CFG, lexicon)
  const membershipRows = plan.explanations.filter((r) => r.assertion_type === 'event_membership')
  const groupingRows = plan.explanations.filter((r) => r.assertion_type === 'claim_grouping')
  assert.ok(membershipRows.length >= 4, `membership rows: ${membershipRows.length}`)
  assert.equal(groupingRows.length, plan.article_claims.length, 'every surface claim needs a grouping explanation')
  for (const r of plan.explanations) {
    assert.ok(r.rule_version.startsWith(RULE_VERSION + '|'), `rule_version missing method: ${r.rule_version}`)
    assert.equal(r.provenance_class, 'machine')
    assert.equal(r.review_status, 'awaiting_review')
    assert.equal(r.version, 1)
    assert.ok(r.supporting_passage.length > 0)
  }
})

test('V2 event projection writes comparison claims against existing multi-outlet events only', () => {
  const event = { id: 'existing-v2-event', canonical_title: 'Existing V2 event' }
  const multiOutletMembers = eventCluster().members.map((member) => ({ article: member.article }))
  const projection = runEventProjection([{ event, members: multiOutletMembers }], CFG, lexicon)
  assert.ok(projection.claims.length > 0, 'expected projected claims for existing event membership')
  assert.equal(projection.stats.events_processed, 1)
  assert.ok(projection.claims.every((claim) => claim.event_id === event.id))
  assert.ok(projection.claims.every((claim) => claim.rule_version === EVENT_PROJECTION_RULE_VERSION))
  assert.equal(projection.explanations.length, projection.article_claims.length)
  assert.ok(projection.explanations.every((row) => row.rule_version.startsWith(EVENT_PROJECTION_RULE_VERSION + '|')))

  const singleOutlet = runEventProjection([
    { event: { id: 'single-outlet' }, members: [{ article: { id: 'only', outlet: 'one', claims: [{ text: 'one claim' }] } }] },
  ], CFG, lexicon)
  assert.equal(singleOutlet.claims.length, 0, 'single-outlet event must not create a comparison projection')
})

// canonical URL normalization (Q5)
test('canonicalUrl strips tracking params and host noise', () => {
  assert.equal(
    canonicalUrl('https://www.O1.example.com/world/saudi-deal/?utm_source=rss&fbclid=x'),
    'o1.example.com/world/saudi-deal')
})

// sanity: paraphrase similarity above floor, different-fact below floor
test('claimSimilarity: paraphrase merges, distinct fact does not', () => {
  const a = 'The United States and Saudi Arabia signed a civil nuclear cooperation agreement on Thursday.'
  const b = 'A civil nuclear cooperation agreement was signed by the United States and Saudi Arabia on Thursday.'
  const c = 'The deal is contingent on Saudi Arabia recognising Israel under the Abraham Accords.'
  assert.ok(claimSimilarity(a, b) >= CFG.groupFloor, `paraphrase sim ${claimSimilarity(a, b)} below floor`)
  assert.ok(claimSimilarity(a, c) < CFG.groupFloor, `distinct-fact sim ${claimSimilarity(a, c)} above floor`)
})
