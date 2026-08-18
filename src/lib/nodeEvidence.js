function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function humanize(value) {
  return String(value ?? '').replace(/_/g, ' ').trim()
}

function reliabilityLabel(value) {
  const tiers = {
    1: 'highest reliability',
    2: 'high reliability',
    3: 'moderate reliability',
    4: 'limited reliability',
  }
  return Number.isFinite(Number(value)) && tiers[Number(value)]
    ? `${Number(value)} of 4 — ${tiers[Number(value)]}`
    : null
}

/**
 * Build the compact, non-composite evidence summary for a graph node.
 * A node-level confidence number is deliberately ignored: MIP's locked G2
 * rule permits independent axes, not an aggregate score.
 */
export function buildNodeEvidenceAxes(node = {}) {
  const reliability = reliabilityLabel(node.reliability)
  const evidenceStrength = hasText(node.doc_strength) ? humanize(node.doc_strength) : null
  const authentication = node.authentication === true || node.authenticated === true
    ? 'Authenticated source record present'
    : null
  const reviewStatus = hasText(node.review_status) ? humanize(node.review_status) : null
  const uncertainty = hasText(node.remaining_uncertainty) ? node.remaining_uncertainty : null

  return [
    {
      key: 'evidence_strength',
      label: 'Evidence strength',
      value: evidenceStrength ?? 'Not yet recorded for this node',
      tone: evidenceStrength ? 'value' : 'unavailable',
    },
    {
      key: 'source_reliability',
      label: 'Source reliability',
      value: reliability ?? 'Not yet recorded for this node',
      tone: reliability ? 'value' : 'unavailable',
    },
    {
      key: 'authentication',
      label: 'Authentication',
      value: authentication ?? 'Not yet recorded for this node',
      tone: authentication ? 'value' : 'unavailable',
    },
    {
      key: 'review_status',
      label: 'Review status',
      value: reviewStatus ?? 'Not yet recorded for this node',
      tone: reviewStatus ? 'value' : 'unavailable',
    },
    {
      key: 'remaining_uncertainty',
      label: 'Remaining uncertainty',
      value: uncertainty ?? 'Not yet recorded for this node',
      tone: uncertainty ? 'value' : 'unavailable',
    },
  ]
}
