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
  const usedAuthorityTokens = new Set(), reconciledTokens = new Set()
  const pending = new Map(), consumed = new Map(), receipts = new Map(), completed = new Set(), locations = new Set()
  const effects = []
  let observationUncertain = false
  const observed = { initialSettlements:0, bytes:0, units:0, usd:0, corrections:0 }
  const retain = record => {
    receipts.set(record.id, record)
    if(receipts.size>maxReceipts)receipts.delete(receipts.keys().next().value)
  }
  const charge = record => {
    const usd=Math.max(record.canceled?0:record.estimate.usd,record.costUsd??0), units=Math.max(record.canceled?0:record.estimate.units,record.billableUnits??0)
    const delta={usd:Math.max(0,usd-record.reconciled.usd),units:Math.max(0,units-record.reconciled.units),slots:0}
    if(delta.usd||delta.units)consumed.set(record.authorityReservationId,delta)
    else consumed.delete(record.authorityReservationId)
  }
  const receiptView = r => ({id:r.id,provider:r.provider,kind:r.kind,revision:r.revision,canceled:r.canceled,transferBytes:r.transferBytes,billableUnits:r.billableUnits,costUsd:r.costUsd})
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
    if (observationUncertain) return 'observation-identity-unavailable'
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
      for (const id of authority?.reconciledReservationIds ?? []) {
        if(!usedAuthorityTokens.has(id))continue
        const record=[...receipts.values()].find(r=>r.authorityReservationId===id)
        // ID-only authority cannot certify a later observation revision.
        // Keep excess held until a future verified revision protocol exists.
        // Missing finalized/evicted identity has no safely known baseline;
        // retain its consumption and leave pending acknowledgments unlatched.
        if(!record||reconciledTokens.has(id))continue
        reconciledTokens.add(id);record.reconciled={...record.originalBaseline};charge(record)
      }
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
      const record={id,provider,kind,revision:0,canceled:false,authorityReservationId:reservation.authorityReservationId,estimate:reservation,reconciled:{usd:0,units:0},transferBytes:nonnegative(transferBytes)?transferBytes:null,billableUnits:nonnegative(billableUnits)?billableUnits:null,costUsd:nonnegative(costUsd)?costUsd:null}
      record.originalBaseline={usd:Math.max(reservation.usd,record.costUsd??0),units:Math.max(reservation.units,record.billableUnits??0)}
      retain(record);charge(record);observed.initialSettlements++;observed.bytes+=record.transferBytes??0;observed.units+=record.billableUnits??0;observed.usd+=record.costUsd??0
      // Late values remain local observations after disposal, never billing proof.
      if (!nonnegative(costUsd)) {unknownCostReceipts++;record.unknownCost=true}
      effects.push({ type: 'release-reservation', id, authorityReservationId: reservation.authorityReservationId, observedCostUsd: nonnegative(costUsd) ? costUsd : null, overEstimate: nonnegative(costUsd) && costUsd > reservation.usd })
      if (!disposed) usage.observeRequest({ provider, kind, transferBytes, billableUnits, costUsd })
      return true
    },
    cancelRequest(id) {
      clock(); const reservation = pending.get(id); if (!reservation) return false
      pending.delete(id); completed.add(id);
      const record={id,provider:null,kind:null,revision:0,canceled:true,authorityReservationId:reservation.authorityReservationId,estimate:reservation,reconciled:{usd:0,units:0},transferBytes:null,billableUnits:null,costUsd:null,originalBaseline:{usd:0,units:0}};retain(record);charge(record)
      effects.push({ type: 'release-reservation', id, authorityReservationId: reservation.authorityReservationId, canceled: true }); return true
    },
    // Provider-independent observations only; callers own receipt verification.
    // Corrections never release again, grant authority or rewrite usage events.
    correctObservation({id,revision,transferBytes=null,billableUnits=null,costUsd=null}={}) {
      clock()
      if(typeof id!=='string'||!id||!Number.isSafeInteger(revision)||revision<0||[transferBytes,billableUnits,costUsd].some(v=>v!==null&&!nonnegative(v)))return {accepted:false,reason:'invalid-observation'}
      const record=receipts.get(id)
      if(!record){observationUncertain=true;suspend('observation-identity-unavailable');return {accepted:false,reason:'observation-identity-unavailable',fallback:'cheap'}}
      if(revision<=record.revision)return {accepted:false,reason:'duplicate-or-out-of-order-observation'}
      for(const [key,total] of [['transferBytes','bytes'],['billableUnits','units'],['costUsd','usd']]){
        const value={transferBytes,billableUnits,costUsd}[key],prior=record[key]
        if(value!==null){record[key]=Math.max(prior??0,value);observed[total]+=record[key]-(prior??0)}
      }
      if(!record.canceled&&record.costUsd!==null&&record.unknownCost){unknownCostReceipts--;record.unknownCost=false}
      record.revision=revision;observed.corrections++;charge(record)
      // Coalesce correction notifications per retained identity, so revision
      // updates cannot grow an undrained effects queue without bound.
      for(let i=effects.length-1;i>=0;i--)if(effects[i].type==='observation-corrected'&&(effects[i].id===id||!receipts.has(effects[i].id)))effects.splice(i,1)
      effects.push({type:'observation-corrected',id,revision,observedTotals:{transferBytes:record.transferBytes,billableUnits:record.billableUnits,costUsd:record.costUsd},overEstimate:record.costUsd>record.estimate.usd||record.billableUnits>record.estimate.units})
      if(!disposed&&check({usd:0,units:0,slots:1}))suspend('observed-allowance-exhausted')
      return {accepted:true,reason:'observed-correction',revision}
    },
    drainEffects() { return effects.splice(0).map(e => ({ ...e, ...(e.cancelReservationIds ? { cancelReservationIds: [...e.cancelReservationIds] } : {}) })) },
    snapshot() {
      clock(); const observation = usage.snapshot()
      return { ...observation, productSessions: sessions, interactions, distinctLocations: locationOverflow ? null : locations.size, retainedDistinctLocations: locations.size, lifecycle, resource, resourceMs, pending: totals(false), unreconciledUsage: [...consumed.values()].map(v=>({...v})), providerReceipts: [...receipts.values()].map(receiptView), observationCorrections:{scope:'session-local-observation',authoritativeBudgetEnforcement:false,...observed,identityUnavailable:observationUncertain,retainedIdentities:receipts.size,maxReceipts}, pendingRequests: pending.size, unknownCostReceipts, disposed, authoritativeBudgetEnforcement: false, fallback: 'cheap', costPreferences: WORLD_VIEW_COST_PREFERENCES }
    },
  }
}
