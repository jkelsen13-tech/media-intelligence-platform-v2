const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)

// Links come from the retained version and verified membership read. Never
// derive a version ID from a revision number, date, or catalog snapshot.
export function savedVersionNavigation(bundle) {
  const version = bundle?.version
  if (bundle?.contract_version !== 'investigation-workspace-1' || bundle.publicly_eligible !== false
    || !uuid(bundle.investigation_id) || !uuid(version?.id) || !uuid(bundle.head_version_id)
    || version.investigation_id !== bundle.investigation_id || !uuid(bundle.observation?.id)
    || version.observation_id !== bundle.observation.id || !Number.isSafeInteger(version.revision) || version.revision < 1) return null
  const first = version.revision === 1 && version.predecessor_id === null
  const previous = version.revision > 1 && uuid(version.predecessor_id)
    && version.predecessor_id !== version.id && version.predecessor_id !== bundle.head_version_id ? version.predecessor_id : null
  const reviewed = uuid(bundle.review?.version_id) ? bundle.review.version_id : null
  return { investigationId: bundle.investigation_id, versionId: version.id, revision: version.revision,
    current: version.id === bundle.head_version_id, first, previous, reviewed,
    isReviewedVersion: reviewed === version.id, recordedAt: version.recorded_at, reason: version.change_reason }
}

export function versionNavigationBlocked(state = {}) {
  return Boolean(state.loadingBundle || state.reviewBusy || state.pendingReview || state.reviewsBusy || state.pendingReviewDecision
    || state.decisionSavedNeedsRefresh || state.checksBusy || state.pendingChecksRun)
}

/** Accept only an exact version reference; never infer from revision/date/title. */
export function normalizeSavedVersionReference(value) {
  if (typeof value !== 'string' || value.length > 80) return null
  const normalized = value.trim().toLowerCase()
  return uuid(normalized) ? normalized : null
}
