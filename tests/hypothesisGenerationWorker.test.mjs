import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {syntheticAuthoringContext} from './hypothesisComposerFixture.mjs'
import {syntheticEvaluation} from '../verifier/hypothesis-worker/syntheticMethod.mjs'
import {assessmentFromEvaluation,runDurableHypothesisWorker,hypothesisJournal} from '../supabase/qualification/hypothesis-assessments/worker.mjs'
const sha=s=>createHash('sha256').update(s).digest('hex')
function generation() {
 const context=syntheticAuthoringContext(),m=context.materials[0]
 return {contract_version:'mip_hypothesis_generation_v1',generation_id:randomUUID(),context,
  hypotheses:[{id:'a',definition:'Synthetic A.'},{id:'b',definition:'Synthetic B.'}],hypothesis_relationship:'not_established',
  method:{revision:randomUUID(),implementation:'synthetic-v1',model_version:'none',qualification:'synthetic_mechanism_only',parameters:{}},
  spans:[{id:'s1',input_position:m.input_position,material_version:m.material_version,acquired_at:m.acquired_at,published_at:null,event_time:null,
   excerpt:'😀 B',source_span:{source_field:'summary',start:2,end:5,excerpt_sha256:sha('😀 B')}}]}
}
test('worker constructs saved argument from retained identities and separate missing estimates',()=>{
 const g=generation(),a=assessmentFromEvaluation(g,syntheticEvaluation(g))
 assert.equal(a.evidence[0].input_position,'9007199254740993')
 assert.equal(a.evidence[0].origin_group,null)
 assert.equal(a.hypotheses[0].likelihood.kind,'not_estimated')
 assert.equal(a.hypotheses[0].confidence.kind,'not_estimated')
 assert.equal(a.evidence[0].quality.kind,'not_estimated')
 assert.equal(a.arguments[0].relevance.kind,'not_estimated')
 assert.equal(a.comparison.confidence.kind,'not_estimated')
 assert.equal(a.release_state,'private');assert.equal(a.review_state,'unreviewed')
 assert.equal(a.method_version,g.method.implementation)
 assert.equal(Object.hasOwn(a.evidence[0],'excerpt'),false)
})
test('worker rejects invented scores, source identities and publication keys in method output',()=>{
 const g=generation(),e=syntheticEvaluation(g)
 for(const mutate of [x=>x.release_state='public',x=>x.comparison.confidence={kind:'probability',value:1},
  x=>x.evidence_claims[0].material_version='invented',x=>x.arguments[0].relevance={kind:'qualitative',label:'high'}]){
  const changed=structuredClone(e);mutate(changed)
  assert.throws(()=>assessmentFromEvaluation(g,changed),/mip_hypothesis_evaluation_shape/)
 }
})
test('worker rejects evidence omission and allegation-report substitution for support',()=>{
 const g=generation(),e=syntheticEvaluation(g)
 assert.throws(()=>assessmentFromEvaluation(g,{...e,evidence_claims:[]}),/mip_hypothesis_evidence_binding/)
 e.comparison.state='better_supported';e.comparison.favored_ids=['a'];e.arguments[0].relation='reports_allegation'
 assert.throws(()=>assessmentFromEvaluation(g,e),/mip_hypothesis_support_required/)
})
test('hypothesis journal namespace cannot silently use comparison request keys',async()=>{
 let key
 const j=hypothesisJournal({putOnce:async k=>key=k,get:async k=>key=k})
 await j.putOnce('worker_complete:synthetic',{})
 assert.equal(key,'hypothesis-v1:worker_complete:synthetic')
 await j.get('worker_claim:synthetic')
 assert.equal(key,'hypothesis-v1:worker_claim:synthetic')
})
test('worker refuses missing durable journal before claiming',async()=>{
 await assert.rejects(runDurableHypothesisWorker({method:{evaluate:()=>{}},requestId:randomUUID,sha256:sha}),/mip_remote_journal_required/)
})
test('bad retained byte hash fails computation without invoking method',async()=>{
 const g=generation(),input=JSON.stringify(g);let evaluated=false,failed=false
 const result=await runDurableHypothesisWorker({runtime:'synthetic',session:'synthetic-session',requestId:randomUUID,sha256:sha,
  method:{...g.method,evaluate:()=>{evaluated=true}},
  journal:{putOnce:async()=>({committed:true}),get:async()=>null}, // Synthetic RPC-order unit stub; durable proof is native CI.
  rpc:async name=>name==='worker_claim'?{generation_id:g.generation_id,lease_token:'synthetic-token',input_text:input,input_hash:'0'.repeat(64),
   method_revision:g.method.revision,implementation_ref:g.method.implementation}:(failed=true,{state:'failed'})})
 assert.equal(evaluated,false);assert.equal(failed,true);assert.equal(result.state,'failed')
})
test('journal commit failure prevents RPC and leaves an explicit ambiguous claim',async()=>{
 let called=false
 const result=await runDurableHypothesisWorker({runtime:'synthetic',session:'synthetic-session',requestId:randomUUID,sha256:sha,
  method:{evaluate:()=>{}},journal:{putOnce:async()=>{throw Error('synthetic ambiguous durable ack')},get:async()=>null},
  rpc:async()=>{called=true}})
 assert.equal(called,false);assert.equal(result.state,'claim_ambiguous')
 assert.ok(result.recovery_key.startsWith('worker_claim:'))
})
