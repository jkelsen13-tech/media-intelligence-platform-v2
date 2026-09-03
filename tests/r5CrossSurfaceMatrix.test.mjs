import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { emptyInvestigationContext } from '../src/lib/investigationContext.js'
import { parseDeepLink, reconstructFromDeepLink, parseTimeQuery } from '../src/lib/deepLinks.js'
import { subjectFromWorldViewSelection } from '../src/lib/investigationContext.js'
import { classifyJoinState, invalidSelectionAgainstParent, JOIN_STATE_KINDS } from '../src/lib/investigationJoinState.js'
import { inspectorAvailability } from '../src/lib/spatialProjection.js'
import { buildExplanationReadView } from '../src/lib/explanationReadPath.js'
import { richArcTimelineFixture } from './fixtures/richArcTimelineFixture.mjs'

const repoRoot = process.cwd()

const matrixPath = new URL('./fixtures/crossSurfaceMatrix.json', import.meta.url)
const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'))

const REQUIRED_ROW_FIELDS = [
  'matrixCaseId',
  'canonicalObjectId',
  'objectType',
  'expectedTitleOrName',
  'canonicalTemporalFields',
  'canonicalRelationshipTypes',
  'evidenceReviewUncertaintyState',
  'expectedPublicDisclosureState',
  'expectedSurfaces',
  'intentionallyOmittedOrGeneralizedFields',
  'allowedDifferences',
  'lastVerificationResult',
  'resolution',
]

function assertHasKeys(obj, keys) {
  for (const k of keys) {
    assert.ok(Object.hasOwn(obj, k), `matrix row missing required field "${k}"`)
  }
}

function findCase(id) {
  const row = matrix.rows.find((r) => r.matrixCaseId === id)
  assert.ok(row, `matrix missing case "${id}"`)
  return row
}

test('matrix shape: each row includes the required §6 fields', () => {
  assert.equal(matrix.matrixVersion, 'r5-cross-surface-matrix-v0.1')
  assert.ok(Array.isArray(matrix.rows) && matrix.rows.length >= 7)
  for (const row of matrix.rows) assertHasKeys(row, REQUIRED_ROW_FIELDS)
})

test('matrix canonical ids resolve via shared helpers (no display-text identity)', () => {
  // Event canonical id resolution (uses deepLink reconstruction; ids only).
  for (const row of matrix.rows) {
    if (row.canonicalObjectId == null) continue
    if (row.objectType !== 'event') continue
    const link = `#/event/${row.canonicalObjectId}/world`
    const reconstructed = reconstructFromDeepLink(parseDeepLink(link), {
      currentIc: emptyInvestigationContext('world'),
      catalog: null,
    })
    assert.ok(reconstructed.committed, `${row.matrixCaseId}: deepLink reconstruction did not commit`)
    assert.equal(reconstructed.investigationContext.canonical_subject_id, row.canonicalObjectId)
    assert.equal(reconstructed.investigationContext.canonical_subject_type, 'event')
  }

  // Spatial canonical id resolution uses IC seeding from the projection row.
  const positive = findCase('positive-released-spatial-cleveland')
  const seeded = subjectFromWorldViewSelection({ row: positive.resolution.spatialProjectionRow })
  assert.equal(seeded.canonical_subject_id, positive.canonicalObjectId)
  assert.equal(seeded.canonical_subject_type, 'event')
  assert.equal(seeded.as_of_time, positive.resolution.spatialProjectionRow.valid_from_utc)

  // Fixture arc timeline ids are looked up by key in the existing fixture.
  for (const key of ['uncertain-arc-timeline-inferred', 'contested-arc-timeline-contested']) {
    const row = findCase(key)
    const entry = (richArcTimelineFixture.entries ?? []).find((e) => e.key === row.resolution.entryKey)
    assert.ok(entry, `${row.matrixCaseId}: missing entry ${row.resolution.entryKey} in richArcTimelineFixture`)
    assert.equal(entry.badgeState, row.evidenceReviewUncertaintyState.badgeState)
    // Ensure id mapping is by key, not by title text.
    assert.equal(entry.title, row.expectedTitleOrName)
  }

  // Evidence objects are keyed by assertion_id, and buildExplanationReadView
  // classifies based on stored row fields (not on display text).
  for (const id of ['source-unavailable-evidence-archived-missing', 'corrected-revised-evidence-source-corrected', 'missing-source-evidence-source-unavailable']) {
    const row = findCase(id)
    const view = buildExplanationReadView([row.resolution.explanationRow], { enabled: row.resolution.enabled })
    const excluded = view.excluded ?? []
    const hit = excluded.find((x) => x.explanation?.assertion_id === row.canonicalObjectId)
    assert.ok(hit, `${row.matrixCaseId}: expected assertion to be excluded`)
    assert.equal(hit.failureState, row.evidenceReviewUncertaintyState.expectedFailureState)
  }
})

test('spec §12 state distinctions: existing helpers keep “empty/missing/failure/stale/loading” distinct', () => {
  // 1) no matching object (spatial inspector with null row)
  {
    const row = findCase('no-matching-object-spatial-empty')
    const out = inspectorAvailability(null)
    assert.equal(out.state, row.evidenceReviewUncertaintyState.spatialInspectorState.expected)
    assert.equal(out.label, 'No spatial object selected')
  }

  // 2) no evidence captured (join kind = no_joined_data)
  {
    const row = findCase('no-evidence-captured-join-no-joined-data')
    const join = classifyJoinState(row.resolution.args)
    assert.equal(join.kind, row.evidenceReviewUncertaintyState.join.expectedJoinKind)
    assert.equal(join.action, row.evidenceReviewUncertaintyState.join.expectedAction)
    assert.equal(join.invented, false)
    assert.ok(JOIN_STATE_KINDS.includes(join.kind))
  }

  // 3) insufficient evidence (join kind = insufficient_evidence)
  {
    const row = findCase('insufficient-evidence-join-insufficient-evidence')
    const join = classifyJoinState(row.resolution.args)
    assert.equal(join.kind, row.evidenceReviewUncertaintyState.join.expectedJoinKind)
    assert.equal(join.action, row.evidenceReviewUncertaintyState.join.expectedAction)
    assert.equal(join.invented, false)
  }

  // 4) source unavailable (explanation eligibility failure state)
  {
    const row = findCase('source-unavailable-evidence-archived-missing')
    const view = buildExplanationReadView([row.resolution.explanationRow], { enabled: row.resolution.enabled })
    const hit = (view.excluded ?? []).find((x) => x.explanation?.assertion_id === row.canonicalObjectId)
    assert.ok(hit, 'expected excluded explanation')
    assert.equal(hit.failureState, 'source_unavailable')
  }

  // 5) join unavailable (unsupported object type join kind)
  {
    const row = findCase('join-unavailable-unsupported-object-type')
    const join = classifyJoinState(row.resolution.args)
    assert.equal(join.kind, row.evidenceReviewUncertaintyState.join.expectedJoinKind)
    assert.equal(join.action, row.evidenceReviewUncertaintyState.join.expectedAction)
    assert.equal(join.invented, false)
  }

  // 6) permission denied (withheld join kind; action remains disclose)
  {
    const row = findCase('permission-denied-join-withheld')
    const join = classifyJoinState(row.resolution.args)
    assert.equal(join.kind, row.evidenceReviewUncertaintyState.join.expectedJoinKind)
    assert.equal(join.action, row.evidenceReviewUncertaintyState.join.expectedAction)
    assert.equal(join.invented, false)
  }

  // 7) request failure (request_failed join kind)
  {
    const row = findCase('request-failure-join-request-failed')
    const join = classifyJoinState(row.resolution.args)
    assert.equal(join.kind, row.evidenceReviewUncertaintyState.join.expectedJoinKind)
    assert.equal(join.action, row.evidenceReviewUncertaintyState.join.expectedAction)
    assert.equal(join.invented, false)
  }

  // 8) loading (World View / RelationshipPanel initial loading status strings)
  {
    const row = findCase('loading-ui-world-view')
    const files = row.resolution.files ?? []
    assert.equal(files.length, 2)
    const viewText = readFileSync(new URL(`../${files[0]}`, import.meta.url), 'utf8')
    assert.ok(viewText.includes("status: 'loading'"), 'WorldView.jsx must contain initial status: loading')
    const panelText = readFileSync(new URL(`../${files[1]}`, import.meta.url), 'utf8')
    assert.ok(panelText.includes("status: 'loading'"), 'RelationshipPanel must contain initial status: loading')
  }

  // 9) stale/partial (stale_cached join kind)
  {
    const row = findCase('stale-partial-join-stale-cached')
    const join = classifyJoinState(row.resolution.args)
    assert.equal(join.kind, row.evidenceReviewUncertaintyState.join.expectedJoinKind)
    assert.equal(join.invented, false)
    assert.equal(join.action, row.evidenceReviewUncertaintyState.join.expectedAction)
  }

  // Missing join must never become a negative factual claim:
  // invalid selection fallback stays on parent IC and never invents joined entities.
  {
    const row = findCase('empty-join-invalid-subselection-fallback')
    const applied = invalidSelectionAgainstParent(row.resolution.selection, row.resolution.catalog, row.resolution.parentSubjectId)
    assert.equal(applied.invented, false)
    const disclosures = applied.disclosures ?? []
    assert.ok(disclosures.some((d) => d.kind === row.evidenceReviewUncertaintyState.expectedInvalidSelectionKind))
    assert.ok(disclosures.every((d) => d.action === 'parent_context'))
  }
})

