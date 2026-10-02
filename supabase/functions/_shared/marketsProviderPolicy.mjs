// Source/right gates retained from the accepted October 2 Library research.
// No account, provider call, subscription or upgrade is activated by this policy.
export const MARKETS_PROVIDER_POSTURE = Object.freeze({
  incrementalSubscriptionCeiling:0,incrementalOverageCeiling:0,paidActivation:false,scrapedFallback:false,
  equities:Object.freeze({direction:'TradingView hosted widget',state:'deployment_and_instrument_rights_unqualified',
    nativePriceAccess:false,priceNewsSynchronization:false}),
  crypto:Object.freeze({direction:'CoinMarketCap Basic',state:'conditional_terms_unresolved',
    reason:'Conflicting official pricing/commercial-entitlement statements require the actual agreement and intended audience to qualify.',
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
