// Isolated, injected evaluated-method worker. No provider, source fetch, Auth secret or production endpoint.
import {validateHypothesisAssessment} from '../../../src/lib/hypothesisAssessment.js'
import {durableWorkerRpc,recoverGenerationRequest} from '../../functions/source-comparison-generation-candidate/durableWorker.js'
const clone=x=>JSON.parse(JSON.stringify(x))
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)
const keys=(x,required,optional=[])=>plain(x)&&required.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>required.includes(k)||optional.includes(k))
const rating=()=>({kind:'not_estimated',reason:'No qualified estimation method is enabled for this isolated worker path.'})
export function assessmentFromEvaluation(g,e) {
 if(g?.contract_version!=='mip_hypothesis_generation_v1'||!g.method||!Array.isArray(g.spans)||
  !keys(e,['comparison','evidence_claims','arguments','assumptions','gaps','change_tests','revision_reason','revision_trigger','revision_effect'],['reassessment_causes'])||
  !keys(e.comparison,['state','favored_ids','rationale','main_limitation'])||!Array.isArray(e.evidence_claims)||!Array.isArray(e.arguments)||
  e.evidence_claims.some(x=>!keys(x,['id','documented_claim']))||
  e.arguments.some(x=>!keys(x,['id','hypothesis_id','relation','evidence_ids','inference','limitation'])))
  throw Error('mip_hypothesis_evaluation_shape')
 const claims=new Map(e.evidence_claims.map(x=>[x.id,x.documented_claim]))
 if(claims.size!==g.spans.length||e.evidence_claims.length!==g.spans.length||g.spans.some(s=>!claims.has(s.id)))
  throw Error('mip_hypothesis_evidence_binding')
 const c=g.context
 const assessment={
  contract_version:'mip_hypothesis_assessment_v1',id:g.generation_id,question_id:c.investigation_id,question:c.question,
  revision:(c.head?.revision??0)+1,predecessor_id:c.head?.revision_id??null,knowledge_cutoff:c.knowledge_cutoff,completed_at:c.knowledge_cutoff,
  method_version:g.method.implementation,model_version:g.method.model_version,review_state:'unreviewed',release_state:'private',
  hypotheses:g.hypotheses.map(h=>({...clone(h),likelihood:rating(),confidence:rating()})),hypothesis_relationship:g.hypothesis_relationship,
  comparison:{...clone(e.comparison),confidence:rating()},
  evidence:g.spans.map(s=>({id:s.id,input_position:s.input_position,material_version:s.material_version,
   acquired_at:s.acquired_at,published_at:s.published_at??null,event_time:s.event_time??null,source_span:clone(s.source_span),
   origin_group:null,documented_claim:claims.get(s.id),quality:rating()})),
  arguments:e.arguments.map(a=>({...clone(a),relevance:rating()})),assumptions:clone(e.assumptions),gaps:clone(e.gaps),change_tests:clone(e.change_tests),
  revision_reason:e.revision_reason,revision_trigger:e.revision_trigger,revision_effect:e.revision_effect
 }
 if(Object.hasOwn(e,'reassessment_causes'))assessment.reassessment_causes=clone(e.reassessment_causes)
 if(!validateHypothesisAssessment(assessment).valid)throw Error('mip_hypothesis_evaluation_contract')
 const expected=c.backlog.causes.filter(x=>x.state==='pending_explicit_reconciliation').map(x=>x.cause_id).sort()
 const supplied=assessment.reassessment_causes?.map(x=>x.cause_id).sort()??[]
 if(JSON.stringify(expected)!==JSON.stringify(supplied))throw Error('mip_hypothesis_evaluation_causes')
 if(assessment.comparison.state==='better_supported'&&assessment.comparison.favored_ids.some(id=>!assessment.arguments.some(a=>a.hypothesis_id===id&&a.relation==='supports')))
  throw Error('mip_hypothesis_support_required')
 return assessment
}
// Reuse durable exact-content RPC recovery with a distinct protocol namespace.
export function hypothesisJournal(journal) {
 if(!journal||typeof journal.putOnce!=='function'||typeof journal.get!=='function')throw Error('mip_remote_journal_required')
 return {putOnce:(key,value)=>journal.putOnce('hypothesis-v1:'+key,value),get:key=>journal.get('hypothesis-v1:'+key)}
}
export async function recoverHypothesisRequest(options) {
 return recoverGenerationRequest({...options,journal:hypothesisJournal(options.journal)})
}
export async function runDurableHypothesisWorker({rpc,journal,runtime,session,method,requestId,sha256}) {
 if(!method||typeof method.evaluate!=='function'||typeof requestId!=='function'||typeof sha256!=='function')
  throw Error('mip_hypothesis_evaluated_method_required')
 const call=durableWorkerRpc({rpc,journal:hypothesisJournal(journal),runtime,session})
 const claimRequest=requestId()
 let job
 try {job=await call('worker_claim',{p_request:claimRequest,p_session:session,p_runtime:runtime})}
 catch {return {state:'claim_ambiguous',recovery_key:'worker_claim:'+claimRequest}}
 if(!job)return {state:'idle'}
 if(!job.lease_token)return {state:'retained_pending_explicit_recovery',generation:job.generation_id}
 let output
 const base={p_session:session,p_runtime:runtime,p_generation:job.generation_id,p_token:job.lease_token,
  p_input_hash:job.input_hash,p_implementation:job.implementation_ref}
 try {
  if(typeof job.input_text!=='string'||await sha256(job.input_text)!==job.input_hash)throw Error('mip_hypothesis_input_digest')
  const inputs=JSON.parse(job.input_text)
  if(inputs.generation_id!==job.generation_id||inputs.method?.revision!==job.method_revision||
   inputs.method.implementation!==job.implementation_ref||method.implementation!==job.implementation_ref||
   method.revision!==job.method_revision||method.model_version!==inputs.method.model_version)
   throw Error('mip_hypothesis_method_binding')
  // The implementation receives retained inputs only. Its qualification is a separate owner gate.
  output=assessmentFromEvaluation(inputs,await method.evaluate(clone(inputs)))
 } catch {
  const request=requestId()
  try {
   const receipt=await call('worker_fail',{...base,p_request:request})
   if(receipt?.state!=='failed'||receipt.generation_id!==job.generation_id||receipt.retained_for_reconciliation!==true)
    throw Error('mip_hypothesis_failure_receipt')
   return {state:'failed',generation:job.generation_id}
  }
  catch {return {state:'failure_ambiguous',generation:job.generation_id,recovery_key:'worker_fail:'+request}}
 }
 const request=requestId()
 try {
  const receipt=await call('worker_complete',{...base,p_request:request,p_output:output})
  if(receipt?.state!=='completed'||receipt.generation_id!==job.generation_id||receipt.publication_allowed!==false)
   throw Error('mip_hypothesis_completion_receipt')
  return {state:'completed',generation:job.generation_id,revision:receipt.revision_id}
 } catch {
  return {state:'completion_ambiguous',generation:job.generation_id,recovery_key:'worker_complete:'+request}
 }
}
