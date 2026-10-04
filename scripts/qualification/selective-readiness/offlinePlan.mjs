// Qualification only. Supplied native rows and their digest are integrity evidence,
// not authenticated database reads, rights acceptance, or live activation authority.
import { createHash } from 'node:crypto'
import { runSelectiveSource, runSelectiveReconsideration } from '../../selectiveIntakeExecution.mjs'

const contract = 'mip-selective-readiness-offline-fixture-20261004-v1'
const fail = message => { throw Object.assign(new Error(message), { code: 'invalid_readiness_plan' }) }
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('exact native row shape required')
}
const requiredText = value => typeof value === 'string' && value.trim().length > 0
const same = (left, right) => { if (left !== right) fail('offline native binding mismatch') }
const canonical = value => {
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Array.from({ length: value.length }, (_, index) => index).some(index => !Object.hasOwn(value, index))) fail('dense JSON native arrays required')
    return value.map(canonical)
  }
  if (value && typeof value === 'object') {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('plain JSON native objects required')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  }
  if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return value
  fail('JSON native evidence required')
}
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

/** Bind the existing SQL run-preflight projection; do not recompute its policy. */
export function prepareSelectiveReadinessPlan(rows, { now = Date.now } = {}) {
  exact(rows, ['request', 'criteria', 'authorization', 'preflight'])
  const bindings = structuredClone(rows), { request: request, criteria: criteria, authorization: authorization, preflight: preflight } = bindings
  exact(request, ['user_id', 'investigation_id', 'version_id', 'selection_id', 'previous_selection_id', 'authorization_id', 'metadata'])
  exact(criteria, ['criteria_key', 'criteria_version', 'policy_version', 'acceptance_ref', 'rules'])
  exact(authorization, ['authorization_id', 'investigation_id', 'actor_id', 'criteria_key', 'criteria_version', 'source_url', 'format', 'rights_ref',
    'acquire_allowed', 'retain_allowed', 'analyze_allowed', 'enabled', 'expires_at', 'max_bytes', 'max_requests', 'incremental_cost_usd'])
  exact(preflight, ['authorization_id', 'source_url', 'format', 'criteria_key', 'criteria_version', 'policy_version', 'acceptance_ref', 'rights_ref',
    'exact_assigned_scope', 'assigned_reviewer', 'native_head_matches', 'operation_rights_active', 'zero_incremental_cost', 'request_quota_available',
    'max_bytes', 'max_requests', 'expires_at', 'exact_endpoint_matches', 'proposed_disposition', 'publicly_eligible', 'source_requests'])
  for (const key of ['criteria_key', 'criteria_version', 'policy_version', 'acceptance_ref']) {
    if (!requiredText(criteria[key])) fail('accepted criteria reference required')
    same(criteria[key], preflight[key])
  }
  for (const key of ['criteria_key', 'criteria_version']) same(criteria[key], authorization[key])
  same(request.authorization_id, authorization.authorization_id)
  same(request.investigation_id, authorization.investigation_id)
  same(request.user_id, authorization.actor_id)
  same(request.metadata?.url, authorization.source_url)
  for (const key of ['authorization_id', 'source_url', 'format', 'rights_ref', 'max_bytes', 'max_requests', 'expires_at']) same(authorization[key], preflight[key])
  if (!requiredText(authorization.rights_ref) || authorization.format !== 'mip_article_json_v1' ||
      !Number.isInteger(authorization.max_bytes) || authorization.max_bytes < 1 || authorization.max_bytes > 240000 ||
      !Number.isInteger(authorization.max_requests) || authorization.max_requests < 1 || authorization.max_requests > 100 ||
      authorization.incremental_cost_usd !== 0) fail('bounded zero-cost rights record required')
  for (const key of ['acquire_allowed', 'retain_allowed', 'analyze_allowed', 'enabled']) if (authorization[key] !== true) fail('source rights are held')
  for (const key of ['exact_assigned_scope', 'assigned_reviewer', 'native_head_matches', 'operation_rights_active', 'zero_incremental_cost',
    'request_quota_available', 'exact_endpoint_matches']) if (preflight[key] !== true) fail('native preflight is held')
  const currentTime = now()
  if (!Number.isFinite(currentTime) || !Number.isFinite(Date.parse(authorization.expires_at)) || Date.parse(authorization.expires_at) <= currentTime) fail('source rights expired')
  exact(preflight.proposed_disposition, ['disposition', 'reason'])
  if (!['analyze_now', 'retain_deferred', 'skip_for_now'].includes(preflight.proposed_disposition.disposition) ||
      !requiredText(preflight.proposed_disposition.reason) || preflight.publicly_eligible !== false || preflight.source_requests !== 0) fail('private native preview required')
  // Full rules, request metadata/classification references, rights and preview are retained
  // unchanged in the digest. This intentionally adds no second metadata-policy engine.
  canonical(bindings)
  return freeze({ contract, evidence_kind: 'offlineRPCmock', bindings, plan_sha256: digest(bindings),
    live_collection_enabled: false, publicly_eligible: false, source_requests: 0 })
}

/** An explicit digest opts into one injected fixture call. No scheduler or fetch fallback. */
export async function runSelectiveReadinessFixture(plan, { enabled = false, plan_sha256 = null, operation = 'source', backend, fetchImpl, now = Date.now } = {}) {
  if (enabled !== true) return { state: 'disabled', evidence_kind: 'offlineRPCmock', live_collection_enabled: false, publicly_eligible: false, source_requests: 0 }
  exact(plan, ['contract', 'evidence_kind', 'bindings', 'plan_sha256', 'live_collection_enabled', 'publicly_eligible', 'source_requests'])
  const checked = prepareSelectiveReadinessPlan(plan.bindings, { now })
  if (plan.contract !== contract || plan.evidence_kind !== 'offlineRPCmock' || plan.live_collection_enabled !== false ||
      plan.publicly_eligible !== false || plan.source_requests !== 0 || plan.plan_sha256 !== checked.plan_sha256 || plan_sha256 !== checked.plan_sha256) fail('exact fixture plan opt-in required')
  if (!backend || typeof backend.selectiveExecution !== 'function' || !['source', 'reconsider'].includes(operation) ||
      (operation === 'source' && typeof fetchImpl !== 'function')) fail('explicit fixture transports required')
  const request = checked.bindings.request
  const result = operation === 'source' ? await runSelectiveSource(backend, request, { fetchImpl, now }) :
    await runSelectiveReconsideration(backend, { user_id: request.user_id, investigation_id: request.investigation_id, selection_id: request.selection_id })
  return { state: 'fixture_completed', evidence_kind: 'offlineRPCmock', live_collection_enabled: false, result }
}
