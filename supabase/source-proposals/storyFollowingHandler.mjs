// NONDEPLOYED consumer boundary. Verified Auth and a service RPC client are injected.
// Public story content and private user preferences are separate contracts.
import { followingInput, isFollowingUuid } from '../../src/lib/storyFollowingClient.js'
const MAX_BYTES = 8192
async function requestJson(request) {
  if (!request.body) throw new Error()
  const reader = request.body.getReader(), chunks = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error() }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
export function createStoryFollowingHandler({ authenticate, rpc, allowedOrigins = [] } = {}) {
  if (typeof authenticate !== 'function' || typeof rpc !== 'function') throw new Error('unbound_story_following')
  const origins = new Set(allowedOrigins)
  return async request => {
    const origin = request.headers.get('origin'), headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
      Vary: 'Origin, Authorization, X-MIP-Expected-User', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-mip-expected-user' }
    if (origin && origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
    if (origin && !origins.has(origin)) return reply(403, { error: { code: 'origin_denied' } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: { code: 'method_not_allowed' } })
    const authorization = request.headers.get('authorization') ?? ''
    const expected = request.headers.get('x-mip-expected-user')
    if (!/^Bearer \S+$/i.test(authorization) || !isFollowingUuid(expected)) return reply(401, { error: { code: 'authentication_required' } })
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(400, { error: { code: 'invalid_request' } })
    let body, input
    try {
      body = await requestJson(request)
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['action', 'input'].includes(k))) throw new Error()
      input = followingInput(body.action, body.input ?? {})
      if (!input) throw new Error()
    } catch { return reply(400, { error: { code: 'invalid_request' } }) }
    try {
      // authenticate must use verified Auth, not a JWT decode or user-supplied profile.
      const user = await authenticate(authorization)
      if (!isFollowingUuid(user?.id) || user.is_anonymous === true || user.id !== expected) return reply(401, { error: { code: 'authentication_required' } })
      const result = await rpc(body.action, { ...input, user_id: user.id })
      if (result?.data?.error_code === 'access_denied') return reply(403, { error: { code: 'access_denied' } })
      if (result?.error) {
        const code = result.error.code
        if (code === '42501') return reply(403, { error: { code: 'access_denied' } })
        if (['40001', '23505'].includes(code)) return reply(409, { error: { code: 'version_conflict' } })
        if (['22023', '22P02', '22007', '22008'].includes(code)) return reply(400, { error: { code: 'invalid_request' } })
        return reply(503, { error: { code: 'service_unavailable' } })
      }
      if (!result?.data || typeof result.data !== 'object') return reply(503, { error: { code: 'service_unavailable' } })
      return reply(200, { data: { ...result.data, authenticated_user_id: user.id,
        ...(body.action === 'list' ? { items: result.data.items.map(item => ({ ...item, authenticated_user_id: user.id })) } : {}) } })
    } catch { return reply(503, { error: { code: 'service_unavailable' } }) }
  }
}
