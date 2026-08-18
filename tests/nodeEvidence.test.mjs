import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildNodeEvidenceAxes } from '../src/lib/nodeEvidence.js'

const panel = readFileSync(new URL('../src/panels/ArticlePanel.jsx', import.meta.url), 'utf8')

test('node evidence axes preserve distinct recorded values and plain-language reliability', () => {
  const axes = Object.fromEntries(buildNodeEvidenceAxes({
    confidence: 65,
    reliability: 4,
    doc_strength: 'source_supported',
    authenticated: true,
    review_status: 'awaiting_review',
    remaining_uncertainty: 'Attribution remains under review.',
  }).map((axis) => [axis.key, axis]))

  assert.equal(axes.source_reliability.value, '4 of 4 — limited reliability')
  assert.equal(axes.evidence_strength.value, 'source supported')
  assert.equal(axes.authentication.value, 'Authenticated source record present')
  assert.equal(axes.review_status.value, 'awaiting review')
  assert.equal(axes.remaining_uncertainty.value, 'Attribution remains under review.')
})

test('node evidence ignores the legacy confidence aggregate and exposes honest missing states', () => {
  const axes = buildNodeEvidenceAxes({ confidence: 65 })
  assert.equal(axes.length, 5)
  assert.ok(axes.every((axis) => axis.value.includes('Not yet recorded')))
})

test('ArticlePanel renders labelled node evidence instead of a composite confidence percentage', () => {
  assert.match(panel, /Node evidence state/)
  assert.match(panel, /Articles attached to this node/)
  assert.match(panel, /Node-level source records/)
  assert.doesNotMatch(panel, /ap-confidence-value/)
  assert.doesNotMatch(panel, /<span className="ap-label">Confidence<\/span>/)
})
