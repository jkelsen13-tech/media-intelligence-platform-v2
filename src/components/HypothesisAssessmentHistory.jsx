import {useEffect,useState,useId,useRef} from 'react'
import HypothesisGenerationLedger from './HypothesisGenerationLedger.jsx'
import HypothesisAssessmentComposer from './HypothesisAssessmentComposer.jsx'
import HypothesisReassessmentRequest,{ReassessmentRequestDetail} from './HypothesisReassessmentRequest.jsx'
import HypothesisAssessmentPanel from './HypothesisAssessmentPanel.jsx'
import {hypothesisHistoryView} from '../lib/hypothesisAssessmentClient.js'
const labels={method_changed:'Evaluated method changed; reassessment required',human_reconsideration:'Human reconsideration requested',retained_assessment_change:'Retained assessment or method changed',retained_source_change:'Retained source changed',workspace_changed:'Investigation definition changed',permission_changed:'Permission requires fresh review'}
export default function HypothesisAssessmentHistory({client,investigationId,userScopeKey,workspaceVersionId,canReconcile=false,onAccessFailure}) {
 const [refresh,setRefresh]=useState(0),[selected,setSelected]=useState(null),[state,setState]=useState(null),[recovery,setRecovery]=useState(null)
 const selectId=useId(),operationEpoch=useRef(0)
 const scope=JSON.stringify([userScopeKey,investigationId,workspaceVersionId,refresh])
 const scopeRef=useRef(scope);scopeRef.current=scope
 const accessFailure=useRef(onAccessFailure);accessFailure.current=onAccessFailure
 useEffect(()=>{
  operationEpoch.current++
  let current=true
  setState({client,scope,status:'loading'})
  if(!userScopeKey||!investigationId||typeof client?.history!=='function'||typeof client?.backlog!=='function'){
   setState({client,scope,status:'unavailable'});return()=>{current=false;operationEpoch.current++}
  }
  Promise.resolve().then(()=>Promise.all([client.history(investigationId),client.backlog(investigationId)])).then(([history,backlog])=>{
   if(!current)return
   const error=history?.error??backlog?.error
   if(error) {
    setState({client,scope,status:'unavailable'})
    if(['authentication_required','access_denied'].includes(error.code))accessFailure.current?.(error.code)
    return
   }
   const view=hypothesisHistoryView(history.data,backlog.data,investigationId)
   setState(view?{client,scope,status:'ready',view}:{client,scope,status:'unavailable'})
  }).catch(()=>{if(current)setState({client,scope,status:'unavailable'})})
  return()=>{current=false;operationEpoch.current++}
 },[client,investigationId,userScopeKey,workspaceVersionId,scope])
 const reload=()=>{setRecovery(null);setSelected(null);setRefresh(n=>n+1)}
 async function reconcile() {
  if(!canReconcile||typeof client?.reconcile!=='function')return
  const currentScope=scope,epoch=operationEpoch.current
  setState({client,scope,status:'reconciling'})
  try {
   const result=await client.reconcile(investigationId)
   if(scopeRef.current!==currentScope||operationEpoch.current!==epoch)return
   if(result?.error) {
    setState({client,scope:currentScope,status:'unavailable'})
    if(['authentication_required','access_denied'].includes(result.error.code))accessFailure.current?.(result.error.code)
    return
   }
   setRefresh(n=>n+1)
  }catch{if(scopeRef.current===currentScope&&operationEpoch.current===epoch)setState({client,scope:currentScope,status:'unavailable'})}
 }
 if(!userScopeKey)return null
 const current=state?.scope===scope&&state.client===client?state:null
 if(!current||['loading','reconciling'].includes(current.status))return<section className="piw-card" aria-label="Hypothesis assessment history"><p role="status">{current?.status==='reconciling'?'Checking retained changes…':'Loading assessment history…'}</p></section>
 if(current.status!=='ready')return<section className="piw-card"><h2>Hypothesis assessment history</h2><p role="status">Assessment history is unavailable.</p><button type="button" onClick={reload}>Retry assessment history</button></section>
 const {entries,causes}=current.view,entry=entries.find(e=>e.revision_id===selected)??entries.at(-1)
 const related=entry?causes.filter(c=>c.revision_id===entry.revision_id&&c.state==='pending_explicit_reconciliation'):[]
 const resolved=entry?causes.filter(c=>c.revision_id===entry.revision_id&&c.state==='reassessment_recorded'):[]
 const pendingCount=causes.filter(c=>c.state==='pending_explicit_reconciliation').length
 const permissionChanged=related.some(c=>c.kind==='permission_changed')
 return<section className="piw-stack" aria-label="Hypothesis assessment history">
  <header className="piw-card"><h2>Hypothesis assessment history</h2>
   <p>These are saved revisions. Changes awaiting reassessment do not replace their conclusions.</p>
   {pendingCount?<p>{pendingCount} retained change causes remain pending across these revisions.</p>:null}
   <button type="button" onClick={reload}>Refresh assessment history</button>
   {canReconcile&&typeof client?.reconcile==='function'?<button type="button" onClick={reconcile}>Check for missed changes</button>:null}
   <p>Retained revisions are available here. A verified “as known then” time view is not available yet.</p>
  </header>
  {canReconcile&&typeof client?.authoringContext==='function'?<HypothesisAssessmentComposer key={scope+(recovery?.scope===scope&&recovery.client===client?recovery.prior:'')} client={client}
   investigationId={investigationId} workspaceVersionId={workspaceVersionId} userScopeKey={userScopeKey} onSaved={reload}
   recoveryPrior={recovery?.scope===scope&&recovery.client===client?recovery.prior:null} onRecoveryClose={()=>setRecovery(null)}
   onAccessFailure={code=>{setState({client,scope,status:'unavailable'});accessFailure.current?.(code)}}/>:null}
  <HypothesisGenerationLedger onRecover={canReconcile&&typeof client?.recoverGeneration==='function'?prior=>setRecovery({scope,client,prior}):undefined} key={'generations:'+scope} client={client} investigationId={investigationId} userScopeKey={userScopeKey}
   onAccessFailure={code=>{setState({client,scope,status:'unavailable'});accessFailure.current?.(code)}}/>
  {entry?<div className="piw-card"><label htmlFor={selectId}>Saved assessment revision</label>
   <select id={selectId} value={entry.revision_id} onChange={e=>setSelected(e.target.value)}>
    {entries.map(e=><option key={e.revision_id} value={e.revision_id}>Revision {e.revision}{e.status==='withheld'?' — unavailable':''}</option>)}
   </select>
   {related.length?<div role="status"><p>{related.length} recorded change{related.length===1?'':'s'} await explicit reassessment.</p>
    <ul>{related.map(c=><li key={c.cause_id}>{labels[c.kind]}{c.change_position?' · retained change '+c.change_position:''}{c.kind==='human_reconsideration'&&c.detail?.request_id&&typeof client?.requestDetail==='function'?<ReassessmentRequestDetail key={scope+c.cause_id} client={client} investigationId={investigationId} cause={c} scopeKey={scope}/>:null}</li>)}</ul>
   </div>:null}
   {resolved.length?<div><p>{resolved.length} recorded change{resolved.length===1?'':'s'} {resolved.length===1?'has':'have'} a saved reassessment.</p>
    <ul>{resolved.map(c=><li key={c.cause_id}>{labels[c.kind]} · <button type="button"
      onClick={()=>setSelected(c.resolution_revision_id)}>Open reassessment revision {entries.find(e=>e.revision_id===c.resolution_revision_id)?.revision}</button>{c.kind==='human_reconsideration'&&c.detail?.request_id&&typeof client?.requestDetail==='function'?<ReassessmentRequestDetail key={scope+c.cause_id} client={client} investigationId={investigationId} cause={c} scopeKey={scope}/>:null}</li>)}</ul>
    <p>A saved reassessment does not approve publication or restore this older assessment’s permissions.</p>
   </div>:null}
  </div>:<p>No completed hypothesis assessments are saved.</p>}
  {canReconcile&&entry&&entry.revision_id===entries.at(-1)?.revision_id&&typeof client?.requestReassessment==='function'?
   <HypothesisReassessmentRequest key={scope+entry.revision_id} client={client} investigationId={investigationId}
    revisionId={entry.revision_id} scopeKey={scope} onRecorded={reload}/>:null}
  {entry?(entry.status==='withheld'||permissionChanged?<p role="status">This saved assessment is withheld until its evidence permissions and review requirements are satisfied.</p>:
   <HypothesisAssessmentPanel key={entry.revision_id} assessment={entry.assessment}
    dependencyChanged={entry.reassessment_pending||related.length>0}/>):null}
 </section>
}
