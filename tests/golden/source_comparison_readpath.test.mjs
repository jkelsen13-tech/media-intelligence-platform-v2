// Golden tests — Source Comparison (Item 1) read path, pure seams only.
// These cover the presentation rules that Batch 3 locked in:
//   - syndicated copies collapse to a single original source;
//   - omission and coverage_unknown are structurally distinct;
//   - thin extraction carries a visible marker;
//   - evidence strength maps to G2 E-levels with NO composite score;
//   - untiered outlets return null (rendered "tier not assigned"), never guessed.
// Fixtures are inline: this file tests pure functions, not Supabase I/O.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalUrl,
  collapseBySyndication,
  independentOutlets,
  OUTLET_RELIABILITY,
  R_LEVEL_NAMES,
  E_LEVEL_NAMES,
  evidenceStrength,
  buildClaimView,
  buildEventView,
} from '../../src/lib/sourceComparisonReadPath.js'

const A1 = { id: 'a1', outlet: 'BBC', url: 'https://www.bbc.com/news/world-123?utm_source=rss', published_at: '2026-08-05T10:00:00Z' }
const A2 = { id: 'a2', outlet: 'Wire Copy', url: 'https://www.bbc.com/news/world-123?fbclid=xyz', published_at: '2026-08-05T11:00:00Z' }
const A3 = { id: 'a3', outlet: 'NPR', url: 'https://www.npr.org/2026/08/05/story', published_at: '2026-08-05T13:30:00Z' }
const A4 = { id: 'a4', outlet: 'CNN', url: 'https://www.cnn.com/2026/08/05/story', published_at: '2026-08-05T15:00:00Z' }

test('canonicalUrl strips tracking params and normalizes host/path', () => {
  assert.equal(canonicalUrl(A1.url), canonicalUrl(A2.url))
  assert.equal(canonicalUrl('https://www.BBC.com/news/world-123/'), 'bbc.com/news/world-123')
  assert.equal(canonicalUrl(null), null)
})

test('syndicated copies collapse: two articles, one canonical URL -> one syndicate', () => {
  const syndicates = collapseBySyndication([A1, A2, A3])
  assert.equal(syndicates.get('a1'), syndicates.get('a2'))
  assert.ok(syndicates.get('a1'))
  assert.equal(syndicates.get('a3'), undefined)

  const byId = new Map([['a1', A1], ['a2', A2], ['a3', A3]])
  const outlets = independentOutlets(['a1', 'a2', 'a3'], byId, syndicates)
  assert.deepEqual(outlets, ['BBC', 'NPR']) // wire copy never counts as a second source
})

test('omission and coverage_unknown never collapse', () => {
  const byId = new Map([['a1', A1], ['a2', A2], ['a3', A3], ['a4', A4]])
  const eventArticlesByOutlet = new Map([
    ['BBC', [A1]], ['Wire Copy', [A2]], ['NPR', [A3]], ['CNN', [A4]],
  ])
  // NPR extracted claims (surface row exists); CNN produced nothing.
  const extractedArticleIds = new Set(['a1', 'a2', 'a3'])
  const claim = { id: 'c1', canonical_text: 'X signed Y', thin_extraction: false }
  const surfaces = [
    { id: 's1', article_id: 'a1', surface_text: 'X signed Y today', loaded_language: [] },
    { id: 's2', article_id: 'a2', surface_text: 'X signed Y today (wire)', loaded_language: [] },
  ]
  const view = buildClaimView(claim, surfaces, {
    articlesById: byId,
    syndicates: collapseBySyndication([A1, A2, A3, A4]),
    eventOutlets: ['BBC', 'Wire Copy', 'NPR', 'CNN'],
    eventArticlesByOutlet,
    extractedArticleIds,
    evidenceLinks: [],
    corrections: [],
    explanationsByArticle: new Map(),
  })
  assert.deepEqual(view.omittedBy, ['NPR'])          // extracted, claim absent -> omission
  assert.deepEqual(view.coverageUnknown, ['CNN'])    // nothing extracted -> unknown
  assert.notDeepEqual(view.omittedBy, view.coverageUnknown)
  // Wire copy is syndicated, so the claim is single-source, not "shared".
  assert.equal(view.classification, 'unique')
  assert.equal(view.syndicatedExtra, 1)
})

test('thin extraction marker passes through as a boolean flag', () => {
  const view = buildClaimView(
    { id: 'c2', canonical_text: 'Title-grain claim', thin_extraction: true },
    [],
    {
      articlesById: new Map(), syndicates: new Map(), eventOutlets: [],
      eventArticlesByOutlet: new Map(), extractedArticleIds: new Set(),
      evidenceLinks: [], corrections: [], explanationsByArticle: new Map(),
    },
  )
  assert.equal(view.thinExtraction, true)
})

test('evidence strength maps to E1/E2/E4 — separate dimensions, no composite', () => {
  assert.equal(evidenceStrength({ independentOutletCount: 3, hasPrimaryEvidence: true }), 'E1')
  assert.equal(evidenceStrength({ independentOutletCount: 2, hasPrimaryEvidence: false }), 'E2')
  assert.equal(evidenceStrength({ independentOutletCount: 1, hasPrimaryEvidence: false }), 'E4')
  assert.equal(evidenceStrength({ independentOutletCount: 0, hasPrimaryEvidence: false }), 'E4')
  // The seam returns a G2 axis level only — no aggregate score exists.
  assert.ok(Object.keys(E_LEVEL_NAMES).every((k) => /^E[124]$/.test(k)))
})

test('outlet reliability follows G2 worked examples; untiered -> null, never guessed', () => {
  assert.equal(OUTLET_RELIABILITY['BBC'], 'R1')
  assert.equal(OUTLET_RELIABILITY['Democracy Now!'], 'R3')
  assert.equal(OUTLET_RELIABILITY['CNN'], undefined) // not in G2 tiering -> "not yet tiered"
  assert.deepEqual(Object.keys(R_LEVEL_NAMES).sort(), ['R1', 'R2', 'R3', 'R4'])
})

test('event view keeps thin outlets and computes timing without dropping any', () => {
  const byId = new Map([['a1', A1], ['a3', A3], ['a4', A4]])
  const event = {
    id: 'e1', canonical_title: 'Test event', status: 'confirmed',
    occurred_at_start: '2026-08-05', occurred_at_end: '2026-08-05',
  }
  const members = [
    { article_id: 'a1' }, { article_id: 'a3' }, { article_id: 'a4' },
  ]
  const view = buildEventView(event, members, { articlesById: byId, claimViews: [] })
  assert.deepEqual(view.outlets, ['BBC', 'NPR', 'CNN']) // no outlet-count gating
  assert.equal(view.firstOutlet, 'BBC')
  const npr = view.timing.find((t) => t.outlet === 'NPR')
  assert.equal(npr.lagHours, 3.5)
  assert.equal(view.singleSource, false)
})

test('single-source event is labeled, not hidden', () => {
  const byId = new Map([['a1', A1]])
  const view = buildEventView(
    { id: 'e2', canonical_title: 'Solo', status: 'candidate', occurred_at_start: '2026-08-05' },
    [{ article_id: 'a1' }],
    { articlesById: byId, claimViews: [] },
  )
  assert.equal(view.singleSource, true)
  assert.deepEqual(view.outlets, ['BBC'])
})

test('event view exposes per-outlet framing, explanation state, review date, and evidence totals separately', () => {
  const byId = new Map([['a1', A1], ['a3', A3]])
  const claimViews = [
    {
      id: 'c1',
      evidenceLinks: [{ id: 'ev1', evidence_url: 'https://example.com/primary' }],
      surfaces: [
        { outlet: 'BBC', surfaceText: 'BBC framing', explanation: { state: 'ok' }, reviewedAt: '2026-08-11T00:00:00Z' },
        { outlet: 'NPR', surfaceText: 'NPR framing', explanation: null, reviewedAt: null },
      ],
    },
  ]
  const view = buildEventView(
    { id: 'e3', canonical_title: 'Framing event', status: 'active', occurred_at_start: '2026-08-05' },
    [{ article_id: 'a1' }, { article_id: 'a3' }],
    { articlesById: byId, claimViews },
  )
  assert.deepEqual(view.evidenceTotals, { claims: 1, primaryLinks: 1, outlets: 2 })
  assert.equal(view.reviewedAt, '2026-08-11T00:00:00Z')
  const bbc = view.outletCoverage.find((coverage) => coverage.outlet === 'BBC')
  const npr = view.outletCoverage.find((coverage) => coverage.outlet === 'NPR')
  assert.equal(bbc.includedClaimCount, 1)
  assert.equal(bbc.framing[0].surfaceText, 'BBC framing')
  assert.deepEqual(bbc.explanationStates, ['ok'])
  assert.deepEqual(npr.explanationStates, ['explanation_pending'])
})

test('claim surface attaches its explanation object by article id', () => {
  const expl = { assertion_id: 'sc:claim_grouping:k1:a1', rule_version: 'sc-v1|lex' }
  const view = buildClaimView(
    { id: 'c3', canonical_text: 'Explained claim', thin_extraction: false },
    [{ id: 's9', article_id: 'a1', surface_text: 'text', loaded_language: [] }],
    {
      articlesById: new Map([['a1', A1]]), syndicates: new Map(), eventOutlets: ['BBC'],
      eventArticlesByOutlet: new Map([['BBC', [A1]]]), extractedArticleIds: new Set(['a1']),
      evidenceLinks: [], corrections: [], explanationsByArticle: new Map([['a1', expl]]),
    },
  )
  assert.equal(view.surfaces[0].explanation, expl)
})
