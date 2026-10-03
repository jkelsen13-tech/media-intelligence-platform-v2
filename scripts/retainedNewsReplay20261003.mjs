import { createHash } from 'node:crypto'
import { normalizePublicStoryContext } from '../src/lib/storyFollowingClient.js'
import { inspectionInstantMilliseconds, inspectionInstantNanoseconds } from '../src/lib/inspectionTime.js'
import { evaluateNewsStoryState, newsSourceReports } from '../src/lib/newsStoryState.js'
import { NEWS_STATE_CANDIDATES, NEWS_STATE_POLICY } from '../src/lib/newsStatePolicy.js'

export const REPLAY_CONTRACT = 'mip-retained-news-replay-2026-10-03-v1'
export const REQUIRED_SCENARIOS = Object.freeze(['rapid', 'slow', 'quiet_unresolved', 'one_off', 'correction', 'retraction', 'contradiction', 'stale_source_report', 'repeated_fetch', 'syndication', 'late_evidence', 'missing_time'])
const states = new Set(['Breaking', 'Developing', 'UpdatedEstablished', 'Historical', 'UNAVAILABLE'])
const reports = new Set(['BREAKING • SOURCE REPORT', 'SOURCE REPORT', 'NONE'])
const text = value => typeof value === 'string' && value.trim().length > 0
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
export const replayValueSha256 = value => sha(JSON.stringify(stable(value)))
function check(condition, reason) { if (!condition) throw new Error(reason) }
function clock(value) {
  const ns = inspectionInstantNanoseconds(value)
  check(ns !== null && ns % 1000000n === 0n, 'replay_clock_requires_exact_integral_millisecond_instant')
  const result = inspectionInstantMilliseconds(value)
  check(Number.isSafeInteger(result), 'invalid_replay_clock')
  return result
}
function retainedBytes(receipt) {
  check(receipt && text(receipt.retained_base64) && /^[A-Za-z0-9+/]*={0,2}$/.test(receipt.retained_base64), 'missing_retained_receipt_bytes')
  const bytes = Buffer.from(receipt.retained_base64, 'base64')
  check(bytes.length > 0 && bytes.toString('base64') === receipt.retained_base64 && sha(bytes) === receipt.sha256, 'retained_receipt_digest_mismatch')
  return bytes
}
function validateSnapshot(snapshot) {
  const observedMs = clock(snapshot.observed_at)
  const contextHash = replayValueSha256(snapshot.context)
  check(snapshot.context_sha256 === contextHash, 'selected_context_digest_mismatch')
  const context = normalizePublicStoryContext(snapshot.context)
  check(context, 'invalid_owner_story_context')
  check(clock(context.story.visible_at) <= observedMs, 'snapshot_observed_before_selected_version_visible')
  const observedNs = BigInt(observedMs) * 1000000n
  check(context.material_changes.every(change => inspectionInstantNanoseconds(change.declared_at) <= observedNs), 'future_material_declaration_in_snapshot')
  check(Array.isArray(snapshot.source_receipts) && Array.isArray(snapshot.review_receipts), 'missing_source_or_review_receipts')
  const sources = new Map()
  for (const receipt of snapshot.source_receipts) {
    check(text(receipt.public_version_id) && !sources.has(receipt.public_version_id) && text(receipt.rights_ref) && text(receipt.capture_binding_ref), 'invalid_or_duplicate_capture_receipt')
    retainedBytes(receipt)
    sources.set(receipt.public_version_id, receipt)
  }
  const requiredReviews = new Set([context.story.review_ref, ...context.material_changes.flatMap(change => change.review_refs)])
  for (const member of [...context.evidence_versions, ...context.story.members]) {
    check(inspectionInstantNanoseconds(member.visible_at) <= observedNs, 'future_evidence_review_in_snapshot')
    requiredReviews.add(member.review_ref)
    const receipt = sources.get(member.public_version_id)
    check(receipt && receipt.source_id === member.article_id && receipt.capture_id === member.capture_id
      && receipt.owner_capture_hash === member.capture_hash && receipt.source_url === member.source_url
      && receipt.published_at === member.published_at && receipt.captured_at === member.captured_at, 'capture_receipt_identity_or_clock_mismatch')
  }
  const boundReviews = new Set()
  const reviewAuthorities = new Set()
  for (const receipt of snapshot.review_receipts) {
    check(text(receipt.review_ref) && !boundReviews.has(receipt.review_ref), 'duplicate_or_invalid_review_receipt')
    const binding = JSON.parse(retainedBytes(receipt).toString('utf8'))
    check(binding.review_ref === receipt.review_ref && binding.context_sha256 === contextHash
      && binding.story_id === context.story.story_id && binding.public_version_id === context.story.public_version_id, 'review_receipt_context_binding_mismatch')
    boundReviews.add(receipt.review_ref)
    reviewAuthorities.add(binding.authority)
  }
  check([...requiredReviews].every(ref => boundReviews.has(ref)), 'unbound_review_reference')
  return { context, contextHash, observedMs, reviewAuthorities: [...reviewAuthorities], source_digests: [...sources].map(([id, receipt]) => ({ public_version_id: id, sha256: receipt.sha256 })), review_digests: snapshot.review_receipts.map(receipt => ({ review_ref: receipt.review_ref, sha256: receipt.sha256 })) }
}
function validateCase(item) {
  check(text(item.id) && ['synthetic_regression', 'retained_real', 'retained_real_simulated_review'].includes(item.classification), 'case_requires_explicit_corpus_classification')
  check(Array.isArray(item.scenarios) && item.scenarios.length > 0 && item.scenarios.every(tag => REQUIRED_SCENARIOS.includes(tag)), 'invalid_scenario_tags')
  check(text(item.chronology_ref) && text(item.label_review_ref), 'missing_chronology_or_label_review_reference')
  if (item.classification === 'retained_real') check(item.label_provenance === 'independent_retained_review', 'real_case_requires_independent_retained_labels')
  else if (item.classification === 'retained_real_simulated_review') check(item.label_provenance === 'derived_benchmark_simulated_review', 'real_input_benchmark_requires_explicit_simulated_review')
  else check(item.label_provenance === 'synthetic_constraint', 'synthetic_case_requires_synthetic_labels')
  check(Array.isArray(item.snapshots) && item.snapshots.length > 0 && Array.isArray(item.intervals) && item.intervals.length > 0, 'missing_replay_snapshots_or_label_intervals')
  const snapshots = item.snapshots.map(validateSnapshot)
  check(snapshots.every(snapshot => snapshot.reviewAuthorities.every(authority => authority === (item.classification === 'retained_real' ? 'RETAINED_OWNER_REVIEW_RECORD' : 'SIMULATED_TEST_AUTHORITY_ONLY'))), 'review_authority_classification_mismatch')
  check(snapshots.every((snapshot, index) => !index || snapshot.observedMs > snapshots[index - 1].observedMs), 'snapshots_must_be_strictly_chronological')
  check(new Set(snapshots.map(snapshot => snapshot.context.story.story_id)).size === 1, 'foreign_story_snapshot')
  const intervals = item.intervals.map(interval => {
    const from = clock(interval.from), to = clock(interval.to)
    check(from < to && text(interval.review_ref) && Array.isArray(interval.allowed_states) && interval.allowed_states.length > 0 && interval.allowed_states.every(state => states.has(state)), 'invalid_truth_interval')
    check(Array.isArray(interval.allowed_report_labels) && interval.allowed_report_labels.length > 0 && interval.allowed_report_labels.every(label => reports.has(label)), 'invalid_report_truth_interval')
    check(interval.expected_material_change_id === null || text(interval.expected_material_change_id), 'missing_expected_material_binding')
    return { ...interval, from, to }
  })
  check(intervals.every((interval, index) => !index || interval.from === intervals[index - 1].to), 'truth_intervals_must_be_contiguous_nonoverlapping')
  check(snapshots[0].observedMs <= intervals[0].from, 'missing_point_in_time_snapshot')
  check(snapshots.at(-1).observedMs < intervals.at(-1).to, 'snapshot_outside_truth_window')
  return { ...item, snapshots, intervals }
}
function validatePolicy(policy) {
  check(text(policy.version) && text(policy.qualification), 'invalid_policy_identity')
  for (const name of ['breakingFreshMs', 'breakingMaxMs', 'rapidArrivalMs', 'velocityWindowMs', 'developingQuietMs', 'updatedQuietMs', 'minimumVelocityChanges']) check(Number.isSafeInteger(policy[name]) && policy[name] > 0, 'invalid_policy_duration_or_velocity')
}
const newMetrics = () => ({ observed_ms: 0, state_error_ms: 0, false_breaking_persistence_ms: 0, premature_breaking_decay_ms: 0, report_label_error_ms: 0, false_report_breaking_ms: 0, material_binding_error_ms: 0, correction_error_ms: 0 })
function replayCase(item, policy) {
  const from = item.intervals[0].from, to = item.intervals.at(-1).to
  const times = new Set([from, to, ...item.intervals.map(interval => interval.from), ...item.snapshots.map(snapshot => snapshot.observedMs).filter(time => time >= from && time < to)])
  const rows = [], metrics = newMetrics()
  let cursor = from
  while (cursor < to) {
    const snapshot = item.snapshots.findLast(candidate => candidate.observedMs <= cursor)
    const interval = item.intervals.find(candidate => candidate.from <= cursor && cursor < candidate.to)
    const decision = evaluateNewsStoryState(snapshot.context, cursor, policy)
    const sourceReports = newsSourceReports(snapshot.context, cursor, policy)
    const state = decision.available ? decision.state : 'UNAVAILABLE'
    const labels = sourceReports.length ? sourceReports.map(report => report.label) : ['NONE']
    const materialId = decision.material_change_id ?? sourceReports.at(-1)?.material_change_id ?? null
    for (const next of [decision.next_evaluation_at, ...sourceReports.map(report => report.next_evaluation_at)]) {
      if (next) { const time = clock(next); if (time > cursor && time < to) times.add(time) }
    }
    const end = Math.min(...[...times].filter(time => time > cursor)), duration = end - cursor
    const stateError = !interval.allowed_states.includes(state)
    const reportError = labels.some(label => !interval.allowed_report_labels.includes(label))
    const materialError = materialId !== interval.expected_material_change_id
    metrics.observed_ms += duration
    if (stateError) metrics.state_error_ms += duration
    if (state === 'Breaking' && stateError) metrics.false_breaking_persistence_ms += duration
    if (state !== 'Breaking' && interval.allowed_states.length === 1 && interval.allowed_states[0] === 'Breaking') metrics.premature_breaking_decay_ms += duration
    if (reportError) metrics.report_label_error_ms += duration
    if (labels.includes('BREAKING • SOURCE REPORT') && reportError) metrics.false_report_breaking_ms += duration
    if (materialError) metrics.material_binding_error_ms += duration
    if (item.scenarios.some(tag => ['correction', 'retraction', 'contradiction'].includes(tag)) && (stateError || reportError)) metrics.correction_error_ms += duration
    rows.push({ from: new Date(cursor).toISOString(), to: new Date(end).toISOString(), state, report_labels: labels,
      story_id: snapshot.context.story.story_id, public_version_id: snapshot.context.story.public_version_id,
      material_change_id: materialId, material_public_version_id: decision.material_public_version_id ?? null,
      effective_at: decision.effective_at ?? null, declared_at: decision.declared_at ?? null,
      reason_code: decision.reason_code, evidence_refs: decision.evidence_refs ?? [], review_refs: decision.review_refs ?? [],
      source_reports: sourceReports.map(report => ({ public_version_id: report.public_version_id, source_id: report.source_id,
        source_version_id: report.source_version_id, capture_hash: report.capture_hash, report_time: report.report_time,
        material_change_id: report.material_change_id, material_public_version_id: report.material_public_version_id,
        effective_at: report.effective_at, declared_at: report.declared_at, evidence_refs: report.evidence_refs,
        review_refs: report.review_refs, reason_code: report.reason_code, policy_version: report.policy_version,
        material_policy_version: report.material_policy_version, assertion_scope: report.assertion_scope })),
      policy_version: policy.version, context_sha256: snapshot.contextHash, snapshot_observed_at: new Date(snapshot.observedMs).toISOString(),
      allowed_states: interval.allowed_states, allowed_report_labels: interval.allowed_report_labels, label_review_ref: interval.review_ref,
      state_passes: !stateError, report_passes: !reportError, material_binding_passes: !materialError })
    cursor = end
  }
  const transitions = rows.filter((row, index) => !index || ['state', 'report_labels', 'public_version_id', 'material_change_id', 'reason_code', 'source_reports'].some(key => JSON.stringify(row[key]) !== JSON.stringify(rows[index - 1][key])))
  return { id: item.id, classification: item.classification, scenarios: item.scenarios, chronology_ref: item.chronology_ref,
    label_review_ref: item.label_review_ref, metrics, transitions, intervals: rows,
    receipts: item.snapshots.map(snapshot => ({ observed_at: new Date(snapshot.observedMs).toISOString(), context_sha256: snapshot.contextHash, source_digests: snapshot.source_digests, review_digests: snapshot.review_digests })) }
}
export function replayRetainedNewsCorpus(corpus, policies = NEWS_STATE_CANDIDATES) {
  check(corpus?.contract === REPLAY_CONTRACT && Array.isArray(corpus.cases) && corpus.cases.length > 0, 'invalid_replay_corpus')
  const cases = corpus.cases.map(validateCase)
  check(new Set(cases.map(item => item.id)).size === cases.length, 'duplicate_replay_case_id')
  policies.forEach(validatePolicy)
  const real = cases.filter(item => item.classification === 'retained_real')
  const realTags = new Set(real.flatMap(item => item.scenarios))
  return { contract: REPLAY_CONTRACT, corpus_sha256: replayValueSha256(corpus), selected_policy_unchanged: NEWS_STATE_POLICY.version,
    threshold_selection_performed: false, thresholds_approved_for_live_use: false,
    authority_note: 'Hashes verify input integrity and explicit recorded bindings only. Caller classifications, rights references and reviewer labels do not establish source rights, publication authority, independent review or representative corpus coverage.',
    real_corpus: { supplied_cases: real.length, scenario_coverage: [...realTags].sort(), missing_scenarios: REQUIRED_SCENARIOS.filter(tag => !realTags.has(tag)), gate: real.length ? 'recorded_inputs_require_external_authenticity_rights_and_representativeness_review' : 'missing_real_retained_capture_review_and_label_chronology' },
    candidates: policies.map(policy => {
      const results = cases.map(item => replayCase(item, policy))
      const byClassification = Object.fromEntries(['retained_real', 'retained_real_simulated_review', 'synthetic_regression'].map(classification => {
        const totals = newMetrics()
        for (const result of results.filter(item => item.classification === classification)) for (const key of Object.keys(totals)) totals[key] += result.metrics[key]
        return [classification, totals]
      }))
      return { policy, metrics_by_classification: byClassification, cases: results }
    }) }
}

// Inventory only: publication metadata cannot supply event time, capture bytes,
// source rights, materiality declarations, or point-in-time reader snapshots.
export function auditRetainedNewsSourceIndex({ path, bytes }) {
  const data = JSON.parse(Buffer.from(bytes).toString('utf8'))
  const rows = data.items ?? data.articles
  check(Array.isArray(rows), 'unsupported_source_index')
  return { path, bytes: bytes.length, sha256: sha(bytes), records: rows.length,
    records_with_publication_metadata: rows.filter(row => text(row.published_at)).length,
    records_with_publisher_locator: rows.filter(row => text(row.publisher_url)).length,
    replay_eligible_cases: 0, qualification: 'retained_publication_metadata_only',
    absent_required_bindings: ['retained_exact_capture_bytes_and_owner_digest_binding', 'permitted_source_rights', 'reviewed_public_story_snapshot', 'material_change_evidence_and_review_bindings', 'event_effective_and_declaration_chronology', 'independent_label_intervals'] }
}
