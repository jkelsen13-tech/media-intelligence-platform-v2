// Disposable single-session PGlite PostgreSQL 18.3 WASM, never hosted authority.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { selectiveExecutionPrerequisites } from '../../../tests/selectiveExecutionPackageFixture.mjs'
import { installSelectiveExecutionFixture } from '../../selectiveExecutionPackage.mjs'
import { installSelectiveCompletionFixture } from '../../selectiveIntakeCompletionPackage.mjs'
import { prepareSelectiveReadinessPlan } from './offlinePlan.mjs'

export async function createSelectiveReadinessNativeFixture(t) {
  const db = await selectiveExecutionPrerequisites(); t.after(() => db.close())
  await installSelectiveExecutionFixture(db)
  await installSelectiveCompletionFixture(db)
  const rpc = name => async (action, input = {}) => (await db.query(`select public.${name}($1,$2::jsonb) result`, [action, JSON.stringify(input)])).rows[0].result
  const raw = { selectiveExecution: rpc('mip_selective_execution_v1'), intake: rpc('mip_pipeline_v1'), assessments: rpc('mip_assessments_v1'),
    observations: rpc('mip_investigation_briefings_v1'), workspace: rpc('mip_investigation_workspace_v1') }
  const actor = randomUUID(), investigation = randomUUID(), hooks = {}, calls = []
  const add = async (url, summary) => {
    await raw.intake('enqueue', { run_id: 'offline-readiness-fixture', article: { url, title: 'Synthetic institution', outlet: 'Fixture', summary } })
    const job = await raw.intake('claim'); return raw.intake('finish', { job_id: job.id, lease_token: job.lease_token })
  }
  await db.query('insert into public.mip_profiles values($1)', [actor])
  const seed = await add('https://example.org/readiness-baseline', 'Synthetic baseline.')
  const candidate = await raw.intake('candidate', { capture_id: seed.capture_id, candidate_key: 'fixture', candidate_kind: 'claim', statement: 'Synthetic baseline.',
    source_field: 'summary', span_start: 0, span_end: 19, excerpt: 'Synthetic baseline.', extractor_version: 'fixture-1', remaining_uncertainty: 'Synthetic.' })
  const observation = await raw.observations('observe', { observation_id: randomUUID(), candidate_ids: [candidate] })
  await raw.workspace('put', { investigation_id: investigation, version_id: randomUUID(), previous_version_id: null, observation_id: observation.id,
    state: { question: 'Synthetic readiness', scope_note: 'Existing shared stack.', canonical_subject: null,
      time_range: { from: null, to: null, meaning: 'Unknown.' }, unresolved_questions: [], hypotheses: [], commitments: [], coverage: [] }, change_reason: 'Fixture only.' })
  await raw.workspace('set_access', { investigation_id: investigation, user_id: actor, access_role: 'reviewer', reason: 'Synthetic assignment.' })
  const rules = { contract_version: 'selective-metadata-rules-1', religion_shared_scope: true,
    analyze_signals: ['explicit_scope', 'primary_document', 'public_safety', 'institutional_accountability', 'economy', 'correction', 'new_relevant_input'], low_value_domains: ['sports', 'entertainment'] }
  await db.query('insert into evidence_pipeline.selective_criteria_versions values($1,$2,$3,$4,$5)', ['readiness', 'fixture-1', 'policy-fixture-1', 'synthetic:acceptance', rules])
  const backend = Object.fromEntries(Object.entries(raw).map(([facet, fn]) => [facet, async (action, input) => {
    calls.push({ facet, action, input }); await hooks.before?.(facet, action, input)
    await db.exec('set role service_role')
    let result
    try { result = await fn(action, input) } finally { await db.exec('reset role') }
    await hooks.after?.(facet, action, input, result)
    return result
  }]))
  let fetched = 0
  const fetchImpl = async (url, init) => {
    fetched++
    if (init.redirect !== 'error' || init.method !== 'GET' || Object.keys(init.headers).join() !== 'Accept') throw Error('unexpected source transport')
    return Response.json({ url, title: 'Synthetic institution', outlet: 'Fixture', summary: 'An institution made a public commitment.' })
  }
  const preflightSource = await readFile(new URL('../../../supabase/source-proposals/selective-intake-pack/run-preflight.psql', import.meta.url), 'utf8')
  const nativeQuery = preflightSource.match(/select[\s\S]*?;\n-- An empty/)?.[0].replace(/;\n-- An empty$/, '')
  if (!nativeQuery) throw Error('native run-preflight query unavailable')
  const preflightQuery = nativeQuery.replace(/:'actor_id'/g, '$1').replace(/:'investigation_id'/g, '$2').replace(/:'version_id'/g, '$3')
    .replace(/:'authorization_id'/g, '$4').replace(/:'metadata_json'/g, '$5')
  const plan = async (url, domains = ['religious_institution'], signals = ['explicit_scope']) => {
    const authorization = randomUUID()
    await db.query(`insert into evidence_pipeline.selective_source_authorizations(authorization_id,investigation_id,actor_id,criteria_key,criteria_version,source_url,format,rights_ref,
      enabled,acquire_allowed,retain_allowed,analyze_allowed,expires_at,max_bytes,max_requests)
      values($1,$2,$3,'readiness','fixture-1',$4,'mip_article_json_v1','synthetic:rights',true,true,true,true,'2099-01-01T00:00:00Z',12000,2)`,
    [authorization, investigation, actor, url])
    const request = { user_id: actor, investigation_id: investigation,
      version_id: (await raw.workspace('read', { user_id: actor, investigation_id: investigation })).head_version_id,
      selection_id: randomUUID(), previous_selection_id: null, authorization_id: authorization,
      metadata: { url, domain_declarations: domains.map(domain_ref => ({ domain_ref, classification_ref: `synthetic:${domain_ref}` })), signals } }
    const criteria = (await db.query("select to_jsonb(c) row from evidence_pipeline.selective_criteria_versions c where criteria_key='readiness'")).rows[0].row
    const authorizationRow = (await db.query('select to_jsonb(a) row from evidence_pipeline.selective_source_authorizations a where authorization_id=$1', [authorization])).rows[0].row
    // Execute the existing source query read-only, preserving its exact projected row.
    await db.exec('begin read only')
    let preflight
    try { preflight = (await db.query(`select to_jsonb(p) row from (${preflightQuery}) p`, [actor, investigation, request.version_id, authorization, JSON.stringify(request.metadata)])).rows[0].row }
    finally { await db.exec('rollback') }
    return prepareSelectiveReadinessPlan({ request, criteria, authorization: authorizationRow, preflight })
  }
  const count = async table => (await db.query(`select count(*)::int n from evidence_pipeline.${table}`)).rows[0].n
  const owner = p => ({ user_id: actor, investigation_id: investigation, selection_id: p.bindings.request.selection_id })
  return { db, backend, raw, hooks, calls, plan, add, fetchImpl, fetched: () => fetched, count, owner }
}
