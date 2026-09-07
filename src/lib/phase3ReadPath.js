// Phase 3 (02C) read path — internal closed beta only.
//
// Gate: pipeline_config.phase3_beta must be exactly true. When the flag is
// false (or unreadable) every fetch is skipped and the disabled view is
// returned — nothing leaks past a false flag, matching the 02B provenance_ui
// posture. phase3_public is NOT consulted here: public exposure is a separate
// owner-authorized gate (02C public-release gate) and this UI never enables it.
//
// Hard rules honored at the read seam (02C):
//   - no composite legal alignment score is computed or served;
//   - verdicts are served as documented claims of the deciding body;
//   - 'missing:' marker rows stay structurally distinct from populated rows;
//   - unverified social material is never merged into confirmed tracks.

/**
 * Pure seam. Decides the presentation class of an evidence row.
 * marker rows ('missing:' description, or the missing_evidence track) render
 * as confirmed-absence/absence-pending cards, never as evidence passages.
 */
export function classifyEvidenceRow(row) {
  const desc = (row?.description ?? '').trim()
  const isMarker = desc.toLowerCase().startsWith('missing:') || row?.track === 'missing_evidence'
  return {
    ...row,
    is_marker: isMarker,
    // Copy contract for the renderer (finding 4 fold-in):
    // reviewed marker  -> "a reviewer confirmed this is absent"
    // unreviewed marker -> absence asserted, not yet reviewer-confirmed
    marker_copy: !isMarker
      ? null
      : row?.review_status === 'reviewed' || row?.review_status === 'published'
        ? 'Reviewer confirmed this is absent — recorded absence, not failure or contradiction.'
        : 'Marked missing — absence not yet reviewer-confirmed.',
    is_unverified_social: row?.track === 'unverified_social',
  }
}

/** Pure seam: split a case's evidence rows into ordered, separated tracks. */
export function buildCaseView(caseRow, evidenceRows) {
  const trackOrder =
    caseRow?.case_status === 'verdict_reached'
      ? ['withheld_from_factfinder', 'supporting', 'contradicting', 'unauthenticated']
      : ['confirmed_reporting', 'disputed_claim', 'official_position', 'unverified_social', 'missing_evidence']
  const rows = (evidenceRows ?? []).map(classifyEvidenceRow)
  const tracks = trackOrder.map((track) => ({
    track,
    rows: rows.filter((r) => r.track === track),
  }))
  return {
    ...caseRow,
    tracks,
    // Mode 2 never carries a verdict block.
    verdict_block:
      caseRow?.case_status === 'verdict_reached'
        ? {
            verdict: caseRow.verdict_or_disposition,
            charge: caseRow.charge_or_issue,
            deciding_body: caseRow.deciding_body,
            appeal_status: caseRow.appeal_status,
            framed_as: 'Documented claim of the deciding body — not a system-asserted fact.',
          }
        : null,
  }
}

/** Pure seam: group policy track events into the two parallel tracks. */
export function buildPolicyView(policyRow, eventRows) {
  const events = (eventRows ?? [])
    .filter((e) => e.policy_id === policyRow?.id)
    .slice()
    .sort((a, b) => String(a.event_date ?? '').localeCompare(String(b.event_date ?? '')))
  return {
    ...policyRow,
    stated_objective: events.filter((e) => e.track === 'stated_objective'),
    actual_outcome: events.filter((e) => e.track === 'actual_outcome'),
  }
}

/** Flag read. Returns exactly-true only when the DB value is boolean true. */
export async function loadPhase3BetaFlag({ supabaseClient } = {}) {
  const supabase = supabaseClient === undefined ? (await import('./supabase.js')).supabase : supabaseClient
  if (!supabase) return false
  const { data, error } = await supabase
    .from('pipeline_config')
    .select('value')
    .eq('key', 'phase3_beta')
    .maybeSingle()
  if (error) return false
  return data?.value === true
}

/**
 * Beta view loader. Disabled flag -> { enabled: false } and no table reads.
 * Each section loads completely or reports unavailable. One failed section
 * does not suppress the other, and failed reads are not described as empty.
 */
export async function loadPhase3BetaView({ supabaseClient } = {}) {
  const enabled = await loadPhase3BetaFlag({ supabaseClient })
  if (!enabled) return { enabled: false, cases: [], policies: [] }
  const mod = await import('./supabase.js')
  const supabase = supabaseClient === undefined ? mod.supabase : supabaseClient
  const { keysetAll, resortRows } = mod

  let cases = []
  let policies = []
  let casesUnavailable = false
  let policiesUnavailable = false
  try {
    const [casesRes, evidenceRes] = await Promise.all([
      keysetAll(supabase, 'p3_legal_case', 'id, title, case_status, verdict_or_disposition, charge_or_issue, deciding_body, appeal_status, involves_minor_or_private_person, sealed_or_expunged, authentication_completeness, remaining_uncertainty, review_status, reviewed_by, reviewed_at, correction_notice, created_at'),
      keysetAll(supabase, 'p3_legal_case_evidence', 'id, case_id, track, description, source_id, source_url, source_passage, method_version, authentication_state, remaining_uncertainty, review_status, reviewed_by, reviewed_at, correction_notice, created_at'),
    ])
    if (!casesRes.error && !evidenceRes.error) {
      const evidence = resortRows(evidenceRes.data ?? [], 'created_at', { ascending: true, nullsFirst: false })
      cases = resortRows(casesRes.data ?? [], 'created_at', { ascending: true, nullsFirst: false }).map((c) =>
        buildCaseView(c, evidence.filter((e) => e.case_id === c.id)),
      )
    } else casesUnavailable = true
  } catch {
    casesUnavailable = true
    cases = []
  }
  try {
    const [polRes, evRes] = await Promise.all([
      keysetAll(supabase, 'p3_policy', 'id, name, jurisdiction, instrument_type, description, review_status, reviewed_by, reviewed_at, correction_notice, created_at, agency, source_locator'),
      keysetAll(supabase, 'p3_policy_track_event', 'id, policy_id, track, state, event_date, source_id, source_passage, source_locator, method_version, remaining_uncertainty, missing_evidence, review_status, reviewed_by, reviewed_at, correction_notice, created_at'),
    ])
    if (!polRes.error && !evRes.error) {
      policies = resortRows(polRes.data ?? [], 'created_at', { ascending: true, nullsFirst: false }).map((p) => buildPolicyView(p, evRes.data ?? []))
    } else policiesUnavailable = true
  } catch {
    policiesUnavailable = true
    policies = []
  }
  return { enabled: true, cases, policies, casesUnavailable, policiesUnavailable }
}
