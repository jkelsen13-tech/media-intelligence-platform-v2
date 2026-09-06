// Private assigned-user workspace API. No module-side requests or UI mounting.
// Supabase functions.invoke supplies the current session's Authorization token.
export const INVESTIGATION_EVIDENCE_REVIEWS_CONTRACT = 'investigation-evidence-reviews-1'
export function createInvestigationEvidenceReviewsClient(supabase) {
  async function call(action, input) {
    if (!supabase?.functions?.invoke) return { data: null, error: { code: 'not_configured' } }
    try {
      const result = await supabase.functions.invoke('investigation-evidence-reviews', { body: { action, input } })
      if (result.error) {
        let detail
        try { detail = await result.error.context?.json() } catch { /* no raw upstream error display */ }
        // The JWT gateway can reject a session before our handler runs.
        const code = result.error.context?.status === 401 ? 'authentication_required' : detail?.error?.code
        return { data: null, error: { code: ['authentication_required', 'access_denied', 'version_conflict', 'invalid_request', 'origin_denied', 'service_unavailable'].includes(code) ? code : 'request_failed' } }
      }
      return { data: result.data?.data ?? null, error: result.data?.error ?? null }
    } catch { return { data: null, error: { code: 'request_failed' } } }
  }
  const context = (investigationId, versionId, reportId) => ({ investigation_id: investigationId, version_id: versionId, report_id: reportId })
  return Object.freeze({
    read: (investigationId, versionId, reportId) => call('read', context(investigationId, versionId, reportId)),
    decide: input => call('decide', input),
    history: input => call('history', input),
  })
}

export const EVIDENCE_REVIEW_LABELS = Object.freeze({
  needs_review: 'Needs review', relevant: 'Retained for follow-up', not_relevant: 'Dismissed for this investigation', disputed: 'Disputed',
})
const revision = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,17})$/.test(value)
export function matchesInvestigationEvidenceReview(workspace, checks, reviews) {
  return workspace?.contract_version === 'investigation-workspace-1'
    && checks?.contract_version === 'investigation-evidence-checks-1' && checks.status === 'saved'
    && checks.investigation_id === workspace.investigation_id && checks.version_id === workspace.version?.id
    && checks.observation_id === workspace.observation?.id && checks.report?.id
    && checks.report.investigation_id === checks.investigation_id && checks.report.version_id === checks.version_id
    && reviews?.contract_version === INVESTIGATION_EVIDENCE_REVIEWS_CONTRACT
    && reviews.investigation_id === checks.investigation_id && reviews.version_id === checks.version_id
    && reviews.observation_id === checks.observation_id && reviews.report_id === checks.report.id
    && ['viewer', 'reviewer'].includes(reviews.access_role) && revision(reviews.revision)
    && reviews.publicly_eligible === false
}
export function investigationEvidenceReviewPanels(workspace, checks, reviews) {
  if (!matchesInvestigationEvidenceReview(workspace, checks, reviews) || reviews.mode !== 'overview'
    || !Array.isArray(reviews.targets) || reviews.targets.length > 400) return null
  const targets = new Map()
  for (const [kind, items] of [['source_link', checks.report.result?.lineage_candidates], ['evidence_cue', checks.report.result?.challenge_cues]]) {
    if (!Array.isArray(items)) return null
    for (const item of items) targets.set(kind + ':' + item.id, item)
  }
  if (targets.size !== reviews.targets.length) return null
  const seen = new Set()
  for (const item of reviews.targets) {
    const key = item.target_kind + ':' + item.target_id, event = item.latest_event
    if (!targets.has(key) || seen.has(key) || !Object.hasOwn(EVIDENCE_REVIEW_LABELS, item.decision)) return null
    if (event === null) { if (item.decision !== 'needs_review') return null }
    else if (!event || event.report_id !== reviews.report_id || event.target_kind !== item.target_kind || event.target_id !== item.target_id
      || event.decision !== item.decision || !revision(event.revision) || BigInt(event.revision) > BigInt(reviews.revision)) return null
    seen.add(key)
  }
  return { canDecide: reviews.access_role === 'reviewer', revision: reviews.revision, reportId: reviews.report_id,
    targets: reviews.targets, summary: reviews.summary, coverage: reviews.coverage,
    scope: 'returned_report_targets_only', independence: 'unknown', assessmentEffect: 'none' }
}
