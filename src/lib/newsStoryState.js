import { inspectionInstantMilliseconds, inspectionInstantNanoseconds } from './inspectionTime.js'
import { NEWS_STATE_POLICY, NEWS_STATE_LABELS } from './newsStatePolicy.js'

const text = value => typeof value === 'string' && value.trim() ? value : null
const strings = value => Array.isArray(value) && value.length > 0 && value.every(v => text(v))
const instant = inspectionInstantMilliseconds
const nsDuration = milliseconds => BigInt(milliseconds) * 1000000n
const ceilInstant = value => { const ns = inspectionInstantNanoseconds(value); return ns === null ? null : Number(ns / 1000000n + (ns % 1000000n > 0n ? 1n : 0n)) }
const sequence = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && value.length <= 19 && BigInt(value) <= 9223372036854775807n
const kinds = new Set(['event_established', 'update', 'correction', 'resolution'])
const states = new Set(['active', 'resolved', 'unresolved'])
// The owner declares kind and novelty independently. Correction novelty keeps
// correction semantics even when the enclosing material-change kind is update.
const isCorrection = change => change.kind === 'correction' || change.novelty === 'correction'
const unavailable = reason => ({ available: false, state: null, label: 'Story state unavailable', reason_code: reason })

// The shared public context loader validates source bytes, spans, story identity
// and audience. This second boundary refuses absent declaration semantics; it
// does not manufacture materiality, evidence or public eligibility.
function qualifiedContextUnsafe(context, now) {
  const story = context?.story
  if (!story || story.contract !== 'mip-reviewed-public-story-v1'
    || story.review_state !== 'reviewed' || story.visibility_state !== 'public'
    || !text(story.story_id) || !text(story.public_version_id) || !text(story.subject_id)
    || !['article', 'graph_node'].includes(story.subject_type)
    || !sequence(story.sequence)
    || !text(story.review_ref) || !text(story.policy_version)
    || !Array.isArray(story.members) || !Array.isArray(context.material_changes)
    || context.coverage !== 'declared_material_changes_only'
    || !Number.isSafeInteger(now) || Math.abs(now) > 8640000000000000 || instant(story.visible_at) === null || inspectionInstantNanoseconds(story.visible_at) > nsDuration(now)) return null
  const members = new Map(story.members.map(member => [member.public_version_id, member]))
  const seen = new Set()
  const changes = []
  for (const change of context.material_changes) {
    if (!text(change.material_change_id) || seen.has(change.material_change_id)
      || change.story_id !== story.story_id || change.subject_id !== story.subject_id || change.subject_type !== story.subject_type
      || !text(change.public_version_id) || !sequence(change.sequence) || BigInt(change.sequence) > BigInt(story.sequence)
      || (change.sequence === story.sequence && change.public_version_id !== story.public_version_id)
      || change.materiality_owner !== 'reviewed_publication_owner' || !text(change.reason) || !text(change.policy_version) || !strings(change.evidence_refs) || !strings(change.review_refs)
      || !kinds.has(change.kind) || !states.has(change.event_state)
      || !['major', 'material'].includes(change.importance) || !['genuinely_new', 'correction'].includes(change.novelty)
      || (change.kind === 'correction' && change.novelty !== 'correction')
      || (change.kind === 'resolution' && change.event_state !== 'resolved')
      || instant(change.effective_at) === null || instant(change.declared_at) === null
      || inspectionInstantNanoseconds(change.effective_at) > inspectionInstantNanoseconds(change.declared_at)
      || inspectionInstantNanoseconds(change.declared_at) > nsDuration(now)) return null
    seen.add(change.material_change_id)
    // Evidence IDs may refer to historical source versions no longer members of
    // this selected story version. The owner supplies those in evidence_versions.
    const evidenceVersions = new Map([...(context.evidence_versions ?? []), ...story.members].map(member => [member.public_version_id, member]))
    const evidence = change.evidence_refs.map(id => evidenceVersions.get(id))
    if (evidence.some(member => !member || member.review_state !== 'reviewed' || member.visibility_state !== 'public' || typeof member.is_current_source_version !== 'boolean' || !(member.superseded_by_public_version_id === null || text(member.superseded_by_public_version_id)) || (member.is_current_source_version && member.superseded_by_public_version_id !== null))) return null
    changes.push({ ...change, evidence, effectiveMs: ceilInstant(change.effective_at), declaredMs: ceilInstant(change.declared_at), effectiveNs: inspectionInstantNanoseconds(change.effective_at), declaredNs: inspectionInstantNanoseconds(change.declared_at) })
  }
  changes.sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : a.material_change_id.localeCompare(b.material_change_id))
  if (changes.some((change, index) => index > 0 && change.sequence === changes[index - 1].sequence)) return null
  return { story, members, changes, truncated: context.has_more === true }
}

function qualifiedContext(context, now) {
  try { return qualifiedContextUnsafe(context, now) } catch { return null }
}

function decide(changes, now, policy, phaseChanges = changes) {
  const last = changes.at(-1)
  if (!last) return null
  const age = nsDuration(now) - last.effectiveNs
  // A quiet unresolved event decays too. Historical describes the registered
  // material-change phase, never resolution or complete collection coverage.
  // A newly declared backdated correction is still a current correction notice.
  // Its declaration clock does not make the underlying event newly Breaking.
  if (isCorrection(last)) return nsDuration(now) - last.declaredNs < nsDuration(policy.updatedQuietMs)
    ? { state: 'UpdatedEstablished', code: 'reviewed_correction' }
    : { state: 'Historical', code: 'material_change_phase_quiet' }
  if (age >= nsDuration(policy.updatedQuietMs)) return { state: 'Historical', code: 'material_change_phase_quiet' }
  if (last.event_state === 'resolved') return { state: 'UpdatedEstablished', code: 'event_resolved' }
  let phase = 0, latestEffective = phaseChanges[0].effectiveNs
  for (let i = 1; i < phaseChanges.length; i++) {
    // Sequence order is authoritative; a backdated declaration cannot create a
    // quiet gap by moving the preceding effective-time watermark backwards.
    if (!isCorrection(phaseChanges[i]) && phaseChanges[i].effectiveNs - latestEffective >= nsDuration(policy.updatedQuietMs)) phase = i
    if (phaseChanges[i].effectiveNs > latestEffective) latestEffective = phaseChanges[i].effectiveNs
  }
  const phaseAge = nsDuration(now) - phaseChanges[phase].effectiveNs
  const rapid = last.declaredNs - last.effectiveNs <= nsDuration(policy.rapidArrivalMs)
  if (last.importance === 'major' && last.novelty === 'genuinely_new' && rapid
    && age < nsDuration(policy.breakingFreshMs) && phaseAge < nsDuration(policy.breakingMaxMs)) {
    return { state: 'Breaking', code: 'new_major_material_change_arrived_rapidly' }
  }
  const velocity = changes.filter(change => nsDuration(now) - change.effectiveNs < nsDuration(policy.velocityWindowMs) && !isCorrection(change)).length
  if (age < nsDuration(policy.developingQuietMs) && velocity >= policy.minimumVelocityChanges) return { state: 'Developing', code: 'continuing_material_changes' }
  return { state: 'UpdatedEstablished', code: rapid ? 'established_material_update' : 'material_update_arrived_after_rapid_window' }
}

const evaluationBoundaries = (changes, policy) => changes.flatMap(change => [
  change.effectiveMs + policy.breakingFreshMs, change.effectiveMs + policy.breakingMaxMs,
  change.effectiveMs + policy.velocityWindowMs, change.effectiveMs + policy.developingQuietMs,
  change.effectiveMs + policy.updatedQuietMs, isCorrection(change) ? change.declaredMs + policy.updatedQuietMs : 0,
])

function evaluateQualified(qualified, now, policy, coverage) {
  const { story, changes } = qualified
  if (qualified.truncated) return unavailable('incomplete_material_change_history')
  // A permitted report envelope does not independently establish the event.
  const propositionChanges = changes.filter(change => change.evidence.every(member => member.admission_kind === 'reviewed_proposition'))
  if (changes.length && propositionChanges.at(-1)?.material_change_id !== changes.at(-1)?.material_change_id) return unavailable('latest_material_change_is_attributed_report_pending_verification')
  const decision = decide(propositionChanges, now, policy)
  if (!decision) return unavailable('no_declared_reviewed_proposition_material_change')
  const last = propositionChanges.at(-1)
  if (last.evidence.some(member => member.is_current_source_version !== true)) return unavailable('supporting_source_version_superseded')
  const boundaryTimes = evaluationBoundaries(propositionChanges, policy).filter(time => time > now)
  return {
    available: true, ...decision, label: NEWS_STATE_LABELS[decision.state],
    reason_code: decision.code, reason: last.reason, policy_version: policy.version,
    policy_qualification: policy.qualification, material_policy_version: last.policy_version,
    story_id: story.story_id, subject_type: story.subject_type, subject_id: story.subject_id,
    public_version_id: story.public_version_id, sequence: story.sequence,
    material_change_id: last.material_change_id, material_public_version_id: last.public_version_id, effective_at: last.effective_at,
    declared_at: last.declared_at, evidence_refs: [...last.evidence_refs], review_refs: [...last.review_refs],
    event_state: last.event_state, evaluated_at: new Date(now).toISOString(),
    next_evaluation_at: boundaryTimes.length ? new Date(Math.min(...boundaryTimes)).toISOString() : null,
    coverage,
    coverage_note: 'State uses declared material changes only; missing declarations and collection coverage remain unknown.',
  }
}

export function evaluateNewsStoryState(context, now, policy = NEWS_STATE_POLICY) {
  const qualified = qualifiedContext(context, now)
  if (!qualified) return unavailable('missing_or_invalid_admitted_story_context')
  return evaluateQualified(qualified, now, policy, context.coverage)
}

// Reconstructed decisions use the retained selected-version ancestry, not a
// browser cache or latest-head fallback. This is reproducible display history,
// not a claim that a historical user observed these decisions at those times.
export function reconstructNewsStateHistory(context, now, policy = NEWS_STATE_POLICY) {
  const qualified = qualifiedContext(context, now)
  if (!qualified || qualified.truncated) return []
  const times = new Set([now])
  for (const change of qualified.changes) {
    times.add(change.declaredMs)
    if (isCorrection(change) && change.declaredMs + policy.updatedQuietMs <= now) times.add(change.declaredMs + policy.updatedQuietMs)
    for (const duration of [policy.breakingFreshMs, policy.breakingMaxMs, policy.velocityWindowMs, policy.developingQuietMs, policy.updatedQuietMs]) {
      const time = change.effectiveMs + duration
      if (time <= now && time >= change.declaredMs) times.add(time)
    }
  }
  const history = []
  for (const time of [...times].sort((a, b) => a - b)) {
    const changes = qualified.changes.filter(change => change.declaredMs <= time)
    // Selected story/version stays fixed. Historical material-version IDs come
    // from retained declarations; no earlier public snapshot is synthesized.
    const decision = evaluateQualified({ ...qualified, changes }, time, policy, context.coverage)
    if (!decision.available) continue
    const previous = history.at(-1)
    if (!previous || previous.state !== decision.state || previous.material_change_id !== decision.material_change_id || previous.reason_code !== decision.reason_code) history.push(decision)
  }
  return history
}

export function newsSourceReports(context, now, policy = NEWS_STATE_POLICY) {
  const qualified = qualifiedContext(context, now)
  if (!qualified) return []
  return qualified.story.members.filter(member => member.admission_kind === 'source_report').flatMap(member => {
    const report = member.source_report
    if (!report || report.source_id !== member.article_id || report.source_version_id !== member.capture_id
      || report.capture_hash !== member.capture_hash || !text(report.review_uncertainty)
      || report.report_time !== member.published_at || (instant(report.report_time) !== null && inspectionInstantNanoseconds(report.report_time) > nsDuration(now))
      || report.article_original_fetched_at !== member.fetched_at || report.capture_retained_at !== member.captured_at
      || (report.fetch_time !== null && instant(report.fetch_time) === null)) return []
    const changes = qualified.changes.filter(change => change.evidence_refs.includes(member.public_version_id))
    const last = changes.at(-1)
    const decision = qualified.truncated || member.is_current_source_version !== true ? null : decide(changes, now, policy, qualified.changes)
    const reportNs = inspectionInstantNanoseconds(report.report_time)
    const breaking = decision?.state === 'Breaking' && reportNs !== null && nsDuration(now) - reportNs < nsDuration(policy.breakingFreshMs)
    const reasonCode = qualified.truncated ? 'incomplete_material_change_history'
      : member.is_current_source_version !== true ? 'supporting_source_version_superseded'
      : reportNs === null ? 'source_report_time_missing'
      : decision?.state === 'Breaking' && !breaking ? 'source_report_clock_stale'
      : decision?.code ?? 'no_declared_report_material_change'
    return [{
      public_version_id: member.public_version_id, source_id: report.source_id,
      source_version_id: report.source_version_id, capture_hash: report.capture_hash,
      source_outlet: member.source_outlet, source_url: member.source_url,
      title: member.title, summary: member.summary,
      label: breaking ? 'BREAKING • SOURCE REPORT' : 'SOURCE REPORT',
      verification_label: 'Pending MIP verification / reconciliation',
      review_uncertainty: report.review_uncertainty,
      report_time: report.report_time, fetch_time: report.fetch_time,
      article_original_fetched_at: report.article_original_fetched_at, capture_retained_at: report.capture_retained_at,
      review_ref: member.review_ref, reviewed_at: member.reviewed_at, pending_revision: member.pending_revision === true,
      is_current_source_version: member.is_current_source_version, superseded_by_public_version_id: member.superseded_by_public_version_id,
      correction_reason: member.correction_reason ?? null,
      predecessor_public_version_id: member.predecessor_public_version_id ?? null,
      material_change_id: last?.material_change_id ?? null,
      material_public_version_id: last?.public_version_id ?? null,
      effective_at: last?.effective_at ?? null, declared_at: last?.declared_at ?? null,
      evidence_refs: [...(last?.evidence_refs ?? [])], review_refs: [...(last?.review_refs ?? [])],
      reason_code: reasonCode, reason: last?.reason ?? null, material_policy_version: last?.policy_version ?? null,
      event_state: last?.event_state ?? null, evaluated_at: new Date(now).toISOString(),
      policy_version: policy.version,
      next_evaluation_at: [...evaluationBoundaries(qualified.changes, policy), reportNs === null ? 0 : ceilInstant(report.report_time) + policy.breakingFreshMs].filter(time => time > now).sort((a, b) => a - b).map(time => new Date(time).toISOString())[0] ?? null,
      qualification: policy.qualification,
      assertion_scope: 'attributed_source_report_only',
    }]
  })
}
