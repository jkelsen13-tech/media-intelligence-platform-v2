import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {
  buildRetainedClaimCandidates, createRetainedExtractionBackend, extractRetainedCapture, EXTRACTOR_VERSION,
} from '../supabase/qualification/collector-native-capture/retainedExtraction.mjs'
import {createDisposableDb, loadQikIngest, createPipelineRpc} from './qikIngestTestKit.mjs'
import {enqueueObserved, drainNativePipeline} from '../supabase/qualification/qik-ingest/nativeHandoff.mjs'

const id = '00000000-0000-4000-8000-000000000001'
const articleId = '00000000-0000-4000-8000-000000000002'
const sentence = 'Officials reportedly approved the council funding proposal on Tuesday.'
const second = 'The published document describes an additional public hearing next month.'
function capture(payload) {
  const payload_text = JSON.stringify(payload)
  return {id, article_id: articleId, payload_text,
    content_hash: createHash('sha256').update(payload_text).digest('hex')}
}

test('Unicode code-point spans locate repeated source sentences without normalization', () => {
  const source = '😀 Brief.  ' + sentence + '  ' + sentence
  const plan = buildRetainedClaimCandidates(capture({body_text: source}))
  assert.equal(plan.candidates.length, 2)
  assert.notEqual(plan.candidates[0].span_start, plan.candidates[1].span_start)
  for (const candidate of plan.candidates) {
    assert.equal(Array.from(source).slice(candidate.span_start, candidate.span_end).join(''), candidate.excerpt)
    assert.equal(candidate.statement, sentence)
    assert.equal(candidate.candidate_kind, 'claim')
    assert.match(candidate.remaining_uncertainty, /framing/)
    assert.match(candidate.remaining_uncertainty, /Not fact verification/)
    assert.equal(candidate.extractor_version, EXTRACTOR_VERSION)
    assert.equal(Object.hasOwn(candidate, 'review_state'), false)
  }
})

test('retained hash and capture identity are checked before any append', async () => {
  let writes = 0
  const good = capture({summary: sentence})
  const backend = {readCapture: async () => ({...good, payload_text: good.payload_text + ' '}),
    appendCandidate: async () => {writes++; return id}}
  await assert.rejects(extractRetainedCapture({backend, capture_id: id}), /hash_mismatch/)
  backend.readCapture = async () => ({...good, id: articleId})
  await assert.rejects(extractRetainedCapture({backend, capture_id: id}), /binding_mismatch/)
  assert.equal(writes, 0)
})

test('summary fallback and empty extraction report limited heuristic coverage', async () => {
  const plan = buildRetainedClaimCandidates(capture({body_text: null, summary: sentence, title: second}))
  assert.equal(plan.source_field, 'summary')
  assert.equal(plan.candidates.length, 1)
  const backend = {readCapture: async () => capture({title: 'Short title'}),
    appendCandidate: async () => {throw Error('must not write')}}
  const result = await extractRetainedCapture({backend, capture_id: id})
  assert.equal(result.state, 'no_candidates')
  assert.equal(result.coverage, 'bounded_sentence_heuristic')
  assert.equal(Object.hasOwn(result, 'not_reported'), false)
})

test('native retained extraction: exact spans, retry, revision isolation, no publication', async t => {
  const {db, exec} = await createDisposableDb()
  t.after(() => db.close())
  await loadQikIngest(exec)
  const pipelineRpc = createPipelineRpc(db)
  const article = {url: 'https://news.example/extraction', title: 'Retained extraction example',
    outlet: 'Example World', summary: null, body_text: '😀 Brief. ' + sentence + ' ' + second, published_at: null}
  const job = await enqueueObserved({pipelineRpc, runId: 'extraction-native-1', article})
  await drainNativePipeline({pipelineRpc, jobIds: [job]})
  const firstCapture = (await db.query('select id::text from evidence_pipeline.article_captures where job_id=$1::uuid', [job])).rows[0].id
  const native = createRetainedExtractionBackend(db)
  let writes = 0
  const interrupted = {
    readCapture: native.readCapture,
    appendCandidate: async candidate => {
      const committed = await native.appendCandidate(candidate)
      if (++writes === 2) throw Error('response_lost_after_commit')
      return committed
    },
  }
  const partial = await extractRetainedCapture({backend: interrupted, capture_id: firstCapture})
  assert.equal(partial.state, 'incomplete')
  assert.equal(partial.acknowledged_candidate_ids.length, 1)
  assert.equal(partial.retry_same_capture, true)
  const retried = await extractRetainedCapture({backend: native, capture_id: firstCapture})
  assert.equal(retried.state, 'candidates_retained')
  assert.equal(retried.candidate_ids.length, 2)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.evidence_candidates')).rows[0].n, 2)
  assert.equal(retried.candidate_ids[0], partial.acknowledged_candidate_ids[0])
  assert.deepEqual((await extractRetainedCapture({backend: native, capture_id: firstCapture})).candidate_ids, retried.candidate_ids)
  const rows = (await db.query(`select c.review_state, c.excerpt,
    substring(a.payload->>c.source_field from c.span_start+1 for c.span_end-c.span_start) as retained_span
    from evidence_pipeline.evidence_candidates c join evidence_pipeline.article_captures a on a.id=c.capture_id`)).rows
  for (const row of rows) {
    assert.equal(row.review_state, 'pending')
    assert.equal(row.excerpt, row.retained_span)
  }

  const revisionJob = await enqueueObserved({pipelineRpc, runId: 'extraction-native-2',
    article: {...article, body_text: 'The revised source says the council funding proposal is still awaiting approval.'}})
  await drainNativePipeline({pipelineRpc, jobIds: [revisionJob]})
  const revisionCapture = (await db.query('select id::text from evidence_pipeline.article_captures where job_id=$1::uuid', [revisionJob])).rows[0].id
  assert.notEqual(revisionCapture, firstCapture)
  const revision = await extractRetainedCapture({backend: native, capture_id: revisionCapture})
  assert.equal(revision.candidate_ids.length, 1)
  assert.ok(!retried.candidate_ids.includes(revision.candidate_ids[0]))
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.evidence_candidates where capture_id=$1::uuid', [firstCapture])).rows[0].n, 2)
  const publicArticle = (await db.query('select reader_state, claims, body_text from public.articles where url=$1', [article.url])).rows[0]
  assert.equal(publicArticle.reader_state, 'pending_review')
  assert.deepEqual(publicArticle.claims, [])
  assert.equal(publicArticle.body_text, article.body_text)
  await db.exec('set role anon')
  await assert.rejects(native.readCapture(firstCapture), /permission denied|42501/i)
  await db.exec('reset role')
})

test('selected sentence never binds to an identical substring in an excluded segment', () => {
  const source = 'X'.repeat(400) + sentence + 'continuation. ' + sentence
  const [candidate] = buildRetainedClaimCandidates(capture({body_text: source})).candidates
  assert.equal(candidate.span_start, Array.from(source.slice(0, source.lastIndexOf(sentence))).length)
  assert.notEqual(candidate.span_start, 400)
  const padded = ' '.repeat(400) + sentence + ' ' + sentence
  const [afterPadding] = buildRetainedClaimCandidates(capture({body_text: padded})).candidates
  assert.equal(afterPadding.span_start, Array.from(padded.slice(0, padded.lastIndexOf(sentence))).length)
})
