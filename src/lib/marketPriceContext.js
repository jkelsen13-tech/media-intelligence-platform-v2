import { marketInstant, validateMarketAsset, validateMarketEvidencePath } from '../../supabase/functions/_shared/marketsEvidenceContract.mjs'

// Initial-release Markets display preparation. No runtime reader or provider
// adapter calls this helper. Inputs must come from a future trusted retained-
// record/publication adapter: caller-authored eligibility flags are not authority.
// The existing semantic contract owns identity, rights and relationship checks.
export const MARKET_CONTEXT_COPY = Object.freeze({
  introduction: 'Explore available stock and crypto prices alongside related reporting collected by MIP. Prices come from the provider named on the chart or quote. Reporting covers MIP’s ingested sources and may be incomplete.',
  unmapped: 'We could not confidently match this asset. Choose an exchange or network, or search using its full name.',
  unavailablePrice: 'Price data is unavailable here for this asset. You can still explore related reporting in MIP.',
  emptyReporting: 'No related reporting was found in MIP for this asset and selected period. This may reflect limited coverage or ingestion delays; it does not mean nothing happened.',
  ingestionUnknown: 'Ingestion update time unavailable.',
  reportingBoundary: 'Related reporting does not establish what caused a price change.',
  footer: 'Market information is provided for research and context, not as a recommendation to buy or sell.',
})

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

/** Label only a supplied range meaning. This does not prove provider support or
 * turn a widget session into a rolling calendar window. Unknown stays unknown.
 */
export function marketPriceRangeLabel(kind, meaning) {
  if (kind === 'equity') {
    if (meaning === 'trading-day') return 'Trading-day view — not a continuous 24-hour window.'
    if (meaning === '5-trading-days') return '5 trading days — not 7 calendar days.'
  }
  if (kind === 'cryptoasset') {
    if (meaning === 'rolling-24-hours') return 'Rolling 24 hours'
    if (meaning === 'rolling-7-days') return 'Rolling 7 days'
  }
  return 'Price range unavailable'
}

/** A disabled price path leaves separately validated reporting inspectable.
 * No quote, delay, provider mapping, price samples, historical fill or causal
 * claim is accepted or synthesized by this preparation-only model.
 */
export function buildMarketPriceContext({ asset = null, at = null, observationTime = null, reporting = [] } = {}) {
  const identity = validateMarketAsset(asset, at)
  const sections = [
    { id: 'direct_reporting', label: 'Direct reporting', records: [] },
    { id: 'connected_development', label: 'Connected developments', records: [] },
    { id: 'broader_context', label: 'Broader context', records: [] },
  ]
  const rejected = []
  const seen = new Set()
  const bounded = Array.isArray(reporting) && reporting.length <= 200
  if (identity.status === 'ok' && bounded) for (const proposed of reporting) {
    const evidence = proposed?.evidence
    if (evidence?.asset?.id !== identity.asset.id || evidence?.asset?.recordVersionId !== identity.asset.recordVersionId
      || marketInstant(evidence?.at) !== marketInstant(at)) {
      rejected.push({ reason: 'investigation_scope_mismatch' }); continue
    }
    const result = validateMarketEvidencePath(evidence)
    if (result.status !== 'ok') { rejected.push({ reason: result.reason }); continue }
    // Initial connected developments use at most one relationship hop plus
    // a direct-reporting edge. A wider path needs its own explicit expansion.
    if (result.path.filter(hop => hop.relationship !== 'direct_reporting').length > 1) {
      rejected.push({ reason: 'initial_relationship_scope_exceeded' }); continue
    }
    const band = result.relation === 'direct_reporting' ? 'direct_reporting'
      : proposed.relevance === 'broader_context' ? 'broader_context' : 'connected_development'
    const key = JSON.stringify([band, result.eventId, result.path])
    if (seen.has(key)) continue
    seen.add(key)
    sections.find(section => section.id === band).records.push({
      eventId: result.eventId, relation: band, at: result.at,
      path: result.path, rootIds: result.rootIds,
      explanation: band === 'direct_reporting' ? null : {
        label: 'Why this is related', relationships: result.path.map(hop => ({
          from: hop.from, to: hop.to, relationship: hop.relationship,
          assessmentId: hop.assessmentId, uncertainty: hop.uncertainty, supports: hop.supports,
        })),
      },
    })
  }
  const hasReporting = sections.some(section => section.records.length > 0)
  return freeze({
    status: identity.status, reason: identity.reason ?? null,
    asset: identity.asset ?? null, aliases: identity.aliases ?? [],
    validTime: marketInstant(at) === null ? null : at,
    observationTime: marketInstant(observationTime) === null ? null : observationTime,
    price: { status: 'unavailable', reason: 'provider_not_enabled', activeProvider: null,
      providerDirection: identity.status !== 'ok' ? null : identity.asset.kind === 'equity' ? 'TradingView' : 'CoinMarketCap Basic',
      quote: null, quoteTime: null, retrievalTime: null, delay: null, session: null, samples: [],
      incrementalSubscriptionCeiling: 0, copy: MARKET_CONTEXT_COPY.unavailablePrice },
    reporting: { status: identity.status !== 'ok' ? 'unavailable' : !bounded ? 'unavailable' : hasReporting ? 'available' : 'empty',
      reason: identity.status !== 'ok' ? identity.reason : !bounded ? 'reporting_scope_too_large' : null,
      sections, rejected, independentConfirmation: null,
      copy: identity.status !== 'ok' ? MARKET_CONTEXT_COPY.unmapped : hasReporting ? MARKET_CONTEXT_COPY.reportingBoundary : MARKET_CONTEXT_COPY.emptyReporting,
      ingestionCopy: MARKET_CONTEXT_COPY.ingestionUnknown },
    copy: MARKET_CONTEXT_COPY,
  })
}
