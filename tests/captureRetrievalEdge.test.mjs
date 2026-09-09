import test from 'node:test'
import assert from 'node:assert/strict'
import { createCaptureRetrievalHandler } from '../supabase/functions/capture-retrieval/handler.mjs'
import { createOperatorBackend, PIPELINE_TARGET } from '../supabase/functions/_shared/operatorBackend.mjs'

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const job_id = id(1), run_id = id(2), lease_token = id(3)
const serviceKey = 'test-server-key'
const request = (body, headers = {}, path = '/capture-retrieval', method = 'POST') => new Request('https://edge.invalid' + path, {
  method, headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...headers },
  ...(['GET', 'HEAD'].includes(method) ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
})
const fixture = () => {
  const calls = []
  let run = { id: run_id, job_id, contract: 'capture-lexical-1', source_capture_id: id(6), snapshot_hash: 'a'.repeat(64), targets: [id(4), id(5)], next_index: 0, is_refresh: false, completed_at: null }
  const backend = {
    intake: async action => { calls.push(['intake', action]); return { pending: 2 } },
    changes: async action => { calls.push(['changes', action]); return { pending: 3 } },
    retrieval: async (action, input) => {
      calls.push(['retrieval', action, input])
      if (action === 'page') {
        run = { ...run, next_index: run.next_index + 1 }
        if (run.next_index === 2) run.completed_at = '2026-09-07T00:00:00Z'
        return { coverage: run.completed_at ? 'complete' : 'partial', run_id }
      }
      return { ...run }
    },
  }
  return { calls, backend, handler: createCaptureRetrievalHandler({ url: PIPELINE_TARGET, serviceKey, makeBackend: () => backend }) }
}

test('operator endpoint denies missing, anon, user and forged credentials before any backend call', async () => {
  const f = fixture()
  for (const Authorization of ['', 'Bearer anon', 'Bearer user', 'Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.']) {
    const response = await f.handler(request({ action: 'status' }, { Authorization }))
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
  }
  assert.equal(f.calls.length, 0)
})

test('host, origin, path and methods are restricted before backend access', async () => {
  const f = fixture()
  assert.equal((await createCaptureRetrievalHandler({ url: 'https://wrong.invalid', serviceKey })(request({ action: 'status' }))).status, 503)
  assert.equal((await f.handler(request({ action: 'status' }, { Origin: 'https://example.org' }))).status, 403)
  for (const path of ['/capture-retrieval/other', '/capture-retrieval?rpc=other']) assert.equal((await f.handler(request({ action: 'status' }, {}, path))).status, 404)
  assert.equal((await f.handler(request(null, {}, '/capture-retrieval', 'GET'))).status, 405)
  assert.equal(f.calls.length, 0)
})

test('read-only hosted status cannot claim work and returns both queue summaries', async () => {
  const f = fixture()
  const response = await f.handler(request({ action: 'status' }, {}, '/functions/v1/capture-retrieval'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { intake: { pending: 2 }, changes: { pending: 3 } })
  assert.deepEqual(f.calls, [['intake', 'status'], ['changes', 'status']])
})

test('malformed, oversized, extra, unsupported and unapplied requests fail before opening backend', async () => {
  const f = fixture()
  for (const body of ['{', ' '.repeat(8193), null, [], { action: 'status', input: {} }, { action: 'claim' },
    { action: 'retrieval', input: { mode: 'resume', run_id } },
    ...[null, [], { mode: 'resume', run_id, maxPages: 3 }, { mode: 'resume', run_id, maxPages: null }, { mode: 'resume', run_id, pageSize: 26 }, { mode: 'start', job_id }, { mode: 'resume', run_id, url: 'https://wrong.invalid' }].map(input => ({ action: 'retrieval', apply: true, input }))]) {
    assert.ok([400, 413].includes((await f.handler(request(body))).status))
  }
  assert.equal((await f.handler(request({}, { 'Content-Type': 'text/plain' }))).status, 415)
  assert.equal(f.calls.length, 0)
})

test('hosted retrieval defaults to one page, resumes durable state and never returns lease or retained targets', async () => {
  const f = fixture()
  let response = await f.handler(request({ action: 'retrieval', apply: true, input: { mode: 'start', job_id, lease_token, pageSize: 1 } }))
  assert.equal(response.status, 200)
  let result = await response.json()
  assert.equal(result.state, 'partial'); assert.equal(result.pages, 1); assert.equal(result.scanned, 1)
  response = await f.handler(request({ action: 'retrieval', apply: true, input: { mode: 'resume', run_id, lease_token, pageSize: 1 } }))
  result = await response.json()
  assert.equal(result.state, 'completed'); assert.equal(result.scanned, 2)
  assert.ok(!JSON.stringify(result).includes(lease_token)); assert.equal(result.targets, 2)
  assert.ok(f.calls.every(([facet]) => facet === 'retrieval'))
  assert.ok(f.calls.every(([, action]) => !['claim', 'finish', 'fail'].includes(action)))
})

test('failed status and failed durable readback are sanitized failures, not empty success', async () => {
  const backend = { intake: async () => { throw new Error('private credential') }, changes: async () => ({}), retrieval: async () => { throw new Error('private text') } }
  const handler = createCaptureRetrievalHandler({ url: PIPELINE_TARGET, serviceKey, makeBackend: () => backend })
  for (const body of [{ action: 'status' }, { action: 'retrieval', apply: true, input: { mode: 'resume', run_id } }]) {
    const response = await handler(request(body))
    assert.equal(response.status, 502)
    assert.ok(!(await response.text()).includes('private'))
  }
})

test('opaque server key is required independently of gateway JWT and still denies browser origin', async () => {
  const f = fixture()
  const opaqueKey = 'sb_secret_test_server_only'
  const handler = createCaptureRetrievalHandler({ url: PIPELINE_TARGET, serviceKey: opaqueKey, makeBackend: () => f.backend })
  for (const headers of [
    {}, { Authorization: 'Bearer anon' }, { Authorization: 'Bearer user' },
    { Authorization: 'Bearer ' + opaqueKey },
    { apikey: 'sb_publishable_test' }, { apikey: 'sb_secret_wrong' },
    { apikey: opaqueKey + ', sb_secret_wrong' },
  ]) assert.equal((await handler(request({ action: 'status' }, headers))).status, 401)
  assert.equal((await handler(request({ action: 'status' }, { apikey: opaqueKey, Origin: 'https://example.org' }))).status, 403)
  assert.equal(f.calls.length, 0)
  const response = await handler(request({ action: 'status' }, { apikey: opaqueKey, Authorization: 'Bearer gateway-verified-token' }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { intake: { pending: 2 }, changes: { pending: 3 } })
  assert.deepEqual(f.calls, [['intake', 'status'], ['changes', 'status']])
})

test('operator transport sends opaque keys only as apikey and preserves legacy JWT transport', async () => {
  for (const key of ['sb_secret_test_server_only', serviceKey]) {
    const sent = []
    const backend = createOperatorBackend({ url: PIPELINE_TARGET, key, fetchImpl: async (url, init) => {
      sent.push({ url, init })
      return new Response(JSON.stringify({ pending: 0 }), { status: 200 })
    } })
    assert.deepEqual(await backend.intake('status'), { pending: 0 })
    assert.equal(sent[0].url, PIPELINE_TARGET + '/rest/v1/rpc/mip_pipeline_v1')
    assert.equal(sent[0].init.headers.apikey, key)
    assert.equal(sent[0].init.headers.Authorization, key.startsWith('sb_secret_') ? undefined : 'Bearer ' + key)
    assert.deepEqual(JSON.parse(sent[0].init.body), { p_action: 'status', p_input: {} })
    assert.equal(sent[0].init.redirect, 'error')
  }
})
