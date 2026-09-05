import { scoreArcMembership } from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js'
import { scoreEventMembership } from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/source-comparison-run/lib.js'

export const ARC_MODEL = 'arc-v1-membership-2026-08-23.2'
export const SOURCE_COMPARISON_MODEL = 'sc-v2-membership-2026-08-23.5'
export const EXTRACTOR_VERSION = 'mip-consolidation-adapter-2026-09-05'

export const RECORDED_RELEASE_GATES = Object.freeze({
  arc: Object.freeze({
    algorithm: 'arc',
    model_version: ARC_MODEL,
    fixture_passed: true,
    auto_approval_enabled: false,
    auto_approval_threshold: null,
    release_state: 'default_deny_audit_complete_no_qualifying_band',
  }),
  source_comparison: Object.freeze({
    algorithm: 'source_comparison',
    model_version: SOURCE_COMPARISON_MODEL,
    fixturePassed: true,
    autoApprovalEnabled: false,
    // Omit a numeric threshold. The recovered scorer treats Number(null) as 0.
    release_state: 'default_deny_corrected_band_below_sample_floor',
  }),
})

export function recordedReleaseGate(algorithm) {
  const gate = RECORDED_RELEASE_GATES[algorithm]
  if (!gate) throw new Error(`unknown algorithm ${algorithm}`)
  return { ...gate }
}

export function assertDefaultDeny(score) {
  if (score?.eligible_for_auto_approval) {
    throw new Error('recorded release gates forbid automatic approval')
  }
  const gate = score?.release_gate ?? {}
  if (gate.auto_approval_enabled || gate.autoApprovalEnabled) {
    throw new Error('auto_approval_enabled must remain false')
  }
  return true
}

export function scoreArcCandidate(input, releaseGate = recordedReleaseGate('arc')) {
  const score = scoreArcMembership(
    input.candidate,
    input.arc,
    input.members ?? [],
    input.candidateEntities ?? [],
    input.arcEntities ?? [],
    releaseGate,
  )
  assertDefaultDeny(score)
  return score
}

export function scoreComparisonCluster(event, members, releaseGate = recordedReleaseGate('source_comparison')) {
  const score = scoreEventMembership(event, members, releaseGate)
  assertDefaultDeny(score)
  return score
}

export function spanFromSource(text, excerpt) {
  if (typeof text !== 'string' || typeof excerpt !== 'string' || !excerpt) {
    throw new Error('exact source excerpt required')
  }
  const start = Array.from(text).join('').indexOf(excerpt)
  if (start < 0) throw new Error('excerpt is not present in the retained source field')
  return { source_field: null, span_start: start, span_end: start + Array.from(excerpt).length, excerpt }
}

export function candidateFromExactSource({
  capture_id,
  candidate_key,
  candidate_kind,
  statement,
  source_field,
  source_text,
  excerpt,
  event_node_id = null,
  related_node_id = null,
  place_id = null,
  spatial_revision_id = null,
  remaining_uncertainty,
}) {
  const span = spanFromSource(source_text, excerpt)
  return {
    capture_id,
    candidate_key,
    candidate_kind,
    statement,
    source_field,
    span_start: span.span_start,
    span_end: span.span_end,
    excerpt,
    event_node_id,
    related_node_id,
    place_id,
    spatial_revision_id,
    extractor_version: EXTRACTOR_VERSION,
    remaining_uncertainty,
  }
}

export function membershipDecisionToPromotion(score) {
  return {
    decision: score.decision,
    eligible_for_auto_approval: false,
    review_state: 'pending',
    model_version: score.model_version,
    cluster_confidence: score.cluster_confidence,
    hard_rejections: score.hard_rejections,
    note: 'Membership scores create pending candidates only. Recorded calibration does not qualify automatic approval.',
  }
}
