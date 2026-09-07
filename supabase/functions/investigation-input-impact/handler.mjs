import { retainedInputImpact, validPosition } from './impact.mjs'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const uuid = value => typeof value === 'string' && UUID.test(value)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))

async function bodyJson(request) {
  if (!request.body) throw new Error('invalid_request')
  const reader = request.body.getReader(), chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) { await reader.cancel(); throw new Error('request_too_large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

// Configuration is trusted server code, never request data. Both read-only
// projections share the exact same Auth, assignment, and version boundary.
export function createAuthorizedWorkspaceReadHandler({ authenticate, rpc, allowedOrigins = ['https://jkelsen13-tech.github.io'], inputKeys, validateInput, project }) {
  const origins = new Set(allowedOrigins)
  return async request => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Vary: 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' }
    if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers })
    const error = (status, code) => reply(status, { error: { code } })
    if (origin && !origins.has(origin)) return error(403, 'origin_denied')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return error(405, 'method_not_allowed')
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer \S+$/i.test(authorization)) return error(401, 'authentication_required')
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return error(415, 'json_required')
    let body
    try { body = await bodyJson(request) }
    catch (e) { return error(e.message === 'request_too_large' ? 413 : 400, e.message === 'request_too_large' ? e.message : 'invalid_request') }
    if (!exact(body, ['action', 'input']) || body.action !== 'read'
      || !exact(body.input, ['investigation_id', 'version_id', ...inputKeys])
      || !uuid(body.input.investigation_id) || !uuid(body.input.version_id) || !validateInput(body.input)) return error(400, 'invalid_request')
    try {
      const user = await authenticate(authorization)
      if (!uuid(user?.id) || user.is_anonymous === true) return error(401, 'authentication_required')
      // The existing SQL read checks current assignment and binds the version to
      // its investigation in one snapshot. No browser principal or record enters it.
      const { investigation_id, version_id } = body.input
      const result = await rpc('read', { investigation_id, version_id, user_id: user.id })
      if (result.error) return error(result.error.code === '42501' ? 403 : 503, result.error.code === '42501' ? 'access_denied' : 'service_unavailable')
      const bundle = result.data
      if (bundle?.investigation_id !== investigation_id || bundle.version?.id !== version_id
        || bundle.version?.investigation_id !== investigation_id || !uuid(bundle.observation?.id)
        || bundle.version?.observation_id !== bundle.observation.id
        || !['viewer', 'reviewer'].includes(bundle.access_role)) return error(503, 'service_unavailable')
      return reply(200, { data: project(bundle, body.input) })
    } catch (e) { return error(e.message === 'input_unavailable' ? 400 : 503, e.message === 'input_unavailable' ? 'input_unavailable' : 'service_unavailable') }
  }
}

export function createInputImpactHandler(options) {
  return createAuthorizedWorkspaceReadHandler({ ...options, inputKeys: ['position'],
    validateInput: input => validPosition(input.position), project: (bundle, input) => retainedInputImpact(bundle, input.position) })
}
