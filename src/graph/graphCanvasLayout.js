// Graph page layout helpers. These keep the canvas the primary workspace
// without changing graph selection, filters, or relationship semantics.

export const GRAPH_CANVAS_MIN_PX = 360
export const GRAPH_CANVAS_MIN_SHORT_PX = 280
export const GRAPH_FIT_RESIZE_THRESHOLD_PX = 32
export const GRAPH_NARROW_CHROME_QUERY = '(max-width: 1180px)'
export const GRAPH_PHONE_QUERY = '(max-width: 767px)'

// Overlay layers live inside `.graph-layout.inspector-overlay` (isolation).
// They must not share the phone sheet's global scrim (65) / sheet (70) scale:
// a drawer at 30 loses to a fixed scrim at 65 in the same root context.
export const GRAPH_OVERLAY_SCRIM_Z = 20
export const GRAPH_OVERLAY_DRAWER_Z = 30
export const GRAPH_SHEET_SCRIM_Z = 65
export const GRAPH_SHEET_DRAWER_Z = 70

export function formatCoverageMetric(value) {
  return Number.isInteger(value) && value >= 0 ? value.toLocaleString() : 'not recorded'
}

export function compactCoverageSummary(coverage, { shownNodeCount, totalNodeCount } = {}) {
  if (!coverage) return ''
  const parts = [
    `${formatCoverageMetric(coverage.articleCount)} articles`,
    `${formatCoverageMetric(coverage.articlesWithPublishedNode)} resolved`,
    `${formatCoverageMetric(coverage.pendingGraphCandidates)} pending review`,
    `${formatCoverageMetric(coverage.documentedRelationshipCount)} relationships`,
    `${formatCoverageMetric(coverage.articlesWithoutPublishedNode)} not node-linked`,
  ]
  if (
    Number.isInteger(shownNodeCount) &&
    Number.isInteger(totalNodeCount) &&
    shownNodeCount < totalNodeCount
  ) {
    parts.unshift(`${shownNodeCount} of ${totalNodeCount} published nodes shown`)
  } else if (Number.isInteger(totalNodeCount)) {
    parts.unshift(`${totalNodeCount} published nodes shown`)
  }
  return parts.join(' · ')
}

export function shouldRefitGraph(previousSize, nextSize, threshold = GRAPH_FIT_RESIZE_THRESHOLD_PX) {
  if (!previousSize || !nextSize) return false
  const width = Number(nextSize.width)
  const height = Number(nextSize.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false
  }
  return (
    Math.abs(width - Number(previousSize.width)) >= threshold ||
    Math.abs(height - Number(previousSize.height)) >= threshold
  )
}

export function graphInspectorPresentation({ selected, policyNode, edgeEvidence, isMobile, isNarrowChrome }) {
  const open = !!(selected || policyNode || edgeEvidence)
  if (!open) return 'hidden'
  if (isMobile) return 'sheet'
  if (isNarrowChrome) return 'drawer'
  return 'docked'
}

// Compare paint order using ancestor stacking contexts, then the element's
// own z-index. `ancestors` is root-most first. An empty list means the
// element competes in the shared root context.
export function layerPaintsAbove(front, back) {
  const frontPath = [...(front?.ancestors ?? []), front?.z]
  const backPath = [...(back?.ancestors ?? []), back?.z]
  const n = Math.max(frontPath.length, backPath.length)
  for (let i = 0; i < n; i++) {
    const a = Number(frontPath[i] ?? 0)
    const b = Number(backPath[i] ?? 0)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    if (a !== b) return a > b
  }
  return false
}

export function tabletOverlayLayers() {
  return {
    scrim: { z: GRAPH_OVERLAY_SCRIM_Z, ancestors: [] },
    drawer: { z: GRAPH_OVERLAY_DRAWER_Z, ancestors: [] },
  }
}

export function phoneSheetLayers() {
  return {
    scrim: { z: GRAPH_SHEET_SCRIM_Z, ancestors: [] },
    sheet: { z: GRAPH_SHEET_DRAWER_Z, ancestors: [] },
  }
}
