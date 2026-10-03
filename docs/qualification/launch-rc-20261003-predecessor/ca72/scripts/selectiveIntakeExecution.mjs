// Operator-only selective execution. No scheduler, provider key, public admission or model.
import { createHash, randomUUID } from 'node:crypto'
import { declareSelectiveIntake, reconsiderSelectiveIntake } from './selectiveIntakeDeclaration.mjs'
import { validateArticle } from './evidencePipeline.mjs'

const fail = (message, code = 'invalid_selection') => { throw Object.assign(new Error(message), { code }) }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const exact = (p, fields) => {
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !fields.includes(k)) || fields.some(k => !Object.hasOwn(p, k))) fail('invalid selective command')
}
export const selectiveExecutionId = (...parts) => {
  const hex = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}
function envelope(input) {
  for (const k of ['user_id', 'investigation_id', 'selection_id']) if (!uuid.test(input[k] ?? '')) fail(`invalid ${k}`)
  return Object.fromEntries(['user_id', 'investigation_id', 'selection_id'].map(k => [k, input[k]]))
}
function sourceUrl(value) {
  let url
  try { url = new URL(value) } catch { fail('invalid authorized endpoint') }
  // Authorization rows must name an exact official endpoint; redirects and request credentials are forbidden.
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port || url.href !== value ||
    !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) || /^[0-9.]+$/.test(url.hostname)) fail('unsupported authorized endpoint')
  return url.href
}
// The observe RPC adds an informational envelope field that the persisted row/read owner omits.
// Hash only the exact native row plus the existing private validator envelope.
const nativeObservation = bundle => {
  const { baseline_initialized, publicly_eligible, ...row } = bundle.observation
  return { ...row, publicly_eligible: false }
}
async function boundedArticle(response, maximum, signal) {
  if (!response.ok || response.redirected) fail('source response unavailable', 'source_unavailable')
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null && (!/^[0-9]+$/.test(declaredLength) || Number(declaredLength) > maximum)) fail('source byte budget exceeded')
  if (!response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) fail('source format unavailable')
  const reader = response.body.getReader(), chunks = []; let total = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read(); if (done) break
      signal.throwIfAborted()
      total += value.byteLength
      if (total > maximum) fail('source byte budget exceeded')
      chunks.push(Buffer.from(value))
    }
    return validateArticle(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}) }
}
function candidateInput(article, capture_id) {
  const field = ['body_text', 'summary', 'title'].find(key => article[key]?.trim())
  const chars = Array.from(article[field]), start = chars.findIndex(c => c.trim()), end = Math.min(chars.length, start + 2000)
  const excerpt = chars.slice(start, end).join('')
  return { capture_id, candidate_key: 'selective-exact-span', candidate_kind: 'claim', statement: excerpt,
    source_field: field, span_start: start, span_end: end, excerpt, extractor_version: 'selective-exact-span-1',
    remaining_uncertainty: 'Exact attributed source span only. Meaning, truth, identity and independent corroboration require review.' }
}
async function analyze(backend, candidate_id, predecessor_id = null) {
  const context = await backend.assessments('context', { candidate_id })
  return backend.assessments('append', { candidate_id, algorithm_key: 'selective-exact-span-baseline', algorithm_version: '1',
    parents: [], context_positions: context.context_positions, ...(predecessor_id ? { predecessor_id } : {}),
    outcome: 'insufficient_evidence', rationale: 'Executed exact-span extraction and native dependency context analysis; semantic claims remain unqualified.',
    remaining_uncertainty: 'No independent truth, entailment, source rights for public display or completed corpus coverage is established.' })
}
async function observeVersion(backend, owner, bundle, scope, key, previousObservation = null) {
  if (scope.length > 50) fail('explicit investigation scope budget exceeded')
  const observation = await backend.observations('observe', { observation_id: selectiveExecutionId(key, 'observation'),
    ...(previousObservation ? { previous_observation_id: previousObservation } : {}), candidate_ids: scope })
  const version = await backend.workspace('put', { investigation_id: owner.investigation_id, version_id: selectiveExecutionId(key, 'version'),
    previous_version_id: bundle.head_version_id, observation_id: observation.id, state: bundle.version.state,
    change_reason: 'Registered selective execution; private evidence remains unqualified.' })
  return { ...bundle, version, head_version_id: version.id, observation }
}
async function annotate(backend, owner, saved, bundle, candidate_id, assessment_id, previousReceipt, priorExecution, reconsiderationReceipt, disposition, key) {
  const observation = nativeObservation(bundle), input = observation.snapshot.inputs.find(row => row.capture?.id === observation.snapshot.candidates.find(c => c.id === candidate_id)?.capture_id)
  if (!input) fail('native capture input unavailable')
  const candidate = observation.snapshot.candidates.find(c => c.id === candidate_id)
  const assessment = observation.snapshot.assessments.find(a => a.id === assessment_id), watched = new Map()
  if (!assessment) fail('executed native assessment unavailable')
  for (const position of assessment.context_positions) {
    const dependency = observation.snapshot.inputs.find(row => row.position === position)
    if (!dependency) fail('executed native dependency unavailable')
    const subject = dependency.capture ? `article:${dependency.capture.article_id}` : `${dependency.record_version.record_kind}:${dependency.record_version.record_key}`
    const prior = watched.get(subject)
    if (!prior || BigInt(prior.dependency_position) < BigInt(position)) watched.set(subject, { kind: 'dependency_change', assessment_id, dependency_position: position })
  }
  // A declared relevance subject becomes a real assessment dependency after reconsideration.
  // Watch every exact native subject, without repeating all historical revisions of that subject.
  if (watched.size > 50) fail('explicit reconsideration subject budget exceeded')
  const result = declareSelectiveIntake(observation, { observation_id: observation.id, candidate_id,
    capture_id: input.capture.id, input_position: input.position, content_hash: input.capture.content_hash, extractor_version: candidate.extractor_version,
    disposition, method_key: saved.selection.criteria_key, method_version: saved.selection.criteria_version, policy_version: saved.selection.policy_version,
    selection_ref: `registered-selection:${owner.selection_id}`, rationale: 'Executed registered metadata criteria and exact-span baseline; no public admission.',
    domain_declarations: saved.selection.metadata.domain_declarations,
    reconsideration_triggers: [...watched.values()] })
  return backend.selectiveExecution('annotate', { ...owner, execution_id: selectiveExecutionId(key, 'execution'), previous_execution_id: priorExecution,
    assessment_id, ...(reconsiderationReceipt ? { reconsideration_receipt_id: reconsiderationReceipt } : {}),
    annotation: { user_id: owner.user_id, investigation_id: owner.investigation_id, version_id: bundle.version.id,
      receipt_id: selectiveExecutionId(key, 'declaration'), previous_receipt_id: previousReceipt, result } })
}

/** Policy selection and SQL permit precede the first source HTTP operation. */
export async function runSelectiveSource(backend, request, { fetchImpl = fetch, now = Date.now } = {}) {
  exact(request, ['user_id', 'investigation_id', 'version_id', 'selection_id', 'previous_selection_id', 'authorization_id', 'metadata'])
  const input = structuredClone(request), owner = envelope(input)
  sourceUrl(input.metadata?.url)
  // Freeze a canonical declaration order so the old pure declaration and SQL bind the same domains.
  if (!Array.isArray(input.metadata?.domain_declarations)) fail('explicit domain classification required')
  input.metadata.domain_declarations.sort((a, b) => a.domain_ref < b.domain_ref ? -1 : a.domain_ref > b.domain_ref ? 1 : 0)
  const selected = await backend.selectiveExecution('select', input)
  if (!selected || selected.selection_id !== owner.selection_id || selected.publicly_eligible !== false ||
    !['analyze_now', 'retain_deferred', 'skip_for_now'].includes(selected.disposition)) fail('invalid registered selection response')
  if (selected.disposition !== 'analyze_now') return { selection: selected, execution: 'metadata_retained_only', source_requests: 0, publicly_eligible: false }
  const saved = await backend.selectiveExecution('read', owner)
  if (saved.execution) return { selection: selected, execution: saved.execution, source_requests: 0, publicly_eligible: false }
  const permit = await backend.selectiveExecution('permit', { ...owner, permit_id: selectiveExecutionId(owner.selection_id, 'permit') })
  if (permit?.selection_id !== owner.selection_id || permit.url !== input.metadata.url || permit.publicly_eligible !== false ||
    permit.format !== 'mip_article_json_v1' || !Number.isInteger(permit.max_bytes) || permit.max_bytes < 1 || permit.max_bytes > 240000 ||
    !Number.isFinite(Date.parse(permit.valid_until)) || Date.parse(permit.valid_until) <= now()) fail('invalid or expired source permit')
  // Timeout bounds both headers AND body consumption, including a noncooperative injected adapter.
  const controller = new AbortController(); let timer
  const work = async () => {
    const response = await fetchImpl(permit.url, { method: 'GET', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal })
    const article = await boundedArticle(response, permit.max_bytes, controller.signal)
    if (article.url !== permit.url) fail('acquired article endpoint mismatch')
    return article
  }
  let article
  try {
    article = await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('source timeout'), { code: 'source_timeout' })) }, 15000)
    })])
  } finally { clearTimeout(timer); controller.abort() }
  const capture = await backend.selectiveExecution('capture', { ...owner, permit_id: permit.permit_id, article })
  const candidate = await backend.intake('candidate', candidateInput(validateArticle(capture.payload), capture.capture_id))
  const assessment = await analyze(backend, candidate)
  const bundle = await backend.workspace('read', { user_id: owner.user_id, investigation_id: owner.investigation_id })
  if (bundle.head_version_id !== input.version_id) fail('workspace changed during source execution', '40001')
  const scope = [...new Set([...bundle.observation.scope_candidate_ids, candidate])].sort()
  const sameScope = JSON.stringify(scope) === JSON.stringify(bundle.observation.scope_candidate_ids)
  const current = await observeVersion(backend, owner, bundle, scope, owner.selection_id, sameScope ? bundle.observation.id : null)
  const receipt = await annotate(backend, owner, saved, current, candidate, assessment, null, null, null, selected.disposition, owner.selection_id)
  return { selection: selected, execution: receipt, source_requests: 1, publicly_eligible: false }
}

/** Deterministically select newly observed native causes; arrival/age/domain words alone do not trigger. */
export function nextSelectiveTrigger(declaration, baseline, current) {
  const before = baseline.snapshot, after = current.snapshot, triggers = []
  const subject = input => input?.capture ? `article:${input.capture.article_id}` : input?.record_version ? `${input.record_version.record_kind}:${input.record_version.record_key}` : null
  for (const watched of declaration.reconsideration_triggers) {
    if (watched.kind !== 'dependency_change') continue
    const original = before.assessments.find(a => a.id === watched.assessment_id), changed = after.assessments.find(a => a.id === watched.assessment_id)
    for (const cause of changed?.stale_causes ?? []) if (cause.change_position &&
      subject(after.inputs.find(i => i.position === cause.change_position)) === subject(before.inputs.find(i => i.position === watched.dependency_position)) &&
      !original?.stale_causes?.some(c => c.change_position === cause.change_position))
      triggers.push({ kind: 'dependency_change', assessment_id: watched.assessment_id, dependency_position: watched.dependency_position, change_position: cause.change_position })
  }
  for (const row of after.relevance_declarations ?? []) if (row.candidate_id === declaration.candidate_id &&
    !before.relevance_declarations?.some(r => r.candidate_id === row.candidate_id && r.change_position === row.change_position))
    triggers.push({ kind: 'new_relevant_input', change_position: row.change_position, selection_ref: row.selection_ref, selection_method: row.selection_method })
  return triggers.sort((a, b) => BigInt(a.change_position) < BigInt(b.change_position) ? -1 : BigInt(a.change_position) > BigInt(b.change_position) ? 1 : JSON.stringify(a).localeCompare(JSON.stringify(b)))[0] ?? null
}

/** Automatic reconsideration uses retained inputs and the same private receipt/CAS chain. No source HTTP. */
export async function runSelectiveReconsideration(backend, request) {
  exact(request, ['user_id', 'investigation_id', 'selection_id'])
  const owner = envelope(structuredClone(request)), saved = await backend.selectiveExecution('read', owner)
  if (!saved.execution || !saved.declaration) return { state: 'no_executed_selection', source_requests: 0, publicly_eligible: false }
  const base = await backend.workspace('read', { user_id: owner.user_id, investigation_id: owner.investigation_id, version_id: saved.declaration.version_id })
  let current = await backend.workspace('read', { user_id: owner.user_id, investigation_id: owner.investigation_id })
  if (JSON.stringify(current.observation.scope_candidate_ids) !== JSON.stringify(base.observation.scope_candidate_ids)) fail('reconsideration explicit scope changed', '40001')
  if (current.observation.id === base.observation.id) {
    // Refresh native evidence without inferring a trigger from a watermark or timer.
    const observed = await backend.observations('observe', { observation_id: randomUUID(),
      previous_observation_id: base.observation.id, candidate_ids: base.observation.scope_candidate_ids })
    const trigger = nextSelectiveTrigger(saved.declaration.result, base.observation, observed)
    if (!trigger) return { state: 'no_new_bound_cause', source_requests: 0, publicly_eligible: false }
    const version = await backend.workspace('put', { investigation_id: owner.investigation_id, version_id: selectiveExecutionId(observed.id, 'version'),
      previous_version_id: current.head_version_id, observation_id: observed.id, state: current.version.state, change_reason: 'Observed native selective reconsideration cause.' })
    current = { ...current, observation: observed, version, head_version_id: version.id }
  }
  const trigger = nextSelectiveTrigger(saved.declaration.result, base.observation, current.observation)
  if (!trigger) return { state: 'no_new_bound_cause', source_requests: 0, publicly_eligible: false }
  const key = selectiveExecutionId(saved.execution.execution_id, trigger, current.observation.id)
  const result = reconsiderSelectiveIntake(saved.declaration.result, nativeObservation(base), nativeObservation(current), {
    trigger, selection_ref: `registered-reconsideration:${key}`, rationale: 'Automatically selected newly observed native dependency or relevance cause.' })
  const reconsidered = await backend.selectiveExecution('reconsider', { ...owner, previous_execution_id: saved.execution.execution_id,
    annotation: { user_id: owner.user_id, investigation_id: owner.investigation_id, version_id: current.version.id,
      receipt_id: selectiveExecutionId(key, 'reconsideration'), previous_receipt_id: saved.declaration.receipt_id,
      declaration_receipt_id: saved.declaration.receipt_id, result } })
  const candidate = saved.declaration.candidate_id, assessment = await analyze(backend, candidate, saved.execution.assessment_id)
  // Rebase watched dependencies on a fresh native observation, preserving the original immutable capture/candidate.
  const rebased = await observeVersion(backend, owner, current, current.observation.scope_candidate_ids, key, current.observation.id)
  const execution = await annotate(backend, owner, saved, rebased, candidate, assessment, reconsidered.receipt.receipt_id,
    saved.execution.execution_id, reconsidered.receipt.receipt_id, reconsidered.decision.disposition, key)
  return { state: 'reconsidered', trigger, execution, source_requests: 0, publicly_eligible: false }
}
