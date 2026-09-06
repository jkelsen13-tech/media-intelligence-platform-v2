// Pure helpers for evidence-review forms, filters and history identity.
// No network, persistence or UI mounting.

import { EVIDENCE_REVIEW_LABELS } from './investigationEvidenceReviewsClient.js'
import { resolveWorkspaceExcerpt } from './investigationWorkspaceClient.js'
import { resolveWorkspaceMetadata } from './investigationWorkspaceSession.js'

export const REVIEW_FILTER_ATTENTION = 'attention'
export const REVIEW_FILTER_ALL = 'all'

export function emptyReviewsState() {
  return {
    reviews: null,
    reviewsPanels: null,
    reviewsError: null,
    reviewsBusy: false,
    loadingReviews: false,
    pendingReviewDecision: null,
    reviewsConflict: false,
    decisionSavedNeedsRefresh: false,
    reviewDrafts: {},
    reviewFilter: REVIEW_FILTER_ATTENTION,
    reviewHistory: null,
    loadingReviewHistory: false,
    loadingOlderReviewHistory: false,
    reviewHistoryError: null,
  }
}

export function reviewsRequestKey(userId, investigationId, versionId, observationId, reportId, action = 'read') {
  return `reviews:${action}:${userId ?? ''}:${investigationId ?? ''}:${versionId ?? ''}:${observationId ?? ''}:${reportId ?? ''}`
}

export function reviewDecisionRequestKey(userId, payload) {
  return `reviews:decide:${userId ?? ''}:${payload?.investigation_id ?? ''}:${payload?.version_id ?? ''}:${payload?.report_id ?? ''}:${payload?.event_id ?? ''}`
}

export function reviewHistoryRequestKey(
  userId,
  investigationId,
  versionId,
  observationId,
  reportId,
  targetKind,
  targetId,
  atRevision,
  beforeRevision,
  inspectorEpoch,
) {
  return [
    'reviews:history',
    userId ?? '',
    investigationId ?? '',
    versionId ?? '',
    observationId ?? '',
    reportId ?? '',
    targetKind ?? '',
    targetId ?? '',
    atRevision ?? '',
    beforeRevision ?? 'first',
    inspectorEpoch ?? '',
  ].join(':')
}

export function reviewTargetKey(kind, id) {
  return `${kind}:${id}`
}

export function reviewsUnavailableCopy(code) {
  if (code === 'origin_denied') {
    return 'This browser origin is not allowed to read private evidence reviews.'
  }
  if (code === 'not_configured') {
    return 'Private evidence reviews are not available in this session.'
  }
  if (code === 'service_unavailable' || code === 'request_failed') {
    return 'Private evidence reviews are unavailable right now. Retry the same request.'
  }
  if (code === 'invalid_request') {
    return 'The evidence-review request was rejected as invalid. The draft is available to edit.'
  }
  if (code === 'version_conflict') {
    return 'The review changed. Current records were reloaded. Save again only as an explicit action with the accepted predecessor. Another decision was not overwritten.'
  }
  if (code === 'unsupported_contract') {
    return 'This evidence-review response could not be used. Field mappings are not guessed.'
  }
  if (code === 'identity_mismatch') {
    return 'This evidence-review response did not match the displayed investigation version. It was not applied. Retry the same request.'
  }
  return 'Private evidence reviews are unavailable.'
}

export function reviewDecisionLabel(decision) {
  return EVIDENCE_REVIEW_LABELS[decision] ?? 'Needs review'
}

export function humanReviewStatusCopy(target) {
  if (!target) return 'Human review has not been loaded for this target.'
  const label = reviewDecisionLabel(target.decision)
  if (target.latest_event == null) {
    return `Human review: ${label}. Not yet reviewed by an assigned reviewer. This is a relevance decision, not a factual verdict.`
  }
  if (target.decision === 'needs_review') {
    return `Human review: ${label}. Reopened after an earlier decision. This is not a first look, and it is not a factual verdict.`
  }
  return `Human review: ${label}. This is a relevance decision for this investigation, not a factual verdict or independent-source verification.`
}

export function reviewAuthorLabel(event) {
  if (event?.authored_by_you === true) return 'You'
  return 'Assigned reviewer'
}

export function referenceIdentity(reference) {
  if (!reference) return ''
  if (reference.source_field === 'source_status') {
    return `status:${reference.position}:${reference.value}`
  }
  return `text:${reference.position}:${reference.source_field}:${reference.span_start}:${reference.span_end}:${reference.excerpt}`
}

function textDraftItem(id, reference, required, bundle) {
  if (!reference) {
    return {
      id,
      selected: false,
      required,
      kind: 'text',
      position: null,
      source_field: null,
      span_start: null,
      span_end: null,
      excerpt: '',
      relation: 'context',
      note: '',
      resolvable: false,
      missing: true,
    }
  }
  const resolvable = Boolean(resolveWorkspaceExcerpt(bundle, reference))
  return {
    id,
    selected: required && resolvable,
    required,
    kind: 'text',
    position: reference.position,
    source_field: reference.source_field,
    span_start: reference.span_start,
    span_end: reference.span_end,
    excerpt: reference.excerpt,
    relation: reference.relation ?? 'context',
    note: typeof reference.note === 'string' ? reference.note : '',
    resolvable,
    missing: false,
  }
}

function metadataDraftItem(id, reference, required, bundle) {
  const resolved = resolveWorkspaceMetadata(bundle, reference)
  return {
    id,
    selected: required && Boolean(resolved),
    required,
    kind: 'metadata',
    position: reference?.position ?? null,
    source_field: 'source_status',
    value: reference?.value ?? null,
    resolvable: Boolean(resolved),
    missing: !reference,
  }
}

function extraObservationCitations(bundle, seen) {
  const extras = []
  const push = (reference, origin) => {
    if (!reference || reference.source_field === 'source_status') return
    const key = referenceIdentity(reference)
    if (!key || seen.has(key)) return
    if (!resolveWorkspaceExcerpt(bundle, reference)) return
    seen.add(key)
    extras.push({
      id: `extra:${origin}:${key}`,
      selected: false,
      required: false,
      kind: 'text',
      position: reference.position,
      source_field: reference.source_field,
      span_start: reference.span_start,
      span_end: reference.span_end,
      excerpt: reference.excerpt,
      relation: reference.relation ?? 'context',
      note: typeof reference.note === 'string' ? reference.note : '',
      resolvable: true,
      missing: false,
    })
  }
  for (const hypothesis of bundle?.version?.state?.hypotheses ?? []) {
    for (const reference of hypothesis.evidence ?? []) push(reference, `hypothesis:${hypothesis.id}`)
  }
  for (const commitment of bundle?.version?.state?.commitments ?? []) {
    for (const stage of commitment.stages ?? []) {
      for (const reference of stage.evidence ?? []) push(reference, `stage:${stage.id}`)
    }
  }
  return extras
}

export function buildSuggestedReviewDraft(targetKind, target, bundle) {
  const items = []
  const requiredPositions = []
  const seen = new Set()
  if (targetKind === 'source_link') {
    requiredPositions.push(String(target.left_position), String(target.right_position))
    const left = textDraftItem('machine-left', target.left_excerpt, true, bundle)
    const right = textDraftItem('machine-right', target.right_excerpt, true, bundle)
    items.push(left, right)
    if (target.left_excerpt) seen.add(referenceIdentity(target.left_excerpt))
    if (target.right_excerpt) seen.add(referenceIdentity(target.right_excerpt))
  } else {
    requiredPositions.push(String(target.position))
    if (target.metadata_reference) {
      items.push(metadataDraftItem('machine-status', target.metadata_reference, true, bundle))
      seen.add(referenceIdentity(target.metadata_reference))
    }
    if (target.reference) {
      items.push(textDraftItem('machine-text', target.reference, !target.metadata_reference, bundle))
      seen.add(referenceIdentity(target.reference))
    }
  }
  items.push(...extraObservationCitations(bundle, seen))
  return {
    decision: 'relevant',
    rationale: '',
    items,
    requiredPositions,
  }
}

export function selectedEvidenceFromDraft(draft) {
  const evidence = []
  for (const item of draft?.items ?? []) {
    if (!item.selected || !item.resolvable) continue
    if (item.kind === 'metadata') {
      evidence.push({
        position: String(item.position),
        source_field: 'source_status',
        value: item.value,
      })
      continue
    }
    evidence.push({
      position: String(item.position),
      source_field: item.source_field,
      span_start: item.span_start,
      span_end: item.span_end,
      excerpt: item.excerpt,
      relation: item.relation,
      note: item.note,
    })
  }
  return evidence
}

export function reviewSubmissionBlockReason(draft, targetKind) {
  if (!draft) return 'A decision form has not been prepared for this target.'
  const selected = (draft.items ?? []).filter((item) => item.selected)
  if (selected.length === 0) {
    const requiredMissing = (draft.items ?? []).some((item) => item.required && (item.missing || !item.resolvable))
    if (requiredMissing) {
      return targetKind === 'source_link'
        ? 'This pair does not have usable retained references covering both inputs, so a decision cannot be submitted yet. A citation is not invented to unlock the form.'
        : 'This cue does not have a usable retained reference for its input, so a decision cannot be submitted yet. A citation is not invented to unlock the form.'
    }
    return 'A decision needs 1–8 exact retained evidence references.'
  }
  if (selected.some((item) => !item.resolvable || item.missing)) {
    return 'A selected reference cannot be resolved against this saved observation. Unresolved references are errors, not blank supporting evidence.'
  }
  if (selected.length > 8) return 'A decision can retain at most 8 evidence references.'
  const positions = selected.map((item) => String(item.position))
  for (const position of draft.requiredPositions ?? []) {
    if (!positions.includes(String(position))) {
      return targetKind === 'source_link'
        ? 'Source-link reviews must cite both retained input positions.'
        : 'This cue review must cite its own retained input position.'
    }
  }
  for (const item of selected) {
    if (item.kind === 'text') {
      if (!item.relation || !String(item.note ?? '').trim()) {
        return 'Text references need a relation and a reviewer-confirmed note in addition to the detector span.'
      }
    }
  }
  const rationale = String(draft.rationale ?? '')
  if (!rationale.trim()) return 'A nonblank rationale is required.'
  if (Array.from(rationale.trim()).length > 2000) return 'Rationale is limited to 2,000 characters.'
  return null
}

export function targetMatchesFilter(target, filter) {
  if (!target) return false
  if (filter === REVIEW_FILTER_ALL) return true
  return target.decision === 'needs_review' || target.decision === 'disputed'
}

export function reviewTargetFromPanels(panels, kind, id) {
  return panels?.targets?.find((item) => item.target_kind === kind && item.target_id === id) ?? null
}

export function mergeHistoryEvents(existing, incoming) {
  const next = Array.isArray(existing) ? existing.slice() : []
  const seen = new Set(next.map((event) => event?.id).filter(Boolean))
  for (const event of incoming ?? []) {
    if (!event?.id || seen.has(event.id)) continue
    seen.add(event.id)
    next.push(event)
  }
  return next
}

export function receiptMatchesDecision(payload, data, bundle) {
  return Boolean(
    payload
    && data?.mode === 'receipt'
    && data.investigation_id === payload.investigation_id
    && data.version_id === payload.version_id
    && data.report_id === payload.report_id
    && data.observation_id === bundle?.observation?.id
    && data.publicly_eligible === false
    && data.event?.id === payload.event_id
    && data.event?.target_kind === payload.target_kind
    && data.event?.target_id === payload.target_id
    && data.event?.decision === payload.decision,
  )
}

export function historyMatchesRequest(data, input, bundle) {
  return Boolean(
    data?.mode === 'history'
    && data.investigation_id === input.investigation_id
    && data.version_id === input.version_id
    && data.report_id === input.report_id
    && data.observation_id === bundle?.observation?.id
    && data.target_kind === input.target_kind
    && data.target_id === input.target_id
    && data.revision === input.at_revision
    && data.publicly_eligible === false
    && Array.isArray(data.events)
    && data.events.length <= 20,
  )
}

export function freezeReviewDecisionPayload({
  investigationId,
  versionId,
  reportId,
  eventId,
  previousEventId,
  targetKind,
  targetId,
  decision,
  rationale,
  evidence,
}) {
  if (!investigationId || !versionId || !reportId || !eventId || !targetKind || !targetId) return null
  return Object.freeze({
    investigation_id: investigationId,
    version_id: versionId,
    report_id: reportId,
    event_id: eventId,
    previous_event_id: previousEventId ?? null,
    target_kind: targetKind,
    target_id: targetId,
    decision,
    rationale,
    evidence,
  })
}

export function inspectorOwnsReviewHistory(inspector, history) {
  if (!inspector || !history) return false
  if (inspector.kind === 'source-link') {
    return history.target_kind === 'source_link' && history.target_id === inspector.pair?.id
  }
  if (inspector.kind === 'challenge-cue') {
    return history.target_kind === 'evidence_cue' && history.target_id === inspector.cue?.id
  }
  return false
}
