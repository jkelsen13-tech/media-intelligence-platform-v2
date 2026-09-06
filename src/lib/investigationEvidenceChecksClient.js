// Private assigned-user workspace API. No module-side requests or UI mounting.
// Supabase functions.invoke supplies the current session's Authorization token.
export const INVESTIGATION_EVIDENCE_CHECKS_CONTRACT = 'investigation-evidence-checks-1'
export function createInvestigationEvidenceChecksClient(supabase) {
  async function call(action, input) {
    if (!supabase?.functions?.invoke) return { data: null, error: { code: 'not_configured' } }
    try {
      const result = await supabase.functions.invoke('investigation-evidence-checks', { body: { action, input } })
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
  return Object.freeze({
    read: (investigationId, versionId) => call('read', { investigation_id: investigationId, version_id: versionId }),
    run: (investigationId, versionId) => call('run', { investigation_id: investigationId, version_id: versionId }),
  })
}

// Reject mismatched responses before any section or inspector can consume them.
export function investigationEvidenceCheckPanels(workspace, checks) {
  if (workspace?.contract_version !== 'investigation-workspace-1'
    || checks?.contract_version !== INVESTIGATION_EVIDENCE_CHECKS_CONTRACT
    || checks.investigation_id !== workspace.investigation_id
    || checks.version_id !== workspace.version?.id
    || checks.observation_id !== workspace.observation?.id) return null
  if (checks.status === 'not_run' && checks.report === null) return {
    status: 'not_run', canRun: checks.access_role === 'reviewer', lineage: [], challenges: [], coverage: null,
  }
  const report = checks.report, result = report?.result
  if (checks.status !== 'saved' || report?.version_id !== checks.version_id
    || report?.investigation_id !== checks.investigation_id
    || result?.contract_version !== INVESTIGATION_EVIDENCE_CHECKS_CONTRACT) return null
  return { status: 'saved', canRun: false, reportId: report.id, recordedAt: report.recorded_at,
    completion: result.completion, lineage: result.lineage_candidates, challenges: result.challenge_cues,
    coverage: result.coverage, limitations: result.limitations, limits: result.limits }
}
