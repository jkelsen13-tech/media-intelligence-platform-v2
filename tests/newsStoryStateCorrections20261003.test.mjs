import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateNewsStoryState, reconstructNewsStateHistory, newsSourceReports } from '../src/lib/newsStoryState.js'
import { normalizePublicStoryContext } from '../src/lib/storyFollowingClient.js'
import { NEWS_STATE_POLICY } from '../src/lib/newsStatePolicy.js'
import { ownerNewsContext, EPOCH, HOUR, time } from './fixtures/newsStoryFixtures.mjs'

function correctionNovelty(specs, options) {
  const input = ownerNewsContext(specs, options)
  input.material_changes.at(-1).novelty = 'correction'
  const context = normalizePublicStoryContext(input)
  assert.ok(context, 'existing owner declaration contract admits independent kind and novelty')
  return context
}

test('a backdated update with correction novelty keeps its declaration-clock notice and exact binding', () => {
  const context = correctionNovelty([{ at: 0 }, { at: -100, declaredAt: 100, kind: 'update' }])
  const decision = evaluateNewsStoryState(context, EPOCH + 101 * HOUR)
  assert.equal(decision.state, 'UpdatedEstablished')
  assert.equal(decision.reason_code, 'reviewed_correction')
  assert.equal(decision.effective_at, time(-100))
  assert.equal(decision.declared_at, time(100))
  assert.equal(decision.next_evaluation_at, time(172))
  assert.equal(decision.material_change_id, context.material_changes.at(-1).material_change_id)
  assert.equal(decision.public_version_id, context.story.public_version_id)
  assert.deepEqual(decision.review_refs, context.material_changes.at(-1).review_refs)
  assert.equal(evaluateNewsStoryState(context, EPOCH + 172 * HOUR).state, 'Historical')
  const history = reconstructNewsStateHistory(context, EPOCH + 175 * HOUR)
  assert.ok(history.some(row => row.state === 'UpdatedEstablished' && row.evaluated_at === time(100)))
  assert.equal(history.at(-1).evaluated_at, time(172))
  assert.equal(history.at(-1).state, 'Historical')
})

test('correction novelty neither contributes developing velocity nor restarts the active phase', () => {
  const input = ownerNewsContext([{ at: 0, importance: 'material' }, { at: 1, kind: 'update', importance: 'material' }, { at: 7, importance: 'material' }])
  input.material_changes[1].novelty = 'correction'
  const context = normalizePublicStoryContext(input)
  assert.ok(context)
  // At hour 12 the initial genuine change has left the velocity window. The
  // hour-1 correction plus hour-7 update must not manufacture two new changes.
  assert.equal(evaluateNewsStoryState(context, EPOCH + 12 * HOUR).state, 'UpdatedEstablished')
  const phaseInput = ownerNewsContext([{ at: 0 }, { at: 10 }, { at: -100, declaredAt: 11, kind: 'update' }, { at: 12 }])
  phaseInput.material_changes[2].novelty = 'correction'
  assert.equal(evaluateNewsStoryState(normalizePublicStoryContext(phaseInput), EPOCH + 13 * HOUR).state, 'Developing')
})

test('attributed retraction and contradiction corrections stay SOURCE REPORT with no independent MIP assertion', () => {
  for (const reason of ['Source retracts its earlier proposition.', 'Reviewed correction records contradictory evidence.']) {
    const context = correctionNovelty([{ at: 0 }, { at: 1, kind: 'update', reason }], { report: true })
    const decision = evaluateNewsStoryState(context, EPOCH + 1.5 * HOUR)
    assert.equal(decision.available, false)
    const [report] = newsSourceReports(context, EPOCH + 1.5 * HOUR)
    assert.equal(report.label, 'SOURCE REPORT')
    assert.equal(report.assertion_scope, 'attributed_source_report_only')
    assert.equal(report.material_change_id, context.material_changes.at(-1).material_change_id)
    assert.equal(report.predecessor_public_version_id, context.evidence_versions[0].public_version_id)
    assert.equal(report.policy_version, NEWS_STATE_POLICY.version)
    assert.equal(report.reason_code, 'reviewed_correction')
    assert.equal(report.material_public_version_id, context.material_changes.at(-1).public_version_id)
    assert.equal(report.effective_at, time(1))
    assert.deepEqual(report.evidence_refs, context.material_changes.at(-1).evidence_refs)
    assert.deepEqual(report.review_refs, context.material_changes.at(-1).review_refs)
  }
})

test('source-report reasons distinguish stale clocks, missing clocks and superseded versions', () => {
  const stale = normalizePublicStoryContext(ownerNewsContext([{ at: 100, reportAt: 0 }], { report: true }))
  assert.equal(newsSourceReports(stale, EPOCH + 101 * HOUR)[0].reason_code, 'source_report_clock_stale')
  const missing = ownerNewsContext([{ at: 0 }], { report: true })
  missing.story.members[0].published_at = null; missing.evidence_versions[0].published_at = null
  assert.equal(newsSourceReports(normalizePublicStoryContext(missing), EPOCH + HOUR)[0].reason_code, 'source_report_time_missing')
  const superseded = ownerNewsContext([{ at: 0 }], { report: true })
  superseded.story.members[0].is_current_source_version = false
  assert.equal(newsSourceReports(normalizePublicStoryContext(superseded), EPOCH + HOUR)[0].reason_code, 'supporting_source_version_superseded')
})
