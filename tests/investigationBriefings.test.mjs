import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('private investigation observations retain exact before/after evidence', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), brief = rpc('mip_investigation_briefings_v1')
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const add = async (url, summary = 'A report.', published_at = '2019-01-01T00:00:00Z') => {
    await intake('enqueue', { run_id: 'briefing-fixture', article: { url, title: 'Synthetic evidence', outlet: 'Fixture', summary, published_at } })
    const j = await intake('claim'); return intake('finish', { job_id: j.id, lease_token: j.lease_token })
  }
  const event = await scalar("insert into public.nodes(type,label) values('event','Synthetic event') returning id")
  const candidateFor = cap => intake('candidate', { capture_id: cap.capture_id, candidate_key: 'fixture', candidate_kind: 'claim',
    statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', event_node_id: event,
    extractor_version: 'fixture-1', remaining_uncertainty: 'Synthetic; no real conclusion.' })
  const cap = await add('https://example.org/briefing'), candidate = await candidateFor(cap)
  const otherCap = await add('https://example.org/independent-scope'), other = await candidateFor(otherCap)
  const observe = (previous, scope = [candidate], observation_id = randomUUID()) => brief('observe', {
    observation_id, candidate_ids: scope, ...(previous ? { previous_observation_id: previous.id } : {})
  })
  const payload = async (version, cid = candidate, parents = []) => ({ candidate_id: cid, algorithm_key: 'fixture', algorithm_version: version,
    outcome: 'insufficient_evidence', rationale: 'Fixture only; no semantic conclusion.', remaining_uncertainty: 'Synthetic.', parents,
    context_positions: (await assess('context', { candidate_id: cid, parents })).context_positions })
  const getA = (obs, id) => obs.snapshot.assessments.find(a => a.id === id)
  let empty, baseline, first, derived, corrected, replacement, afterCorrection

  await t.test('unassessed scope has exact evidence but no invented conclusions', async () => {
    empty = await observe()
    assert.equal(empty.baseline_initialized, true); assert.deepEqual(empty.changes, [])
    assert.deepEqual(empty.snapshot.assessments, []); assert.deepEqual(empty.snapshot.selected_assessment_ids, [])
    assert.ok(empty.snapshot.inputs.some(i => i.capture?.id === cap.capture_id && i.capture.payload.summary === 'A report.'))
    assert.equal(empty.release_state, 'private'); assert.equal(empty.publicly_eligible, false)
  })
  await t.test('new assessments and external dependency closure retain exact decisions', async () => {
    first = await assess('append', await payload('parent', other))
    derived = await assess('append', await payload('derived', candidate, [first]))
    baseline = await observe(empty)
    assert.equal(baseline.changes.filter(c => c.kind === 'assessment_added').length, 1)
    assert.deepEqual(baseline.snapshot.selected_assessment_ids, [derived])
    assert.ok(getA(baseline, first)); assert.ok(getA(baseline, derived))
    assert.equal(getA(baseline, derived).stale, false)
    assert.equal(typeof getA(baseline, derived).ordinal, 'string')
    assert.ok(baseline.snapshot.inputs.some(i => i.capture?.id === otherCap.capture_id))
    assert.ok(baseline.snapshot.inputs.every(i => typeof i.position === 'string'))
    assert.deepEqual((await observe(baseline)).changes, [])
  })
  await t.test('late correction changes dependent assessment before invalidation worker', async () => {
    corrected = await add('https://example.org/independent-scope', 'A corrected report.', '2010-01-01T00:00:00Z')
    afterCorrection = await observe(baseline)
    const d = afterCorrection.changes.find(c => c.kind === 'assessment_dependency_change')
    assert.equal(d.assessment_id, derived); assert.equal(d.before_stale, false); assert.equal(d.after_stale, true)
    const correctionPosition = afterCorrection.snapshot.inputs.find(i => i.capture?.id === corrected.capture_id).position
    assert.ok(d.after_causes.some(c => c.change_position === correctionPosition))
    assert.ok(afterCorrection.changes.some(c => c.kind === 'evidence_entered_observation' && c.position === correctionPosition))
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations'), 0)
    assert.deepEqual(await brief('read', { observation_id: baseline.id }), baseline)
    assert.equal(getA(baseline, derived).stale, false)
    assert.ok(afterCorrection.snapshot.inputs.some(i => i.capture?.payload.summary === 'A report.'))
    assert.ok(afterCorrection.snapshot.inputs.some(i => i.capture?.payload.summary === 'A corrected report.'))
  })
  await t.test('retry preserves original observation and rejects ID reuse with other scope', async () => {
    assert.deepEqual(await observe(empty, [candidate], baseline.id), baseline)
    await assert.rejects(observe(undefined, [candidate], baseline.id), /identity conflict/)
    await assert.rejects(observe(empty, [other], baseline.id), /identity conflict/)
  })
  await t.test('new causes on already stale decisions remain visible without outcome invention', async () => {
    await db.query("update public.nodes set label='Corrected identity' where id=$1", [event])
    const next = await observe(afterCorrection)
    const change = next.changes.find(c => c.kind === 'assessment_dependency_change')
    assert.equal(change.before_stale, true); assert.equal(change.after_stale, true)
    assert.ok(change.after_causes.length > change.before_causes.length)
    assert.equal(getA(next, derived).outcome, getA(baseline, derived).outcome)
    assert.deepEqual((await observe(next)).changes, [])
  })
  await t.test('explicit replacement carries old/new outcome and propagates parent supersession', async () => {
    replacement = await assess('append', { ...await payload('parent-next', other), predecessor_id: first, outcome: 'contested' })
    const next = await observe(afterCorrection)
    assert.ok(getA(next, replacement))
    assert.ok(getA(next, derived).stale_causes.some(c => c.superseding_assessment_id === replacement))
    // A dependency-only replacement is retained but not presented as a selected decision.
    assert.equal(next.changes.some(c => c.kind === 'assessment_replaced'), false)
    const parentBefore = await observe(undefined, [other])
    const newest = await assess('append', { ...await payload('parent-third', other), predecessor_id: replacement, outcome: 'supported' })
    const parentAfter = await observe(parentBefore, [other])
    const c = parentAfter.changes.find(c => c.kind === 'assessment_replaced')
    assert.equal(c.before_assessment_id, replacement); assert.equal(c.after_assessment_id, newest)
    assert.equal(c.before_outcome, 'contested'); assert.equal(c.after_outcome, 'supported')
    assert.equal(parentAfter.publicly_eligible, false)
  })
  await t.test('scope order canonicalizes, explicit changes require a new baseline', async () => {
    const two = await observe(undefined, [other, candidate])
    assert.deepEqual(await observe(undefined, [candidate, other], two.id), two)
    await assert.rejects(observe(two), /scope mismatch/)
    await assert.rejects(observe({ id: randomUUID() }), /unknown previous/)
    await assert.rejects(observe(undefined, [randomUUID()]), /unknown scope/)
    await assert.rejects(observe(undefined, [candidate, candidate]), /duplicate/)
    await assert.rejects(observe(undefined, []), /requires/)
    await assert.rejects(observe(undefined, Array.from({ length: 51 }, () => randomUUID())), /requires/)
    await assert.rejects(brief('read', { observation_id: randomUUID() }), /unknown observation/)
    await assert.rejects(brief('read', { observation_id: baseline.id, as_of: '2020-01-01' }), /requires only/)
    await assert.rejects(brief('observe', { observation_id: randomUUID(), candidate_ids: [candidate], public: true }), /requires/)
    await assert.rejects(brief('observe', { observation_id: randomUUID(), candidate_ids: [null] }), /requires/)
    await assert.rejects(brief('observe', null), /invalid briefing/)
    await assert.rejects(brief('publish'), /unsupported/)
  })
  await t.test('rollback leaves no observation or spurious delta', async () => {
    const before = await observe(), id = randomUUID()
    await db.exec('begin')
    await db.query("update public.nodes set label='rolled back context' where id=$1", [event])
    await observe(before, [candidate], id)
    await db.exec('rollback')
    await assert.rejects(brief('read', { observation_id: id }), /unknown observation/)
    assert.deepEqual((await observe(before)).changes, [])
  })
  await t.test('int64 references round-trip without JavaScript precision loss', async () => {
    await db.exec("alter sequence evidence_pipeline.evidence_changes_position_seq restart with 9007199254740993; alter sequence evidence_pipeline.assessments_ordinal_seq restart with 9007199254740993")
    await db.query("update public.nodes set label='int64 fixture' where id=$1", [event])
    const a = await assess('append', await payload('int64'))
    const next = await observe()
    assert.ok(next.snapshot.inputs.some(i => i.position === '9007199254740993'))
    assert.equal(getA(next, a).ordinal, '9007199254740993')
  })
  await t.test('retained observations are immutable and unavailable to browsers', async () => {
    for (const sql of ['delete from evidence_pipeline.investigation_observations', 'update evidence_pipeline.investigation_observations set changes=\'[]\'', 'truncate evidence_pipeline.investigation_observations']) {
      await assert.rejects(db.exec(sql), /append-only/)
    }
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(brief('read', { observation_id: baseline.id }), /permission denied/)
      await assert.rejects(observe(), /permission denied/)
      await assert.rejects(db.exec('select * from evidence_pipeline.investigation_observations'), /permission denied/)
      await assert.rejects(db.query('select evidence_pipeline.collect_investigation_snapshot($1::uuid[])', [[candidate]]), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.deepEqual(await brief('read', { observation_id: baseline.id }), baseline)
    assert.equal((await observe()).publicly_eligible, false)
    await db.exec('reset role')
    assert.equal(await scalar("select provolatile from pg_proc where oid='evidence_pipeline.collect_investigation_snapshot(uuid[])'::regprocedure"), 's')
  })
  await t.test('deployment canary runs unchanged', async () => {
    await db.exec(await read('../supabase/tests/investigation_briefings_smoke.sql'))
  })
  await t.test('input and payload caps reject incomplete briefings atomically', async () => {
    const count = await scalar('select count(*)::int from evidence_pipeline.investigation_observations')
    await db.exec('begin')
    await db.query(`select evidence_pipeline.append_version('graph_node',$1,'update',jsonb_build_object('fixture',x),'briefing-cap-test') from generate_series(1,2001) x`, [event])
    await assert.rejects(observe(), /input history exceeds 2000/)
    await db.exec('rollback')
    await db.exec('begin')
    await db.query("select evidence_pipeline.append_version('graph_node',$1,'update',jsonb_build_object('fixture',repeat('x',4200000)),'briefing-byte-cap-test')", [event])
    await assert.rejects(observe(), /snapshot exceeds 4 MiB/)
    await db.exec('rollback')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_observations'), count)
  })
  await t.test('missing input history and unsupported geography fail closed', async () => {
    // Trusted-admin fixture alteration, fully rolled back: simulate a source
    // history defect that the public candidate RPC would not create.
    await db.exec('begin')
    await db.exec('alter table evidence_pipeline.evidence_candidates disable trigger user')
    await db.query("update evidence_pipeline.evidence_candidates set event_node_id=null, candidate_kind='claim' where id=$1", [candidate])
    await db.exec('alter table evidence_pipeline.evidence_changes disable trigger user')
    // Use a new, unassessed candidate, whose missing capture notice is not FK-referenced.
    const isolatedCap = await add('https://example.org/missing-history')
    const isolated = await candidateFor(isolatedCap)
    const position = await scalar('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [isolatedCap.capture_id])
    await db.exec('alter table evidence_pipeline.change_job_events disable trigger user')
    await db.query('delete from evidence_pipeline.change_jobs where change_position=$1', [position])
    await db.query('delete from evidence_pipeline.evidence_changes where position=$1', [position])
    await assert.rejects(observe(undefined, [isolated]), /incomplete retained input history/)
    await db.exec('rollback')
    // Geography requires a version-notification contract not present in v1.
    await db.exec('begin')
    await db.exec('alter table evidence_pipeline.evidence_candidates disable trigger user')
    const checks = await db.query("select conname from pg_constraint where conrelid='evidence_pipeline.evidence_candidates'::regclass and contype='c'")
    for (const { conname } of checks.rows) await db.exec(`alter table evidence_pipeline.evidence_candidates drop constraint "${conname.replaceAll('"', '""')}"`)
    await db.query("update evidence_pipeline.evidence_candidates set candidate_kind='geography' where id=$1", [candidate])
    await assert.rejects(observe(), /spatial dependency notifications/)
    await db.exec('rollback')
  })
  await t.test('assessment closure limit fails atomically instead of truncating', async () => {
    const beforeCount = await scalar('select count(*)::int from evidence_pipeline.investigation_observations')
    for (let i = 0; i < 201; i++) await assess('append', await payload(`fanout-${i}`))
    await assert.rejects(observe(), /exceeds 200/)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_observations'), beforeCount)
  })
})
