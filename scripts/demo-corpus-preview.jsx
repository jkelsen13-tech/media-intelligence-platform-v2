import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowSquareOut, CheckCircle, Fingerprint, GitFork, LockKey, MagnifyingGlass, ShieldCheck, X } from '@phosphor-icons/react'
import InvestigationWorkspace, { WorkspaceAccountButton, WorkspaceInfoButton, WorkspaceNavButton, WorkspaceSearch } from '../src/components/InvestigationWorkspace.jsx'
import GraphView from '../src/graph/GraphView.jsx'
import { WORKSPACE_NAV_ITEMS } from '../src/lib/workspaceShell.js'
import { createDemoUniverse, demoLens, graphForLens, searchDemoUniverse, switchDemoLens, parseDemoRoute, serializeDemoRoute } from './demoCorpus.mjs'
import { ReceiptWorkspace, ReceiptComparison, ReceiptTimeline, ReceiptIdentity, ReceiptStageStatus, ReceiptSearchCoverage } from './demoReceiptWorkspace.jsx'
import { createDemoSession } from './demoSession.mjs'
import { loadPrivateReplay, replayGraph, replaySearchHint } from './privateReplayClient.mjs'
import { ReplayComparison, ReplayWorkspace, ReplayEvidence, ReplayEvidenceLedger, ReplayClusterDetails } from './nativeReplayWorkspace.jsx'
import receipts from '../verifier/demo-corpus-20260916/retained-source-receipts.json' with { type: 'json' }
import expandedReceipts from '../verifier/demo-corpus-20260916/expanded-source-receipts.json' with { type: 'json' }
import '../src/index.css'
import './demo-corpus-preview.css'

document.documentElement.dataset.theme = 'light'

const universe = createDemoUniverse([...receipts, ...expandedReceipts], { requireComplete: true })
const investigations = [demoLens(universe), ...universe.investigations]
const allSources = universe.sources
const session = createDemoSession()
const topicMeta = Object.freeze({
  all: { name: 'All investigations', description: 'One shared universe of 93 retained records. Investigations are discovery lenses; membership is not a relationship.' },
  iran: { name: 'US–Iran', description: 'Retained public records concerning U.S.–Iran policy, diplomacy, conflict reporting, and oversight.' },
  epstein: { name: 'Epstein disclosure/oversight', description: 'Retained disclosure, court, legislative, and institutional oversight records.' },
  project2025: { name: 'Project 2025', description: 'Retained proposal, administrative action, legal review, and implementation-context records.' },
})
const routeToView = Object.freeze({ context: 'investigations', evidence: 'investigations', news: 'news', compare: 'compare', graph: 'graph', timeline: 'timeline', arc: 'arcs', world: 'world' })
const viewToRoute = Object.freeze({ investigations: 'context', news: 'news', compare: 'compare', graph: 'graph', timeline: 'timeline', arcs: 'arc', world: 'world' })
const DEMO_NAV_ITEMS = WORKSPACE_NAV_ITEMS.filter((item) => item.key !== 'phase3')
const shortId = (value) => value ? `${value.slice(0, 8)}…${value.slice(-4)}` : 'Not recorded'
const pretty = (value) => String(value ?? 'not recorded').replaceAll('_', ' ')
const titleForTopic = (topic) => topicMeta[topic]?.name ?? topicMeta.iran.name
const readRoute = () => parseDemoRoute(window.location.hash, allSources)

function writeRoute(topic, surface, capture = null) {
  const next = serializeDemoRoute({ topic, surface, capture }, allSources)
  if (window.location.hash !== next) window.location.hash = next
}

function PendingBadge({ children = 'Pending review' }) {
  return <span className="demo-status"><span aria-hidden="true" />{children}</span>
}

function DemoBoundaryNote({ compact = false }) {
  return <div className={`demo-boundary${compact ? ' demo-boundary--compact' : ''}`}><LockKey size={16} weight="duotone" /><span><strong>Private demonstration.</strong> Retained evidence only; no record is admitted, canonical, or publishable.</span></div>
}

function SourceCard({ source, selected, onSelect }) {
  return <button type="button" className={`demo-source-card${selected ? ' selected' : ''}`} onClick={() => onSelect(source)} data-capture-id={source.capture_id}>
    <span className="demo-source-card__top"><span className="demo-source-card__outlet">{source.outlet}</span><time>{source.source_date ?? 'Date not recorded'}</time></span>
    <span>Source update unavailable — no update timestamp supplied; capture or verification time cannot substitute.</span><strong>{source.title}</strong><span className="demo-source-card__synopsis">Synopsis: {source.statement}</span>
    <span className="demo-source-card__meta"><span>{titleForTopic(source.topic)} · {pretty(source.semantic_kind)}</span><span>Capture {shortId(source.capture_id)}</span></span>
  </button>
}

function ProvenanceInspector({ source, investigation, surface, onOpenEvidence, privateReplay }) {
  if (!source) return <div className="demo-inspector-empty"><h2>{titleForTopic(investigation.topic)}</h2><p className="ws-nav-note">The same private research collection, in every view.</p><section><h3>Recorded context</h3><dl className="ws-inspector-dl"><div><dt>Subject type</dt><dd>Research collection</dd></div><div><dt>Location</dt><dd>Not recorded</dd></div><div><dt>Review</dt><dd>Pending</dd></div></dl></section><section><h3>Reading the evidence</h3><p>Select a retained source to inspect its capture, candidate, exact-span coordinates, hash, dependency, rights note, and uncertainty.</p><p className="ws-guidance"><ShieldCheck size={16} /> Missing evidence is not a contradiction. Publication date is not event time.</p></section></div>
  if (privateReplay) return <ReplayEvidence candidate={privateReplay.candidates.find(c=>c.capture_id===source.capture_id)} />
  return <div className="demo-provenance" data-selected-capture={source.capture_id}><PendingBadge /><h2>{source.title}</h2><p className="demo-inspector-synopsis"><strong>Synopsis:</strong> {source.statement}</p>
    <button type="button" className="demo-native-link" onClick={onOpenEvidence}><Fingerprint size={15} /> {surface === 'evidence' ? 'Evidence identity open' : 'Inspect evidence identity'}</button>
    <section className="demo-evidence-frame"><span>Exact retained evidence identity</span><strong>Code points [{source.span_start}, {source.span_end})</strong><p>The frozen receipts retain the exact coordinates and content hash, but not the excerpt body. The synopsis above is not presented as a quotation.</p></section>
    <details className="ws-provenance" open={surface === 'evidence'}><summary>Provenance identifiers &amp; history</summary><dl className="ws-inspector-dl demo-id-list"><div><dt>Article</dt><dd>{source.article_id}</dd></div><div><dt>Capture</dt><dd>{source.capture_id}</dd></div><div><dt>Candidate</dt><dd>{source.candidate_id}</dd></div><div><dt>Content SHA-256</dt><dd>{source.content_hash}</dd></div><div><dt>Origin</dt><dd>{source.origin_id ?? 'Unresolved'}</dd></div><div><dt>Dependency</dt><dd>{source.dependency_id ?? 'Unresolved'}</dd></div><div><dt>Source date only</dt><dd>{source.source_date ?? 'Not recorded'} · {source.publication_precision}</dd></div><div><dt>Source update timestamp</dt><dd>Unavailable — no update timestamp supplied; capture or verification time cannot substitute.</dd></div><div><dt>Rights note</dt><dd>{source.rights}</dd></div></dl></details>
    <section><h3>Remaining uncertainty</h3><p>{source.remaining_uncertainty}</p></section><a className="demo-native-link" href={source.url} target="_blank" rel="noreferrer">Open original source <ArrowSquareOut size={14} /></a></div>
}


function SourceFeed({ investigation, query, selected, onSelect, onOpenEvidence }) {
  const sources = query.trim() ? searchDemoUniverse(universe, query).map(result => result.source) : investigation.sources
  const selectedRef = useRef(null)
  useEffect(() => { if (selected && window.matchMedia?.('(max-width: 767px)').matches) selectedRef.current?.scrollIntoView({ block: 'start' }) }, [selected?.capture_id])
  return <div className="demo-native-view demo-feed" ref={selectedRef}><div className="demo-view-heading"><div><p className="demo-eyebrow">News</p><h2>Retained source feed</h2><p>{sources.length} of {query.trim() ? allSources.length : investigation.sources.length} private records</p></div><PendingBadge>All pending</PendingBadge></div><DemoBoundaryNote compact /><ReceiptSearchCoverage universe={universe} query={query} /><div className="demo-filter-row" aria-label="Discovery filters"><span><MagnifyingGlass size={14} /> Search spans all 93 records · investigation membership shown</span><span>Review: Pending</span><span>Geography: Withheld</span></div>{selected && <section className="demo-mobile-selection"><p className="demo-eyebrow">Selected retained source</p><h3>{selected.title}</h3><p>Capture {shortId(selected.capture_id)} · candidate {shortId(selected.candidate_id)}</p><button type="button" className="demo-native-link" onClick={onOpenEvidence}><Fingerprint size={15} /> Open provenance and exact-span identity</button></section>}{sources.length ? <div className="demo-source-grid">{sources.map((source) => <SourceCard key={source.capture_id} source={source} selected={selected?.capture_id === source.capture_id} onSelect={onSelect} />)}</div> : <div className="demo-honest-empty"><h3>No matching retained sources</h3><p>The search remains local and does not query production.</p></div>}</div>
}

function EvidenceLedger({ investigation, selected, onSelect }) {
  const rows = universe.propagation.sourceReceipts.filter(row => investigation.sources.some(source => source.capture_id === row.capture_id))
  const row = selected ? rows.find(row => row.capture_id === selected.capture_id) : null
  return <div className="demo-native-view"><p className="demo-eyebrow">Evidence</p><h2>Pending candidate evidence ledger</h2><DemoBoundaryNote />
    <p>93 exact-field checks blocked globally. Coordinates identify recorded evidence; bytes are unavailable for verification. No synopsis is used as exact claim text.</p>
    {selected ? <ReceiptIdentity source={selected} row={row} /> : <p>Select a candidate to inspect its full receipt metadata and 60-stage accounting.</p>}
    {row ? <details className="piw-card"><summary>All 60 propagation stage receipts for this source</summary><ReceiptStageStatus rows={[row]} names={Object.keys(row.stages)} /></details> : null}
    <div className="demo-source-grid">{investigation.sources.map(source => <button key={source.candidate_id} className="demo-source-card" aria-pressed={selected?.capture_id === source.capture_id} onClick={() => onSelect(source)}><strong>{source.title}</strong><span>{source.outlet}</span><span>Candidate {source.candidate_id}</span><span>Code points [{source.span_start}, {source.span_end}) · pending · exact text unavailable</span></button>)}</div>
  </div>
}


function NativeGraph({ investigation, selected, onSelect, privateReplay }) {
  const [originId, setOriginId] = useState(null)
  const [clusterId, setClusterId] = useState(null)
  const [showIsolated, setShowIsolated] = useState(false)
  const [graphQuery, setGraphQuery] = useState('')
  const origin = universe.sharedProvenance.find(item => item.id === originId)
  const fullGraph = useMemo(() => privateReplay ? replayGraph(privateReplay, investigation.sources) : graphForLens(universe, investigation.topic === 'all' ? undefined : [investigation.topic]), [investigation, privateReplay])
  const visibleClusters = useMemo(() => privateReplay?.clusters.filter(c=>fullGraph.nodes.some(n=>n.id===c.id)) ?? [], [privateReplay, fullGraph])
  const connectedIds = useMemo(() => new Set(fullGraph.edges.flatMap(edge => [edge.source, edge.target])), [fullGraph])
  const graphNodes = useMemo(() => fullGraph.nodes.filter(node => showIsolated || connectedIds.has(node.id) || node.id === selected?.preview_id), [fullGraph, showIsolated, connectedIds, selected?.preview_id])
  const byId = useMemo(() => new Map(universe.sources.map(source => [source.preview_id, source])), [])
  const selectGraphNode = useCallback(node => { if (visibleClusters.some(c=>c.id===node?.id)) { setClusterId(node.id); return }; setClusterId(null); if (node?.type === 'declared_origin_identity') setOriginId(node.id); else if (byId.has(node?.id)) onSelect(byId.get(node.id)) }, [visibleClusters, byId, onSelect])
  const results = graphQuery.trim() ? searchDemoUniverse(universe, graphQuery).map(result => result.source) : []
  return <div className="demo-native-view demo-graph-view"><div className="demo-view-heading"><div><p className="demo-eyebrow">Graph</p><h2>{privateReplay ? 'Pending analytical candidate structures' : 'Shared declared-provenance structures'}</h2><p>{privateReplay ? 'Native lexical and unresolved entity-overlap clusters plus dependency evidence. All candidate structures are pending; none are accepted events, relationships or corroboration.' : 'Universe: 17 connected capture-to-provenance edges and two declared-provenance nodes. These are not actors, substantive relationships or corroboration.'}</p></div></div><DemoBoundaryNote compact />
    <div className="demo-graph-tools"><label><input type="checkbox" checked={showIsolated} onChange={event => setShowIsolated(event.target.checked)} /> Show isolated receipt nodes</label><label>Find any retained capture <input aria-label="Find graph capture" value={graphQuery} onChange={event => setGraphQuery(event.target.value)} placeholder="Search all 93 receipt records" /></label></div>
    <p>{graphNodes.length} nodes displayed · {fullGraph.edges.length} {privateReplay ? 'pending analytical candidate' : 'declared-provenance'} edges in this lens. Isolated receipts remain selectable through search.</p>
    {graphQuery.trim() ? <div className="demo-graph-results">{results.length ? results.map(source => <button key={source.capture_id} onClick={() => { onSelect(source); setGraphQuery('') }}>{source.title} · {source.topic}</button>) : <p>No matching receipt metadata in the bounded 93-record universe. Exact text was not searched.</p>}</div> : null}
    <div className="demo-provenance-legend"><span>{privateReplay ? 'Analytical candidates (pending / unverified)' : 'Receipt-declared provenance (unverified)'} · dashed, no arrows · not substantive evidence</span>{fullGraph.nodes.filter(node => node.type === 'declared_origin_identity').map(node => <button key={node.id} onClick={() => setOriginId(node.id)}>Inspect declared provenance {node.id}</button>)}</div>
    <div className="demo-graph-stage" data-graph-node-count={graphNodes.length} data-graph-edge-count={fullGraph.edges.length}><GraphView nodes={graphNodes} edges={fullGraph.edges} selectedId={clusterId ?? selected?.preview_id ?? null} onSelect={selectGraphNode} panelOpen={false} focused /></div>
    {privateReplay ? <ReplayClusterDetails replay={privateReplay} clusters={visibleClusters} selectedId={clusterId} onSelectCluster={setClusterId} sources={universe.sources} onSelectSource={source=>{setClusterId(null);onSelect(source)}} /> : null}
    {origin ? <Modal title={`Declared provenance: ${origin.label}`} onClose={() => setOriginId(null)}><p>{origin.reasoning}</p><p>Investigation membership: {origin.memberships.map(titleForTopic).join(' · ')}</p><div className="demo-source-grid">{universe.sources.filter(source => origin.captures.includes(source.capture_id)).map(source => <SourceCard key={source.capture_id} source={source} onSelect={item => { setOriginId(null); onSelect(item) }} />)}</div></Modal> : null}
  </div>
}


function ResearchCollection({ investigation, onSelect }) {
  const collections = universe.propagation.collections.filter(collection => investigation.topic === 'all' || collection.id === investigation.arc.id)
  const byId = new Map(universe.sources.map(source => [source.preview_id, source]))
  return <div className="demo-native-view"><p className="demo-eyebrow">Arcs / Collections</p><h2>Private research collections</h2><p>{collections.length} distinct collections in this lens. Research membership is not an approved narrative arc; no canonical arc or causal sequence is supplied.</p><DemoBoundaryNote compact />
    {collections.map(collection => <article key={collection.id} className="demo-native-panel demo-collection"><header><div><h3>{collection.id}</h3><p>{collection.members.length} retained capture memberships · narrative arc unavailable</p></div></header><ol>{collection.members.map((id, index) => { const source = byId.get(id); return <li key={id}><button onClick={() => onSelect(source)}><span>{index + 1}</span><span><strong>{source.title}</strong><small>{source.outlet} · {source.source_date} (source date only); source update unavailable — no update timestamp supplied; capture or verification time cannot substitute.</small></span></button></li> })}</ol></article>)}
  </div>
}

function WorldUnavailable() {
  return <div className="demo-native-view demo-world-empty"><div className="demo-honest-empty"><ShieldCheck size={28} /><p className="demo-eyebrow">World View</p><h2>Geographic projection intentionally unavailable</h2><p>No reviewed event-place assertion exists for this retained collection. Geographic mentions are not projected as event locations.</p><span>Investigation context remains selected.</span></div></div>
}

function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const trigger = document.activeElement
    ref.current?.querySelector('button')?.focus()
    return () => { if (trigger?.isConnected) trigger.focus() }
  }, [])
  const handleKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const items = [...ref.current.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(item => item.getClientRects().length)
    const first = items[0], last = items.at(-1)
    if (!first) { event.preventDefault(); ref.current.focus() }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  return <div className="sheet-backdrop" onClick={onClose}><div ref={ref} tabIndex={-1} className="sheet demo-sheet" role="dialog" onKeyDown={handleKeyDown} aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}><div className="sheet-head"><h2>{title}</h2><button type="button" className="sheet-close" aria-label="Close" onClick={onClose}><X size={18} /></button></div>{children}</div></div>
}

function NativeDemoApp() {
  const [privateReplay, setPrivateReplay] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    loadPrivateReplay(allSources, fetch, {signal:controller.signal}).then(replay => { if(!controller.signal.aborted)setPrivateReplay(replay) })
    return () => controller.abort()
  }, [])
  const initial = readRoute(), [route, setRoute] = useState(initial), [query, setQuery] = useState(''), [exploreOpen, setExploreOpen] = useState(false), [aboutOpen, setAboutOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false)
  useEffect(() => { const update = () => setRoute(readRoute()); window.addEventListener('hashchange', update); const canonical = serializeDemoRoute(initial, allSources); if (window.location.hash !== canonical) window.location.hash = canonical; return () => window.removeEventListener('hashchange', update) }, [])
  const investigation = useMemo(() => demoLens(universe, route.topic), [route.topic])
  const selected = investigation.sources.find((source) => source.capture_id === route.capture) ?? null
  const view = routeToView[route.surface] ?? 'investigations'
  const header = { eyebrow: 'Investigation workspace · private demonstration', title: titleForTopic(route.topic), location: 'Location not recorded', when: 'Document dates only', description: topicMeta[route.topic].description, dimensions: [{ key: 'evidence', label: 'Evidence strength', value: 'Not recorded', tone: 'unavailable' }, { key: 'reliability', label: 'Source reliability', value: 'Not recorded', tone: 'unavailable' }, { key: 'demo-presentation', label: 'Access context', value: session.presentationLabel, tone: 'unavailable' }, { key: 'review', label: 'Review status', value: 'Pending', tone: 'unavailable' }, { key: 'uncertainty', label: 'Remaining uncertainty', value: 'Recorded per source', tone: 'unavailable' }] }
  const investigationContext = { canonical_subject_type: null, canonical_subject_id: null, parent_event_id: null, as_of_time: null, selected_time_range: null, active_view: view, temporal_assessment_reference: null }
  const openView = (nextView) => writeRoute(route.topic, viewToRoute[nextView] ?? 'context', selected?.capture_id ?? null)
  const selectSource = useCallback((source) => { if(source)writeRoute(route.topic === 'all' || route.topic === source.topic ? route.topic : 'all', route.surface, source.capture_id) }, [route.topic, route.surface])
  const chooseInvestigation = (topic) => { setQuery(''); setExploreOpen(false); const next = switchDemoLens(route, topic, universe); writeRoute(next.topic, next.surface, next.capture) }
  let content
  if (view === 'world') content = <WorldUnavailable />
  else if (route.surface === 'context') content = privateReplay ? <ReplayWorkspace replay={privateReplay} investigation={investigation} selected={selected} /> : <ReceiptWorkspace universe={universe} investigation={investigation} selected={selected} onSelect={selectSource} />
  else if (route.surface === 'news') content = <SourceFeed investigation={investigation} query={query} selected={selected} onSelect={selectSource} onOpenEvidence={() => writeRoute(route.topic, 'evidence', selected?.capture_id ?? null)} />
  else if (route.surface === 'evidence') content = privateReplay ? <ReplayEvidenceLedger replay={privateReplay} investigation={investigation} selected={selected} onSelect={selectSource} /> : <EvidenceLedger investigation={investigation} selected={selected} onSelect={selectSource} />
  else if (route.surface === 'compare') content = privateReplay ? <ReplayComparison key={route.topic} replay={privateReplay} investigation={investigation} selected={selected} onSelect={selectSource} /> : <ReceiptComparison key={route.topic} universe={universe} investigation={investigation} selected={selected} onSelect={selectSource} />
  else if (route.surface === 'graph') content = <NativeGraph investigation={investigation} selected={selected} onSelect={selectSource} privateReplay={privateReplay} />
  else if (route.surface === 'timeline') content = <ReceiptTimeline universe={universe} investigation={investigation} selected={selected} onSelect={selectSource} />
  else content = <ResearchCollection investigation={investigation} onSelect={selectSource} />
  return <div className="app ws-app demo-native-app"><InvestigationWorkspace view={view} onChangeView={openView} investigationContext={investigationContext} header={header} selectedChild={selected ? { label: selected.title } : null} hasNativeInspector={false} onChangeInvestigation={() => setExploreOpen(true)} corpusLine="Private corpus — 93 retained — all pending" searchSlot={<WorkspaceSearch searchLabel="Search all 93 receipt metadata records" searchHint={replaySearchHint(privateReplay)} exploreOpen={exploreOpen} onOpenExplore={() => setExploreOpen(true)} dialogId="demo-explore" query={query} onQueryChange={(value) => { setQuery(value); if (route.surface !== 'news') writeRoute(route.topic, 'news', selected?.capture_id ?? null) }} />} accountSlot={<WorkspaceAccountButton enabled label={session.displayName} title={`${session.presentationLabel} · ${session.displayName}`} onClick={() => setAccountOpen(true)} />} infoSlot={<WorkspaceInfoButton onClick={() => setAboutOpen(true)} />} leftNav={<>{DEMO_NAV_ITEMS.map((item) => <WorkspaceNavButton key={item.key} item={item} active={view === item.key} onClick={() => openView(item.key)} />)}</>} inspectorSlot={<ProvenanceInspector privateReplay={privateReplay} source={selected} investigation={investigation} surface={route.surface} onOpenEvidence={() => writeRoute(route.topic, 'evidence', selected?.capture_id ?? null)} />} inspectorSelection={selected} details={<details className="ws-details"><summary>Investigation details &amp; demo boundary</summary><div className="demo-details"><DemoBoundaryNote /><p>Static build-time provider · no Supabase client · no production backend · no admission or publication operation.</p><p>Selected collection: {titleForTopic(route.topic)} · {investigation.sources.length} pending records.</p></div></details>}><main className="app-main">{content}</main></InvestigationWorkspace>
    {exploreOpen && <Modal title="Explore / Change investigation" onClose={() => setExploreOpen(false)}><div id="demo-explore" className="demo-investigation-picker"><p>Choose a lens over the shared corpus. Selection persists wherever it belongs to the chosen lens.</p>{investigations.map((item) => <button type="button" key={item.topic} className={item.topic === route.topic ? 'active' : ''} onClick={() => chooseInvestigation(item.topic)}><span><strong>{titleForTopic(item.topic)}</strong><small>{topicMeta[item.topic].description}</small></span><span>{item.sources.length}</span></button>)}</div></Modal>}
    {aboutOpen && <Modal title="Media Intelligence Platform" onClose={() => setAboutOpen(false)}><div className="sheet-body"><DemoBoundaryNote /><p>This September 22 preview uses the native MIP investigation shell with an isolated static provider. It contains no production transport or mutation path.</p></div></Modal>}
    {accountOpen && <Modal title={`${session.presentationLabel} · ${session.displayName}`} onClose={() => setAccountOpen(false)}><div className="sheet-body"><p><CheckCircle size={18} /> {session.displayName} · private demo presentation</p><p>Authentication must be enforced by the private host for every page and asset. This presentation session is not a credential and cannot authorize backend actions.</p></div></Modal>}
  </div>
}

createRoot(document.getElementById('root')).render(<NativeDemoApp />)
