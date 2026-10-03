import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { relative } from 'node:path'
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

test('current launch source candidate manifest matches the exact gateway and preserved domain source files', async () => {
  const root = new URL('../', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('verifier/investigation-api-native-review-corrections-2026-10-02.json', root), 'utf8'))
  assert.equal(manifest.verify_jwt, true); assert.equal(manifest.files.length, 16)
  for (const entry of manifest.files) {
    const content = (await readFile(new URL('../' + entry.path, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
    assert.equal(createHash('sha256').update(content).digest('hex'), entry.sha256, entry.path)
  }
  const retained = new Set(), external = new Set()
  async function visit(url) {
    const path = relative(fileURLToPath(root), fileURLToPath(url))
    if (retained.has(path)) return
    retained.add(path)
    const text = await readFile(url, 'utf8')
    for (const match of text.matchAll(/(?:\bimport\s+(?:[^'";]*?\s+from\s+)?|\bexport\s+[^'";]*?\s+from\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) await visit(new URL(match[1], url))
      else external.add(match[1])
    }
  }
  await visit(new URL('supabase/functions/investigation-api/index.ts', root))
  assert.deepEqual([...retained].sort(), manifest.files.map(f => f.path).sort())
  assert.deepEqual([...external].sort(), manifest.runtime_module_dependencies.map(d => d.specifier).sort())
  for (const entry of manifest.sql_source_proposals) {
    assert.equal(entry.status, 'not_applied')
    assert.equal(createHash('sha256').update(await readFile(new URL(entry.path, root))).digest('hex'), entry.sha256, entry.path)
  }
  for (const entry of [...manifest.frontend_files,...manifest.story_following.installation_pack]) {
    assert.equal(createHash('sha256').update(await readFile(new URL(entry.path,root))).digest('hex'),entry.sha256,entry.path)
  }
  for (const entry of manifest.previous_manifests) {
    assert.equal(createHash('sha256').update(await readFile(new URL(entry.path,root))).digest('hex'),entry.sha256,entry.path)
  }
  const source = JSON.parse(await readFile(new URL('docs/MIP_NATIVE_REVIEW_CORRECTIONS_SOURCE_2026-10-02.json',root),'utf8'))
  assert.equal(source.status,'CURRENT_SOURCE_BINDING_NOT_A_QUALIFICATION_RECEIPT')
  const successor = JSON.parse(await readFile(new URL('docs/qualification/release-dependency-20261003-source.json',root),'utf8'))
  assert.equal(successor.contract, 'mip-release-dependency-source-v1')
  assert.equal(successor.predecessor.head, 'ca72a6df511bbb26c6b9e0a193a3e0baf01aa428')
  assert.equal(successor.predecessor.tree, 'cbcfc510a117101fd163f83b3c574dd979085b02')
  assert.equal(successor.predecessor.manifest.path, 'docs/MIP_NATIVE_REVIEW_CORRECTIONS_SOURCE_2026-10-02.json')
  assert.equal(successor.predecessor.manifest.sha256, 'c15cba4ea3864c90f0bfbe3dd69308818308c11b431afcb857085252c462e169')
  assert.equal(successor.predecessor.lockSha256, '73bb2ac5f829a987d05fbf26cce161f2c66a453ad914f02fd657033232b895aa')
  assert.equal(createHash('sha256').update(await readFile(new URL(successor.predecessor.manifest.path, root))).digest('hex'), successor.predecessor.manifest.sha256)
  const historicalSnapshots = new Map(successor.historicalSourceSnapshots.map(entry => [entry.sourcePath, entry]))
  assert.deepEqual([...historicalSnapshots.keys()].sort(), ['package-lock.json', 'tests/investigationApi.test.mjs'])
  assert.equal(successor.historicalSourceSnapshots.length, 2)
  for (const [path, snapshot] of historicalSnapshots) {
    assert.equal(snapshot.path, `docs/qualification/release-dependency-20261003-predecessor/${path}`)
    assert.equal(snapshot.sha256, source.sources.find(entry => entry.path === path).sha256)
    assert.equal(snapshot.sourceCommit, successor.predecessor.head)
  }
  for (const entry of [...source.sources,...source.previous_manifests,...source.unchanged_installation_qualification]) {
    // Keep the exact ca72 pins as history; changed tooling and this assertion
    // seam have separately bound current bytes in the dated successor.
    const path = historicalSnapshots.get(entry.path)?.path ?? entry.path
    assert.equal(createHash('sha256').update(await readFile(new URL(path,root))).digest('hex'),entry.sha256,entry.path)
  }
  assert.deepEqual(successor.sources.map(entry => entry.path).sort(), [
    'package-lock.json', 'package.json', 'tests/investigationApi.test.mjs',
    'tests/qualification/release-dependency-20261003.test.mjs', 'vite.config.js',
  ])
  for (const entry of successor.sources) {
    assert.equal(createHash('sha256').update(await readFile(new URL(entry.path,root))).digest('hex'),entry.sha256,entry.path)
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

test('opaque server RPC credentials never replace or remove the user Auth token', async () => {
  const calls = [], userToken = 'Bearer user-session-jwt', serviceKey = 'sb_secret_server_fixture'
  const transport = createInvestigationApiTransport({
    url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'sb_publishable_fixture', serviceKey,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify(FIXTURE_USER))
      // Reject the exact wire format that failed in the hosted operator check.
      if (new Headers(init.headers).has('authorization')) return new Response(JSON.stringify({ code: 'invalid_jwt' }), { status: 401 })
      return new Response(JSON.stringify({ accepted: true }))
    },
  })
  await transport.authenticate(userToken)
  for (const rpc of [transport.workspaceRpc, transport.checksRpc, transport.reviewsRpc])
    assert.deepEqual(await rpc('read', { p_user_id: FIXTURE_USER.id }), { data: { accepted: true } })
  assert.equal(calls.length, 4)
  assert.equal(calls[0].init.headers.Authorization, userToken)
  assert.equal(calls[0].init.headers.apikey, 'sb_publishable_fixture')
  for (const { url, init } of calls.slice(1)) {
    assert.match(url, /^https:\/\/qikvmopbtijoebdqosyq\.supabase\.co\/rest\/v1\/rpc\//)
    assert.equal(init.headers.apikey, serviceKey)
    assert.equal(new Headers(init.headers).has('authorization'), false)
    assert.equal(init.redirect, 'error')
    assert.ok(init.signal instanceof AbortSignal)
    assert.deepEqual(JSON.parse(init.body), { p_action: 'read', p_input: { p_user_id: FIXTURE_USER.id } })
  }
})

test('legacy server JWT transport remains unchanged for all unified private RPCs', async () => {
  const calls = [], serviceKey = 'legacy-server-jwt'
  const transport = createInvestigationApiTransport({
    url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'legacy-anon', serviceKey,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response('{}') },
  })
  for (const rpc of [transport.workspaceRpc, transport.checksRpc, transport.reviewsRpc]) await rpc('read', {})
  assert.equal(calls.length, 3)
  for (const { init } of calls) {
    assert.equal(init.headers.apikey, serviceKey)
    assert.equal(init.headers.Authorization, 'Bearer ' + serviceKey)
  }
})


test('private following route reuses verified Auth and refuses trusted-only commands and identity injection', async () => {
  const calls = [], { handler } = fixture({ followingRpc: async (action, input) => { calls.push({ action, input }); return { data: { private: true } } } })
  const body = { action: 'read', input: { investigation_id: bundle.investigation_id } }
  assert.equal((await handler(request('following', body))).status, 200)
  assert.equal(calls[0].input.user_id, FIXTURE_USER.id)
  for (const invalid of [{ ...body, input: { ...body.input, user_id: FIXTURE_USER.id } }, { action: 'revoke', input: {} }, { action: 'register_material_change', input: {} }]) assert.equal((await handler(request('following', invalid))).status, 400)
  assert.equal(calls.length, 1)
  assert.equal((await fixture().handler(request('following', body))).status, 503)
})

test('following server call stays on the existing validated origin and opaque-key credential boundary', async () => {
  const calls = [], transport = createInvestigationApiTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'sb_publishable_fixture', serviceKey: 'sb_secret_fixture', fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json({ saved: true }) } })
  await transport.followingRpc('read', { investigation_id: bundle.investigation_id, user_id: FIXTURE_USER.id })
  assert.equal(calls[0].url, 'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/mip_investigation_following_v1')
  assert.equal(calls[0].init.headers.apikey, 'sb_secret_fixture')
  assert.equal(new Headers(calls[0].init.headers).has('authorization'), false)
  assert.equal(calls[0].init.redirect, 'error'); assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test('Following actor expectation only refuses stale sessions and Auth stamps success before a client can accept it', async () => {
  const calls = [], { handler } = fixture({ followingRpc: async (action, input) => {
    calls.push({ action, input }); return { data: { publicly_eligible: false, authenticated_user_id: '00000000-0000-0000-0000-000000000001' } }
  } })
  const body = { action: 'read', input: { investigation_id: bundle.investigation_id } }
  const success = await handler(request('following', body, { headers: { 'X-MIP-Expected-User': FIXTURE_USER.id } }))
  assert.equal(success.status, 200)
  assert.equal((await success.json()).data.authenticated_user_id, FIXTURE_USER.id)
  assert.equal(calls[0].input.user_id, FIXTURE_USER.id)
  for (const value of ['00000000-0000-0000-0000-000000000001', 'malformed']) {
    const refused = await handler(request('following', body, { headers: { 'X-MIP-Expected-User': value } }))
    assert.equal(refused.status, 401); assert.deepEqual(await refused.json(), { error: { code: 'authentication_required' } })
  }
  assert.equal((await handler(request('following', { ...body, input: { ...body.input, authenticated_user_id: FIXTURE_USER.id } }))).status, 400)
  assert.equal(calls.length, 1)
  const preflight = await handler(request('following', null, { method: 'OPTIONS' }))
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-mip-expected-user/)
  assert.equal((await handler(request('following', body))).status, 200)
  assert.equal(calls.length, 2) // Header-free API callers retain current authenticated actor semantics.
})

test('selective intake is registered with the existing verified gateway and mapped SDK boundary', async () => {
  const calls = [], candidateId = bundle.version.id
  const body = { action: 'read', input: { investigation_id: bundle.investigation_id, candidate_id: candidateId } }
  const { handler } = fixture({ selectiveIntakeRpc: async (action, input) => {
    calls.push({ action, input }); return { data: { contract_version: 'private-investigation-selective-intake-1', publicly_eligible: false, investigation_id: input.investigation_id, candidate_id: input.candidate_id, receipts: [] } }
  } })
  const response = await handler(request('selective-intake', body, { headers: { 'X-MIP-Expected-User': FIXTURE_USER.id } }))
  assert.equal(response.status, 200)
  const payload = await response.json(); assert.equal(payload.authenticated_user_id, FIXTURE_USER.id)
  assert.equal(calls[0].input.user_id, FIXTURE_USER.id)
  assert.equal((await handler(request('selective-intake', body, { headers: { 'X-MIP-Expected-User': '00000000-0000-0000-0000-000000000001' } }))).status, 401)
  assert.equal((await handler(request('selective-intake', { ...body, input: { ...body.input, user_id: FIXTURE_USER.id } }))).status, 400)
  assert.equal(calls.length, 1)
  assert.equal((await fixture().handler(request('selective-intake', body))).status, 503)
  const sdkCalls = [], backend = createInvestigationBackend({ functions: { invoke: async (name, options) => { sdkCalls.push({ name, options }); return { data: payload } } } })
  assert.equal((await backend.selectiveIntake.read(body.input, { expectedUserId: FIXTURE_USER.id })).error, null)
  assert.equal(sdkCalls[0].name, 'investigation-api/selective-intake')
  assert.equal(sdkCalls[0].options.headers['X-MIP-Expected-User'], FIXTURE_USER.id)
  assert.equal(Object.hasOwn(sdkCalls[0].options.body.input, 'user_id'), false)
  assert.equal((await createInvestigationBackend(null).selectiveIntake.read(body.input)).error.code, 'service_unavailable')
})

test('selective intake server transport preserves fixed target and both current credential formats', async () => {
  for (const serviceKey of ['sb_secret_selective_fixture', 'legacy-selective-server-jwt']) {
    const calls = [], transport = createInvestigationApiTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'synthetic-public-key', serviceKey,
      fetchImpl: async (url, init) => { calls.push({ url, init }); return Response.json({ synthetic: true }) } })
    assert.deepEqual(await transport.selectiveIntakeRpc('read', { user_id: FIXTURE_USER.id }), { data: { synthetic: true } })
    assert.equal(calls[0].url, 'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/mip_investigation_selective_intake_v1')
    assert.equal(calls[0].init.headers.apikey, serviceKey)
    assert.equal(new Headers(calls[0].init.headers).get('authorization'), serviceKey.startsWith('sb_secret_') ? null : `Bearer ${serviceKey}`)
    assert.equal(calls[0].init.redirect, 'error'); assert.ok(calls[0].init.signal instanceof AbortSignal)
    assert.deepEqual(JSON.parse(calls[0].init.body), { p_action: 'read', p_input: { user_id: FIXTURE_USER.id } })
  }
})
