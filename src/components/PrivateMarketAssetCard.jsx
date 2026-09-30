// One exact retained asset version/path. Reused in event and asset directions.
export default function PrivateMarketAssetCard({path,onOpenAsset,onOpenEvent}){
 const event=path.hops.at(-1).object
 return <article className="piw-card piw-market-card" aria-label={'Retained asset: '+path.name}>
  <h4>{path.name}</h4>
  <p>{path.asset_kind==='equity'?'Equity':'Cryptoasset'} · {path.asset_kind==='equity'?'Issuer':'Network'}: {path.identity_companion.name}</p>
  <p>Canonical asset {path.asset_id} · Version {path.asset_version_id}</p>
  <p>Companion {path.identity_companion.id} · Version {path.identity_companion.version_id}</p>
  {path.asset_identifier?<p>Asset identifier: {path.asset_identifier}</p>:null}
  <p>Asset validity: {path.valid_from} to {path.valid_to??'open end'}</p>
  <ul aria-label="Dated aliases">{path.aliases.map((alias,i)=><li key={i}>{alias.namespace}: {alias.symbol} · {alias.valid_from} to {alias.valid_to??'open end'}</li>)}</ul>
  <div className="piw-market-actions">
   <button type="button" onClick={()=>onOpenAsset?.(path)}>Explore this asset’s events</button>
   <button type="button" onClick={()=>onOpenEvent?.(event)}>Explore this event’s assets: {event.name}</button>
  </div>
  <h5>{path.relation==='direct_reporting'?'Direct reporting':'Connected development'} → {event.name}</h5>
  <p>Event {event.id} · Version {event.version_id}. An evidence path is not proof of causation.</p>
  <ol aria-label="Essential evidence hops">{path.hops.map(h=><li key={h.candidate_id}>
   <h6>{h.subject.name} → {h.object.name}</h6>
   <p>Recorded relationship: {h.relationship}. Valid {h.valid_from} to {h.valid_to??'open end'}.</p>
   <p>Recorded uncertainty: {h.uncertainty||'Not supplied; no certainty is inferred.'}</p>
   <blockquote>{h.support.excerpt}</blockquote>
   <p>Source publication: {h.published_at??'not supplied'} · Captured: {h.captured_at}</p>
   {h.source_url?<a href={h.source_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open supplied source locator</a>:<p>No safe source locator supplied.</p>}
   <details><summary>Exact retained evidence references</summary>
    <p>Edge {h.edge_id} · Version {h.edge_version_id}</p>
    <p>Endpoint versions {h.subject_version_id} → {h.object_version_id}</p>
    <p>Candidate {h.candidate_id} · Assessment {h.assessment_id}</p>
    <p>Article {h.article_id} · Capture {h.capture_id} · Capture hash {h.capture_payload_hash}</p>
    <p>Material {h.support.material_version} · Hash {h.support.material_hash}</p>
    <p>Input position {h.support.input_position} · {h.support.source_field} · Unicode code points [{h.support.start}, {h.support.end})</p>
   </details>
  </li>)}</ol>
 </article>
}
