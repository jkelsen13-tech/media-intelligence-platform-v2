import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { savedDefinitionRevisions } from '../src/lib/investigationDefinitionRevisions.js'
import { resolveWorkspaceExcerpt } from '../src/lib/investigationWorkspaceClient.js'

test('real saved versions preserve deadline, hypothesis, stage and scope revisions with exact evidence and no automatic review', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const user = randomUUID(), outsider = randomUUID()
  await db.query('insert into public.mip_profiles(id) values($1),($2)', [user, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','investigation_change_briefings_v1','investigation_workspace_batch_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
  const add = async summary => {
    await intake('enqueue', { run_id: 'definition-fixture', article: { url: 'https://example.org/definition', title: 'Synthetic commitment', outlet: 'Fixture', summary, published_at: '2019-01-01T00:00:00Z' } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const original = '💡 A report was promised.', correction = '💡 A report was published.'
  const firstCapture = await add(original)
  const candidate = await intake('candidate', { capture_id: firstCapture.capture_id, candidate_key: 'revision', candidate_kind: 'claim', statement: 'A report was promised.', source_field: 'summary', span_start: 2, span_end: Array.from(original).length, excerpt: original.slice(3), extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  const observation1 = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const firstPosition = observation1.snapshot.inputs.find(i => i.capture?.id === firstCapture.capture_id).position
  const evidence = (position, raw) => ({ position, source_field: 'summary', span_start: 2, span_end: Array.from(raw).length, excerpt: Array.from(raw).slice(2).join(''), relation: 'context', note: 'Synthetic exact excerpt; semantic fit is not independently verified.' })
  const c = randomUUID(), h = randomUUID(), s = randomUUID(), implementation = randomUUID(), removed = randomUUID(), coverage = randomUUID(), investigation = randomUUID()
  const state1 = { question: 'Was the report published?', scope_note: 'Synthetic bounded collection.', canonical_subject: null,
    time_range: { from: null, to: null, meaning: 'Unspecified source/event interval.' }, unresolved_questions: ['Was the original deadline revised?'],
    coverage: [{ id: coverage, label: 'Fixture search', status: 'limited', source_classes: ['fixture'], languages: ['en'], regions: [], from: null, to: null, retained_text: 'summary_only', search_status: 'not_run', searched_at: null, method: 'No real retrieval.', limitations: ['Synthetic collection only.'] }],
    hypotheses: [{ id: h, statement: 'Publication may be delayed.', assumptions: ['Identity unresolved.'], would_strengthen: ['Cancellation record.'], would_weaken: ['Publication record.'], assessment_ids: [], evidence: [evidence(firstPosition, original)], remaining_uncertainty: 'No independently verified outcome.' }],
    commitments: [{ id: c, actor: 'Synthetic agency', statement: 'Publish a report.', scope: 'Fixture only.', conditions: [], deadline_text: 'By August 31.', success_criterion: 'A retained publication record.', remaining_uncertainty: 'Semantic fit is unverified.', stages: [
      { id: s, kind: 'commitment', status: 'reported', depends_on: [], coverage_ids: [], evidence: [evidence(firstPosition, original)], note: 'Announcement only.' },
      { id: implementation, kind: 'implementation', status: 'unknown', depends_on: [s], coverage_ids: [], evidence: [], note: 'Unresolved.' },
      { id: removed, kind: 'prerequisite', status: 'not_applicable', depends_on: [s], coverage_ids: [], evidence: [], note: 'Recorded branch.' },
    ] }],
  }
  const version1 = await ws('put', { investigation_id: investigation, version_id: randomUUID(), previous_version_id: null, observation_id: observation1.id, state: state1, change_reason: 'Fixture baseline.' })
  await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'reviewer', reason: 'Fixture assignment.' })
  const receipt = await ws('mark_review', { user_id: user, investigation_id: investigation, version_id: version1.id, receipt_id: randomUUID(), previous_receipt_id: null })
  const readWs = version => ws('read', { user_id: user, investigation_id: investigation, version_id: version })
  const correctionCapture = await add(correction)
  const observation2 = await observe('observe', { observation_id: randomUUID(), previous_observation_id: observation1.id, candidate_ids: [candidate] })
  const nextPosition = observation2.snapshot.inputs.find(i => i.capture?.id === correctionCapture.capture_id).position
  const state2 = structuredClone(state1)
  state2.commitments[0].deadline_text = 'By September 30.'
  state2.commitments[0].stages[1] = { ...state2.commitments[0].stages[1], status: 'observed', evidence: [evidence(nextPosition, correction)], note: 'A synthetic later record, not causal proof.' }
  state2.commitments[0].stages.pop()
  state2.hypotheses[0].statement = 'The publication record requires verification.'
  state2.hypotheses[0].evidence = [evidence(nextPosition, correction)]
  const version2 = await ws('put', { investigation_id: investigation, version_id: randomUUID(), previous_version_id: version1.id, observation_id: observation2.id, state: state2, change_reason: 'Revised deadline and retained publication report.' })
  const before = await readWs(version1.id), after = await readWs(version2.id), result = savedDefinitionRevisions(after, before)
  assert.equal(result.status, 'ready'); assert.equal(after.review.id, receipt.id)
  const commitment = result.rows.find(r => r.group === 'commitments')
  assert.deepEqual(commitment.fields.find(f => f.key === 'deadline_text'), { key: 'deadline_text', before: 'By August 31.', after: 'By September 30.' })
  assert.equal(commitment.stages.find(stage => stage.id === removed).action, 'removed')
  const refs = result.rows.find(r => r.group === 'hypotheses').fields.find(f => f.key === 'evidence')
  assert.equal(resolveWorkspaceExcerpt(before, refs.before[0]).excerpt, 'A report was promised.')
  assert.equal(resolveWorkspaceExcerpt(after, refs.after[0]).excerpt, 'A report was published.')
  assert.equal(resolveWorkspaceExcerpt(before, refs.after[0]), null)
  assert.deepEqual((await readWs(version1.id)).version.state, state1)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.assessments')).rows[0].n, 0)
  await assert.rejects(ws('read', { user_id: outsider, investigation_id: investigation, version_id: version1.id }), e => e.code === '42501')
  await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'revoked', reason: 'Fixture revoked.' })
  await assert.rejects(readWs(version1.id), e => e.code === '42501')
})
