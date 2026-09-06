import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createEvidenceChecksHandler, createEvidenceChecksTransport } from '../supabase/functions/investigation-evidence-checks/handler.mjs'
import { createInvestigationEvidenceChecksClient, investigationEvidenceCheckPanels } from '../src/lib/investigationEvidenceChecksClient.js'
import { resolveWorkspaceExcerpt } from '../src/lib/investigationWorkspaceClient.js'

const origin = 'https://jkelsen13-tech.github.io'
const emptyState = { question: 'What changed in the retained reporting?', scope_note: 'Synthetic fixture only.', canonical_subject: null,
  time_range: { from: null, to: null, meaning: 'Source interval unknown.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }
const snapshot = inputs => ({ contract_version: 'investigation-observation-1', scope_candidate_ids: [], inputs })
const captureInput = (position, text, overrides = {}) => ({ position: String(position), capture: {
  id: randomUUID(), article_id: randomUUID(), payload: { title: 'Fixture', summary: text, url: `https://example.org/${position}`, ...overrides },
}, record_version: null })

test('saved evidence checks: real SQL, history, measured limits and assigned-user transport', async t => {
  const db = await PGlite.create(); t.after(() => db.close())
  const read = p => readFile(new URL(p, import.meta.url), 'utf8')
  await db.exec(await read('./changeQueueFixture.sql'))
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  const uid = randomUUID(), viewer = randomUUID(), outsider = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2),($3)', [uid, viewer, outsider])
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  for (const suffix of ['evidence_pipeline_reliability', 'evidence_change_queue_v1', 'evidence_assessment_dependencies_v1',
    'investigation_change_briefings_v1', 'investigation_workspace_batch_v1', 'investigation_evidence_checks_v1']) {
    const matches = files.filter(f => f.endsWith(`_${suffix}.sql`)); assert.equal(matches.length, 1)
    await db.exec(await read('../supabase/migrations/' + matches[0]))
  }
  const rpc = name => (action, input = {}) => db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)]).then(r => r.rows[0].r)
  const intake = rpc('mip_pipeline_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1'), checks = rpc('mip_investigation_evidence_checks_v1')
  const build = s => db.query('select evidence_pipeline.evidence_check_build($1::jsonb) r', [JSON.stringify(s)]).then(r => r.rows[0].r)
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
  const add = async (url, summary) => {
    await intake('enqueue', { run_id: 'evidence-checks-fixture', article: { url, title: 'Fixture only', outlet: 'Fixture', summary, published_at: '2019-01-01T00:00:00Z' } })
    const j = await intake('claim'); return intake('finish', { job_id: j.id, lease_token: j.lease_token })
  }
  const text = 'A retained fixture report with enough exact text to propose a shared source without asserting source independence.'
  const cap = await add('https://example.org/checks-a', text)
  const candidate = await intake('candidate', { capture_id: cap.capture_id, candidate_key: 'checks', candidate_kind: 'claim', statement: text,
    source_field: 'summary', span_start: 0, span_end: Array.from(text).length, excerpt: text, extractor_version: 'fixture', remaining_uncertainty: 'Fixture only.' })
  const obs = await observe('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  const iid = randomUUID(), vid = randomUUID()
  await ws('put', { investigation_id: iid, version_id: vid, previous_version_id: null, observation_id: obs.id, state: emptyState, change_reason: 'Fixture only.' })
  const assign = (user, role) => ws('set_access', { investigation_id: iid, user_id: user, access_role: role, reason: 'Fixture assignment.' })
  const args = (user = uid, version = vid) => ({ user_id: user, investigation_id: iid, version_id: version })
  const baseline = await scalar('select count(*)::int from evidence_pipeline.investigation_review_receipts')
  let saved, nextVersion, nextObservation

  await t.test('reading does not run checks; explicit reviewer run is idempotent and never marks reviewed', async () => {
    await assert.rejects(checks('read', args()), e => e.code === '42501')
    await assign(uid, 'reviewer'); await assign(viewer, 'viewer')
    await db.exec('set role service_role')
    assert.equal((await checks('read', args())).status, 'not_run')
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_evidence_check_reports'), 0)
    await assert.rejects(checks('run', args(viewer)), e => e.code === '42501')
    saved = await checks('run', args())
    assert.equal(saved.status, 'saved'); assert.equal(saved.observation_id, obs.id)
    assert.equal(saved.publicly_eligible, false); assert.equal(saved.report.result.publicly_eligible, false)
    assert.ok(!Object.hasOwn(saved.report, 'recorded_by'))
    assert.deepEqual(await checks('run', args()), saved)
    assert.equal((await checks('read', args(viewer))).report.id, saved.report.id)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_evidence_check_reports'), 1)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_review_receipts'), baseline)
    await db.exec('reset role')
  })
  await t.test('later source changes create a new report only for a new saved version', async () => {
    await add('https://example.org/checks-a', 'A corrected fixture report. No claim is adjudicated by this test.')
    assert.deepEqual(await checks('read', args()), saved)
    nextObservation = await observe('observe', { observation_id: randomUUID(), previous_observation_id: obs.id, candidate_ids: [candidate] })
    nextVersion = randomUUID()
    await ws('put', { investigation_id: iid, version_id: nextVersion, previous_version_id: vid, observation_id: nextObservation.id, state: emptyState, change_reason: 'Fixture correction.' })
    assert.equal((await checks('read', args(uid, nextVersion))).status, 'not_run')
    const newer = await checks('run', args(uid, nextVersion))
    assert.ok(newer.report.result.challenge_cues.some(c => c.reference?.excerpt === 'corrected'))
    assert.ok(newer.report.result.lineage_candidates.some(c => c.reasons.includes('same_saved_article')))
    assert.deepEqual(await checks('run', args()), saved)
    assert.equal((await ws('read', { user_id: uid, investigation_id: iid })).review, null)
  })
  await t.test('unknown users, wrong investigation/version pairs and revoked users cannot retrieve saved reports', async () => {
    await assert.rejects(checks('read', args(outsider)), e => e.code === '42501')
    await assert.rejects(checks('read', { ...args(), investigation_id: randomUUID() }), e => e.code === '42501')
    await assert.rejects(checks('read', args(uid, randomUUID())), e => e.code === '42501')
    await assign(uid, 'revoked')
    for (const action of ['read', 'run']) await assert.rejects(checks(action, args()), e => e.code === '42501')
    await assign(uid, 'reviewer')
  })
  await t.test('short/common titles and merely similar passages do not produce lineage; exact long text remains a proposal', async () => {
    const a = captureInput(1, text), b = captureInput(2, text), c = captureInput(3, text.replace('retained', 'retained and altered'))
    const r = await build(snapshot([c, b, a, captureInput(4, 'Short.'), captureInput(5, 'Short.')]))
    assert.equal(r.lineage_candidates.length, 1)
    assert.deepEqual(r.lineage_candidates[0].reasons, ['identical_retained_text'])
    assert.equal(r.lineage_candidates[0].independence, 'unknown'); assert.equal(r.lineage_candidates[0].direction, 'undetermined')
    assert.equal(r.lineage_candidates[0].status, 'needs_review')
    assert.equal(r.coverage.pairs_compared, 10)
    assert.equal(r.coverage.external_retrieval, 'not_run')
  })
  await t.test('body selection for lineage preserves raw whitespace; all fields are separately searched for correction cues', async () => {
    const inputs = [captureInput(1, 'Correction in summary.', { body_text: text }), captureInput(2, 'Different summary.', { body_text: text }),
      captureInput(3, 'Correction in summary.', { body_text: text + ' ' })]
    const r = await build(snapshot(inputs))
    assert.equal(r.lineage_candidates.length, 1); assert.equal(r.lineage_candidates[0].left_excerpt.source_field, 'body_text')
    assert.ok(r.challenge_cues.some(c => c.position === '1' && c.reference.source_field === 'summary'))
    assert.equal(r.coverage.text_fields_scanned, 9)
    assert.deepEqual(r.coverage.missing_body_positions, [])
  })
  await t.test('Unicode witnesses and big positions remain exact; negated correction language is only a review cue', async () => {
    const raw = '🧬 uncorrected text. No correction was requested. The report was NOT withdrawn.'
    const i = captureInput('9007199254740993', raw)
    const r = await build(snapshot([i]))
    const c = r.challenge_cues.find(c => c.kind === 'correction_language')
    assert.equal(c.position, '9007199254740993'); assert.equal(c.reference.excerpt, 'correction')
    assert.equal(c.reference.span_start, Array.from(raw.slice(0, raw.indexOf('correction'))).length)
    for (const cue of r.challenge_cues) {
      assert.equal(cue.status, 'needs_review')
      assert.ok(resolveWorkspaceExcerpt({ observation: { snapshot: snapshot([i]) } }, cue.reference))
    }
    assert.equal(r.coverage.semantic_adjudication, 'not_performed')
  })
  await t.test('recorded source withdrawal is distinguished from text cues; graph records are explicitly unsupported', async () => {
    const inputs = [
      { position: '1', capture: null, record_version: { id: randomUUID(), record_kind: 'article', payload: { title: 'Fixture', source_status: 'withdrawn' } } },
      { position: '2', capture: null, record_version: { id: randomUUID(), record_kind: 'graph_node', payload: { label: 'Corrected fixture node.' } } },
    ]
    const r = await build(snapshot(inputs))
    assert.equal(r.challenge_cues.length, 1); assert.equal(r.challenge_cues[0].reference, null)
    assert.deepEqual(r.challenge_cues[0].metadata_reference, { position: '1', source_field: 'source_status', value: 'withdrawn' })
    assert.deepEqual(r.coverage.metadata_scan_positions, ['1'])
    assert.deepEqual(r.coverage.unsupported_inputs, [{ position: '2', record_kind: 'graph_node', reason: 'no_check_for_this_record_kind' }])
  })
  await t.test('pair and output limits report partial work and count every omitted candidate', async () => {
    const inputs = Array.from({ length: 101 }, (_, n) => captureInput(String(n + 1), text))
    const before = performance.now(); const r = await build(snapshot(inputs.reverse()))
    assert.equal(r.completion, 'partial'); assert.equal(r.lineage_candidates.length, 200)
    assert.equal(r.coverage.lineage_candidates_found, 4950); assert.equal(r.coverage.pairs_compared, 4950)
    assert.deepEqual(r.coverage.lineage_excluded_positions, ['101'])
    assert.equal(r.coverage.text_scan_positions.length, 101)
    t.diagnostic(`101-capture/4950-pair bounded fixture: ${Math.round(performance.now() - before)} ms`)
  })
  await t.test('cue output limits do not imply the remaining fields were unsearched', async () => {
    const r = await build(snapshot(Array.from({ length: 110 }, (_, n) => captureInput(n + 1, 'Correction. Retracted.'))))
    assert.equal(r.coverage.challenge_cues_found, 220); assert.equal(r.challenge_cues.length, 200)
    assert.equal(r.coverage.text_scan_positions.length, 110); assert.equal(r.completion, 'partial')
    assert.equal((await build(snapshot([]))).coverage.text_fields_scanned, 0)
    await assert.rejects(build({ ...snapshot([]), contract_version: 'future' }), e => e.code === '22023')
  })
  await t.test('maximum input count and a near-4-MiB text collection remain bounded and usable', async () => {
    const many = await build(snapshot(Array.from({ length: 2000 }, (_, n) => captureInput(n + 1, 'Correction.'))))
    assert.equal(many.coverage.input_count, 2000); assert.equal(many.coverage.text_scan_positions.length, 2000)
    assert.equal(many.coverage.challenge_cues_found, 2000); assert.equal(many.coverage.lineage_excluded_positions.length, 1900)
    assert.ok(Buffer.byteLength(JSON.stringify(many)) < 1048576)
    const large = snapshot(Array.from({ length: 100 }, (_, n) => captureInput(n + 1, text.repeat(330))))
    assert.ok(Buffer.byteLength(JSON.stringify(large)) < 4194304)
    const before = performance.now(), r = await build(large)
    assert.equal(r.coverage.pairs_compared, 4950); assert.equal(r.coverage.lineage_candidates_found, 4950)
    assert.ok(Buffer.byteLength(JSON.stringify(r)) < 1048576)
    t.diagnostic(`Near-4-MiB text fixture: ${Math.round(performance.now() - before)} ms`)
  })
  await t.test('storage is immutable and rollback discards runs; browser roles cannot call RPC or helpers', async () => {
    for (const command of ['update evidence_pipeline.investigation_evidence_check_reports set recorded_at=now()',
      'delete from evidence_pipeline.investigation_evidence_check_reports', 'truncate evidence_pipeline.investigation_evidence_check_reports']) {
      await assert.rejects(db.exec(command), /append-only/)
    }
    const other = randomUUID()
    await ws('put', { investigation_id: iid, version_id: other, previous_version_id: nextVersion, observation_id: nextObservation.id, state: emptyState, change_reason: 'Annotation-only fixture.' })
    await db.exec('begin'); await checks('run', args(uid, other)); await db.exec('rollback')
    assert.equal((await checks('read', args(uid, other))).status, 'not_run')
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(checks('read', args()), /permission denied/)
      await assert.rejects(build(snapshot([])), /permission denied/)
      await assert.rejects(db.exec('select * from evidence_pipeline.investigation_evidence_check_reports'), /permission denied/)
      await db.exec('reset role')
    }
  })
  await t.test('real SQL through Auth handler and client maps only the matching investigation version', async () => {
    await db.exec('set role service_role')
    const handler = createEvidenceChecksHandler({ authenticate: async () => ({ id: uid }), rpc: async (action, input) => {
      try { return { data: await checks(action, input) } } catch (e) { return { error: { code: e.code } } }
    } })
    const client = createInvestigationEvidenceChecksClient({ functions: { invoke: async (name, { body }) => {
      assert.equal(name, 'investigation-evidence-checks')
      const response = await handler(new Request('https://fixture.invalid', { method: 'POST', headers: { origin, Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
      return response.ok ? { data: await response.json() } : { error: { context: response } }
    } } })
    const w = await ws('read', { user_id: uid, investigation_id: iid, version_id: vid })
    const r = await client.read(iid, vid); assert.equal(r.error, null)
    assert.equal(investigationEvidenceCheckPanels(w, r.data).reportId, saved.report.id)
    assert.equal(investigationEvidenceCheckPanels({ ...w, version: { ...w.version, id: nextVersion } }, r.data), null)
    assert.equal(investigationEvidenceCheckPanels(w, { ...r.data, observation_id: randomUUID() }), null)
    assert.equal((await client.read(iid, randomUUID())).error.code, 'access_denied')
    await db.exec('reset role')
  })
  await t.test('administrator canary rolls back all fixture investigations and reports', async () => {
    const before = await scalar('select count(*)::int from evidence_pipeline.investigations')
    const reports = await scalar('select count(*)::int from evidence_pipeline.investigation_evidence_check_reports')
    await db.exec(await read('../supabase/tests/investigation_evidence_checks_smoke.sql'))
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigations'), before)
    assert.equal(await scalar('select count(*)::int from evidence_pipeline.investigation_evidence_check_reports'), reports)
  })
})

test('evidence-check HTTP boundary rejects identity injection, missing versions, unauthenticated users and disallowed origins', async () => {
  const uid = randomUUID(), iid = randomUUID(), vid = randomUUID(); let calls = 0
  const h = createEvidenceChecksHandler({ authenticate: async auth => auth === 'Bearer real' ? { id: uid } : null,
    rpc: async (action, input) => { calls++; assert.equal(input.user_id, uid); return { data: { action } } } })
  const req = (body, headers = {}) => new Request('https://fixture.invalid', { method: 'POST', headers: { origin, Authorization: 'Bearer real', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const valid = { action: 'run', input: { investigation_id: iid, version_id: vid } }
  assert.equal((await h(req(valid))).status, 200)
  for (const bad of [{ ...valid, input: { ...valid.input, user_id: uid } }, { ...valid, action: 'set_access' },
    { action: 'read', input: { investigation_id: iid } }, { ...valid, input: { ...valid.input, version_id: null } }]) assert.equal((await h(req(bad))).status, 400)
  assert.equal((await h(req(valid, { Authorization: 'Bearer stale' }))).status, 401)
  assert.equal((await h(req(valid, { origin: 'https://evil.invalid' }))).status, 403)
  assert.equal((await h(req({ ...valid, extra: 'x'.repeat(8200) }))).status, 413)
  const options = await h(new Request('https://fixture.invalid', { method: 'OPTIONS', headers: { origin } }))
  assert.equal(options.status, 204); assert.equal(options.headers.get('Access-Control-Allow-Origin'), origin)
  assert.equal(calls, 1)
})

test('evidence-check transport sends service identity only to the fixed RPC; client errors never show raw SQL', async () => {
  const requests = []
  const transport = createEvidenceChecksTransport({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', anonKey: 'public-fixture', serviceKey: 'private-fixture',
    fetchImpl: async (url, options) => { requests.push({ url, options }); return new Response('{}', { status: 200 }) } })
  await transport.authenticate('Bearer user-fixture'); await transport.rpc('read', {})
  assert.equal(requests[0].options.headers.Authorization, 'Bearer user-fixture')
  assert.equal(requests[0].options.headers.apikey, 'public-fixture')
  assert.equal(requests[1].url, 'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/mip_investigation_evidence_checks_v1')
  assert.equal(requests[1].options.headers.Authorization, 'Bearer private-fixture')
  assert.equal(requests[1].options.redirect, 'error')
  assert.throws(() => createEvidenceChecksTransport({ url: 'https://evil.invalid', anonKey: 'x', serviceKey: 'y' }), /configuration/)
  const client = createInvestigationEvidenceChecksClient({ functions: { invoke: async () => ({ error: { context: new Response('{"secret":"raw sql"}', { status: 401 }) } }) } })
  assert.deepEqual(await client.read(randomUUID(), randomUUID()), { data: null, error: { code: 'authentication_required' } })
})
