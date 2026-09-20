// Non-deployed, network-free algorithm shadow. The host supplies only a
// dedicated claim/complete/fail capability and SHA-256 implementation.
import {extractCitations, extractClaims, extractEntityCandidates, guessEntityType, normalizeEntityName, parseFeed} from './predecessorV8.js'

export const PREDECESSOR = Object.freeze({
  source_project: 'yhbwnrtlqbjtcrrlpbge',
  slug: 'ingest-rss',
  deployed_version: 8,
  edge_package_sha256: 'ace39d46b2b6970b57f01c76dae8480fe4e8c7a164fccf7868d4b2870ae6ddc2',
  normalized_source_sha256: '08e619cabdf845a36728e7af7791e72b723192654cfb64f95a472dc89d553afc',
  adapter: 'predecessor-seams:ingest-rss-v8:heuristic-only:candidate-v2',
})

const CHANGE_CAUSES = new Set(['new_relevant_evidence','source_corrected','source_retracted','source_revised','source_lineage_changed','entity_merged','entity_split','entity_remapped','relationship_reassessed','assessment_revised','temporal_reinterpreted','algorithm_changed','policy_changed','domain_adapter_changed','provider_model_or_method_changed','visibility_changed','human_review_or_override'])
const HEX = /^[0-9a-f]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_INPUT_BYTES = 2_100_000
const OUTLET_NAME_ALIASES = ['daily mail','mail online','mailonline','the daily mail','dailymail']
const exactKeys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')
const boundedText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function validateUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && (!url.port || url.port === '443')
  } catch { return false }
}

function feedEnvelope(text) {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (/^(?:<\?xml\b[^>]*>\s*)?<rss\b[\s\S]*<\/rss>\s*$/i.test(trimmed)) {
    if ((trimmed.match(/<rss[\s>]/gi) ?? []).length === 1 && (trimmed.match(/<\/rss>/gi) ?? []).length === 1 &&
      (trimmed.match(/<item[\s>]/gi) ?? []).length === (trimmed.match(/<\/item>/gi) ?? []).length) return 'rss'
  }
  if (/^(?:<\?xml\b[^>]*>\s*)?<feed\b[\s\S]*<\/feed>\s*$/i.test(trimmed)) {
    if ((trimmed.match(/<feed[\s>]/gi) ?? []).length === 1 && (trimmed.match(/<\/feed>/gi) ?? []).length === 1 &&
      (trimmed.match(/<entry[\s>]/gi) ?? []).length === (trimmed.match(/<\/entry>/gi) ?? []).length) return 'atom'
  }
  throw new Error('mip_shadow_unsupported_or_malformed_feed')
}

function parsedUrlState(value) {
  if (value === null) return 'absent'
  try { return ['http:','https:'].includes(new URL(value).protocol) ? 'tainted_unvalidated' : 'quarantined_unsafe_scheme' }
  catch { return 'quarantined_malformed' }
}

export async function validateRetainedInput(input, sha256) {
  if (!exactKeys(input, ['version','source','payload','rights','method','config','knowledge_change'])) throw new Error('mip_shadow_input_shape')
  if (input.version !== 1 || !exactKeys(input.source, ['project_ref','source_id','feed_url','observed_at','registry_revision','binding_sha256']) ||
    input.source.project_ref !== PREDECESSOR.source_project || !boundedText(input.source.source_id, 200) ||
    !validateUrl(input.source.feed_url) || !Number.isFinite(Date.parse(input.source.observed_at)) || !boundedText(input.source.registry_revision, 300) ||
    !HEX.test(input.source.binding_sha256) || await sha256(canonicalJson({project_ref: input.source.project_ref, source_id: input.source.source_id,
      feed_url: input.source.feed_url, registry_revision: input.source.registry_revision})) !== input.source.binding_sha256)
    throw new Error('mip_shadow_source_binding')
  if (!exactKeys(input.payload, ['content_type','sha256','text']) || !['application/rss+xml','application/atom+xml','application/xml','text/xml'].includes(input.payload.content_type) ||
    !HEX.test(input.payload.sha256) || !boundedText(input.payload.text, 2_000_000) || new TextEncoder().encode(input.payload.text).byteLength > 2_000_000 ||
    await sha256(input.payload.text) !== input.payload.sha256) throw new Error('mip_shadow_payload_binding')
  if (!exactKeys(input.rights, ['visibility','basis','policy_version','approval_id','envelope_sha256']) || input.rights.visibility !== 'public' ||
    !boundedText(input.rights.basis, 200) || !boundedText(input.rights.policy_version, 100) || !boundedText(input.rights.approval_id, 300) ||
    !HEX.test(input.rights.envelope_sha256) || await sha256(canonicalJson({visibility: input.rights.visibility, basis: input.rights.basis,
      policy_version: input.rights.policy_version, approval_id: input.rights.approval_id})) !== input.rights.envelope_sha256)
    throw new Error('mip_shadow_rights_binding')
  if (!exactKeys(input.method, ['adapter','edge_package_sha256','normalized_source_sha256','provider_state','config_snapshot_sha256']) ||
    input.method.adapter !== PREDECESSOR.adapter || input.method.edge_package_sha256 !== PREDECESSOR.edge_package_sha256 ||
    input.method.normalized_source_sha256 !== PREDECESSOR.normalized_source_sha256 || input.method.provider_state !== 'disabled' ||
    !HEX.test(input.method.config_snapshot_sha256) || await sha256(canonicalJson(input.config)) !== input.method.config_snapshot_sha256)
    throw new Error('mip_shadow_method_binding')
  if (!exactKeys(input.config, ['citation_weights','max_items','outlet_names']) || !Number.isInteger(input.config.max_items) ||
    input.config.max_items < 1 || input.config.max_items > 100 || !Array.isArray(input.config.outlet_names) || input.config.outlet_names.length > 500 ||
    input.config.outlet_names.some(name => !boundedText(name, 200)) || !input.config.citation_weights || typeof input.config.citation_weights !== 'object' ||
    Array.isArray(input.config.citation_weights) || Object.values(input.config.citation_weights).some(value => !Number.isFinite(value) || value < 0 || value > 1))
    throw new Error('mip_shadow_config_binding')
  if (!exactKeys(input.knowledge_change, ['cause','prior_revision']) || !CHANGE_CAUSES.has(input.knowledge_change.cause) ||
    !(input.knowledge_change.prior_revision === null || boundedText(input.knowledge_change.prior_revision, 300))) throw new Error('mip_shadow_change_binding')
  return input
}

const absence = rows => rows.length ? null : 'not_extracted'

export async function deriveAlgorithmShadow(input, sha256) {
  await validateRetainedInput(input, sha256)
  const envelope = feedEnvelope(input.payload.text)
  const parsed = parseFeed(input.payload.text, input.source.feed_url)
  const outlets = new Set([...input.config.outlet_names.map(normalizeEntityName), ...OUTLET_NAME_ALIASES])
  const items = parsed.slice(0, input.config.max_items).map(item => {
    const urlState = parsedUrlState(item.url)
    const imageUrlState = parsedUrlState(item.image_url)
    const taint = {article_url: urlState, image_url: imageUrlState, promotion_eligible: false}
    if (urlState.startsWith('quarantined_')) return {item, taint, disposition: 'quarantined_unsafe_url',
      candidates: {citations: [], claims: [], entities: []},
      absence: {citations: 'unknown_or_unresolved', claims: 'unknown_or_unresolved', entities: 'unknown_or_unresolved'}}
    const analysisText = `${item.title}. ${item.summary ?? ''}`
    const citations = extractCitations(analysisText, input.config.citation_weights)
    const claims = extractClaims(analysisText)
    const entities = extractEntityCandidates(analysisText, outlets).map(candidate => ({
      ...candidate, normalized_name: normalizeEntityName(candidate.surface), entity_type_guess: guessEntityType(candidate.surface),
    }))
    return {item, taint, disposition: 'staged_unreviewed', candidates: {citations, claims, entities}, absence: {
      citations: absence(citations), claims: absence(claims), entities: absence(entities),
    }}
  })
  const body = {
    contract_version: 2,
    source: {...input.source, observed_at: new Date(input.source.observed_at).toISOString()},
    rights: input.rights,
    method: {...input.method, provider_result: 'disabled', qualification: 'unverified_host_assertions'},
    knowledge_change: input.knowledge_change,
    coverage: {payload: 'caller_supplied_staged_text', envelope,
      parse: parsed.length ? 'bounded_predecessor_parse_completed' : 'bounded_predecessor_parse_zero_items',
      extraction: parsed.length ? 'bounded_candidate_extraction_completed' : 'not_applicable_zero_items',
      parsed_items: parsed.length, evaluated_items: items.length, remaining_items: Math.max(0, parsed.length - items.length),
      remaining_state: parsed.length > items.length ? 'coverage_incomplete' : null},
    items,
    declared_effect_scope: {canonical_domain_writes: 'forbidden', publication_writes: 'forbidden', predecessor_acknowledgements: 'forbidden',
      provider_calls: 'forbidden', evidence_status: 'requires_independent_host_and_database_audit'},
    predecessor: PREDECESSOR,
  }
  return {...body, output_sha256: await sha256(canonicalJson(body))}
}

// Qualification core only. Any future deployable entrypoint must call this via
// runDurableAlgorithmShadowWorker and an independently reviewed capability host.
export async function runAlgorithmShadowWorker({rpc, requestId, session, runtime, implementation, sha256}) {
  const context = {p_session: session, p_runtime: runtime}
  const requestIds = new Set()
  const nextRequest = label => {
    const value = requestId(label)
    if (!UUID.test(value) || requestIds.has(value)) throw new Error('mip_shadow_request_id_binding')
    requestIds.add(value); return value
  }
  const claim = await rpc('shadow_claim', {...context, p_request: nextRequest('claim')})
  if (claim === null) return {state: 'idle'}
  if (!claim.lease_token) return {state: 'claim_receipt_only', generation: claim.generation_id}
  const binding = {...context, p_generation: claim.generation_id, p_token: claim.lease_token,
    p_input_hash: claim.input_hash, p_implementation: claim.implementation_ref}
  let output
  try {
    if (claim.implementation_ref !== implementation) throw new Error('mip_shadow_implementation_mismatch')
    if (typeof claim.input_text !== 'string' || new TextEncoder().encode(claim.input_text).byteLength > MAX_INPUT_BYTES)
      throw new Error('mip_shadow_retained_input_size')
    if (await sha256(claim.input_text) !== claim.input_hash) throw new Error('mip_shadow_retained_input_hash_mismatch')
    output = await deriveAlgorithmShadow(JSON.parse(claim.input_text), sha256)
  } catch (error) {
    const code = /^mip_shadow_[a-z_]+$/.test(error?.message ?? '') ? error.message : 'mip_shadow_bounded_algorithm_failure'
    const state = await rpc('shadow_fail', {...binding, p_request: nextRequest('failure'), p_failure_code: code})
    return {state, generation: claim.generation_id}
  }
  const completion = {...binding, p_request: nextRequest('complete'), p_output: output}
  try {
    const state = await rpc('shadow_complete', completion)
    return {state, generation: claim.generation_id, output_sha256: output.output_sha256}
  } catch {
    return {state: 'completion_unconfirmed', generation: claim.generation_id, retry: () => rpc('shadow_complete', completion)}
  }
}
