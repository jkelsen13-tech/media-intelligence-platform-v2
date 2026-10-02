import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateNewsStoryState, reconstructNewsStateHistory, newsSourceReports } from '../src/lib/newsStoryState.js'
import { NEWS_STATE_POLICY as policy } from '../src/lib/newsStatePolicy.js'
import { EPOCH, HOUR, newsContext, time } from './fixtures/newsStoryFixtures.mjs'
const at = hours => EPOCH + hours * HOUR

test('states preserve canonical identity, exact material reason, review/evidence and policy versions', () => {
  const state = evaluateNewsStoryState(newsContext(), at(1))
  assert.equal(state.state, 'Breaking')
  assert.equal(state.story_id, 'story-1'); assert.equal(state.public_version_id, 'story-version-1')
  assert.equal(state.material_change_id, 'change-1'); assert.equal(state.material_public_version_id, 'story-version-1')
  assert.equal(state.effective_at, time(0)); assert.equal(state.policy_version, policy.version)
  assert.deepEqual(state.evidence_refs, ['source-version-1']); assert.deepEqual(state.review_refs, ['synthetic-owner-review'])
  assert.match(state.coverage_note, /unknown/)
})

test('fresh fetch, outlet multiplication and unchanged version alone never produce Breaking', () => {
  const context = newsContext([{ at: -100 }])
  context.story.members[0].fetched_at = time(0)
  context.story.members[0].source_outlet = 'Many outlets'
  assert.equal(evaluateNewsStoryState(context, at(0)).state, 'Historical')
  context.material_changes = []
  assert.equal(evaluateNewsStoryState(context, at(0)).available, false)
})

test('single material update, correction and resolved event do not imply whole-story Breaking', () => {
  assert.equal(evaluateNewsStoryState(newsContext([{ at: 0, importance: 'material' }]), at(1)).state, 'UpdatedEstablished')
  assert.equal(evaluateNewsStoryState(newsContext([{ at: 0, kind: 'correction' }]), at(1)).state, 'UpdatedEstablished')
  assert.equal(evaluateNewsStoryState(newsContext([{ at: 0, kind: 'resolution', event_state: 'resolved' }]), at(1)).state, 'UpdatedEstablished')
})

test('rapid material changes develop after maximum breaking duration; refreshing cannot reset phase', () => {
  const context = newsContext(Array.from({ length: 10 }, (_, at) => ({ at })))
  assert.equal(evaluateNewsStoryState(context, at(9.5)).state, 'Developing')
  assert.equal(evaluateNewsStoryState(context, at(22)).state, 'UpdatedEstablished')
  assert.equal(evaluateNewsStoryState(context, at(81)).state, 'Historical')
})

test('quiet unresolved events decay; a new separated phase can begin without rewriting history', () => {
  const old = newsContext([{ at: 0, event_state: 'unresolved' }])
  assert.equal(evaluateNewsStoryState(old, at(72)).state, 'Historical')
  const revived = newsContext([{ at: 0 }, { at: 80 }])
  assert.equal(evaluateNewsStoryState(revived, at(81)).state, 'Breaking')
})

test('declared late and stale reports do not borrow a recent review/fetch as rapid news', () => {
  const late = newsContext([{ at: 0, declaredAt: 8 }])
  assert.equal(evaluateNewsStoryState(late, at(8)).state, 'UpdatedEstablished')
  const report = newsContext([{ at: 10, reportAt: -100 }], { report: true })
  assert.equal(newsSourceReports(report, at(11))[0].label, 'SOURCE REPORT')
})

test('future, malformed, duplicate, foreign and missing evidence contexts fail closed', () => {
  const edits = [ c => c.story.review_state = 'pending', c => c.story.story_id = 'foreign',
    c => c.material_changes[0].effective_at = '2026-10-01', c => c.material_changes[0].declared_at = time(2),
    c => c.material_changes[0].effective_at = time(0.00001), c => c.material_changes.push(c.material_changes[0]),
    c => c.material_changes[0].evidence_refs = [], c => c.evidence_versions = [], c => c.material_changes[0].review_refs = [],
    c => c.material_changes[0].novelty = 'unknown', c => c.material_changes[0].public_version_id = 'foreign',
  ]
  for (const edit of edits) {
    const c = newsContext(); edit(c)
    // Selected members also resolve evidence, so remove both for this case.
    if (!c.evidence_versions.length) c.story.members = []
    assert.equal(evaluateNewsStoryState(c, at(1)).available, false)
  }
})

test('source-only evidence never establishes a MIP state; permitted report stays attributed and pending', () => {
  const context = newsContext([{ at: 0 }], { report: true })
  assert.equal(evaluateNewsStoryState(context, at(1)).available, false)
  const report = newsSourceReports(context, at(1))[0]
  assert.equal(report.label, 'BREAKING • SOURCE REPORT')
  assert.equal(report.assertion_scope, 'attributed_source_report_only')
  assert.match(report.verification_label, /Pending/)
  assert.equal(report.source_version_id, 'capture-1'); assert.equal(report.fetch_time, null)
  assert.equal(report.article_original_fetched_at, time(-24)); assert.equal(report.capture_retained_at, time(0))
  assert.equal(newsSourceReports(context, at(2))[0].label, 'SOURCE REPORT')
  context.story.members[0].source_report.capture_hash = 'foreign'
  assert.deepEqual(newsSourceReports(context, at(1)), [])
})

test('report correction preserves supersession identity and does not relaunch Breaking', () => {
  const context = newsContext([{ at: 0 }, { at: 1, kind: 'correction' }], { report: true })
  const report = newsSourceReports(context, at(1.5))[0]
  assert.equal(report.label, 'SOURCE REPORT')
  assert.equal(report.predecessor_public_version_id, 'source-version-1')
  assert.equal(report.correction_reason, 'Exact source correction')
  assert.match(report.review_uncertainty, /incomplete/)
})

test('history is deterministic, preserves declarations and records decay without new fetches', () => {
  const context = newsContext([{ at: 0 }, { at: 1, kind: 'correction' }])
  const before = JSON.stringify(context)
  const history = reconstructNewsStateHistory(context, at(80))
  assert.deepEqual(history.map(s => s.state), ['Breaking', 'UpdatedEstablished', 'Historical'])
  assert.deepEqual(history.map(s => s.material_change_id), ['change-1', 'change-2', 'change-2'])
  assert.deepEqual(reconstructNewsStateHistory(context, at(80)), history)
  assert.equal(JSON.stringify(context), before)
  assert.ok(history.every(s => s.public_version_id === context.story.public_version_id))
})

test('retained sub-millisecond clocks do not cross an exact decay boundary early', () => {
  const c = newsContext()
  c.material_changes[0].effective_at = '2026-10-01T00:00:00.000000001Z'
  c.material_changes[0].declared_at = '2026-10-01T00:00:00.000000001Z'
  assert.equal(evaluateNewsStoryState(c, at(2)).state, 'Breaking')
  assert.equal(evaluateNewsStoryState(c, at(2) + 1).state, 'UpdatedEstablished')
  c.story.visible_at = '2026-10-01T01:00:00.000000001Z'
  assert.equal(evaluateNewsStoryState(c, at(1)).available, false)
})

test('malformed nested input fails closed without an exception', () => {
  const c = newsContext(); c.evidence_versions = { private: true }
  assert.equal(evaluateNewsStoryState(c, at(1)).available, false)
  assert.deepEqual(newsSourceReports(c, at(1)), [])
})

test('a late backdated correction is current Updated while the old event time remains exact', () => {
  const c = newsContext([{ at: 0 }, { at: -100, declaredAt: 100, kind: 'correction' }])
  const state = evaluateNewsStoryState(c, at(101))
  assert.equal(state.state, 'UpdatedEstablished'); assert.equal(state.effective_at, time(-100))
  assert.equal(state.declared_at, time(100))
  assert.equal(evaluateNewsStoryState(c, at(172)).state, 'Historical')
})

test('backdated declarations cannot manufacture a new Breaking phase in a long active story', () => {
  const c = newsContext([{ at: 0 }, { at: 10 }, { at: -100, declaredAt: 11, kind: 'correction' }, { at: 12 }])
  assert.equal(evaluateNewsStoryState(c, at(13)).state, 'Developing')
  const phases = newsContext([{ at: 0 }, { at: 100 }, { at: 101 }, { at: 108 }])
  assert.equal(evaluateNewsStoryState(phases, at(109)).state, 'Developing')
})

test('latest unverified report change withholds prior settled state without withdrawing old admitted evidence', () => {
  const c = newsContext([{ at: 0 }, { at: 1 }], { report: true })
  const old = c.evidence_versions[0]
  old.admission_kind = 'reviewed_proposition'; delete old.source_report
  const state = evaluateNewsStoryState(c, at(1.5))
  assert.equal(state.available, false)
  assert.equal(state.reason_code, 'latest_material_change_is_attributed_report_pending_verification')
  assert.equal(newsSourceReports(c, at(1.5))[0].label, 'BREAKING • SOURCE REPORT')
  assert.equal(old.review_state, 'reviewed')
})

test('successive exact report versions cannot reset the maximum story reporting phase', () => {
  const c = newsContext(Array.from({ length: 10 }, (_, at) => ({ at })), { report: true })
  assert.equal(newsSourceReports(c, at(9.5))[0].label, 'SOURCE REPORT')
})
