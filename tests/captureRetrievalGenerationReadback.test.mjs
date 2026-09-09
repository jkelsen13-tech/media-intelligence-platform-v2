import test from 'node:test'
import assert from 'node:assert/strict'
import { runCaptureRetrieval } from '../supabase/functions/_shared/captureRetrieval.mjs'

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const base = () => ({
  id: id(2), job_id: id(1), source_capture_id: id(6),
  contract: 'capture-lexical-1', snapshot_hash: 'a'.repeat(64),
  targets: [id(4), id(5)], next_index: 0, is_refresh: false, completed_at: null,
})
const done = run => ({ ...run, next_index: run.targets.length, completed_at: '2026-09-09T00:00:00.123456Z' })
const input = { mode: 'resume', run_id: id(2), lease_token: id(3) }
const noCompletion = result => {
  assert.equal(result.state, 'indeterminate')
  assert.ok(!('work_ref' in result))
  assert.ok(!('scanned' in result))
}

test('completion readback cannot substitute any immutable generation field', async () => {
  const variants = [
    r => ({ ...r, job_id: id(9) }),
    r => ({ ...r, source_capture_id: id(7) }),
    r => ({ ...r, snapshot_hash: 'b'.repeat(64) }),
    r => ({ ...r, is_refresh: true }),
    r => ({ ...r, targets: [id(4), id(8)] }),
    r => ({ ...r, targets: [], next_index: 0 }),
  ]
  for (const change of variants) {
    const initial = base(); let reads = 0
    const result = await runCaptureRetrieval({ retrieval: async action =>
      action === 'page' ? { coverage: 'complete' } : ++reads === 1 ? initial : done(change(initial)),
      changes: () => assert.fail('no compensating queue mutation'),
    }, input)
    noCompletion(result)
  }
})

test('manifest validation rejects duplicates, reordered targets, source inclusion and malformed identities', async () => {
  const bad = [
    { targets: [id(4), id(4)] }, { targets: [id(5), id(4)] },
    { targets: [id(4), id(6)] }, { targets: ['not-a-capture'] },
    { source_capture_id: null }, { snapshot_hash: 'unverified' },
    { targets: ['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000A'] },
  ]
  for (const fields of bad) {
    let pages = 0
    const result = await runCaptureRetrieval({ retrieval: async action => {
      if (action === 'page') pages++
      return done({ ...base(), ...fields })
    } }, input)
    noCompletion(result); assert.equal(pages, 0)
  }
})

test('malformed initial generation cannot be laundered by a subsequent valid completion', async () => {
  let reads = 0
  const result = await runCaptureRetrieval({ retrieval: async action => {
    assert.equal(action, 'read')
    return ++reads === 1 ? { ...base(), snapshot_hash: null } : done(base())
  } }, input)
  noCompletion(result)
})

test('shared backend objects cannot mutate the retained generation comparison', async () => {
  const run = base()
  const result = await runCaptureRetrieval({ retrieval: async action => {
    if (action === 'page') {
      run.targets.splice(0, 2, id(8))
      run.snapshot_hash = 'b'.repeat(64)
      Object.assign(run, done(run))
      return { coverage: 'complete' }
    }
    return run
  } }, input)
  noCompletion(result)
})

test('partial progress and completed timestamp cannot regress between observations', async () => {
  for (const [initial, later] of [
    [{ ...base(), next_index: 1 }, base()],
    [done(base()), { ...done(base()), completed_at: '2026-09-09T00:00:00.123457Z' }],
    [done(base()), base()],
  ]) {
    let reads = 0
    const result = await runCaptureRetrieval({ retrieval: async action =>
      action === 'page' ? { coverage: 'partial', run_id: id(2) } : ++reads === 1 ? initial : later,
    }, { ...input, maxPages: 1 })
    noCompletion(result)
  }
})

test('unchanged generation still recovers lost committed responses without returning manifest or lease', async () => {
  let run = base()
  const result = await runCaptureRetrieval({ retrieval: async action => {
    if (action === 'page') { run = done(run); throw new Error('lost committed response') }
    return run
  } }, input)
  assert.equal(result.state, 'completed')
  assert.equal(result.targets, 2)
  assert.equal(result.scanned, 2)
  for (const key of ['source_capture_id', 'snapshot_hash', 'lease_token']) assert.ok(!(key in result))
})

test('initial transport failure may still recover the explicitly requested durable run', async () => {
  let reads = 0
  const result = await runCaptureRetrieval({ retrieval: async action => {
    assert.equal(action, 'read')
    if (++reads === 1) throw new Error('transport unavailable')
    return done(base())
  } }, input)
  assert.equal(result.state, 'completed')
  assert.equal(result.pages, 0)
})
