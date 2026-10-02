import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const read = p => readFile(new URL(p, import.meta.url), 'utf8')
test('native saved observation diffs retain explicit relevance declaration provenance', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec(await read('./changeQueueFixture.sql'))
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1']) {
    await db.exec(await read('../supabase/migrations/' + files.find(f => f.endsWith(`_${suffix}.sql`))))
  }
  await db.exec(await read('../supabase/source-proposals/assessment_relevant_inputs_v1.sql'))
  await db.exec('set role service_role')
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), brief = rpc('mip_investigation_briefings_v1')
  const scalar = async (sql, args) => Object.values((await db.query(sql, args)).rows[0])[0]
  const add = async url => {
    await intake('enqueue', { run_id: 'declaration-events-fixture', article: { url, title: 'Synthetic', outlet: 'Fixture', summary: 'A report.', published_at: '1990-01-01T00:00:00Z' } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const capture = await add('https://example.org/declaration-watched')
  const candidate = await intake('candidate', { capture_id: capture.capture_id, candidate_key: 'watched', candidate_kind: 'claim', statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  const position = await scalar('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [capture.capture_id])
  const observe = previous => brief('observe', { observation_id: randomUUID(), candidate_ids: [candidate], ...(previous ? { previous_observation_id: previous.id } : {}) })
  const initial = await observe()
  const declare = p => assess('declare_relevance', { candidate_id: candidate, position: p, selection_method: 'explicit-fixture-declaration', selection_ref: 'fixture:retained-relevance', rationale: 'Relevance provenance only; no support or truth determination.' })
  let watched, afterWatched, afterUnwatched
  await t.test('already watched retained input still produces a distinct declaration event with no new source', async () => {
    watched = await declare(position); afterWatched = await observe(initial)
    assert.deepEqual(afterWatched.snapshot.inputs, initial.snapshot.inputs)
    assert.equal(afterWatched.changes.some(c => c.kind === 'evidence_entered_observation'), false)
    assert.deepEqual(afterWatched.changes, [{ kind: 'relevant_input_declared', candidate_id: candidate, position,
      selection_method: watched.selection_method, selection_ref: watched.selection_ref, rationale: watched.rationale, declared_at: watched.declared_at }])
    assert.equal(afterWatched.publicly_eligible, false)
    assert.deepEqual(await brief('read', { observation_id: initial.id }), initial)
  })
  await t.test('newly selected unwatched input keeps native arrival event and adds declaration provenance', async () => {
    const foreign = await add('https://example.org/declaration-unwatched')
    const incomingPosition = await scalar('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [foreign.capture_id])
    const declared = await declare(incomingPosition); afterUnwatched = await observe(afterWatched)
    assert.ok(afterUnwatched.changes.some(c => c.kind === 'evidence_entered_observation' && c.position === incomingPosition))
    const events = afterUnwatched.changes.filter(c => c.kind === 'relevant_input_declared')
    assert.equal(events.length, 1); assert.equal(events[0].position, incomingPosition); assert.equal(events[0].declared_at, declared.declared_at)
  })
  await t.test('unchanged retry and fresh no-change observation never reannounce declarations', async () => {
    assert.deepEqual(await declare(position), watched)
    const unchanged = await observe(afterUnwatched)
    assert.deepEqual(unchanged.changes, [])
    assert.deepEqual(await brief('observe', { observation_id: afterWatched.id, previous_observation_id: initial.id, candidate_ids: [candidate] }), afterWatched)
  })
  await t.test('same immutable declaration across session time zones is not reannounced or rejected', async () => {
    await db.exec("set timezone='Asia/Kathmandu'")
    try {
      const shifted = await observe(afterUnwatched)
      assert.deepEqual(shifted.changes, [])
      assert.notEqual(shifted.snapshot.relevance_declarations[0].declared_at, afterUnwatched.snapshot.relevance_declarations[0].declared_at)
    } finally { await db.exec("set timezone='UTC'") }
  })
  await t.test('exact stored declaration identity rejects mutable conflict and malformed requests', async () => {
    await assert.rejects(assess('declare_relevance', { candidate_id: candidate, position, selection_method: 'explicit-fixture-declaration', selection_ref: 'fixture:retained-relevance', rationale: 'Changed.' }), /idempotency conflict/)
    await assert.rejects(assess('declare_relevance', { candidate_id: candidate, position: Number(position), selection_method: 'fixture', selection_ref: 'fixture', rationale: 'Fixture.' }), /invalid relevance/)
    await assert.rejects(assess('declare_relevance', { candidate_id: randomUUID(), position, selection_method: 'fixture', selection_ref: 'fixture', rationale: 'Fixture.' }), /unknown candidate/)
  })
  await t.test('retained tuple changes, removal, duplicates and missing inputs fail closed; legacy snapshots compare additively', async () => {
    const compare = (before, after) => db.query('select evidence_pipeline.diff_investigation_snapshots($1::jsonb,$2::jsonb) r', [before === null ? null : JSON.stringify(before), JSON.stringify(after)]).then(r => r.rows[0].r)
    const legacy = structuredClone(initial.snapshot); delete legacy.relevance_declarations
    assert.deepEqual(await compare(legacy, afterWatched.snapshot), afterWatched.changes)
    assert.deepEqual(await compare(null, afterWatched.snapshot), [])
    const changed = structuredClone(afterWatched.snapshot); changed.relevance_declarations[0].rationale = 'Changed retained reason.'
    await assert.rejects(compare(afterWatched.snapshot, changed), /retained relevance identity changed/)
    const removed = structuredClone(afterWatched.snapshot); removed.relevance_declarations = []
    await assert.rejects(compare(afterWatched.snapshot, removed), /retained relevance identity changed/)
    const duplicate = structuredClone(afterWatched.snapshot); duplicate.relevance_declarations.push(structuredClone(duplicate.relevance_declarations[0]))
    await assert.rejects(compare(initial.snapshot, duplicate), /duplicate retained relevance identity/)
    const absent = structuredClone(afterWatched.snapshot); absent.inputs = []
    await assert.rejects(compare(initial.snapshot, absent), /invalid retained relevance declaration tuple/)
    for (const mutate of [s => { s.relevance_declarations = null }, s => { s.relevance_declarations[0].change_position = Number(position) }, s => { s.relevance_declarations[0].declared_at = null }, s => { s.relevance_declarations[0].candidate_id = randomUUID() }, s => { s.relevance_declarations[0].selection_method = ' ' }]) {
      const malformed = structuredClone(afterWatched.snapshot); mutate(malformed)
      await assert.rejects(compare(initial.snapshot, malformed), /invalid retained relevance/)
    }
    const scopeChanged = structuredClone(afterWatched.snapshot); scopeChanged.scope_candidate_ids = [randomUUID()]
    await assert.rejects(compare(initial.snapshot, scopeChanged), /comparison scope mismatch/)
    await assert.rejects(brief('observe', { observation_id: randomUUID(), previous_observation_id: afterWatched.id, candidate_ids: [randomUUID()] }), /comparison scope mismatch/)
  })
  await t.test('declaration helper inherits private service-only boundary', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select evidence_pipeline.diff_relevance_declarations($1::jsonb,$2::jsonb)', [JSON.stringify(initial.snapshot), JSON.stringify(afterWatched.snapshot)]), /permission denied/)
    }
    await db.exec('set role service_role')
    assert.deepEqual(await brief('read', { observation_id: afterWatched.id }), afterWatched)
  })
  await t.test('high decimal bigint input identity remains exact in the additive event', async () => {
    await db.exec('reset role')
    await db.query("select setval('evidence_pipeline.evidence_changes_position_seq',9007199254740993,true)")
    await db.exec('set role service_role')
    const cap = await add('https://example.org/declaration-bigint'), high = await scalar('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [cap.capture_id])
    await declare(high)
    const fresh = await observe(afterUnwatched)
    assert.ok(BigInt(high) > BigInt(Number.MAX_SAFE_INTEGER))
    assert.equal(fresh.changes.find(c => c.kind === 'relevant_input_declared').position, high)
  })
  await t.test('selected candidate observations retain watched and new relevance of a different ancestor candidate', async () => {
    const ancestorCapture = await add('https://example.org/ancestor-closure')
    const ancestor = await intake('candidate', { capture_id: ancestorCapture.capture_id, candidate_key: 'ancestor', candidate_kind: 'claim', statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', extractor_version: 'fixture', remaining_uncertainty: 'Synthetic ancestor.' })
    const assessment = async (cid, version, parents = []) => assess('append', { candidate_id: cid, algorithm_key: 'closure-fixture', algorithm_version: version, parents, outcome: 'insufficient_evidence', rationale: 'Synthetic dependency; no truth determination.', remaining_uncertainty: 'Synthetic.', context_positions: (await assess('context', { candidate_id: cid, parents })).context_positions })
    const parent = await assessment(ancestor, 'ancestor')
    const selected = await assessment(candidate, 'selected', [parent])
    const baseline = await observe()
    assert.deepEqual(baseline.snapshot.scope_candidate_ids, [candidate])
    assert.ok(baseline.snapshot.candidates.some(c => c.id === ancestor))
    assert.ok(baseline.snapshot.assessments.some(a => a.id === selected && a.ancestor_ids.includes(parent)))
    const ancestorPosition = await scalar('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [ancestorCapture.capture_id])
    const declareAncestor = p => assess('declare_relevance', { candidate_id: ancestor, position: p, selection_method: 'explicit-ancestor-fixture', selection_ref: 'fixture:ancestor-relevance', rationale: 'Inherited candidate relevance declaration only.' })
    const watchedAncestor = await declareAncestor(ancestorPosition)
    const afterWatchedAncestor = await observe(baseline)
    assert.deepEqual(afterWatchedAncestor.snapshot.inputs, baseline.snapshot.inputs)
    const event = afterWatchedAncestor.changes.find(c => c.kind === 'relevant_input_declared')
    assert.deepEqual(event, { kind: 'relevant_input_declared', candidate_id: ancestor, position: ancestorPosition, selection_method: watchedAncestor.selection_method, selection_ref: watchedAncestor.selection_ref, rationale: watchedAncestor.rationale, declared_at: watchedAncestor.declared_at })
    assert.equal(afterWatchedAncestor.changes.some(c => c.kind === 'evidence_entered_observation'), false)
    const incoming = await add('https://example.org/ancestor-new-relevance')
    const incomingPosition = await scalar('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [incoming.capture_id])
    await declareAncestor(incomingPosition)
    const afterNew = await observe(afterWatchedAncestor)
    assert.ok(afterNew.changes.some(c => c.kind === 'relevant_input_declared' && c.candidate_id === ancestor && c.position === incomingPosition))
    assert.ok(afterNew.changes.some(c => c.kind === 'evidence_entered_observation' && c.position === incomingPosition))
    assert.ok(afterNew.changes.some(c => c.kind === 'assessment_dependency_change' && c.assessment_id === selected))
    const compare = after => db.query('select evidence_pipeline.diff_investigation_snapshots($1::jsonb,$2::jsonb)', [JSON.stringify(baseline.snapshot), JSON.stringify(after)])
    const phantom = structuredClone(afterWatchedAncestor.snapshot)
    phantom.relevance_declarations.find(r => r.candidate_id === ancestor).candidate_id = randomUUID()
    await assert.rejects(compare(phantom), /invalid retained relevance declaration tuple/)
    const fabricatedClosure = structuredClone(afterWatchedAncestor.snapshot)
    fabricatedClosure.candidates.push({ ...fabricatedClosure.candidates.find(c => c.id === ancestor), id: randomUUID() })
    await assert.rejects(compare(fabricatedClosure), /invalid retained relevance snapshot candidate closure/)
    const missingAncestor = structuredClone(afterWatchedAncestor.snapshot)
    missingAncestor.candidates = missingAncestor.candidates.filter(c => c.id !== ancestor)
    await assert.rejects(compare(missingAncestor), /invalid retained relevance snapshot candidate closure/)
    const duplicateClosure = structuredClone(afterWatchedAncestor.snapshot)
    duplicateClosure.candidates.push(structuredClone(duplicateClosure.candidates[0]))
    await assert.rejects(compare(duplicateClosure), /invalid retained relevance snapshot candidate closure/)
    const missingSelected = structuredClone(afterWatchedAncestor.snapshot)
    missingSelected.candidates = missingSelected.candidates.filter(c => c.id !== candidate)
    await assert.rejects(compare(missingSelected), /invalid retained relevance snapshot/)
    assert.deepEqual(await brief('read', { observation_id: baseline.id }), baseline)
  })

})
