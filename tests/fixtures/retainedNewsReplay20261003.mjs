import { createHash } from 'node:crypto'
import { ownerNewsContext, time, fixtureUuid } from './newsStoryFixtures.mjs'
import { replayValueSha256, REPLAY_CONTRACT } from '../../scripts/retainedNewsReplay20261003.mjs'

const bytesReceipt = bytes => ({ retained_base64: Buffer.from(bytes).toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') })
export function bindReplaySnapshot(context, observed_at, sourceBytes = new Map(), rights_ref = 'synthetic-no-source-rights') {
  const context_sha256 = replayValueSha256(context)
  const sources = [...new Map([...context.evidence_versions, ...context.story.members].map(member => [member.public_version_id, member])).values()]
  const source_receipts = sources.map(member => ({ ...bytesReceipt(sourceBytes.get(member.public_version_id) ?? `Exact synthetic bytes for ${member.public_version_id}`),
    public_version_id: member.public_version_id, source_id: member.article_id, capture_id: member.capture_id,
    owner_capture_hash: member.capture_hash, source_url: member.source_url, published_at: member.published_at,
    captured_at: member.captured_at, rights_ref, capture_binding_ref: 'synthetic-explicit-capture-binding' }))
  const refs = new Set([context.story.review_ref, ...sources.map(member => member.review_ref), ...context.material_changes.flatMap(change => change.review_refs)])
  const review_receipts = [...refs].map(review_ref => ({ review_ref, ...bytesReceipt(JSON.stringify({
    review_ref, context_sha256, story_id: context.story.story_id, public_version_id: context.story.public_version_id,
    authority: 'SIMULATED_TEST_AUTHORITY_ONLY',
  })) }))
  return { observed_at, context, context_sha256, source_receipts, review_receipts }
}
function snapshot(specs, observedHour, { report = false, correctionNovelty = false, missingTime = false, syndicated = false, superseded = false } = {}) {
  const context = ownerNewsContext(specs, { report })
  if (correctionNovelty && specs.length > 1) context.material_changes.at(-1).novelty = 'correction'
  if (missingTime) { context.story.members[0].published_at = null; context.evidence_versions.at(-1).published_at = null }
  if (superseded) {
    context.story.members[0].is_current_source_version = false
    context.evidence_versions.at(-1).is_current_source_version = false
  }
  if (syndicated) {
    context.story.subject_type = 'graph_node'; context.story.subject_kind = 'event'; context.story.subject_id = fixtureUuid(999)
    context.material_changes.forEach(change => { change.subject_type = 'graph_node'; change.subject_id = fixtureUuid(999) })
    const member = { ...context.story.members[0], article_id: fixtureUuid(888), public_version_id: fixtureUuid(887), capture_id: fixtureUuid(886), source_version_id: fixtureUuid(886), source_outlet: 'Synthetic syndicated outlet' }
    member.evidence = member.evidence.map(evidence => ({ ...evidence, capture_id: member.capture_id }))
    context.story.members.push(member); context.evidence_versions.push(member)
  }
  return bindReplaySnapshot(context, time(observedHour))
}
function interval(from, to, allowed_states, expectedMaterial, allowed_report_labels = ['NONE']) {
  return { from: time(from), to: time(to), allowed_states, allowed_report_labels,
    expected_material_change_id: expectedMaterial === null ? null : fixtureUuid(600 + expectedMaterial), review_ref: 'synthetic-predeclared-constraint' }
}
function scenario(id, scenarios, snapshots, intervals) {
  return { id, classification: 'synthetic_regression', label_provenance: 'synthetic_constraint', scenarios,
    chronology_ref: 'synthetic-clock-specification', label_review_ref: 'synthetic-predeclared-constraint', snapshots, intervals }
}
export function retainedNewsRegressionCorpus() {
  const corrected = [{ at: 0 }, { at: 1, kind: 'update', reason: 'Synthetic reviewer records corrected evidence.' }]
  return { contract: REPLAY_CONTRACT, cases: [
    scenario('rapid-one-off', ['rapid', 'one_off'], [snapshot([{ at: 0 }], 0)], [interval(0, 2, ['Breaking'], 0), interval(2, 4, ['UpdatedEstablished'], 0)]),
    scenario('continuing-phase', ['rapid'], [snapshot(Array.from({ length: 10 }, (_, at) => ({ at })), 9)], [interval(9, 11, ['Developing'], 9)]),
    scenario('slow-material-arrival', ['slow', 'late_evidence'], [snapshot([{ at: 0, declaredAt: 8 }], 8)], [interval(8, 10, ['UpdatedEstablished'], 0)]),
    scenario('quiet-unresolved', ['quiet_unresolved'], [snapshot([{ at: 0, event_state: 'unresolved' }], 0)], [interval(80, 82, ['Historical'], 0)]),
    scenario('correction-novelty-update', ['correction'], [snapshot([{ at: 0 }], 0), snapshot(corrected, 1, { correctionNovelty: true })], [interval(0, 1, ['Breaking'], 0), interval(1, 3, ['UpdatedEstablished'], 1)]),
    scenario('attributed-retraction', ['retraction', 'correction'], [snapshot([{ at: 0 }], 0, { report: true }), snapshot(corrected, 1, { report: true, correctionNovelty: true })], [interval(0, 1, ['UNAVAILABLE'], 0, ['BREAKING • SOURCE REPORT']), interval(1, 3, ['UNAVAILABLE'], 1, ['SOURCE REPORT'])]),
    scenario('attributed-supersession', ['correction'], [snapshot([{ at: 0 }], 0, { report: true }), snapshot([{ at: 0 }], 1, { report: true, superseded: true })], [interval(0, 1, ['UNAVAILABLE'], 0, ['BREAKING • SOURCE REPORT']), interval(1, 3, ['UNAVAILABLE'], 0, ['SOURCE REPORT'])]),
    scenario('reviewed-contradiction', ['contradiction', 'correction'], [snapshot(corrected, 1, { correctionNovelty: true })], [interval(1, 3, ['UpdatedEstablished'], 1)]),
    scenario('stale-attributed-report', ['stale_source_report'], [snapshot([{ at: 100, reportAt: 0 }], 100, { report: true })], [interval(100, 103, ['UNAVAILABLE'], 0, ['SOURCE REPORT'])]),
    scenario('repeated-fetch-observation', ['repeated_fetch'], [snapshot([{ at: 0 }], 0), snapshot([{ at: 0 }], 1), snapshot([{ at: 0 }], 80)], [interval(0, 2, ['Breaking'], 0), interval(2, 72, ['UpdatedEstablished'], 0), interval(72, 82, ['Historical'], 0)]),
    scenario('syndicated-source-count', ['syndication'], [snapshot([{ at: 0, importance: 'material' }], 0, { syndicated: true })], [interval(0, 4, ['UpdatedEstablished'], 0)]),
    scenario('missing-report-time', ['missing_time'], [snapshot([{ at: 0 }], 0, { report: true, missingTime: true })], [interval(0, 3, ['UNAVAILABLE'], 0, ['SOURCE REPORT'])]),
    scenario('backdated-correction-notice', ['correction', 'late_evidence'], [snapshot([{ at: 0 }, { at: -100, declaredAt: 100, kind: 'update' }], 100, { correctionNovelty: true })], [interval(100, 172, ['UpdatedEstablished'], 1), interval(172, 175, ['Historical'], 1)]),
  ] }
}
