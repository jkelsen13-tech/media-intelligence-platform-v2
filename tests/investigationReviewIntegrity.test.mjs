import test from 'node:test'
import assert from 'node:assert/strict'
import { historyMatchesRequest, receiptMatchesDecision, freezeReviewDecisionPayload } from '../src/lib/investigationEvidenceReviewUi.js'
import { FIXTURE_BUNDLES, FIXTURE_CHECKS, fixtureReviewHistory } from '../src/lib/investigationWorkspaceFixtures.js'

const bundle = FIXTURE_BUNDLES.comparable
const checks = FIXTURE_CHECKS.comparable
const history = () => fixtureReviewHistory(checks, { atRevision: '2' })
const input = { investigation_id: bundle.investigation_id, version_id: bundle.version.id,
  report_id: checks.report.id, target_kind: 'evidence_cue', target_id: history().target_id,
  at_revision: '2', before_revision: null }
const receipt = () => ({ ...history(), mode: 'receipt', replayed: false, event: history().events[0] })
const payload = () => { const e = receipt().event; return { ...input, event_id: e.id,
  previous_event_id: e.previous_event_id, decision: e.decision, rationale: e.rationale, evidence: e.evidence } }

test('valid retained history and exact decision receipt remain usable', () => {
  assert.equal(historyMatchesRequest(history(), input, bundle), true)
  assert.equal(receiptMatchesDecision(payload(), receipt(), bundle), true)
})

test('history rejects event identity, pinned revision, evidence and cursor violations', async t => {
  for (const [name, mutate] of Object.entries({
    'wrong event report': d => { d.events[0].report_id = '00000000-0000-4000-8000-000000000099' },
    'wrong event target': d => { d.events[0].target_id = 'another-cue' },
    'future event': d => { d.events[0].revision = '3' },
    'zero event revision': d => { d.events[0].revision = '0' },
    'duplicate event': d => { d.events[1] = structuredClone(d.events[0]) },
    'ascending events': d => { d.events.reverse() },
    'unsupported contract': d => { d.contract_version = 'future-contract' },
    'unresolvable evidence': d => { d.events[0].evidence[0].excerpt = 'invented evidence' },
    'missing evidence': d => { d.events[0].evidence = [] },
    'cursor without full page': d => { d.next_before_revision = '2' },
    'invalid event': d => { d.events[0] = null },
  })) await t.test(name, () => { const d = history(); mutate(d); assert.equal(historyMatchesRequest(d, input, bundle), false) })
})

test('history enforces the exclusive page boundary with decimal precision', () => {
  const d = history()
  assert.equal(historyMatchesRequest(d, { ...input, before_revision: '2' }, bundle), false)
  d.revision = '9007199254740994'
  d.events[0].revision = '9007199254740993'
  d.events[1].revision = '9007199254740992'
  assert.equal(historyMatchesRequest(d, { ...input, at_revision: d.revision, before_revision: d.revision }, bundle), true)
})

test('receipt must acknowledge the exact rationale, predecessor and evidence submitted', async t => {
  for (const [name, mutate] of Object.entries({
    rationale: d => { d.event.rationale = 'Different rationale' },
    predecessor: d => { d.event.previous_event_id = null },
    evidence: d => { d.event.evidence[0].note = 'Different interpretation' },
    author: d => { d.event.authored_by_you = false },
    contract: d => { d.contract_version = 'future-contract' },
    revision: d => { d.event.revision = '3' },
  })) await t.test(name, () => { const d = receipt(); mutate(d); assert.equal(receiptMatchesDecision(payload(), d, bundle), false) })
})

test('retry payload owns immutable evidence independent of caller mutations', () => {
  const e = receipt().event
  const evidence = structuredClone(e.evidence)
  const frozen = freezeReviewDecisionPayload({ investigationId: input.investigation_id, versionId: input.version_id,
    reportId: input.report_id, eventId: e.id, previousEventId: e.previous_event_id, targetKind: e.target_kind,
    targetId: e.target_id, decision: e.decision, rationale: e.rationale, evidence })
  evidence[0].note = 'Caller changed draft after submit'
  assert.deepEqual(frozen.evidence, e.evidence)
  assert.throws(() => { frozen.evidence[0].note = 'Mutate pending retry' }, TypeError)
  assert.throws(() => frozen.evidence.pop(), TypeError)
})

test('fixture pagination follows the SQL exclusive cursor without duplicates or omissions', () => {
  const first = fixtureReviewHistory(checks, { atRevision: '30' })
  const second = fixtureReviewHistory(checks, { atRevision: '30', beforeRevision: first.next_before_revision })
  assert.equal(historyMatchesRequest(first, { ...input, at_revision: '30' }, bundle), true)
  assert.equal(historyMatchesRequest(second, { ...input, at_revision: '30', before_revision: first.next_before_revision }, bundle), true)
  assert.equal(new Set([...first.events, ...second.events].map(e => e.id)).size, 30)
  assert.equal(second.next_before_revision, null)
})

test('superseded receipts and JSONB key reordering retain exact submission meaning', () => {
  const d = receipt()
  d.revision = '9007199254740993'
  d.replayed = true
  d.event.evidence = d.event.evidence.map(ref => Object.fromEntries(Object.entries(ref).reverse()))
  assert.equal(receiptMatchesDecision(payload(), d, bundle), true)
})
