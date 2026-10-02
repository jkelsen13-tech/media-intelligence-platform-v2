// SOURCE-only declarations over existing intake/observation records. No IO or admission authority.
import { createHash } from 'node:crypto'

const CONTRACT = 'selective-intake-declaration-1'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fail = message => { throw new TypeError(message) }
const object = (value, label) => value && typeof value === 'object' && !Array.isArray(value) ? value : fail(`invalid ${label}`)
const text = (value, label, max = 2000) => typeof value === 'string' && value.length <= max && value.trim() === value && value.length > 0 ? value : fail(`invalid ${label}`)
const id = (value, label) => typeof value === 'string' && uuid.test(value) ? value : fail(`invalid ${label}`)
const position = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n ? value : fail('invalid input position')
const exactKeys = (value, keys, label) => { object(value, label); if (Object.keys(value).some(key => !keys.includes(key))) fail(`unsupported ${label} field`) }
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
const clone = value => JSON.parse(JSON.stringify(value))
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const unique = (rows, key, label) => {
  const map = new Map()
  for (const row of rows) { const k = key(row); if (map.has(k)) fail(`duplicate ${label}`); map.set(k, row) }
  return map
}

function snapshot(observation) {
  object(observation, 'observation'); id(observation.id, 'observation id')
  const s = object(observation.snapshot, 'observation snapshot')
  if (s.contract_version !== 'investigation-observation-1' || s.coverage !== 'complete_for_explicit_scope' ||
      observation.publicly_eligible !== false || s.publicly_eligible !== false) fail('unsupported observation contract')
  if (!Array.isArray(s.scope_candidate_ids) || !s.scope_candidate_ids.length || !Array.isArray(observation.scope_candidate_ids) ||
      JSON.stringify(s.scope_candidate_ids) !== JSON.stringify(observation.scope_candidate_ids)) fail('invalid observation scope')
  const scope = unique(s.scope_candidate_ids, value => id(value, 'scope candidate'), 'scope candidate')
  if (!Array.isArray(s.candidates) || !Array.isArray(s.inputs) || !Array.isArray(s.assessments)) fail('incomplete observation')
  const candidates = unique(s.candidates, row => id(row.id, 'candidate id'), 'candidate')
  // Native snapshots also retain candidates belonging to ancestor assessments.
  if ([...scope.keys()].some(key => !candidates.has(key))) fail('candidate scope mismatch')
  const inputs = unique(s.inputs, row => position(row.position), 'input')
  for (const row of inputs.values()) {
    if (!!row.capture === !!row.record_version) fail('invalid retained input')
    if (row.capture) { id(row.capture.id, 'capture id'); id(row.capture.article_id, 'article id'); text(row.capture.content_hash, 'content hash') }
    else { id(row.record_version.id, 'record version id'); text(row.record_version.record_kind, 'record kind'); text(row.record_version.record_key, 'record key') }
  }
  const assessments = unique(s.assessments, row => id(row.id, 'assessment id'), 'assessment')
  const relevance = unique(s.relevance_declarations ?? [], row => `${id(row.candidate_id, 'relevance candidate')}:${position(row.change_position)}`, 'relevance declaration')
  return { scope, candidates, inputs, assessments, relevance }
}
const subject = input => input.capture ? `article:${input.capture.article_id}` : `${input.record_version.record_kind}:${input.record_version.record_key}`
function inputAt(s, p) { const row = s.inputs.get(position(p)); if (!row) fail('unknown retained input'); return row }
function dependency(s, candidateId, assessmentId, dependencyPosition) {
  const row = s.assessments.get(id(assessmentId, 'assessment id'))
  if (!row || row.candidate_id !== candidateId) fail('unknown or wrong-candidate assessment')
  if (!Array.isArray(row.context_positions) || !row.context_positions.includes(position(dependencyPosition))) fail('undeclared dependency')
  inputAt(s, dependencyPosition)
  return row
}
function relevant(s, candidateId, trigger) {
  const row = s.relevance.get(`${candidateId}:${position(trigger.change_position)}`)
  if (!row || row.selection_ref !== text(trigger.selection_ref, 'selection ref') || row.selection_method !== text(trigger.selection_method, 'selection method')) fail('unknown or mismatched relevance declaration')
  inputAt(s, trigger.change_position)
  return row
}
function triggerRef(s, candidateId, trigger) {
  if (trigger.kind === 'dependency_change') {
    exactKeys(trigger, ['kind', 'assessment_id', 'dependency_position'], 'dependency trigger')
    const row = dependency(s, candidateId, trigger.assessment_id, trigger.dependency_position)
    if (row.stale !== false || row.superseded_by?.length) fail('stale or superseded dependency declaration')
    return { kind: trigger.kind, assessment_id: row.id, dependency_position: trigger.dependency_position }
  }
  if (trigger.kind === 'new_relevant_input') {
    exactKeys(trigger, ['kind', 'change_position', 'selection_ref', 'selection_method'], 'relevance trigger')
    const row = relevant(s, candidateId, trigger)
    return { kind: trigger.kind, change_position: row.change_position, selection_ref: row.selection_ref, selection_method: row.selection_method }
  }
  fail('unsupported reconsideration trigger')
}

/** Caller assertions, not authenticated review or policy approval. Snapshots must come from an authorized owner. */
export function declareSelectiveIntake(observation, declaration) {
  exactKeys(declaration, ['observation_id', 'candidate_id', 'capture_id', 'content_hash', 'input_position', 'extractor_version',
    'disposition', 'method_key', 'method_version', 'policy_version', 'selection_ref', 'rationale', 'domain_declarations', 'reconsideration_triggers'], 'selection declaration')
  const s = snapshot(observation)
  if (id(declaration.observation_id, 'observation id') !== observation.id) fail('observation mismatch')
  const candidate = s.candidates.get(id(declaration.candidate_id, 'candidate id'))
  if (!candidate) fail('unknown candidate')
  if (!s.scope.has(candidate.id)) fail('candidate outside explicit scope')
  const input = inputAt(s, declaration.input_position)
  if (!input.capture || candidate.capture_id !== id(declaration.capture_id, 'capture id') || input.capture.id !== candidate.capture_id ||
      text(declaration.content_hash, 'content hash') !== input.capture.content_hash ||
      text(declaration.extractor_version, 'extractor version') !== candidate.extractor_version) fail('candidate capture/version mismatch')
  if (!['analyze_now', 'retain_deferred', 'skip_for_now'].includes(declaration.disposition)) fail('invalid disposition')
  if (!Array.isArray(declaration.reconsideration_triggers) || !declaration.reconsideration_triggers.length || declaration.reconsideration_triggers.length > 50) fail('explicit reconsideration references required')
  const triggers = declaration.reconsideration_triggers.map(trigger => triggerRef(s, candidate.id, object(trigger, 'trigger')))
  unique(triggers, hash, 'trigger')
  if (!Array.isArray(declaration.domain_declarations) || !declaration.domain_declarations.length || declaration.domain_declarations.length > 50) fail('explicit domain declarations required')
  const domains = declaration.domain_declarations.map(domain => {
    exactKeys(domain, ['domain_ref', 'classification_ref'], 'domain declaration')
    return { domain_ref: text(domain.domain_ref, 'domain ref', 200), classification_ref: text(domain.classification_ref, 'classification ref') }
  })
  unique(domains, domain => domain.domain_ref, 'domain')
  const normalized = { contract_version: CONTRACT, observation_id: observation.id, observation_sha256: hash(observation),
    candidate_id: candidate.id, capture_id: input.capture.id, content_hash: input.capture.content_hash, input_position: input.position,
    extractor_version: candidate.extractor_version, disposition: declaration.disposition,
    ...Object.fromEntries(['method_key', 'method_version', 'policy_version', 'selection_ref', 'rationale'].map(key => [key, text(declaration[key], key)])),
    domain_declarations: domains.sort((a, b) => compare(a.domain_ref, b.domain_ref)),
    reconsideration_triggers: triggers.sort((a, b) => compare(JSON.stringify(stable(a)), JSON.stringify(stable(b)))),
    provenance: 'caller_self_assertion', rights_admission: 'not_established', publicly_eligible: false, persisted: false, execution: 'none' }
  return { ...normalized, declaration_sha256: hash(normalized) }
}

/** An explicit new request over a native successor observation, never an automatic selection or promotion. */
export function reconsiderSelectiveIntake(declaration, baseline, current, request) {
  object(declaration, 'saved declaration')
  const { declaration_sha256, ...saved } = declaration
  if (saved.contract_version !== CONTRACT || hash(saved) !== declaration_sha256 || saved.observation_id !== baseline.id || saved.observation_sha256 !== hash(baseline)) fail('saved declaration/baseline mismatch')
  const original = declareSelectiveIntake(baseline, Object.fromEntries(['observation_id', 'candidate_id', 'capture_id', 'content_hash', 'input_position', 'extractor_version',
    'disposition', 'method_key', 'method_version', 'policy_version', 'selection_ref', 'rationale', 'domain_declarations', 'reconsideration_triggers'].map(key => [key, saved[key]])))
  if (original.declaration_sha256 !== declaration_sha256) fail('noncanonical saved declaration')
  const before = snapshot(baseline), after = snapshot(current)
  if (current.id === baseline.id || current.previous_observation_id !== baseline.id ||
      JSON.stringify(current.scope_candidate_ids) !== JSON.stringify(baseline.scope_candidate_ids)) fail('native successor observation required')
  // Both observations must retain the exact immutable candidate and original capture.
  const candidate = after.candidates.get(saved.candidate_id)
  if (!candidate || hash(candidate) !== hash(before.candidates.get(saved.candidate_id)) || hash(inputAt(after, saved.input_position)) !== hash(inputAt(before, saved.input_position))) fail('changed original candidate/input')
  exactKeys(request, ['trigger', 'selection_ref', 'rationale'], 'reconsideration request')
  const trigger = object(request.trigger, 'reconsideration trigger')
  let bound
  if (trigger.kind === 'dependency_change') {
    exactKeys(trigger, ['kind', 'assessment_id', 'dependency_position', 'change_position'], 'dependency change')
    const previous = dependency(before, saved.candidate_id, trigger.assessment_id, trigger.dependency_position)
    const watched = saved.reconsideration_triggers.some(t => t.kind === trigger.kind && t.assessment_id === previous.id && t.dependency_position === trigger.dependency_position)
    if (!watched) fail('dependency not declared for reconsideration')
    const assessment = dependency(after, saved.candidate_id, trigger.assessment_id, trigger.dependency_position)
    const changed = inputAt(after, trigger.change_position)
    const hasCause = row => row.stale_causes?.some(c => c.change_position === trigger.change_position)
    if (assessment.stale !== true || !hasCause(assessment) || hasCause(previous)) fail('new observed dependency cause required')
    if (subject(changed) !== subject(inputAt(before, trigger.dependency_position))) fail('wrong dependency subject')
    bound = { kind: trigger.kind, assessment_id: previous.id, dependency_position: trigger.dependency_position, change_position: changed.position }
  } else if (trigger.kind === 'new_relevant_input') {
    bound = triggerRef(after, saved.candidate_id, trigger)
    if (before.relevance.has(`${saved.candidate_id}:${bound.change_position}`)) fail('new observed relevance declaration required')
  } else fail('unsupported reconsideration trigger')
  return clone({ contract_version: 'selective-intake-reconsideration-1', declaration_sha256, baseline_observation_id: baseline.id,
    current_observation_id: current.id, current_observation_sha256: hash(current), candidate_id: saved.candidate_id,
    disposition: saved.disposition, status: 'needs_reconsideration', trigger: bound,
    selection_ref: text(request.selection_ref, 'selection ref'), rationale: text(request.rationale, 'rationale'),
    provenance: 'caller_self_assertion', rights_admission: 'not_established', publicly_eligible: false, persisted: false, execution: 'none' })
}
