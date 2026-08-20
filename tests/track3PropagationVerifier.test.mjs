import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { buildTrack3Report } from '../verifier/runV2Track3Propagation.mjs'

const RUN = 'real-import-run'
const md5 = (value) => createHash('md5').update(String(value)).digest('hex')

function report(overrides = {}) {
  return buildTrack3Report({
    runId: RUN,
    articles: [
      { id: 'a1', outlet: 'Alpha', arc_id: 'arc-1', ingestion_run_id: RUN, source_status: 'active', source_status_note: null },
      { id: 'a2', outlet: 'Beta', arc_id: 'arc-1', ingestion_run_id: RUN, source_status: 'active', source_status_note: null },
      { id: 'a3', outlet: 'Gamma', arc_id: null, ingestion_run_id: RUN, source_status: 'active', source_status_note: null },
      { id: 'metadata', outlet: 'Alpha', arc_id: null, ingestion_run_id: 'legacy', source_status: 'active', source_status_note: 'Reference-manifest metadata only: no publisher body' },
    ],
    arcs: [{ id: 'arc-1', root_node_id: 'n1' }],
    nodes: [{ id: 'n1' }],
    citations: [{ id: 'c1', article_id: 'a3', resolved_node_id: 'n1' }],
    articleEntities: [{ article_id: 'a1', entity_id: 'e1' }],
    events: [{ id: 'event-1', status: 'active' }],
    eventArticles: [
      { event_id: 'event-1', article_id: 'a1' },
      { event_id: 'event-1', article_id: 'a2' },
    ],
    comparisonRows: [{ event_key: md5('event-1'), articles: [{ article_key: md5('a1') }, { article_key: md5('a2') }], claims: [{}] }],
    candidates: [
      { id: 'candidate-rejected', article_id: 'a1', target_id: null, review_state: 'rejected' },
      { id: 'candidate-hold', article_id: 'a2', target_id: null, review_state: 'owner_hold' },
    ],
    heldRunTags: ['doc07-canary'],
    protectedCases: [],
    importRuns: [{ completed_at: '2026-08-20T00:00:00Z', report: { p3LegalCasesExcluded: 1 } }],
    ...overrides,
  })
}

test('Track 3 verifier passes a complete eligible propagation set while distinguishing unsupported graph links', () => {
  const result = report()
  const bySurface = new Map(result.checks.map((entry) => [entry.surface, entry]))
  assert.equal(bySurface.get('News').status, 'PASS')
  assert.equal(bySurface.get('Knowledge Graph').status, 'PASS')
  assert.equal(bySurface.get('Knowledge Graph').detail.reachable_via_documented_arc_root, 2)
  assert.equal(bySurface.get('Knowledge Graph').detail.reachable_via_resolved_citation, 1)
  assert.equal(bySurface.get('Causal Timeline').status, 'PASS')
  assert.equal(bySurface.get('Story Arcs').status, 'PASS')
  assert.equal(bySurface.get('Source Comparison').status, 'PASS')
  assert.equal(bySurface.get('Rejected and owner-held candidates').status, 'PASS')
  assert.equal(bySurface.get('Metadata-only references').status, 'PASS')
  assert.equal(bySurface.get('Protected legal records').status, 'PASS')
  assert.equal(bySurface.get('Held ingestion runs').status, 'NOT_OBSERVED')
})

test('Track 3 verifier fails any missing final comparison projection and materialized gated candidate', () => {
  const result = report({
    comparisonRows: [],
    candidates: [{ id: 'candidate-bad', article_id: 'a1', target_id: 'unexpected-target', review_state: 'owner_hold' }],
  })
  const bySurface = new Map(result.checks.map((entry) => [entry.surface, entry]))
  assert.equal(bySurface.get('Source Comparison').status, 'FAIL')
  assert.equal(bySurface.get('Rejected and owner-held candidates').status, 'FAIL')
})

test('Track 3 verifier fails if any active feed route would include non-active source records or unsupported metadata derivatives', () => {
  const base = report({
    articles: [
      { id: 'a1', outlet: 'Alpha', arc_id: 'arc-1', ingestion_run_id: RUN, source_status: 'active', source_status_note: null },
      { id: 'withdrawn', outlet: 'Alpha', arc_id: null, ingestion_run_id: 'legacy', source_status: 'withdrawn', source_status_note: null },
      { id: 'metadata', outlet: 'Alpha', arc_id: null, ingestion_run_id: 'legacy', source_status: 'active', source_status_note: 'Reference-manifest metadata only: no publisher body' },
    ],
    citations: [{ id: 'bad-citation', article_id: 'metadata', resolved_node_id: 'n1' }],
  })
  const bySurface = new Map(base.checks.map((entry) => [entry.surface, entry]))
  assert.equal(bySurface.get('Non-active source records').status, 'FAIL')
  assert.equal(bySurface.get('Metadata-only references').status, 'FAIL')
})

test('Track 3 verifier fails any retained held batch because the public News route reads articles directly', () => {
  const result = report({
    articles: [
      { id: 'held', outlet: 'Alpha', arc_id: null, ingestion_run_id: 'doc07-canary', source_status: 'active', source_status_note: null },
    ],
    citations: [{ id: 'held-citation', article_id: 'held', resolved_node_id: 'n1' }],
    articleEntities: [],
    events: [],
    eventArticles: [],
    comparisonRows: [],
    candidates: [],
  })
  const held = result.checks.find((entry) => entry.surface === 'Held ingestion runs')
  assert.equal(held.status, 'FAIL')
  assert.equal(held.observed_count, 1)
  assert.equal(held.detail.public_news_records, 1)
})
