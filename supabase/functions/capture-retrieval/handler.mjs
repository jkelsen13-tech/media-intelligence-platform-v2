import { createOperatorBackend, PIPELINE_TARGET } from '../_shared/operatorBackend.mjs'
import { runCaptureRetrieval, validateCaptureRetrieval } from '../_shared/captureRetrieval.mjs'

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-MIP-Backend': 'capture-retrieval-1',
}
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
const failure = (status, code) => reply(status, { error: code })

async function boundedJson(request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('invalid_input')
  let size = 0
  const chunks = []
  let timedOut = false
  const deadline = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}) }, 5000)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (timedOut) throw new Error('invalid_input')
      if (done) break
      size += value.byteLength
      if (size > 8192) { void reader.cancel().catch(() => {}); throw new Error('input_too_large') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } finally { clearTimeout(deadline); reader.releaseLock() }
}

export function createCaptureRetrievalHandler({ url, serviceKey, makeBackend = createOperatorBackend }) {
  return async request => {
    // Gateway JWT verification is also enabled. Exact server-key equality prevents
    // anon/user JWTs (including user-editable claims) from authorizing operator work.
    if (url?.replace(/\/$/, '') !== PIPELINE_TARGET || typeof serviceKey !== 'string' || !serviceKey.trim()) return failure(503, 'server_unavailable')
    if (request.headers.get('Authorization') !== `Bearer ${serviceKey}`) return failure(401, 'operator_authentication_required')
    if (request.headers.has('Origin')) return failure(403, 'browser_origin_denied')
    const parsed = new URL(request.url)
    if (!['/capture-retrieval', '/functions/v1/capture-retrieval'].includes(parsed.pathname) || parsed.search) return failure(404, 'route_not_found')
    if (request.method !== 'POST') return failure(405, 'method_not_allowed')
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure(415, 'json_required')
    let body
    try { body = await boundedJson(request) } catch (error) { return failure(error.message === 'input_too_large' ? 413 : 400, 'invalid_input') }
    if (!body || Array.isArray(body) || typeof body !== 'object') return failure(400, 'invalid_input')
    if (body.action === 'status' && Object.keys(body).length === 1) {
      try {
        const backend = makeBackend({ url, key: serviceKey })
        const [intake, changes] = await Promise.all([backend.intake('status'), backend.changes('status')])
        return reply(200, { intake, changes })
      } catch { return failure(502, 'status_unavailable') }
    }
    if (body.action !== 'retrieval' || body.apply !== true || Object.keys(body).some(key => !['action', 'apply', 'input'].includes(key))) return failure(400, 'invalid_input')
    let input
    try {
      if (!body.input || Array.isArray(body.input) || typeof body.input !== 'object') throw new Error('invalid_input')
      input = { ...body.input, maxPages: body.input.maxPages === undefined ? 1 : body.input.maxPages }
      validateCaptureRetrieval(input)
      // At most read/start + two pages + durable read, each with a 25s timeout.
      // Leave headroom below the hosted request and initial-lease limits.
      if (input.maxPages > 2) throw new Error('edge_page_budget')
    } catch { return failure(400, 'invalid_input') }
    try {
      const result = await runCaptureRetrieval(makeBackend({ url, key: serviceKey }), input)
      return reply(result.state === 'indeterminate' ? 502 : 200, result)
    } catch { return failure(502, 'retrieval_unavailable') }
  }
}
