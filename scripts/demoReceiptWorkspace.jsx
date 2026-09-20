import { useState } from 'react'
import { StatusBanner, BoundedRecords } from '../src/components/InvestigationPanelPresentation.jsx'
import RemainingUncertaintyBlock from '../src/components/RemainingUncertaintyBlock.jsx'
import InvestigationVersionNavigation from '../src/components/InvestigationVersionNavigation.jsx'
import { retainedDateDisplay } from '../src/lib/investigationEvidenceTrail.js'
import { searchDemoUniverseWithCoverage } from './demoCorpus.mjs'
import '../src/styles/investigation-workspace-panels.css'

export const RECEIPT_TABS = [
  ['overview', 'Overview'], ['changed', 'What Changed'], ['hypotheses', 'Hypotheses'], ['commitments', 'Commitments'],
  ['gaps', 'Evidence Gaps'], ['source-history', 'Source History'], ['source-links', 'Source Links'],
  ['evidence-checks', 'Evidence Checks'], ['search-coverage', 'Search Coverage'],
]
// Presentation grouping only. Every status and count comes from propagation.
export const CAPABILITY_FAMILIES = [
  ['Retained sources & provenance', ['capture', 'source_links', 'saved_states']],
  ['Claim candidates', ['claim_candidates', 'exact_evidence']],
  ['Source & dependency lineage', ['source_lineage', 'dependency_lineage']],
  ['Comparison coverage', ['comparison_membership', 'shared_unique_claims']],
  ['Entities & unresolved identity', ['entities', 'unresolved_identity_candidates']],
  ['Events', ['events']],
  ['Candidate & accepted relationships', ['candidate_relationships', 'relationships', 'accepted_relationships_by_type', 'rejected', 'deferred']],
  ['Framing, attribution & corrections', ['outlet_framing', 'attributed_statements', 'contradiction_candidates', 'correction_candidates']],
  ['Publication & source-date timeline', ['publication_time', 'timeline']],
  ['Search coverage', ['search_coverage', 'search_coverage_records']],
  ['Evidence checks & gaps', ['evidence_checks', 'evidence_check_records', 'evidence_gaps']],
  ['Source History', ['source_history', 'source_history_items']],
  ['Saved & versioned states', ['versions', 'versioned_states']],
  ['Review & What Changed', ['review', 'review_baseline', 'review_current', 'review_prior', 'what_changed', 'historical_current']],
  ['Hypotheses', ['hypotheses']],
  ['Assumptions', ['assumptions']],
  ['Strengthening & weakening evidence', ['strengthening_evidence', 'weakening_evidence']],
  ['Discriminating evidence & alternatives', ['discriminating_evidence', 'unresolved_alternatives']],
  ['Linked assessments & dependencies', ['assessments', 'linked_assessments', 'assessment_dependencies']],
  ['Collections & graph objects', ['collections', 'graph_nodes', 'graph_edges', 'graph_nodes_by_type', 'graph_edges_by_type']],
  ['Canonical & private subjects', ['subject', 'canonical_private_links']],
  ['Cross-investigation continuity & gates', ['cross_investigation_discovery', 'cross_investigation_identity_continuity', 'cross_investigation_candidate_relationships', 'cross_investigation_accepted_relationships', 'withheld_artifacts', 'admission']],
]
const pretty = value => String(value).replaceAll('_', ' ')
const unavailable = value => value ?? 'Unavailable'

export function ReceiptStageStatus({ rows, names }) {
  return <dl className="demo-stage-status">{names.map(name => {
    const stages = rows.map(row => row.stages[name])
    const states = [...new Set(stages.map(stage => stage.state))]
    const unknown = stages.filter(stage => stage.output_count === null).length
    const count = stages.reduce((sum, stage) => sum + (stage.output_count ?? 0), 0)
    return <div key={name} data-stage={name}><dt>{pretty(name)}</dt><dd><strong>{states.map(pretty).join(' / ') || 'Unavailable'}</strong>
      <span>{count} {stages[0]?.unit ?? 'outputs'} recorded{unknown ? `; output unknown for ${unknown} receipt(s)` : ''}.</span>
      <span>{[...new Set(stages.map(stage => stage.reason))].join(' ')}</span></dd></div>
  })}</dl>
}

export function ReceiptIdentity({ source, row }) {
  return <article className="piw-card demo-receipt-identity" data-capture-id={source.capture_id}>
    <h3>{source.title}</h3><p>{source.outlet} · pending candidate</p>
    <StatusBanner>Frozen historical receipt adapter. Exact retained body unavailable; no current source or review state queried.</StatusBanner>
    <dl className="ws-inspector-dl demo-id-list">{[
      ['Article', source.article_id], ['Capture', source.capture_id], ['Candidate', source.candidate_id],
      ['SHA-256', source.content_hash], ['Code-point span', `[${source.span_start}, ${source.span_end})`],
      ['Declared origin', source.origin_id ?? 'Unresolved'], ['Declared dependency', source.dependency_id ?? 'Unresolved'],
      ['Rights note', source.rights], ['Published timestamp', source.published_at ?? 'Unavailable'],
      ['Source date (not event time)', source.source_date], ['Recorded precision', source.publication_precision],
      ['Private identity', row.subject.private_subject_id], ['Canonical identity', 'Unavailable; no canonical link'],
      ['Reader / capture / candidate', `${source.reader_state} / ${source.capture_state} / ${source.candidate_state}`],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{unavailable(value)}</dd></div>)}</dl>
    <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
    <RemainingUncertaintyBlock>{source.remaining_uncertainty}</RemainingUncertaintyBlock>
  </article>
}

export function ReceiptSearchCoverage({ universe, query = '' }) {
  const coverage = searchDemoUniverseWithCoverage(universe, query)
  return <section className="piw-card" aria-label="Bounded search coverage"><h3>Search Coverage</h3>
    <p>{coverage.examined_sources} receipt records scanned · {coverage.results.length} metadata matches · 0 exact-text searches · semantic search not run.</p>
    <p>{coverage.no_results_meaning}</p><details><summary>Search field allowlist</summary><p className="piw-mono">{coverage.searched_fields.join(', ')}</p><p>{coverage.synopsis_basis}</p></details>
  </section>
}

export function ReceiptWorkspace({ universe, investigation, selected, onSelect, initialTab = 'overview' }) {
  const [tab, setTab] = useState(initialTab)
  const p = universe.propagation
  const sources = selected ? [selected] : investigation.sources
  const ids = new Set(sources.map(source => source.capture_id))
  const rows = p.sourceReceipts.filter(row => ids.has(row.capture_id))
  const byCapture = new Map(rows.map(row => [row.capture_id, row]))
  const show = names => <ReceiptStageStatus rows={rows} names={names} />
  return <div className="demo-native-view demo-receipt-workspace">
    <div className="demo-view-heading"><div><p className="demo-eyebrow">Investigation Context</p><h2>Retained evidence workspace</h2><p>Static receipt adapter · {selected ? 'selected capture' : investigation.topic + ' lens'} · {rows.length} receipt records</p></div></div>
    <StatusBanner>No native saved observation is supplied. Pending receipts are not reviewed intelligence. Every analytical family retains its blocked, unknown or unavailable state.</StatusBanner>
    <section className="piw-card" aria-label="Version and review controls"><h3>Version &amp; review context</h3>
      <p>Frozen receipt projection · historical metadata. Native version, current state, prior version and review baseline: unavailable.</p>
      <InvestigationVersionNavigation bundle={null} />
      <div className="demo-version-actions"><button disabled>Previous saved version</button><button disabled>Current saved version</button><button disabled>Review baseline</button><button disabled>Mark reviewed</button></div>
    </section>
    <nav className="demo-receipt-tabs" aria-label="Investigation capability sections">{RECEIPT_TABS.map(([id, label]) => <button type="button" key={id} className="piw-section-btn" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>
    <section className="piw-section" aria-label={RECEIPT_TABS.find(([id]) => id === tab)?.[1]}>
      {tab === 'overview' ? <><div className="demo-receipt-metrics"><p><strong>{investigation.sources.length}</strong> lens receipts</p><p><strong>{investigation.accounting.declared_origins}</strong> distinct declared origins in lens</p><p><strong>{p.counts.distinct_dependency_groups}</strong> dependency groups across universe</p><p><strong>{p.counts.distinct_collections}</strong> private collections</p></div>
        <p>Memberships are not distinct objects. Globally: 93 origin declarations / 32 origin groups; 93 dependency declarations / 80 dependency groups; 93 memberships / 3 collections.</p>
        <div className="demo-capability-grid">{CAPABILITY_FAMILIES.map(([label, names]) => <details key={label} className="piw-card" data-capability={label}><summary><strong>{label}</strong><span>{[...new Set(rows.flatMap(row => names.map(name => pretty(row.stages[name].state))))].join(' · ')}</span></summary>{show(names)}</details>)}</div></> : null}
      {tab === 'changed' ? <><h2>What Changed</h2><p>No baseline comparison can be performed. This does not mean “unchanged.”</p>{show(['review', 'review_baseline', 'review_current', 'review_prior', 'what_changed', 'historical_current', 'versions', 'versioned_states', 'rejected', 'deferred'])}</> : null}
      {tab === 'hypotheses' ? <><h2>Hypotheses &amp; linked assessments</h2>{show(['hypotheses', 'assessments', 'assumptions', 'strengthening_evidence', 'weakening_evidence', 'discriminating_evidence', 'unresolved_alternatives', 'linked_assessments', 'assessment_dependencies'])}</> : null}
      {tab === 'commitments' ? <><h2>Commitments</h2><StatusBanner>Unavailable. No native commitment, promised outcome, stage or follow-up record was supplied. A policy proposal or synopsis does not establish a commitment or its fulfillment.</StatusBanner>{show(['events', 'relationships', 'attributed_statements'])}</> : null}
      {tab === 'gaps' ? <><h2>Evidence Gaps</h2>{show(['evidence_gaps', 'exact_evidence', 'entities', 'unresolved_identity_candidates', 'candidate_relationships', 'withheld_artifacts', 'admission'])}</> : null}
      {tab === 'source-history' ? <><h2>Source History</h2><p>Native article/capture grouping over receipt references only. One capture per source is known here. Full history, prior versions and live currentness are unavailable.</p>{show(['source_history', 'source_history_items', 'saved_states', 'versioned_states', 'historical_current'])}
        <BoundedRecords items={p.history.sources.filter(source => source.captures.some(input => ids.has(input.capture.id)))} label="source-history identities" renderItem={item => <details key={item.articleId} className="piw-card"><summary>Article {item.articleId} · {item.captures.length} capture reference</summary>{item.captures.map(input => { const source = sources.find(source => source.capture_id === input.capture.id); return source ? <div key={input.capture.id}><button onClick={() => onSelect(source)}>Select source</button><ReceiptIdentity source={source} row={byCapture.get(source.capture_id)} /></div> : null })}</details>} /></> : null}
      {tab === 'source-links' ? <><h2>Source Links</h2>{show(['source_links', 'canonical_private_links', 'source_lineage', 'dependency_lineage'])}<BoundedRecords items={sources} label="source links" renderItem={source => <ReceiptIdentity key={source.capture_id} source={source} row={byCapture.get(source.capture_id)} />} /></> : null}
      {tab === 'evidence-checks' ? <><h2>Evidence Checks</h2><p>These are blocked check-status records, not successful saved checks.</p>{show(['evidence_checks', 'evidence_check_records', 'contradiction_candidates', 'correction_candidates', 'accepted_relationships_by_type'])}<BoundedRecords items={rows} label="check-status records" renderItem={row => <p key={row.capture_id} className="piw-mono">{row.capture_id}: hash check not run · span check not run · exact field unavailable</p>} /></> : null}
      {tab === 'search-coverage' ? <><h2>Cross-investigation discovery</h2><ReceiptSearchCoverage universe={universe} /><p>{p.discovery.examined_pairs} unordered receipt pairs structurally enumerated; {p.discovery.cross_investigation_pairs} cross-investigation pairs. Zero accepted semantic bridges. Semantic discovery is blocked.</p>{show(['search_coverage', 'search_coverage_records', 'cross_investigation_discovery', 'cross_investigation_identity_continuity', 'cross_investigation_candidate_relationships', 'cross_investigation_accepted_relationships'])}</> : null}
    </section>
  </div>
}

export function ReceiptComparison({ universe, investigation, selected, onSelect }) {
  const [outlet, setOutlet] = useState('all')
  const outlets = [...new Set(investigation.sources.map(source => source.outlet))].sort()
  const sources = investigation.sources.filter(source => outlet === 'all' || source.outlet === outlet)
  const byId = new Map(universe.propagation.sourceReceipts.map(row => [row.capture_id, row]))
  return <div className="demo-native-view"><p className="demo-eyebrow">Source Comparison</p><h2>Pending candidate comparison</h2>
    <StatusBanner>{investigation.sources.length} pending candidates across {outlets.length} outlet labels in this lens. Native event membership and exact claim text are unavailable. Multi-outlet presence is not independence.</StatusBanner>
    <label className="demo-outlet-select">Outlet coverage <select aria-label="Outlet coverage" value={outlet} onChange={event => setOutlet(event.target.value)}><option value="all">All outlet labels ({outlets.length})</option>{outlets.map(name => <option key={name}>{name}</option>)}</select></label>
    <p>{sources.length} candidate references shown. Shared / unique / presence / absence: unknown. No omission or corroboration is inferred.</p>
    <div className="demo-candidate-grid">{sources.map(source => { const row = byId.get(source.capture_id); return <article className="piw-card" key={source.candidate_id} data-candidate-id={source.candidate_id} data-selected={selected?.capture_id === source.capture_id}>
      <header><h3>{source.outlet}</h3><button onClick={() => onSelect(source)}>Select candidate</button></header><p>{source.title}</p><p className="piw-mono">Candidate {source.candidate_id}</p>
      <p><strong>Exact claim text unavailable.</strong> No synopsis is substituted.</p>
      <dl className="ws-inspector-dl"><div><dt>Source membership</dt><dd>{source.article_id} / {source.capture_id}</dd></div><div><dt>Collection membership</dt><dd>{source.topic}; native comparison event unavailable</dd></div><div><dt>Shared / unique / present / absent</dt><dd>Unknown / unknown / unknown / unknown</dd></div><div><dt>Declared lineage</dt><dd>{source.origin_id ?? 'Unresolved'} · unverified</dd></div><div><dt>Declared dependency</dt><dd>{source.dependency_id ?? 'Unresolved'} · unverified</dd></div><div><dt>Publication timestamp</dt><dd>{source.published_at ?? 'Unavailable'}</dd></div><div><dt>Source date only</dt><dd>{source.source_date} · {source.publication_precision}</dd></div><div><dt>Framing / attribution / exact scope</dt><dd>Not run / blocked / unavailable</dd></div></dl>
      <RemainingUncertaintyBlock>{source.remaining_uncertainty}</RemainingUncertaintyBlock>
      <details><summary>Provenance &amp; explanation</summary><ReceiptIdentity source={source} row={row} /><ReceiptStageStatus rows={[row]} names={['shared_unique_claims', 'outlet_framing', 'attributed_statements', 'exact_evidence']} /></details>
    </article> })}</div>
  </div>
}

export function ReceiptTimeline({ universe, investigation, selected, onSelect }) {
  const sources = new Map(investigation.sources.map(source => [source.capture_id, source]))
  const items = universe.propagation.timeline.filter(item => sources.has(item.capture_id)).sort((a, b) => a.source_date.localeCompare(b.source_date))
  const dated = new Set(items.map(item => item.capture_id))
  const unavailableSources = investigation.sources.filter(source => !dated.has(source.capture_id))
  return <div className="demo-native-view"><p className="demo-eyebrow">Timeline</p><h2>Source-date chronology</h2><StatusBanner>Universe: 92 source-date-only items; one precise date unavailable. No publication timestamp or event time is substituted.</StatusBanner><p>This lens: {items.length} dated source items; {unavailableSources.length} precise dates unavailable.</p>
    <ol className="demo-receipt-timeline">{items.map(item => { const source = sources.get(item.capture_id); const date = retainedDateDisplay(item.source_date); return <li key={item.capture_id}><time dateTime={date.dateTime}>{date.label}</time><button data-selected={selected?.capture_id === item.capture_id} onClick={() => onSelect(source)}>{source.title}<small>{source.outlet} · source date only; event identity unavailable</small></button></li> })}</ol>
    {unavailableSources.length ? <section className="piw-card"><h3>Precise date unavailable</h3>{unavailableSources.map(source => <p key={source.capture_id}><button onClick={() => onSelect(source)}>{source.title}</button> · retained value {source.source_date}; no day invented.</p>)}</section> : null}
  </div>
}
