import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { declareSelectiveIntake, reconsiderSelectiveIntake } from '../scripts/selectiveIntakeDeclaration.mjs'

// The fixtures exercise actual retained owners, not fabricated cross-ID/version joins.
test('selective intake declarations bind native immutable intake and investigation owners', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  await db.exec(await read('../supabase/source-proposals/assessment_relevant_inputs_v1.sql'))
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), brief = rpc('mip_investigation_briefings_v1')
  const add = async (url, summary = 'A report.') => {
    await intake('enqueue', { run_id: 'selective-intake-fixture', article: { url, title: 'Synthetic evidence', outlet: 'Fixture', summary, published_at: '1990-01-01T00:00:00Z' } })
    const job = await intake('claim'); return intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  const makeCandidate = capture => intake('candidate', { capture_id: capture.capture_id, candidate_key: 'fixture', candidate_kind: 'claim',
    statement: 'A report.', source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.',
    extractor_version: 'fixture-extractor-1', remaining_uncertainty: 'Synthetic; no real truth or domain decision.' })
  const positionFor = async capture => (await db.query('select position::text from evidence_pipeline.evidence_changes where capture_id=$1', [capture.capture_id])).rows[0].position
  const observe = (candidate_ids, previous) => brief('observe', { observation_id: randomUUID(), candidate_ids, ...(previous ? { previous_observation_id: previous.id } : {}) })
  const capture = await add('https://example.org/shared-stack'), candidate = await makeCandidate(capture), ownPosition = await positionFor(capture)
  const otherCapture = await add('https://example.org/other'), otherCandidate = await makeCandidate(otherCapture), otherPosition = await positionFor(otherCapture)
  const context = await assess('context', { candidate_id: candidate })
  const assessment = await assess('append', { candidate_id: candidate, algorithm_key: 'fixture', algorithm_version: '1', parents: [],
    outcome: 'insufficient_evidence', rationale: 'No semantic selection performed.', remaining_uncertainty: 'Synthetic fixture.', context_positions: context.context_positions })
  const baseline = await observe([candidate, otherCandidate])
  const declareInput = { observation_id: baseline.id, candidate_id: candidate, capture_id: capture.capture_id,
    content_hash: baseline.snapshot.inputs.find(i => i.position === ownPosition).capture.content_hash, input_position: ownPosition,
    extractor_version: 'fixture-extractor-1', disposition: 'retain_deferred', method_key: 'fixture-explicit-selection', method_version: '1',
    policy_version: 'fixture-policy-1', selection_ref: 'fixture:selection:1', rationale: 'Caller declares deferral; no rights or truth claim.',
    domain_declarations: [{ domain_ref: 'religion', classification_ref: 'fixture:classification:religion' }, { domain_ref: 'economy', classification_ref: 'fixture:classification:economy' }],
    reconsideration_triggers: [{ kind: 'dependency_change', assessment_id: assessment, dependency_position: ownPosition }] }
  const declared = declareSelectiveIntake(baseline, declareInput)
  const request = trigger => ({ trigger, selection_ref: 'fixture:reconsideration:1', rationale: 'Explicit observed change needs review; no automatic promotion.' })
  let afterCorrection, correctionPosition, afterRelevance, incomingPosition, relevance

  await t.test('all three dispositions retain one shared evidence identity, explicit provenance and default-deny admission', () => {
    for (const disposition of ['analyze_now', 'retain_deferred', 'skip_for_now']) {
      const row = declareSelectiveIntake(baseline, { ...declareInput, disposition })
      assert.equal(row.disposition, disposition); assert.equal(row.candidate_id, candidate); assert.equal(row.capture_id, capture.capture_id)
      assert.deepEqual(row.domain_declarations.map(d => d.domain_ref), ['economy', 'religion'])
      assert.equal(row.provenance, 'caller_self_assertion'); assert.equal(row.rights_admission, 'not_established')
      assert.equal(row.publicly_eligible, false); assert.equal(row.persisted, false); assert.equal(row.execution, 'none')
    }
    const reversed = { ...declareInput, domain_declarations: [...declareInput.domain_declarations].reverse() }
    assert.deepEqual(declareSelectiveIntake(baseline, reversed), declared)
    assert.equal(baseline.snapshot.candidates.find(c => c.id === candidate).review_state, 'pending')
  })
  await t.test('phantom, stale-version, wrong-candidate/capture and unbound trigger declarations reject', () => {
    const rejected = [
      { candidate_id: randomUUID() }, { observation_id: randomUUID() }, { capture_id: otherCapture.capture_id },
      { input_position: otherPosition }, { input_position: '9223372036854775807' }, { input_position: Number(ownPosition) },
      { extractor_version: 'phantom-extractor' }, { content_hash: 'phantom-hash' }, { disposition: 'auto_analyze' },
      { policy_version: '' }, { method_version: '' }, { publicly_eligible: true }, { rights_admission: 'permitted' },
      { reconsideration_triggers: [] }, { reconsideration_triggers: [declareInput.reconsideration_triggers[0], declareInput.reconsideration_triggers[0]] }, { reconsideration_triggers: [{ kind: 'dependency_change', assessment_id: randomUUID(), dependency_position: ownPosition }] },
      { reconsideration_triggers: [{ kind: 'dependency_change', assessment_id: assessment, dependency_position: otherPosition }] },
      { reconsideration_triggers: [{ kind: 'new_relevant_input', change_position: otherPosition, selection_ref: 'phantom', selection_method: 'phantom' }] },
      { domain_declarations: [{ domain_ref: 'religion', classification_ref: '' }] },
    ]
    for (const patch of rejected) assert.throws(() => declareSelectiveIntake(baseline, { ...declareInput, ...patch }), TypeError)
    assert.throws(() => declareSelectiveIntake(baseline, { ...declareInput, candidate_id: otherCandidate }), /capture\/version|assessment/)
    assert.throws(() => declareSelectiveIntake({ ...baseline, publicly_eligible: true }, declareInput), /observation contract/)
    const incomplete = structuredClone(baseline); incomplete.snapshot.inputs = incomplete.snapshot.inputs.filter(i => i.position !== ownPosition)
    assert.throws(() => declareSelectiveIntake(incomplete, declareInput), /unknown retained input/)
  })
  await t.test('an exact native correction triggers reconsideration while preserving the chosen disposition', async () => {
    const correction = await add('https://example.org/shared-stack', 'A corrected report.')
    correctionPosition = await positionFor(correction)
    afterCorrection = await observe([candidate, otherCandidate], baseline)
    const trigger = { kind: 'dependency_change', assessment_id: assessment, dependency_position: ownPosition, change_position: correctionPosition }
    const result = reconsiderSelectiveIntake(declared, baseline, afterCorrection, request(trigger))
    assert.equal(result.status, 'needs_reconsideration'); assert.equal(result.disposition, 'retain_deferred')
    assert.equal(result.trigger.change_position, correctionPosition); assert.equal(result.publicly_eligible, false)
    assert.equal(result.execution, 'none'); assert.equal(result.rights_admission, 'not_established')
    assert.equal((await assess('read', { assessment_id: assessment })).outcome, 'insufficient_evidence')
    assert.throws(() => declareSelectiveIntake(afterCorrection, { ...declareInput, observation_id: afterCorrection.id }), /stale or superseded/)
    assert.deepEqual(await brief('read', { observation_id: baseline.id }), baseline)
  })
  await t.test('reconsideration rejects unobserved causes, wrong subjects and unsupported continuity', async () => {
    const trigger = { kind: 'dependency_change', assessment_id: assessment, dependency_position: ownPosition, change_position: correctionPosition }
    assert.throws(() => reconsiderSelectiveIntake(declared, baseline, baseline, request(trigger)), /successor/)
    assert.throws(() => reconsiderSelectiveIntake(declared, baseline, { ...afterCorrection, previous_observation_id: randomUUID() }, request(trigger)), /successor/)
    assert.throws(() => reconsiderSelectiveIntake(declared, baseline, afterCorrection, request({ ...trigger, change_position: otherPosition })), /new observed/)
    assert.throws(() => reconsiderSelectiveIntake(declared, baseline, afterCorrection, request({ ...trigger, assessment_id: randomUUID() })), /assessment/)
    const changedBaseline = structuredClone(baseline); changedBaseline.snapshot.candidates[0].statement = 'Rewritten'
    assert.throws(() => reconsiderSelectiveIntake(declared, changedBaseline, afterCorrection, request(trigger)), /baseline mismatch/)
    const changedCurrent = structuredClone(afterCorrection); changedCurrent.snapshot.candidates.find(c => c.id === candidate).extractor_version = 'changed'
    assert.throws(() => reconsiderSelectiveIntake(declared, baseline, changedCurrent, request(trigger)), /changed original/)
    const copied = structuredClone(afterCorrection)
    copied.snapshot.assessments.find(a => a.id === assessment).stale_causes.push({ change_position: otherPosition })
    assert.throws(() => reconsiderSelectiveIntake(declared, baseline, copied, request({ ...trigger, change_position: otherPosition })), /wrong dependency subject/)
  })
  await t.test('new relevant input requires the actual positive-relevance record, including exact bigint position', async () => {
    await db.query("select setval('evidence_pipeline.evidence_changes_position_seq',9007199254740993,true)")
    const incoming = await add('https://example.org/explicit-new-relevant')
    incomingPosition = await positionFor(incoming)
    assert.ok(BigInt(incomingPosition) > BigInt(Number.MAX_SAFE_INTEGER))
    relevance = { candidate_id: candidate, position: incomingPosition, selection_method: 'fixture-explicit-declaration', selection_ref: 'fixture:relevance:1', rationale: 'Synthetic classification, not a truth or rights decision.' }
    const absent = await observe([candidate, otherCandidate], baseline)
    const trigger = { kind: 'new_relevant_input', change_position: incomingPosition, selection_ref: relevance.selection_ref, selection_method: relevance.selection_method }
    assert.throws(() => reconsiderSelectiveIntake(declared, baseline, absent, request(trigger)), /relevance declaration/)
    await assess('declare_relevance', relevance)
    afterRelevance = await observe([candidate, otherCandidate], baseline)
    const result = reconsiderSelectiveIntake(declared, baseline, afterRelevance, request(trigger))
    assert.equal(result.trigger.change_position, incomingPosition); assert.equal(result.disposition, 'retain_deferred')
    assert.equal(result.provenance, 'caller_self_assertion'); assert.equal(result.status, 'needs_reconsideration')
    for (const patch of [{ change_position: '9223372036854775807' }, { change_position: Number(incomingPosition) }, { selection_ref: 'phantom' }, { selection_method: 'phantom' }]) {
      assert.throws(() => reconsiderSelectiveIntake(declared, baseline, afterRelevance, request({ ...trigger, ...patch })), TypeError)
    }
    const currentInput = { ...declareInput, observation_id: afterRelevance.id, reconsideration_triggers: [trigger] }
    const newDeclaration = declareSelectiveIntake(afterRelevance, currentInput)
    const next = await observe([candidate, otherCandidate], afterRelevance)
    assert.throws(() => reconsiderSelectiveIntake(newDeclaration, afterRelevance, next, request(trigger)), /new observed relevance/)
  })
  await t.test('unauthorized and rolled-back native records cannot supply retained declaration inputs', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(brief('read', { observation_id: afterRelevance.id }), /permission denied/)
      await assert.rejects(assess('declare_relevance', relevance), /permission denied/)
      await assert.rejects(db.exec('select * from evidence_pipeline.article_captures'), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('begin')
    const transient = await add('https://example.org/rolled-back-intake'), transientPosition = await positionFor(transient)
    await db.exec('rollback')
    await assert.rejects(assess('declare_relevance', { ...relevance, position: transientPosition, selection_ref: 'fixture:rolled-back' }), /unknown retained input/)
    const current = await observe([candidate, otherCandidate], baseline)
    assert.throws(() => reconsiderSelectiveIntake(declared, baseline, current, request({ kind: 'new_relevant_input', change_position: transientPosition,
      selection_ref: 'fixture:rolled-back', selection_method: relevance.selection_method })), /relevance declaration/)
    assert.deepEqual(await brief('read', { observation_id: baseline.id }), baseline)
    assert.equal(await assess('read', { assessment_id: assessment, as_of: '1900-01-01T00:00:00Z' }), null)
  })
})
