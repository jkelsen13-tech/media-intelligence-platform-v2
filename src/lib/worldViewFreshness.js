// R4 World View launch spine — live / delayed / reconstructed / unavailable.
//
// Spec §8 J. These labels describe DISPLAY state. They do not invent a live
// sensor feed. The n=1 Cleveland row is a recorded projection (reconstructed),
// not a live OSINT ping.

export const FRESHNESS_STATES = Object.freeze(['live', 'delayed', 'reconstructed', 'unavailable'])

export function spatialFreshnessLabel(row, { plot } = {}) {
  if (!row) return 'unavailable'
  if (plot === false) return 'unavailable'
  return 'reconstructed'
}

export function weatherFreshnessLabel(weather) {
  if (!weather || weather.status !== 'ok') return 'unavailable'
  const kind = weather.provenance?.observationType
  if (kind === 'reanalysis') return 'delayed'
  if (kind === 'observed') return 'delayed'
  if (kind === 'forecast') return 'unavailable'
  return 'unavailable'
}

export function temporalFreshnessLabel(assessment) {
  if (!assessment) return 'unavailable'
  if (assessment.status !== 'ok') return 'unavailable'
  if (assessment.displayStatus === 'insufficient_history') return 'unavailable'
  return 'reconstructed'
}

export function freshnessCopy(state) {
  switch (state) {
    case 'live':
      return 'Live'
    case 'delayed':
      return 'Delayed'
    case 'reconstructed':
      return 'Reconstructed'
    default:
      return 'Unavailable'
  }
}
