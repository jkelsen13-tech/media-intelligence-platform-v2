import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createInvestigationApiHandler, createInvestigationApiTransport } from '../supabase/functions/investigation-api/handler.mjs'
import { createInvestigationBackend } from '../src/lib/investigationBackend.js'
import { FIXTURE_USER, FIXTURE_BUNDLES } from '../src/lib/investigationWorkspaceFixtures.js'

const bundle = FIXTURE_BUNDLES.comparable, origin = 'https://jkelsen13-tech.github.io'
const input = { investigation_id: bundle.investigation_id, version_id: bundle.version.id }
const bodies = {
  workspace: { action: 'read', input }, checks: { action: 'read', input },
  reviews: { action: 'read', input: { ...input, report_id: bundle.version.id } },
  'input-impact': { action: 'read', input: { ...input, position: '1' } },
  'source-spans': { action: 'read', input: { ...input, left_position: '1', right_position: '2' } },
}
const request = (route, body = bodies[route], options = {}) => new Request(`https://fixture.test/functions/v1/investigation-api/${route}`, {
  method: options.method ?? 'POST', headers: { origin, authorization: 'Bearer fixture', 'content-type': 'application/json', ...options.headers },
  ...(['OPTIONS', 'GET'].includes(options.method) ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
})
function fixture(overrides = {}) {
  const calls = []
  const rpc = name => async (action, input) => { calls.push({ name, action, input }); return { data: name === 'workspace' ? structuredClone(bundle) : { fixture: name } } }
  const handler = createInvestigationApiHandler({ authenticate: async () => FIXTURE_USER, workspaceRpc: rpc('workspace'), checksRpc: rpc('checks'), reviewsRpc: rpc('reviews'), ...overrides })
  return { handler, calls }
}

test('registered unified deployment matches the exact gateway and domain source files', async () => {
  const manifest = JSON.parse(await readFile(new URL('../verifier/investigation-api-2026-09-07.json', import.meta.url), 'utf8'))
  assert.equal(manifest.verify_jwt, true); assert.equal(manifest.files.length, 9)
  for (const entry of manifest.files) {
    const content = (await readFile(new URL('../' + entry.path, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
    assert.equal(createHash('sha256').update(content).digest('hex'), entry.sha256, entry.path)
  }
})

test('one API routes all five domains directly with existing response envelopes and verified identity', async () => {
  const { handler, calls } = fixture()
  for (const route of Object.keys(bodies)) {
    const response = await handler(request(route))
    assert.equal(response.status, 200, route)
    assert.equal(response.headers.get('x-mip-backend'), 'investigation-api-1')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.ok((await response.json()).data)
  }
  assert.deepEqual(calls.map(c => c.name), ['workspace', 'checks', 'reviews', 'workspace', 'workspace'])
  assert.ok(calls.every(c => c.action === 'read' && c.input.user_id === FIXTURE_USER.id))
})

test('gateway retains route, origin, method, JSON and per-domain request limits without downstream calls', async () => {
  const { handler, calls } = fixture()
  for (const route of Object.keys(bodies)) {
    assert.equal((await handler(request(route, null, { method: 'OPTIONS' }))).status, 204)
    assert.equal((await handler(request(route, undefined, { method: 'GET' }))).status, 405)
    assert.equal((await handler(request(route, undefined, { headers: { authorization: '' } }))).status, 401)
    assert.equal((await handler(request(route, undefined, { headers: { 'content-type': 'text/plain' } }))).status, 415)
    assert.equal((await handler(request(route, '{broken'))).status, 400)
    const denied = await handler(request(route, undefined, { headers: { origin: 'https://untrusted.example' } }))
    assert.equal(denied.status, 403); assert.equal(denied.headers.has('access-control-allow-origin'), false)
    assert.equal((await handler(request(route, { ...bodies[route], input: { ...bodies[route].input, user_id: FIXTURE_USER.id } }))).status, 400)
    assert.equal((await handler(request(route, { action: 'put', input: bodies[route].input }))).status, 400)
    assert.equal((await handler(request(route, ' '.repeat(70000)))).status, 413)
  }
  assert.equal((await handler(request('workspace', ' '.repeat(9000)))).status, 413)
  // Reviews keep their existing larger limit rather than inheriting workspace's.
  assert.equal((await handler(request('reviews', JSON.stringify(bodies.reviews).padEnd(9000)))).status, 200)
  assert.equal(calls.length, 1)
  for (const route of ['unknown', 'workspace/extra', 'workspace?rpc=arbitrary', '%77orkspace', '../rpc', 'workspace/']) {
    assert.equal((await handler(request(route, bodies.workspace))).status, 404)
  }
  assert.equal(calls.length, 1)
})

test('Auth and database failures stay sanitized; denied or anonymous sessions cannot reach any RPC', async () => {
  for (const user of [null, { ...FIXTURE_USER, is_anonymous: true }]) {
    const { handler, calls } = fixture({ authenticate: async () => user })
    for (const route of Object.keys(bodies)) assert.equal((await handler(request(route))).status, 401)
    assert.equal(calls.length, 0)
  }
  const { handler } = fixture({ authenticate: async () => { throw new Error('sensitive internal error') } })
  const response = await handler(request('workspace'))
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /sensitive/)
  const denied = fixture({ workspaceRpc: async () => ({ error: { code: '42501', message: 'private row' } }) })
  for (const route of ['workspace', 'input-impact', 'source-spans']) {
    const response = await denied.handler(request(route)); assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { error: { code: 'access_denied' } })
  }
})

test('shared server transport keeps credentials in their proper boundary and makes no function-to-function calls', async () => {
  const calls = []
  const transport = createInvestigationApiTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'fixture-anon', serviceKey: 'fixture-service',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json(url.endsWith('/auth/v1/user') ? FIXTURE_USER : {}) } })
  await transport.authenticate('Bearer user-one'); await transport.authenticate('Bearer user-two')
  await transport.workspaceRpc('read', input); await transport.checksRpc('read', input); await transport.reviewsRpc('read', input)
  assert.deepEqual(calls.slice(0, 2).map(c => c.options.headers.Authorization), ['Bearer user-one', 'Bearer user-two'])
  assert.ok(calls.slice(0, 2).every(c => c.options.headers.apikey === 'fixture-anon'))
  assert.ok(calls.slice(2).every(c => c.options.headers.Authorization === 'Bearer fixture-service' && c.options.redirect === 'error'))
  assert.deepEqual(calls.slice(2).map(c => c.url.split('/').at(-1)), ['mip_investigation_workspace_v1', 'mip_investigation_evidence_checks_v1', 'mip_investigation_evidence_reviews_v1'])
  assert.equal(calls.some(c => c.url.includes('/functions/')), false)
  assert.throws(() => createInvestigationApiTransport({ url: 'https://other.example', anonKey: 'x', serviceKey: 'y' }), /invalid_server_configuration/)
})

test('frontend composition uses only unified routes and never retries or falls back to an old endpoint', async () => {
  const calls = [], sdk = { functions: { invoke: async (name, options) => {
    calls.push({ name, options }); return { data: { data: { saved: true } } }
  } } }
  const backend = createInvestigationBackend(sdk)
  assert.equal(calls.length, 0)
  await backend.workspace.read(input.investigation_id, input.version_id)
  await backend.checks.read(input.investigation_id, input.version_id)
  await backend.reviews.read(input.investigation_id, input.version_id, input.version_id)
  await backend.inputImpact.read(input.investigation_id, input.version_id, '9007199254740993')
  await backend.sourceSpans.read(input.investigation_id, input.version_id, '1', '2')
  assert.deepEqual(calls.map(c => c.name), Object.keys(bodies).map(route => `investigation-api/${route}`))
  assert.equal(calls[3].options.body.input.position, '9007199254740993')
  sdk.functions.invoke = async (name) => { calls.push({ name }); return { error: { context: new Response('{}', { status: 401 }) } } }
  assert.equal((await backend.workspace.read(input.investigation_id)).error.code, 'authentication_required')
  assert.equal(calls.length, 6)
  assert.equal((await createInvestigationBackend(null).workspace.list()).error.code, 'not_configured')
})
