// Track B Step 3 item 1 — shared epistemic component model (pure seam).
//
// Implements the model layer for the addendum's "System conventions shared
// across all seven screens" (04_ADDENDUM_SIX_SCREEN_REFERENCE_SPEC):
//   - status badge system: icon + color + text, never color alone;
//   - type pills: locked seven-type vocabulary;
//   - evidence-state bar: three counts, never summed/averaged/ranked;
//   - guardrail 4: absence statements carry their own scope.
//
// This module is pure: no network, no flags, no DOM. React components in
// src/components/ render from these maps; unit tests pin the invariants here.

// --- Status badge states ---------------------------------------------------
// Locked display vocabulary (addendum, "Status badge system"). Three states,
// three redundant non-color channels: distinct icon, distinct border style
// (dashed is load-bearing on inferred — it must survive accent-color
// removal), distinct text label.
export const BADGE_STATES = Object.freeze({
  // A check confirms the bounded record and its recorded scope—not the full
  // underlying subject, outcome, or causal implication. The narrower label is
  // especially important for procedural and documentary timeline entries.
  confirmed: Object.freeze({ label: 'Documented record', icon: 'check', dashed: false, tone: 'confirmed' }),
  contested: Object.freeze({ label: 'Contested', icon: 'question', dashed: false, tone: 'contested' }),
  inferred: Object.freeze({ label: 'Inferred', icon: 'question', dashed: true, tone: 'inferred' }),
})

/**
 * Badge meta for a display state, or null for anything outside the locked
 * vocabulary. Null = render no badge at all (the ArcsView precedent: when no
 * real status can be derived, no indicator is shown — an unknown state must
 * never masquerade as one of the three).
 */
export function badgeState(state) {
  return BADGE_STATES[state] ?? null
}

// Live per-event confidence vocabulary (arc_events.confidence, see ArcsView
// CONFIDENCE_META) mapped onto the three display states. 'contested' is
// deliberately UNREACHABLE from confidence alone: a dispute is an explicit
// recorded signal (e.g. a disputed/corrected review status on the backing
// explanation), never something inferred from low or missing confidence.
const CONFIDENCE_TO_BADGE = Object.freeze({
  confirmed: 'confirmed',
  corroborated: 'confirmed',
  inferred: 'inferred',
})

/**
 * Map a stored confidence value to a badge state. Returns null for unknown
 * or absent values (=> no badge), and never returns 'contested'.
 */
export function confidenceToBadgeState(confidence) {
  return CONFIDENCE_TO_BADGE[confidence] ?? null
}

// --- Type pills ------------------------------------------------------------
// Locked vocabulary (addendum, "Category and type pills").
export const TYPE_PILLS = Object.freeze({
  legislation: 'Legislation',
  ruling: 'Ruling',
  incident: 'Incident',
  coverage: 'Coverage & review',
  policy: 'Policy',
  news: 'News',
  evidence: 'Evidence',
})

/**
 * Display label for a content type. Locked vocabulary renders its locked
 * label; anything else is humanized ('court_order' -> 'Court order') rather
 * than leaking raw machine vocabulary (the v15 edge-label precedent).
 * Returns null when nothing humanizable is present (=> render no pill).
 */
export function typePillLabel(type) {
  if (TYPE_PILLS[type]) return TYPE_PILLS[type]
  if (typeof type !== 'string') return null
  const humanized = type.replace(/[_-]+/g, ' ').trim()
  if (!humanized) return null
  return humanized.charAt(0).toUpperCase() + humanized.slice(1)
}

// --- Event type icons --------------------------------------------------------
// Circular type-icon vocabulary (addendum, Screen 5 timeline entry):
// scales = legislation, gavel = ruling, shield = incident, microphone =
// coverage & review. These icons are load-bearing type channels and must
// only be applied where the mapping is true. The live arc_events.category
// vocabulary (verified 2026-08-18: accountability / geopolitical /
// economic / legislative) only honestly intersects at legislation — every
// other live category returns null and the renderer shows a neutral
// circular marker rather than an icon that asserts a type the record
// does not have.
export const EVENT_TYPE_ICONS = Object.freeze({
  legislation: 'scales',
  legislative: 'scales',
  ruling: 'gavel',
  incident: 'shield',
  coverage: 'mic',
})

/**
 * Icon key for an event type, or null when the type has no honest mapping
 * into the locked icon vocabulary (=> neutral marker, never a guess).
 */
export function eventTypeIcon(type) {
  if (typeof type !== 'string') return null
  return EVENT_TYPE_ICONS[type.trim().toLowerCase()] ?? null
}

// --- Evidence-state counts ---------------------------------------------------
// The evidence-state bar shows Supporting / Contested / Missing as three
// separate counts (Amendment A applied to this component: never summed,
// averaged, or ranked into one figure). This function is the only validation
// gate; it returns exactly the three counts and nothing else.

function isCount(value) {
  return Number.isInteger(value) && value >= 0
}

/**
 * Validate and normalize evidence-state counts. Throws on any value that is
 * not a non-negative integer — a malformed count is a data bug and must not
 * render as a plausible-looking zero. The returned object has exactly three
 * keys; there is intentionally no aggregate.
 */
export function validateEvidenceCounts(counts) {
  const { supporting, contested, missing } = counts ?? {}
  for (const [key, value] of Object.entries({ supporting, contested, missing })) {
    if (!isCount(value)) {
      throw new Error(`evidence-state count "${key}" must be a non-negative integer`)
    }
  }
  return Object.freeze({ supporting, contested, missing })
}

/**
 * Guardrail 4 (20_IDEA, applied by the addendum to this component): a
 * "Missing / not yet reported" count is an absence finding and must display
 * its own scope (monitored corpus, period, sources checked, last-check
 * date). True when a scope string is required — i.e. whenever missing > 0.
 */
export function missingScopeRequired(missing) {
  return isCount(missing) && missing > 0
}

/** The explicit fallback a renderer must show when scope is required but absent. */
export const MISSING_SCOPE_FALLBACK = 'Scope of “not yet reported” not recorded'

// --- Trust footer ------------------------------------------------------------
/**
 * Display text for the trust footer's review line, or null when no review
 * date exists. Null = the footer omits the line entirely rather than
 * fabricating a review date (explicit-missing-state precedent from 02B).
 */
export function reviewedLine(reviewedAt) {
  if (typeof reviewedAt !== 'string' || !reviewedAt.trim()) return null
  return `Reviewed ${reviewedAt.trim()}`
}
