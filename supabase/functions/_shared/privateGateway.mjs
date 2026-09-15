// User-only Edge boundary. Deliberately no data adapter or activation flag.
export const PAGES_ORIGIN = 'https://jkelsen13-tech.github.io'
const AUTH_ORIGIN = 'https://qikvmopbtijoebdqosyq.supabase.co'
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k))
const jsonType = value => /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value ?? '')
const fail = code => { throw new Error(code) }

// Entire read, including slow/chunked bodies, shares the request deadline.
async function readJson(stream, maximum, signal) {
  if (!stream) fail('invalid_request')
  const reader = stream.getReader(), chunks = []
  let size = 0
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    for (;;) {
      if (signal.aborted) fail('service_unavailable')
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) { cancel(); fail('request_too_large') }
      chunks.push(value)
    }
    if (signal.aborted) fail('service_unavailable')
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock() }
}

function claimsFrom(authorization) {
  try {
    const token = authorization.slice(7)
    if (token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
  } catch { return null }
}
function validIdentity(identity, now) {
  const c = identity?.claims, u = identity?.user
  return uuid(u?.id) && u.is_anonymous === false && uuid(c?.session_id) && c.sub === u.id
    && c.iss === AUTH_ORIGIN + '/auth/v1' && c.aud === 'authenticated' && c.role === 'authenticated'
    && c.is_anonymous === false && Number.isSafeInteger(c.exp) && c.exp > now
    && Number.isSafeInteger(c.iat) && c.iat <= now && c.iat < c.exp
    && (c.nbf === undefined || (Number.isSafeInteger(c.nbf) && c.nbf <= now))
}

// Auth service validates the exact bearer first. Decoded claims are only additional
// restrictions on that verified token, never an independent authentication source.
export function createPrivateUserAuthenticator({ url, anonKey, fetchImpl = globalThis.fetch } = {}) {
  const configured = url === AUTH_ORIGIN && typeof anonKey === 'string' && anonKey.length > 0
    && !anonKey.startsWith('sb_secret_')
  return async (authorization, { signal }) => {
    if (!configured) fail('service_unavailable')
    const endpoint = AUTH_ORIGIN + '/auth/v1/user'
    const response = await fetchImpl(endpoint, {
      method: 'GET', headers: { apikey: anonKey, Authorization: authorization },
      signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
    })
    if (response.redirected || response.type === 'opaqueredirect'
      || (response.url && response.url !== endpoint) || (response.status >= 300 && response.status < 400)) {
      void response.body?.cancel().catch(() => {})
      fail('service_unavailable')
    }
    if (response.status === 401 || response.status === 403) {
      void response.body?.cancel().catch(() => {})
      return null
    }
    if (!response.ok || !jsonType(response.headers.get('content-type'))) {
      void response.body?.cancel().catch(() => {})
      fail('service_unavailable')
    }
    const user = await readJson(response.body, 65536, signal)
    return { user, claims: claimsFrom(authorization) }
  }
}

// This first entrypoint supports only history, authoring_context and the existing
// bounded Markets request. Remaining hypothesis actions require their own admission.
function validInput(kind, body) {
  if (kind === 'hypothesis') {
    if (!exact(body, ['action', 'input'])) return false
    const keys = body.action === 'history' ? ['investigation_id']
      : body.action === 'authoring_context' ? ['investigation_id', 'workspace_version_id'] : null
    return keys !== null && exact(body.input, keys) && keys.every(k => uuid(body.input[k]))
  }
  if (!exact(body, ['investigation_id', 'workspace_version_id', 'asset_id', 'event_id', 'at'])
    || !uuid(body.investigation_id) || !uuid(body.workspace_version_id)
    || !(body.asset_id === null || uuid(body.asset_id)) || !(body.event_id === null || uuid(body.event_id))
    || (!body.asset_id && !body.event_id)) return false
  // Canonical UTC subset of the client contract; rejects impossible calendar dates.
  return typeof body.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.at)
    && Number.isFinite(Date.parse(body.at)) && new Date(body.at).toISOString() === body.at
}

export function createPrivateGateway({ kind, authenticate, verifySession = null,
  timeoutMs = 10000, now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!['hypothesis', 'markets'].includes(kind) || typeof authenticate !== 'function'
    || (verifySession !== null && typeof verifySession !== 'function')
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) fail('invalid_server_configuration')
  const slug = kind === 'hypothesis' ? 'hypothesis-api' : 'private-markets-api'
  return async request => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
      Vary: 'Origin', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' }
    const origin = request.headers.get('origin')
    if (origin === PAGES_ORIGIN) headers['Access-Control-Allow-Origin'] = PAGES_ORIGIN
    const error = (status, code) => new Response(JSON.stringify({ error: { code } }), { status, headers })
    if (origin !== PAGES_ORIGIN) return error(403, 'origin_denied')
    // Inspect the runtime's serialized URL before parsing: URL.search/hash alone
    // lose bare delimiters. Upstream normalization cannot be reconstructed here.
    const rawUrl = request.url
    if (typeof rawUrl !== 'string' || /[?#\\]/.test(rawUrl)) return error(404, 'invalid_request')
    let url
    try { url = new URL(rawUrl) } catch { return error(404, 'invalid_request') }
    const paths = ['/' + slug, '/functions/v1/' + slug]
    if (url.search !== '' || url.hash !== '' || !paths.includes(url.pathname)
      || rawUrl !== url.origin + url.pathname) return error(404, 'invalid_request')
    if (request.method === 'OPTIONS') {
      const requested = request.headers.get('access-control-request-headers') ?? ''
      if (request.headers.get('access-control-request-method') !== 'POST'
        || requested.split(',').filter(Boolean).some(h => !['authorization', 'apikey', 'content-type', 'x-client-info'].includes(h.trim().toLowerCase())))
        return error(403, 'origin_denied')
      return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'POST') return error(405, 'invalid_request')
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)
      || authorization.length > 16391) return error(401, 'authentication_required')
    if (!jsonType(request.headers.get('content-type'))) return error(415, 'invalid_request')
    if (request.headers.has('cookie') || request.headers.has('content-encoding')) return error(400, 'invalid_request')
    const controller = new AbortController(), signal = controller.signal
    const abort = () => controller.abort()
    request.signal.addEventListener('abort', abort, { once: true })
    if (request.signal.aborted) abort()
    const timer = setTimeout(abort, timeoutMs)
    let aborted
    const cancelled = new Promise(resolve => {
      aborted = () => resolve(error(503, 'service_unavailable'))
      signal.addEventListener('abort', aborted, { once: true })
      if (signal.aborted) aborted()
    })
    const execute = async () => {
      let body
      try { body = await readJson(request.body, kind === 'markets' ? 4096 : 8192, signal) }
      catch (e) { return error(e.message === 'request_too_large' ? 413 : 400, 'invalid_request') }
      if (!validInput(kind, body)) return error(400, 'invalid_request')
      if (signal.aborted) return error(503, 'service_unavailable')
      const identity = await authenticate(authorization, { signal })
      if (signal.aborted) return error(503, 'service_unavailable')
      if (!validIdentity(identity, now())) return error(401, 'authentication_required')
      // No auth.sessions/admission RPC has been admitted. Never substitute getUser
      // or a JWT claim for current session existence/revocation/expiry checks.
      if (!verifySession) return error(503, 'service_unavailable')
      const session = await verifySession({
        userId: identity.user.id, sessionId: identity.claims.session_id,
      }, { signal })
      if (signal.aborted) return error(503, 'service_unavailable')
      if (!session || session.userId !== identity.user.id || session.sessionId !== identity.claims.session_id
        || session.active !== true || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= now()
        || !validIdentity(identity, now())) return error(401, 'authentication_required')
      // Hard disabled: even an injected successful session check does not admit data.
      // Enabling requires a reviewed server admission + execute-only data adapter.
      return error(503, 'service_unavailable')
    }
    try { return await Promise.race([execute(), cancelled]) }
    catch { return error(503, 'service_unavailable') }
    finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); signal.removeEventListener('abort', aborted) }
  }
}
