import test from 'node:test'
import assert from 'node:assert/strict'
import { savedVersionNavigation, versionNavigationBlocked } from '../src/lib/investigationVersionNavigation.js'
import { versionNavigationFixture } from './versionNavigationFixture.mjs'

test('saved-version navigation separates predecessor, head and reviewed identities and preserves unknown links', () => {
  const [first, baseline, head] = versionNavigationFixture()
  assert.equal(savedVersionNavigation(head).previous, baseline.version.id)
  assert.equal(savedVersionNavigation(baseline).previous, first.version.id)
  assert.equal(savedVersionNavigation(first).first, true)
  assert.equal(savedVersionNavigation(first).reviewed, baseline.version.id)
  assert.equal(savedVersionNavigation(baseline).isReviewedVersion, true)
  assert.equal(savedVersionNavigation(first).current, false)
  delete head.version.predecessor_id
  assert.equal(savedVersionNavigation(head).first, false); assert.equal(savedVersionNavigation(head).previous, null)
  head.version.predecessor_id = head.version.id
  assert.equal(savedVersionNavigation(head).previous, null)
  first.version.predecessor_id = head.version.id
  assert.equal(savedVersionNavigation(first).first, false); assert.equal(savedVersionNavigation(first).previous, null)
})

test('navigation rejects mismatched saved identities and blocks unresolved writes instead of discarding them', () => {
  for (const mutate of [b => { b.version.investigation_id = 'other' }, b => { b.version.observation_id = 'other' },
    b => { b.publicly_eligible = true }, b => { b.version.revision = 0 }, b => { b.version.revision = Number.MAX_SAFE_INTEGER + 1 }, b => { b.head_version_id = 'invalid' }]) {
    const bundle = versionNavigationFixture()[2]; mutate(bundle); assert.equal(savedVersionNavigation(bundle), null)
  }
  for (const key of ['loadingBundle','reviewBusy','pendingReview','reviewsBusy','pendingReviewDecision','decisionSavedNeedsRefresh','checksBusy','pendingChecksRun']) assert.equal(versionNavigationBlocked({ [key]: true }), true)
  assert.equal(versionNavigationBlocked({}), false)
})
