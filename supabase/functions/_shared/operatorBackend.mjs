// Server/operator composition only. Never import into src/ or expose this key to Vite.
export const PIPELINE_TARGET = 'https://qikvmopbtijoebdqosyq.supabase.co'

const CONTRACTS = Object.freeze({
  intake: ['mip_pipeline_v1', ['enqueue', 'claim', 'finish', 'fail', 'candidate', 'status', 'history', 'evidence']],
  changes: ['mip_evidence_changes_v1', ['status', 'input', 'reconcile', 'claim', 'finish', 'fail']],
  captureClaims: ['mip_evidence_change_claim_v1', ['claim']],
  retrieval: ['mip_capture_retrieval_v1', ['start', 'page', 'refresh', 'read', 'results', 'pair']],
  selectiveExecution: ['mip_selective_execution_v1', ['select', 'permit', 'capture', 'read', 'annotate', 'reconsider']],
  selectiveIntake: ['mip_investigation_selective_intake_v1', ['read', 'receipt', 'declare', 'reconsider']],
  assessments: ['mip_assessments_v1', ['context', 'append', 'read']],
  observations: ['mip_investigation_briefings_v1', ['observe', 'read']],
  workspace: ['mip_investigation_workspace_v1', ['read', 'put']],
})

export function createOperatorBackend({ url, key, fetchImpl = fetch }) {
  if (url?.replace(/\/$/, '') !== PIPELINE_TARGET) throw new Error('operator target must be the current MIP project')
  if (typeof key !== 'string' || !key.trim()) throw new Error('MIP_PIPELINE_SERVICE_KEY is required in the server environment')
  return Object.freeze(Object.fromEntries(Object.entries(CONTRACTS).map(([facet, [rpc, actions]]) => [facet, async (action, input = {}) => {
    if (!actions.includes(action)) throw new Error('unsupported operator action')
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('operator input must be an object')
    if (facet === 'captureClaims' && Object.keys(input).length) throw new Error('capture claim accepts no input fields')
    const payload = facet === 'captureClaims'
      ? { p_route: 'new_candidate_search', p_producer: 'capture' }
      : { p_action: action, p_input: input }
    let response
    try {
      response = await fetchImpl(`${PIPELINE_TARGET}/rest/v1/rpc/${rpc}`, {
        method: 'POST', redirect: 'error',
        // Opaque secret keys are not JWTs and must not be sent as bearer tokens.
        headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000),
      })
    } catch {
      throw Object.assign(new Error('operator request failed'), { code: 'network_error' })
    }
    let body
    try { body = await response.json() } catch {
      throw Object.assign(new Error('operator response unreadable'), { code: response.ok ? 'invalid_response' : `http_${response.status}` })
    }
    if (!response.ok) {
      const code = /^[a-zA-Z0-9_]{1,80}$/.test(body?.code ?? '') ? body.code : `http_${response.status}`
      throw Object.assign(new Error('operator operation failed'), { code })
    }
    return body
  }])))
}
