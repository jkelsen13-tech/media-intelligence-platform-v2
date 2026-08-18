import test from 'node:test'
import assert from 'node:assert/strict'
import { buildConnectors } from '../src/lib/timelineEngine.js'
import { badgeState, validateEvidenceCounts } from '../src/lib/epistemicModel.js'
import { richArcTimelineFixture as fixture } from './fixtures/richArcTimelineFixture.mjs'

test('rich Arc/Timeline fixture includes mixed evidence states without an aggregate score', () => {
  const counts = validateEvidenceCounts(fixture.evidence)
  assert.deepEqual(counts, { supporting: 1, contested: 1, missing: 1 })
  assert.ok(fixture.evidence.missingScope.includes('last checked'))
  assert.ok(fixture.evidence.remainingUncertainty[0].includes('not been located'))
  assert.equal(Object.hasOwn(fixture.evidence, 'confidence'), false)
})

test('rich fixture preserves known and missing provenance states explicitly', () => {
  const [confirmed, inferred, contested, missing] = fixture.entries
  assert.equal(badgeState(confirmed.badgeState)?.label, 'Confirmed')
  assert.equal(badgeState(inferred.badgeState)?.label, 'Inferred')
  assert.equal(badgeState(contested.badgeState)?.label, 'Contested')
  assert.equal(badgeState(missing.badgeState), null)
  assert.ok(confirmed.provenance.sourceUrl)
  assert.equal(missing.provenance.sourceUrl, null)
  assert.ok(missing.provenance.remainingUncertainty.includes('not treated as contradiction'))
})

test('rich fixture renders only the fully source-supported causal connector as causal', () => {
  const connectors = buildConnectors(fixture.entries, fixture.edges)
  assert.equal(connectors.length, fixture.entries.length - 1)
  assert.equal(connectors[0].kind, 'causal')
  assert.equal(connectors[0].label, 'Source-supported causal link')
  assert.equal(connectors[1].kind, 'sequence')
  assert.equal(connectors[1].label, 'Sequence only')
  assert.equal(connectors[2].kind, 'sequence')
})
