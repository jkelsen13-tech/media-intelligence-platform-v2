// Track B Step 2 item 5 (2026-08-17) — docked relationship panel view model.
//
// Pure seam between the provenance read path (explanations table, behind the
// provenance_ui flag) and the docked RelationshipPanel. Every field the panel
// renders comes from buildRelationshipPanelView so the honest-empty-state
// rules live in exactly one place and are unit-testable without a browser.
//
// Locked corrections honored here (owner, 2026-08-17):
//   1. Evidence count never stands in for evidence strength — the panel never
//      shows a source COUNT as a quality signal; strength comes only from
//      recorded doc_strength / review state.
//   2. "Independent sources" must exclude syndicated/duplicated reporting —
//      source lineage is not tracked, so independence is ALWAYS labeled
//      "Unverified — lineage not yet tracked", never asserted.
//   3. Missing evidence is not contradicting evidence — contradicting_evidence
//      with an explicit 'missing' status renders as "not checked", never as
//      "no contradictions exist".

import { EDGE_TYPES, edgePlainLabel } from '../graph/theme.js'
import { reviewStatusBadge } from './explanationEligibility.js'

// Axis value tones: 'value' = real recorded data; 'unverified' = exists in
// principle but not verified for this edge; 'unavailable' = not recorded at
// all. The panel styles these distinctly so an empty state looks intentional.
export const AXIS_TONES = Object.freeze(['value', 'unverified', 'unavailable'])

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

// An archived-sources / contradicting-evidence / source-roles payload carries
// an explicit missing state (02B) — detect it so it is never read as data.
function isExplicitMissing(payload) {
  if (payload == null) return false
  if (Array.isArray(payload)) {
    return payload.some((e) => e && typeof e === 'object' && e.status === 'missing')
  }
  return typeof payload === 'object' && payload.status === 'missing'
}

// Humanize a machine token ('awaiting_review' -> 'awaiting review').
function humanize(token) {
  return String(token ?? '').replace(/_/g, ' ').trim()
}

// Legacy reliability remains an ordinal scale, but the UI must never make a
// reader infer whether a larger number is better. The stored convention is
// 1 = highest, so every rendered value carries an explicit plain-language tier.
function reliabilityLabel(value) {
  const tiers = {
    1: 'highest reliability',
    2: 'high reliability',
    3: 'moderate reliability',
    4: 'limited reliability',
  }
  return Number.isFinite(value) && tiers[value] ? `${value} of 4 — ${tiers[value]}` : null
}

/**
 * Build the full view model for the docked relationship panel.
 *
 * @param {object} args
 * @param {object} args.edge - graph edge (loadGraph shape: id/source/target/
 *   type/label/doc_strength/signal_source/claimed_by/reliability/...).
 * @param {object|null} args.explanation - current explanations row for
 *   assertion_id `edge:<edge.id>`, or null when none exists / flag off.
 * @param {Array} args.sources - resolved source records
 *   ({ kind: 'article'|'document', name, title, url, publishedAt } or
 *   { kind: 'unresolved', id } for ids that resolved nowhere).
 * @param {boolean} args.enabled - provenance_ui flag state; when false the
 *   panel withholds provenance entirely (02B posture).
 */
export function buildRelationshipPanelView({ edge, explanation = null, sources = [], enabled = false } = {}) {
  const typeMeta = EDGE_TYPES?.[edge?.type]
  const plain = edgePlainLabel(edge)

  // Item 4 meaning line, carried into the panel: the causal/sequence
  // distinction in words, never dependent on line style or color.
  const meaning =
    edge?.type === 'sequence'
      ? `${plain} — temporal order only, no causation claimed`
      : edge?.type === 'causal'
        ? `${plain} — a causation claim`
        : plain

  const view = {
    typeLabel: typeMeta?.label ?? edge?.type ?? '',
    meaning,
    plainPhrase: plain,
    rawLabel: hasText(edge?.label) ? String(edge.label) : null,
    provenanceEnabled: Boolean(enabled),
    hasExplanation: Boolean(explanation),
    reviewBadge: null,
    sources: [],
    grounding: null,
    axes: [],
    independence: 'Unverified — source lineage not yet tracked',
    falsificationCondition: null,
    correctionHistory: [],
    contradicting: null,
    extraction: [],
  }

  // --- Extraction detail (always available from the edge itself) ---------
  if (hasText(edge?.signal_source)) view.extraction.push({ label: 'Signal source', value: edge.signal_source })
  if (hasText(edge?.claimed_by)) view.extraction.push({ label: 'Claimed by', value: humanize(edge.claimed_by) })
  if (hasText(edge?.stance)) view.extraction.push({ label: 'Stance', value: edge.stance })
  if (hasText(edge?.disputed_by)) view.extraction.push({ label: 'Disputed by', value: edge.disputed_by })
  if (hasText(edge?.counterfactual_test)) {
    view.extraction.push({ label: 'Counterfactual test', value: edge.counterfactual_test })
  }

  if (!enabled) return view

  // --- Review status (from the explanation row when present) -------------
  view.reviewBadge = explanation
    ? reviewStatusBadge(explanation.review_status)
    : { label: 'No provenance recorded yet', tone: 'muted' }

  // --- Sources (named list; never a bare count as a quality signal) ------
  view.sources = (sources ?? []).map((s) => ({ ...s }))

  // --- Grounding excerpt (supporting passage) ----------------------------
  if (explanation && hasText(explanation.supporting_passage)) {
    view.grounding = { text: explanation.supporting_passage, recorded: true }
  } else {
    view.grounding = {
      text: explanation
        ? 'No grounding excerpt recorded for this relationship yet.'
        : 'No provenance recorded for this relationship yet — grounding not yet available.',
      recorded: false,
    }
  }

  // --- The six G2 axes ----------------------------------------------------
  const rel = Number(edge?.reliability)
  const axes = []

  // 1. Source reliability (R): legacy 1–4 scale carried on the edge. The
  // plain-language tier is required because the ordinal alone is ambiguous.
  const sourceReliability = reliabilityLabel(rel)
  axes.push({
    key: 'source_reliability',
    label: 'Source reliability',
    value: sourceReliability ?? 'Not yet available — no reliability recorded',
    tone: sourceReliability ? 'value' : 'unavailable',
  })

  // 2. Evidence strength (E): recorded doc_strength only — a source count
  //    is NEVER a strength signal (locked correction 1).
  axes.push({
    key: 'evidence_strength',
    label: 'Evidence strength',
    value: hasText(edge?.doc_strength)
      ? humanize(edge.doc_strength)
      : 'Not yet available — no documentation strength recorded',
    tone: hasText(edge?.doc_strength) ? 'value' : 'unavailable',
  })

  // 3. Authentication (A): archived source records only. Live rows carry an
  //    explicit 'missing' status — render that honestly.
  const archived = explanation?.archived_sources
  const authValue = !explanation
    ? 'Not yet available — no provenance recorded'
    : isExplicitMissing(archived) || archived == null
      ? 'Not archived — authentication not yet available'
      : 'Archived source record present'
  axes.push({
    key: 'authentication',
    label: 'Authentication',
    value: authValue,
    tone: authValue.startsWith('Archived') ? 'value' : 'unavailable',
  })

  // 4. Relationship type (RT): the graph's stored type is distinct from
  // edge-specific provenance. A missing explanation never erases or
  // contradicts the recorded visual relationship type.
  const recordedType = hasText(edge?.type) ? humanize(edge.type) : plain
  const provenanceType = hasText(explanation?.relationship_type)
    ? `Edge-specific provenance classification: ${humanize(explanation.relationship_type)} — recorded`
    : 'Edge-specific provenance classification: not yet recorded'
  axes.push({
    key: 'relationship_type',
    label: 'Relationship type',
    value: `Stored graph type: ${recordedType}; ${provenanceType}`,
    tone: hasText(edge?.type) || hasText(plain) ? 'value' : 'unavailable',
  })

  // 5. Review status (V): the mandated badge vocabulary.
  axes.push({
    key: 'review_status',
    label: 'Review status',
    value: view.reviewBadge.label,
    tone: explanation ? (view.reviewBadge.tone === 'human' ? 'value' : 'unverified') : 'unavailable',
  })

  // 6. Remaining uncertainty (U).
  axes.push({
    key: 'remaining_uncertainty',
    label: 'Remaining uncertainty',
    value: hasText(explanation?.remaining_uncertainty)
      ? explanation.remaining_uncertainty
      : explanation
        ? 'None recorded'
        : 'Not yet available — no provenance recorded',
    tone: explanation ? 'value' : 'unavailable',
  })

  view.axes = axes

  // --- Falsification condition / correction history / contradictions -----
  const fals = explanation?.falsification_condition
  if (hasText(fals) && !fals.trim().toLowerCase().startsWith('missing:')) {
    view.falsificationCondition = fals
  }
  if (Array.isArray(explanation?.correction_history) && explanation.correction_history.length > 0) {
    view.correctionHistory = explanation.correction_history
  }
  // Missing evidence is not contradicting evidence (locked correction 3):
  // an explicit 'missing' status means "not checked", never "none exist".
  const contra = explanation?.contradicting_evidence
  if (explanation) {
    view.contradicting = isExplicitMissing(contra) || contra == null
      ? 'Not checked — contradicting evidence not yet examined'
      : typeof contra === 'string'
        ? contra
        : 'Recorded — see provenance detail'
  }

  return view
}
