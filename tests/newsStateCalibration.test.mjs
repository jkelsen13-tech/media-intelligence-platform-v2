import test from 'node:test'
import assert from 'node:assert/strict'
import { runNewsStateCalibration } from '../verifier/runNewsStateCalibration.mjs'
import { evaluateNewsStoryState, newsSourceReports } from '../src/lib/newsStoryState.js'
import { newsContext, EPOCH, HOUR } from './fixtures/newsStoryFixtures.mjs'

test('candidate comparison records persistence/decay tradeoffs and untouched holdout', () => {
  const receipt = runNewsStateCalibration()
  const [short, selected, long] = receipt.candidates
  assert.ok(short.calibration_errors > 0); assert.ok(short.holdout_errors > 0)
  assert.equal(selected.calibration_errors, 0); assert.equal(selected.holdout_errors, 0)
  assert.ok(long.calibration_errors > 0); assert.ok(long.holdout_errors > 0)
  assert.equal(receipt.thresholds_approved_for_live_use, false)
  assert.deepEqual(runNewsStateCalibration(), receipt)
})

test('adversarial unclassified advances, truncated history and duplicate sources never strengthen a state', () => {
  const context = newsContext([{ at: -100 }])
  context.story.sequence = '9007199254740993'; context.story.public_version_id = 'unclassified-new-version'
  context.story.members.push({ ...context.story.members[0], public_version_id: 'duplicate-outlet', source_outlet: 'Second publisher' })
  context.story.members.forEach(member => member.fetched_at = new Date(EPOCH).toISOString())
  assert.equal(evaluateNewsStoryState(context, EPOCH).state, 'Historical')
  context.has_more = true
  assert.equal(evaluateNewsStoryState(context, EPOCH).available, false)
  const report = newsContext([{ at: 0 }], { report: true }); report.has_more = true
  assert.equal(newsSourceReports(report, EPOCH + HOUR)[0].label, 'SOURCE REPORT')
})
