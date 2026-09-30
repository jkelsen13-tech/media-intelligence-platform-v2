import {useMemo,useRef,useState} from 'react'
import {snapshotPrivateMarketsRequest,marketUUID} from '../lib/privateMarketsContract.js'
import {usePrivateMarketsRead} from '../lib/usePrivateMarketsRead.js'
import PrivateMarketAssetCard from './PrivateMarketAssetCard.jsx'
const messages={
 not_configured:'Private Markets is not configured.',authentication_required:'Your private session is unavailable.',
 access_denied:'Private Markets access was denied.',origin_denied:'This browser origin is not configured for private Markets.',
 invalid_request:'Choose a named retained subject and an explicit-offset valid-time timestamp.',
 evidence_unavailable:'Qualified evidence is unavailable for this exact scope and time.',
 scope_too_large:'This scope exceeds the qualified reader bound. No partial result is shown.',
 service_unavailable:'Private Markets is temporarily unavailable. No prior result is shown.',
 invalid_response:'Private Markets returned an unsupported or mismatched result. Nothing from it is displayed.'
}
export default function PrivateMarketsWorkspace({workspace,auth,endpoint=null}){
 const bundle=workspace.state.bundle,user=auth?.user?.id,sessionUser=auth?.session?.user?.id,token=auth?.session?.access_token,
  expires=auth?.session?.expires_at,loading=auth?.loading
 // Never stringify session credentials into React keys, URLs or persisted state.
 const scope=useMemo(()=>({bundle,endpoint,user,sessionUser,token,expires,loading}),[bundle,endpoint,user,sessionUser,token,expires,loading])
 const latest=useRef(scope),[saved,setSaved]=useState(null);latest.current=scope
 const seed=workspace.state.panels?.canonicalSubject?.id
 const defaults={scope,open:false,target:{kind:'event',id:marketUUID(seed)?seed:null,versionId:null},draftAt:bundle?.version?.state?.time_range?.from??'',at:null,revision:0}
 const current=saved?.scope===scope?saved:defaults
 const change=patch=>{if(latest.current!==scope)return;setSaved(old=>({...((old?.scope===scope)?old:defaults),...patch,scope}))}
 const input=useMemo(()=>current.open&&current.at?snapshotPrivateMarketsRequest({
  investigation_id:bundle?.investigation_id,workspace_version_id:bundle?.version?.id,
  asset_id:current.target.kind==='asset'?current.target.id:null,event_id:current.target.kind==='event'?current.target.id:null,at:current.at
 }):null,[bundle,current.open,current.at,current.target.kind,current.target.id])
 const expectedTarget=useMemo(()=>current.target.versionId?{...current.target}:null,
  [current.target.kind,current.target.id,current.target.versionId])
 const result=usePrivateMarketsRead({endpoint,auth,active:current.open,input,expectedObservationId:bundle?.observation?.id,expectedTarget,
  revision:current.revision,onAccessFailure:code=>workspace.actions.rejectInputImpactAccess?.(code,bundle)})
 if(!endpoint||!bundle||workspace.status!=='ready')return null
 const paths=result.data?.paths??[]
 const navigate=(kind,id,versionId)=>change({target:{kind,id,versionId},revision:current.revision+1})
 const submit=event=>{event.preventDefault();change({at:current.draftAt,revision:current.revision+1})}
 return <section className="piw-section piw-private-markets" aria-label="Private Markets workspace">
  {!current.open?<button type="button" className="piw-btn" onClick={()=>change({open:true})}>Open private Markets evidence</button>:<>
   <div className="piw-market-actions"><h2>Private Markets evidence</h2>
    <button type="button" onClick={()=>change({open:false,at:null,target:defaults.target})}>Close private Markets</button></div>
   <p>Bound to this saved investigation, workspace version and retained observation. No public graph or quote feed is created.</p>
   <form onSubmit={submit}>
    <label>Valid-time filter (explicit offset; not knowledge time)
     <input value={current.draftAt} onChange={e=>change({draftAt:e.target.value,at:null})} placeholder="2026-06-01T00:00:00Z" autoComplete="off" spellCheck={false}/></label>
    <button type="submit" disabled={!current.target.id}>Read private evidence paths</button>
   </form>
   {!current.target.id?<p role="status">This saved question has no named subject usable by this reader. No asset list is invented.</p>:null}
   {current.at&&!input?<p role="alert">{messages.invalid_request}</p>:null}
   <p>{current.target.kind==='asset'?'Asset → events':'Named subject → assets'} · {current.target.id??'no named subject'}</p>
   {current.at&&input?<p>Requested valid time: {current.at}. This is not an “as known then” reconstruction.</p>:null}
   {result.status==='loading'?<p role="status">Reading permission-checked retained paths…</p>:null}
   {result.status==='unavailable'?<p role="alert">{messages[result.code]??messages.service_unavailable}</p>:null}
   {result.status==='ready'?<>
    <p>Saved observation: {result.data.observation_id}. Publication remains disabled. Source-root lineage, complete attribution/rights metadata and historical knowledge-time reconstruction are not qualified by this display.</p>
    {!paths.length?<p role="status">No qualified paths were returned for this scope and time. No standalone asset identity is supplied; this does not prove no relationship exists.</p>:null}
    {['direct_reporting','connected_development'].map(relation=><section key={relation} aria-label={relation==='direct_reporting'?'Direct reporting':'Connected developments'}>
     <h3>{relation==='direct_reporting'?'Direct reporting':'Connected developments'}</h3>
     {!paths.some(p=>p.relation===relation)?<p>No paths in this category were returned; coverage is bounded, not exhaustive.</p>:null}
     {paths.filter(p=>p.relation===relation).map(p=><PrivateMarketAssetCard key={p.hops.map(h=>h.candidate_id).join(':')} path={p}
      onOpenAsset={asset=>navigate('asset',asset.asset_id,asset.asset_version_id)} onOpenEvent={event=>navigate('event',event.id,event.version_id)}/>)}
    </section>)}
   </>:null}
   <section aria-label="Broader context"><h3>Broader context</h3><p>Not available in this reader. No broader-context coverage or absence is inferred.</p></section>
  </>}
 </section>
}
