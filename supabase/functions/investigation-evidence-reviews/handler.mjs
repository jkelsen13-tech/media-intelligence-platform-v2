// Authenticated transport only. Identity comes from Auth, never request JSON.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_REQUEST_BYTES = 65536
const common = ['investigation_id', 'version_id', 'report_id']
const allowedKeys = {
  read: common,
  history: [...common, 'target_kind', 'target_id', 'at_revision', 'before_revision'],
  decide: [...common, 'target_kind', 'target_id', 'event_id', 'previous_event_id', 'decision', 'rationale', 'evidence'],
}
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const uuid = v => typeof v === 'string' && UUID.test(v)
const revision = v => typeof v === 'string' && /^(0|[1-9][0-9]{0,17})$/.test(v)
function validate(body) {
  if (!object(body) || Object.keys(body).some(k => !['action', 'input'].includes(k)) || !Object.hasOwn(allowedKeys, body.action)) return false
  const input = body.input
  if (!object(input)) return false
  const required = allowedKeys[body.action]
  if (required.some(k => !Object.hasOwn(input, k)) || Object.keys(input).some(k => !required.includes(k))) return false
  if (common.some(k => !uuid(input[k]))) return false
  if (body.action !== 'read' && (!['source_link', 'evidence_cue'].includes(input.target_kind)
    || typeof input.target_id !== 'string' || !input.target_id.trim() || input.target_id.length > 200)) return false
  if (body.action === 'history') return revision(input.at_revision) && (input.before_revision === null || revision(input.before_revision))
  if (body.action === 'decide') return uuid(input.event_id) && (input.previous_event_id === null || uuid(input.previous_event_id))
    && ['relevant', 'not_relevant', 'disputed', 'needs_review'].includes(input.decision)
    && typeof input.rationale === 'string' && input.rationale.trim().length > 0 && Array.from(input.rationale.trim()).length <= 2000
    && Array.isArray(input.evidence) && input.evidence.length >= 1 && input.evidence.length <= 8
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
export function createEvidenceReviewsHandler({ authenticate, rpc, allowedOrigins = ['https://jkelsen13-tech.github.io'] }) {
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

// Fetch-only adapter keeps deployment dependency-free. URLs come exclusively
// from the function's environment. The service credential never goes to Auth.
export function createEvidenceReviewsTransport({ url, anonKey, serviceKey, fetchImpl = fetch }) {
  const base = new URL(url)
  if (base.protocol !== 'https:' || base.hostname !== 'qikvmopbtijoebdqosyq.supabase.co' || base.pathname !== '/' || base.search || base.hash
    || base.username || base.password || !anonKey || !serviceKey) throw new Error('invalid_server_configuration')
  const origin = base.origin
  const request = (path, options) => fetchImpl(origin + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) })
  return {
    async authenticate(authorization) {
      const r = await request('/auth/v1/user', { headers: { apikey: anonKey, Authorization: authorization } })
      if (r.status === 401 || r.status === 403) return null
      if (!r.ok) throw new Error('auth_unavailable')
      return r.json()
    },
    async rpc(action, input) {
      const r = await request('/rest/v1/rpc/mip_investigation_evidence_reviews_v1', {
        method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_action: action, p_input: input }),
      })
      const data = await r.json()
      return r.ok ? { data } : { error: data }
    },
  }
}
