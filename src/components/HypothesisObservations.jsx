import {useEffect,useRef,useState} from 'react'
import {validObservationReceipt,observationListView,observedHistoryView} from '../lib/hypothesisObservations.js'
import {retainedDateDisplay} from '../lib/investigationEvidenceTrail.js'
import HypothesisAssessmentPanel from './HypothesisAssessmentPanel.jsx'
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
export default function HypothesisObservations({client,investigationId,userScopeKey,onAccessFailure}){
 const [state,setState]=useState(null),[selected,setSelected]=useState(null)
 const scope=JSON.stringify([userScopeKey,investigationId]),latest=useRef(null),epoch=useRef(0),busy=useRef(false),pending=useRef(null),failure=useRef(onAccessFailure)
 latest.current={scope,client};failure.current=onAccessFailure
 useEffect(()=>{epoch.current++;busy.current=false;pending.current=null;return()=>{epoch.current++}},[scope,client])
 const live=s=>epoch.current===s.epoch&&latest.current.scope===s.scope&&latest.current.client===s.client
 const begin=()=>{
  if(busy.current||latest.current.scope!==scope||latest.current.client!==client)return null
  busy.current=true
  const stamp={scope,client,epoch:epoch.current};setState({...stamp,status:'loading'});setSelected(null);return stamp
 }
 const fail=(stamp,code)=>{
  if(!live(stamp))return
  setState({...stamp,status:pending.current?'uncertain':'unavailable'})
  if(['authentication_required','access_denied'].includes(code))failure.current?.(code)
 }
 async function read(expected,stamp){
  const result=await client.readObservation(investigationId,expected.observation_id)
  if(!live(stamp))return
  if(result?.error){fail(stamp,result.error.code);return}
  const view=await observedHistoryView(result?.data,investigationId,expected.observation_id,expected)
  if(!live(stamp))return
  if(!view){fail(stamp,'invalid_response');return}
  if(pending.current?.input.request_id===expected.observation_id)pending.current=null
  if(view.entries.some(e=>e.observed_status==='available'&&e.status==='withheld')){
   setState({...stamp,status:'unavailable'});failure.current?.('access_denied');return
  }
  setState({...stamp,status:'ready',view})
 }
 async function capture(){
  const stamp=begin();if(!stamp)return
  try{
   if(!pending.current||pending.current.scope!==scope||pending.current.client!==client)pending.current={scope,client,input:Object.freeze({investigation_id:investigationId,request_id:globalThis.crypto.randomUUID()})}
   const input=pending.current.input,result=await client.captureObservation(input)
   if(!live(stamp))return
   if(result?.error){fail(stamp,result.error.code);return}
   if(!validObservationReceipt(result?.data,investigationId,input.request_id)){fail(stamp,'invalid_response');return}
   await read(result.data,stamp)
  }catch{fail(stamp,'request_failed')}
  finally{if(live(stamp))busy.current=false}
 }
 async function inspect(){
  const stamp=begin();if(!stamp)return
  try{
   const result=await client.listObservations(investigationId)
   if(!live(stamp))return
   if(result?.error){fail(stamp,result.error.code);return}
   const receipts=observationListView(result?.data,investigationId)
   if(!receipts){fail(stamp,'invalid_response');return}
   setState({...stamp,status:'listed',receipts})
  }catch{fail(stamp,'request_failed')}
  finally{if(live(stamp))busy.current=false}
 }
 async function open(receipt){
  const stamp=begin();if(!stamp)return
  try{await read(receipt,stamp)}catch{fail(stamp,'request_failed')}
  finally{if(live(stamp))busy.current=false}
 }
 if(!userScopeKey||!uuid(investigationId)||!['captureObservation','readObservation','listObservations'].every(k=>typeof client?.[k]==='function'))return null
 const current=state?.scope===scope&&state.client===client?state:null
 const unresolved=pending.current?.scope===scope&&pending.current.client===client
 const loading=current?.status==='loading'
 const view=current?.status==='ready'?current.view:null
 const entry=view?.entries.find(e=>e.revision_id===selected)??view?.entries.at(-1)
 return<section className="piw-card piw-hypothesis-observations" aria-label="Saved revision views">
  <h3>Saved revision views</h3>
  <p>Record which completed revisions are present now. Access is checked again when you open a saved view.</p>
  <button type="button" disabled={loading} onClick={capture}>{unresolved?'Retry the same saved view':'Record current revision view'}</button>
  <button type="button" disabled={loading} onClick={inspect}>Inspect saved views</button>
  {loading?<p role="status">Checking the saved view…</p>:null}
  {current?.status==='uncertain'?<p role="alert">The save still needs verified readback. Retry the same request or inspect saved views; another record will not be created automatically.</p>:null}
  {current?.status==='unavailable'?<p role="status">A verified saved view is unavailable under the current configuration or access.</p>:null}
  {current?.status==='listed'?(current.receipts.length?<ul>{current.receipts.map((r,i)=><li key={r.observation_id}>
   <p>Observed {retainedDateDisplay(r.observation_started_at).label} · {r.revision_count} revisions</p>
   <button type="button" aria-label={'Open saved view '+(i+1)} onClick={()=>open(r)}>Open this view</button>
  </li>)}</ul>:<p>No committed views were returned for your current account and configuration.</p>):null}
  {view?<div>
   <h4>Verified saved view</h4>
   <p>Observed between {retainedDateDisplay(view.receipt.observation_started_at).label} and {retainedDateDisplay(view.receipt.observation_finished_at).label}.</p>
   <p>This view contains {view.entries.length} completed revision{view.entries.length===1?'':'s'}. Later revisions are not added to it.</p>
   {entry?<label>Revision in this view
    <select value={entry.revision_id} onChange={e=>setSelected(e.target.value)}>{view.entries.map(e=><option key={e.revision_id} value={e.revision_id}>Revision {e.revision}{e.status==='withheld'?' — unavailable':''}</option>)}</select>
   </label>:<p>No completed revisions were present in this recorded view.</p>}
   {entry?(entry.status==='withheld'?<p>This revision was unavailable in the recorded view.</p>:
    <HypothesisAssessmentPanel key={view.receipt.observation_id+entry.revision_id} assessment={entry.assessment} dependencyChanged={entry.reassessment_pending}/>):null}
   <details><summary>Observation details</summary><p>Observation: {view.receipt.observation_id}</p>
    <p>Reference hash: {view.receipt.reference_hash}</p>
    <p>This records an observation, not a complete timeline. Arbitrary historical times and restored history are not qualified here.</p>
    <p>Recording or opening a view does not approve an assessment or authorize publication.</p>
   </details>
  </div>:null}
 </section>
}
