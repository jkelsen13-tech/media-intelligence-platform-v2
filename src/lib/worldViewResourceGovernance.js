import { evaluateWorldViewHighCostAccess, createWorldViewUsage } from './worldViewResourcePolicy.js'

export const WORLD_VIEW_COST_PREFERENCES = Object.freeze({ preferredMonthlyUsd: 100, hardMonthlyUsd: 200, excludes: 'Supabase', spendingAuthorization: false })
const nonnegative = x => typeof x === 'number' && Number.isFinite(x) && x >= 0
const positive = x => nonnegative(x) && x > 0

// This is an adapter policy, never an account ledger. An authoritative service
// must issue/atomically reserve cross-tab/account/global capacity before use.
export function createWorldViewResourceGovernance({ now = () => performance.now(), idleSuspendMs = 30000, idleDisposeMs = 300000, maxRequests = 2048, maxLocations = 2048, maxReceipts = 256 } = {}) {
  if (!positive(idleSuspendMs) || !positive(idleDisposeMs) || idleDisposeMs < idleSuspendMs) throw new TypeError('Invalid idle policy')
  if (![maxRequests,maxLocations,maxReceipts].every(x=>Number.isInteger(x)&&x>0)) throw new TypeError('Invalid retention bounds')
  const usage = createWorldViewUsage({ now })
  let authority = null, lifecycle = 'visible-idle', lastInteraction = now(), resource = 'fallback', resourceMs = 0, last = now()
  let disposed = false, interactions = 0, sessions = 0, unknownCostReceipts = 0, locationOverflow = false
  const usedAuthorityTokens = new Set()
  const pending = new Map(), consumed = new Map(), receipts = [], completed = new Set(), locations = new Set()
  const effects = []
  const clock = () => {
    const value = now()
    if (!nonnegative(value) || value < last) throw new TypeError('Clock must be monotonic')
    if (resource === 'active') resourceMs += value - last
    last = value
    return value
  }
  const totals = (includeConsumed = true) => [...pending.values(), ...(includeConsumed ? consumed.values() : [])].reduce((a, r) => ({ usd: a.usd + r.usd, units: a.units + r.units, slots: a.slots + r.slots }), { usd: 0, units: 0, slots: 0 })
  const suspend = reason => {
    if (resource === 'active') effects.push({ type: 'suspend', reason })
    resource = 'fallback'; usage.setHighCostActive(false)
  }
  const check = estimate => {
    if (disposed) return 'disposed'
    if (lifecycle !== 'visible-active') return 'not-visible-active'
    if (!authority || authority.expiresAt <= last) return 'authority-expired-or-unavailable'
    const gate = evaluateWorldViewHighCostAccess(authority)
    if (!gate.allowed) return gate.reason
    if (authority.spendingAuthorized !== true) return 'spending-not-authorized'
    if (!nonnegative(authority.monthlyExternalSpentUsd) || !nonnegative(authority.monthlyExternalReservedUsd)) return 'global-spend-unavailable'
    if (!nonnegative(estimate.usd) || !nonnegative(estimate.units) || !positive(estimate.slots)) return 'estimate-unavailable'
    const held = totals()
    if (authority.monthlyExternalSpentUsd + authority.monthlyExternalReservedUsd + held.usd + estimate.usd > WORLD_VIEW_COST_PREFERENCES.hardMonthlyUsd) return 'hard-monthly-cap'
    for (const [key, amount] of [['account', held.usd + estimate.usd], ['global', held.usd + estimate.usd], ['provider', held.units + estimate.units], ['concurrency', held.slots + estimate.slots]]) {
      if (amount > authority.budgets[key].remaining) return `${key}-allowance-exhausted`
    }
    return null
  }
  return {
    setAuthority(value) {
      clock(); if (disposed) return false
      // Copy primitives: caller mutation cannot expand an already issued grant.
      authority = value && nonnegative(value.expiresAt) ? { ...value, admission: { ...value.admission }, entitlement: { ...value.entitlement }, reconciledReservationIds: [...(value.reconciledReservationIds ?? [])], budgets: Object.fromEntries(Object.entries(value.budgets ?? {}).map(([k, v]) => [k, { ...v }])) } : null
      for (const id of authority?.reconciledReservationIds ?? []) consumed.delete(id)
      if (resource === 'active' && check({ usd: 0, units: 0, slots: 1 })) suspend('authority-revoked')
      return !disposed
    },
    openSession() { clock(); if (disposed) return false; sessions++; return true },
    interact({ locationKey = null } = {}) {
      clock(); if (disposed || lifecycle === 'hidden') return false
      interactions++; lastInteraction = last; lifecycle = 'visible-active'; usage.transition(lifecycle); usage.explore()
      if (typeof locationKey === 'string' && locationKey) { if(locations.has(locationKey)||locations.size<maxLocations) locations.add(locationKey);else locationOverflow=true }
      return true
    },
    transition(value) {
      clock(); if (disposed || !['visible-active', 'visible-idle', 'hidden'].includes(value)) return false
      lifecycle = value; usage.transition(value)
      if (value !== 'visible-active') suspend(value)
      return true
    },
    poll() {
      clock(); if (disposed) return this.snapshot()
      const idle = last - lastInteraction
      if (idle >= idleDisposeMs) {
        suspend('prolonged-idle'); disposed = true; lifecycle = 'disposed'; usage.transition('disposed')
        effects.push({ type: 'dispose', reason: 'prolonged-idle', cancelReservationIds: [...pending.keys()] })
      } else if (idle >= idleSuspendMs) { suspend('idle'); if (lifecycle !== 'hidden') { lifecycle = 'visible-idle'; usage.transition(lifecycle) } }
      else if (resource === 'active' && (!authority || authority.expiresAt <= last)) suspend('authority-expired')
      return this.snapshot()
    },
    reserveRequest({ id, estimateUsd, quotaUnits = 0, concurrencySlots = 1, authorityReservationId } = {}) {
      clock()
      if (typeof id !== 'string' || !id || pending.has(id) || completed.has(id)) return { allowed: false, reason: 'duplicate-or-invalid-request', fallback: 'cheap' }
      if (typeof authorityReservationId !== 'string' || !authorityReservationId) return { allowed: false, reason: 'atomic-authority-reservation-required', fallback: 'cheap' }
      if (usedAuthorityTokens.has(authorityReservationId)) return { allowed: false, reason: 'authority-reservation-already-pending', fallback: 'cheap' }
      if (usedAuthorityTokens.size >= maxRequests) { suspend('session-request-capacity'); return { allowed:false, reason:'session-request-capacity',fallback:'cheap' } }
      const estimate = { usd: estimateUsd, units: quotaUnits, slots: concurrencySlots }
      const reason = check(estimate)
      if (reason) { suspend(reason); return { allowed: false, reason, fallback: 'cheap' } }
      usedAuthorityTokens.add(authorityReservationId)
      pending.set(id, { ...estimate, authorityReservationId })
      resource = 'active'; usage.setHighCostActive(true)
      effects.push({ type: 'admit-request', id, authorityReservationId })
      return { allowed: true, reason: 'reserved', preferredBudgetExceeded: authority.monthlyExternalSpentUsd + authority.monthlyExternalReservedUsd + totals().usd > WORLD_VIEW_COST_PREFERENCES.preferredMonthlyUsd }
    },
    settleRequest({ id, provider, kind, transferBytes = null, billableUnits = null, costUsd = null } = {}) {
      clock(); const reservation = pending.get(id)
      if (!reservation || completed.has(id)) return false
      pending.delete(id); completed.add(id)
      consumed.set(reservation.authorityReservationId, { usd: Math.max(reservation.usd, nonnegative(costUsd) ? costUsd : 0), units: Math.max(reservation.units, nonnegative(billableUnits) ? billableUnits : 0), slots: 0 })
      receipts.push({ id, provider, kind, transferBytes: nonnegative(transferBytes) ? transferBytes : null, billableUnits: nonnegative(billableUnits) ? billableUnits : null, costUsd: nonnegative(costUsd) ? costUsd : null })
      if(receipts.length>maxReceipts) receipts.shift()
      // Late real provider receipts remain billable observations even disposed.
      if (!nonnegative(costUsd)) unknownCostReceipts++
      effects.push({ type: 'release-reservation', id, authorityReservationId: reservation.authorityReservationId, observedCostUsd: nonnegative(costUsd) ? costUsd : null, overEstimate: nonnegative(costUsd) && costUsd > reservation.usd })
      if (!disposed) usage.observeRequest({ provider, kind, transferBytes, billableUnits, costUsd })
      return true
    },
    cancelRequest(id) {
      clock(); const reservation = pending.get(id); if (!reservation) return false
      pending.delete(id); completed.add(id); effects.push({ type: 'release-reservation', id, authorityReservationId: reservation.authorityReservationId, canceled: true }); return true
    },
    drainEffects() { return effects.splice(0).map(e => ({ ...e, ...(e.cancelReservationIds ? { cancelReservationIds: [...e.cancelReservationIds] } : {}) })) },
    snapshot() {
      clock(); const observation = usage.snapshot()
      return { ...observation, productSessions: sessions, interactions, distinctLocations: locationOverflow ? null : locations.size, retainedDistinctLocations: locations.size, lifecycle, resource, resourceMs, pending: totals(false), unreconciledUsage: [...consumed.values()].map(v=>({...v})), providerReceipts: receipts.map(v=>({...v})), pendingRequests: pending.size, unknownCostReceipts, disposed, authoritativeBudgetEnforcement: false, fallback: 'cheap', costPreferences: WORLD_VIEW_COST_PREFERENCES }
    },
  }
}
