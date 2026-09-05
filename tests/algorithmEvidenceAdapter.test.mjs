import test from 'node:test'
import assert from 'node:assert/strict'
import {
  recordedReleaseGate,
  scoreArcCandidate,
  scoreComparisonCluster,
  membershipDecisionToPromotion,
  candidateFromExactSource,
  assertDefaultDeny,
} from '../scripts/algorithmEvidenceAdapter.mjs'
import { scoreEclipseMembershipWithoutApproval } from '../scripts/mipConsolidationRestore.mjs'
import { regressionActorOnlyArcContaminationFixture, regressionCoherentArcContinuationFixture } from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js'
import { regressionActorOnlyTopicVoidFixture } from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/source-comparison-run/lib.js'

test('recorded release gates stay default-deny even when fixtures pass', () => {
  const arcGate = recordedReleaseGate('arc')
  const scGate = recordedReleaseGate('source_comparison')
  assert.equal(arcGate.auto_approval_enabled, false)
  assert.equal(arcGate.auto_approval_threshold, null)
  assert.equal(scGate.autoApprovalEnabled, false)
  assert.equal(scGate.autoApprovalThreshold, undefined)
  const fixture = regressionActorOnlyArcContaminationFixture()
  const score = scoreArcCandidate({
    candidate: fixture.candidate,
    arc: fixture.arc,
    members: fixture.members,
    candidateEntities: fixture.candidateEntities,
    arcEntities: fixture.arcEntities,
  })
  assert.equal(score.eligible_for_auto_approval, false)
  assert.equal(membershipDecisionToPromotion(score).review_state, 'pending')
})

test('source comparison contamination stays a pending reject, never an approval', () => {
  const fixture = regressionActorOnlyTopicVoidFixture()
  const score = scoreComparisonCluster(fixture.event, fixture.members)
  assert.equal(score.eligible_for_auto_approval, false)
  assert.ok(score.hard_rejections.length > 0)
})

test('forcing an enabled gate is rejected by the adapter', () => {
  const coherent = regressionCoherentArcContinuationFixture()
  assert.throws(() => scoreArcCandidate({
    candidate: coherent.candidate,
    arc: coherent.arc,
    members: coherent.members,
    candidateEntities: coherent.candidateEntities,
    arcEntities: coherent.arcEntities,
  }, {
    fixture_passed: true,
    auto_approval_enabled: true,
    auto_approval_threshold: 0.01,
  }), /automatic approval|must remain/)
})

test('exact-source candidates require a retained excerpt', () => {
  const text = 'NASA table of 2024-04-08 totality times including Cleveland, Ohio.'
  const candidate = candidateFromExactSource({
    capture_id: '00000000-0000-4000-8000-000000000099',
    candidate_key: 'cleveland',
    candidate_kind: 'claim',
    statement: 'Cleveland is named in the retained source.',
    source_field: 'summary',
    source_text: text,
    excerpt: 'Cleveland, Ohio',
    event_node_id: 'acc55cb2-5ac2-4aed-be36-3f576d2bc443',
    remaining_uncertainty: 'Pending review.',
  })
  assert.equal(candidate.excerpt, 'Cleveland, Ohio')
  assert.equal(text.slice(candidate.span_start, candidate.span_end), 'Cleveland, Ohio')
  assert.throws(() => candidateFromExactSource({
    ...candidate,
    source_text: text,
    excerpt: 'Invented quotation',
  }), /not present/)
})

test('eclipse membership helper never flips recorded gates', () => {
  const scored = scoreEclipseMembershipWithoutApproval()
  assert.equal(scored.arc.eligible_for_auto_approval, false)
  assert.equal(scored.source_comparison.eligible_for_auto_approval, false)
  assert.doesNotThrow(() => assertDefaultDeny({ eligible_for_auto_approval: false, release_gate: { auto_approval_enabled: false, auto_approval_threshold: null } }))
})
