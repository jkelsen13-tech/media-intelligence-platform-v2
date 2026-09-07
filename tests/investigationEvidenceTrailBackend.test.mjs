import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { savedAssessmentTrail, selectedContextUsers, retainedInputDates } from '../src/lib/investigationEvidenceTrail.js'
import { savedSourceHistory, compareRetainedCaptures } from '../src/lib/investigationSourceHistory.js'

test('real saved snapshots preserve a shared dependency diamond, exact positions and separate source dates', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  await db.exec('alter table evidence_pipeline.evidence_changes alter column position restart with 9007199254740993')
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), observe = rpc('mip_investigation_briefings_v1')
  const add = async (name, summary = 'A report.') => {
    await intake('enqueue', { run_id: 'trail-fixture', article: { url: `https://example.org/${name}`, title: name, outlet: 'Fixture', summary, published_at: '2019-01-01T01:02:03Z' } })
    const job = await intake('claim')
    return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const append = async (candidate, parents = [], predecessor = null) => {
    const context = await assess('context', { candidate_id: candidate, parents: parents })
    return assess('append', { candidate_id: candidate, parents: parents, predecessor_id: predecessor,
      algorithm_key: 'fixture', algorithm_version: randomUUID(), outcome: 'insufficient_evidence',
      rationale: 'Synthetic dependency record.', remaining_uncertainty: 'No substantive conclusion.', context_positions: context.context_positions })
  }
  const make = async (name, parents = []) => {
    const capture = await add(name)
    const candidate = await intake('candidate', { capture_id: capture.capture_id, candidate_key: name, candidate_kind: 'claim',
      statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
    return { capture, candidate, assessment: await append(candidate, parents) }
  }
  const root = await make('root'), left = await make('left', [root.assessment]), right = await make('right', [root.assessment])
  const selected = await make('selected', [left.assessment, right.assessment])
  const first = await observe('observe', { observation_id: randomUUID(), candidate_ids: [selected.candidate] })
  const bundle = { observation: first }
  await t.test('transitive closure is retained while selected assessments remain separate', () => {
    const trail = savedAssessmentTrail(bundle, selected.assessment)
    assert.deepEqual(first.snapshot.selected_assessment_ids, [selected.assessment])
    assert.equal(first.snapshot.assessments.length, 4)
    assert.equal(trail.dependencies.length, 3)
    assert.equal(trail.dependencies.filter(row => row.id === root.assessment).length, 1)
    assert.equal(trail.dependencies.find(row => row.id === root.assessment).kind, 'Earlier dependency')
    assert.ok(trail.dependencies.every(row => row.assessment))
    assert.ok(trail.inputs.every(row => row.input && typeof row.position === 'string' && BigInt(row.position) > BigInt(Number.MAX_SAFE_INTEGER)))
    const rootInput = trail.inputs.find(row => row.input.capture?.id === root.capture.capture_id)
    assert.deepEqual(selectedContextUsers(bundle, rootInput.position).map(row => row.id), [selected.assessment])
  })
  await t.test('publication, capture and queue timestamps use the actual backend fields', () => {
    const input = first.snapshot.inputs.find(row => row.capture?.id === root.capture.capture_id)
    const dates = retainedInputDates(input)
    assert.equal(Date.parse(dates.find(row => row.label === 'Source publication').value), Date.parse('2019-01-01T01:02:03Z'))
    assert.equal(dates.find(row => row.label === 'Capture saved').value, input.capture.captured_at)
    assert.equal(dates.find(row => row.label === 'Change queued').value, input.queued_at)
    assert.ok(input.capture.captured_at && input.queued_at)
  })
  await add('root', 'A changed report.')
  const replacement = await append(root.candidate, [], root.assessment)
  const second = await observe('observe', { observation_id: randomUUID(), candidate_ids: [selected.candidate], previous_observation_id: first.id })
  await t.test('source history uses SQL article identity and isolates new captures from prior assessment context', () => {
    const oldSource = savedSourceHistory(bundle).sources.find(row => row.articleId === root.capture.article_id)
    const newBundle = { observation: second }
    const newSource = savedSourceHistory(newBundle).sources.find(row => row.articleId === root.capture.article_id)
    assert.equal(oldSource.captures.length, 1)
    assert.equal(newSource.captures.length, 2)
    const [earlier, later] = newSource.captures
    const comparison = compareRetainedCaptures(newBundle, earlier.position, later.position)
    assert.equal(comparison.fields.find(row => row.field === 'summary').left, 'A report.')
    assert.equal(comparison.fields.find(row => row.field === 'summary').right, 'A changed report.')
    assert.equal(comparison.fields.find(row => row.field === 'summary').status, 'different')
    assert.deepEqual(comparison.assessments.map(row => [row.assessment.id, row.usesLeft, row.usesRight]), [[selected.assessment, true, false]])
    assert.equal(comparison.assessments[0].assessment.stale, true)
    assert.equal(compareRetainedCaptures(bundle, earlier.position, later.position), null)
    assert.equal(savedSourceHistory(newBundle).sources.length, 4) // same outlet never groups different articles
  })
  await t.test('later source changes and replacements do not rewrite the earlier observation', async () => {
    const saved = (await db.query('select snapshot from evidence_pipeline.investigation_observations where id=$1', [first.id])).rows[0].snapshot
    assert.deepEqual(saved, first.snapshot)
    assert.equal(saved.assessments.find(row => row.id === selected.assessment).stale, false)
    const currentTrail = savedAssessmentTrail({ observation: second }, selected.assessment)
    assert.equal(currentTrail.assessment.stale, true)
    assert.deepEqual(currentTrail.inputs.map(row => row.position), savedAssessmentTrail(bundle, selected.assessment).inputs.map(row => row.position))
    assert.ok(second.snapshot.inputs.length > first.snapshot.inputs.length)
    const rootTrail = savedAssessmentTrail({ observation: second }, root.assessment)
    const link = rootTrail.revisions.find(row => row.id === replacement)
    assert.equal(link.kind, 'Recorded replacement')
    assert.equal(link.assessment.id, replacement)
    assert.ok(currentTrail.dependencies.some(row => row.id === root.assessment))
    assert.ok(!currentTrail.dependencies.some(row => row.id === replacement))
    assert.equal(savedAssessmentTrail(bundle, root.assessment).revisions.length, 0)
  })
  await t.test('private observations remain unreadable to browser database roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select snapshot from evidence_pipeline.investigation_observations'), error => error.code === '42501')
      await db.exec('reset role')
    }
  })
})
