// Called only after retainedContextObservation has copied bounded plain JSON.
// This validates operator assertions, not legal clearance or registry authority.
const operations = ['display', 'analysis', 'retain', 'cache', 'export', 'redistribute']
const fail = code => { throw new Error(code) }
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 2048
const token = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(v)
function fields(v, names, code) {
  if (!v || typeof v !== 'object' || Array.isArray(v) ||
      Object.keys(v).length !== names.length || names.some(k => !Object.hasOwn(v,k))) fail(code)
}
function references(v) {
  if (!Array.isArray(v) || !v.length || v.length > 16 || !v.every(text)) fail('layer_references_required')
}
function layer(v, optional) {
  fields(v, ['status','scope','reason','references','checks','permissions','obligations'], 'invalid_rights_layer')
  references(v.references)
  if (!text(v.reason)) fail('layer_reason_required')
  if (optional && v.status === 'not_applicable') {
    if (v.scope !== null || v.checks !== null || v.permissions !== null ||
        !Array.isArray(v.obligations) || v.obligations.length) fail('invalid_not_applicable_layer')
    return null
  }
  if (v.status !== 'confirmed') fail('rights_layer_incomplete')
  fields(v.scope, ['provider','product','release'], 'exact_layer_scope_required')
  if (!Object.values(v.scope).every(token)) fail('exact_layer_scope_required')
  fields(v.checks, ['commercial_use','patent_license_compatibility','terms'], 'invalid_layer_checks')
  if (Object.values(v.checks).some(x => x !== 'confirmed')) fail('layer_checks_incomplete')
  fields(v.permissions, operations, 'invalid_layer_permissions')
  if (operations.some(k => typeof v.permissions[k] !== 'boolean')) fail('layer_permission_unknown')
  if (!Array.isArray(v.obligations) || v.obligations.length > 16) fail('invalid_layer_obligations')
  for (const obligation of v.obligations) {
    fields(obligation, ['kind','statement','implementation_reference'], 'invalid_layer_obligation')
    if (!['attribution','citation','notice','retention','redistribution','other'].includes(obligation.kind) ||
        !text(obligation.statement) || !text(obligation.implementation_reference)) fail('unimplemented_layer_obligation')
  }
  return v
}
export function validateContextRightsLayers(review, source) {
  fields(review.layers, ['software','service','dataset','upstream','upstream_inventory_complete','request_limits'], 'separate_rights_layers_required')
  const layers = review.layers
  const software = layer(layers.software, true), service = layer(layers.service, true)
  const dataset = layer(layers.dataset, false)
  if (['provider','product','release'].some(k => dataset.scope[k] !== source[k])) fail('dataset_rights_scope_mismatch')
  if (service && service.scope.provider !== source.provider) fail('service_rights_provider_mismatch')
  if (layers.upstream_inventory_complete !== true) fail('upstream_inventory_incomplete')
  if (!token(source.upstream_origin) || !Array.isArray(layers.upstream) ||
      !layers.upstream.length || layers.upstream.length > 16) fail('upstream_rights_required')
  const upstream = layers.upstream.map(v => layer(v, false))
  const seen = new Set()
  for (const entry of upstream) {
    const identity = JSON.stringify(['provider','product','release'].map(k => entry.scope[k]))
    if (seen.has(identity)) fail('duplicate_upstream_rights')
    seen.add(identity)
  }
  if (!upstream.some(v => v.scope.provider === source.upstream_origin)) fail('upstream_origin_rights_mismatch')
  const active = [software, service, dataset, ...upstream].filter(Boolean)
  for (const op of ['display','analysis','retain','export','redistribute']) {
    if (review.permissions[op] && active.some(v => !v.permissions[op])) fail('rights_permission_exceeds_layer')
  }
  if (service) {
    fields(layers.request_limits, ['max_requests','window_seconds','max_records_per_request','max_concurrency','reference'], 'bounded_service_limits_required')
    for (const key of ['max_requests','window_seconds','max_records_per_request','max_concurrency']) {
      const n = layers.request_limits[key]
      if (!Number.isSafeInteger(n) || n < 1) fail('service_limit_unknown_or_unbounded')
    }
    if (!text(layers.request_limits.reference)) fail('service_limit_reference_required')
  } else if (layers.request_limits !== null) fail('limits_without_service')
  // Permissions remain assertions. No network, retention, cache or export executes.
}
