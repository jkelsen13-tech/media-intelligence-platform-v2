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
export async function fixture(t,{extension=false}={}){
 const db=await PGlite.create();t.after(()=>db.close())
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
 for(const file of ['contract.sql','selection.sql','capability.sql','source-fixture.sql','source-snapshot.sql'])
   await db.exec(await read(root+'comparison-generations/'+file))
 for(const file of ['001_execute_only_identities.sql','002_candidate_interfaces.sql'])
   await db.exec(await read(root+'mip-cutover-authority/'+file))
 if(extension)await db.exec(await read(root+'mip-cutover-authority/003_scoped_queue.sql'))
 const sessions={}
 for(const runtime of ['runtime-a','runtime-b']){
  await db.query('insert into mip_cutover_authority.runtime_config values($1,$2,$3,$4)',[runtime,'source',implementation,JSON.stringify({entries:[]})])
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