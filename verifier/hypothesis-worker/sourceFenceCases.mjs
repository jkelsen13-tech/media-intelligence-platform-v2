// Native source-side fencing in the already-authorized disposable database only.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {quote as q} from '../integrated/transport.mjs'
import {hold,blocked} from './fixture.mjs'
import {recordPgoutputBatch,decodeRevisionCommits} from '../../supabase/qualification/hypothesis-assessments/pgoutputRecorder.mjs'
import {createFencedAcknowledgement} from '../../supabase/qualification/hypothesis-assessments/fencedAcknowledgement.mjs'
export async function nativeAckBoundary(f,{journal,context,slot,runtime,session,observationEpoch}){
 const bindingId=randomUUID()
 await f.admin('insert into mip_temporal.source_versions values('+[
  bindingId,context.source_id,context.stream_epoch,runtime,slot,f.db,observationEpoch,'synthetic-owner-recording-fixture'].map(q).join(',')+
  ');insert into mip_temporal.source_heads values('+[context.source_id,bindingId,true].map(q).join(',')+');')
 const prepareSql=p=>'select mip_temporal.prepare_advance('+[
  p.session,p.bindingId,p.source,p.stream,p.request,p.end,p.hash].map(q).join(',')+');'
 const advanceSql=p=>'select mip_temporal.advance('+[p.session,p.request].map(q).join(',')+');'
 const prepare=async p=>f.admin('set session authorization mip_temporal_recorder;'+prepareSql(p))
 const advance=async p=>JSON.parse(await f.admin('set session authorization mip_temporal_ack_gateway;'+advanceSql(p)))
 const options={bindingId,context,session,journal,prepare,advance}
 return {bindingId,options,prepareSql,advanceSql,fenced:createFencedAcknowledgement(options),
 revokeSql:'update mip_temporal.source_heads set active=false where source_id='+q(context.source_id)+';'}
}
export async function sourceFenceCases(t,f,{journal,runtime,session,observationEpoch,relationId,pub,runWorker}){
 async function staged(t){
  const slot='synthetic_fence_'+randomUUID().replaceAll('-','')
  await f.admin('select slot_name from pg_create_logical_replication_slot('+q(slot)+",'pgoutput');")
  t.after(()=>f.admin('select pg_drop_replication_slot('+q(slot)+');'))
  const context={source_id:randomUUID(),stream_epoch:randomUUID()}
  const boundary=await nativeAckBoundary(f,{journal,context,slot,runtime,session,observationEpoch})
  const v=await f.investigation();await v.captureGeneration();await runWorker(v)
  const frames=JSON.parse(await f.admin("select coalesce(jsonb_agg(encode(data,'hex') order by sequence),'[]') from pg_logical_slot_peek_binary_changes("+
   q(slot)+",null,null,'proto_version','1','publication_names',"+q(pub)+",'binary','false','streaming','false','messages','false') with ordinality as c(lsn,xid,data,sequence);")).map(x=>Buffer.from(x,'hex'))
  const decoded=decodeRevisionCommits(frames,{relationId,observationEpoch})
  assert.equal(decoded.length,1)
  let request
  const capture=createFencedAcknowledgement({...boundary.options,advance:async p=>{request=p;throw Error('synthetic_hold_before_advance')}})
  await assert.rejects(()=>recordPgoutputBatch({frames,relationId,observationEpoch,context,journal,acknowledge:capture}),/synthetic_hold_before_advance/)
  const position={...context,commit_lsn:decoded[0].input.commit_lsn,end_lsn:decoded[0].end_lsn}
  const confirmed=()=>f.admin('select confirmed_flush_lsn::text from pg_replication_slots where slot_name='+q(slot))
  const receipts=()=>f.admin('select count(*) from mip_temporal.advance_receipts where request_id='+q(request.request))
  const permits=()=>f.admin('select count(*) from mip_temporal.advance_permits where request_id='+q(request.request))
  return {...boundary,request,context,slot,position,confirmed,receipts,permits}
 }
 await t.test('source acknowledgement roles cannot self-grant permits, mutate bindings or inherit replication ownership',async t=>{
  const b=await staged(t)
  assert.equal(await f.admin("select count(*) from pg_roles where rolname in ('mip_temporal_registry_owner','mip_temporal_advance_owner','mip_temporal_recorder','mip_temporal_ack_gateway') and (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)"),'0')
  assert.equal(await f.admin("select pg_has_role('mip_temporal_ack_gateway','mip_temporal_advance_owner','MEMBER')"),'f')
  assert.equal(await f.admin("select rolreplication from pg_roles where rolname='mip_temporal_ack_gateway'"),'f')
  const before=await b.confirmed()
  await assert.rejects(()=>b.options.advance({...b.request,session:f.session}))
  await assert.rejects(()=>b.options.advance({...b.request,session:null}))
  await assert.rejects(()=>f.admin('set session authorization mip_temporal_ack_gateway;select pg_replication_slot_advance('+q(b.slot)+','+q(b.position.end_lsn)+');'))
  await assert.rejects(()=>f.admin('set session authorization mip_temporal_recorder;'+b.revokeSql))
  await assert.rejects(()=>f.admin('set session authorization mip_comparison_worker_v1;'+b.advanceSql(b.request)))
  await assert.rejects(()=>f.admin('set session authorization service_role;'+b.advanceSql(b.request)))
  assert.equal(await b.confirmed(),before)
 })
 await t.test('source acknowledgement rejects an uncommitted permit even in a privileged multi-role test transaction',async t=>{
  const b=await staged(t),request=randomUUID()
  const saved=JSON.parse(await f.admin('select to_jsonb(p) from mip_temporal.advance_permits p where request_id='+q(b.request.request)))
  const p={...b.options,source:b.context.source_id,stream:b.context.stream_epoch,request,end:b.position.end_lsn,hash:saved.delivery_hash}
  const before=await b.confirmed()
  await assert.rejects(()=>f.admin('begin;set local role mip_temporal_recorder;'+b.prepareSql(p)+
   'set local role mip_temporal_ack_gateway;'+b.advanceSql({session,request})+'commit;'),/mip_temporal_committed_permit_required/)
  assert.equal(await b.confirmed(),before)
  assert.equal(await f.admin('select count(*) from mip_temporal.advance_permits where request_id='+q(request)),'0')
 })
 await t.test('slot advancement survives SQL rollback; committed permit remains and exact retry reconciles lost receipt',async t=>{
  const b=await staged(t),held=await hold(f.db,b.advanceSql(b.request),'mip_temporal_ack_gateway')
  await held.finish(false)
  assert.equal(await b.confirmed(),b.position.end_lsn)
  assert.equal(await b.permits(),'1');assert.equal(await b.receipts(),'0')
  const restarted=createFencedAcknowledgement({...b.options,session:await f.issue(runtime,'mip_comparison_producer_v1')})
  assert.equal((await restarted(b.position)).state,'slot_advance_observed')
  assert.equal(await b.receipts(),'1')
 })
 await t.test('acknowledgement locks first: actual advancement completes and source revocation waits',async t=>{
  const b=await staged(t),held=await hold(f.db,b.advanceSql(b.request),'mip_temporal_ack_gateway')
  const revocation=f.admin(b.revokeSql)
  await blocked(f,held.pid);await held.finish(true);await revocation
  assert.equal(await b.confirmed(),b.position.end_lsn);assert.equal(await b.receipts(),'1')
  await assert.rejects(()=>b.fenced(b.position),/mip_temporal_binding_denied/)
  await assert.rejects(()=>f.admin('update mip_temporal.source_heads set active=true where source_id='+q(b.context.source_id)),/mip_temporal_fresh_binding_required/)
 })
 await t.test('source revocation commits first: waiting acknowledgement denies without advancing or deleting its permit',async t=>{
  const b=await staged(t),before=await b.confirmed(),held=await hold(f.db,b.revokeSql)
  const result=f.admin('set session authorization mip_temporal_ack_gateway;'+b.advanceSql(b.request))
  const rejection=assert.rejects(()=>result,/mip_temporal_binding_denied/)
  await blocked(f,held.pid);await held.finish(true);await rejection
  assert.equal(await b.confirmed(),before);assert.equal(await b.permits(),'1');assert.equal(await b.receipts(),'0')
 })
}
