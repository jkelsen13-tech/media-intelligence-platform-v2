import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Distinct coverage: the legacy all-pending acknowledgement counterexample,
// exercised against the survivor's actual migrations and current claim gates.
test('finishing an older capture cannot consume a later correction or another source', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = path => readFile(new URL(path, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec(await read('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'))
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_change_queue_v1', 'evidence_change_producer_claim_v1', 'evaluated_record_claim_v1']) {
    const matches = files.filter(path => path.endsWith('_' + suffix + '.sql'))
    assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const rpc = async (name, action, input) => (await db.query('select public.' + name + '($1,$2::jsonb) r', [action, JSON.stringify(input)])).rows[0].r
  const intake = (action, input = {}) => rpc('mip_pipeline_v1', action, input)
  const queue = (action, input = {}) => rpc('mip_evidence_changes_v1', action, input)
  const capture = async (url, title) => {
    await intake('enqueue', { run_id: 'generation-isolation-fixture', article: { url, title, outlet: 'Fixture publisher', summary: title, published_at: '2020-01-01T00:00:00Z' } })
    const job = await intake('claim')
    return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const claim = async () => (await db.query("select public.mip_evidence_change_claim_v1('new_candidate_search','capture') r")).rows[0].r
  const finish = (job, receipt) => queue('finish', { job_id: job.id, lease_token: job.lease_token, receipt })
  const state = async id => (await db.query('select state from evidence_pipeline.change_jobs where id=$1', [id])).rows[0].state
  await db.exec('set role service_role')
  const original = await capture('https://example.invalid/same-source', 'Original retained wording')
  const olderJob = await claim()
  assert.equal(olderJob.change.capture_id, original.capture_id)
  const before = await queue('input', { job_id: olderJob.id })

  // Producer interleaving: both arrive after the original consumer's input read.
  const correction = await capture('https://example.invalid/same-source', 'Correction retained separately')
  const other = await capture('https://example.invalid/other-source', 'A later source')
  assert.notEqual(correction.capture_id, original.capture_id)
  const pending = (await db.query(`select j.id,c.capture_id,j.state from evidence_pipeline.change_jobs j
    join evidence_pipeline.evidence_changes c on c.position=j.change_position
    where j.route='new_candidate_search' and c.capture_id in ($1,$2) order by j.change_position`, [correction.capture_id, other.capture_id])).rows
  assert.equal(pending.length, 2)
  assert.ok(pending.every(job => job.state === 'pending'))
  const receipt = { work_ref: 'isolated-generation-test:' + original.capture_id, coverage: 'complete' }
  assert.equal(await finish(olderJob, receipt), 'completed')
  for (const job of pending) {
    assert.equal(await state(job.id), 'pending')
    await assert.rejects(finish({ ...job, lease_token: olderJob.lease_token }, receipt), /lease/)
  }
  assert.deepEqual(await queue('input', { job_id: olderJob.id }), before, 'the original exact input is retained')

  const next = await claim()
  assert.ok(pending.some(job => job.id === next.id))
  assert.notEqual(next.lease_token, olderJob.lease_token)
  assert.equal(await finish(olderJob, receipt), 'completed', 'late retry is idempotent only for the old job')
  assert.equal(await state(next.id), 'processing')
  assert.equal(await state(pending.find(job => job.id !== next.id).id), 'pending')
  const histories = (await db.query("select job_id,event from evidence_pipeline.change_job_events where event='completed'")).rows
  assert.deepEqual(histories.map(row => row.job_id), [olderJob.id])
  await db.exec('reset role')
})
