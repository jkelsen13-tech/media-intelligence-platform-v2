import { createHash } from 'node:crypto'
import { loadOfficialKevBenchmark } from '../../officialKevBenchmark20261003.mjs'
import { replayRetainedNewsCorpus, replayValueSha256, REPLAY_CONTRACT } from '../../retainedNewsReplay20261003.mjs'
import { bindReplaySnapshot } from '../../../tests/fixtures/retainedNewsReplay20261003.mjs'
import { fixtureUuid } from '../../../tests/fixtures/newsStoryFixtures.mjs'
import { NEWS_STATE_POLICY } from '../../../src/lib/newsStatePolicy.js'

export const SUPPLEMENT_CONTRACT = 'mip-retained-real-news-clock-replay-2026-10-04-v1'
const hour = 3600000
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const check = (condition, reason) => { if (!condition) throw new Error(reason) }
const iso = milliseconds => new Date(milliseconds).toISOString()
const simulatedReview = 'SIMULATED_TEST_AUTHORITY_ONLY'
const labelRef = 'simulated-source-only-clock-constraints-2026-10-04-v1'

// This sidecar refuses to promote repository metadata into authoritative event
// or report time. It qualifies this adapter, not arbitrary external corpora.
// The existing response normalizer and owner engine still make every decision.
export function validateSupplementalClockBindings(cases, retainedReceipt) {
  const records = new Map(retainedReceipt.records.map(record => [record.content_sha256, record]))
  for (const item of cases) {
    check(item.classification === 'retained_real_simulated_review'
      && item.label_provenance === 'derived_benchmark_simulated_review', 'supplement_requires_simulated_review_classification')
    check(item.provider_correction_designation === 'UNKNOWN_NOT_DESIGNATED_BY_PROVIDER', 'provider_correction_designation_not_established')
    for (const snapshot of item.snapshots) {
      check(snapshot.clock_bindings?.contract === SUPPLEMENT_CONTRACT
        && snapshot.clock_bindings.authority === simulatedReview, 'missing_explicit_simulated_clock_bindings')
      check(snapshot.clock_bindings.observed_at === snapshot.observed_at
        && snapshot.clock_bindings.simulated_fetch_observation_at === snapshot.observed_at
        && snapshot.clock_bindings.observation_mapping === 'simulated_replay_observation_at_or_after_actual_retention',
      'observation_clock_binding_mismatch')
      const bindings = snapshot.clock_bindings.sources
      const members = new Map([...snapshot.context.evidence_versions, ...snapshot.context.story.members].map(member => [member.public_version_id, member]))
      check(Array.isArray(bindings) && bindings.length === members.size
        && new Set(bindings.map(binding => binding.public_version_id)).size === members.size, 'incomplete_source_clock_bindings')
      for (const [id, member] of members) {
        const record = records.get(member.capture_hash)
        const source = snapshot.source_receipts.find(receipt => receipt.public_version_id === id)
        const binding = bindings.find(value => value.public_version_id === id)
        check(record && source && binding && member.admission_kind === 'source_report', 'source_not_exact_retained_report')
        const bytes = Buffer.from(source.retained_base64, 'base64')
        check(bytes.toString('base64') === source.retained_base64 && bytes.length === record.byte_length
          && sha(bytes) === record.content_sha256 && source.sha256 === record.content_sha256
          && source.owner_capture_hash === record.content_sha256, 'retained_source_capture_digest_binding_mismatch')
        check(member.source_url === record.source_url && binding.source_sha256 === record.content_sha256
          && binding.source_revision_id === record.id, 'retained_source_identity_binding_mismatch')
        check(binding.repository_committed_at === record.repository_committed_at_utc
          && binding.actual_retrieved_at === record.retrieved_at_utc
          && member.fetched_at === record.retrieved_at_utc && member.captured_at === record.retrieved_at_utc,
        'actual_repository_or_retention_clock_changed')
        check(binding.authoritative_event_time === null && binding.authoritative_report_time === null
          && binding.canonical_publication_available_at === null, 'authoritative_clock_not_established')
        check(['unknown', 'repository_committer_proxy_only'].includes(binding.published_at_mapping)
          && member.published_at === (binding.published_at_mapping === 'unknown' ? null : record.repository_committed_at_utc),
        'source_report_clock_promoted_or_changed')
      }
      check(snapshot.clock_bindings.material_changes.length === snapshot.context.material_changes.length,
        'incomplete_material_clock_bindings')
      for (const change of snapshot.context.material_changes) {
        const binding = snapshot.clock_bindings.material_changes.find(value => value.material_change_id === change.material_change_id)
        check(binding && binding.effective_at === change.effective_at && binding.declared_at === change.declared_at
          && ['repository_committer_proxy_only', 'simulated_material_effective_time'].includes(binding.effective_at_mapping)
          && binding.declared_at_mapping === 'simulated_owner_declaration_time', 'material_clock_binding_mismatch')
        if (binding.effective_at_mapping === 'repository_committer_proxy_only') {
          check(change.evidence_refs.every(id => bindings.find(source => source.public_version_id === id)?.repository_committed_at === change.effective_at),
            'repository_effective_proxy_mismatch')
        }
      }
    }
  }
  return true
}

export async function buildRetainedRealNewsClockReplay() {
  const original = await loadOfficialKevBenchmark()
  const template = original.corpus.cases[0].snapshots[0]
  const retained = original.receipt
  const start = Date.parse(retained.records[1].retrieved_at_utc)
  const at = offset => iso(start + offset * hour)
  const retainedBytes = new Map(template.source_receipts.map(receipt => [receipt.public_version_id, Buffer.from(receipt.retained_base64, 'base64')]))
  const revision = index => structuredClone(template.context.evidence_versions[index])
  const declaration = index => structuredClone(template.context.material_changes[index])
  const sourceRecord = member => retained.records.find(record => record.content_sha256 === member.capture_hash)

  function context({ firstOnly = false, hypotheticalRapid = false, missingReportTime = false, correction = false, supersededSelection = false, observedHour = 0 } = {}) {
    const result = structuredClone(template.context)
    if (firstOnly || supersededSelection) {
      const member = revision(0)
      if (firstOnly) { member.is_current_source_version = true; member.superseded_by_public_version_id = null }
      result.story.members = [member]
      result.evidence_versions = supersededSelection ? [member, revision(1)] : [member]
      result.material_changes = [declaration(0)]
      result.story.public_version_id = result.material_changes[0].public_version_id
      result.story.sequence = result.material_changes[0].sequence
      result.story.predecessor_public_version_id = result.material_changes[0].previous_public_version_id
    } else if (hypotheticalRapid) {
      result.story.members = [revision(1)]
      result.evidence_versions = [revision(1)]
      result.material_changes = [declaration(1)]
      Object.assign(result.material_changes[0], { effective_at: at(0), declared_at: at(0), importance: 'major',
        reason: 'SIMULATED rapid material declaration over retained bytes; neither source event time nor source report time is established.' })
    }
    result.material_changes.forEach((change, index) => {
      if (!hypotheticalRapid) change.declared_at = at(index ? observedHour : 0)
      change.review_refs = [result.story.review_ref]
    })
    if (missingReportTime) result.evidence_versions.forEach(member => { member.published_at = null })
    result.story.members = result.story.members.map(member => result.evidence_versions.find(value => value.public_version_id === member.public_version_id))
    if (correction) {
      const previous = result.material_changes.at(-1)
      result.material_changes.push({ ...previous, material_change_id: fixtureUuid(602), public_version_id: fixtureUuid(204),
        previous_public_version_id: previous.public_version_id, sequence: '4', effective_at: retained.records[1].repository_committed_at_utc,
        declared_at: at(observedHour), kind: 'update', novelty: 'correction',
        reason: 'SIMULATED owner correction notice over observed catalog revision. The provider did not designate this revision as a correction.' })
      Object.assign(result.story, { public_version_id: fixtureUuid(204), predecessor_public_version_id: previous.public_version_id, sequence: '4' })
    }
    Object.assign(result.story, { reviewed_at: at(observedHour), visible_at: at(observedHour) })
    return result
  }

  function snapshot(selected, observedHour, effectiveMapping = 'repository_committer_proxy_only') {
    const result = bindReplaySnapshot(selected, at(observedHour), retainedBytes, retained.rights.rights_url)
    result.source_receipts.forEach(receipt => { receipt.capture_binding_ref = `actual-repository-bytes:${retained.manifest_sha256}` })
    const members = new Map([...selected.evidence_versions, ...selected.story.members].map(member => [member.public_version_id, member]))
    result.clock_bindings = { contract: SUPPLEMENT_CONTRACT, authority: simulatedReview, observed_at: result.observed_at,
      observation_mapping: 'simulated_replay_observation_at_or_after_actual_retention',
      simulated_fetch_observation_at: result.observed_at,
      sources: [...members.values()].map(member => { const record = sourceRecord(member); return {
        public_version_id: member.public_version_id, source_revision_id: record.id, source_sha256: record.content_sha256,
        repository_committed_at: record.repository_committed_at_utc, actual_retrieved_at: record.retrieved_at_utc,
        authoritative_event_time: null, authoritative_report_time: null, canonical_publication_available_at: null,
        published_at_mapping: member.published_at === null ? 'unknown' : 'repository_committer_proxy_only',
      } }),
      material_changes: selected.material_changes.map(change => ({ material_change_id: change.material_change_id,
        effective_at: change.effective_at, declared_at: change.declared_at,
        effective_at_mapping: change.novelty === 'correction' ? 'repository_committer_proxy_only' : effectiveMapping,
        declared_at_mapping: 'simulated_owner_declaration_time',
      })) }
    return result
  }
  const interval = (from, to, expected) => ({ from: at(from), to: at(to), allowed_states: ['UNAVAILABLE'],
    allowed_report_labels: ['SOURCE REPORT'], expected_material_change_id: expected, review_ref: labelRef })
  const item = (id, scenarios, snapshots, intervals) => ({ id,
    classification: 'retained_real_simulated_review', label_provenance: 'derived_benchmark_simulated_review', scenarios,
    chronology_ref: `actual-retained-cisa-manifest:${retained.manifest_sha256}`, label_review_ref: labelRef,
    provider_correction_designation: 'UNKNOWN_NOT_DESIGNATED_BY_PROVIDER', snapshots, intervals })
  const firstId = declaration(0).material_change_id, latestId = declaration(1).material_change_id
  const before = context({ firstOnly: true }), after = context({ observedHour: 1 })
  const rapid = context({ hypotheticalRapid: true }), unknown = context({ hypotheticalRapid: true, missingReportTime: true })
  const corrected = context({ hypotheticalRapid: true, correction: true, observedHour: 1 })
  const cases = [
    item('cisa-retained-revision-as-of-isolation', ['late_evidence', 'repeated_fetch'],
      [snapshot(before, 0), snapshot(after, 1), snapshot(after, 2)], [interval(0, 1, firstId), interval(1, 80, latestId)]),
    item('cisa-stale-source-clock-simulated-material-decay', ['stale_source_report', 'repeated_fetch', 'quiet_unresolved'],
      [snapshot(rapid, 0, 'simulated_material_effective_time'), snapshot(rapid, 1, 'simulated_material_effective_time'),
        snapshot(rapid, 73, 'simulated_material_effective_time')], [interval(0, 75, latestId)]),
    item('cisa-unknown-report-clock-simulated-rapid-declaration', ['missing_time', 'repeated_fetch'],
      [snapshot(unknown, 0, 'simulated_material_effective_time'), snapshot(unknown, 1, 'simulated_material_effective_time')], [interval(0, 4, latestId)]),
    item('cisa-simulated-backdated-correction-notice-decay', ['correction', 'late_evidence'],
      [snapshot(rapid, 0, 'simulated_material_effective_time'), snapshot(corrected, 1, 'simulated_material_effective_time')],
      [interval(0, 1, latestId), interval(1, 75, fixtureUuid(602))]),
    item('cisa-superseded-selected-source-no-latest-fallback', ['late_evidence', 'correction'],
      [snapshot(context({ supersededSelection: true, observedHour: 1 }), 1)], [interval(1, 4, firstId)]),
  ]
  validateSupplementalClockBindings(cases, retained)
  return { original, corpus: { contract: REPLAY_CONTRACT, cases }, receipt: {
    contract: SUPPLEMENT_CONTRACT, authority: simulatedReview, actual_mip_admissions: 0,
    source_manifest_sha256: retained.manifest_sha256, actual_source_revisions: retained.records.length,
    actual_source_bytes: retained.source_bytes, original_benchmark_cases_unchanged: original.corpus.cases.length,
    original_benchmark_corpus_sha256: replayValueSha256(original.corpus), supplemental_cases: cases.length,
    observed_source_difference: retained.observed_source_difference,
    authoritative_event_or_report_clock_cases: 0, provider_designated_corrections: 0,
    numerical_policy_changed: false, numerical_calibration_performed: false,
    live_threshold_approval: false, representative_longitudinal_calibration_gate: 'OPEN',
    limitation: 'Actual source bytes and repository/retention clocks; simulated observation, owner review, material declarations, correction semantics and oracle labels. No authoritative event/report clock, provider correction designation, MIP admission or empirical threshold selection.',
  } }
}

export async function runRetainedRealNewsClockReplay() {
  const built = await buildRetainedRealNewsClockReplay()
  const original_replay = replayRetainedNewsCorpus(built.original.corpus, [NEWS_STATE_POLICY])
  const supplemental_replay = replayRetainedNewsCorpus(built.corpus, [NEWS_STATE_POLICY])
  return { receipt: built.receipt, clock_bindings: built.corpus.cases.map(item => ({ id: item.id,
    snapshots: item.snapshots.map(snapshot => ({ context_sha256: snapshot.context_sha256, ...snapshot.clock_bindings })) })),
  original_replay, supplemental_replay }
}
