import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPrivateGateway, createPrivateUserAuthenticator, PAGES_ORIGIN } from '../supabase/functions/_shared/privateGateway.mjs'

const userId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
const clock = 1800000000
const identity = () => ({ user: { id: userId, is_anonymous: false },
  claims: { sub: userId, session_id: sessionId, iss: 'https://qikvmopbtijoebdqosyq.supabase.co/auth/v1',
    aud: 'authenticated', role: 'authenticated', is_anonymous: false, iat: clock - 100, exp: clock + 100 } })
const token = () => 'e30.' + Buffer.from(JSON.stringify(identity().claims)).toString('base64url') + '.c2ln'
const bodies = {
  hypothesis: { action: 'history', input: { investigation_id: userId } },
  markets: { investigation_id: userId, workspace_version_id: other, asset_id: userId, event_id: null, at: '2026-09-14T00:00:00.000Z' },
}
function request(kind, options = {}) {
  const { headers = {}, body = bodies[kind], method = 'POST', path } = options
  return new Request('https://qikvmopbtijoebdqosyq.supabase.co/functions/v1/' + (path ?? (kind === 'hypothesis' ? 'hypothesis-api' : 'private-markets-api')), {
    method, headers: { origin: PAGES_ORIGIN, authorization: 'Bearer ' + token(), 'content-type': 'application/json', ...headers },
    ...(!['GET', 'OPTIONS'].includes(method) ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  })
}
const handler = (kind, options = {}) => createPrivateGateway({ kind, authenticate: async () => identity(), now: () => clock, ...options })
async function expectError(response, status, code) {
  assert.equal(response.status, status)
  assert.deepEqual(await response.json(), { error: { code } })
  assert.equal(response.headers.get('location'), null)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
}
for (const kind of ['hypothesis', 'markets']) {
  test(kind + ': real Request boundary rejects unauthenticated and wrong origin before auth', async () => {
    let calls = 0
    const run = handler(kind, { authenticate: async () => { calls++; return identity() } })
    await expectError(await run(request(kind, { headers: { authorization: '' } })), 401, 'authentication_required')
    for (const origin of ['', 'null', 'https://evil.example', PAGES_ORIGIN + '.evil.example']) {
      const response = await run(request(kind, { headers: { origin } }))
      assert.equal(response.headers.get('access-control-allow-origin'), null)
      await expectError(response, 403, 'origin_denied')
    }
    assert.equal(calls, 0)
  })
  test(kind + ': exact POST preflight only and route/method restrictions', async () => {
    let calls = 0
    const run = handler(kind, { authenticate: async () => { calls++; return identity() } })
    const preflight = new Request(request(kind).url, { method: 'OPTIONS', headers: {
      Origin: PAGES_ORIGIN, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    } })
    for (const name of ['authorization', 'apikey', 'content-type']) assert.equal(preflight.headers.has(name), false)
    assert.equal(preflight.body, null)
    const response = await run(preflight)
    assert.equal(calls, 0)
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), PAGES_ORIGIN)
    await expectError(await run(request(kind, { method: 'OPTIONS', headers: { 'access-control-request-method': 'DELETE' } })), 403, 'origin_denied')
    await expectError(await run(request(kind, { method: 'GET' })), 405, 'invalid_request')
    await expectError(await run(request(kind, { path: 'other' })), 404, 'invalid_request')
  })
  test(kind + ': malformed JSON, strict schema, content type, size and identity injection fail', async () => {
    let calls = 0
    const run = handler(kind, { authenticate: async () => { calls++; return identity() } })
    for (const body of ['{', 'null', '[]', { ...bodies[kind], user_id: userId }, { ...bodies[kind], user_metadata: { admin: true } }])
      await expectError(await run(request(kind, { body })), 400, 'invalid_request')
    await expectError(await run(request(kind, { headers: { 'content-type': 'application/jsonx' } })), 415, 'invalid_request')
    await expectError(await run(request(kind, { headers: { cookie: 'session=untrusted' } })), 400, 'invalid_request')
    await expectError(await run(request(kind, { body: ' '.repeat(9000) })), 413, 'invalid_request')
    assert.equal(calls, 0)
  })
  test(kind + ': disabled seam cannot return data, even with a valid current session', async () => {
    await expectError(await handler(kind)(request(kind)), 503, 'service_unavailable')
    let checked
    const run = handler(kind, { verifySession: async scope => {
      checked = scope
      return { ...scope, active: true, expiresAt: clock + 50 }
    } })
    await expectError(await run(request(kind)), 503, 'service_unavailable')
    assert.deepEqual(checked, { userId, sessionId })
  })
  test(kind + ': user/claim/session mismatch, expiry, anonymous and workload identities fail', async () => {
    for (const mutate of [
      i => { i.claims.sub = other }, i => { i.claims.exp = clock },
      i => { i.claims.role = 'service_role' }, i => { i.user.is_anonymous = true },
      i => { i.claims.iss = 'https://evil.example/auth/v1' }, i => { i.claims.session_id = null },
      i => { i.claims.nbf = clock + 1 },
      i => { i.claims.aud = 'service_role' }, i => { i.claims.aud = ['authenticated'] },
      i => { delete i.claims.aud }, i => { i.claims.iat = clock + 1 },
      i => { i.claims.iat = '1799999999' }, i => { delete i.claims.iat },
      i => { i.claims.is_anonymous = true }, i => { delete i.claims.is_anonymous },
    ]) {
      const i = identity(); mutate(i)
      await expectError(await handler(kind, { authenticate: async () => i })(request(kind)), 401, 'authentication_required')
    }
    for (const session of [null, { userId: other, sessionId, active: true, expiresAt: clock + 10 },
      { userId, sessionId: other, active: true, expiresAt: clock + 10 },
      { userId, sessionId, active: false, expiresAt: clock + 10 },
      { userId, sessionId, active: true, expiresAt: clock }])
      await expectError(await handler(kind, { verifySession: async () => session })(request(kind)), 401, 'authentication_required')
  })
  test(kind + ': one deadline bounds non-cooperative auth and session adapters', async () => {
    const never = () => new Promise(() => {})
    await expectError(await handler(kind, { authenticate: never, timeoutMs: 5 })(request(kind)), 503, 'service_unavailable')
    await expectError(await handler(kind, { verifySession: never, timeoutMs: 5 })(request(kind)), 503, 'service_unavailable')
  })
  test(kind + ': real Auth adapter rejects redirect attempts and rejected bearer', async () => {
    for (const mode of ['status', 'redirected', 'foreign-url', 'opaque', 'throw', 'denied']) {
      let calls = 0
      const authenticate = createPrivateUserAuthenticator({
        url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'test-public-key',
        fetchImpl: async (url, init) => {
          calls++
          assert.equal(url, 'https://qikvmopbtijoebdqosyq.supabase.co/auth/v1/user')
          assert.equal(init.redirect, 'error')
          assert.equal(init.headers.Authorization, 'Bearer ' + token())
          assert.equal(init.headers.apikey, 'test-public-key')
          assert.ok(init.signal)
          if (mode === 'throw') throw new TypeError('redirect blocked')
          const response = Response.json(identity().user, { status: mode === 'status' ? 302 : mode === 'denied' ? 401 : 200 })
          if (mode === 'redirected') Object.defineProperty(response, 'redirected', { value: true })
          if (mode === 'foreign-url') Object.defineProperty(response, 'url', { value: 'https://evil.example/user' })
          if (mode === 'opaque') Object.defineProperty(response, 'type', { value: 'opaqueredirect' })
          return response
        },
      })
      await expectError(await handler(kind, { authenticate })(request(kind)), mode === 'denied' ? 401 : 503, mode === 'denied' ? 'authentication_required' : 'service_unavailable')
      assert.equal(calls, 1)
    }
  })
}
test('real Auth adapter returns verified user but cannot itself admit a session or data', async () => {
  const authenticate = createPrivateUserAuthenticator({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'test-public-key',
    fetchImpl: async () => Response.json(identity().user) })
  await expectError(await handler('hypothesis', { authenticate })(request('hypothesis')), 503, 'service_unavailable')
})
test('both Deno entrypoints wire only user auth and keep platform verification enabled', async () => {
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
  for (const name of ['hypothesis-api', 'private-markets-api']) {
    assert.ok(config.includes('[functions.' + name + ']\nverify_jwt = true'))
    const entry = await readFile(new URL('../supabase/functions/' + name + '/index.ts', import.meta.url), 'utf8')
    assert.match(entry, /Deno\.serve\(createPrivateGateway/)
    assert.doesNotMatch(entry, /SERVICE_ROLE|verifySession|generationTarget|synthetic|fixture|Bearer /)
  }
})

function streamedRequest(kind, stream, headers = {}, signal) {
  return new Request(request(kind).url, { method: 'POST', duplex: 'half',
    headers: { Origin: PAGES_ORIGIN, Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json', ...headers }, body: stream, signal })
}
function chunksStream(chunks, { close = true } = {}) {
  let cancelled = 0
  const stream = new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); if (close) controller.close() },
    cancel() { cancelled++ },
  })
  return { stream, cancellations: () => cancelled }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
for (const kind of ['hypothesis', 'markets']) {
  test(kind + ': rejects observable raw route aliases before authentication', async () => {
    let calls = 0
    const run = handler(kind, { authenticate: async () => { calls++; return identity() } })
    const base = request(kind).url, slug = base.split('/').pop(), prefix = base.slice(0, -slug.length)
    const variants = [base + '?', base + '?a=1', base + '#', base + '#fragment', base + '/',
      prefix + '%68' + slug.slice(1), prefix + './' + slug, prefix + 'x/../' + slug,
      prefix + '%2e/' + slug, prefix + 'x/%2e%2e/' + slug, prefix + '\\' + slug,
      prefix + slug.replace('-', '%2d')]
    for (const raw of variants) {
      // Request normalizes dot segments/backslashes in some runtimes. An own URL
      // models the still-observable raw form without pretending wire bytes survive.
      const req = request(kind)
      Object.defineProperty(req, 'url', { value: raw })
      await expectError(await run(req), 404, 'invalid_request')
    }
    assert.equal(calls, 0)
    for (const raw of [prefix + slug.replace('-', '%2d'), prefix + '\\' + slug, prefix.replace(/\/$/, '\\') + slug]) {
      const req = new Request(raw, { method: 'POST', headers: request(kind).headers, body: JSON.stringify(bodies[kind]) })
      const canonical = req.url === base
      await expectError(await run(req), canonical ? 503 : 404, canonical ? 'service_unavailable' : 'invalid_request')
    }
    // Actual Request canonicalization is explicitly tested and never called rejection.
    for (const raw of [prefix + './' + slug, prefix + 'x/../' + slug, prefix + '%2e/' + slug]) {
      const req = new Request(raw, { method: 'POST', headers: request(kind).headers, body: JSON.stringify(bodies[kind]) })
      assert.equal(req.url, base)
      await expectError(await run(req), 503, 'service_unavailable')
    }
    // Queries/fragments and trailing slash remain visible on actual Node Request.
    for (const raw of [base + '?', base + '?a=1', base + '#', base + '#fragment', base + '/']) {
      const req = new Request(raw, { method: 'POST', headers: request(kind).headers, body: JSON.stringify(bodies[kind]) })
      assert.equal(req.url, raw)
      await expectError(await run(req), 404, 'invalid_request')
    }
  })
  test(kind + ': chunked exact byte limit reaches closed seam; plus one cancels and unlocks', async () => {
    const maximum = kind === 'markets' ? 4096 : 8192
    const bytes = new TextEncoder().encode(JSON.stringify(bodies[kind]).padEnd(maximum, ' '))
    let calls = 0
    const run = handler(kind, { authenticate: async () => { calls++; return identity() } })
    const exact = chunksStream([bytes.slice(0, 13), bytes.slice(13)])
    await expectError(await run(streamedRequest(kind, exact.stream)), 503, 'service_unavailable')
    assert.equal(calls, 1); assert.equal(exact.cancellations(), 0); assert.equal(exact.stream.locked, false)
    const over = chunksStream([bytes, new Uint8Array([32])], { close: false })
    await expectError(await run(streamedRequest(kind, over.stream)), 413, 'invalid_request')
    await tick()
    assert.equal(calls, 1); assert.equal(over.cancellations(), 1); assert.equal(over.stream.locked, false)
  })
  test(kind + ': actual streams reject malformed JSON and invalid UTF-8 without auth', async () => {
    let calls = 0
    const run = handler(kind, { authenticate: async () => { calls++; return identity() } })
    for (const chunks of [[new TextEncoder().encode('{"action":')], [new Uint8Array([0xc3]), new Uint8Array([0x28])]]) {
      const source = chunksStream(chunks)
      await expectError(await run(streamedRequest(kind, source.stream)), 400, 'invalid_request')
      assert.equal(source.stream.locked, false)
    }
    const source = chunksStream([new TextEncoder().encode('{}')], { close: false })
    const req = streamedRequest(kind, source.stream, { 'Content-Type': 'text/plain' })
    await expectError(await run(req), 415, 'invalid_request')
    // Header rejection never locks or consumes the body; caller retains ownership.
    assert.equal(req.bodyUsed, false); assert.equal(source.stream.locked, false)
    await req.body.cancel()
    assert.equal(source.cancellations(), 1); assert.equal(calls, 0)
  })
  test(kind + ': stalled mid-body deadline cancels reader and prevents authentication', async () => {
    const source = chunksStream([new TextEncoder().encode('{"action":')], { close: false })
    let calls = 0
    const run = handler(kind, { authenticate: async () => { calls++; return identity() }, timeoutMs: 5 })
    await expectError(await run(streamedRequest(kind, source.stream)), 503, 'service_unavailable')
    await tick()
    assert.equal(source.cancellations(), 1); assert.equal(source.stream.locked, false); assert.equal(calls, 0)
  })
  test(kind + ': caller abort cancels stalled body and cleans up reader', async () => {
    const source = chunksStream([new Uint8Array([123])], { close: false }), controller = new AbortController()
    const req = streamedRequest(kind, source.stream, {}, controller.signal)
    let calls = 0
    const result = handler(kind, { authenticate: async () => { calls++; return identity() } })(req)
    controller.abort()
    await expectError(await result, 503, 'service_unavailable')
    await tick()
    assert.equal(source.cancellations(), 1); assert.equal(source.stream.locked, false); assert.equal(calls, 0)
  })
}

function authStreamHarness(source, { contentType = 'application/json', timeoutMs = 1000,
  sessionCheck = true } = {}) {
  let fetchCalls = 0, completed = 0, sessionCalls = 0, seenSignal, seenUrl, seenInit
  let entered
  const fetched = new Promise(resolve => { entered = resolve })
  const adapter = createPrivateUserAuthenticator({
    url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'test-public-key',
    fetchImpl: async (url, init) => {
      fetchCalls++; seenUrl = url; seenInit = init; seenSignal = init.signal
      entered()
      return new Response(source.stream, { status: 200, headers: { 'Content-Type': contentType } })
    },
  })
  const authenticate = async (...args) => { const result = await adapter(...args); completed++; return result }
  const verifySession = sessionCheck ? async () => { sessionCalls++; throw Error('unexpected_session_check') } : null
  return {
    run: kind => handler(kind, { authenticate, verifySession, timeoutMs }),
    fetched,
    counts: () => ({ fetchCalls, completed, sessionCalls }),
    signal: () => seenSignal,
    assertFetch() {
      assert.equal(seenUrl, 'https://qikvmopbtijoebdqosyq.supabase.co/auth/v1/user')
      assert.equal(seenInit.method, 'GET'); assert.equal(seenInit.redirect, 'error')
      assert.equal(seenInit.headers.Authorization, 'Bearer ' + token())
      assert.equal(seenInit.headers.apikey, 'test-public-key')
      assert.ok(seenSignal)
    },
  }
}
for (const kind of ['hypothesis', 'markets']) {
  test(kind + ': Auth response exact 65536 bytes completes; plus one is rejected and cancelled', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(identity().user).padEnd(65536, ' '))
    assert.equal(bytes.byteLength, 65536)
    const exact = chunksStream([bytes.slice(0, 31), bytes.slice(31)])
    // Production has no session checker: exact-limit valid Auth response must
    // complete the adapter, then reach the disabled seam without session work.
    const good = authStreamHarness(exact, { sessionCheck: false })
    await expectError(await good.run(kind)(request(kind)), 503, 'service_unavailable')
    good.assertFetch()
    assert.deepEqual(good.counts(), { fetchCalls: 1, completed: 1, sessionCalls: 0 })
    assert.equal(exact.cancellations(), 0); assert.equal(exact.stream.locked, false)
    const over = chunksStream([bytes, new Uint8Array([32])], { close: false })
    const bad = authStreamHarness(over)
    await expectError(await bad.run(kind)(request(kind)), 503, 'service_unavailable')
    await tick(); bad.assertFetch()
    assert.deepEqual(bad.counts(), { fetchCalls: 1, completed: 0, sessionCalls: 0 })
    assert.equal(over.cancellations(), 1); assert.equal(over.stream.locked, false)
  })
  test(kind + ': malformed JSON and invalid UTF-8 in Auth response fail before session check', async () => {
    for (const chunks of [[new TextEncoder().encode('{"id":')], [new Uint8Array([0xc3]), new Uint8Array([0x28])]]) {
      const source = chunksStream(chunks), fixture = authStreamHarness(source)
      await expectError(await fixture.run(kind)(request(kind)), 503, 'service_unavailable')
      fixture.assertFetch()
      assert.deepEqual(fixture.counts(), { fetchCalls: 1, completed: 0, sessionCalls: 0 })
      assert.equal(source.stream.locked, false)
      // Closed input has no remaining producer to cancel.
      assert.equal(source.cancellations(), 0)
    }
  })
  test(kind + ': wrong Auth response content type cancels unread stream without session work', async () => {
    const source = chunksStream([new TextEncoder().encode(JSON.stringify(identity().user))], { close: false })
    const fixture = authStreamHarness(source, { contentType: 'text/plain' })
    await expectError(await fixture.run(kind)(request(kind)), 503, 'service_unavailable')
    await tick(); fixture.assertFetch()
    assert.deepEqual(fixture.counts(), { fetchCalls: 1, completed: 0, sessionCalls: 0 })
    assert.equal(source.cancellations(), 1); assert.equal(source.stream.locked, false)
  })
  test(kind + ': stalled Auth response is cancelled under the shared request deadline', async () => {
    const source = chunksStream([new TextEncoder().encode('{"id":')], { close: false })
    const fixture = authStreamHarness(source, { timeoutMs: 50 })
    await expectError(await fixture.run(kind)(request(kind)), 503, 'service_unavailable')
    await tick(); fixture.assertFetch()
    // A fetch call proves the valid small inbound request reached the Auth reader.
    assert.deepEqual(fixture.counts(), { fetchCalls: 1, completed: 0, sessionCalls: 0 })
    assert.equal(fixture.signal().aborted, true)
    assert.equal(source.cancellations(), 1); assert.equal(source.stream.locked, false)
  })
  test(kind + ': caller abort after Auth reader starts cancels response and unlocks reader', async () => {
    const source = chunksStream([new TextEncoder().encode('{"id":')], { close: false })
    const fixture = authStreamHarness(source), controller = new AbortController()
    const req = new Request(request(kind).url, { method: 'POST', headers: request(kind).headers,
      body: JSON.stringify(bodies[kind]), signal: controller.signal })
    const pending = fixture.run(kind)(req)
    await fixture.fetched
    // Allow the adapter to acquire/read the response, not just reach fetch.
    await tick()
    assert.equal(source.stream.locked, true)
    controller.abort()
    await expectError(await pending, 503, 'service_unavailable')
    await tick(); fixture.assertFetch()
    assert.deepEqual(fixture.counts(), { fetchCalls: 1, completed: 0, sessionCalls: 0 })
    assert.equal(fixture.signal().aborted, true)
    assert.equal(source.cancellations(), 1); assert.equal(source.stream.locked, false)
  })
}
