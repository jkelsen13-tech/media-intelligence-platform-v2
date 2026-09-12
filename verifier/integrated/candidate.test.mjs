import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {fork} from 'node:child_process'
import {fixture,workerRole,producerRole} from './fixture.mjs'
import {raw,quote as q,guard} from './transport.mjs'
import {issueWorkloadSession} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
guard()
await raw('postgres',"alter system set log_min_error_statement='panic';alter system set log_min_messages='panic';alter system set log_statement='none';select pg_reload_conf();")
await raw('postgres',"do $begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;create role authenticated;create role service_role bypassrls;end if;end $$;")
const signatures={worker_claim:['p_request','p_session','p_runtime'],worker_complete:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation','p_output'],worker_fail:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation']}
const claim=f=>f.rpc('worker_claim',[randomUUID(),f.session,'runtime-a'])
const complete=(f,j)=>f.rpc('worker_complete',[randomUUID(),f.session,'runtime-a',j.generation_id,j.lease_token,j.input_hash,j.implementation_ref,{}])
test('broker issues bound sessions; worker completes retained input through NOLOGIN/FORCE RLS kernel',async t=>{
 const f=await fixture(t);await f.capture();const j=await claim(f)
 assert.equal(await complete(f,j),'completed')
 assert.equal(await f.admin("select count(*) from comparison_qualification.outputs"),'1')
 assert.equal(await f.admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname in ('comparison_qualification','mip_identity') and (r.rolsuper or r.rolbypassrls or r.rolcanlogin)"),'0')
 assert.equal(await f.admin("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('comparison_qualification','mip_identity') and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)"),'0')
 for(const sql of ["select * from mip_identity.sessions","select * from comparison_qualification.outputs","select comparison_qualification.issue_session('mip_comparison_worker_v1','runtime-a','2999-01-01')","set role postgres","set role service_role","set role mip_kernel_owner_v2","select mip_cutover_authority.worker_claim(gen_random_uuid(),gen_random_uuid(),'runtime-a')"])
  await assert.rejects(raw(f.db,'set session authorization '+workerRole+';'+sql),/mip_database_denied/)
})
test('wrong audience, subject, runtime, expiry, token replay and stale config issue are denied',async t=>{
 const f=await fixture(t)
 for(const override of [{aud:'wrong'},{sub:'wrong'},{exp:0}]){
  await assert.rejects(f.issue('runtime-a',workerRole,{token:f.token('runtime-a',workerRole,override)}),/mip_workload_identity_denied/)
 }
 await assert.rejects(f.issue('runtime-b',workerRole,{token:f.token()}),/mip_workload_identity_denied/)
 const token=f.token(),request=randomUUID()
 const session=await f.issue('runtime-a',workerRole,{token,request})
 assert.ok(await f.issue('runtime-a',workerRole,{token,request})===session)
 await assert.rejects(f.issue('runtime-a',workerRole,{token}),/mip_identity_token_replay/)
 const policy=await f.broker('configuration',['runtime-a',workerRole])
 await f.admin("update mip_identity.mapping_heads set active=false where runtime='runtime-a' and principal="+q(workerRole))
 await assert.rejects(issueWorkloadSession({sql:async(name,args)=>name==='configuration'?policy:f.broker(name,args),token:f.token(),runtime:'runtime-a',principal:workerRole,request:randomUUID(),now:Math.floor(Date.now()/1000)}),/mip_identity_mapping_revoked/)
 await assert.rejects(f.rpc('worker_claim',[randomUUID(),session,'runtime-a']),/mip_identity_mapping_revoked/)
})
test('revoked signing key and cross-runtime sessions cannot read retained work',async t=>{
 const f=await fixture(t);await f.capture()
 await assert.rejects(f.rpc('worker_claim',[randomUUID(),f.session,'runtime-b']),/mip_identity_stale_revision/)
 await f.admin('update mip_identity.key_heads set active=false')
 await assert.rejects(claim(f),/mip_identity_key_revoked/)
 await assert.rejects(f.issue(),/mip_identity_key_revoked/)
})
test('encrypted PostgreSQL journal is exact-content, runtime-scoped and committed before acknowledgement',async t=>{
 const f=await fixture(t),j=f.journal(f.session),key='synthetic-entry'
 const value={message:'synthetic-confidential-value',argument:1}
 assert.equal((await j.putOnce(key,value)).committed,true)
 assert.deepEqual(await f.journal(f.session).get(key),value)
 await j.putOnce(key,value)
 await assert.rejects(j.putOnce(key,{...value,argument:2}),/mip_journal_content_conflict/)
 const other=await f.issue('runtime-b')
 assert.equal(await f.journal(other).get(key),null)
 assert.equal(await f.admin("select count(*) from mip_identity.journal where envelope::text like '%synthetic-confidential-value%'"),'0')
 await f.admin("update mip_identity.mapping_heads set active=false where runtime='runtime-a' and principal="+q(workerRole))
 await assert.rejects(j.get(key),/mip_identity_mapping_revoked/)
})
async function childRun(f,session,{killAfter,key}={}){
 const child=fork(new URL('./workerProcess.mjs',import.meta.url),[],{silent:true,env:{}})
 // No broker/database credentials, journal key, or service-role client is passed.
 const journal=f.journal(session),keys=[]
 return new Promise((resolve,reject)=>{
  let killed=false,finished=false
  child.stdout.resume();child.stderr.resume()
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('mip_child_timeout'))},30000)
  child.on('message',async m=>{
   if(m.done){finished=true;clearTimeout(timer);child.kill();resolve({state:m.state,keys});return}
   try{
    if(m.kind==='journal'&&m.name==='putOnce')keys.push(m.args[0])
    const result=m.kind==='journal'?await journal[m.name](...m.args):await f.rpc(m.name,signatures[m.name].map(k=>m.args[k]))
    if(m.kind==='rpc'&&m.name===killAfter){killed=true;clearTimeout(timer);child.kill('SIGKILL');return}
    if(child.connected)child.send({reply:true,id:m.id,result})
   }catch(error){if(child.connected)child.send({reply:true,id:m.id,error:error.message.startsWith('mip_')?error.message:'mip_operation_failed'})}
  })
  child.on('exit',()=>{clearTimeout(timer);if(killed)resolve({state:'terminated',keys});else if(!finished)reject(Error('mip_child_exited'))})
  child.send({start:true,session,runtime:'runtime-a',key})
 })
}
test('SIGKILL after committed completion recovers in a new process from encrypted remote journal',async t=>{
 const f=await fixture(t);await f.capture()
 const killed=await childRun(f,f.session,{killAfter:'worker_complete'})
 assert.equal(killed.state,'terminated')
 const key=killed.keys.find(k=>k.startsWith('worker_complete:')&&!k.endsWith(':receipt'))
 assert.ok(key)
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'1')
 const fresh=await f.issue()
 const recovered=await childRun(f,fresh,{key})
 assert.equal(recovered.state,'completed')
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'1')
 assert.equal(await f.admin("select count(*) from comparison_qualification.request_runs where rpc_name='worker_complete'"),'1')
})
test('SIGKILL after claim preserves stranded processing and requires explicit reconciliation',async t=>{
 const f=await fixture(t);await f.capture()
 const killed=await childRun(f,f.session,{killAfter:'worker_claim'})
 const key=killed.keys.find(k=>k.startsWith('worker_claim:'))
 const recovered=await childRun(f,await f.issue(),{key})
 assert.equal(recovered.state,'retained_pending_explicit_recovery')
 assert.equal(await f.admin('select state from comparison_qualification.jobs'),'processing')
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'0')
 assert.equal(await f.rpc('worker_claim',[randomUUID(),await f.issue(),'runtime-a']),null)
})
