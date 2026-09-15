import {useEffect,useRef,useState} from 'react'
import {buildReviewRequest,reviewHistoryView,sameReviewReceipt,validReviewReceipt} from '../lib/hypothesisReview.js'
export default function HypothesisReviewAcknowledgement({client,investigationId,revisionId,revision,userScopeKey,canReview=false,onAccessFailure}) {
 const scope=JSON.stringify([investigationId,revisionId,revision,userScopeKey,canReview])
 const [state,setState]=useState(null),[refresh,setRefresh]=useState(0)
 const scopeRef=useRef(scope),clientRef=useRef(client),epoch=useRef(0),attempt=useRef(null),confirmed=useRef(null),busy=useRef(false)
 if(scopeRef.current!==scope||clientRef.current!==client){attempt.current=null;confirmed.current=null;busy.current=false;epoch.current++}
 scopeRef.current=scope;clientRef.current=client
 const supported=typeof client?.reviewHistory==='function'&&typeof client?.acknowledgeReview==='function'
 useEffect(()=>{
  const current=++epoch.current
  if(!userScopeKey||!supported)return
  setState({scope,client,status:'loading'})
  Promise.resolve().then(()=>client.reviewHistory(investigationId)).then(result=>{
   if(epoch.current!==current||scopeRef.current!==scope||clientRef.current!==client)return
   const view=result?.error?null:reviewHistoryView(result?.data,investigationId)
   const targetWithheld=view?.entries.some(e=>e.receipt.revision_id===revisionId&&e.target_status==='withheld')
   const consistent=view&&!targetWithheld&&(!confirmed.current||view.entries.some(e=>sameReviewReceipt(e.receipt,confirmed.current)))
   setState(consistent?{scope,client,status:'ready',view}:{scope,client,status:'unavailable'})
   if(targetWithheld)onAccessFailure?.('access_denied')
   else if(['access_denied','authentication_required'].includes(result?.error?.code))onAccessFailure?.(result.error.code)
  }).catch(()=>{if(epoch.current===current&&scopeRef.current===scope&&clientRef.current===client)setState({scope,client,status:'unavailable'})})
  return()=>{epoch.current++}
 },[client,scope,refresh,supported,userScopeKey,investigationId])
 if(!userScopeKey||!supported)return null
 const current=state?.scope===scope&&state.client===client?state:null
 const reload=()=>{attempt.current=null;setRefresh(n=>n+1)}
 async function save() {
  if(!canReview||busy.current||scopeRef.current!==scope||clientRef.current!==client)return
  let pending=attempt.current
  if(!pending) {
   if(current?.status!=='ready'||(current.view.latest?.revision??0)>=revision)return
   try {pending={input:buildReviewRequest(investigationId,revisionId,crypto.randomUUID(),current.view.latest?.request_id??null),
    revision,sequence:String(BigInt(current.view.latest?.receipt_sequence??'0')+1n)}
   }catch{setState({scope,client,status:'unavailable'});return}
   attempt.current=pending
  }
  const requestEpoch=++epoch.current;busy.current=true;setState({scope,client,status:'saving'})
  try {
   const result=await client.acknowledgeReview(pending.input)
   if(epoch.current!==requestEpoch||scopeRef.current!==scope||clientRef.current!==client)return
   if(result?.error||!validReviewReceipt(pending.input,result?.data,pending.revision,pending.sequence)) {
    setState({scope,client,status:result?.error?.code==='version_conflict'?'conflict':'uncertain'})
    if(['access_denied','authentication_required'].includes(result?.error?.code))onAccessFailure?.(result.error.code)
    return
   }
   confirmed.current=result.data
   setRefresh(n=>n+1)
  }catch{if(epoch.current===requestEpoch&&scopeRef.current===scope&&clientRef.current===client)setState({scope,client,status:'uncertain'})}
  finally{if(scopeRef.current===scope&&clientRef.current===client)busy.current=false}
 }
 const existing=current?.view?.entries.find(e=>e.receipt.revision_id===revisionId)
 return <section className="piw-card piw-hypothesis-review" aria-label="Your hypothesis review acknowledgement">
  <h3>Your review acknowledgement</h3>
  <p>This records your review of the exact saved revision. It does not accept its conclusion, resolve pending reassessment, approve source permissions or authorize publication.</p>
  {!current||current.status==='loading'?<p role="status">Loading your review acknowledgements…</p>:null}
  {current?.status==='saving'?<p role="status">Recording your review acknowledgement…</p>:null}
  {current?.status==='unavailable'?<><p role="status">Your review history is unavailable or has not yet confirmed the saved receipt.</p><button className="piw-btn" type="button" onClick={reload}>Retry review history</button></>:null}
  {current?.status==='uncertain'?<><p role="status">Acknowledgement is unconfirmed. Retry the identical request; current authority is still required.</p><button className="piw-btn" type="button" onClick={save}>Retry the same review acknowledgement</button></>:null}
  {current?.status==='conflict'?<><p role="status">Your review baseline changed. Refresh it before deciding whether to acknowledge this revision.</p><button className="piw-btn" type="button" onClick={reload}>Refresh review baseline</button></>:null}
  {current?.status==='ready'?existing?<p role="status">You marked revision {revision} reviewed at {existing.receipt.recorded_at}. This acknowledgement is retained separately from the assessment.</p>:
   (current.view.latest?.revision??0)>revision?<p>A later revision is already in your review baseline. This older revision does not move it backward.</p>:
   canReview?<button className="piw-btn" type="button" onClick={save}>Mark revision {revision} reviewed</button>:<p>Current reviewer assignment is required to record an acknowledgement.</p>:null}
 </section>
}
