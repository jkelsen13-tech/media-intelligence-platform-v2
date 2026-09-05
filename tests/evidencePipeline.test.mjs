import test from 'node:test'
import assert from 'node:assert/strict'
import { validateArticle, enqueueManifest, runWorker, createPipelineRpc, PIPELINE_TARGET } from '../scripts/evidencePipeline.mjs'

const article = { url: 'https://example.org/report', title: 'Retained report', outlet: 'Example' }
test('manifest dry run validates all records without calling a writer', async () => {
  const r = await enqueueManifest(() => assert.fail('unexpected write'), { run_id: 'test', articles: [article] })
  assert.equal(r.dry_run, true)
  let calls = 0
  await assert.rejects(enqueueManifest(() => calls++, { run_id: 'test', articles: [article, { ...article, title: '' }] }, { apply: true }))
  assert.equal(calls, 0)
})
test('intake rejects publication flags, credentials in URL, schemes and oversized payloads', () => {
  for (const extra of [{ reader_state: 'eligible' }, { url: 'file:///tmp/a' }, { url: 'https://user:password@example.org/' }, { url: 'https://example.org/a b' }, { body_text: 'x'.repeat(250000) }, { published_at: 'never' }]) {
    assert.throws(() => validateArticle({ ...article, ...extra }))
  }
})
test('idempotent enqueue counts unique jobs while retaining input receipts', async () => {
  const r = await enqueueManifest(async () => 'job1', { run_id: 'test', articles: [article, article] }, { apply: true })
  assert.equal(r.unique_jobs, 1)
  assert.equal(r.received, 2)
})
test('worker bounds work and records transient failure for durable retry', async () => {
  const calls = []
  const report = await runWorker(async (action, input) => {
    calls.push({ action, input })
    if (action === 'claim') return { id: 'job1', lease_token: 'token1' }
    if (action === 'finish') throw Object.assign(new Error('unavailable'), { code: 'http_503' })
    return 'retry_wait'
  }, { maxJobs: 1 })
  assert.equal(calls.length, 3)
  assert.equal(calls[2].input.retryable, true)
  assert.equal(report.failed[0].state, 'retry_wait')
})
test('permanent failure is not retried', async () => {
  const r = await runWorker(async (action, input) => {
    if (action === 'claim') return { id: 'job1', lease_token: 'token1' }
    if (action === 'finish') throw Object.assign(new Error('invalid'), { code: '23514' })
    assert.equal(input.retryable, false)
    return 'dead_letter'
  }, { maxJobs: 1 })
  assert.equal(r.failed[0].state, 'dead_letter')
})
test('lost commit response never triggers destructive compensation or reports success', async () => {
  const r = await runWorker(async action => {
    if (action === 'claim') return { id: 'job1', lease_token: 'token1' }
    throw Object.assign(new Error('lost response'), { code: 'network_error' })
  }, { maxJobs: 1 })
  assert.equal(r.completed.length, 0)
  assert.equal(r.indeterminate.length, 1)
})
test('empty queue stops immediately; unbounded work is rejected', async () => {
  let calls = 0
  const r = await runWorker(async () => { calls++; return null })
  assert.equal(calls, 1)
  assert.equal(r.completed.length, 0)
  await assert.rejects(runWorker(() => {}, { maxJobs: 101 }))
})
test('RPC enforces V2 origin and keeps raw server messages out of errors', async () => {
  assert.throws(() => createPipelineRpc({ url: 'https://other.supabase.co', key: 'test' }))
  const rpc = createPipelineRpc({ url: PIPELINE_TARGET, key: 'test', fetchImpl: async () => new Response(JSON.stringify({ code: '23514', message: 'secret contents' }), { status: 400 }) })
  await assert.rejects(rpc('claim'), error => error.code === '23514' && !error.message.includes('secret'))
})
