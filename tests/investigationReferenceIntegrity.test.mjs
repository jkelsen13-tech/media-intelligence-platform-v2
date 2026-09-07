import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createWorkspaceHandler, createWorkspaceTransport } from '../supabase/functions/investigation-workspace/handler.mjs'
import { createInvestigationWorkspaceClient, investigationWorkspacePanels, resolveWorkspaceExcerpt } from '../src/lib/investigationWorkspaceClient.js'

const uid = randomUUID(), viewer = randomUUID(), outsider = randomUUID()
const origin = 'https://jkelsen13-tech.github.io'
const clone = v => structuredClone(v)

test('workspace reference integrity preserves valid branches and rejects repeated links', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  await db.query('insert into public.mip_profiles(id) values($1),($2),($3)', [uid, viewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1', 'investigation_change_briefings_v1', 'investigation_workspace_batch_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const add = async (url, summary = 'A report.', published_at = '2019-01-01T00:00:00Z') => {
    await intake('enqueue', { run_id: 'workspace-fixture', article: { url, title: 'Synthetic commitment', outlet: 'Fixture', summary, published_at } })
    const j = await intake('claim'); return intake('finish', { job_id: j.id, lease_token: j.lease_token })
  }
  const event = await scalar("insert into public.nodes(type,label) values('event','Synthetic event') returning id")
  const cap = await add('https://example.org/workspace')
  const candidate = await intake('candidate', { capture_id: cap.capture_id, candidate_key: 'workspace', candidate_kind: 'claim', statement: 'A report.',
    source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', event_node_id: event, extractor_version: 'fixture', remaining_uncertainty: 'Synthetic.' })
  const assessmentPayload = async version => ({ candidate_id: candidate, algorithm_key: 'fixture', algorithm_version: version, outcome: 'insufficient_evidence',
    rationale: 'Fixture only.', remaining_uncertainty: 'Synthetic.', context_positions: (await assess('context', { candidate_id: candidate })).context_positions })
  const assessmentId = await assess('append', await assessmentPayload('initial'))
  const newObservation = previous => observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate], ...(previous ? { previous_observation_id: previous.id } : {}) })
  const initialObservation = await newObservation()
  const position = initialObservation.snapshot.inputs.find(i => i.capture?.id === cap.capture_id).position
  const citation = { position, source_field: 'summary', span_start: 0, span_end: 9, excerpt: 'A report.', relation: 'context', note: 'Exact synthetic retained excerpt.' }
  const coverageId = randomUUID(), hypothesisId = randomUUID(), commitmentId = randomUUID(), stageId = randomUUID()
  const initialState = {
    question: 'What evidence shows whether the synthetic commitment progressed?', scope_note: 'Synthetic fixture; one retained report.',
    canonical_subject: { type: 'graph_node', id: event }, time_range: { from: null, to: null, meaning: 'Unknown source event interval.' },
    unresolved_questions: ['Was implementation observed?'],
    coverage: [{ id: coverageId, label: 'Fixture collection', status: 'limited', source_classes: ['fixture'], languages: ['en'], regions: [],
      from: null, to: null, retained_text: 'summary_only', search_status: 'not_run', searched_at: null, method: 'Fixture has no real retrieval run.', limitations: ['Synthetic evidence only.'] }],
    hypotheses: [{ id: hypothesisId, statement: 'The commitment may remain unimplemented.', assessment_ids: [assessmentId], evidence: [citation], assumptions: ['Fixture only.'],
      would_strengthen: ['An authenticated cancellation document.'], would_weaken: ['An authenticated implementation record.'], remaining_uncertainty: 'No substantive judgment.' }],
    commitments: [{ id: commitmentId, actor: 'Synthetic institution', statement: 'A synthetic commitment.', scope: 'Fixture only.', conditions: ['Prerequisites unknown.'],
      deadline_text: 'No retained deadline.', success_criterion: 'Direct evidence of implementation.', remaining_uncertainty: 'No outcome evidence.',
      stages: [{ id: stageId, kind: 'commitment', status: 'reported', depends_on: [], coverage_ids: [coverageId], evidence: [citation], note: 'Source reports a commitment; it does not prove an outcome.' }] }],
  }

  initialState.commitments[0].stages.push({ id: randomUUID(), kind: 'implementation', status: 'unknown', depends_on: [stageId], coverage_ids: [coverageId], evidence: [], note: 'Implementation unknown.' })
  const validate = state => db.query('select evidence_pipeline.workspace_validate_state($1::jsonb,$2::jsonb)', [JSON.stringify(state), JSON.stringify(initialObservation.snapshot)])
  const mutations = [
    s => s.hypotheses[0].assessment_ids.push(assessmentId),
    s => s.commitments[0].stages[1].depends_on.push(stageId),
    s => s.commitments[0].stages[1].coverage_ids.push(coverageId),
  ]
  // Establish that each malformed state was previously accepted.
  for (const mutate of mutations) { const state = clone(initialState); mutate(state); await validate(state) }
  const acl = async () => scalar("select proacl::text from pg_proc where oid='evidence_pipeline.workspace_validate_state(jsonb,jsonb)'::regprocedure")
  const previousAcl = await acl()
  await db.exec(await read('../supabase/migrations/20260907002409_investigation_reference_integrity_v1.sql'))
  await t.test('function privileges and invoker mode are preserved', async () => {
    assert.equal(await acl(), previousAcl)
    assert.equal(await scalar("select prosecdef from pg_proc where oid='evidence_pipeline.workspace_validate_state(jsonb,jsonb)'::regprocedure"), false)
    for (const role of ['anon','authenticated']) {
      await db.exec('set role '+role)
      await assert.rejects(validate(initialState), e => e.code === '42501')
      await db.exec('reset role')
    }
  })
  await t.test('valid references can be shared across separate records and branches', async () => {
    const state = clone(initialState)
    state.hypotheses.push({ ...clone(state.hypotheses[0]), id: randomUUID() })
    state.commitments[0].stages.push({ ...clone(state.commitments[0].stages[1]), id: randomUUID() })
    await validate(state)
  })
  await t.test('duplicate references fail before a saved version or head can change', async () => {
    const iid = randomUUID()
    let previous = null
    const put = state => ws('put',{ investigation_id:iid, version_id:randomUUID(), previous_version_id:previous, observation_id:initialObservation.id, state, change_reason:'Synthetic reference integrity test.' })
    await db.exec('set role service_role')
    const saved = await put(initialState)
    previous = saved.id
    const before = await scalar('select count(*)::int from evidence_pipeline.investigation_versions')
    for (const mutate of mutations) {
      const state=clone(initialState); mutate(state)
      await assert.rejects(put(state),e=>e.code==='22023' && /duplicate.*reference/.test(e.message))
    }
    await db.exec('reset role')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_versions'),before)
    assert.equal(await scalar('select current_version_id from evidence_pipeline.investigations where id=$1',[iid]),saved.id)
    assert.deepEqual(await scalar('select state from evidence_pipeline.investigation_versions where id=$1',[saved.id]),initialState)
  })
  await t.test('missing, cyclic and out-of-scope references still fail', async () => {
    for (const mutate of [
      s=>s.hypotheses[0].assessment_ids=[randomUUID()],
      s=>s.hypotheses[0].assessment_ids=[assessmentId.toUpperCase()],
      s=>s.commitments[0].stages[1].depends_on=[s.commitments[0].stages[1].id],
      s=>s.commitments[0].stages[1].coverage_ids=[randomUUID()],
      s=>s.hypotheses[0].would_weaken=[],
      s=>s.commitments[0].stages[1].status='no_followup_found',
    ]) { const state=clone(initialState); mutate(state); await assert.rejects(validate(state),e=>e.code==='22023') }
  })
})
