// Synthetic UI only. No backend, credentials, source text or production route.
import React from 'react'
import {createRoot} from 'react-dom/client'
import History from '../../src/components/HypothesisAssessmentHistory.jsx'
import {syntheticComparisonHistory} from '../../tests/hypothesisComparisonFixture.mjs'
import Review from '../../src/components/HypothesisReviewAcknowledgement.jsx'
import Composer from '../../src/components/HypothesisAssessmentComposer.jsx'
import {syntheticAuthoringContext} from '../../tests/hypothesisComposerFixture.mjs'
import Panel from '../../src/components/HypothesisAssessmentPanel.jsx'
import {hypothesisFixture} from '../../tests/hypothesisAssessmentFixture.mjs'
import Ledger from '../../src/components/HypothesisGenerationLedger.jsx'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const row=(n,state,extra={})=>({generation_id:id(n),request_id:id(n+10),workspace_version_id:id(3),
 observation_id:id(4),predecessor_id:null,input_hash:'a'.repeat(64),method_revision:id(5),
 implementation:'synthetic-method',state,recorded_at:'2026-09-13T12:00:00.123456Z',
 lease_expired:state==='processing',retained_for_reconciliation:true,block_reason:null,
 completed_revision_id:null,recovery_prior_generation_id:null,recovery_generation_id:null,...extra})
const data={contract_version:'mip_hypothesis_generation_backlog_v2',investigation_id:id(1),
 entries:[row(21,'processing',{recovery_generation_id:id(22)}),row(22,'pending',{recovery_prior_generation_id:id(21)}),row(23,'failed')],
 coverage:'retained_generation_jobs',current_authority_qualified:false,automatic_retry:false,force_cancellation:false,publication_allowed:false}
window.synthetic={calls:0,recoveries:[],mode:'ready'}
const client={generationBacklog:async()=>{window.synthetic.calls++;if(window.synthetic.mode==='denied')return{error:{code:'access_denied'}}
 return{data:structuredClone(data)}}}
const root=createRoot(document.getElementById('root'))
window.renderSynthetic=(scope='synthetic-reviewer')=>root.render(<main className="piw" style={{height:"100dvh",overflowY:"auto"}}><Ledger client={client}
 investigationId={id(1)} userScopeKey={scope} onRecover={id=>window.synthetic.recoveries.push(id)}/></main>)
window.renderSyntheticAssessment=()=>root.render(<main className="piw" style={{height:"100dvh",overflowY:"auto"}}><Panel assessment={hypothesisFixture()} dependencyChanged={true}/></main>)
window.renderSynthetic()

// Explicit synthetic receipt transport; not a server, Auth session or durable database.
const composerContext=syntheticAuthoringContext(),syntheticPassage='Synthetic meeting 🧭.'
composerContext.materials[0].fields[0].length=Array.from(syntheticPassage).length
window.composerSynthetic={contextReads:0,spanReads:0,submissions:[],commits:0,mode:'lost_ack',saved:null}
const composerClient={
 authoringContext:async()=>{window.composerSynthetic.contextReads++;return{data:structuredClone(composerContext)}},
 authoringSpan:async input=>{
  window.composerSynthetic.spanReads++
  const m=composerContext.materials[0],excerpt=Array.from(syntheticPassage).slice(input.start,input.end).join('')
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(excerpt))
  return{data:{contract_version:'mip_hypothesis_authoring_span_v1',...input,
   observation_id:composerContext.observation_id,publication_allowed:false,
   material_version:m.material_version,material_hash:m.material_hash,
   acquired_at:m.acquired_at,published_at:m.published_at,event_time:m.event_time,excerpt,
   excerpt_sha256:window.composerSynthetic.mode==='bad_hash'?'0'.repeat(64):Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}}
 },
 append:async input=>{
  const state=window.composerSynthetic;state.submissions.push(structuredClone(input))
  if(!state.saved){state.commits++;state.saved={publication_allowed:false,workspace_version_id:composerContext.workspace_version_id,
   observation_id:composerContext.observation_id,current_context:true,reassessment_pending:false,
   assessment:{...structuredClone(input.assessment),id:id(80),completed_at:'2026-09-13T12:01:00Z'}}}
  if(state.mode==='lost_ack'&&state.submissions.length===1)return{error:{code:'request_failed'}}
  return{data:structuredClone(state.saved)}
 }
}
window.renderSyntheticComposer=(scope='synthetic-reviewer')=>root.render(<main className="piw" style={{height:'100dvh',overflowY:'auto'}}>
 <Composer client={composerClient} investigationId={composerContext.investigation_id}
 workspaceVersionId={composerContext.workspace_version_id} userScopeKey={scope}/></main>)
window.inspectSyntheticSaved=()=>root.render(<main className="piw" style={{height:'100dvh',overflowY:'auto'}}>
 <Panel assessment={window.composerSynthetic.saved?.assessment}/>
 <Review client={reviewClient} investigationId={composerContext.investigation_id} revisionId={window.composerSynthetic.saved?.assessment.id}
 revision={1} userScopeKey="synthetic-reviewer" canReview={true}/></main>)

window.reviewSynthetic={submissions:[],receipts:[]}
const reviewClient={
 reviewHistory:async()=>({data:{contract_version:'mip_hypothesis_review_history_v1',investigation_id:composerContext.investigation_id,
  entries:window.reviewSynthetic.receipts.map(receipt=>({receipt,target_status:'available'})),
  latest_receipt_id:window.reviewSynthetic.receipts.at(-1)?.request_id??null,current_user_only:true,
  is_approval:false,resolves_reassessment:false,publication_allowed:false}}),
 acknowledgeReview:async input=>{
  const state=window.reviewSynthetic;state.submissions.push(structuredClone(input))
  if(!state.receipts.length)state.receipts.push({contract_version:'mip_hypothesis_review_receipt_v1',
   ...input,revision:1,receipt_sequence:'1',recorded_at:'2026-09-14T12:00:00.123456Z',
   review_scope:'version_acknowledgement_only',is_approval:false,resolves_reassessment:false,publication_allowed:false})
  return state.submissions.length===1?{error:{code:'request_failed'}}:{data:structuredClone(state.receipts[0])}
 }
}

const comparisonRecords=syntheticComparisonHistory()
window.comparisonSynthetic={mode:'ready',reads:0}
const comparisonClient={
 history:async()=>{window.comparisonSynthetic.reads++;return window.comparisonSynthetic.mode==='denied'?{error:{code:'access_denied'}}:{data:structuredClone(comparisonRecords.history)}},
 backlog:async()=>{
  const data=structuredClone(comparisonRecords.backlog)
  if(window.comparisonSynthetic.mode==='permission')data.causes.push({cause_id:'synthetic-permission-race',
   revision_id:'synthetic-assessment-1',kind:'permission_changed',state:'pending_explicit_reconciliation'})
  return{data}
 }
}
window.renderSyntheticComparison=(scope='synthetic-reviewer')=>root.render(<main className="piw" style={{height:'100dvh',overflowY:'auto'}}>
 <History client={comparisonClient} investigationId={comparisonRecords.history.investigation_id}
  workspaceVersionId="synthetic-workspace" userScopeKey={scope}/></main>)
