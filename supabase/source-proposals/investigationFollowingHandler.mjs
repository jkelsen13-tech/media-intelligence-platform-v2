// NONDEPLOYED: private consumer boundary; existing Auth and RPC owners must be explicitly injected.
// No credential, endpoint, transport or gateway route is provided.
// Authenticated transport only. Identity comes from Auth, never request JSON.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_REQUEST_BYTES = 8192
const allowedKeys = {
  list: [[], ['after', 'limit']],
  read: [['investigation_id'], ['limit']],
  subscribe: [['investigation_id','event_id','previous_event_id','version_id','subject_id'], []],
  acknowledge: [['investigation_id','event_id','previous_event_id','version_id','subject_id'], []],
  unsubscribe: [['investigation_id','event_id','previous_event_id'], []],
}
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const uuid = v => typeof v === 'string' && UUID.test(v)
function validate(body) {
  if (!object(body) || Object.keys(body).some(k => !['action', 'input'].includes(k)) || !Object.hasOwn(allowedKeys, body.action)) return false
  const input = body.input === undefined ? {} : body.input
  if (!object(input)) return false
  const [required, optional] = allowedKeys[body.action]
  if (required.some(k => !Object.hasOwn(input, k)) || Object.keys(input).some(k => ![...required, ...optional].includes(k))) return false
  for (const [k, v] of Object.entries(input)) {
    if (k === 'limit') { if (!Number.isInteger(v) || v < 1 || v > 50) return false }
    else if (['after', 'previous_event_id'].includes(k) && v === null) continue
    else if (!uuid(v)) return false
  }
  return true
}
async function boundedJson(request) {
  if (!request.body) throw new Error('invalid_request')
  const reader = request.body.getReader(); const chunks = []; let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break
      bytes += value.byteLength
      if (bytes > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error('request_too_large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const data = new Uint8Array(bytes); let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
}
export function createFollowingHandler({ authenticate, rpc, allowedOrigins = [] }) {
  if (typeof authenticate !== 'function' || typeof rpc !== 'function') throw new Error('unbound_following_handler')
  const origins = new Set(allowedOrigins)
  return async request => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' }
    if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
    if (origin && !origins.has(origin)) return reply(403, { error: { code: 'origin_denied' } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: { code: 'method_not_allowed' } })
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer \S+$/i.test(authorization)) return reply(401, { error: { code: 'authentication_required' } })
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(415, { error: { code: 'json_required' } })
    let body
    try { body = await boundedJson(request) }
    catch (e) { return reply(e.message === 'request_too_large' ? 413 : 400, { error: { code: e.message === 'request_too_large' ? 'request_too_large' : 'invalid_request' } }) }
    if (!validate(body)) return reply(400, { error: { code: 'invalid_request' } })
    try {
      const user = await authenticate(authorization)
      if (!user || !uuid(user.id) || user.is_anonymous === true) return reply(401, { error: { code: 'authentication_required' } })
      // Explicit input allowlist above forbids user_id, roles and administrative actions.
      const result = await rpc(body.action, { ...(body.input ?? {}), user_id: user.id })
      if (result.error) {
        const code = result.error.code
        if (code === '42501') return reply(403, { error: { code: 'access_denied' } })
        if (['40001', '23505'].includes(code)) return reply(409, { error: { code: 'version_conflict' } })
        if (['22023', '22P02', '22007', '22008'].includes(code)) return reply(400, { error: { code: 'invalid_request' } })
        return reply(503, { error: { code: 'service_unavailable' } })
      }
      return reply(200, { data: result.data })
    } catch { return reply(503, { error: { code: 'service_unavailable' } }) }
  }
}
