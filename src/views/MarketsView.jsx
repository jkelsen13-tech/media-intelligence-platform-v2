import { useMemo, useState } from 'react'
import { createMarketSourceLookup } from '../lib/marketSourceLookup.js'
import { MARKET_CONTEXT_COPY } from '../lib/marketPriceContext.js'
import { safeExternalHttpUrl } from '../lib/externalUrls.js'
import './markets.css'

const shown = value => value == null || value === '' ? 'Unavailable' : String(value)
function Clock({ label, value }) { return <div><dt>{label}</dt><dd>{shown(value)}</dd></div> }
function Identity({ asset }) {
  return <><span className="market-kind">{asset.kind === 'equity' ? 'Stock listing' : 'Cryptoasset'}</span><strong>{asset.name}</strong>
    <span>{asset.aliases.map(alias => `${alias.namespace}: ${alias.symbol}`).join(' · ') || 'No current symbol recorded'}</span>
    <span>{asset.kind === 'cryptoasset' ? `Network ${asset.networkId} · ${asset.assetIdentifierKind ?? 'Asset'}: ${asset.assetIdentifier}` : `Exchange ${asset.exchangeMic ?? 'unavailable'} · Share class ${asset.shareClassId ?? 'unavailable'} · Issuer ${asset.issuerId}`}</span></>
}

function ReportingRecord({ record, onOpenEvent, onOpenArticle }) {
  const supports = record.path.flatMap(hop => hop.supports)
  const unique = [...new Map(supports.map(support => [JSON.stringify([support.captureId, support.field, support.start, support.end]), support])).values()]
  return <article className="market-reporting-record">
    <h3>Recorded reporting</h3>
    {unique.map(support => <div key={JSON.stringify([support.captureId, support.field, support.start, support.end])} className="market-support">
      <blockquote>{support.excerpt}</blockquote>
      <dl className="market-clocks"><Clock label="Publication time" value={support.publishedAt} /><Clock label="MIP record observed" value={support.recordedAt} /></dl>
      <p className="market-attribution">{support.attribution}</p>
      <div className="market-actions">
        {safeExternalHttpUrl(support.sourceUrl) && <a href={safeExternalHttpUrl(support.sourceUrl)} target="_blank" rel="noopener noreferrer">View supporting source</a>}
        <button type="button" onClick={() => onOpenArticle?.(support.articleId)}>Open reporting in News</button>
      </div>
    </div>)}
    <details><summary>Why this is related</summary>
      <p>This is a recorded relationship path, not proof of a price effect.</p>
      <ol>{record.path.map(hop => <li key={hop.assessmentId}>
        <strong>{hop.relationship.replaceAll('_', ' ')}</strong><p>{hop.from} → {hop.to}</p><p>Remaining uncertainty: {hop.uncertainty}</p>
      </li>)}</ol>
      {record.reviewRef && <p>Path review: {record.reviewRef} · Method: {record.methodVersion}</p>}
    </details>
    <details><summary>Evidence identity and provenance</summary><dl className="market-clocks">
      <Clock label="Event identity" value={record.eventId} /><Clock label="Relationship valid time" value={record.at} />
      <Clock label="Retained source roots" value={record.rootIds.join(', ')} />
      <Clock label="Retained path version" value={record.recordVersionId} />
      <Clock label="Reviewed public source versions" value={unique.map(support => support.publicVersionId).filter(Boolean).join(', ')} />
      <Clock label="Event occurrence time" value={null} />
    </dl><p>Source roots do not establish independent confirmation. Correction, stale-state and excerpt-rights checks determine whether this path remains visible.</p></details>
    <button type="button" onClick={() => onOpenEvent?.(record.eventId)}>Explore this recorded event</button>
  </article>
}

/** The backend owner supplies an authorized typed projection. There is no
 * built-in asset list, ticker guessing, provider request or browser admission. */
export default function MarketsView({ sourceSnapshot = null, sourceLoadStatus = 'unavailable', investigationContext = null,
  onSelectAsset, onOpenEvent, onOpenArticle, onOpenTimeline, onExploreConnections } = {}) {
  const source = useMemo(() => createMarketSourceLookup(sourceSnapshot), [sourceSnapshot])
  const [query, setQuery] = useState(''), [kind, setKind] = useState(''), [submitted, setSubmitted] = useState(false)
  const matches = useMemo(() => source.search(query, { kind: kind || null }), [source, query, kind])
  const subjectType = investigationContext?.canonical_subject_type
  const isAsset = ['equity', 'cryptoasset'].includes(subjectType)
  const lookup = isAsset ? source.lookup({ id: investigationContext.canonical_subject_id, kind: subjectType,
    at: investigationContext.as_of_time ?? source.validAt }) : null
  const model = lookup?.status === 'ok' ? lookup.model : null
  const select = result => {
    const qualified = source.lookup({ id: result.id, kind: result.kind })
    if (qualified.status === 'ok') onSelectAsset?.({ asset: qualified.model.asset, at: qualified.model.validTime,
      observationTime: qualified.model.observationTime, directoryVersion: qualified.directoryVersion })
  }
  return <section className="markets-view" aria-labelledby="markets-title" data-markets-source-status={source.status}>
    <header className="markets-header"><p className="markets-eyebrow">Prices and reporting</p><h1 id="markets-title">Markets</h1><p>{MARKET_CONTEXT_COPY.introduction}</p></header>
    <form className="market-search" role="search" aria-label="Find a market asset" onSubmit={event => { event.preventDefault(); setSubmitted(true) }}>
      <label>Asset name or symbol<input value={query} maxLength={120} onChange={event => { setQuery(event.target.value); setSubmitted(false) }} placeholder="Search supported mapped assets" /></label>
      <label>Asset type<select value={kind} onChange={event => { setKind(event.target.value); setSubmitted(false) }}><option value="">Stocks and crypto</option><option value="equity">Stocks</option><option value="cryptoasset">Cryptoassets</option></select></label>
      <button type="submit">Search assets</button>
    </form>
    <p className="market-search-note">A symbol is a search term. Select the full identity, exchange or network to start an investigation. Browsing results leaves your current investigation unchanged.</p>
    <div role="status" className="market-source-state">
      {source.status !== 'available' && sourceLoadStatus === 'loading' ? <><strong>Loading market sources</strong><p>Loading the asset directory and related reporting.</p></> : source.status !== 'available' ? <><strong>Asset directory unavailable</strong><p>No authorized typed asset directory is supplied here. Asset identity and related reporting cannot be inferred from symbols or nearby companies.</p>{submitted && <p>{MARKET_CONTEXT_COPY.unmapped}</p>}</>
        : <><strong>Mapped asset source available</strong><p>Directory version {source.version} · Valid time {source.validAt} · MIP observation {source.observedAt}</p></>}
    </div>
    {source.status === 'available' && query.trim() && <section aria-label="Asset search results" className="market-results">
      {matches.results.length ? <ul>{matches.results.map(asset => <li key={asset.id}><button type="button" onClick={() => select(asset)}><Identity asset={asset} /></button></li>)}</ul>
        : <p>{MARKET_CONTEXT_COPY.unmapped}</p>}
    </section>}
    {isAsset && !model && <div className="market-source-state"><h2>Selected asset unavailable</h2><p>{MARKET_CONTEXT_COPY.unmapped}</p><p>The canonical {subjectType} identity remains {investigationContext.canonical_subject_id}. No replacement asset or price is invented.</p></div>}
    {model ? <>
      <section aria-label="Selected market asset" className="market-asset"><Identity asset={{ ...model.asset, aliases: model.aliases }} />
        <details><summary>Canonical asset identity</summary><dl className="market-clocks"><Clock label="Asset identity" value={model.asset.id} /><Clock label="Identity record version" value={model.asset.recordVersionId} /><Clock label="Investigation valid time" value={model.validTime} /><Clock label="MIP observation time" value={model.observationTime} /></dl></details>
        {model.asset.identityRefs?.length > 0 && <details className="market-identity-provenance"><summary>Identity evidence and review</summary>
          {model.asset.identityRefs.map(ref => <div key={ref.recordVersionId}><strong>{ref.identityType.replaceAll('_',' ')} · {ref.name}</strong>
            <p>{ref.id} · Version {ref.recordVersionId}</p><p>Mapping review: {ref.reviewRef} · Method: {ref.methodVersion}</p>
            {ref.sourceBindings.map(binding => <div key={`${binding.publicVersionId}:${binding.field}:${binding.start}`}>
              <blockquote>{binding.excerpt}</blockquote><p>{binding.attribution}</p>
              <p>Reviewed source version {binding.publicVersionId} · Excerpt-rights version {binding.rightsVersionId}</p>
            </div>)}
          </div>)}
        </details>}
      </section>
      <section className="market-price" aria-label="Price availability"><h2>Price context</h2><strong>Prices unavailable</strong><p>{model.price.copy}</p><p>Delay information unavailable · Quote time unavailable · Retrieval time unavailable</p><p>No price provider is active. Historical prices, recent movement and timestamped samples are unavailable.</p></section>
      <div className="market-actions"><button type="button" onClick={onOpenTimeline}>Open news timeline</button><button type="button" onClick={onExploreConnections}>Explore connections</button></div>
      <p className="market-boundary">{MARKET_CONTEXT_COPY.reportingBoundary}</p>
      <p>Related reporting in MIP · {model.reporting.ingestionCopy} This is not a complete list of news about this asset.</p>
      {model.reporting.sections.map(section => <section key={section.id} className="market-reporting-section" aria-labelledby={`market-section-${section.id}`}><h2 id={`market-section-${section.id}`}>{section.label}</h2>
        {section.records.length ? section.records.map((record, index) => <ReportingRecord key={`${record.eventId}:${index}`} record={record} onOpenEvent={onOpenEvent} onOpenArticle={onOpenArticle} />)
          : <p>{MARKET_CONTEXT_COPY.emptyReporting}</p>}
      </section>)}
    </> : <section className="market-price" aria-label="Price availability"><h2>Price context</h2><strong>Prices unavailable</strong><p>{MARKET_CONTEXT_COPY.unavailablePrice}</p><p>Select an authorized mapped asset to inspect its reporting. No price provider is active.</p></section>}
    <details className="market-about"><summary>About prices and coverage</summary><p>MIP brings together available market prices and reporting from its ingested sources. Price data is supplied by the provider named on each chart or quote; MIP does not derive prices from news articles. Availability, freshness, trading sessions, and historical coverage can differ by asset and provider.</p><p>Our reporting section includes direct coverage and connections supported by recorded relationships. You can inspect why an article is related and open its sources. Missing coverage does not establish that no event occurred. An article appearing near a price movement does not establish that it caused that movement.</p><p>The embedded TradingView stock chart is separate from MIP’s news timeline. MIP cannot use that widget’s underlying prices for its own historical calculations or place MIP event markers on it. Crypto history depends on the enabled data source and available period.</p><p>No widget or crypto API is enabled here.</p><p>Price changes are not a measure of whether a claim is true. This page does not provide price predictions, investment recommendations, or trade execution.</p></details>
    <footer>{MARKET_CONTEXT_COPY.footer}</footer>
  </section>
}
