// Package 1 item 1 — cross-view jump context reset (22_NOTE_DEEP_READINESS_REVIEW
// action 1: "Graph focus reset — clear stale relationship panel on focus
// change"; Deep Readiness Review: a jump to a different Arc's Graph focus must
// leave no endpoint, source, excerpt, or uncertainty from the prior
// relationship visible).
//
// Rule: a CROSS-VIEW jump replaces context — it is not in-surface navigation.
// The focus stack restarts at the jump target, and every transient panel from
// the prior context (docked relationship evidence, article panel, policy
// consequence view) is cleared. In-surface taps (node tap inside the Graph,
// crumb navigation) keep their existing stack/panel semantics and do NOT go
// through this seam.

// Transient UI state a jump must clear. App.jsx's resetJumpContext delegates
// to clearPrimaryGraphOverlays for these values, then resets the focus stack,
// so a future panel cannot silently leak across jumps.
//
// R4.75: JUMP_CLEARS is for explicit jump-to-new-object only. Ordinary nav
// tab switches (changeView) must not call resetJumpContext and must not
// clear Investigation Context. investigationContext is intentionally absent.
export const JUMP_CLEARS = [
  'edgeEvidence',
  'selected',
  'pinned',
  'policyNode',
  'edgeListOpen',
  'reviewStatusOpen',
  'topicsOpen',
]

// The focus stack after a jump: exactly one crumb rooted at the target.
// `extra` carries kind-specific payload (e.g. topic memberIds) without
// widening the crumb shape contract ({ kind, id, label, ... }).
export function jumpFocusStack(kind, id, label, extra = null) {
  return [{ kind, id, label, ...(extra ?? {}) }]
}
