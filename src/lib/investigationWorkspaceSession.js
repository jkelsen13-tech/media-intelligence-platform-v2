// Private investigation workspace session helpers.
// Request lifecycle, honest copy, and review capture. No persistence.

import { investigationWorkspacePanels } from './investigationWorkspaceClient.js'
import { formatWorkspaceDate } from './workspacePresentation.js'

export const PRIVATE_INVESTIGATION_VIEW = 'investigations'
export const INVESTIGATION_WORKSPACE_PANELS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'changed', label: 'What Changed' },
  { id: 'hypotheses', label: 'Hypotheses' },
  { id: 'commitments', label: 'Commitments' },
  { id: 'gaps', label: 'Evidence Gaps' },
  { id: 'source-history', label: 'Source History' },
  { id: 'source-links', label: 'Source Links' },
  { id: 'evidence-checks', label: 'Evidence Checks' },
  { id: 'search-coverage', label: 'Search Coverage' },
])

export const WORKSPACE_STATUS = Object.freeze({
  session_loading: 'session_loading',
  signed_out: 'signed_out',
  loading: 'loading',
  empty: 'empty',
  ready: 'ready',
  access_denied: 'access_denied',
  unsupported_contract: 'unsupported_contract',
  authentication_required: 'authentication_required',
  unavailable: 'unavailable',
})

export const EMPTY_SECTION_COPY = Object.freeze({
  hypotheses: 'No hypotheses recorded. Empty does not mean these explanations were disproven or that uncertainty is zero.',
  commitments: 'No commitments recorded. Empty does not mean there was no activity.',
  coverage: 'No collection declarations recorded. Empty does not mean a completed search.',
  unresolved: 'No unresolved questions recorded. That is not proof that nothing remains uncertain.',
  assessments: 'No selected assessments are recorded for this saved version.',
  changes: 'These saved records are unchanged relative to the named review baseline. Unchanged is not completeness.',
})

export const COMPARISON_MODE_COPY = Object.freeze({
  not_reviewed: 'No personal review baseline is recorded for this version. Current saved records are shown. That does not mean everything is new.',
  comparable: 'Evidence and definition records are compared with the version you last marked reviewed. These are record comparisons, not proof of stronger or weaker claims.',
  scope_changed: 'Evidence comparison is unavailable because the candidate scope differs from the review baseline. Definition edits to the recorded investigation can still be shown.',
  historical_before_review: 'This version predates your current review marker. History is shown without reversed change counts. This view does not move the review baseline backward.',
})

export const EVIDENCE_CHANGE_COPY = Object.freeze({
  evidence_entered_observation: 'Evidence entered the observation. Presence here does not by itself confirm, contradict, or complete a claim.',
  assessment_added: 'Assessment added. A new recorded decision is not an overall answer.',
  assessment_dependency_change: 'Dependency state changed. A stale or updated dependency is not a completed reassessment.',
  assessment_replaced: 'Assessment replaced. The new recorded outcome is not proof of causality or a winning explanation.',
})

export const STAGE_STATUS_COPY = Object.freeze({
  unknown: 'Unknown — no retained status is recorded for this stage.',
  reported: 'Reported — a source reports this stage; that is not independent confirmation.',
  observed: 'Observed — retained evidence is recorded for this stage. An observed outcome is not proof the commitment caused it.',
  no_followup_found: 'No follow-up found in the declared collection. That is not proof of no activity elsewhere.',
  not_applicable: 'Not applicable on this recorded branch.',
  cancelled: 'Cancelled — retained evidence is recorded for the cancellation claim.',
})

export const SEARCH_STATUS_COPY = Object.freeze({
  not_run: 'Search not run for this declared scope.',
  partial: 'Partial search for this declared scope. Partial is not measured completeness.',
  completed_for_declared_scope: 'Search completed for the declared scope only. That bounded declaration is not global coverage.',
})

export const COVERAGE_STATUS_COPY = Object.freeze({
  not_assessed: 'Collection not assessed.',
  limited: 'Limited collection declaration.',
  documented_scope: 'Documented collection scope — still an analyst declaration, not an independent measurement.',
})

export function emptyPrivateWorkspaceState() {
  return {
    catalog: [],
    hasMore: false,
    nextAfter: null,
    catalogError: null,
    selectedInvestigationId: null,
    selectedVersionId: null,
    bundle: null,
    panels: null,
    bundleError: null,
    beforeBundles: {},
    inspector: null,
    pendingReview: null,
    reviewBusy: false,
    reviewError: null,
    reviewConflict: false,
    activeSection: 'overview',
    loadingCatalog: false,
    loadingBundle: false,
    loadingBefore: false,
    checks: null,
    checksPanels: null,
    checksError: null,
    checksBusy: false,
    loadingChecks: false,
    pendingChecksRun: null,
    reviews: null,
    reviewsPanels: null,
    reviewsError: null,
    reviewsBusy: false,
    loadingReviews: false,
    pendingReviewDecision: null,
    reviewsConflict: false,
    decisionSavedNeedsRefresh: false,
    reviewDrafts: {},
    reviewFilter: 'attention',
    reviewHistory: null,
    loadingReviewHistory: false,
    loadingOlderReviewHistory: false,
    reviewHistoryError: null,
  }
}

export function createRequestGate() {
  let generation = 0
  let key = null
  return {
    start(nextKey) {
      generation += 1
      key = String(nextKey)
      return { generation, key }
    },
    invalidate() {
      generation += 1
      key = null
      return generation
    },
    isCurrent(token) {
      return Boolean(token) && token.generation === generation && token.key === key
    },
    current() {
      return { generation, key }
    },
  }
}

export function catalogRequestKey(userId, after = null) {
  return `catalog:${userId ?? ''}:${after ?? ''}`
}

export function readRequestKey(userId, investigationId, versionId = null) {
  return `read:${userId ?? ''}:${investigationId ?? ''}:${versionId ?? 'head'}`
}

export function reviewRequestKey(userId, payload) {
  return `review:${userId ?? ''}:${payload?.investigationId ?? ''}:${payload?.versionId ?? ''}:${payload?.receiptId ?? ''}`
}

export function historyRequestKey(userId, investigationId, displayedVersionId, beforeVersionId) {
  return `history:${userId ?? ''}:${investigationId ?? ''}:${displayedVersionId ?? 'head'}:${beforeVersionId ?? ''}`
}

export function checksRequestKey(userId, investigationId, versionId, observationId, action = 'read') {
  return `checks:${action}:${userId ?? ''}:${investigationId ?? ''}:${versionId ?? ''}:${observationId ?? ''}`
}

export function displayedScopeKey(userId, investigationId, versionId = null) {
  return readRequestKey(userId, investigationId, versionId)
}

export function createKeyedRequestFamily() {
  let epoch = 0
  const generations = new Map()
  return {
    start(nextKey) {
      const key = String(nextKey)
      const generation = (generations.get(key) ?? 0) + 1
      generations.set(key, generation)
      return { epoch, key, generation }
    },
    invalidate() {
      epoch += 1
      generations.clear()
      return epoch
    },
    isCurrent(token) {
      return Boolean(token)
        && token.epoch === epoch
        && generations.get(token.key) === token.generation
    },
  }
}

export function bundleMatchesRequest(bundle, investigationId, versionId = null) {
  if (!bundle || bundle.investigation_id !== investigationId || !bundle.version?.id) return false
  if (versionId && bundle.version.id !== versionId) return false
  return true
}

export function snapshotInputAtPosition(bundle, position) {
  if (position == null || position === '') return null
  const wanted = String(position)
  return bundle?.observation?.snapshot?.inputs?.find((input) => String(input.position) === wanted) ?? null
}

export function snapshotAssessment(bundle, assessmentId) {
  if (!assessmentId) return null
  return bundle?.observation?.snapshot?.assessments?.find((assessment) => assessment.id === assessmentId) ?? null
}

export function canRevealPrivateRecords(status) {
  return status === WORKSPACE_STATUS.ready || status === WORKSPACE_STATUS.loading
}

export function isAccessErrorCode(code) {
  return code === 'authentication_required' || code === 'access_denied'
}

export function mergeCatalogItems(existing, incoming) {
  const seen = new Set((existing ?? []).map((item) => item.investigation_id))
  const next = (existing ?? []).slice()
  for (const item of incoming ?? []) {
    if (!item?.investigation_id || seen.has(item.investigation_id)) continue
    seen.add(item.investigation_id)
    next.push(item)
  }
  return next
}

export function workspaceErrorCode(error) {
  return error?.code ?? null
}

export function statusFromSession({ sessionLoading, userId, state }) {
  if (sessionLoading) return WORKSPACE_STATUS.session_loading
  if (!userId) return WORKSPACE_STATUS.signed_out
  const code = state?.bundleError ?? state?.catalogError
  if (code === 'authentication_required') return WORKSPACE_STATUS.authentication_required
  if (code === 'access_denied' && state?.selectedInvestigationId) return WORKSPACE_STATUS.access_denied
  if (code === 'unsupported_contract') return WORKSPACE_STATUS.unsupported_contract
  if (state?.loadingCatalog || state?.loadingBundle) return WORKSPACE_STATUS.loading
  if (code && code !== 'access_denied') return WORKSPACE_STATUS.unavailable
  if (!state?.catalog?.length) return WORKSPACE_STATUS.empty
  if (state?.selectedInvestigationId && !state?.panels && !state?.loadingBundle) {
    if (code === 'access_denied') return WORKSPACE_STATUS.access_denied
    if (!state?.bundle && !state?.bundleError) return WORKSPACE_STATUS.loading
  }
  return WORKSPACE_STATUS.ready
}

export function unavailableCopy(code) {
  // Origin allowlists, contract names, and fixture policy live in the frontend
  // integration note. This copy only describes the signed-in user's next step.
  if (code === 'origin_denied') {
    return 'This browser origin is not allowed to read private investigations.'
  }
  if (code === 'not_configured') {
    return 'Private investigations are not available in this session.'
  }
  if (code === 'service_unavailable' || code === 'request_failed') {
    return 'Private investigation records are unavailable right now. Retry the same request.'
  }
  if (code === 'invalid_request') {
    return 'The investigation request was rejected as invalid.'
  }
  return 'Private investigation records are unavailable.'
}

export function captureReviewPayload({ investigationId, versionId, previousReceiptId, receiptId }) {
  if (!investigationId || !versionId || !receiptId) return null
  return Object.freeze({
    investigationId,
    versionId,
    receiptId,
    previousReceiptId: previousReceiptId ?? null,
  })
}

export function workspaceReviewReceiptMatches(payload, receipt) {
  return Boolean(payload && receipt
    && receipt.id === payload.receiptId
    && receipt.investigation_id === payload.investigationId
    && receipt.version_id === payload.versionId
    && receipt.previous_receipt_id === payload.previousReceiptId
    && typeof receipt.recorded_at === 'string'
    && Number.isFinite(Date.parse(receipt.recorded_at)))
}

export function panelsFromBundle(bundle) {
  if (!bundle) return null
  const panels = investigationWorkspacePanels(bundle)
  if (!panels) return { error: 'unsupported_contract' }
  return { panels }
}

export function isCurrentSavedVersion(bundle) {
  if (!bundle?.version?.id || !bundle.head_version_id) return false
  return bundle.version.id === bundle.head_version_id
}

export function revisionLabel(bundle) {
  const revision = bundle?.version?.revision
  if (revision == null) return 'Saved version not recorded'
  const current = isCurrentSavedVersion(bundle)
  return current
    ? `Revision ${revision} · current saved version`
    : `Revision ${revision} · historical saved version`
}

export function newerCollectionNote(bundle) {
  if (!bundle) return null
  if (isCurrentSavedVersion(bundle)) {
    return 'This is the current saved version. Newer collection may still exist outside this saved version.'
  }
  return 'A newer saved version exists. This historical view does not mark it reviewed.'
}

export function privateInvestigationHeader({ status, panels, bundle, userId } = {}) {
  if (status === WORKSPACE_STATUS.session_loading) {
    return Object.freeze({
      eyebrow: 'Private investigations',
      title: 'Checking your session',
      location: 'Assigned questions stay off the public graph',
      when: 'Time not recorded',
      description: 'Private investigation records are requested only after the session is known.',
      dimensions: privateHeaderDimensions(null, status),
    })
  }
  if (status === WORKSPACE_STATUS.signed_out || status === WORKSPACE_STATUS.authentication_required || !userId) {
    return Object.freeze({
      eyebrow: 'Private investigations',
      title: 'Private assigned investigations',
      location: 'Assigned questions stay off the public graph',
      when: 'Time not recorded',
      description: 'Private investigations are available after you sign in. Signing in does not create an assignment.',
      dimensions: privateHeaderDimensions(null, status),
    })
  }
  if (!panels) {
    return Object.freeze({
      eyebrow: 'Private investigations',
      title: 'Private assigned investigations',
      location: 'Assigned questions stay off the public graph',
      when: bundle?.version?.recorded_at ? formatWorkspaceDate(bundle.version.recorded_at) : 'Time not recorded',
      description: 'Only investigations with an explicit assignment appear here. No sample question is invented.',
      dimensions: privateHeaderDimensions(bundle, status),
    })
  }
  return Object.freeze({
    eyebrow: 'Private investigation',
    title: panels.question,
    location: 'Assigned investigation — separate from the public graph subject',
    when: formatWorkspaceDate(bundle?.version?.recorded_at),
    description: panels.scopeNote,
    dimensions: privateHeaderDimensions(bundle, status, panels),
  })
}

function privateHeaderDimensions(bundle, status, panels) {
  const review = bundle?.review
  const role = bundle?.access_role
  return Object.freeze([
    {
      key: 'revision',
      label: 'Saved version',
      value: bundle ? revisionLabel(bundle) : 'Not loaded',
      tone: bundle ? 'value' : 'unavailable',
    },
    {
      key: 'observed',
      label: 'Observation saved',
      value: bundle?.version?.recorded_at ? formatWorkspaceDate(bundle.version.recorded_at) : 'Not recorded',
      tone: bundle?.version?.recorded_at ? 'value' : 'unavailable',
    },
    {
      key: 'review',
      label: 'Review baseline',
      value: review?.version_id
        ? `Marked reviewed · ${formatWorkspaceDate(review.recorded_at)}`
        : 'Not marked reviewed',
      tone: review ? 'value' : 'unavailable',
    },
    {
      key: 'access',
      label: 'Access',
      value: role === 'reviewer' ? 'Reviewer' : role === 'viewer' ? 'Viewer' : 'Not assigned in this view',
      tone: role ? 'value' : 'unavailable',
    },
    {
      key: 'publication',
      label: 'Publication',
      value: panels ? 'Private analyst record' : status === WORKSPACE_STATUS.empty ? 'No assignment' : 'Private',
      tone: 'unavailable',
    },
  ])
}

export function evidenceChangeLabel(kind) {
  return EVIDENCE_CHANGE_COPY[kind] ?? 'Recorded observation change. No additional meaning is inferred.'
}

export function definitionChangeSummary(definitionChanges) {
  if (!definitionChanges) return []
  const rows = []
  for (const group of ['hypotheses', 'commitments', 'coverage']) {
    const set = definitionChanges[group]
    if (!set) continue
    for (const id of set.added ?? []) rows.push({ group, action: 'added', id })
    for (const id of set.removed ?? []) rows.push({ group, action: 'removed', id })
    for (const id of set.updated ?? []) rows.push({ group, action: 'updated', id })
  }
  if (definitionChanges.question_changed) rows.push({ group: 'question', action: 'updated', id: null })
  if (definitionChanges.scope_changed) rows.push({ group: 'scope', action: 'updated', id: null })
  if (definitionChanges.unresolved_questions_changed) {
    rows.push({ group: 'unresolved_questions', action: 'updated', id: null })
  }
  return rows
}

export function stageDepths(stages) {
  const byId = new Map((stages ?? []).map((stage) => [stage.id, stage]))
  const memo = new Map()
  const visiting = new Set()
  const depthOf = (id) => {
    if (memo.has(id)) return memo.get(id)
    if (visiting.has(id)) return 0
    visiting.add(id)
    const stage = byId.get(id)
    const parents = stage?.depends_on ?? []
    const depth = parents.length === 0 ? 0 : Math.max(0, ...parents.map(depthOf)) + 1
    visiting.delete(id)
    memo.set(id, depth)
    return depth
  }
  return (stages ?? []).map((stage) => ({ ...stage, depth: depthOf(stage.id) }))
}

export function timeRangeCopy(timeRange) {
  if (!timeRange) return 'Source/event time range is not recorded. This is not a historical database reconstruction.'
  const from = timeRange.from ? formatWorkspaceDate(timeRange.from) : 'unknown start'
  const to = timeRange.to ? formatWorkspaceDate(timeRange.to) : 'unknown end'
  return `Source/event context ${from} – ${to}. ${timeRange.meaning ?? ''} This range is not a historical database as-of time.`
}

export function assessmentOutcomeCopy(outcome) {
  if (!outcome) return 'No recorded outcome.'
  return `Recorded outcome: ${outcome}. This is the saved assessment, not an overall answer or numeric confidence.`
}

export function citationUnavailableCopy() {
  return 'This citation is unavailable in the retained observation. Another similarly named source is not substituted.'
}

export function publicGraphUnavailableCopy() {
  return 'Public graph view is unavailable for this private question. The private question is unchanged. No private node is added to Graph or World View.'
}

export function snapshotCoverageCopy(snapshotCoverage) {
  if (snapshotCoverage === 'complete_for_explicit_scope') {
    return 'Observation coverage is complete for the explicit saved candidate scope and its retained dependencies. That is not real-world collection completeness.'
  }
  return 'Observation coverage is recorded as stated. It is not global media coverage.'
}

export const LINEAGE_REASON_COPY = Object.freeze({
  same_saved_article: 'Both retained captures name the same saved article. Related captures are not necessarily syndication.',
  same_retained_url: 'Both retained captures store the same URL. A shared URL is not proof of syndication or of independent outlets.',
  identical_retained_text: 'The selected retained text is exactly equal across at least 80 characters. Exact repeated text may be boilerplate or a common quotation.',
})

export const CHALLENGE_CUE_COPY = Object.freeze({
  correction_language: 'Correction language appears in this retained field. The word match needs contextual review. It is not a contradiction, retraction verdict, confidence change, or changed commitment outcome.',
  withdrawal_language: 'Withdrawal or retraction language appears in this retained field. The word match needs contextual review. It is not a contradiction, retraction verdict, confidence change, or changed commitment outcome.',
  recorded_source_status: 'This retained article record version records a source-status notice. That notice is not a live source lookup, a contradiction, or a changed commitment outcome.',
})

export function lineageReasonCopy(reason) {
  return LINEAGE_REASON_COPY[reason] ?? 'This pair was proposed as a possible source relationship. Independence stays unknown.'
}

export function challengeCueCopy(kind) {
  return CHALLENGE_CUE_COPY[kind] ?? 'This cue needs contextual review. It is not a verdict.'
}

export function checksUnavailableCopy(code) {
  if (code === 'origin_denied') {
    return 'This browser origin is not allowed to read private evidence checks.'
  }
  if (code === 'not_configured') {
    return 'Private evidence checks are not available in this session.'
  }
  if (code === 'service_unavailable' || code === 'request_failed') {
    return 'Private evidence checks are unavailable right now. Retry the same request.'
  }
  if (code === 'invalid_request') {
    return 'The evidence-check request was rejected as invalid.'
  }
  if (code === 'version_conflict') {
    return 'The evidence-check request conflicted with another write. The investigation was not marked reviewed. Retry only as an explicit action.'
  }
  if (code === 'unsupported_contract') {
    return 'This evidence-check response could not be used. Field mappings are not guessed.'
  }
  if (code === 'identity_mismatch') {
    return 'This evidence-check response did not match the displayed investigation version. It was not applied. Retry the same request.'
  }
  return 'Private evidence checks are unavailable.'
}

export function snapshotInputPayload(input) {
  return input?.capture?.payload ?? input?.record_version?.payload ?? null
}

export function resolveWorkspaceMetadata(bundle, reference) {
  if (!reference || reference.source_field !== 'source_status' || reference.value == null) return null
  const input = snapshotInputAtPosition(bundle, reference.position)
  const payload = input?.record_version?.payload
  if (!payload || payload.source_status !== reference.value) return null
  const kind = input.record_version?.record_kind
  if (kind && kind !== 'article') return null
  return { input, value: payload.source_status, recordVersionId: input.record_version?.id ?? null }
}

export function safeWorkspaceHttpUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null
  if (!/^https?:\/\//i.test(raw) || /[\s\\]/.test(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}
