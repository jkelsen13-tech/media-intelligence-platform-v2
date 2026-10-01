// Session-local display telemetry and a fail-closed admission seam. No analytics,
// persistence, account authority or provider billing inference lives here.
const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const STATES = new Set(['visible-active', 'visible-idle', 'hidden', 'disposed'])

export function evaluateWorldViewHighCostAccess({ admission, entitlement, budgets } = {}) {
  if (admission?.approved !== true) return { allowed: false, reason: 'source-not-admitted' }
  if (entitlement?.allowed !== true) return { allowed: false, reason: 'capability-not-granted' }
  if (entitlement.identityRequired === true && entitlement.identityPresent !== true)
    return { allowed: false, reason: 'identity-required' }
  // Values must come from authoritative account/concurrency/global/provider
  // checks. Browser-local counters cannot enforce cross-tab or global ceilings.
  for (const key of ['account', 'concurrency', 'global', 'provider']) {
    const budget = budgets?.[key]
    if (budget?.authoritative !== true || !finiteNonnegative(budget.remaining) || budget.remaining <= 0)
      return { allowed: false, reason: `${key}-budget-unavailable` }
  }
  return { allowed: true, reason: 'admitted-with-authoritative-allowance' }
}

export function createWorldViewUsage({ now = () => performance.now() } = {}) {
  let state = 'visible-idle', highCostActive = false, disposed = false
  let last = now(), visibleMs = 0, activeMs = 0, highFidelityMs = 0
  let explorationActions = 0, observedRequests = 0, observableBytes = 0, unknownByteRequests = 0
  const providers = new Map()
  const tick = () => {
    const next = now(), elapsed = Number.isFinite(next) && Number.isFinite(last) ? Math.max(0, next - last) : 0
    if (state.startsWith('visible-')) visibleMs += elapsed
    if (state === 'visible-active') activeMs += elapsed
    if (highCostActive && state === 'visible-active') highFidelityMs += elapsed
    last = Number.isFinite(next) ? next : last
  }
  return {
    transition(next) {
      if (disposed || !STATES.has(next)) return false
      tick(); state = next
      if (next === 'disposed') { disposed = true; highCostActive = false }
      return true
    },
    explore() { if (disposed || state === 'hidden') return false; tick(); explorationActions += 1; return true },
    setHighCostActive(value) { if (disposed) return false; tick(); highCostActive = value === true; return true },
    observeRequest({ provider = 'unknown', kind = 'resource', transferBytes = null, billableUnits = null, costUsd = null } = {}) {
      if (disposed) return false
      observedRequests += 1
      if (finiteNonnegative(transferBytes)) observableBytes += transferBytes
      else unknownByteRequests += 1
      const key = `${String(provider)}:${String(kind)}`
      const entry = providers.get(key) ?? { provider: String(provider), kind: String(kind), requests: 0,
        observableBillableUnits: 0, billableUnitObservations: 0, observableCostUsd: 0, costObservations: 0 }
      entry.requests += 1
      // Only provider-observed units/costs are accepted. Roots and sessions
      // remain request kinds, never an automatic mapping to billable events.
      if (finiteNonnegative(billableUnits)) { entry.observableBillableUnits += billableUnits; entry.billableUnitObservations += 1 }
      if (finiteNonnegative(costUsd)) { entry.observableCostUsd += costUsd; entry.costObservations += 1 }
      providers.set(key, entry)
      return true
    },
    snapshot() {
      tick()
      return { productSessions: 1, state, visibleMinutes: visibleMs / 60000, explorationMinutes: activeMs / 60000,
        highFidelityMinutes: highFidelityMs / 60000, highCostActive, explorationActions,
        observedRequests, observableBytes, unknownByteRequests,
        providers: [...providers.values()].map(entry => ({ ...entry,
          observableBillableUnits: entry.billableUnitObservations ? entry.observableBillableUnits : null,
          observableCostUsd: entry.costObservations ? entry.observableCostUsd : null })),
        externalAnalytics: false, authoritativeBudgetEnforcement: false }
    },
  }
}

export function worldViewResourceObservation(entry) {
  let url
  try { url = new URL(entry.name) } catch { return null }
  let provider, kind
  if (url.hostname === 'tile.openstreetmap.org') { provider = 'openstreetmap'; kind = 'imagery' }
  else if (url.hostname === 'tiles.openfreemap.org') { provider = 'openfreemap'; kind = 'cartography' }
  else if (url.hostname === 's3.amazonaws.com' && url.pathname.startsWith('/elevation-tiles-prod/terrarium/')) {
    provider = 'mapzen-aws'; kind = 'terrain'
  } else return null
  // Cross-origin timing commonly reports zero without Timing-Allow-Origin.
  // That is unavailable transfer accounting, not proof of a free/empty tile.
  return { provider, kind, transferBytes: entry.transferSize > 0 ? entry.transferSize : null }
}
