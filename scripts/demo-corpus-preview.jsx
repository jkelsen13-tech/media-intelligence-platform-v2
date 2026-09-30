import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPreview } from './demoCorpus.mjs'
import receipts from '../verifier/demo-corpus-20260916/retained-source-receipts.json'
import expandedReceipts from '../verifier/demo-corpus-20260916/expanded-source-receipts.json'
import './demo-corpus-preview.css'
const investigations = createPreview([...receipts, ...expandedReceipts])
const names = { iran: 'US–Iran conflict', epstein: 'Epstein disclosure & oversight', project2025: 'Project 2025' }
const surfaces = ['News', 'Source Comparison', 'Graph', 'Timeline', 'Arcs', 'World View']
function Preview() {
  const [topic, setTopic] = useState('iran'), [surface, setSurface] = useState('News'), [selected, setSelected] = useState(null)
  const [synthetic, setSynthetic] = useState(false)
  const investigation = investigations.find(i => i.topic === topic)
  const active = investigation.sources.find(s => s.preview_id === selected)
  return <><header><strong>MIP / INVESTIGATIONS</strong><span>PRIVATE PREVIEW · PENDING REVIEW</span></header>
    <main><p className="eyebrow">BOUNDED DEMONSTRATION CORPUS</p><h1>Evidence before admission.</h1>
      <p className="intro">Real retained source receipts. Isolated research projections. Publication remains gated by independent Lane A qualification.</p>
      <div className="topics">{investigations.map(i => <button aria-pressed={topic === i.topic} onClick={() => { setTopic(i.topic); setSelected(null) }} key={i.topic}>{names[i.topic]} <small>{i.sources.length} retained</small></button>)}</div>
      <section className="metrics"><div><strong>{investigation.sources.length}</strong><span>retained captures</span></div><div><strong>{investigation.accounting.independent_origins}</strong><span>resolved origins</span></div><div><strong>0</strong><span>published by this run</span></div><div><strong>Pending</strong><span>review and admission</span></div></section>
      <nav aria-label="Investigation surfaces">{surfaces.map(s => <button key={s} aria-current={surface === s ? 'page' : undefined} onClick={() => setSurface(s)}>{s}</button>)}</nav>
      <label className="synthetic-toggle"><input type="checkbox" checked={synthetic} onChange={e => setSynthetic(e.target.checked)} /> Show explicitly invented relationship fixture</label>
      <div className="workspace"><section className="content"><h2>{names[topic]} <span>{surface}</span></h2>
        {synthetic && <section className="notice"><h3>Synthetic structure · no real-world assertion</h3><p>Example Review Office → Illustrative review meeting → Illustrative response. Dates and place are invented. Sequence does not imply causality.</p>
          <dl>{(surface === 'World View' ? investigation.synthetic.geography.map(x => ['Event → place', `${x.event.label} → ${x.place.label}`]) : surface === 'Timeline' ? investigation.synthetic.timeline.map(x => [x.date, x.label]) : surface === 'Source Comparison' ? [['Comparison identity', investigation.synthetic.comparison_event.namespace + ':' + investigation.synthetic.comparison_event.id], ['Graph identity', investigation.synthetic.comparison_event.graph_event.namespace + ':' + investigation.synthetic.comparison_event.graph_event.id]] : surface === 'Arcs' ? investigation.synthetic.arc.members.map(x => [investigation.synthetic.arc.id, x.label]) : investigation.synthetic.relationships.map(x => [x.type, `${x.from.label} → ${x.to.label}`])).map(([k,v],i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
        </section>}
        {!synthetic && surface === 'Source Comparison' && <div className="groups">{investigation.dependencyGroups.filter(g => g.members.length > 1).map(g => <p className="notice" key={g.id}><strong>{g.id}</strong><br/>{g.members.length} records share a declared dependency. Count as dependent material; agreement and event equivalence are unreviewed.</p>)}</div>}
        {!synthetic && surface === 'Graph' && <div className="groups">{investigation.origins.map(o => <section className="notice" key={o.id}><strong>{o.label}</strong>{investigation.statements.filter(s => s.origin === o.id).map(s => <p key={s.id}>Attribution ← pending statement ← <button className="provenance-link" onClick={() => setSelected(s.capture)}>{s.statement}</button></p>)}</section>)}</div>}
        {surface === 'Source Comparison' && <p className="notice">Provisional topic collection. A shared topic is not an established event identity or independent corroboration. No comparison event has been admitted.</p>}
        {surface === 'Graph' && <p className="notice">Private capture identities only. Actor resolution and event relationships remain unreviewed; there are no asserted causal edges.</p>}
        {surface === 'Timeline' && <p className="notice">Source publication dates, where recorded. These are not inferred event dates. Unknown times remain unknown.</p>}
        {surface === 'Arcs' && <p className="notice">Research collection membership, not an approved public narrative arc.</p>}
        {surface === 'World View' ? <div className="empty"><h3>Geographic relationships withheld</h3><p>No reviewed event–place–released-revision linkage exists for these pending captures. Datelines and source organizations do not establish event location.</p></div> : <div className={surface === 'Graph' ? 'cards graph' : 'cards'}>{[...investigation.sources].sort((a,b) => surface === 'Timeline' ? (a.source_date ?? '9999').localeCompare(b.source_date ?? '9999') : 0).map(s => <button className="card" key={s.capture_id} onClick={() => setSelected(s.preview_id)} aria-pressed={selected === s.preview_id}>
          <div className="meta">{s.outlet} <span>{s.source_date ?? 'Date unresolved'}</span></div><h3>{s.title}</h3><p>{s.statement}</p><div className="tags"><span>{s.semantic_kind.replaceAll('_',' ')}</span><span>Pending review</span><span>{s.retained_scope}</span></div><small>{s.preview_id}</small>
        </button>)}</div>}
      </section><aside><p className="eyebrow">PROVENANCE INSPECTOR</p>{active ? <><h3>{active.title}</h3><a href={active.url} target="_blank" rel="noreferrer">Open original source ↗</a><dl>{[['Capture',active.capture_id],['Article',active.article_id],['Candidate',active.candidate_id ?? 'None'],['SHA-256',active.content_hash],['Origin',active.origin_id ?? 'Unresolved'],['Exact span',`${active.span_start ?? '?'}–${active.span_end ?? '?'} code points`],['Manus',active.manus_id ?? 'New source'],['Rights',active.rights]].map(([k,v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl><p className="notice">{active.remaining_uncertainty}</p></> : <><h3>Follow the evidence</h3><p>Select a source to inspect its durable capture identity, provenance, review state and limitations.</p></>}<hr/><small>This entry imports no application backend or auth client. The browser receives metadata only. Retained source bodies remain private in qik.</small></aside></div>
    </main><footer>Preview is not production publication. No live writes or promotion controls.</footer></>
}
createRoot(document.getElementById('root')).render(<Preview />)
