import { useState } from 'react'
import { StatusBanner, BoundedRecords } from '../src/components/InvestigationPanelPresentation.jsx'
import { CAPABILITY_FAMILIES, RECEIPT_TABS } from './demoReceiptWorkspace.jsx'

export function ReplaySourceLink({candidate:c}) {
  let safeUrl=false
  try { safeUrl=new URL(c.url).protocol==='https:' } catch { /* preserve the value without an unsafe link */ }
  return <section className="piw-card" data-source-capture={c.capture_id}><h3>{c.title??c.candidate_id}</h3>
    <dl className="ws-inspector-dl demo-id-list">
      <div><dt>Source URL</dt><dd>{safeUrl?<a href={c.url} target="_blank" rel="noreferrer">{c.url}</a>:c.url??'Unavailable'}</dd></div>
      <div><dt>Article / capture / candidate</dt><dd>{c.article_id} / {c.capture_id} / {c.candidate_id}</dd></div>
      <div><dt>Declared origin</dt><dd>{c.origin_id??'Unresolved'} · unverified receipt declaration</dd></div>
      <div><dt>Declared dependency</dt><dd>{c.dependency_id??'Unresolved'} · unverified receipt declaration</dd></div>
      <div><dt>Source date only</dt><dd>{c.source_date??'Unavailable'} · recorded precision: {c.publication_precision??'Unavailable'}</dd></div>
      <div><dt>Publication timestamp</dt><dd>{c.published_at??'Unavailable; source date is not a publication timestamp or event time'}</dd></div>
      <div><dt>Source update timestamp</dt><dd>Unavailable — no source update timestamp supplied</dd></div>
      <div><dt>Capture content hash</dt><dd>{c.content_hash}</dd></div>
    </dl><p>Capture content_hash is retained receipt/database identity; it was not recomputed or cryptographically verified by this replay. Exact-span checking does not verify the capture payload hash. Declared lineage does not establish independent sourcing.</p>
  </section>
}
export function ReplayEvidenceLedger({replay,investigation,selected,onSelect}) {
  const ids=new Set((selected?[selected]:investigation.sources).map(s=>s.capture_id))
  const candidates=replay.candidates.filter(c=>ids.has(c.capture_id))
  const checks=candidates.flatMap(c=>c.checks)
  return <div className="demo-native-view"><p className="demo-eyebrow">Evidence</p><h2>Pending replay evidence ledger</h2>
    <StatusBanner>Private bounded evidence · review pending · no canonical admission or publication.</StatusBanner>
    <p>{candidates.length} candidates in scope · {candidates.filter(c=>c.evidence_state==='verified_bounded_span').length} exact bounded spans verified against supplied field text · {checks.filter(c=>c.state==='passed').length} passing check results of {checks.length}. Capture payload hashes remain retained/unverified.</p>
    <BoundedRecords items={candidates} label="replay evidence candidates" renderItem={c=><div key={c.candidate_id}>{onSelect&&<button onClick={()=>onSelect(investigation.sources.find(s=>s.capture_id===c.capture_id))}>Select candidate {c.candidate_id}</button>}<ReplayEvidence candidate={c}/><details><summary>Evidence checks</summary>{c.checks.map(check=><p key={check.check}>{check.check}: {check.state}{check.reason?` — ${check.reason}`:''}</p>)}</details></div>}/>
  </div>
}
export function ReplayClusterDetails({replay,clusters,selectedId,onSelectCluster,sources,onSelectSource}) {
  const cluster=clusters.find(c=>c.id===selectedId)
  return <section className="piw-card" aria-label="Pending graph candidate clusters"><h3>Pending candidate clusters</h3>
    <p>Keyboard-accessible cluster membership. These are unresolved analytical candidates, not accepted events or relationships.</p>
    <BoundedRecords items={clusters} label="pending cluster list" renderItem={c=><button key={c.id} aria-pressed={selectedId===c.id} onClick={()=>onSelectCluster(c.id)}>{c.id} · {c.capture_ids.length} member sources · pending</button>}/>
    {cluster&&<section aria-label="Selected pending cluster"><h4>{cluster.id} · pending / unreviewed</h4><p>{cluster.method} · not an accepted event or relationship</p><p>{cluster.temporal_scope??'Lexical candidate membership within bounded excerpts only.'}</p>
      <BoundedRecords items={cluster.capture_ids} label="cluster member evidence" renderItem={id=>{const c=replay.candidates.find(c=>c.capture_id===id),s=sources.find(s=>s.capture_id===id);return c?<details key={id}><summary>{c.title??c.candidate_id} · member source</summary>{s&&<button onClick={()=>onSelectSource(s)}>Select member source {c.candidate_id}</button>}<ReplayEvidence candidate={c}/></details>:null}}/>
    </section>}
  </section>
}
export function ReplayEvidence({ candidate:c }) {
  return <article className="piw-card" data-candidate-id={c.candidate_id}><h3>{c.title ?? c.candidate_id}</h3><p>{c.outlet} · {c.evidence_state} · pending review</p>
    <blockquote>{c.exact_excerpt || 'Failed evidence quarantined; no text supplied to analysis.'}</blockquote>
    <dl className="ws-inspector-dl demo-id-list">{['article_id','capture_id','candidate_id','content_hash','field_name','field_version','span_start','span_end','rights_mode'].map(k=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{String(c[k])}</dd></div>)}</dl>
    <p>Exact bounded excerpt · code-point coordinates · private identity only · no canonical admission.</p>
    <ReplaySourceLink candidate={c}/>
    <details><summary>Native sentence classification ({c.sentences.length})</summary>{c.sentences.map(s=><p key={s.id}><strong>{s.kind}</strong> [{s.span_start}, {s.span_end}): {s.text}</p>)}<p>No subject–predicate–object fields are produced by this native algorithm.</p></details>
    <details><summary>Unresolved entity mention candidates ({c.mentions.length})</summary>{c.mentions.map(m=><p key={m.id}>{m.surface} · guessed {m.guessed_type} · {m.mentions} mentions · unresolved private identity</p>)}</details>
    <details><summary>Loaded-language spans ({c.loaded_language.length})</summary>{c.loaded_language.map((h,i)=><p key={i}>{h.term} · {h.category} · [{h.span.join(', ')})</p>)}</details>
  </article>
}
export function ReplayComparison({replay,investigation,selected,onSelect}) {
  const ids=new Set(investigation.sources.map(s=>s.capture_id))
  const [mode,setMode]=useState('all')
  const groups=replay.claim_groups.filter(g=>g.source_membership.some(id=>ids.has(id))&&(mode==='all'||g.classification===mode))
  return <div className="demo-native-view"><p className="demo-eyebrow">Source Comparison</p><h2>Pending lexical claim comparison</h2><StatusBanner>Native deterministic sentence extraction and lexical grouping over bounded excerpts. Shared means lexical source membership; truth, independent corroboration and accepted event membership remain unassessed.</StatusBanner>
    <p>{replay.revision} · {groups.length} groups in this lens. Absence is evaluated across the whole supplied universe; “omitted by” means absent from successfully extracted bounded sentences only.</p>
    <label>Claim groups <select aria-label="Claim groups" value={mode} onChange={e=>setMode(e.target.value)}><option value="all">All</option><option value="shared">Shared</option><option value="unique">Unique</option></select></label>
    <BoundedRecords items={groups} label="lexical claim groups" renderItem={g=><article className="piw-card" key={g.id}><h3>{g.classification} · pending / unreviewed</h3><blockquote>{g.representative_text}</blockquote><p>Present in {g.source_membership.length} source captures. Independence: unknown.</p><p>Omitted by (bounded extraction only): {g.omitted_by.join(', ')||'None'}</p><p>Coverage unknown: {g.coverage_unknown.join(', ')||'None within extraction; whole-source coverage remains unknown'}</p><details><summary>Exact source membership and evidence</summary>{g.source_membership.map(id=>{const c=replay.candidates.find(c=>c.capture_id===id);const s=investigation.sources.find(s=>s.capture_id===id);return <div key={id}>{s&&<button aria-pressed={selected?.capture_id===id} onClick={()=>onSelect(s)}>Select source</button>}<ReplayEvidence candidate={c}/></div>})}</details></article>}/>
    <details><summary>All pending candidate evidence in lens ({ids.size})</summary><BoundedRecords items={replay.candidates.filter(c=>ids.has(c.capture_id))} label="pending evidence candidates" renderItem={c=><ReplayEvidence key={c.candidate_id} candidate={c}/>}/></details>
  </div>
}
export function ReplayWorkspace({replay,investigation,selected,initialTab='overview'}) {
  const [tab,setTab]=useState(initialTab)
  const ids=new Set((selected?[selected]:investigation.sources).map(s=>s.capture_id))
  const candidates=replay.candidates.filter(c=>ids.has(c.capture_id))
  const stages=names=><dl className="demo-stage-status">{names.map(name=>{const s=replay.propagation[name];return <div key={name} data-stage={name}><dt>{name.replaceAll('_',' ')}</dt><dd>{s.state} · {s.output_count} outputs across replay universe<p>{s.reason}</p></dd></div>})}</dl>
  return <div className="demo-native-view demo-receipt-workspace"><p className="demo-eyebrow">Investigation Context</p><h2>Private native offline replay</h2><StatusBanner>Review pending. Candidate analysis only; no accepted events, relationships, canonical entities, hypotheses or assessments. Publication is disabled.</StatusBanner>
    <section className="piw-card"><h3>Version &amp; review context</h3><p data-replay-revision={replay.revision}>{replay.revision}</p><p>Baseline: {replay.baseline.id}. {replay.baseline.scope}</p><button disabled>Mark reviewed</button><p>{candidates.length} candidates in selected scope · {replay.coverage.records} records / {replay.coverage.examined_pairs} pairs in global discovery. Canonical identities: unavailable.</p></section>
    <nav className="demo-receipt-tabs" aria-label="Investigation capability sections">{RECEIPT_TABS.map(([id,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='overview'&&<><div className="demo-capability-grid">{CAPABILITY_FAMILIES.map(([label,names])=><details key={label} className="piw-card"><summary>{label}</summary>{stages(names)}</details>)}</div>{selected&&<ReplayEvidence candidate={candidates[0]}/>}</>}
    {tab==='changed'&&<section className="piw-card"><h2>What Changed</h2><p>Artifacts added by this isolated run relative to the receipt-only qualification baseline. This is not historical system state or an accepted intelligence change.</p><dl>{Object.entries(replay.what_changed.added).map(([k,n])=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{n} added</dd></div>)}</dl><p>Accepted artifacts: 0. Review remains pending.</p></section>}
    {tab==='evidence-checks'&&<><h2>Evidence Checks</h2><BoundedRecords items={candidates} label="candidate checks" renderItem={c=><article className="piw-card" key={c.capture_id}><h3>{c.candidate_id}</h3>{c.checks.map(check=><p key={check.check}>{check.check}: {check.state}</p>)}</article>}/></>}
    {tab==='gaps'&&<><h2>Evidence Gaps</h2><BoundedRecords items={candidates} label="candidate gaps" renderItem={c=><article className="piw-card" key={c.capture_id}><h3>{c.candidate_id}</h3>{c.gaps.map(g=><p key={g}>{g.replaceAll('_',' ')}</p>)}</article>}/></>}
    {tab==='source-links'&&<><h2>Source Links &amp; dependency evidence</h2><BoundedRecords items={candidates} label="source and capture links" renderItem={c=><ReplaySourceLink key={c.capture_id} candidate={c}/>}/><p>URL/hash matches establish overlap evidence only. Direction, original reporting, and independent sourcing remain unresolved.</p><BoundedRecords items={replay.dependencies.filter(d=>d.capture_ids.some(id=>ids.has(id)))} label="dependency evidence" renderItem={d=><article className="piw-card" key={d.id}><p>{d.capture_ids.join(' / ')}</p><p>{d.evidence.join(', ')} · {d.lineage_state}</p></article>}/></>}
    {tab==='source-history'&&<><h2>Source History</h2><p>One supplied capture per candidate. Historical predecessors and source updates unavailable.</p><BoundedRecords items={candidates} label="source evidence" renderItem={c=><ReplayEvidence key={c.candidate_id} candidate={c}/>}/></>}
    {tab==='search-coverage'&&<><h2>Cross-investigation candidate discovery</h2><p>{replay.coverage.records} sources; {replay.coverage.examined_pairs} pairs. {replay.counts.cross_investigation_clusters} cross-investigation candidate clusters. No external or semantic search. Mention strings do not establish identity continuity.</p><BoundedRecords items={replay.clusters.filter(c=>c.topics.length>1)} label="candidate clusters" renderItem={c=><article className="piw-card" key={c.id}><h3>Pending candidate cluster</h3><p>{c.method} · {c.topics.join(', ')}</p><p>{c.capture_ids.join(', ')}</p><p>Not an accepted event or relationship.</p></article>}/></>}
    {['hypotheses','commitments'].includes(tab)&&<section className="piw-card"><h2>{tab==='hypotheses'?'Hypotheses & assessments':'Commitments'}</h2><p>Unavailable: no supported native derivation or reviewed evidence supplied.</p>{stages(['hypotheses','assessments','assumptions','relationships','events'])}</section>}
  </div>
}
