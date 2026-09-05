// Arc membership is an internal admission-control model. A raw score never
// mutates articles.arc_id; approval remains an explicit release-policy action.
export const ARC_MEMBERSHIP_SCORER_RULE_VERSION = 'arc-v1-membership-2026-08-23.2'

const WEIGHTS = Object.freeze({
  entity: 0.23,
  canonical: 0.21,
  recent: 0.21,
  action: 0.14,
  continuity: 0.11,
  temporal: 0.07,
  source_diversity: 0.03,
})
const ACTIONS = new Set([
  'announce', 'appeal', 'approve', 'arrest', 'award', 'ban', 'charge', 'confirm',
  'cut', 'deal', 'election', 'extend', 'file', 'investigate', 'launch', 'negotiate',
  'order', 'pass', 'probe', 'prosecute', 'ruling', 'sanction', 'settle', 'sign',
  'sue', 'suspend', 'vote', 'withdraw',
])
const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with'])

function clamp(value) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) }
function textOf(row) { return `${row?.title ?? row?.label ?? ''}. ${row?.summary ?? row?.description ?? ''}`.toLowerCase() }
function tokens(value) {
  // Keep short geopolitical actors such as US and UK. The previous >2 filter
  // silently erased decisive continuity anchors from multi-outlet reporting.
  return new Set((String(value ?? '').toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? []).filter((token) => (token.length > 2 || token === 'us' || token === 'uk' || token === 'un') && !STOP.has(token)))
}
function jaccard(left, right) {
  const a = left instanceof Set ? left : tokens(left)
  const b = right instanceof Set ? right : tokens(right)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection++
  return intersection / new Set([...a, ...b]).size
}
function directionalContainment(left, right) {
  const a = left instanceof Set ? left : tokens(left)
  const b = right instanceof Set ? right : tokens(right)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection++
  return intersection / Math.min(a.size, b.size)
}
function titleOf(row) { return String(row?.title ?? row?.label ?? '').toLowerCase() }
function anchorCoherence(candidate, target) {
  // Title containment is deliberately privileged over summary-wide Jaccard:
  // decisive event framing must not be diluted by long article boilerplate.
  const titleContainment = directionalContainment(titleOf(candidate), titleOf(target))
  const titleJaccard = jaccard(titleOf(candidate), titleOf(target))
  const textContainment = directionalContainment(textOf(candidate), textOf(target))
  return clamp(Math.max(0.70 * titleContainment + 0.30 * titleJaccard, 0.55 * textContainment))
}
function actionSet(value) { return new Set([...tokens(value)].filter((token) => ACTIONS.has(token))) }
function actionAgreement(left, right) {
  const a = actionSet(left); const b = actionSet(right)
  if (!a.size && !b.size) return 0
  return jaccard(a, b)
}
function entityIds(value) {
  return new Set((value ?? []).map((entity) => typeof entity === 'string' ? entity : entity?.id ?? entity?.entity_id).filter(Boolean).map(String))
}
function entityOverlap(candidateEntities, arcEntities) {
  const candidate = entityIds(candidateEntities); const arc = entityIds(arcEntities)
  if (!candidate.size || !arc.size) return { score: 0, shared: 0, candidateCount: candidate.size, arcCount: arc.size }
  let shared = 0
  for (const id of candidate) if (arc.has(id)) shared++
  // Candidate containment is preferable here: an arc may grow large, while a
  // candidate legitimately names only one or two durable actors.
  return { score: shared / candidate.size, shared, candidateCount: candidate.size, arcCount: arc.size }
}
function dateMs(value) { const ms = new Date(value ?? '').getTime(); return Number.isFinite(ms) ? ms : null }
function temporalAgreement(candidate, members, arc) {
  const candidateMs = dateMs(candidate?.published_at ?? candidate?.occurred_at)
  const dates = (members ?? []).map((member) => dateMs(member?.published_at ?? member?.occurred_at)).filter((ms) => ms !== null)
  const arcMs = dateMs(arc?.last_update_at ?? arc?.started_at)
  const latest = dates.length ? Math.max(...dates) : arcMs
  if (candidateMs === null || latest === null) return { score: 0.35, gapDays: null }
  const gapDays = Math.abs(candidateMs - latest) / 86400000
  const score = gapDays <= 7 ? 1 : gapDays <= 21 ? 0.82 : gapDays <= 45 ? 0.58 : gapDays <= 90 ? 0.32 : 0.08
  return { score, gapDays }
}
function continuityEvidence(candidateText, arcText, temporal) {
  const candidate = String(candidateText).toLowerCase()
  const arc = String(arcText).toLowerCase()
  const explicit = /\b(after|following|amid|response|responds?|appeal|escalat\w*|settle\w*|indict\w*|charges?|ruling|investigat\w*|hearing|negotiat\w*|update|latest)\b/.test(candidate)
  const process = actionAgreement(candidate, arc)
  const score = explicit ? Math.max(0.65, process) : process
  return { score: clamp(score), explicit }
}
function isRecognitionDetour(value) {
  return /\b(wins?|won|receives?|received|honou?red|award(?:s)?|excellence award|lifetime achievement)\b/.test(String(value ?? '').toLowerCase())
}
function sourceDiversity(candidate, members) {
  const outlet = String(candidate?.outlet ?? '').trim().toLowerCase()
  if (!outlet) return 0
  const existing = new Set((members ?? []).map((member) => String(member?.outlet ?? '').trim().toLowerCase()).filter(Boolean))
  if (!existing.size) return 0.5
  return existing.has(outlet) ? 0.35 : 1
}
function memberCoherence(candidate, members) {
  if (!(members ?? []).length) return { score: 0, best: 0, average: 0 }
  const candidateText = textOf(candidate)
  const values = members.map((member) => {
    const memberText = textOf(member)
    const anchor = anchorCoherence(candidate, member)
    return Math.max(anchor, 0.55 * jaccard(candidateText, memberText) + 0.20 * directionalContainment(candidateText, memberText) + 0.25 * actionAgreement(candidateText, memberText))
  })
  const best = Math.max(...values)
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return { score: clamp(0.7 * best + 0.3 * average), best, average }
}

export function scoreArcMembership(candidate, arc, members = [], candidateEntities = [], arcEntities = [], releaseGate = {}) {
  const candidateText = textOf(candidate)
  const canonicalText = textOf(arc)
  const recent = [...members].sort((left, right) => String(right?.published_at ?? right?.occurred_at ?? '').localeCompare(String(left?.published_at ?? left?.occurred_at ?? ''))).slice(0, 5)
  const entity = entityOverlap(candidateEntities, arcEntities)
  const canonical = Math.max(anchorCoherence(candidate, arc), clamp(0.55 * jaccard(candidateText, canonicalText) + 0.20 * directionalContainment(candidateText, canonicalText) + 0.25 * actionAgreement(candidateText, canonicalText)))
  const recentCoherence = memberCoherence(candidate, recent)
  const action = Math.max(actionAgreement(candidateText, canonicalText), recentCoherence.best)
  const temporal = temporalAgreement(candidate, recent, arc)
  const continuity = continuityEvidence(candidateText, `${canonicalText}. ${recent.map(textOf).join(' ')}`, temporal)
  const diversity = sourceDiversity(candidate, recent)
  const signals = {
    entity: entity.score,
    canonical,
    recent: recentCoherence.score,
    action,
    continuity: continuity.score,
    temporal: temporal.score,
    source_diversity: diversity,
  }
  const hard_rejections = []
  const narrativeAnchor = Math.max(canonical, recentCoherence.score)
  // Missing entity extraction is a data-quality gap, not proof of irrelevance
  // when title/event framing and temporal adjacency independently corroborate.
  if ((!entity.candidateCount || !entity.arcCount) && !(narrativeAnchor >= 0.33 && temporal.score >= 0.82)) hard_rejections.push('insufficient_evidence')
  // A recognition/award story about a shared actor is a known contamination
  // pattern. Keep it blocked even when actor-name repetition inflates title
  // containment; true narrative continuations use the generic evidence path.
  if (entity.shared > 0 && isRecognitionDetour(candidateText) && narrativeAnchor < 0.55 && action < 0.20 && continuity.score < 0.20) {
    hard_rejections.push('actor_only_contamination')
  }
  if (entity.shared < 2 && narrativeAnchor < 0.35 && action < 0.25 && continuity.score < 0.20) {
    hard_rejections.push('generic_entity_no_continuity')
  }
  if (temporal.gapDays !== null && temporal.gapDays > 45 && continuity.score < 0.35 && Math.max(canonical, recentCoherence.score) < 0.45) {
    hard_rejections.push('stale_without_narrative_bridge')
  }
  if (narrativeAnchor < 0.18 && action < 0.18 && continuity.score < 0.20) hard_rejections.push('topic_action_contradiction')
  const raw = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + signals[key] * weight, 0)
  const confidence = hard_rejections.length ? 0 : clamp(raw)
  const eligible_for_auto_approval =
    hard_rejections.length === 0 &&
    !!releaseGate.fixture_passed &&
    !!releaseGate.auto_approval_enabled &&
    releaseGate.auto_approval_threshold !== null &&
    releaseGate.auto_approval_threshold !== undefined &&
    confidence >= Number(releaseGate.auto_approval_threshold)
  return {
    model_version: ARC_MEMBERSHIP_SCORER_RULE_VERSION,
    candidate_article_id: candidate?.id ?? null,
    arc_id: arc?.id ?? null,
    cluster_confidence: confidence,
    decision: hard_rejections.length ? 'rejected' : 'candidate',
    eligible_for_auto_approval,
    hard_rejections,
    signals,
    evidence: {
      shared_entity_count: entity.shared,
      candidate_entity_count: entity.candidateCount,
      arc_entity_count: entity.arcCount,
      temporal_gap_days: temporal.gapDays,
      explicit_continuity: continuity.explicit,
      recent_member_count: recent.length,
    },
    release_gate: {
      fixture_passed: !!releaseGate.fixture_passed,
      auto_approval_enabled: !!releaseGate.auto_approval_enabled,
      auto_approval_threshold: releaseGate.auto_approval_threshold ?? null,
    },
  }
}

function seededRandom(seed) {
  let state = 2166136261
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296 }
}
export function buildArcMembershipAuditSample(scores, { lowConfidence = 0.70, highSampleSize = 30, seed = `arc-audit:${ARC_MEMBERSHIP_SCORER_RULE_VERSION}` } = {}) {
  const low = scores.filter((score) => score.cluster_confidence < lowConfidence || score.hard_rejections.length > 0).map((score) => ({ ...score, audit_stratum: 'low_confidence_all' }))
  const high = scores.filter((score) => score.cluster_confidence >= lowConfidence && score.hard_rejections.length === 0)
  const random = seededRandom(seed)
  const highSample = [...high].sort(() => random() - 0.5).slice(0, highSampleSize).map((score) => ({ ...score, audit_stratum: 'high_confidence_random' }))
  return { seed, low_confidence_cutoff: lowConfidence, population: scores.length, sample: [...low, ...highSample] }
}
export function oneSidedWilsonUpper(errors, total, z = 1.6448536269514722) {
  if (!total) return null
  const p = errors / total; const z2 = z * z
  return (p + z2 / (2 * total) + z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / (1 + z2 / total)
}
export function proposeArcMembershipAutoApprovalThreshold(audits) {
  const bands = [[0.85, 1.000001, '0.85–1.00'], [0.70, 0.85, '0.70–0.84'], [0.50, 0.70, '0.50–0.69'], [0.30, 0.50, '0.30–0.49'], [0, 0.30, '0.00–0.29']]
  const candidates = bands.map(([min, max, band]) => {
    const rows = audits.filter((row) => row.cluster_confidence >= min && row.cluster_confidence < max)
    const incorrect = rows.filter((row) => row.audit_status === 'incorrect').length
    const undetermined = rows.filter((row) => row.audit_status === 'undetermined').length
    const errors = incorrect + undetermined
    const wilson = rows.length ? oneSidedWilsonUpper(errors, rows.length) : null
    return { band, min, sample_size: rows.length, correct: rows.length - errors, incorrect, undetermined, observed_error_rate: rows.length ? errors / rows.length : null, one_sided_wilson_upper_95: wilson, qualifies: rows.length >= 30 && errors === 0 && wilson !== null && wilson <= 0.10 }
  })
  const selected = candidates.find((candidate) => candidate.qualifies) ?? null
  return { threshold: selected?.min ?? null, auto_approval_enabled: false, candidates, rationale: selected ? 'Evidence supports a threshold but release remains explicitly disabled until policy enablement.' : 'No confidence band meets the 30-label, zero-error, and one-sided Wilson 10% eligibility rule.' }
}

export function regressionActorOnlyArcContaminationFixture() {
  const arc = { id: 'fixture-investigation-arc', title: 'Federal procurement fraud investigation into Acme Holdings', summary: 'Justice Department investigators examine alleged bid fraud by Acme Holdings.', started_at: '2026-01-02', last_update_at: '2026-01-10T12:00:00Z' }
  const members = [
    { id: 'fixture-member-1', title: 'Justice Department opens Acme procurement fraud investigation', summary: 'Federal investigators are examining alleged bid fraud involving Acme Holdings.', outlet: 'news-a', published_at: '2026-01-02T12:00:00Z' },
    { id: 'fixture-member-2', title: 'Prosecutors seek Acme contract records in procurement probe', summary: 'The Justice Department requested records as its bid fraud investigation continues.', outlet: 'news-b', published_at: '2026-01-10T12:00:00Z' },
  ]
  const candidate = { id: 'fixture-annual-award', title: 'Acme Holdings wins annual business excellence award', summary: 'Acme Holdings was recognized for its commercial performance at an annual industry awards ceremony.', outlet: 'news-c', published_at: '2026-01-12T12:00:00Z' }
  const candidateEntities = ['acme']
  const arcEntities = ['acme', 'justice-department', 'procurement']
  return { arc, members, candidate, candidateEntities, arcEntities }
}
export function regressionCoherentArcContinuationFixture() {
  const fixture = regressionActorOnlyArcContaminationFixture()
  return { ...fixture, candidate: { id: 'fixture-indictment', title: 'Acme executives indicted after federal procurement fraud investigation', summary: 'Justice Department prosecutors filed charges following the Acme bid fraud probe.', outlet: 'news-c', published_at: '2026-01-14T12:00:00Z' }, candidateEntities: ['acme', 'justice-department', 'procurement'] }
}
export function regressionLexicallyDilutedWarContinuationFixture() {
  const arc = { id: 'fixture-war-arc', title: 'US–Iran military escalation', summary: 'The United States and Iran exchange strikes as the regional conflict expands.', started_at: '2026-07-20', last_update_at: '2026-07-23T18:00:00Z' }
  const members = [
    { id: 'fixture-war-member-1', title: 'Iran war live: Trump weighs massive attack', summary: 'The US president considers a major attack as Iran rejects a deal.', outlet: 'news-a', published_at: '2026-07-23T17:00:00Z' },
    { id: 'fixture-war-member-2', title: 'US launches strikes as Iran warns of Gulf escalation', summary: 'Fighting continues across the region after another night of attacks.', outlet: 'news-b', published_at: '2026-07-23T19:00:00Z' },
  ]
  const candidate = { id: 'fixture-war-cost', title: 'US war on Iran: The $110 billion price tag', summary: 'America’s war on Iran has cost the US nearly $110 billion as the administration seeks new funding.', outlet: 'news-c', published_at: '2026-07-23T18:30:00Z' }
  return { arc, members, candidate, candidateEntities: ['iran'], arcEntities: ['iran', 'united-states'] }
}

export function runArcMembershipRegressionSuite() {
  const contamination = regressionActorOnlyArcContaminationFixture()
  const contaminationResult = scoreArcMembership(contamination.candidate, contamination.arc, contamination.members, contamination.candidateEntities, contamination.arcEntities)
  const coherent = regressionCoherentArcContinuationFixture()
  const coherentResult = scoreArcMembership(coherent.candidate, coherent.arc, coherent.members, coherent.candidateEntities, coherent.arcEntities)
  const diluted = regressionLexicallyDilutedWarContinuationFixture()
  const dilutedResult = scoreArcMembership(diluted.candidate, diluted.arc, diluted.members, diluted.candidateEntities, diluted.arcEntities)
  const fixtures = [
    { fixture: 'actor-only-annual-award-contamination', passed: contaminationResult.cluster_confidence === 0 && contaminationResult.hard_rejections.includes('actor_only_contamination'), result: contaminationResult },
    { fixture: 'coherent-investigation-continuation-control', passed: coherentResult.cluster_confidence >= 0.50 && coherentResult.hard_rejections.length === 0, result: coherentResult },
    { fixture: 'lexically-diluted-war-continuation', passed: dilutedResult.cluster_confidence >= 0.40 && dilutedResult.hard_rejections.length === 0, result: dilutedResult },
  ]
  return { passed: fixtures.every((fixture) => fixture.passed), fixtures }
}
