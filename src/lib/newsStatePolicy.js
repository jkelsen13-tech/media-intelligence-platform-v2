// Display policy only. Publication and material-change admission stay with the
// reviewed public-version and reviewer-declaration owners. See dated calibration.
const hour = 60 * 60 * 1000
export const NEWS_STATE_POLICY = Object.freeze({
  version: 'mip-news-state-2026-10-02-v1',
  qualification: 'synthetic_calibrated_candidate',
  breakingFreshMs: 2 * hour,
  breakingMaxMs: 6 * hour,
  rapidArrivalMs: 3 * hour,
  velocityWindowMs: 12 * hour,
  developingQuietMs: 24 * hour,
  updatedQuietMs: 72 * hour,
  minimumVelocityChanges: 2,
})

export const NEWS_STATE_CANDIDATES = Object.freeze([
  Object.freeze({ ...NEWS_STATE_POLICY, version: 'candidate-short', breakingFreshMs: hour / 2, breakingMaxMs: 2 * hour, rapidArrivalMs: hour, velocityWindowMs: 4 * hour, developingQuietMs: 8 * hour, updatedQuietMs: 24 * hour }),
  NEWS_STATE_POLICY,
  Object.freeze({ ...NEWS_STATE_POLICY, version: 'candidate-long', breakingFreshMs: 6 * hour, breakingMaxMs: 24 * hour, rapidArrivalMs: 12 * hour, velocityWindowMs: 24 * hour, developingQuietMs: 72 * hour, updatedQuietMs: 168 * hour }),
])

export const NEWS_STATE_LABELS = Object.freeze({
  Breaking: 'Breaking', Developing: 'Developing',
  UpdatedEstablished: 'Updated / Established', Historical: 'Historical',
})
