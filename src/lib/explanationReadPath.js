// Explanation read path — D4/D5 integration slice (owner-authorized 2026-07-29).
//
// Wires the verified eligibility predicate (src/lib/explanationEligibility.js) into
// the application's explanation reads. Per 02B migration rules, reads stay behind
// the provenance_ui feature flag: while the flag is false the read path is disabled
// and withholds everything. The flag remains false; enabling it is a separate owner
// authorization and is NOT done here.
//
// Two layers, deliberately separated:
//   buildExplanationReadView(rows, { enabled }) — pure, no I/O; the seam every
//     consumer (present and future) must use so the predicate is applied
//     consistently.
//   loadExplanationReadView(opts) — data access: flag check + fetch current
//     explanation rows + buildExplanationReadView.

import { partitionByEligibility } from './explanationEligibility.js'

// supabase.js is loaded lazily so this module's pure seam (buildExplanationReadView)
// stays importable in non-Vite contexts (tests, tooling) that lack import.meta.env
// and the data module chain.

/**
 * Apply the D4 layer 2 eligibility predicate to fetched explanation rows.
 *
 * @param {Array} rows - explanation rows (already limited to is_current = true).
 * @param {{ enabled: boolean }} options - provenance_ui flag state.
 * @returns {{ enabled: boolean, eligible: Array, excluded: Array }}
 *   When disabled, everything is withheld: no assertion leaks past a false flag.
 *   When enabled, eligible rows are presentation-eligible explanations and
 *   excluded entries are { explanation, failureState } pairs for the 02B
 *   failure-state renderers. Input rows are never mutated.
 */
export function buildExplanationReadView(rows, { enabled } = {}) {
  if (!enabled) return { enabled: false, eligible: [], excluded: [] }
  const { eligible, excluded } = partitionByEligibility(rows)
  return { enabled: true, eligible, excluded }
}

/**
 * Load the explanation read view for the given assertions.
 *
 * Reads pipeline_config.provenance_ui first; when the flag is not exactly true
 * the fetch is skipped entirely and the disabled view is returned (02B rollback
 * posture: disabling the flag restores legacy reads without touching recorded
 * provenance). Only current rows (is_current = true) are read — version history
 * is never served on the read path.
 *
 * @param {{ assertionId?: string, assertionType?: string, limit?: number }} opts
 */
export async function loadExplanationReadView({ assertionId, assertionType, limit = 200 } = {}) {
  const { supabase } = await import('./supabase.js')
  if (!supabase) return buildExplanationReadView([], { enabled: false })

  const { data: flagRow, error: flagError } = await supabase
    .from('pipeline_config')
    .select('value')
    .eq('key', 'provenance_ui')
    .maybeSingle()
  if (flagError || flagRow?.value !== true) {
    return buildExplanationReadView([], { enabled: false })
  }

  let query = supabase
    .from('explanations')
    .select(
      'id, assertion_id, assertion_type, version, is_current, source_ids, archived_sources, source_roles, supporting_passage, contradicting_evidence, missing_evidence, shared_entities, relationship_type, rule_version, provenance_class, created_at, recomputed_at, reviewed_at, review_status, falsification_condition, correction_history, remaining_uncertainty, state',
    )
    .eq('is_current', true)
    .order('assertion_id')
    .limit(limit)
  if (assertionId) query = query.eq('assertion_id', assertionId)
  if (assertionType) query = query.eq('assertion_type', assertionType)

  const { data, error } = await query
  // Private explanations are not an ordinary-user table. Permission
  // denial and other fetch failures fail closed, matching the flag-off
  // withhold posture, instead of treating a signed-in user as a reviewer.
  if (error) return buildExplanationReadView([], { enabled: false })
  return buildExplanationReadView(data ?? [], { enabled: true })
}
