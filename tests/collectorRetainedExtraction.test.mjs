import test from 'node:test'
import assert from 'node:assert/strict'
import {runQikIngestCollector} from '../supabase/qualification/qik-ingest/collector.mjs'
import {createDisposableDb, loadQikIngest, enableDisposableWriter, createPipelineRpc, rpc} from './qikIngestTestKit.mjs'

const token = 'qik-ingest-disposable-test-token'
const sentence = 'Officials reportedly approved the council funding proposal on Tuesday.'
const feed = '<rss><channel><item><title>New council report</title><link>https://news.example/extracted-feed</link><description>'
  + sentence + '</description></item></channel></rss>'

async function fixture(t) {
  const {db, exec} = await createDisposableDb()
  t.after(() => db.close())
  await loadQikIngest(exec)
  await enableDisposableWriter(db)
  const pipelineRpc = createPipelineRpc(db)
  const run = (runId, pipeline = pipelineRpc) => runQikIngestCollector({
    rpc: rpc(db), pipelineRpc: pipeline, token, runId, fetchText: async () => feed,
  })
  return {db, pipelineRpc, run}
}

test('real collector performs mandatory capture-bound pending extraction and duplicate recovery', async t => {
  const {db, run} = await fixture(t)
  const first = await run('capture-extract-first')
  assert.equal(first.body.state, 'completed')
  assert.equal(first.body.extracted_captures, 1)
  assert.equal(first.body.extraction_incomplete, 0)
  const rows = (await db.query(`select c.id,c.capture_id,c.review_state,c.statement,c.source_field,
    c.span_start,c.span_end,a.content_hash,a.payload,j.state
    from evidence_pipeline.evidence_candidates c
    join evidence_pipeline.article_captures a on a.id=c.capture_id
    join evidence_pipeline.import_jobs j on j.id=a.job_id`)).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].review_state, 'pending')
  assert.equal(rows[0].state, 'completed')
  assert.equal(rows[0].statement, sentence)
  assert.equal(rows[0].source_field, 'summary')
  assert.equal(Array.from(rows[0].payload.summary).slice(rows[0].span_start, rows[0].span_end).join(''), sentence)
  const duplicate = await run('capture-extract-duplicate')
  assert.equal(duplicate.body.inserted, 0)
  assert.equal(duplicate.body.duplicates, 1)
  assert.equal(duplicate.body.extracted_captures, 1)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.evidence_candidates')).rows[0].n, 1)
  const article = (await db.query("select reader_state,claims from public.articles where url='https://news.example/extracted-feed'")).rows[0]
  assert.equal(article.reader_state, 'pending_review')
  assert.deepEqual(article.claims, [])
})

test('missing or interrupted extraction cannot advertise a completed source; identical delivery retries', async t => {
  const {db, pipelineRpc, run} = await fixture(t)
  const wrapped = async (action, input) => pipelineRpc(action, input)
  wrapped.claimBound = pipelineRpc.claimBound
  wrapped.readJobStates = pipelineRpc.readJobStates
  const missing = await run('capture-extract-missing', wrapped)
  assert.equal(missing.body.state, 'completed_with_errors')
  assert.equal(missing.body.inserted, 1)
  assert.equal(missing.body.source_failures, 1)
  assert.equal(missing.body.extraction_incomplete, 1)
  assert.equal(missing.body.sources[0].error, 'retained_extraction_required')
  wrapped.extractCapture = async ({capture_id}) => ({state: 'incomplete', capture_id})
  const interrupted = await run('capture-extract-interrupted', wrapped)
  assert.equal(interrupted.body.state, 'failed')
  assert.equal(interrupted.body.sources[0].state, 'failed')
  assert.equal(interrupted.body.extraction_incomplete, 1)
  const recovered = await run('capture-extract-recovered')
  assert.equal(recovered.body.state, 'completed')
  assert.equal(recovered.body.extracted_captures, 1)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.evidence_candidates')).rows[0].n, 1)
})

test('capture readback requires exact completed job pair and is not a browser capability', async t => {
  const {db, run} = await fixture(t)
  await run('capture-extract-auth')
  const pair = (await db.query('select id,job_id from evidence_pipeline.article_captures')).rows[0]
  await assert.rejects(db.query('select public.mip_qik_ingest_capture_for_job($1::uuid,$2::uuid)',
    ['00000000-0000-4000-8000-000000000099', pair.id]), /retained_capture_unavailable/)
  await db.exec('set role anon')
  await assert.rejects(db.query('select public.mip_qik_ingest_capture_for_job($1::uuid,$2::uuid)',
    [pair.job_id, pair.id]), /permission denied|42501/i)
  await db.exec('reset role')
})

test('collector extracts capture recovered after committed finish response is lost', async t => {
  const {db, pipelineRpc, run} = await fixture(t)
  const wrapped = async (action, input) => {
    const result = await pipelineRpc(action, input)
    if (action === 'finish') throw Error('lost_finish_response')
    return result
  }
  wrapped.claimBound = pipelineRpc.claimBound
  wrapped.readJobStates = pipelineRpc.readJobStates
  wrapped.extractCapture = pipelineRpc.extractCapture
  const result = await run('capture-extract-lost-finish', wrapped)
  assert.equal(result.body.inserted, 1)
  assert.equal(result.body.extracted_captures, 1)
  assert.equal(result.body.state, 'completed_with_errors')
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.evidence_candidates')).rows[0].n, 1)
})
