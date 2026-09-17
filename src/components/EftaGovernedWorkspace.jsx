import {useEffect,useState} from 'react'
import {eftaWorkspace} from '../lib/eftaWorkspace.js'
export default function EftaGovernedWorkspace({client=null}) {
 const [state,setState]=useState({status:'unavailable'}),[selected,setSelected]=useState(null),[tab,setTab]=useState('Sources');
 useEffect(()=>{let alive=true;setState({status:client?'loading':'unavailable'});setSelected(null);
 if(client) Promise.resolve().then(()=>client.read()).then(payload=>{if(alive)setState({status:'ready',data:eftaWorkspace(payload)})}).catch(()=>{if(alive)setState({status:'unavailable'})});
 return()=>{alive=false}},[client]);
 if(state.status!=='ready') return <main><h1>Disclosure accounting review</h1><p>{state.status==='loading'?'Loading authorized private review…':'Private review is unavailable. An authorized review reader and admitted records are required.'}</p></main>;
 const d=state.data,s=d.sources.find(x=>x.id===selected);
 return <main data-efta-private-review="true"><h1>Disclosure accounting review</h1><p>Private reviewed research collection. Public release is disabled.</p>
 <nav aria-label="Review surfaces">{['Sources','Claims','Graph','Timeline','Arc','Source Comparison','World View'].map(t=><button key={t} onClick={()=>setTab(t)} aria-pressed={tab===t}>{t}</button>)}</nav>
 {tab==='Sources'&&<section><h2>Retained sources</h2>{d.sources.map(x=><p key={x.id}><button onClick={()=>setSelected(x.id)}>{x.url}</button></p>)}</section>}
 {tab==='Claims'&&<section><h2>Attributed statements</h2>{d.claims.map(c=><article key={c.id}><p>{c.text}</p><p>{c.semantic_kind}: {c.uncertainty}</p><button onClick={()=>setSelected(c.source_id)}>Inspect exact evidence</button></article>)}</section>}
 {tab==='Graph'&&<section><h2>Evidence graph</h2><p>Edges express attribution, exact evidence and document membership.</p><ul>{d.graph.edges.map((e,i)=><li key={i}>{e.from} → {e.type} → {e.to}</li>)}</ul></section>}
 {tab==='Timeline'&&<section><h2>Reviewed event dates</h2>{d.timeline.map(e=><article key={e.id}><h3>{e.date} · {e.label}</h3><p>{e.basis}</p><p>{e.uncertainty}</p>{d.sources.filter(x=>x.event_id===e.id).map(x=><button key={x.id} onClick={()=>setSelected(x.id)}>Inspect source</button>)}</article>)}</section>}
 {tab==='Arc'&&<section><h2>Disclosure accounting investigation</h2><p>Reviewed research collection, not a causal conclusion.</p><p>{d.arc.id}</p><ul>{d.arc.members.map(id=><li key={id}>{id}</li>)}</ul></section>}
 {tab==='Source Comparison'&&<section><h2>Source Comparison unavailable</h2><p>{d.comparison.reason}</p></section>}
 {tab==='World View'&&<section><h2>World View absent</h2><p>{d.world_view.reason}</p></section>}
 {s&&<aside aria-label="Evidence provenance"><h2>Exact retained evidence</h2><blockquote>{s.excerpt}</blockquote><p>{s.source_field} [{s.span_start}, {s.span_end}) · Unicode code points</p><p>{s.content_hash}</p><p>Candidate {s.candidate_id} · Capture {s.capture_id} · Article {s.article_id}</p><p>Review {s.decision_id} · Predecessor {s.predecessor??'none'}</p><p>{s.review.reviewer}: {s.review.reason}</p><p>{s.review.uncertainty}</p><p>Entity {s.entity_id} · Event {s.event_id} · Claim {s.claim_id}</p></aside>}
 <footer>Private receipt {d.receipt_id} · {d.payload_hash}</footer></main>
}
