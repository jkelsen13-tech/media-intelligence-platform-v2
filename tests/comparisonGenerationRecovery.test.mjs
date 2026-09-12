import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {fixture} from './isolatedCandidateFixture.mjs'
import {durableWorkerRpc,recoverGenerationRequest,runDurableGenerationWorker} from '../supabase/functions/source-comparison-generation-candidate/durableWorker.js'
const implementation='isolated-event-projection-candidate'
const hash=s=>createHash('sha256').update(s).digest('hex')
function journal(){
 const rows=new Map()
 return {rows,async get(k){return structuredClone(rows.get(k))},
  async putOnce(k,v){if(rows.has(k))assert.deepEqual(rows.get(k),v);else rows.set(k,structuredClone(v))}}
}
test('scoped queue skips earlier foreign work and does not recycle expired processing',async t=>{
 const f=await fixture(t,{extension:true})
 await f.db.query("select comparison_qualification.enqueue('foreign','{}',$1,clock_timestamp())",[implementation])
 const id=await f.capture()
 assert.equal((await f.worker()).generation,id)
 const other=await f.capture()
 const rpc=f.rpc('mip_comparison_worker_v1'),context={p_runtime:'runtime-a',p_session:f.sessions['runtime-a'].mip_comparison_worker_v1}
 assert.equal((await rpc('worker_claim',{...context,p_request:randomUUID()})).generation_id,other)
 await f.db.query("update comparison_qualification.jobs set lease_expires_at=clock_timestamp()-interval '1 hour' where generation_id=$1",[other])
 assert.equal(await rpc('worker_claim',{...context,p_request:randomUUID()}),null)
 assert.equal((await f.db.query('select state,attempt from comparison_qualification.jobs where generation_id=$1',[other])).rows[0].state,'processing')
})
test('source turns allow another eligible source before repeated busy-source work',async t=>{
 const f=await fixture(t,{extension:true})
 await f.capture();await f.capture()
 await f.db.query("select comparison_qualification.bind_source_scope('runtime-a','second')")
 const second=(await f.db.query("select comparison_qualification.enqueue('second','{}',$1,clock_timestamp()) id",[implementation])).rows[0].id
 const rpc=f.rpc('mip_comparison_worker_v1'),context={p_runtime:'runtime-a',p_session:f.sessions['runtime-a'].mip_comparison_worker_v1}
 const first=await rpc('worker_claim',{...context,p_request:randomUUID()})
 assert.equal(first.source_project,'source')
 assert.equal((await rpc('worker_claim',{...context,p_request:randomUUID()})).generation_id,second)
})
for(const revoke of ['source','implementation'])test(revoke+' revocation rejects completion and exact retry',async t=>{
 const f=await fixture(t,{extension:true});await f.capture()
 const base=f.rpc('mip_comparison_worker_v1')
 const result=await f.worker({rpc:async(name,args)=>{
  if(name==='worker_complete')await f.db.query(revoke==='source'
   ?"select comparison_qualification.revoke_source_scope('runtime-a','source')"
   :"select comparison_qualification.revoke_evaluated_implementation('runtime-a',$1)",revoke==='source'?[]:[implementation])
  return base(name,args)
 }})
 assert.equal(result.state,'completion_unconfirmed')
 await assert.rejects(result.retry(),/mip_source_not_in_scope|mip_implementation_not_evaluated/)
 assert.equal((await f.db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,0)
 assert.equal((await f.db.query("select count(*)::int n from comparison_qualification.request_runs where rpc_name='worker_complete'")).rows[0].n,0)
})
test('restart recovery uses persisted identical completion and fresh session after lost response',async t=>{
 const f=await fixture(t,{extension:true});await f.capture();const j=journal()
 const base=f.rpc('mip_comparison_worker_v1');let lose=true
 const result=await runDurableGenerationWorker({journal:j,runtime:'runtime-a',
  session:f.sessions['runtime-a'].mip_comparison_worker_v1,implementation,sha256:hash,requestId:()=>randomUUID(),
  rpc:async(n,a)=>{const result=await base(n,a);if(n==='worker_complete'&&lose){lose=false;throw Error('lost')}return result}})
 assert.equal(result.state,'completion_unconfirmed')
 const key=[...j.rows.keys()].find(k=>k.startsWith('worker_complete:')&&!k.endsWith(':receipt'))
 assert.ok(key)
 const fresh=(await f.db.query("select comparison_qualification.issue_session('mip_comparison_worker_v1','runtime-a','2999-01-01') id")).rows[0].id
 assert.equal(await recoverGenerationRequest({rpc:base,journal:j,runtime:'runtime-a',session:fresh,key}),'completed')
 assert.equal((await f.db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,1)
 await assert.rejects(recoverGenerationRequest({rpc:base,journal:j,runtime:'runtime-b',session:fresh,key}),/mip_recovery_binding/)
 await f.db.query("select comparison_qualification.revoke_principal('runtime-a','mip_comparison_worker_v1')")
 await assert.rejects(recoverGenerationRequest({rpc:base,journal:j,runtime:'runtime-a',session:fresh,key}),/mip_authz_revoked_session/)
})
test('journal failure prevents sending request; session is never retained',async()=>{
 let sent=0
 const rpc=durableWorkerRpc({rpc:async()=>{sent++;return null},runtime:'a',session:'s',
  journal:{get:async()=>null,putOnce:async(k,v)=>{assert.equal(Object.hasOwn(v.args,'p_session'),false);throw Error('unavailable')}}})
 await assert.rejects(rpc('worker_claim',{p_request:'r',p_runtime:'a',p_session:'s'}),/unavailable/)
 assert.equal(sent,0)
})
