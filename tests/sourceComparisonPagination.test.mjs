// Doc 13 site 1 regression test (owner-authorized 2026-08-11):
// sourceComparisonReadPath must return the COMPLETE set past the PostgREST
// 1000-row ceiling. The fake below emulates PostgREST exactly on the failure
// axis: every response is capped at 1000 rows no matter what the caller asked
// for. Fixture sizes are >1000 on every read table. Assertions name SPECIFIC
// rows at positions beyond 1000 — a count match alone would not prove the fix
// (Doc 13 acceptance bar).

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSourceComparisonView } from '../src/lib/sourceComparisonReadPath.js'

// --- Minimal PostgREST emulation -------------------------------------------
// Supports exactly the builder chain the read path uses: select/eq/in/like/
// gt/order/range/limit/maybeSingle + await. The 1000-row server cap is
// applied unconditionally at response time — that IS the bug being tested.
function fakePostgrest(tables) {
  const calls = []
  return {
    calls,
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { range: null, limit: null, single: false }
      const q = {
        select: () => q,
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q },
        neq: (c, v) => { rows = rows.filter((r) => r[c] !== v); return q },
        in: (c, vs) => { calls.push({ table, column: c, values: [...vs] }); const s = new Set(vs); rows = rows.filter((r) => s.has(r[c])); return q },
        like: (c, p) => {
          const re = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$')
          rows = rows.filter((r) => re.test(String(r[c] ?? '')))
          return q
        },
        gt: (c, v) => { rows = rows.filter((r) => String(r[c]) > String(v)); return q },
        order: (c, { ascending = true } = {}) => {
          rows = [...rows].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
          return q
        },
        range: (f, t) => { state.range = [f, t]; return q },
        limit: (n) => { state.limit = n; return q },
        maybeSingle: () => { state.single = true; return q },
        then: (resolve) => {
          let r = rows
          if (state.range) r = r.slice(state.range[0], state.range[1] + 1)
          else if (state.limit) r = r.slice(0, state.limit)
          r = r.slice(0, 1000) // PostgREST max-rows cap — the bug under test
          resolve({ data: state.single ? (r[0] ?? null) : r, error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')

// --- Fixture: every read table past the ceiling -----------------------------
const N_EVENTS = 1200
const N_MEMBERS = 2400
const N_CLAIMS = 1300
const N_SURFACES = 2400
const N_LINKS = 1200
const N_CORR = 1100
const N_CG_EXPL = 1150 // claim_grouping explanations (the actively-truncated read)
const N_EM_EXPL = 1150 // event_membership explanations

function buildTables() {
  const events = []
  for (let i = 1; i <= N_EVENTS; i++) {
    events.push({ id: `ev-${pad(i)}`, canonical_title: `Event ${i}`, occurred_at_start: `2026-07-${pad((i % 28) + 1).slice(-2)}`, occurred_at_end: null, status: 'candidate' })
  }
  const event_articles = []
  for (let i = 1; i <= N_MEMBERS; i++) {
    event_articles.push({ event_id: `ev-${pad((i % N_EVENTS) + 1)}`, article_id: `art-${pad(i)}`, membership_method: 'embedding_cluster', membership_confidence: 0.9 })
  }
  const claims = []
  for (let i = 1; i <= N_CLAIMS; i++) {
    claims.push({ id: `cl-${pad(i)}`, event_id: `ev-${pad((i % N_EVENTS) + 1)}`, canonical_text: `Claim ${i}`, thin_extraction: false, status: 'active', rule_version: 'sc-v2-event-projection' })
  }
  claims.push({ id: 'cl-inactive', event_id: 'ev-000001', canonical_text: 'archived', thin_extraction: false, status: 'archived', rule_version: 'sc-v2-event-projection' })
  const article_claims = []
  for (let i = 1; i <= N_SURFACES; i++) {
    article_claims.push({ id: `ac-${pad(i)}`, claim_id: `cl-${pad((i % N_CLAIMS) + 1)}`, article_id: `art-${pad((i % N_MEMBERS) + 1)}`, surface_text: `Surface ${i}`, stance: 'asserts', loaded_language: [], is_current: true })
  }
  const claim_evidence_links = []
  for (let i = 1; i <= N_LINKS; i++) claim_evidence_links.push({ id: `lk-${pad(i)}`, claim_id: `cl-${pad((i % N_CLAIMS) + 1)}`, evidence_url: `https://example.com/${i}`, evidence_type: 'primary' })
  const claim_corrections = []
  for (let i = 1; i <= N_CORR; i++) claim_corrections.push({ id: `cr-${pad(i)}`, claim_id: `cl-${pad((i % N_CLAIMS) + 1)}`, correcting_article_id: null, corrected_article_id: null, correction_text: `fix ${i}`, occurred_at: null })
  const explanations = []
  for (let i = 1; i <= N_CG_EXPL; i++) {
    explanations.push({ id: `ex-cg-${pad(i)}`, assertion_id: `sc:claim_grouping:evt-c${i}:art-${pad((i % N_MEMBERS) + 1)}`, assertion_type: 'claim_grouping', supporting_passage: `cg ${i}`, rule_version: 'sc-v2-event-projection|deterministic_text_similarity', provenance_class: 'machine', review_status: 'awaiting_review', state: 'ok', remaining_uncertainty: null, is_current: true })
  }
  for (let i = 1; i <= N_EM_EXPL; i++) {
    explanations.push({ id: `ex-em-${pad(i)}`, assertion_id: `sc:event_membership:evt-${i}:art-${pad((i % N_MEMBERS) + 1)}`, assertion_type: 'event_membership', supporting_passage: `em ${i}`, rule_version: 'sc-v1|embedding_cluster', provenance_class: 'machine', review_status: 'awaiting_review', state: 'ok', remaining_uncertainty: null, is_current: true })
  }
  explanations.push({ id: 'ex-other', assertion_id: 'x', assertion_type: 'arc_assignment', supporting_passage: '', rule_version: 'arc_assign@20260724', provenance_class: 'machine', review_status: 'awaiting_review', state: 'ok', remaining_uncertainty: null, is_current: true })
  const articles = []
  for (let i = 1; i <= N_MEMBERS; i++) {
    articles.push({ id: `art-${pad(i)}`, outlet: `Outlet ${(i % 7) + 1}`, title: `Article ${i}`, url: `https://news.example.com/${i}`, published_at: '2026-07-15', claims: [{ text: 'c', kind: 'substantive' }], unattributed: false, monoculture: false, is_digest: false, arc_id: null })
  }
  return {
    pipeline_config: [{ key: 'source_comparison_beta', value: true }],
    events, event_articles, claims, article_claims, claim_evidence_links, claim_corrections, explanations, articles,
    story_arcs: [], nodes: [],
  }
}

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('explanations').select('id')
  assert.equal(data.length, 1000)
})

test('loadSourceComparisonView returns the complete set past 1000 rows on every table', async () => {
  const view = await loadSourceComparisonView({ supabaseClient: fakePostgrest(buildTables()) })
  assert.equal(view.enabled, true, JSON.stringify(view.loadError))

  // events: 1200 seeded, all present, presentation sort preserved (desc)
  assert.equal(view.events.length, N_EVENTS)

  // Every claim_grouping explanation reaches its surface — collect what the
  // UI would actually render.
  const renderedExplanations = new Set()
  let renderedSurfaces = 0
  const renderedLinks = new Set()
  const renderedCorrections = new Set()
  const memberArticleIds = new Set()
  for (const ev of view.events) {
    for (const claim of ev.claims) {
      for (const l of claim.evidenceLinks) renderedLinks.add(l.id)
      for (const c of claim.corrections) renderedCorrections.add(c.id)
      for (const s of claim.surfaces) {
        renderedSurfaces++
        memberArticleIds.add(s.articleId)
        if (s.explanation) renderedExplanations.add(s.explanation.assertion_id)
      }
    }
  }

  // article_claims: all 2400 surfaces rendered (proves >1000 read complete)
  assert.equal(renderedSurfaces, N_SURFACES)

  // explanations: all 1150 claim_grouping rows rendered, including SPECIFIC
  // rows at positions beyond 1000 in id order (ex-cg-001001 … ex-cg-001150
  // are the exact rows a truncated read would have dropped).
  assert.equal(renderedExplanations.size, N_CG_EXPL)
  assert.ok(renderedExplanations.has(`sc:claim_grouping:evt-c${1001}:art-${pad((1001 % N_MEMBERS) + 1)}`), 'row at position 1001 missing')
  assert.ok(renderedExplanations.has(`sc:claim_grouping:evt-c${1150}:art-${pad((1150 % N_MEMBERS) + 1)}`), 'final row missing')

  // claims: all 1300 active claims rendered; the archived one is not
  const renderedClaims = new Set()
  for (const ev of view.events) for (const c of ev.claims) renderedClaims.add(c.id)
  assert.equal(renderedClaims.size, N_CLAIMS)
  assert.ok(!renderedClaims.has('cl-inactive'))

  // event_articles (composite-key offset path): a member article that exists
  // ONLY at position 1400 of the members read must resolve to its real outlet
  // — 'unknown' would prove the articles IN-chunk or the members read dropped it.
  const targetEvent = view.events.find((e) => e.id === `ev-${pad((1400 % N_EVENTS) + 1)}`)
  assert.ok(targetEvent, 'target event missing')
  assert.ok(targetEvent.outlets.includes(`Outlet ${(1400 % 7) + 1}`), 'member at position 1400 lost its article join')

  // evidence links and corrections reads complete past 1000
  assert.equal(renderedLinks.size, N_LINKS)
  assert.ok(renderedLinks.has(`lk-${pad(1200)}`))
  assert.equal(renderedCorrections.size, N_CORR)
  assert.ok(renderedCorrections.has(`cr-${pad(1100)}`))
})


test('loadSourceComparisonView excludes Timeline-only and single-outlet event records', async () => {
  const tables = {
    pipeline_config: [{ key: 'source_comparison_beta', value: true }],
    events: [
      { id: 'compare', canonical_title: 'Comparable event', occurred_at_start: '2026-08-19', occurred_at_end: null, status: 'active' },
      { id: 'one-outlet', canonical_title: 'One source only', occurred_at_start: '2026-08-18', occurred_at_end: null, status: 'active' },
      { id: 'timeline', canonical_title: 'Chronology only', occurred_at_start: '2026-08-17', occurred_at_end: null, status: 'timeline_only' },
    ],
    event_articles: [
      { event_id: 'compare', article_id: 'a1', membership_method: 'documented', membership_confidence: 1 },
      { event_id: 'compare', article_id: 'a2', membership_method: 'documented', membership_confidence: 1 },
      { event_id: 'one-outlet', article_id: 'a3', membership_method: 'documented', membership_confidence: 1 },
      { event_id: 'timeline', article_id: 'a4', membership_method: 'chronological', membership_confidence: 1 },
    ],
    claims: [], article_claims: [], claim_evidence_links: [], claim_corrections: [], explanations: [],
    articles: [
      { id: 'a1', outlet: 'Outlet A', title: 'A', url: 'https://a.example/a', published_at: '2026-08-19', claims: [], unattributed: false, monoculture: false, is_digest: false, arc_id: null },
      { id: 'a2', outlet: 'Outlet B', title: 'B', url: 'https://b.example/b', published_at: '2026-08-19', claims: [], unattributed: false, monoculture: false, is_digest: false, arc_id: null },
      { id: 'a3', outlet: 'Outlet A', title: 'C', url: 'https://a.example/c', published_at: '2026-08-18', claims: [], unattributed: false, monoculture: false, is_digest: false, arc_id: null },
      { id: 'a4', outlet: 'Outlet C', title: 'D', url: 'https://c.example/d', published_at: '2026-08-17', claims: [], unattributed: false, monoculture: false, is_digest: false, arc_id: null },
    ],
    story_arcs: [], nodes: [],
  }
  const db = fakePostgrest(tables)
  const view = await loadSourceComparisonView({ supabaseClient: db })
  assert.deepEqual(view.events.map((event) => event.id), ['compare'])
  const memberIds = db.calls
    .filter((call) => call.table === 'event_articles' && call.column === 'event_id')
    .flatMap((call) => call.values)
  assert.deepEqual(memberIds.sort(), ['compare', 'one-outlet'])
})
