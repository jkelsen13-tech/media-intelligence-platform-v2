import {useEffect,useRef,useState} from 'react'
import {generationBacklogView} from '../lib/hypothesisGeneration.js'
const labels={pending:'Pending selection',processing:'Processing or awaiting explicit recovery',completed:'Assessment saved',failed:'Failed; retained for reconciliation'}
export default function HypothesisGenerationLedger({client,investigationId,userScopeKey,onAccessFailure,onRecover}) {
 const [state,setState]=useState(null)
 const scope=JSON.stringify([userScopeKey,investigationId]),scopeRef=useRef(scope),clientRef=useRef(client),epoch=useRef(0),active=useRef(true)
 scopeRef.current=scope;clientRef.current=client
 useEffect(()=>{active.current=true;epoch.current++;setState(null);return()=>{active.current=false;epoch.current++}},[client,scope])
 async function load() {
  if(!userScopeKey||typeof client?.generationBacklog!=='function')return
  const requestEpoch=++epoch.current,currentScope=scope,currentClient=client
  setState({scope,client,status:'loading'})
  try {
   const result=await client.generationBacklog(investigationId)
   if(!active.current||epoch.current!==requestEpoch||scopeRef.current!==currentScope||clientRef.current!==currentClient)return
   const entries=result?.error?null:generationBacklogView(result?.data,investigationId)
   setState(entries?{scope,client,status:'ready',entries}:{scope,client,status:'unavailable'})
   if(['access_denied','authentication_required'].includes(result?.error?.code))onAccessFailure?.(result.error.code)
  }catch{if(active.current&&epoch.current===requestEpoch&&scopeRef.current===currentScope&&clientRef.current===currentClient)setState({scope,client,status:'unavailable'})}
 }
 if(!userScopeKey||typeof client?.generationBacklog!=='function')return null
 const current=state?.scope===scope&&state.client===client?state:null
 return <section className="piw-card" aria-label="Hypothesis worker attempts"><h3>Hypothesis worker attempts</h3>
  <p>These retained job records show requested work and saved completions. They do not establish current authority, review approval or publication eligibility.</p>
  <button type="button" disabled={current?.status==='loading'} onClick={load}>{current?'Refresh worker attempts':'Inspect worker attempts'}</button>
  {current?.status==='loading'?<p role="status">Loading retained worker attempts…</p>:null}
  {current?.status==='unavailable'?<p role="status">Worker attempts are unavailable under the current access context.</p>:null}
  {current?.status==='ready'?current.entries.length?<ul>{current.entries.map(e=><li key={e.generation_id}>
   <p><strong>{labels[e.state]}</strong>{e.lease_expired?' · Lease expired; retained work has not been requeued.':''}</p>
   <p>Requested {e.recorded_at} · Generation {e.generation_id}</p>
   <p>Method revision {e.method_revision} · Retained input hash {e.input_hash}</p>
   {e.block_reason?<p>Current authority or retained context was unavailable at selection. Reconciliation remains explicit.</p>:null}
   {typeof onRecover==='function'&&(e.state==='failed'||(e.state==='processing'&&e.lease_expired))?<button type="button" onClick={()=>onRecover(e.generation_id)}>Prepare fresh-generation recovery</button>:null}
   {e.completed_revision_id?<p>Saved assessment revision {e.completed_revision_id}. Refresh assessment history to inspect it.</p>:null}
  </li>)}</ul>:<p>No retained worker attempts were returned.</p>:null}
  <p>There is no automatic retry or force cancellation. A processing record alone does not prove that a worker is still running.</p>
 </section>
}
