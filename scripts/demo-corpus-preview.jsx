import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowSquareOut, CheckCircle, Fingerprint, GitFork, LockKey, MagnifyingGlass, ShieldCheck, X } from '@phosphor-icons/react'
import InvestigationWorkspace, { WorkspaceAccountButton, WorkspaceInfoButton, WorkspaceNavButton, WorkspaceSearch } from '../src/components/InvestigationWorkspace.jsx'
import GraphView from '../src/graph/GraphView.jsx'
import { WORKSPACE_NAV_ITEMS } from '../src/lib/workspaceShell.js'
import { createDemoUniverse, demoLens, graphForLens, searchDemoUniverse, switchDemoLens, parseDemoRoute, serializeDemoRoute } from './demoCorpus.mjs'
import { createDemoSession } from './demoSession.mjs'
import receipts from '../verifier/demo-corpus-20260916/retained-source-receipts.json'
import expandedReceipts from '../verifier/demo-corpus-20260916/expanded-source-receipts.json'
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
    <strong>{source.title}</strong><span className="demo-source-card__synopsis">Synopsis: {source.statement}</span>
    <span className="demo-source-card__meta"><span>{titleForTopic(source.topic)} · {pretty(source.semantic_kind)}</span><span>Capture {shortId(source.capture_id)}</span></span>
  </button>
}

function ProvenanceInspector({ source, investigation, surface, onOpenEvidence }) {
  if (!source) return <div className="demo-inspector-empty"><h2>{titleForTopic(investigation.topic)}</h2><p className="ws-nav-note">The same private research collection, in every view.</p><section><h3>Recorded context</h3><dl className="ws-inspector-dl"><div><dt>Subject type</dt><dd>Research collection</dd></div><div><dt>Location</dt><dd>Not recorded</dd></div><div><dt>Review</dt><dd>Pending</dd></div></dl></section><section><h3>Reading the evidence</h3><p>Select a retained source to inspect its capture, candidate, exact-span coordinates, hash, dependency, rights note, and uncertainty.</p><p className="ws-guidance"><ShieldCheck size={16} /> Missing evidence is not a contradiction. Publication date is not event time.</p></section></div>
  return <div className="demo-provenance" data-selected-capture={source.capture_id}><PendingBadge /><h2>{source.title}</h2><p className="demo-inspector-synopsis"><strong>Synopsis:</strong> {source.statement}</p>
    <button type="button" className="demo-native-link" onClick={onOpenEvidence}><Fingerprint size={15} /> {surface === 'evidence' ? 'Evidence identity open' : 'Inspect evidence identity'}</button>
    <section className="demo-evidence-frame"><span>Exact retained evidence identity</span><strong>Code points [{source.span_start}, {source.span_end})</strong><p>The frozen receipts retain the exact coordinates and content hash, but not the excerpt body. The synopsis above is not presented as a quotation.</p></section>
    <details className="ws-provenance" open={surface === 'evidence'}><summary>Provenance identifiers &amp; history</summary><dl className="ws-inspector-dl demo-id-list"><div><dt>Article</dt><dd>{source.article_id}</dd></div><div><dt>Capture</dt><dd>{source.capture_id}</dd></div><div><dt>Candidate</dt><dd>{source.candidate_id}</dd></div><div><dt>Content SHA-256</dt><dd>{source.content_hash}</dd></div><div><dt>Origin</dt><dd>{source.origin_id ?? 'Unresolved'}</dd></div><div><dt>Dependency</dt><dd>{source.dependency_id ?? 'Unresolved'}</dd></div><div><dt>Publication basis</dt><dd>{source.source_date ?? 'Not recorded'} · {source.publication_precision}</dd></div><div><dt>Rights note</dt><dd>{source.rights}</dd></div></dl></details>
    <section><h3>Remaining uncertainty</h3><p>{source.remaining_uncertainty}</p></section><a className="demo-native-link" href={source.url} target="_blank" rel="noreferrer">Open original source <ArrowSquareOut size={14} /></a></div>
}

function InvestigationContext({ investigation, onOpenSources, onOpenEvidence }) {
  const dates = investigation.sources.map((source) => source.source_date).filter(Boolean).sort()
  return <div className="demo-native-view demo-context-view"><DemoBoundaryNote /><section className="demo-context-grid" aria-label="Investigation context"><article className="demo-native-panel demo-context-primary"><p className="demo-eyebrow">Investigation context</p><h2>Evidence before admission</h2><p>This native MIP workspace is populated by an isolated, static projection of retained source and candidate receipts. It is not accepted knowledge or a publication surface.</p><div className="demo-guardrails"><span>Candidate ≠ accepted claim</span><span>Publication date ≠ event time</span><span>Co-mention ≠ relationship</span><span>Repetition ≠ corroboration</span></div></article><article className="demo-native-panel demo-metric"><strong>{investigation.sources.length}</strong><span>retained sources</span></article><article className="demo-native-panel demo-metric"><strong>{investigation.accounting.independent_origins}</strong><span>declared origins</span></article><article className="demo-native-panel demo-metric"><strong>{investigation.dependencyGroups.length}</strong><span>dependency groups</span></article><article className="demo-native-panel demo-context-date"><p className="demo-eyebrow">Document coverage</p><strong>{dates[0]} – {dates.at(-1)}</strong><span>Publication/source dates only</span></article></section><div className="demo-launch-row"><button type="button" onClick={onOpenSources}>Browse retained sources</button><button type="button" onClick={onOpenEvidence}>Open evidence ledger</button></div></div>
}

function SourceFeed({ investigation, query, selected, onSelect, onOpenEvidence }) {
  const sources = query.trim() ? searchDemoUniverse(universe, query).map(result => result.source) : investigation.sources
  const selectedRef = useRef(null)
  useEffect(() => { if (selected && window.matchMedia?.('(max-width: 767px)').matches) selectedRef.current?.scrollIntoView({ block: 'start' }) }, [selected?.capture_id])
  return <div className="demo-native-view demo-feed" ref={selectedRef}><div className="demo-view-heading"><div><p className="demo-eyebrow">News</p><h2>Retained source feed</h2><p>{sources.length} of {query.trim() ? allSources.length : investigation.sources.length} private records</p></div><PendingBadge>All pending</PendingBadge></div><DemoBoundaryNote compact /><div className="demo-filter-row" aria-label="Discovery filters"><span><MagnifyingGlass size={14} /> Search spans all 93 records · investigation membership shown</span><span>Review: Pending</span><span>Geography: Withheld</span></div>{selected && <section className="demo-mobile-selection"><p className="demo-eyebrow">Selected retained source</p><h3>{selected.title}</h3><p>Capture {shortId(selected.capture_id)} · candidate {shortId(selected.candidate_id)}</p><button type="button" className="demo-native-link" onClick={onOpenEvidence}><Fingerprint size={15} /> Open provenance and exact-span identity</button></section>}{sources.length ? <div className="demo-source-grid">{sources.map((source) => <SourceCard key={source.capture_id} source={source} selected={selected?.capture_id === source.capture_id} onSelect={onSelect} />)}</div> : <div className="demo-honest-empty"><h3>No matching retained sources</h3><p>The search remains local and does not query production.</p></div>}</div>
}

function EvidenceLedger({ investigation, selected, onSelect }) {
  return <div className="demo-native-view"><div className="demo-view-heading"><div><p className="demo-eyebrow">Evidence</p><h2>Exact-span candidate ledger</h2><p>Synopsis and exact retained coordinates remain visibly distinct.</p></div><PendingBadge /></div>{selected && <section className="demo-evidence-selection"><p className="demo-eyebrow">Selected evidence identity</p><h3>{selected.title}</h3><dl><div><dt>Capture</dt><dd>{selected.capture_id}</dd></div><div><dt>Candidate</dt><dd>{selected.candidate_id}</dd></div><div><dt>Exact span</dt><dd>[{selected.span_start}, {selected.span_end})</dd></div><div><dt>SHA-256</dt><dd>{selected.content_hash}</dd></div></dl><p><strong>Rights note:</strong> {selected.rights}</p><p><strong>Remaining uncertainty:</strong> {selected.remaining_uncertainty}</p></section>}<div className="demo-ledger" role="table" aria-label="Pending evidence candidates"><div className="demo-ledger__head" role="row"><span>Source / synopsis</span><span>Exact span</span><span>State</span><span>Identity</span></div>{investigation.sources.map((source) => <button key={source.candidate_id} type="button" role="row" className={selected?.capture_id === source.capture_id ? 'selected' : ''} onClick={() => onSelect(source)}><span><strong>{source.title}</strong><small>Synopsis: {source.statement}</small></span><span>[{source.span_start}, {source.span_end})</span><span>Pending</span><span>{shortId(source.candidate_id)}</span></button>)}</div></div>
}

function ComparisonView({ investigation, onSelect }) {
  const byId = new Map(investigation.sources.map((source) => [source.preview_id, source]))
  const groups = investigation.dependencyGroups.filter((group) => group.members.length > 1)
  return <div className="demo-native-view"><div className="demo-view-heading"><div><p className="demo-eyebrow">Source comparison</p><h2>Dependency-aware comparison</h2><p>No common event identity or independent corroboration is asserted.</p></div></div><DemoBoundaryNote compact />{groups.length ? <div className="demo-compare-grid">{groups.map((group) => <article className="demo-native-panel" key={group.id}><header><div><p className="demo-eyebrow">Receipt-declared dependency</p><h3>{group.id}</h3></div><span>{group.members.length} records</span></header><p className="demo-muted">Dependent material — repetition is not counted as independent corroboration.</p>{group.members.map((id) => <SourceCard key={id} source={byId.get(id)} onSelect={onSelect} />)}</article>)}</div> : <div className="demo-honest-empty"><h3>No defensible comparison pair</h3><p>Individual sources remain available. MIP does not manufacture an event match.</p></div>}</div>
}

function NativeGraph({ investigation, selected, onSelect }) {
  const [originId, setOriginId] = useState(null)
  const origin = universe.sharedProvenance.find(item => item.id === originId)
  const graph = useMemo(() => graphForLens(universe, investigation.topic === 'all' ? undefined : [investigation.topic]), [investigation])
  const byId = useMemo(() => new Map(investigation.sources.map((source) => [source.preview_id, source])), [investigation])
  return <div className="demo-native-view demo-graph-view"><div className="demo-view-heading"><div><p className="demo-eyebrow">Graph</p><h2>Shared evidence graph</h2><p>Union and investigation lenses share capture identities and two evidenced institutional provenance labels. Select a provenance node to explore its records across investigations. Actor identities remain unresolved.</p></div></div><DemoBoundaryNote compact /><div className="demo-graph-legend"><span><i className="capture" /> Retained capture</span><span><i className="origin" /> Shared declared provenance · not an actor</span><span><GitFork size={14} /> No actor, causal, or event-equivalence edges</span></div><div className="demo-graph-stage"><GraphView nodes={graph.nodes} edges={graph.edges} selectedId={selected?.preview_id ?? null} onSelect={(node) => { if (node?.type === 'declared_origin_identity') setOriginId(node.id); else onSelect(byId.get(node?.id) ?? null) }} panelOpen={false} focused /></div>{origin && <Modal title={`Declared provenance: ${origin.label}`} onClose={() => setOriginId(null)}><p>{origin.reasoning}</p><p>Investigation membership: {origin.memberships.map(titleForTopic).join(' · ')}</p><div className="demo-source-grid">{universe.sources.filter(source => origin.captures.includes(source.capture_id)).map(source => <SourceCard key={source.capture_id} source={source} onSelect={(item) => { setOriginId(null); onSelect(item) }} />)}</div></Modal>}</div>
}

function PublicationTimeline({ investigation, selected, onSelect }) {
  const groups = Map.groupBy([...investigation.sources].sort((a, b) => (a.source_date ?? '9999').localeCompare(b.source_date ?? '9999')), (source) => source.source_date ?? 'Date not recorded')
  return <div className="demo-native-view"><div className="demo-view-heading"><div><p className="demo-eyebrow">Timeline</p><h2>Document publication chronology</h2><p>Placement records source/document date, not event occurrence.</p></div></div><DemoBoundaryNote compact /><div className="demo-timeline">{[...groups].map(([date, sources]) => <section key={date}><time>{date}<small>{sources[0].publication_precision}</small></time><div>{sources.map((source) => <SourceCard key={source.capture_id} source={source} selected={selected?.capture_id === source.capture_id} onSelect={onSelect} />)}</div></section>)}</div></div>
}

function ResearchCollection({ investigation, onSelect }) {
  return <div className="demo-native-view"><div className="demo-view-heading"><div><p className="demo-eyebrow">Arcs</p><h2>{titleForTopic(investigation.topic)} research collection</h2><p>Membership only — not an approved narrative arc.</p></div><PendingBadge>{investigation.sources.length} members</PendingBadge></div><DemoBoundaryNote compact /><article className="demo-native-panel demo-collection"><header><div><p className="demo-eyebrow">Private collection identity</p><code>{investigation.arc.id}</code></div><span>No canonical arc ID</span></header><ol>{investigation.sources.map((source, index) => <li key={source.capture_id}><button type="button" onClick={() => onSelect(source)}><span>{String(index + 1).padStart(2, '0')}</span><span><strong>{source.title}</strong><small>{source.outlet} · {source.source_date ?? 'Date not recorded'}</small></span></button></li>)}</ol></article></div>
}

function WorldUnavailable() {
  return <div className="demo-native-view demo-world-empty"><div className="demo-honest-empty"><ShieldCheck size={28} /><p className="demo-eyebrow">World View</p><h2>Geographic projection intentionally unavailable</h2><p>No reviewed event-place assertion exists for this retained collection. Geographic mentions are not projected as event locations.</p><span>Investigation context remains selected.</span></div></div>
}

function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return <div className="sheet-backdrop" onClick={onClose}><div ref={ref} tabIndex={-1} className="sheet demo-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}><div className="sheet-head"><h2>{title}</h2><button type="button" className="sheet-close" aria-label="Close" onClick={onClose}><X size={18} /></button></div>{children}</div></div>
}

function NativeDemoApp() {
  const initial = readRoute(), [route, setRoute] = useState(initial), [query, setQuery] = useState(''), [exploreOpen, setExploreOpen] = useState(false), [aboutOpen, setAboutOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false)
  useEffect(() => { const update = () => setRoute(readRoute()); window.addEventListener('hashchange', update); const canonical = serializeDemoRoute(initial, allSources); if (window.location.hash !== canonical) window.location.hash = canonical; return () => window.removeEventListener('hashchange', update) }, [])
  const investigation = useMemo(() => demoLens(universe, route.topic), [route.topic])
  const selected = investigation.sources.find((source) => source.capture_id === route.capture) ?? null
  const view = routeToView[route.surface] ?? 'investigations'
  const header = { eyebrow: 'Investigation workspace · private demonstration', title: titleForTopic(route.topic), location: 'Location not recorded', when: 'Document dates only', description: topicMeta[route.topic].description, dimensions: [{ key: 'evidence', label: 'Evidence strength', value: 'Not recorded', tone: 'unavailable' }, { key: 'reliability', label: 'Source reliability', value: 'Not recorded', tone: 'unavailable' }, { key: 'demo-presentation', label: 'Access context', value: session.presentationLabel, tone: 'unavailable' }, { key: 'review', label: 'Review status', value: 'Pending', tone: 'unavailable' }, { key: 'uncertainty', label: 'Remaining uncertainty', value: 'Recorded per source', tone: 'unavailable' }] }
  const investigationContext = { canonical_subject_type: null, canonical_subject_id: null, parent_event_id: null, as_of_time: null, selected_time_range: null, active_view: view, temporal_assessment_reference: null }
  const openView = (nextView) => writeRoute(route.topic, viewToRoute[nextView] ?? 'context', selected?.capture_id ?? null)
  const selectSource = (source) => writeRoute(route.topic === 'all' || route.topic === source.topic ? route.topic : 'all', route.surface === 'context' ? 'news' : route.surface, source.capture_id)
  const chooseInvestigation = (topic) => { setQuery(''); setExploreOpen(false); const next = switchDemoLens(route, topic, universe); writeRoute(next.topic, next.surface, next.capture) }
  let content
  if (view === 'world') content = <WorldUnavailable />
  else if (route.surface === 'context') content = <InvestigationContext investigation={investigation} onOpenSources={() => writeRoute(route.topic, 'news')} onOpenEvidence={() => writeRoute(route.topic, 'evidence')} />
  else if (route.surface === 'news') content = <SourceFeed investigation={investigation} query={query} selected={selected} onSelect={selectSource} onOpenEvidence={() => writeRoute(route.topic, 'evidence', selected?.capture_id ?? null)} />
  else if (route.surface === 'evidence') content = <EvidenceLedger investigation={investigation} selected={selected} onSelect={selectSource} />
  else if (route.surface === 'compare') content = <ComparisonView investigation={investigation} onSelect={selectSource} />
  else if (route.surface === 'graph') content = <NativeGraph investigation={investigation} selected={selected} onSelect={(source) => source && selectSource(source)} />
  else if (route.surface === 'timeline') content = <PublicationTimeline investigation={investigation} selected={selected} onSelect={selectSource} />
  else content = <ResearchCollection investigation={investigation} onSelect={selectSource} />
  return <div className="app ws-app demo-native-app"><InvestigationWorkspace view={view} onChangeView={openView} investigationContext={investigationContext} header={header} selectedChild={selected ? { label: selected.title } : null} hasNativeInspector={false} onChangeInvestigation={() => setExploreOpen(true)} corpusLine="Private corpus — 93 retained — all pending" searchSlot={<WorkspaceSearch exploreOpen={exploreOpen} onOpenExplore={() => setExploreOpen(true)} dialogId="demo-explore" query={query} onQueryChange={(value) => { setQuery(value); if (route.surface !== 'news') writeRoute(route.topic, 'news', selected?.capture_id ?? null) }} />} accountSlot={<WorkspaceAccountButton enabled label={session.displayName} title={`${session.presentationLabel} · ${session.displayName}`} onClick={() => setAccountOpen(true)} />} infoSlot={<WorkspaceInfoButton onClick={() => setAboutOpen(true)} />} leftNav={<>{DEMO_NAV_ITEMS.map((item) => <WorkspaceNavButton key={item.key} item={item} active={view === item.key} onClick={() => openView(item.key)} />)}</>} inspectorSlot={<ProvenanceInspector source={selected} investigation={investigation} surface={route.surface} onOpenEvidence={() => writeRoute(route.topic, 'evidence', selected?.capture_id ?? null)} />} inspectorSelection={selected} details={<details className="ws-details"><summary>Investigation details &amp; demo boundary</summary><div className="demo-details"><DemoBoundaryNote /><p>Static build-time provider · no Supabase client · no production backend · no admission or publication operation.</p><p>Selected collection: {titleForTopic(route.topic)} · {investigation.sources.length} pending records.</p></div></details>}><main className="app-main">{content}</main></InvestigationWorkspace>
    {exploreOpen && <Modal title="Explore / Change investigation" onClose={() => setExploreOpen(false)}><div id="demo-explore" className="demo-investigation-picker"><p>Choose a lens over the shared corpus. Selection persists wherever it belongs to the chosen lens.</p>{investigations.map((item) => <button type="button" key={item.topic} className={item.topic === route.topic ? 'active' : ''} onClick={() => chooseInvestigation(item.topic)}><span><strong>{titleForTopic(item.topic)}</strong><small>{topicMeta[item.topic].description}</small></span><span>{item.sources.length}</span></button>)}</div></Modal>}
    {aboutOpen && <Modal title="Media Intelligence Platform" onClose={() => setAboutOpen(false)}><div className="sheet-body"><DemoBoundaryNote /><p>This September 22 preview uses the native MIP investigation shell with an isolated static provider. It contains no production transport or mutation path.</p></div></Modal>}
    {accountOpen && <Modal title={`${session.presentationLabel} · ${session.displayName}`} onClose={() => setAccountOpen(false)}><div className="sheet-body"><p><CheckCircle size={18} /> {session.displayName} · private demo presentation</p><p>Authentication must be enforced by the private host for every page and asset. This presentation session is not a credential and cannot authorize backend actions.</p></div></Modal>}
  </div>
}

createRoot(document.getElementById('root')).render(<NativeDemoApp />)
