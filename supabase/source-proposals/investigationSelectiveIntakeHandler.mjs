// Source-bound private adapter: existing verified Auth and workspace RPC are injected by investigation-api.
// Request JSON cannot supply actors, trusted observations or computed declaration results.
import { declareSelectiveIntake, reconsiderSelectiveIntake } from '../../scripts/selectiveIntakeDeclaration.mjs'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const uuid = value => typeof value === 'string' && UUID.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const schemas = {
  read: [['investigation_id', 'candidate_id'], ['after_receipt_id', 'limit']],
  receipt: [['investigation_id', 'receipt_id'], []],
  declare: [['investigation_id', 'version_id', 'receipt_id', 'previous_receipt_id', 'declaration'], []],
  reconsider: [['investigation_id', 'version_id', 'receipt_id', 'previous_receipt_id', 'declaration_receipt_id', 'request'], []],
}
function valid(body) {
  if (!object(body) || Object.keys(body).some(k => !['action', 'input'].includes(k)) || !Object.hasOwn(schemas, body.action) || !object(body.input)) return false
  const [required, optional] = schemas[body.action], input = body.input
  if (required.some(k => !Object.hasOwn(input, k)) || Object.keys(input).some(k => ![...required, ...optional].includes(k))) return false
  return Object.entries(input).every(([key, value]) => ['declaration', 'request'].includes(key) ? object(value)
    : key === 'limit' ? Number.isInteger(value) && value >= 1 && value <= 50
    : ['previous_receipt_id', 'after_receipt_id'].includes(key) && value === null ? true : uuid(value))
}
async function boundedBody(request) {
  if (!request.body) throw new Error('invalid_request')
  const reader = request.body.getReader(), chunks = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > 131072) { await reader.cancel(); throw new Error('request_too_large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
const privateObservation = bundle => {
  if (bundle?.contract_version !== 'investigation-workspace-1' || bundle.publicly_eligible !== false || !bundle.observation) throw new Error('invalid_owner_response')
  // The native workspace observation is a table row; the outer owner establishes private eligibility.
  return { ...bundle.observation, publicly_eligible: false }
}
export function createSelectiveIntakeHandler({ authenticate, workspaceRpc, rpc, allowedOrigins = ['https://jkelsen13-tech.github.io'] }) {
  if ([authenticate, workspaceRpc, rpc].some(fn => typeof fn !== 'function')) throw new Error('selective_intake_owner_unbound')
  return async request => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-mip-expected-user' }
    if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
    if (origin && !allowedOrigins.includes(origin)) return reply(403, { error: { code: 'origin_denied' } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: { code: 'method_not_allowed' } })
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer \S+$/i.test(authorization)) return reply(401, { error: { code: 'authentication_required' } })
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(415, { error: { code: 'json_required' } })
    let body
    try { body = await boundedBody(request) } catch (error) { return reply(error.message === 'request_too_large' ? 413 : 400,
      { error: { code: error.message === 'request_too_large' ? 'request_too_large' : 'invalid_request' } }) }
    if (!valid(body)) return reply(400, { error: { code: 'invalid_request' } })
    const mapError = error => {
      if (error?.code === '42501') return reply(403, { error: { code: 'access_denied' } })
      if (['40001', '23505'].includes(error?.code)) return reply(409, { error: { code: 'version_conflict' } })
      if (['22023', '22P02', '22007', '22008', '22003', '23514'].includes(error?.code) || error instanceof TypeError) return reply(400, { error: { code: 'invalid_request' } })
      return reply(503, { error: { code: 'service_unavailable' } })
    }
    try {
      const user = await authenticate(authorization)
      const expected = request.headers.get('x-mip-expected-user')
      if (!user || !uuid(user.id) || user.is_anonymous === true || (expected !== null && (!uuid(expected) || expected !== user.id))) return reply(401, { error: { code: 'authentication_required' } })
      const input = body.input, actorInput = { ...input, user_id: user.id }
      const invoke = async (call, action, payload) => {
        const response = await call(action, payload)
        if (response?.error) throw response.error
        if (!response?.data) throw new Error('invalid_owner_response')
        return response.data
      }
      let result
      if (['read', 'receipt'].includes(body.action)) result = await invoke(rpc, body.action, actorInput)
      else {
        const current = await invoke(workspaceRpc, 'read', { user_id: user.id, investigation_id: input.investigation_id, version_id: input.version_id })
        if (current.access_role !== 'reviewer') throw { code: '42501' }
        const observation = privateObservation(current)
        let draft
        if (body.action === 'declare') draft = declareSelectiveIntake(observation, input.declaration)
        else {
          const original = await invoke(rpc, 'receipt', { user_id: user.id, investigation_id: input.investigation_id, receipt_id: input.declaration_receipt_id })
          if (original.kind !== 'declare') throw new TypeError('invalid declaration receipt')
          const baseline = await invoke(workspaceRpc, 'read', { user_id: user.id, investigation_id: input.investigation_id, version_id: original.version_id })
          draft = reconsiderSelectiveIntake(original.result, privateObservation(baseline), observation, input.request)
        }
        result = await invoke(rpc, body.action, { user_id: user.id, investigation_id: input.investigation_id, version_id: input.version_id,
          receipt_id: input.receipt_id, previous_receipt_id: input.previous_receipt_id, result: draft,
          ...(body.action === 'reconsider' ? { declaration_receipt_id: input.declaration_receipt_id } : {}) })
      }
      return reply(200, { data: result, authenticated_user_id: user.id })
    } catch (error) { return mapError(error) }
  }
}
