import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { savedVersionNavigation } from '../src/lib/investigationVersionNavigation.js'

test('database predecessor traversal and latest reads preserve immutable state and the explicit personal review baseline', async t => {
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
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
  await intake('enqueue', { run_id: 'navigation-fixture', article: { url: 'https://example.org/navigation', title: 'Synthetic retained report', outlet: 'Fixture', summary: 'A report.', published_at: '2019-01-01T00:00:00Z' } })
  const job = await intake('claim'), capture = await intake('finish', { job_id: job.id, lease_token: job.lease_token })
  const candidate = await intake('candidate', { capture_id: capture.capture_id, candidate_key: 'navigation', candidate_kind: 'claim', statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  const observation = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const versions = [], baseState = { question: 'Synthetic original question?', scope_note: 'Synthetic scope.', canonical_subject: null,
    time_range: { from: null, to: null, meaning: 'Unspecified source/event period.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
  const append = async revision => {
    const state = { ...baseState, question: `Synthetic question ${revision}?` }
    const version = await ws('put', { investigation_id: investigation, version_id: randomUUID(), previous_version_id: versions.at(-1)?.id ?? null,
      observation_id: observation.id, state, change_reason: `Recorded reason ${revision}.` })
    versions.push(version); return version
  }
  await append(1); await append(2)
  await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'reviewer', reason: 'Synthetic assignment.' })
  const receipt = await ws('mark_review', { user_id: user, investigation_id: investigation, version_id: versions[1].id, receipt_id: randomUUID(), previous_receipt_id: null })
  await append(3)
  const readWs = versionId => ws('read', { user_id: user, investigation_id: investigation, ...(versionId ? { version_id: versionId } : {}) })
  const head = await readWs(), second = await readWs(savedVersionNavigation(head).previous), first = await readWs(savedVersionNavigation(second).previous)
  assert.equal(head.version.revision, 3); assert.equal(second.version.revision, 2); assert.equal(first.version.revision, 1)
  assert.equal(savedVersionNavigation(first).first, true)
  assert.equal(first.comparison.mode, 'historical_before_review'); assert.equal(first.comparison.definition_changes, null)
  for (const bundle of [head, second, first]) { assert.equal(bundle.review.id, receipt.id); assert.equal(bundle.observation.id, observation.id) }
  const firstOriginal = structuredClone(first.version)
  await append(4)
  assert.equal((await readWs()).version.id, versions[3].id)
  assert.deepEqual((await readWs(versions[0].id)).version, firstOriginal)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_review_receipts')).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.investigation_observations')).rows[0].n, 1)
  assert.equal((await db.query('select count(*)::int n from evidence_pipeline.assessments')).rows[0].n, 0)
  await assert.rejects(ws('read', { user_id: outsider, investigation_id: investigation, version_id: versions[0].id }), e => e.code === '42501')
  await assert.rejects(ws('read', { user_id: user, investigation_id: randomUUID(), version_id: versions[0].id }), e => e.code === '42501')
  await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'viewer', reason: 'Synthetic viewer.' })
  assert.equal((await readWs(versions[0].id)).version.id, versions[0].id)
  await ws('set_access', { investigation_id: investigation, user_id: user, access_role: 'revoked', reason: 'Synthetic revocation.' })
  await assert.rejects(readWs(versions[0].id), e => e.code === '42501')
  await assert.rejects(readWs(), e => e.code === '42501')
})
