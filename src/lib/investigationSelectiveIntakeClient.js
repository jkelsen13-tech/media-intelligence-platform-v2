// Native private SDK adapter. Session is supplied by the existing installed SDK on each call.
// Expected-user metadata is an account-race guard, never actor authority.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const schemas = {
  read: [['investigation_id', 'candidate_id'], ['after_receipt_id', 'limit']], receipt: [['investigation_id', 'receipt_id'], []],
  declare: [['investigation_id', 'version_id', 'receipt_id', 'previous_receipt_id', 'declaration'], []],
  reconsider: [['investigation_id', 'version_id', 'receipt_id', 'previous_receipt_id', 'declaration_receipt_id', 'request'], []],
}
const failure = code => ({ data: null, error: { code } })
function copyPlain(value, depth = 0) {
  if (depth > 14) throw new Error()
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value
  if (!value || typeof value !== 'object' || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw new Error()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(descriptors).some(k => typeof k !== 'string' || (k !== 'length' && (!Object.hasOwn(descriptors[k], 'value') || !descriptors[k].enumerable)))) throw new Error()
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new Error()
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)]; if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error()
      return copyPlain(descriptor.value, depth + 1)
    })
  }
  return Object.fromEntries(Object.entries(descriptors).map(([k, d]) => [k, copyPlain(d.value, depth + 1)]))
}
function validReceipt(row, investigationId, candidateId = null) {
  return row && row.contract_version === 'private-investigation-selective-intake-1' && row.scope === 'assigned_investigation' && row.publicly_eligible === false
    && row.investigation_id === investigationId && (!candidateId || row.candidate_id === candidateId)
    && ['receipt_id', 'actor_id', 'candidate_id', 'capture_id', 'observation_id', 'version_id'].every(key => typeof row[key] === 'string' && UUID.test(row[key]))
    && typeof row.input_position === 'string' && /^[1-9][0-9]{0,18}$/.test(row.input_position)
    && row.persisted === true && row.analysis_execution === 'none' && row.rights_admission === 'not_established'
    && ['declare', 'reconsider'].includes(row.kind) && ['analyze_now', 'retain_deferred', 'skip_for_now'].includes(row.disposition)
    && row.result?.disposition === row.disposition && row.result?.persisted === false && row.result?.publicly_eligible === false
    && row.result?.provenance === 'caller_self_assertion' && row.result?.rights_admission === 'not_established' && row.result?.execution === 'none'
}
export function createInvestigationSelectiveIntakeClient(transport = null) {
  return Object.freeze(Object.fromEntries(Object.entries(schemas).map(([action, [required, optional]]) => [action, async (supplied, metadata = {}) => {
    if (!transport?.functions?.invoke) return failure('service_unavailable')
    let input, expected
    try {
      input = copyPlain(supplied); const options = copyPlain(metadata)
      if (!options || typeof options !== 'object' || Array.isArray(options) || !input || Array.isArray(input) || typeof input !== 'object' || required.some(k => !Object.hasOwn(input, k))
        || Object.keys(input).some(k => ![...required, ...optional].includes(k)) || Object.keys(options).some(k => k !== 'expectedUserId')) throw new Error()
      expected = options.expectedUserId ?? null
      if (expected !== null && (typeof expected !== 'string' || !UUID.test(expected))) throw new Error()
      if (new TextEncoder().encode(JSON.stringify({ action, input })).byteLength > 131072) throw new Error()
    } catch { return failure('invalid_request') }
    try {
      const response = await transport.functions.invoke('investigation-selective-intake', { body: { action, input },
        ...(expected ? { headers: { 'X-MIP-Expected-User': expected } } : {}) })
      if (response.error) {
        let error
        try { error = await response.error.context.clone().json() } catch { return failure('service_unavailable') }
        const code = error?.error?.code
        return failure(['access_denied', 'authentication_required', 'version_conflict', 'invalid_request'].includes(code) ? code : 'service_unavailable')
      }
      const body = response.data, data = body?.data
      if (!body || (expected && body.authenticated_user_id !== expected) || !data
        || data.contract_version !== 'private-investigation-selective-intake-1' || data.publicly_eligible !== false
        || data.investigation_id !== input.investigation_id
        || (action === 'read' && (data.candidate_id !== input.candidate_id || !Array.isArray(data.receipts)
          || data.receipts.some(row => !validReceipt(row, input.investigation_id, input.candidate_id))))
        || (action !== 'read' && !validReceipt(data, input.investigation_id))
        || (action === 'receipt' && data.receipt_id !== input.receipt_id)
        || (['declare', 'reconsider'].includes(action) && (data.receipt_id !== input.receipt_id || data.actor_id !== body.authenticated_user_id || data.version_id !== input.version_id || data.kind !== action
          || data.previous_receipt_id !== input.previous_receipt_id
          || (action === 'declare' && data.candidate_id !== input.declaration.candidate_id)
          || (action === 'reconsider' && data.declaration_receipt_id !== input.declaration_receipt_id)))) return failure('invalid_response')
      return { data, error: null }
    } catch { return failure('service_unavailable') }
  }])))
}
