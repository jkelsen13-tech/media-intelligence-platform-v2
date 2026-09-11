import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {runGenerationWorker} from '../supabase/functions/source-comparison-generation-candidate/worker.js'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const root='supabase/qualification/'
const implementation='isolated-event-projection-candidate'
const hash=s=>createHash('sha256').update(s).digest('hex')
async function fixture(t){
 const db=await PGlite.create();t.after(()=>db.close())
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
 for(const file of ['contract.sql','selection.sql','capability.sql','source-fixture.sql','source-snapshot.sql'])
   await db.exec(await read(root+'comparison-generations/'+file))
 for(const file of ['001_execute_only_identities.sql','002_candidate_interfaces.sql'])
   await db.exec(await read(root+'mip-cutover-authority/'+file))
 const sessions={}
 for(const runtime of ['runtime-a','runtime-b']){
  await db.query('insert into mip_cutover_authority.runtime_config values($1,$2,$3,$4)',[runtime,'source',implementation,JSON.stringify({})])
  await db.query('select comparison_qualification.bind_source_scope($1,$2)',[runtime,'source'])
  await db.query('select comparison_qualification.bind_evaluated_implementation($1,$2)',[runtime,implementation])
  sessions[runtime]={}
  for(const [role,rpcs] of Object.entries({
   mip_comparison_producer_v1:['producer_enqueue'],
   mip_comparison_worker_v1:['worker_claim','worker_complete','worker_fail']})){
    for(const rpc of rpcs)await db.query('select comparison_qualification.bind_runtime($1,$2,$3)',[runtime,role,rpc])
    sessions[runtime][role]=(await db.query("select comparison_qualification.issue_session($1,$2,'2999-01-01') id",[role,runtime])).rows[0].id
  }
 }
 const signatures={
  producer_enqueue:['p_request','p_session','p_runtime','p_payload','p_observed'],
  worker_claim:['p_request','p_session','p_runtime'],
  worker_complete:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation','p_output'],
  worker_fail:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation']}
 const rpc=role=>async(name,args)=>{
  const keys=signatures[name];if(!keys)throw new Error('RPC not allowed')
  await db.exec('set role '+role)
  try{return(await db.query('select mip_cutover_authority.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') result',
   keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]))).rows[0].result}
  finally{await db.exec('reset role')}
 }
 const producer=rpc('mip_comparison_producer_v1')
 const capture=(request=randomUUID(),runtime='runtime-a')=>producer('producer_enqueue',{p_request:request,
  p_session:sessions[runtime].mip_comparison_producer_v1,p_runtime:runtime,p_payload:{},p_observed:null})
 const worker=(extra={})=>runGenerationWorker({rpc:rpc('mip_comparison_worker_v1'),requestId:()=>randomUUID(),
  session:sessions['runtime-a'].mip_comparison_worker_v1,runtime:'runtime-a',implementation,sha256:hash,...extra})
 return {db,sessions,rpc,capture,worker}
}
test('actual candidate computes from retained capture after source mutation and atomically completes',async t=>{
 const f=await fixture(t);const id=await f.capture()
 const before=(await f.db.query('select input_hash,input_payload::text input from comparison_qualification.generations where id=$1',[id])).rows[0]
 await f.db.exec("update public.articles set title='Changed after capture',summary='Changed after capture'")
 const result=await f.worker()
 assert.equal(result.state,'completed')
 const row=(await f.db.query('select g.input_hash,g.input_payload::text input,o.output_payload,j.state from comparison_qualification.generations g join comparison_qualification.outputs o on o.generation_id=g.id join comparison_qualification.jobs j on j.generation_id=g.id')).rows[0]
 assert.equal(row.input,before.input);assert.equal(row.input_hash,before.input_hash)
 assert.match(row.input,/9007199254740993/)
 assert.equal(row.state,'completed')
 assert.ok(row.output_payload.projection.claims.length>0)
 assert.doesNotMatch(JSON.stringify(row.output_payload),/Changed after capture/)
 assert.equal(row.output_payload.input_hash,before.input_hash)
})
test('candidate roles deny broad kernel access, escalation, foreign runtime and foreign replay',async t=>{
 const f=await fixture(t);const request=randomUUID();const id=await f.capture(request)
 assert.equal(await f.capture(request),id)
 await assert.rejects(f.capture(request,'runtime-b'),/mip_request_replay_owner/)
 await assert.rejects(f.rpc('mip_comparison_worker_v1')('worker_claim',{p_request:randomUUID(),
  p_runtime:'runtime-b',p_session:f.sessions['runtime-a'].mip_comparison_worker_v1}),/mip_authz_runtime_mismatch/)
 for(const role of ['mip_comparison_worker_v1','service_role']){
  await f.db.exec('set role '+role)
  try{
   await assert.rejects(f.db.query('select comparison_qualification.claim()'),/permission denied/)
   await assert.rejects(f.db.query('select * from comparison_qualification.generations'),/permission denied/)
  }finally{await f.db.exec('reset role')}
 }
 await f.db.exec('set role mip_comparison_worker_v1')
 try{await assert.rejects(f.db.query("select comparison_qualification.issue_session('mip_comparison_worker_v1','runtime-a','2999-01-01')"),/permission denied/)}
 finally{await f.db.exec('reset role')}
 await assert.rejects(f.rpc('mip_comparison_producer_v1')('worker_claim',{p_request:randomUUID(),
  p_runtime:'runtime-a',p_session:f.sessions['runtime-a'].mip_comparison_producer_v1}),/permission denied/)
})
test('revocation after computation prevents completion and does not invent recovery',async t=>{
 const f=await fixture(t);await f.capture()
 const base=f.rpc('mip_comparison_worker_v1')
 const result=await f.worker({rpc:async(name,args)=>{
  if(name==='worker_complete')await f.db.query("select comparison_qualification.revoke_principal('runtime-a','mip_comparison_worker_v1')")
  return base(name,args)
 }})
 assert.equal(result.state,'completion_unconfirmed')
 assert.equal((await f.db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,0)
 assert.equal((await f.db.query('select state from comparison_qualification.jobs')).rows[0].state,'processing')
 await assert.rejects(result.retry(),/mip_authz_revoked_session/)
})
test('lost completion response retries identical operation and produces one durable output',async t=>{
 const f=await fixture(t);await f.capture();const base=f.rpc('mip_comparison_worker_v1');let lost=true
 const result=await f.worker({rpc:async(name,args)=>{
  const value=await base(name,args)
  if(name==='worker_complete'&&lost){lost=false;throw new Error('synthetic lost response')}
  return value
 }})
 assert.equal(result.state,'completion_unconfirmed');assert.equal(await result.retry(),'completed')
 assert.equal((await f.db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,1)
})
test('invalid retained input hash produces terminal failure without durable semantic output',async t=>{
 const f=await fixture(t);await f.capture()
 assert.equal((await f.worker({sha256:()=> '0'.repeat(64)})).state,'failed')
 assert.equal((await f.db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,0)
 assert.equal((await f.db.query('select count(*)::int n from comparison_qualification.failure_reports')).rows[0].n,1)
})

test('another authorized runtime cannot complete a lease even with its token',async t=>{
 const f=await fixture(t);await f.capture();const rpc=f.rpc('mip_comparison_worker_v1')
 const claimed=await rpc('worker_claim',{p_request:randomUUID(),p_runtime:'runtime-a',p_session:f.sessions['runtime-a'].mip_comparison_worker_v1})
 await assert.rejects(rpc('worker_complete',{p_request:randomUUID(),p_runtime:'runtime-b',
  p_session:f.sessions['runtime-b'].mip_comparison_worker_v1,p_generation:claimed.generation_id,
  p_token:claimed.lease_token,p_input_hash:claimed.input_hash,p_implementation:claimed.implementation_ref,p_output:{claims:[]}}),/mip_lease_owner_mismatch/)
 assert.equal((await f.db.query('select count(*)::int n from comparison_qualification.outputs')).rows[0].n,0)
})
