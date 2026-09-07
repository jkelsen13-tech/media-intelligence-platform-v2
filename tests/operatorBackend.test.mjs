import test from 'node:test'
import assert from 'node:assert/strict'
import { createOperatorBackend, PIPELINE_TARGET } from '../scripts/operatorBackend.mjs'
import { runCaptureRetrieval, runOperatorCommand } from '../scripts/runCaptureRetrieval.mjs'

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const job_id = id(1), run_id = id(2), lease_token = id(3)
const base = () => ({ id: run_id, job_id, contract: 'capture-lexical-1', targets: [id(4), id(5)], next_index: 0, is_refresh: false, completed_at: null })
const done = run => ({ ...run, next_index: run.targets.length, completed_at: '2026-09-07T00:00:00Z' })

test('operator facets share the pinned target, credentials and fixed RPC routes', async () => {
  const calls = []
  const backend = createOperatorBackend({ url: PIPELINE_TARGET + '/', key: 'test-only', fetchImpl: async (...args) => { calls.push(args); return Response.json(null) } })
  await backend.intake('status'); await backend.changes('status'); await backend.retrieval('read', { run_id })
  assert.deepEqual(calls.map(([url]) => url), ['mip_pipeline_v1', 'mip_evidence_changes_v1', 'mip_capture_retrieval_v1'].map(name => `${PIPELINE_TARGET}/rest/v1/rpc/${name}`))
  for (const [, init] of calls) {
    assert.equal(init.headers.Authorization, 'Bearer test-only'); assert.equal(init.headers.apikey, 'test-only')
    assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal)
  }
  assert.deepEqual(JSON.parse(calls[2][1].body), { p_action: 'read', p_input: { run_id } })
  await assert.rejects(backend.retrieval('finish')); await assert.rejects(backend.intake('../other')); await assert.rejects(backend.changes('input', []))
  assert.equal(calls.length, 3)
  for (const url of ['https://other.supabase.co', PIPELINE_TARGET + '/rest', PIPELINE_TARGET + '.evil']) assert.throws(() => createOperatorBackend({ url, key: 'test' }))
})

test('transport distinguishes malformed success from an empty claim and sanitizes failures', async () => {
  const backend = response => createOperatorBackend({ url: PIPELINE_TARGET, key: 'test', fetchImpl: async () => response }).intake
  assert.equal(await backend(Response.json(null))('claim'), null)
  await assert.rejects(backend(new Response('secret html'))('claim'), { code: 'invalid_response' })
  await assert.rejects(backend(new Response('secret html', { status: 503 }))('claim'), { code: 'http_503' })
  await assert.rejects(backend(Response.json({ code: '23514', message: 'private text' }, { status: 400 }))('claim'), error => error.code === '23514' && !error.message.includes('private'))
})

test('bounded runner pauses, resumes and reports only durable completion', async () => {
  let run = base(); const actions = []
  const backend = { retrieval: async (action, input) => {
    actions.push(action)
    if (action !== 'page') return run
    assert.equal(input.lease_token, lease_token); assert.equal(input.limit, 1)
    run = { ...run, next_index: run.next_index + 1 }
    if (run.next_index === 2) { run = done(run); return { coverage: 'complete' } }
    return { coverage: 'partial', run_id }
  } }
  const partial = await runCaptureRetrieval(backend, { mode: 'start', job_id, lease_token, maxPages: 1, pageSize: 1 })
  assert.equal(partial.state, 'partial'); assert.equal(partial.scanned, 1); assert.equal(partial.pages, 1)
  const complete = await runCaptureRetrieval(backend, { mode: 'resume', run_id, lease_token, pageSize: 1 })
  assert.equal(complete.state, 'completed'); assert.equal(complete.work_ref, `capture-retrieval:${run_id}`)
  const again = await runCaptureRetrieval(backend, { mode: 'resume', run_id })
  assert.equal(again.state, 'completed'); assert.equal(again.pages, 0)
  assert.equal(actions.filter(x => x === 'page').length, 2)
  assert.ok(!JSON.stringify(complete).includes(lease_token))
})

test('lost committed page response is recovered through readback without queue compensation', async () => {
  let run = base()
  const backend = { retrieval: async action => {
    if (action === 'page') { run = done(run); throw Object.assign(new Error('lost'), { code: 'network_error' }) }
    return run
  }, changes: () => assert.fail('no queue mutation') }
  const result = await runCaptureRetrieval(backend, { mode: 'start', job_id, lease_token })
  assert.equal(result.state, 'completed'); assert.equal(result.pages, 1)
})

test('lost start and unavailable readback remain indeterminate', async () => {
  const failed = { retrieval: async () => { throw new Error('secret response') } }
  const start = await runCaptureRetrieval(failed, { mode: 'start', job_id, lease_token })
  assert.equal(start.state, 'indeterminate'); assert.equal(start.job_id, job_id)
  assert.ok(!JSON.stringify(start).includes('secret'))
  const resume = await runCaptureRetrieval(failed, { mode: 'resume', run_id, lease_token })
  assert.equal(resume.code, 'check_durable_run_state')
})

test('expired lease and misleading receipt never report uncommitted work complete', async () => {
  for (const response of [() => ({ coverage: 'complete' }), () => { throw Object.assign(new Error('expired lease'), { code: 'P0001' }) }]) {
    const result = await runCaptureRetrieval({ retrieval: async action => action === 'page' ? response() : base() }, { mode: 'resume', run_id, lease_token })
    assert.notEqual(result.state, 'completed'); assert.equal(result.scanned, 0)
  }
  const invalid = await runCaptureRetrieval({ retrieval: async () => ({ ...done(base()), next_index: 0 }) }, { mode: 'resume', run_id })
  assert.equal(invalid.state, 'indeterminate')
})

test('refresh and refresh resume omit leases while initial runs require them', async () => {
  let run = { ...base(), is_refresh: true }
  const backend = { retrieval: async (action, input) => {
    assert.ok(!('lease_token' in input))
    if (action === 'page') { run = done(run); return { coverage: 'complete' } }
    return run
  } }
  assert.equal((await runCaptureRetrieval(backend, { mode: 'refresh', job_id })).state, 'completed')
  assert.equal((await runCaptureRetrieval(backend, { mode: 'resume', run_id })).state, 'completed')
  let pages = 0
  const missing = await runCaptureRetrieval({ retrieval: async action => { if (action === 'page') pages++; return base() } }, { mode: 'resume', run_id })
  assert.equal(missing.code, 'lease_required'); assert.equal(pages, 0)
})

test('invalid options and missing apply fail before opening the backend', async () => {
  const backend = { retrieval: () => assert.fail('unexpected request') }
  for (const input of [null, {}, { mode: 'start', job_id }, { mode: 'resume', run_id, maxPages: 81 }, { mode: 'resume', run_id, pageSize: 0 }, { mode: 'refresh', job_id, lease_token }, { mode: 'resume', run_id, url: 'https://elsewhere' }]) await assert.rejects(runCaptureRetrieval(backend, input))
  const deps = { makeBackend: () => assert.fail('unexpected backend'), read: () => assert.fail('unexpected input read') }
  await assert.rejects(runOperatorCommand(['retrieval', 'input.json'], deps))
  await assert.rejects(runOperatorCommand(['retrieval', 'input.json', '--apply', '--force'], deps))
})

test('operator status combines both queues without taking a lease', async () => {
  const calls = []
  const result = await runOperatorCommand(['status'], { env: {}, makeBackend: () => ({
    intake: async action => { calls.push(action); return ['intake'] },
    changes: async action => { calls.push(action); return ['changes'] },
  }) })
  assert.deepEqual(calls, ['status', 'status']); assert.deepEqual(result, { intake: ['intake'], changes: ['changes'] })
})

test('zero-target completion still calls the database page before reporting completion', async () => {
  let run = { ...base(), targets: [] }; let pages = 0
  const result = await runCaptureRetrieval({ retrieval: async action => {
    if (action === 'page') { pages++; run = done(run); return { coverage: 'complete' } }
    return run
  } }, { mode: 'start', job_id, lease_token })
  assert.equal(result.state, 'completed'); assert.equal(pages, 1); assert.equal(result.targets, 0)
})

test('approved command validates input before creating a backend and sends no file fields to RPC', async () => {
  let created = 0
  const deps = { env: {}, read: async () => ({ mode: 'resume', run_id }), makeBackend: () => {
    created++; return { retrieval: async (action, input) => { assert.equal(action, 'read'); assert.deepEqual(input, { run_id }); return done(base()) } }
  } }
  const result = await runOperatorCommand(['retrieval', 'input.json', '--apply'], deps)
  assert.equal(result.state, 'completed'); assert.equal(created, 1)
  await assert.rejects(runOperatorCommand(['retrieval', 'input.json', '--apply'], { ...deps, read: async () => ({ mode: 'all' }) }))
  assert.equal(created, 1)
})
