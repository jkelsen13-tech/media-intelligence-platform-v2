import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MARKETS_PROVIDER_POSTURE,MARKETS_PROVIDER_CAPABILITIES,MARKETS_CREDIT_FORMULAS,
  qualifyMarketsProviderRequest,planMarketsCapabilityEvidence,planMarketsCreditReservation,planMarketsProviderRecovery,
} from '../supabase/functions/_shared/marketsProviderPolicy.mjs'

const latest='/v3/cryptocurrency/quotes/latest',history='/v3/cryptocurrency/quotes/historical'
const at='2026-10-03T04:00:00Z'
function creditInput(endpoint=latest) {
  return {endpoint,returnedRecordBound:1,conversionCount:1,at,safetyReserveCredits:2,subscriptionCost:0,overageCost:0,
    accountAllowance:{kind:'owner_qualified_actual_account_snapshot',recordRef:'synthetic-account-snapshot',
      provider:'CoinMarketCap Basic',endpoint,observedAt:at,maxConversionsPerCall:1,remainingMinuteRequests:1,
      dailyRemainingCredits:30,monthlyRemainingCredits:100,
      dailyResetAt:'2026-10-04T00:00:00Z',monthlyResetAt:'2026-11-01T00:00:00Z'}}
}
function evidenceInput(capability='latest_aggregate_quote') {
  const policy=MARKETS_PROVIDER_CAPABILITIES[capability]
  return {provider:policy.provider,capability,subscriptionCost:0,overageCost:0,
    evidence:policy.requiredEvidence.map(kind=>({kind,provider:policy.provider,capability,
      status:'owner_qualified_retained_record',recordRef:`synthetic-${capability}-${kind}`}))}
}
test('current published offer resolves only the pricing observation, preserving unresolved actual rights and disabled activation',()=>{
  const posture=MARKETS_PROVIDER_POSTURE.crypto,offer=posture.publishedOffer
  assert.equal(posture.state,'conditional_terms_unresolved')
  assert.doesNotMatch(posture.reason,/Conflicting official pricing/)
  assert.equal(offer.accessedOn,'2026-10-03');assert.equal(offer.checkedAt,'04:12 UTC')
  assert.deepEqual(offer.urls,['https://pro.coinmarketcap.com/api/pricing','https://coinmarketcap.com/api/pricing/'])
  assert.equal(offer.pricingConflict,'not_reproduced_on_current_route')
  assert.equal(offer.monthlyCredits,15000);assert.equal(offer.requestsPerMinute,50)
  assert.equal(offer.commercialBasicPublished,true);assert.equal(offer.actualAccountAllowance,false)
  for (const key of ['accountQualified','retentionQualified','historyQualified','creditsQualified']) assert.equal(posture[key],false)
  assert.equal(MARKETS_PROVIDER_POSTURE.paidActivation,false);assert.equal(MARKETS_PROVIDER_POSTURE.scrapedFallback,false)
  assert.equal(Object.isFrozen(offer.urls),true)
  for (const provider of ['TradingView','CoinMarketCap Basic']) assert.deepEqual(qualifyMarketsProviderRequest({
    provider,subscriptionCost:0,overageCost:0,accountRights:'owner_qualified_actual_agreement',remainingCredits:100,requestCredits:1,
  }),{status:'blocked',reason:'provider_activation_not_authorized'})
})
test('each capability needs separately scoped retained evidence; transport success cannot grant rights or history',()=>{
  for (const capability of Object.keys(MARKETS_PROVIDER_CAPABILITIES)) {
    const input=evidenceInput(capability),before=structuredClone(input)
    assert.deepEqual(planMarketsCapabilityEvidence(input),{
      status:'blocked',reason:'provider_activation_not_authorized',executionAuthorized:false,missingEvidence:[],
    })
    for (const record of input.evidence) {
      const missing=structuredClone(input);missing.evidence=missing.evidence.filter(row=>row.kind!==record.kind)
      assert.deepEqual(planMarketsCapabilityEvidence(missing).missingEvidence,[record.kind])
    }
    assert.deepEqual(input,before)
  }
  const latestOnly=evidenceInput();latestOnly.capability='historical_aggregate_quotes'
  assert.deepEqual(planMarketsCapabilityEvidence(latestOnly).missingEvidence,MARKETS_PROVIDER_CAPABILITIES.historical_aggregate_quotes.requiredEvidence)
  for (const capability of ['history_rights','permanent_price_archive','price_export','venue_pair_quote','constructor']) {
    assert.equal(planMarketsCapabilityEvidence({...evidenceInput(),capability}).reason,'capability_outside_accepted_route')
  }
  const successfulTransport=evidenceInput();successfulTransport.evidence=successfulTransport.evidence.filter(row=>row.kind==='transport_test')
  assert.ok(planMarketsCapabilityEvidence(successfulTransport).missingEvidence.includes('accepted_account_terms'))
  const claimedRights=evidenceInput();claimedRights.evidence[1].status='caller_says_eligible'
  assert.ok(planMarketsCapabilityEvidence(claimedRights).missingEvidence.includes('accepted_account_terms'))
  assert.equal(planMarketsCapabilityEvidence({...evidenceInput(),subscriptionCost:1}).reason,'zero_cost_ceiling')
})
test('endpoint-version batching and additive conversions use returned bounds, including inclusive seven-day history',()=>{
  for (const [endpoint,counts,expected] of [[latest,[1,249,250,251,500,501],[1,1,1,2,2,3]],
    [history,[1,99,100,101,200,201,2017],[1,1,1,2,2,3,21]]]) {
    for (let i=0;i<counts.length;i++) {
      const input=creditInput(endpoint);input.returnedRecordBound=counts[i]
      const before=structuredClone(input),result=planMarketsCreditReservation(input)
      assert.equal(result.status,'reservation_plan');assert.equal(result.requestCredits,expected[i])
      assert.equal(result.requiredAvailableCredits,expected[i]+2);assert.equal(result.executionAuthorized,false)
      assert.equal(result.seriesKind,'aggregate');assert.equal(result.requiresGlobalReservation,true)
      assert.equal(result.requiresActualCreditReconciliation,true);assert.deepEqual(input,before)
    }
  }
  const extra=creditInput();extra.returnedRecordBound=501;extra.conversionCount=3;extra.accountAllowance.maxConversionsPerCall=3
  assert.equal(planMarketsCreditReservation(extra).requestCredits,5,'3 batches + 2 conversions, not 9 credits')
  extra.endpoint=history;extra.accountAllowance.endpoint=history;extra.returnedRecordBound=201
  assert.equal(planMarketsCreditReservation(extra).requestCredits,5)
  assert.equal(MARKETS_CREDIT_FORMULAS[history].recordKind,'returned_historical_points')
})
test('published quotas, another endpoint and an adjacent observation cannot substitute for exact account allowance',()=>{
  for (const change of [x=>delete x.accountAllowance,x=>x.accountAllowance=MARKETS_PROVIDER_POSTURE.crypto.publishedOffer,
    x=>x.accountAllowance.endpoint=history,x=>x.accountAllowance.provider='TradingView',
    x=>x.accountAllowance.observedAt='2026-10-03T04:00:00.000000001Z',x=>x.accountAllowance.recordRef='',
    x=>x.accountAllowance.dailyResetAt=at,x=>x.accountAllowance.monthlyResetAt='unknown',
    x=>delete x.accountAllowance.dailyRemainingCredits,x=>x.accountAllowance.monthlyRemainingCredits=-1]) {
    const input=creditInput();change(input)
    assert.equal(planMarketsCreditReservation(input).reason,'actual_account_allowance_unqualified')
  }
  for (const [field,value,reason] of [['maxConversionsPerCall',1,'account_conversion_limit'],
    ['remainingMinuteRequests',0,'account_minute_limit'],['dailyRemainingCredits',2,'account_daily_credit_limit'],
    ['monthlyRemainingCredits',2,'account_monthly_credit_limit']]) {
    const input=creditInput();input.accountAllowance[field]=value
    if (field==='maxConversionsPerCall') input.conversionCount=2
    assert.equal(planMarketsCreditReservation(input).reason,reason)
  }
  const edge=creditInput();edge.accountAllowance.dailyRemainingCredits=3;edge.accountAllowance.monthlyRemainingCredits=3
  assert.equal(planMarketsCreditReservation(edge).status,'reservation_plan','safety reserve boundary')
  edge.safetyReserveCredits=3;assert.equal(planMarketsCreditReservation(edge).reason,'account_daily_credit_limit')
})
test('unknown endpoints, missing bounds and arithmetic overflow fail closed without integer rounding drift',()=>{
  for (const endpoint of ['/v2/cryptocurrency/quotes/latest','/v2/cryptocurrency/market-pairs/latest','constructor',undefined])
    assert.equal(planMarketsCreditReservation({...creditInput(),endpoint}).reason,'endpoint_formula_unqualified')
  for (const value of [undefined,0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(planMarketsCreditReservation({...creditInput(),returnedRecordBound:value}).reason,'bounded_credit_inputs_unqualified')
    assert.equal(planMarketsCreditReservation({...creditInput(),conversionCount:value}).reason,'bounded_credit_inputs_unqualified')
  }
  assert.equal(planMarketsCreditReservation({...creditInput(),safetyReserveCredits:undefined}).reason,'bounded_credit_inputs_unqualified')
  assert.equal(planMarketsCreditReservation({...creditInput(),safetyReserveCredits:Number.MAX_SAFE_INTEGER}).reason,'credit_arithmetic_overflow')
  assert.equal(planMarketsCreditReservation({...creditInput(),conversionCount:Number.MAX_SAFE_INTEGER,returnedRecordBound:251}).reason,'credit_arithmetic_overflow')
  const large=creditInput();large.returnedRecordBound=9007199254740751;large.safetyReserveCredits=0
  large.accountAllowance.dailyRemainingCredits=Number.MAX_SAFE_INTEGER;large.accountAllowance.monthlyRemainingCredits=Number.MAX_SAFE_INTEGER
  assert.equal(planMarketsCreditReservation(large).requestCredits,36028797018964,'exact ceiling near integer boundary')
  assert.equal(planMarketsCreditReservation({...creditInput(),overageCost:0.01}).reason,'zero_cost_ceiling')
})
test('credential, payment, forbidden, exhaustion and data failures cannot enter the retry path',()=>{
  const actions={unauthorized:'qualify_existing_credentials',payment_required:'hold_zero_cost_route',plan_forbidden:'wait_for_qualified_entitlement',
    daily_exhausted:'wait_for_verified_daily_reset',monthly_exhausted:'wait_for_verified_monthly_reset',
    unsupported_asset:'withhold_price',mapping_ambiguous:'qualify_existing_mapping',malformed_data:'withhold_price',
    blocked_embed:'qualify_embed_rights_and_transport'}
  for (const [failure,action] of Object.entries(actions)) {
    const result=planMarketsProviderRecovery({failure,transient:true,attemptsUsed:0,maxRetries:2,retryAfterMs:1000,requestCredits:1,remainingCredits:100})
    assert.equal(result.status,'hold');assert.equal(result.action,action);assert.equal(result.executionAuthorized,false)
    assert.equal(result.reportingAvailableIndependently,true);assert.equal('retryNumber' in result,false)
  }
  for (const failure of ['daily_exhausted','monthly_exhausted']) {
    assert.equal(planMarketsProviderRecovery({failure,at,verifiedResetAt:at}).verifiedResetAt,null)
    assert.equal(planMarketsProviderRecovery({failure,at,verifiedResetAt:'2026-10-04T00:00:00Z'}).verifiedResetAt,'2026-10-04T00:00:00Z')
  }
  assert.equal(planMarketsProviderRecovery({failure:'HTTP429'}).reason,'failure_kind_unqualified')
})
test('only typed minute/IP throttles and known transient outages get finite, budgeted retry plans',()=>{
  for (const failure of ['minute_throttle','ip_throttle','provider_outage']) {
    const input={failure,transient:true,attemptsUsed:0,maxRetries:2,retryAfterMs:1000,requestCredits:3,remainingCredits:3}
    const before=structuredClone(input),result=planMarketsProviderRecovery(input)
    assert.equal(result.status,'retry_plan');assert.equal(result.retryNumber,1)
    assert.equal(result.executionAuthorized,false);assert.equal(result.requiresFreshMinuteAndAccountQuota,true)
    assert.equal(result.requiresGlobalReservation,true);assert.deepEqual(input,before)
    for (const change of [{attemptsUsed:2},{maxRetries:3},{maxRetries:0},{remainingCredits:2},{retryAfterMs:0},{requestCredits:undefined}])
      assert.equal(planMarketsProviderRecovery({...input,...change}).status,'hold')
  }
  assert.equal(planMarketsProviderRecovery({failure:'provider_outage',attemptsUsed:0,maxRetries:2,retryAfterMs:1000,requestCredits:1,remainingCredits:10}).status,'hold')
})
