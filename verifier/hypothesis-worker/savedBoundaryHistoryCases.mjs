import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {quote as q,guard} from '../integrated/transport.mjs'
import {hold,blocked} from './fixture.mjs'
import {deliverSavedBoundaryHistory} from '../../supabase/qualification/hypothesis-assessments/savedBoundaryHistory.mjs'

// One actual authenticated PostgreSQL backend and transaction for all coordinator queries.
// This adapter is fixed to disposable GitHub CI; no user DSN, production credential or network target.
function transaction(db,onPid=()=>{}){
 return async run=>{
  guard()
  const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres','-d',db],
   {env:{PATH:process.env.PATH,PGPASSWORD:'mip-disposable-ci-only',PGOPTIONS:'-c statement_timeout=20000 -c lock_timeout=15000'},stdio:['pipe','pipe','pipe']})
  let buffer='',pending=null,failed=false
  const fail=()=>{failed=true;if(pending){pending.reject(Error('mip_boundary_native_query_failed'));pending=null}}
  child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail)
  child.stderr.on('data',x=>{if(String(x).includes('ERROR'))fail()})
  child.stdout.on('data',data=>{
   buffer+=data
   let end
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1)
    if(line&&pending){const p=pending;pending=null;p.resolve(line)}
   }
  })
  const line=statement=>new Promise((resolve,reject)=>{
   if(failed||pending)return reject(Error('mip_boundary_native_query_failed'))
   const timer=setTimeout(()=>{fail();child.kill()},30000)
   pending={resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}}
   child.stdin.write(statement+';\n')
  })
  try{
   const pid=Number(await line('set session authorization mip_boundary_history_gateway;begin;select pg_backend_pid()'))
   onPid(pid)
   const result=await run(async(sql,args)=>{
    if(!sql.startsWith('select mip_temporal.read_boundary_history('))throw Error('mip_test_query_denied')
    const value=JSON.parse(await line('select mip_temporal.read_boundary_history('+args.map(q).join(',')+')'))
    return {rows:[{value}]}
   })
   await line("commit;select 'COMMITTED'")
   return result
  }catch(error){child.stdin.write('rollback;\n');throw error}
  finally{child.stdin.end();child.kill()}
 }
}
export async function savedBoundaryHistoryCases(t,f,prepared){
 await f.admin(await readFile(new URL('../../supabase/qualification/hypothesis-assessments/023_saved_boundary_history.sql',import.meta.url),'utf8'))
 async function context(t){
  const x=await prepared(t)
  const identity=JSON.parse(await f.admin('select jsonb_build_object(\'user\',author_id,\'iid\',investigation_id) from mip_hypothesis.revisions where id='+q(x.revisions[0])))
  const options={prefix:x.options,session:x.b.session(),verifiedUserId:identity.user,investigationId:identity.iid,
   withAuthority:x.b.withAuthority,withTransaction:transaction(f.db)}
  const args=[x.b.session(),x.b.bindingId,x.b.incarnationId,x.b.contractDigest,x.b.registration.source,x.b.registration.stream,
   f.observationEpoch,x.last.id,x.last.target_marker,identity.user,identity.iid]
  const statement='select mip_temporal.read_boundary_history('+args.map(q).join(',')+')'
  return {...x,identity,options,args,statement}
 }
 await t.test('combined native source and current permission delivery excludes later revisions and source-wide metadata',async t=>{
  const x=await context(t);await x.b.produce()
  let response
  const receipt=await deliverSavedBoundaryHistory({...x.options,deliver:async value=>{response=value}})
  assert.equal(receipt.delivered,true);assert.ok(response.entries.some(e=>e.revision_id===x.revisions[0]))
  assert.ok(response.entries.every(e=>e.assessment?.question_id===x.identity.iid||e.status==='withheld'))
  assert.equal(response.temporal_scope,'saved_boundary_current_permission')
  assert.equal(Object.hasOwn(response,'revision_ids'),false)
  for(const k of ['source_authority_qualified','user_history_qualified','historical_time_qualified','publication_allowed'])assert.equal(response[k],false)
 })
 await t.test('combined reader denies wrong native incarnation source stream and terminal; public and existing workers have no gateway grant',async t=>{
  const x=await context(t)
  for(const index of [2,4,5,6,7,8,9]){
   const args=[...x.args];args[index]=randomUUID()
   await assert.rejects(()=>f.admin('set session authorization mip_boundary_history_gateway;select mip_temporal.read_boundary_history('+args.map(q).join(',')+')'))
  }
  for(const role of ['anon','authenticated','service_role','mip_temporal_recorder','mip_temporal_ack_gateway','mip_comparison_worker_v1'])
   await assert.rejects(()=>f.admin('set session authorization '+role+';'+x.statement))
  let delivered=false
  await x.b.replaceCustody()
  await assert.rejects(()=>deliverSavedBoundaryHistory({...x.options,deliver:()=>{delivered=true}}))
  assert.equal(delivered,false)
 })
 await t.test('source and membership revoke-first prevent delivery; revoked material stays withheld',async t=>{
  for(const fault of ['source','membership','material']){
   const x=await context(t)
   if(fault==='source')await f.admin(x.b.revokeSql)
   if(fault==='membership')await f.pub('mip_investigation_workspace_v1','set_access',{investigation_id:x.identity.iid,user_id:x.identity.user,access_role:'revoked',reason:'Synthetic.'})
   if(fault==='material')await f.admin("update mip_identity.operation_evidence_heads set active=false where scope->>'material_version' in (select e->>'material_hash' from mip_hypothesis.acceptance_bindings b cross join lateral jsonb_array_elements(b.metadata) e where b.revision_id="+q(x.revisions[0])+")")
   let response
   const run=()=>deliverSavedBoundaryHistory({...x.options,deliver:v=>{response=v}})
   if(fault==='material'){await run();assert.equal(response.entries.find(e=>e.revision_id===x.revisions[0]).status,'withheld');assert.equal(JSON.stringify(response).includes('Synthetic explanation A.'),false)}
   else {await assert.rejects(run);assert.equal(response,undefined)}
  }
 })
 await t.test('reader holds source and membership fences through awaited delivery on same native backend',async t=>{
  for(const fault of ['source','membership']){
   const x=await context(t);let ready,release,pid
   const entered=new Promise(r=>ready=r),gate=new Promise(r=>release=r)
   const read=deliverSavedBoundaryHistory({...x.options,withTransaction:transaction(f.db,v=>pid=v),deliver:async()=>{ready();await gate}})
   let timer,revoke
   try{
    await Promise.race([entered,read.then(()=>{throw Error('delivery_not_entered')}),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('mip_delivery_readiness_timeout')),30000)})])
    clearTimeout(timer)
    revoke=fault==='source'?f.admin(x.b.revokeSql):f.pub('mip_investigation_workspace_v1','set_access',{investigation_id:x.identity.iid,user_id:x.identity.user,access_role:'revoked',reason:'Synthetic.'})
    revoke.catch(()=>{})
    await blocked(f,fault==='source'?x.b.custodyPid():pid)
   }finally{clearTimeout(timer);release();await Promise.all([read,...(revoke?[revoke]:[])])}
   await assert.rejects(()=>deliverSavedBoundaryHistory({...x.options,deliver:()=>{throw Error('unexpected_delivery')}}))
  }
 })
 await t.test('native identity drift and terminal receipt loss deny combined delivery',async t=>{
  for(const fault of ['identity','receipt']){
   const x=await context(t)
   // Disposable fault injection: emulate stale cloned native registration or missing retained terminal.
   if(fault==='identity')await f.admin("alter table mip_temporal.source_incarnations disable trigger immutable_rows;update mip_temporal.source_incarnations set postmaster_started_at=postmaster_started_at-interval '1 second' where binding_id="+q(x.b.bindingId)+";alter table mip_temporal.source_incarnations enable trigger immutable_rows;")
   else await f.admin('alter table mip_temporal.stream_checkpoints disable trigger immutable_rows;delete from mip_temporal.stream_checkpoints where capture_id='+q(x.last.id)+';alter table mip_temporal.stream_checkpoints enable trigger immutable_rows;')
   let delivered=false
   await assert.rejects(()=>deliverSavedBoundaryHistory({...x.options,deliver:()=>{delivered=true}}));assert.equal(delivered,false)
  }
 })
}
