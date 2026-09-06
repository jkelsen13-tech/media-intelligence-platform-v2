// Private assigned-user workspace API. No module-side requests or UI mounting.
// Supabase functions.invoke supplies the current session's Authorization token.
export const INVESTIGATION_WORKSPACE_CONTRACT = 'investigation-workspace-1'
export function createInvestigationWorkspaceClient(supabase) {
  async function call(action, input) {
    if (!supabase?.functions?.invoke) return { data: null, error: { code: 'not_configured' } }
    try {
      const result = await supabase.functions.invoke('investigation-workspace', { body: { action, input } })
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
    list: (input = {}) => call('list', input),
    read: (investigationId, versionId) => call('read', { investigation_id: investigationId, ...(versionId ? { version_id: versionId } : {}) }),
    markReviewed: ({ investigationId, versionId, receiptId, previousReceiptId }) => call('mark_review', {
      investigation_id: investigationId, version_id: versionId, receipt_id: receiptId, previous_receipt_id: previousReceiptId ?? null,
    }),
  })
}

// Pure section mapping: no inferred confidence, truth, causality or independence.
export function investigationWorkspacePanels(bundle) {
  if (bundle?.contract_version !== INVESTIGATION_WORKSPACE_CONTRACT || !bundle.version?.state || !bundle.observation?.snapshot) return null
  const state = bundle.version.state, snapshot = bundle.observation.snapshot
  return {
    investigationId: bundle.investigation_id, versionId: bundle.version.id, headVersionId: bundle.head_version_id,
    question: state.question, scopeNote: state.scope_note, canonicalSubject: state.canonical_subject, timeRange: state.time_range,
    unresolvedQuestions: state.unresolved_questions,
    assessments: snapshot.assessments.filter(a => snapshot.selected_assessment_ids.includes(a.id)),
    hypotheses: state.hypotheses, commitments: state.commitments, coverage: state.coverage,
    inputs: snapshot.inputs, comparison: bundle.comparison, review: bundle.review,
    canMarkReviewed: bundle.access_role === 'reviewer', publiclyEligible: false,
  }
}

// Raw excerpts use Unicode code-point offsets, matching PostgreSQL substring.
export function resolveWorkspaceExcerpt(bundle, reference) {
  const input = bundle?.observation?.snapshot?.inputs?.find(i => i.position === reference?.position)
  const payload = input?.capture?.payload ?? input?.record_version?.payload
  const raw = payload?.[reference?.source_field]
  if (typeof raw !== 'string' || !Number.isInteger(reference.span_start) || !Number.isInteger(reference.span_end)) return null
  const points = Array.from(raw)
  if (reference.span_start < 0 || reference.span_end <= reference.span_start || reference.span_end > points.length) return null
  const excerpt = points.slice(reference.span_start, reference.span_end).join('')
  if (excerpt !== reference.excerpt) return null
  return { input, raw, excerpt, before: points.slice(0, reference.span_start).join(''), after: points.slice(reference.span_end).join('') }
}
