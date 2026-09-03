// R4.75 Step 3 — Explore / Change Topic shell (DISPLAY / client only).
//
// Opening, browsing, and dismissing the overlay must not mutate
// Investigation Context. Explicit result select uses the Step 5
// commitNewSubject path via the News jump handlers in App.jsx. This
// helper is the contract seam for open / local-filter browse / dismiss —
// identity in, identity out.
//
// Canonical contract: MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1
// §5 / §16 Step 3.

export const EXPLORE_SHELL_CONTRACT = 'MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1'

/** Overlay actions that must leave Investigation Context untouched. */
export const EXPLORE_SHELL_NON_MUTATING_ACTIONS = Object.freeze([
  'open',
  'browseFilters',
  'dismiss',
])

/**
 * Explore overlay lifecycle that must not replace the subject.
 * Open, local News-filter browse, and dismiss return the same object.
 * Does not replace the subject or fire JUMP_CLEARS.
 */
export function preserveInvestigationThroughExplore(ic, action) {
  if (!EXPLORE_SHELL_NON_MUTATING_ACTIONS.includes(action)) return ic
  return ic
}
