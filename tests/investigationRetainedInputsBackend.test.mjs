import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { retainedInputIndex, searchRetainedInputs, selectedRetainedInput } from '../src/lib/investigationRetainedInputs.js'

test('actual saved observations expose capture and record-version search without later-state leakage or writes', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const user = randomUUID(), outsider = randomUUID(), investigation = randomUUID()
  await db.query('insert into public.mip_profiles(id) values($1),($2)', [user, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','investigation_change_briefings_v1','investigation_workspace_batch_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  await db.exec('alter table evidence_pipeline.evidence_changes alter column position restart with 9007199254740993')
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
  await intake('enqueue', { run_id: 'retained-search-fixture', article: { url: 'https://example.org/retained-search', title: 'Synthetic original report', outlet: 'Fixture', summary: '💡 Original retained text.', published_at: '2019-01-01T00:00:00Z' } })
  const job = await intake('claim'), capture = await intake('finish', { job_id: job.id, lease_token: job.lease_token })
  const candidate = await intake('candidate', { capture_id: capture.capture_id, candidate_key: 'search', candidate_kind: 'claim', statement: 'Original retained text.', source_field: 'summary', span_start: 2, span_end: 25, excerpt: 'Original retained text.', extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  const observation1 = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const state = { question: 'What is retained?', scope_note: 'Synthetic search scope.', canonical_subject: null,
    time_range: { from: null, to: null, meaning: 'Unspecified source/event period.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
  const version1 = await ws('put', { investigation_id: investigation, version_id: randomUUID(), previous_version_id: null, observation_id: observation1.id, state, change_reason: 'Synthetic baseline.' })
  await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'viewer', reason: 'Synthetic assignment.' })
  const readWs = versionId => ws('read', { user_id: user, investigation_id: investigation, version_id: versionId })
  const original = await readWs(version1.id)
  // Change the fixture's current article; the queue retains this as a record version.
  await db.query("update public.articles set title='Later title needle', source_status='corrected' where url='https://example.org/retained-search'")
  const observation2 = await observe('observe', { observation_id: randomUUID(), previous_observation_id: observation1.id, candidate_ids: [candidate] })
  const version2 = await ws('put', { investigation_id: investigation, version_id: randomUUID(), previous_version_id: version1.id, observation_id: observation2.id, state, change_reason: 'Retained current-record update.' })
  const later = await readWs(version2.id), oldIndex = retainedInputIndex(original), index = retainedInputIndex(later)
  assert.equal(index.excluded, 0); assert.ok(index.rows.every(row => typeof row.position === 'string' && BigInt(row.position) > BigInt(Number.MAX_SAFE_INTEGER)))
  const captures = searchRetainedInputs(index, 'original retained text', 'capture')
  assert.equal(captures.rows.length, 1); assert.equal(captures.rows[0].input.capture.payload.summary, '💡 Original retained text.')
  const records = searchRetainedInputs(index, 'Later title needle', 'record_version')
  assert.equal(records.rows.length, 1); assert.equal(records.rows[0].input.record_version.payload.source_status, 'corrected')
  assert.equal(searchRetainedInputs(oldIndex, 'Later title needle').rows.length, 0)
  const selection = { investigationId: investigation, versionId: version2.id, observationId: observation2.id, position: records.rows[0].position }
  assert.equal(selectedRetainedInput(later, selection).id, records.rows[0].id)
  assert.equal(selectedRetainedInput(original, selection), null)
  assert.deepEqual((await readWs(version1.id)).observation.snapshot, original.observation.snapshot)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 0)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.assessments')).rows[0].n, 0)
  await assert.rejects(ws('read', { user_id: outsider, investigation_id: investigation, version_id: version2.id }), e => e.code === '42501')
  await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'revoked', reason: 'Synthetic revocation.' })
  await assert.rejects(readWs(version2.id), e => e.code === '42501')
})
