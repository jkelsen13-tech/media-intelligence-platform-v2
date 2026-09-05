// Graph page layout helpers. These keep the canvas the primary workspace
// without changing graph selection, filters, or relationship semantics.

export const GRAPH_CANVAS_MIN_PX = 360
export const GRAPH_CANVAS_MIN_SHORT_PX = 280
export const GRAPH_FIT_RESIZE_THRESHOLD_PX = 32
export const GRAPH_NARROW_CHROME_QUERY = '(max-width: 1180px)'
export const GRAPH_PHONE_QUERY = '(max-width: 767px)'

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
