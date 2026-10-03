import { marketInstant } from './marketsEvidenceContract.mjs'

// Published offer evidence is not an accepted account agreement or allowance.
// October 3 Library addendum §6 supersedes only the current pricing conflict;
// the October 2 observations and qualification records remain historical.
// No account, provider call, subscription or upgrade is activated by this policy.
export const MARKETS_PROVIDER_POSTURE = Object.freeze({
  incrementalSubscriptionCeiling:0,incrementalOverageCeiling:0,paidActivation:false,scrapedFallback:false,
  equities:Object.freeze({direction:'TradingView hosted widget',state:'deployment_and_instrument_rights_unqualified',
    nativePriceAccess:false,priceNewsSynchronization:false}),
  crypto:Object.freeze({direction:'CoinMarketCap Basic',state:'conditional_terms_unresolved',
    reason:'Current published Basic pricing includes commercial use; actual account agreement, audience, retention, history entitlement and endpoint billing remain unqualified.',
    publishedOffer:Object.freeze({accessedOn:'2026-10-03',checkedAt:'04:12 UTC',
      urls:Object.freeze(['https://pro.coinmarketcap.com/api/pricing','https://coinmarketcap.com/api/pricing/']),
      observedDestination:'https://coinmarketcap.com/api/pricing/',pricingConflict:'not_reproduced_on_current_route',
      monthlyCredits:15000,requestsPerMinute:50,conversionsPerCall:1,commercialBasicPublished:true,
      actualAccountAllowance:false}),
    accountQualified:false,retentionQualified:false,historyQualified:false,creditsQualified:false}),
})
export function qualifyMarketsProviderRequest({provider,subscriptionCost,overageCost,accountRights,remainingCredits,requestCredits}={}) {
  if (subscriptionCost !== 0 || overageCost !== 0) return {status:'blocked',reason:'zero_cost_ceiling'}
  if (!['TradingView','CoinMarketCap Basic'].includes(provider)) return {status:'blocked',reason:'provider_outside_accepted_route'}
  if (accountRights !== 'owner_qualified_actual_agreement') return {status:'blocked',reason:'actual_account_rights_unqualified'}
  if (provider === 'CoinMarketCap Basic' && (!Number.isSafeInteger(remainingCredits) || !Number.isSafeInteger(requestCredits)
    || requestCredits <= 0 || remainingCredits < requestCredits)) return {status:'blocked',reason:'bounded_credits_unqualified'}
  // A qualified planning input still cannot enable a provider. Installation,
  // explicit activation and account-wide reservations are separate authorities.
  return {status:'blocked',reason:'provider_activation_not_authorized'}
}

const text = value => typeof value === 'string' && value.trim().length > 0
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
const positive = value => nonnegative(value) && value > 0
const blocked = reason => ({status:'blocked',reason,executionAuthorized:false})
const capability = (provider, requiredEvidence) => Object.freeze({provider,requiredEvidence:Object.freeze(requiredEvidence)})
const cmcEvidence = ['published_offer','accepted_account_terms','product_audience_territories','endpoint_entitlement','instrument_mapping','transport_test','account_quota']

// These references are planning inputs, never rights decisions. A future trusted
// adapter must resolve retained owner evidence independently for each capability.
// Cache periods require their own rights evidence; update cadence is not a TTL.
export const MARKETS_PROVIDER_CAPABILITIES = Object.freeze({
  latest_aggregate_quote:capability('CoinMarketCap Basic',cmcEvidence),
  historical_aggregate_quotes:capability('CoinMarketCap Basic',[...cmcEvidence,'history_rights']),
  temporary_display_cache:capability('CoinMarketCap Basic',[...cmcEvidence,'temporary_retention_rights']),
  hosted_stock_widget:capability('TradingView',['published_offer','commercial_widget_rights','product_audience_territories','instrument_coverage','embed_test','zero_cost_terms']),
})
export function planMarketsCapabilityEvidence({provider,capability:requested,evidence=[],subscriptionCost,overageCost}={}) {
  if (subscriptionCost !== 0 || overageCost !== 0) return blocked('zero_cost_ceiling')
  const policy = MARKETS_PROVIDER_CAPABILITIES[requested]
  if (!Object.hasOwn(MARKETS_PROVIDER_CAPABILITIES,requested) || policy.provider !== provider) return blocked('capability_outside_accepted_route')
  if (!Array.isArray(evidence) || evidence.length > 32) return blocked('invalid_evidence_plan')
  const missingEvidence = policy.requiredEvidence.filter(kind => !evidence.some(record =>
    record?.kind === kind && record.provider === provider && record.capability === requested
    && record.status === 'owner_qualified_retained_record' && text(record.recordRef)))
  return {...blocked(missingEvidence.length ? 'capability_evidence_unqualified' : 'provider_activation_not_authorized'),missingEvidence}
}

// Exact endpoint-version formulas from the public cryptocurrency reference,
// checked 2026-10-03 04:33 UTC. Extra conversions add credits, not batch factors.
// Returned historical points means the total across all requested assets.
export const MARKETS_CREDIT_FORMULAS = Object.freeze({
  '/v3/cryptocurrency/quotes/latest':Object.freeze({batchSize:250,recordKind:'returned_assets',capability:'latest_aggregate_quote'}),
  '/v3/cryptocurrency/quotes/historical':Object.freeze({batchSize:100,recordKind:'returned_historical_points',capability:'historical_aggregate_quotes'}),
})
export function planMarketsCreditReservation({endpoint,returnedRecordBound,conversionCount,at,accountAllowance,safetyReserveCredits,subscriptionCost,overageCost}={}) {
  if (subscriptionCost !== 0 || overageCost !== 0) return blocked('zero_cost_ceiling')
  if (!Object.hasOwn(MARKETS_CREDIT_FORMULAS,endpoint)) return blocked('endpoint_formula_unqualified')
  if (!positive(returnedRecordBound) || !positive(conversionCount) || !nonnegative(safetyReserveCredits)) return blocked('bounded_credit_inputs_unqualified')
  const formula = MARKETS_CREDIT_FORMULAS[endpoint]
  const batch = BigInt(formula.batchSize)
  const exactCredits = (BigInt(returnedRecordBound)+batch-1n)/batch + BigInt(conversionCount)-1n
  const exactRequired = exactCredits + BigInt(safetyReserveCredits)
  if (exactRequired > BigInt(Number.MAX_SAFE_INTEGER)) return blocked('credit_arithmetic_overflow')
  const requestCredits = Number(exactCredits), requiredAvailableCredits = Number(exactRequired)
  const instant = marketInstant(at), allowance = accountAllowance
  // Exact supplied observation clock, no invented freshness duration/reset.
  // This is a snapshot comparison, not a concurrent/global reservation ledger.
  if (instant === null || allowance?.kind !== 'owner_qualified_actual_account_snapshot'
    || !text(allowance.recordRef) || allowance.provider !== 'CoinMarketCap Basic' || allowance.endpoint !== endpoint
    || marketInstant(allowance.observedAt) !== instant
    || !positive(allowance.maxConversionsPerCall) || !nonnegative(allowance.remainingMinuteRequests)
    || !nonnegative(allowance.dailyRemainingCredits) || !nonnegative(allowance.monthlyRemainingCredits)
    || marketInstant(allowance.dailyResetAt) === null || marketInstant(allowance.dailyResetAt) <= instant
    || marketInstant(allowance.monthlyResetAt) === null || marketInstant(allowance.monthlyResetAt) <= instant) return blocked('actual_account_allowance_unqualified')
  if (conversionCount > allowance.maxConversionsPerCall) return blocked('account_conversion_limit')
  if (allowance.remainingMinuteRequests < 1) return blocked('account_minute_limit')
  if (allowance.dailyRemainingCredits < requiredAvailableCredits) return blocked('account_daily_credit_limit')
  if (allowance.monthlyRemainingCredits < requiredAvailableCredits) return blocked('account_monthly_credit_limit')
  return {status:'reservation_plan',executionAuthorized:false,endpoint,capability:formula.capability,
    seriesKind:'aggregate',recordKind:formula.recordKind,returnedRecordBound,conversionCount,
    requestCredits,safetyReserveCredits,requiredAvailableCredits,accountAllowanceRef:allowance.recordRef,
    requiresGlobalReservation:true,requiresActualCreditReconciliation:true}
}

const recovery = Object.freeze({
  unauthorized:'qualify_existing_credentials',payment_required:'hold_zero_cost_route',plan_forbidden:'wait_for_qualified_entitlement',
  minute_throttle:'bounded_transient_retry',ip_throttle:'bounded_transient_retry',
  daily_exhausted:'wait_for_verified_daily_reset',monthly_exhausted:'wait_for_verified_monthly_reset',
  unsupported_asset:'withhold_price',mapping_ambiguous:'qualify_existing_mapping',malformed_data:'withhold_price',
  provider_outage:'bounded_transient_retry',blocked_embed:'qualify_embed_rights_and_transport',
})
// The failure kind comes from a future tested adapter; HTTP 403/429 alone cannot
// establish plan denial versus quota class. No timers, transport or fallback run.
export function planMarketsProviderRecovery({failure,transient=false,attemptsUsed,maxRetries,retryAfterMs,requestCredits,remainingCredits,verifiedResetAt,at}={}) {
  if (!Object.hasOwn(recovery,failure)) return blocked('failure_kind_unqualified')
  const action = recovery[failure]
  const base = {status:'hold',failure,action,executionAuthorized:false,reportingAvailableIndependently:true}
  if (action !== 'bounded_transient_retry') {
    if (failure === 'daily_exhausted' || failure === 'monthly_exhausted') {
      const reset = marketInstant(verifiedResetAt), instant = marketInstant(at)
      return {...base,verifiedResetAt:instant !== null && reset !== null && reset > instant ? verifiedResetAt : null}
    }
    return base
  }
  if ((failure === 'provider_outage' && transient !== true) || !nonnegative(attemptsUsed)
    || !positive(maxRetries) || maxRetries > 2 || attemptsUsed >= maxRetries
    || !positive(retryAfterMs) || !positive(requestCredits) || !nonnegative(remainingCredits)
    || remainingCredits < requestCredits) return {...base,reason:'bounded_retry_inputs_unqualified'}
  return {...base,status:'retry_plan',retryAfterMs,retryNumber:attemptsUsed+1,
    requestCredits,requiresGlobalReservation:true,requiresFreshMinuteAndAccountQuota:true}
}
