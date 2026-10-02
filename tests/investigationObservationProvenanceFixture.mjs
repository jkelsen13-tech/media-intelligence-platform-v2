import { readFile, readdir } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { createWorkspaceHandler } from '../supabase/functions/investigation-workspace/handler.mjs'
import { createInvestigationWorkspaceClient } from '../src/lib/investigationWorkspaceClient.js'

// Synthetic data, real SQL/RPC/HTTP handler/client. No service or provider traffic.
export async function observationProvenanceFixture() {
  const db = await PGlite.create()
  try {
    const read = p => readFile(new URL(p, import.meta.url), 'utf8')
    await db.exec(await read('./changeQueueFixture.sql'))
    await db.exec('create table public.mip_profiles(id uuid primary key)')
    const uid = randomUUID(); await db.query('insert into public.mip_profiles values($1)', [uid])
    const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
    for (const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','investigation_change_briefings_v1','investigation_workspace_batch_v1','investigation_evidence_checks_v1','investigation_evidence_reviews_v1']) {
      const file = files.find(f => f.endsWith(`_${suffix}.sql`)); if (!file) throw new Error(`Missing migration ${suffix}`)
      await db.exec(await read('../supabase/migrations/' + file))
    }
    const proposal = process.env.MIP_RELEVANCE_PROPOSAL
      ? await readFile(process.env.MIP_RELEVANCE_PROPOSAL, 'utf8') : await read('../supabase/source-proposals/assessment_relevant_inputs_v1.sql')
    await db.exec(proposal)
    const rpc = name => async (action, input = {}) => (await db.query(`select public.${name}($1,$2::jsonb) r`, [action, JSON.stringify(input)])).rows[0].r
    const intake = rpc('mip_pipeline_v1'), assess = rpc('mip_assessments_v1'), observe = rpc('mip_investigation_briefings_v1'), ws = rpc('mip_investigation_workspace_v1')
    const checksRpc = rpc('mip_investigation_evidence_checks_v1'), reviewsRpc = rpc('mip_investigation_evidence_reviews_v1')
    const add = async (suffix, parents = []) => {
      await intake('enqueue', { run_id: 'provenance-consumer-fixture', article: { url: `https://example.org/provenance-${suffix}`, title: 'Synthetic retained input', outlet: 'Fixture', summary: 'A corrected report.', published_at: '2019-01-01T00:00:00Z' } })
      const job = await intake('claim'); const cap = await intake('finish', { job_id: job.id, lease_token: job.lease_token })
      const candidate = await intake('candidate', { capture_id: cap.capture_id, candidate_key: 'fixture', candidate_kind: 'claim', statement: 'A corrected report.', source_field: 'summary', span_start: 0, span_end: 19, excerpt: 'A corrected report.', extractor_version: 'fixture', remaining_uncertainty: 'Synthetic only.' })
      const assessment = await assess('append', { candidate_id: candidate, algorithm_key: 'fixture', algorithm_version: '1', parents, outcome: 'insufficient_evidence', rationale: 'Synthetic fixture; no factual verdict.', remaining_uncertainty: 'No semantic search.', context_positions: (await assess('context', { candidate_id: candidate, parents })).context_positions })
      return { cap, candidate, assessment }
    }
    const a = await add('a'), b = await add('b')
    const child = await add('selected-child', [a.assessment])
    const candidate_ids = [child.candidate, b.candidate]
    const beforeObservation = await observe('observe', { observation_id: randomUUID(), candidate_ids })
    const position = beforeObservation.snapshot.inputs.find(input => input.capture?.id === b.cap.capture_id).position
    const coverage = status => ({ id: randomUUID(), label: `Synthetic ${status} collection`, status: 'limited', source_classes: ['fixture'], languages: ['en'], regions: [], from: null, to: null, retained_text: 'summary_only', search_status: status, searched_at: status === 'not_run' ? null : '2026-10-01T00:00:00Z', method: 'Retained analyst declaration; no independent coverage measurement.', limitations: ['Synthetic only.'] })
    const state = { question: 'Does the saved workspace expose retained provenance?', scope_note: 'Controlled synthetic fixture from actual local PostgreSQL functions.', canonical_subject: null, time_range: { from: null, to: null, meaning: 'Event time unknown.' }, unresolved_questions: ['Reporting and rights dispositions are unknown.'], hypotheses: [], commitments: [], coverage: ['not_run','partial','completed_for_declared_scope'].map(coverage) }
    const iid = randomUUID(), v1 = randomUUID(), v2 = randomUUID()
    await ws('put', { investigation_id: iid, version_id: v1, previous_version_id: null, observation_id: beforeObservation.id, state, change_reason: 'Synthetic baseline.' })
    await ws('set_access', { investigation_id: iid, user_id: uid, access_role: 'reviewer', reason: 'Synthetic controlled assignment.' })
    await ws('mark_review', { user_id: uid, investigation_id: iid, version_id: v1, receipt_id: randomUUID(), previous_receipt_id: null })
    const before = await ws('read', { user_id: uid, investigation_id: iid })
    const declaration = { candidate_id: a.candidate, position, selection_method: 'analyst-declaration-fixture', selection_ref: 'fixture:already-watched', rationale: 'Exact input was already watched for another candidate; selected for this candidate now.' }
    await assess('declare_relevance', declaration)
    await assess('declare_relevance', { ...declaration, candidate_id: b.candidate, selection_ref: 'fixture:self-watched', rationale: 'Exact input was already in this candidate context; retain this distinct declaration.' })
    const afterObservation = await observe('observe', { observation_id: randomUUID(), candidate_ids, previous_observation_id: beforeObservation.id })
    await ws('put', { investigation_id: iid, version_id: v2, previous_version_id: v1, observation_id: afterObservation.id, state, change_reason: 'Synthetic declaration only.' })
    const args = { user_id: uid, investigation_id: iid, version_id: v2 }
    const notRunChecks = await checksRpc('read', args), checks = await checksRpc('run', args)
    const cue = checks.report.result.challenge_cues[0]
    await reviewsRpc('decide', { ...args, report_id: checks.report.id, event_id: randomUUID(), previous_event_id: null, target_kind: 'evidence_cue', target_id: cue.id, decision: 'not_relevant', rationale: 'Synthetic cue dismissed only for this investigation.', evidence: [{ ...cue.reference, relation: 'context', note: 'Exact synthetic retained span.' }] })
    const reviews = await reviewsRpc('read', { ...args, report_id: checks.report.id })
    const handler = createWorkspaceHandler({ authenticate: async () => ({ id: uid }), rpc: async (action, input) => ({ data: await ws(action, input) }) })
    const client = createInvestigationWorkspaceClient({ functions: { invoke: async (_name, { body }) => {
      const response = await handler(new Request('https://fixture.invalid/workspace', { method: 'POST', headers: { authorization: 'Bearer synthetic-local-token', 'content-type': 'application/json' }, body: JSON.stringify(body) }))
      if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`)
      return { data: await response.json() }
    } } })
    const current = (await client.read(iid)).data
    const counts = (await db.query('select (select count(*)::int from evidence_pipeline.investigation_review_receipts) workspace_reviews, (select count(*)::int from evidence_pipeline.candidate_input_relevance) declarations')).rows[0]
    return { uid, before, current, checks, reviews, notRunChecks, declaration, position, counts, proposalSha256: createHash('sha256').update(proposal).digest('hex') }
  } finally { await db.close() }
}
