// Navigation structure — single source of truth for the tab bar(s).
//
// Track B nav restructure (2026-08-16, owner-authorized): the bar is five
// entries — the four core views plus "More". The two flag-gated beta
// surfaces (Legal & Policy, Source Comparison) no longer occupy top-level
// tabs; they are listed inside the More sheet. Their view keys ('phase3',
// 'compare') and render blocks are unchanged, so every existing setView
// caller and cross-view jump (Doc 05 pairs) keeps working untouched.
//
// Withhold posture, per owner: when BOTH flags are off, "More" hides
// entirely — no grayed-out state, no visible trace. Each entry inside the
// sheet is additionally gated on its own flag (mirroring the previous
// double-gate: pipeline_config.phase3_beta / source_comparison_beta, where
// an unreadable flag resolves false upstream).

export const CORE_VIEWS = [
  { key: 'news', label: 'News Feed', shortLabel: 'News' },
  { key: 'graph', label: 'Knowledge Graph', shortLabel: 'Graph' },
  { key: 'timeline', label: 'Causal Timeline', shortLabel: 'Timeline' },
  { key: 'arcs', label: 'Arcs & Collections', shortLabel: 'Arcs' },
]

// 02C Phase 3 internal closed beta. Public release stays blocked per the
// 02C gate; the flag is beta-internal and never implies public exposure.
// "(Beta)" suffix dropped 2026-08-16 per owner: shipped, tested work.
export const PHASE3_VIEW = { key: 'phase3', label: 'Legal & Policy', shortLabel: 'Legal & Policy' }

// 03_BACKLOG Item 1 Source Comparison — CLOSED per 06C (2026-08-09).
// source_comparison_public stays false — no public exposure.
export const SOURCE_COMPARISON_VIEW = {
  key: 'compare',
  label: 'Source Comparison',
  shortLabel: 'Source Comparison',
}

export const MORE_VIEW = { key: 'more', label: 'More', shortLabel: 'More' }

// Tab bar contents. 'more' appears only while at least one gated surface
// is authorized.
export function buildNavViews({ phase3Beta = false, sourceComparisonBeta = false } = {}) {
  return [...CORE_VIEWS, ...(phase3Beta || sourceComparisonBeta ? [MORE_VIEW] : [])]
}

// More-sheet contents, in mockup order (Source Comparison, then Legal &
// Policy). Empty when both flags are off — in which case the More tab
// itself is not rendered either.
export function buildMoreEntries({ phase3Beta = false, sourceComparisonBeta = false } = {}) {
  return [
    ...(sourceComparisonBeta ? [SOURCE_COMPARISON_VIEW] : []),
    ...(phase3Beta ? [PHASE3_VIEW] : []),
  ]
}

// The More tab renders active while either of its member views is on
// screen, so the bar still shows where you are.
export function isMoreViewKey(key) {
  return key === 'phase3' || key === 'compare'
}
