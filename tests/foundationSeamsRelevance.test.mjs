import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('nondeployed relevance proposal extends exact assessment dependency semantics', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), queue = rpc('mip_evidence_changes_v1'), brief = rpc('mip_investigation_briefings_v1')
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const add = async (url, summary = 'A report.', published_at = '2019-01-01T00:00:00Z') => {
    await intake('enqueue', { run_id: 'foundation-seam-fixture', article: { url, title: 'Synthetic evidence', outlet: 'Fixture', summary, published_at } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const candidateFor = capture => intake('candidate', { capture_id: capture.capture_id, candidate_key: 'fixture', candidate_kind: 'claim',
    statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.',
    extractor_version: 'fixture-1', remaining_uncertainty: 'Synthetic fixture; no real semantic decision.' })
  const positionFor = capture => scalar('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [capture.capture_id])
  const payload = async (candidate_id, algorithm_version, parents = []) => ({ candidate_id, algorithm_key: 'fixture', algorithm_version, parents,
    outcome: 'insufficient_evidence', rationale: 'Synthetic fixture; relevance does not imply support.', remaining_uncertainty: 'No semantic search was run.',
    context_positions: (await assess('context', { candidate_id, parents })).context_positions })
  const observe = (candidate_ids, previous) => brief('observe', { observation_id: randomUUID(), candidate_ids,
    ...(previous ? { previous_observation_id: previous.id } : {}) })
  const drainDependencies = async () => {
    let job; const receipts = []
    while ((job = await queue('claim', { route: 'dependency_lookup' }))) {
      let result
      do { result = await assess('process_dependency', { job_id: job.id, lease_token: job.lease_token, limit: 1 }) } while (result.coverage === 'partial')
      receipts.push(result)
    }
    return receipts
  }
  const firstCapture = await add('https://example.org/original'), candidate = await candidateFor(firstCapture)
  const childCandidate = await candidateFor(await add('https://example.org/child'))
  const unrelatedCandidate = await candidateFor(await add('https://example.org/unrelated'))
  const originalPayload = await payload(candidate, 'old'), original = await assess('append', originalPayload)
  const child = await assess('append', await payload(childCandidate, 'old-child', [original]))
  const grandchild = await assess('append', await payload(childCandidate, 'old-grandchild', [child]))
  const unrelated = await assess('append', await payload(unrelatedCandidate, 'unrelated'))
  const baseline = await observe([candidate, childCandidate])
  let incoming, position, declaration, afterRelevance, replacement

  await t.test('frozen foundation reproduces missing relevance despite complete dependency transport', async () => {
    incoming = await add('https://example.org/new-relevant', 'A report.', '1990-01-01T00:00:00Z')
    position = await positionFor(incoming)
    const receipts = await drainDependencies()
    assert.ok(receipts.length > 0)
    assert.ok(receipts.every(r => r.coverage === 'complete' && /no semantic reassessment/.test(r.meaning)))
    assert.equal((await assess('read', { assessment_id: original })).stale, false)
    assert.equal((await assess('read', { assessment_id: child })).stale, false)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations'), 0)
    assert.ok(await scalar("select count(*)::int from evidence_pipeline.change_jobs where route='new_candidate_search' and state='pending'"))
    await assert.rejects(assess('declare_relevance', {}), /unsupported assessment action/)
  })
  await t.test('explicit relevance makes old and inherited decisions stale without changing outcomes or queue completion', async () => {
    await db.exec(await read('../supabase/source-proposals/assessment_relevant_inputs_v1.sql'))
    declaration = { candidate_id: candidate, position, selection_method: 'analyst-declaration-fixture', selection_ref: 'fixture:selection:1', rationale: 'Synthetic new input selected for this candidate; no truth judgment.' }
    const beforeJobs = await scalar("select count(*)::int from evidence_pipeline.change_jobs where state='completed'")
    const result = await assess('declare_relevance', declaration)
    assert.equal(result.change_position, position); assert.equal(result.publicly_eligible, false)
    assert.deepEqual(await assess('declare_relevance', declaration), result)
    await assert.rejects(assess('declare_relevance', { ...declaration, rationale: 'Overwrite' }), /idempotency conflict/)
    for (const id of [original, child, grandchild]) {
      const row = await assess('read', { assessment_id: id })
      assert.equal(row.stale, true); assert.equal(row.outcome, 'insufficient_evidence')
      assert.ok(row.stale_causes.some(c => c.change_position === position))
      assert.equal(row.publicly_eligible, false)
    }
    assert.equal((await assess('read', { assessment_id: unrelated })).stale, false)
    assert.equal(await scalar("select count(*)::int from evidence_pipeline.change_jobs where state='completed'"), beforeJobs)
    await assert.rejects(payload(childCandidate, 'stale-parent', [original]), /stale/)
    assert.equal(await assess('append', originalPayload), original)
    await assert.rejects(assess('append', { ...originalPayload, algorithm_version: 'delayed' }), /context changed/)
  })
  await t.test('existing observation and repair retain exact late evidence and original baseline', async () => {
    afterRelevance = await observe([candidate, childCandidate], baseline)
    assert.ok(afterRelevance.snapshot.inputs.some(i => i.position === position && i.capture.id === incoming.capture_id))
    const savedDeclaration = afterRelevance.snapshot.relevance_declarations.find(r => r.candidate_id === candidate && r.change_position === position)
    assert.equal(savedDeclaration.selection_ref, declaration.selection_ref)
    assert.equal(savedDeclaration.rationale, declaration.rationale)
    assert.ok(afterRelevance.changes.some(c => c.kind === 'evidence_entered_observation' && c.position === position))
    assert.ok(afterRelevance.changes.some(c => c.kind === 'assessment_dependency_change' && c.assessment_id === child))
    assert.deepEqual(await brief('read', { observation_id: baseline.id }), baseline)
    assert.equal(baseline.snapshot.assessments.find(a => a.id === original).stale, false)
    let result, after = '0'
    do { result = await assess('reconcile', { after, limit: 1 }); assert.ok(result.recorded <= 100); after = result.next_after } while (result.has_more)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations where change_position=$1', [position]), 3)
    assert.equal((await assess('reconcile')).recorded, 0)
  })
  await t.test('replacement includes exact relevant versions; unrelated arrival remains current', async () => {
    const context = await assess('context', { candidate_id: candidate })
    assert.ok(context.context_positions.includes(position))
    const input = await assess('input', { position }); assert.equal(input.capture.id, incoming.capture_id)
    replacement = await assess('append', { ...await payload(candidate, 'replacement'), predecessor_id: original })
    const newChild = await assess('append', await payload(childCandidate, 'new-child', [replacement]))
    assert.equal((await assess('read', { assessment_id: newChild })).stale, false)
    await add('https://example.org/irrelevant-arrival')
    await drainDependencies()
    assert.equal((await assess('read', { assessment_id: replacement })).stale, false)
    assert.equal((await assess('read', { assessment_id: newChild })).stale, false)
    assert.deepEqual((await assess('read', { assessment_id: original })).superseded_by, [replacement])
  })
  await t.test('relevant corrections and withdrawals use existing authoritative causes and bounded worker', async () => {
    const correction = await add('https://example.org/new-relevant', 'A corrected report.', '1980-01-01T00:00:00Z')
    const correctionPosition = await positionFor(correction)
    assert.ok((await assess('read', { assessment_id: replacement })).stale_causes.some(c => c.change_position === correctionPosition))
    await drainDependencies()
    assert.ok(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations where change_position=$1', [correctionPosition]))
    const current = await assess('append', await payload(candidate, 'before-withdrawal'))
    await db.query("update public.articles set source_status='withdrawn' where id=$1", [incoming.article_id])
    // Existing capture/article-record subjects share the retained article identity;
    // the exact withdrawal record reaches the same declared relevant subject.
    const withdrawalPosition = await scalar("select c.position::text from evidence_pipeline.evidence_changes c join evidence_pipeline.record_versions v on v.id=c.record_version_id where v.record_kind='article' and v.record_key=$1 order by c.position desc limit 1", [incoming.article_id])
    assert.equal((await assess('read', { assessment_id: current })).stale, true)
    assert.ok((await assess('read', { assessment_id: current })).stale_causes.some(c => c.change_position === withdrawalPosition))
    await drainDependencies()
    assert.ok(await scalar('select count(*)::int from evidence_pipeline.assessment_invalidations where assessment_id=$1 and change_position=$2', [current, withdrawalPosition]))
  })
  await t.test('rolled back relevance cannot manufacture staleness; changed context rejects delayed append', async () => {
    const other = await add('https://example.org/rollback-relevance'), extra = await positionFor(other)
    const current = await assess('append', await payload(unrelatedCandidate, 'rollback-target'))
    const delayed = await payload(unrelatedCandidate, 'delayed-target')
    await db.exec('begin')
    await assess('declare_relevance', { ...declaration, candidate_id: unrelatedCandidate, position: extra, selection_ref: 'fixture:rolled-back' })
    assert.equal((await assess('read', { assessment_id: current })).stale, true)
    await db.exec('rollback')
    assert.equal((await assess('read', { assessment_id: current })).stale, false)
    await assess('declare_relevance', { ...declaration, candidate_id: unrelatedCandidate, position: extra, selection_ref: 'fixture:committed' })
    await assert.rejects(assess('append', delayed), /context changed/)
    assert.equal((await assess('read', { assessment_id: current })).stale, true)
  })
  await t.test('decimal bigint positions retain exact identities beyond JavaScript safe integers', async () => {
    await db.query("select setval('evidence_pipeline.evidence_changes_position_seq',9007199254740993,true)")
    const high = await positionFor(await add('https://example.org/bigint'))
    assert.ok(BigInt(high) > BigInt(Number.MAX_SAFE_INTEGER))
    const row = await assess('declare_relevance', { ...declaration, position: high, selection_ref: 'fixture:bigint' })
    assert.equal(row.change_position, high)
    assert.ok((await assess('context', { candidate_id: candidate })).context_positions.includes(high))
    assert.equal((await assess('input', { position: high })).position, high)
  })
  await t.test('malformed, foreign-domain, missing and unauthorized declarations are rejected', async () => {
    for (const invalid of [null, {}, { ...declaration, position: Number(position) }, { ...declaration, position: '0' },
      { ...declaration, position: '1e2' }, { ...declaration, selection_ref: ' ' }, { ...declaration, rationale: null },
      { ...declaration, publicly_eligible: true }, { ...declaration, assessment_id: original }]) {
      await assert.rejects(assess('declare_relevance', invalid), /input must be object|invalid relevance|unsupported relevance/)
    }
    await assert.rejects(assess('declare_relevance', { ...declaration, candidate_id: randomUUID() }), /unknown candidate/)
    await assert.rejects(assess('declare_relevance', { ...declaration, candidate_id: incoming.capture_id }), /unknown candidate/)
    await assert.rejects(assess('declare_relevance', { ...declaration, position: '9223372036854775807' }), /unknown retained input/)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(assess('declare_relevance', declaration), /permission denied/)
      await assert.rejects(db.exec('select * from evidence_pipeline.candidate_input_relevance'), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.equal((await assess('declare_relevance', declaration)).change_position, position)
    assert.ok((await assess('context', { candidate_id: candidate })).context_positions.includes(position))
    await assert.rejects(db.exec('delete from evidence_pipeline.candidate_input_relevance'), /permission denied|append-only/)
    await db.exec('reset role')
    await assert.rejects(db.exec('update evidence_pipeline.candidate_input_relevance set rationale=\'changed\''), /append-only/)
    await assert.rejects(db.exec('truncate evidence_pipeline.candidate_input_relevance'), /append-only/)
  })
  await t.test('historical freshness refusal and existing rollback canaries remain compatible', async () => {
    assert.equal(await assess('read', { assessment_id: original, as_of: '1900-01-01T00:00:00Z' }), null)
    await assert.rejects(assess('read', { assessment_id: original, as_of: '2100-01-01T00:00:00Z' }), /historical freshness/)
    await db.exec(await read('../supabase/tests/evidence_assessments_smoke.sql'))
    await db.exec(await read('../supabase/tests/investigation_briefings_smoke.sql'))
    assert.deepEqual(await brief('read', { observation_id: baseline.id }), baseline)
  })
})
