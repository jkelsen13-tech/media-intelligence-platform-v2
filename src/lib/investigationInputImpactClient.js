// This browser adapter does not import or recompute the server projection.
export function createInvestigationInputImpactClient(supabase) {
  return { read: (investigationId, versionId, position) => readPrivateInvestigationFunction(supabase, 'investigation-input-impact', { investigation_id: investigationId, version_id: versionId, position }) }
}

export async function readPrivateInvestigationFunction(supabase, functionName, input) {
    if (!supabase?.functions?.invoke) return { error: { code: 'not_configured' }, data: null }
    try {
      const result = await supabase.functions.invoke(functionName, {
        body: { action: 'read', input },
      })
      if (result.error) {
        let detail
        try { detail = await result.error.context?.json() } catch { /* no raw errors */ }
        const status = result.error.context?.status
        const code = status === 401 ? 'authentication_required' : status === 403 && detail?.error?.code !== 'origin_denied' ? 'access_denied' : detail?.error?.code
        return { data: null, error: { code: ['authentication_required', 'access_denied', 'origin_denied', 'input_unavailable', 'service_unavailable'].includes(code) ? code : 'request_failed' } }
      }
      return { data: result.data?.data ?? null, error: result.data?.error ?? null }
    } catch { return { data: null, error: { code: 'request_failed' } } }
}

const uniqueArray = (value, max) => Array.isArray(value) && value.length <= max && new Set(value).size === value.length
const indicesMatch = (indices, evidence, position) => uniqueArray(indices, 32)
  && indices.every(i => Number.isInteger(i) && i >= 0 && evidence?.[i]?.position === position)

export function inputImpactMatches(bundle, position, data) {
  if (!bundle || !data || data.contract_version !== 'investigation-input-impact-1'
    || data.investigation_id !== bundle.investigation_id || data.version_id !== bundle.version?.id
    || data.observation_id !== bundle.observation?.id || data.position !== position
    || data.publicly_eligible !== false || data.assessment_effect !== 'none' || data.scope !== 'saved_references_only') return false
  const snapshot = bundle.observation.snapshot, state = bundle.version.state
  if (!snapshot.inputs.some(input => input.position === position)
    || !uniqueArray(data.context_assessment_ids, 512) || !uniqueArray(data.unknown_context_assessment_ids, 512)
    || !Array.isArray(data.hypotheses) || data.hypotheses.length > 20
    || !Array.isArray(data.stages) || data.stages.length > 600) return false
  const assessments = new Map(snapshot.assessments.map(row => [row.id, row]))
  if (!data.context_assessment_ids.every(id => snapshot.selected_assessment_ids.includes(id) && assessments.get(id)?.context_positions?.includes(position))
    || !data.unknown_context_assessment_ids.every(id => snapshot.selected_assessment_ids.includes(id) && !Array.isArray(assessments.get(id)?.context_positions))) return false
  const hypothesisIds = new Set(), stageIds = new Set()
  for (const row of data.hypotheses) {
    const h = state.hypotheses.find(h => h.id === row?.id)
    if (!h || hypothesisIds.has(row.id) || !indicesMatch(row.citation_indices, h.evidence, position)
      || !uniqueArray(row.assessment_ids, 32) || !row.assessment_ids.every(id => h.assessment_ids.includes(id) && data.context_assessment_ids.includes(id))
      || (!row.citation_indices.length && !row.assessment_ids.length)) return false
    hypothesisIds.add(row.id)
  }
  for (const row of data.stages) {
    const c = state.commitments.find(c => c.id === row?.commitment_id), s = c?.stages.find(s => s.id === row.id)
    const key = `${row?.commitment_id}:${row?.id}`
    if (!s || stageIds.has(key) || !indicesMatch(row.citation_indices, s.evidence, position) || !row.citation_indices.length) return false
    stageIds.add(key)
  }
  return true
}
