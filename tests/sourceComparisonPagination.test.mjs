import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSourceComparisonView } from '../src/lib/sourceComparisonReadPath.js'

function fakePostgrest(tables) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push({ table })
      let rows = [...(tables[table] ?? [])]
      const state = { range: null }
      const q = {
        select: () => q,
        order: (column, { ascending = true } = {}) => {
          rows = [...rows].sort((a, b) => (String(a[column] ?? '') < String(b[column] ?? '') ? -1 : String(a[column] ?? '') > String(b[column] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
          return q
        },
        range: (from, to) => { state.range = [from, to]; return q },
        then: (resolve) => {
          let result = rows
          if (state.range) result = result.slice(state.range[0], state.range[1] + 1)
          resolve({ data: result.slice(0, 1000), error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')
const N_EVENTS = 1200

function makeClaim(eventKey, articleA, articleB) {
  return {
    claim_key: `claim-${eventKey}`,
    canonical_text: `Claim for ${eventKey}`,
    thin_extraction: false,
    evidence_links: [],
    corrections: [],
    surfaces: [
      {
        article_key: articleA.article_key,
        surface_text: `Outlet A framing for ${eventKey}`,
        loaded_language: [],
        explanation: {
          supporting_passage: `Projection explanation A for ${eventKey}`,
          rule_version: 'sc-v2-event-projection|deterministic_text_similarity',
          provenance_class: 'machine',
          reviewed_at: null,
          review_status: 'awaiting_review',
          state: 'ok',
          remaining_uncertainty: 'Machine grouping is not human review.',
        },
      },
      {
        article_key: articleB.article_key,
        surface_text: `Outlet B framing for ${eventKey}`,
        loaded_language: [],
        explanation: {
          supporting_passage: `Projection explanation B for ${eventKey}`,
          rule_version: 'sc-v2-event-projection|deterministic_text_similarity',
          provenance_class: 'machine',
          reviewed_at: null,
          review_status: 'awaiting_review',
          state: 'ok',
          remaining_uncertainty: 'Machine grouping is not human review.',
        },
      },
    ],
  }
}

function makeProjectionRow(index) {
  const event_key = `event-${pad(index)}`
  const articleA = {
    article_key: `article-a-${pad(index)}`,
    outlet: 'Outlet A',
    article_url: `https://a.example/${index}`,
    published_at: '2026-08-03T12:00:00Z',
    arc_slug: null,
    arc_title: null,
    timeline_key: null,
    has_extracted_claim: true,
  }
  const articleB = {
    article_key: `article-b-${pad(index)}`,
    outlet: 'Outlet B',
    article_url: `https://b.example/${index}`,
    published_at: '2026-08-03T13:00:00Z',
    arc_slug: null,
    arc_title: null,
    timeline_key: null,
    has_extracted_claim: true,
  }
  return {
    event_key,
    canonical_title: `Projected event ${index}`,
    occurred_at_start: '2026-08-03',
    occurred_at_end: null,
    articles: [articleA, articleB],
    claims: [makeClaim(event_key, articleA, articleB)],
  }
}

function buildTables() {
  return { comparison_public: Array.from({ length: N_EVENTS }, (_, index) => makeProjectionRow(index + 1)) }
}

test('control: the fake PostgREST caps a naive projection select at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('comparison_public').select('*')
  assert.equal(data.length, 1000)
})

test('public Source Comparison reader returns the complete projection past 1000 cards', async () => {
  const db = fakePostgrest(buildTables())
  const view = await loadSourceComparisonView({ supabaseClient: db })
  assert.equal(view.enabled, true)
  assert.equal(view.events.length, N_EVENTS)
  assert.ok(view.events.some((event) => event.id === `event-${pad(1001)}`), 'card after the PostgREST cap is missing')
  assert.ok(view.events.some((event) => event.id === `event-${pad(N_EVENTS)}`), 'final card is missing')
  const card = view.events.find((event) => event.id === `event-${pad(1001)}`)
  assert.equal(card.outlets.length, 2)
  assert.equal(card.claims.length, 1)
  assert.equal(card.claims[0].surfaces.length, 2)
  assert.equal(card.claims[0].surfaces[0].explanation.review_status, 'awaiting_review')
  assert.deepEqual([...new Set(db.calls.map((call) => call.table))], ['comparison_public'])
})

test('projection reader keeps a populated multi-outlet card without accessing base claims or config', async () => {
  const db = fakePostgrest({ comparison_public: [makeProjectionRow(1)] })
  const view = await loadSourceComparisonView({ supabaseClient: db })
  assert.equal(view.events.length, 1)
  assert.equal(view.events[0].claims[0].canonicalText, 'Claim for event-000001')
  assert.equal(view.events[0].outletCoverage[0].reviewStatuses[0], 'awaiting_review')
  assert.deepEqual([...new Set(db.calls.map((call) => call.table))], ['comparison_public'])
})
