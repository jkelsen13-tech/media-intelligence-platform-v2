import {restartRemoteStore} from '../integrated/remoteStoreRestart.mjs'
// Native incarnation guards in the disposable database; registrations and mismatches are synthetic.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {quote as q,raw,guard} from '../integrated/transport.mjs'
import {hold,blocked} from './fixture.mjs'
import {createIncarnationBoundTransport} from '../../supabase/qualification/hypothesis-assessments/sourceIncarnation.mjs'
export async function incarnationCases(t,f,staged){
 await f.admin(await readFile(new URL('../../supabase/qualification/hypothesis-assessments/020_native_source_incarnation.sql',import.meta.url),'utf8'))
 const transport=id=>createIncarnationBoundTransport({incarnationId:id,call:async(name,args)=>{
  if(!['capture_incarnation','prepare_incarnation','advance_incarnation'].includes(name))throw Error('synthetic_rpc_denied')
  const role=name==='advance_incarnation'?'mip_temporal_ack_gateway':'mip_temporal_recorder'
  const result=await f.admin('set session authorization '+role+';select mip_temporal.'+name+'('+args.map(q).join(',')+');')
  return name==='prepare_incarnation'?result:JSON.parse(result)
 }})
 const register=async(b,{field}={})=>{
  const id=randomUUID()
  await f.admin('insert into mip_temporal.source_incarnations select '+q(b.bindingId)+','+q(id)+','+
   (field==='system'?"'synthetic-different-cluster'":'c.system_identifier::text')+','+
   (field==='database'?'0::oid':'d.oid')+','+
   (field==='startup'?"pg_postmaster_start_time()-interval '1 second'":'pg_postmaster_start_time()')+','+
   q('synthetic-native-registration-fixture')+' from pg_control_system() c cross join pg_database d where d.datname=current_database();')
  return id
 }
 const capture=(b,api)=>api.capture({session:b.session(),bindingId:b.bindingId,before:b.before,request:randomUUID()})
 const prepared=async t=>{
  const b=await staged(t),id=await register(b),api=transport(id)
  await b.produce()
  const c=await capture(b,api);let request
  await assert.rejects(()=>b.consume(c,{prepare:api.prepare,advance:async p=>{request=p;throw Error('synthetic_hold_incarnation')}}),/synthetic_hold_incarnation/)
  return {b,id,api,c,request,sql:'select mip_temporal.advance_incarnation('+[request.session,request.request,id].map(q).join(',')+');'}
 }
 await t.test('explicit registration permits covered completion and fresh-session exact receipt replay',async t=>{
  const {b,api,c}=await prepared(t)
  await b.consume(c,{prepare:api.prepare,advance:api.advance})
  assert.equal(await b.confirmed(),c.end_lsn);assert.equal(await b.checkpointCount(),'1')
  await b.refresh()
  await b.consume(c,{prepare:api.prepare,advance:api.advance})
  assert.equal(await b.checkpointCount(),'1')
 })
 await t.test('missing or mismatched external pin denies capture, preparation and receipt replay',async t=>{
  const b=await staged(t),missing=transport(randomUUID())
  await assert.rejects(()=>capture(b,missing),/mip_source_incarnation_denied/)
  const id=await register(b),api=transport(id);await b.produce()
  await assert.rejects(()=>capture(b,missing),/mip_source_incarnation_denied/)
  const c=await capture(b,api)
  await assert.rejects(()=>b.consume(c,{prepare:missing.prepare,advance:api.advance}),/mip_source_incarnation_denied/)
  let request
  await assert.rejects(()=>b.consume(c,{prepare:api.prepare,advance:async p=>{request=p;throw Error('synthetic_hold_incarnation')}}),/synthetic_hold_incarnation/)
  await assert.rejects(()=>missing.advance(request),/mip_source_incarnation_denied/)
  assert.equal(await b.confirmed(),b.before)
  await b.consume(c,{prepare:api.prepare,advance:api.advance})
  await assert.rejects(()=>missing.advance(request),/mip_source_incarnation_denied/)
  assert.equal(await b.checkpointCount(),'1')
 })
 await t.test('simulated cluster, database-object and startup mismatches deny native capture without rewriting history',async t=>{
  for(const field of ['system','database','startup']){
   const b=await staged(t),id=await register(b,{field}),api=transport(id)
   await assert.rejects(()=>capture(b,api),/mip_source_native_identity_changed/)
   assert.equal(await b.confirmed(),b.before)
   assert.equal(await f.admin('select count(*) from mip_temporal.source_incarnations where binding_id='+q(b.bindingId)),'1')
   assert.equal(await b.checkpointCount(),'0')
  }
 })
 await t.test('registration is immutable and gateways cannot inspect control data or bypass the incarnation interface',async t=>{
  const b=await staged(t),id=await register(b)
  for(const role of ['mip_temporal_recorder','mip_temporal_ack_gateway','mip_comparison_worker_v1','service_role']){
   await assert.rejects(()=>f.admin('set session authorization '+role+';select * from mip_temporal.source_incarnations;'),/mip_database_denied_42501/)
   await assert.rejects(()=>f.admin('set session authorization '+role+';select * from pg_control_system();'),/mip_database_denied_42501/)
  }
  await assert.rejects(()=>f.admin('update mip_temporal.source_incarnations set incarnation_id='+q(randomUUID())+' where incarnation_id='+q(id)))
  for(const [role,signature] of [
   ['mip_temporal_recorder','mip_temporal.capture_next(uuid,uuid,pg_lsn,uuid)'],
   ['mip_temporal_recorder','mip_temporal.prepare_covered_advance(uuid,uuid,uuid,uuid,uuid,pg_lsn,text,text,text)'],
   ['mip_temporal_ack_gateway','mip_temporal.advance_covered(uuid,uuid)']])
   assert.equal(await f.admin('select has_function_privilege('+[role,signature,'EXECUTE'].map(q).join(',')+')'),'f')
  assert.equal(await f.admin("select rolcanlogin or rolsuper or rolbypassrls from pg_roles where rolname='mip_temporal_registry_owner'"),'f')
  assert.equal(await f.admin("select relrowsecurity and relforcerowsecurity from pg_class where oid='mip_temporal.source_incarnations'::regclass"),'t')
 })
 await t.test('incarnation-bound advancement locks first and source revocation waits',async t=>{
  const {b,api,c,request,sql}=await prepared(t)
  const held=await hold(f.db,sql,'mip_temporal_ack_gateway');let finished=false
  const pending=f.admin(b.revokeSql);pending.catch(()=>{})
  try{
   await blocked(f,held.pid);await held.finish(true);finished=true;await pending
   assert.equal(await b.confirmed(),c.end_lsn);assert.equal(await b.checkpointCount(),'1')
   await assert.rejects(()=>api.advance(request),/mip_temporal_binding_denied/)
  }finally{if(!finished)await held.finish(false)}
 })
 await t.test('source revocation locks first and incarnation-bound advancement rejects without a checkpoint',async t=>{
  const {b,api,request}=await prepared(t)
  const held=await hold(f.db,b.revokeSql);let finished=false
  const pending=api.advance(request);pending.catch(()=>{})
  try{
   await blocked(f,held.pid);await held.finish(true);finished=true
   await assert.rejects(pending,/mip_temporal_binding_denied/)
   assert.equal(await b.confirmed(),b.before);assert.equal(await b.checkpointCount(),'0')
   assert.equal(await f.admin('select count(*) from mip_temporal.covered_permits where request_id='+q(request.request)),'1')
  }finally{if(!finished)await held.finish(false)}
 })
 await t.test('actual database clone preserves source records but cannot reuse the original configured source binding',async t=>{
  guard()
  if(!/^mip_integrated_[0-9a-f]{32}$/.test(f.db))throw Error('mip_disposable_database_required')
  const {b,id,request,c}=await prepared(t)
  const clone='mip_integrated_'+randomUUID().replaceAll('-','')
  // Database template copy stays inside this workflow's disposable service. Never force-disconnect a source.
  await raw('postgres','create database '+clone+' template '+f.db+';')
  try{
   const metadata=await f.admin('select jsonb_build_object('+[
    q('registration'),'(select to_jsonb(r) from mip_temporal.source_incarnations r where binding_id='+q(b.bindingId)+')',
    q('capture_hash'),'(select frame_hash from mip_temporal.stream_captures where id='+q(c.id)+')',
    q('permit_count'),'(select count(*) from mip_temporal.covered_permits where request_id='+q(request.request)+')'].join(',')+');')
   const copied=await raw(clone,'select jsonb_build_object('+[
    q('registration'),'(select to_jsonb(r) from mip_temporal.source_incarnations r where binding_id='+q(b.bindingId)+')',
    q('capture_hash'),'(select frame_hash from mip_temporal.stream_captures where id='+q(c.id)+')',
    q('permit_count'),'(select count(*) from mip_temporal.covered_permits where request_id='+q(request.request)+')'].join(',')+');')
   assert.deepEqual(JSON.parse(copied),JSON.parse(metadata))
   const originalOid=await raw('postgres','select oid::text from pg_database where datname='+q(f.db))
   const cloneOid=await raw('postgres','select oid::text from pg_database where datname='+q(clone))
   assert.notEqual(cloneOid,originalOid)
   await assert.rejects(()=>raw(clone,'set session authorization mip_temporal_ack_gateway;select mip_temporal.advance_incarnation('+
    [request.session,request.request,id].map(q).join(',')+');'),/mip_temporal_binding_denied/)
   assert.equal(await raw(clone,'select count(*) from mip_temporal.stream_checkpoints where capture_id='+q(c.id)),'0')
   assert.equal(await b.confirmed(),b.before);assert.equal(await b.checkpointCount(),'0')
   // Original source remains usable; clone rejection is not deletion, cancellation or global revocation.
   await b.consume(c,{prepare:transport(id).prepare,advance:transport(id).advance})
   assert.equal(await b.checkpointCount(),'1')
  }finally{
   await raw('postgres','drop database '+clone+';')
  }
 })
 await t.test('actual database server restart preserves durable work but denies old incarnation acceptance after fresh authentication',async t=>{
  const {b,id,api,request,c}=await prepared(t)
  const before=await f.admin('select pg_postmaster_start_time()::text')
  const registration=await f.admin('select to_jsonb(r) from mip_temporal.source_incarnations r where binding_id='+q(b.bindingId))
  const captureBefore=await f.admin('select frame_hash from mip_temporal.stream_captures where id='+q(c.id))
  await restartRemoteStore()
  const after=await f.admin('select pg_postmaster_start_time()::text')
  assert.notEqual(after,before)
  assert.equal(await f.admin('select to_jsonb(r) from mip_temporal.source_incarnations r where binding_id='+q(b.bindingId)),registration)
  assert.equal(await f.admin('select frame_hash from mip_temporal.stream_captures where id='+q(c.id)),captureBefore)
  assert.equal(await f.admin('select count(*) from mip_temporal.covered_permits where request_id='+q(request.request)),'1')
  await b.refresh()
  await assert.rejects(()=>api.advance({...request,session:b.session()}),/mip_source_native_identity_changed/)
  await assert.rejects(()=>api.capture({session:b.session(),bindingId:b.bindingId,before:b.before,request:randomUUID()}),/mip_source_native_identity_changed/)
  assert.equal(await b.checkpointCount(),'0')
  assert.equal(await f.admin('select incarnation_id::text from mip_temporal.source_incarnations where binding_id='+q(b.bindingId)),id)
  assert.equal(await f.admin('select count(*) from mip_temporal.advance_receipts where request_id='+q(request.request)),'0')
 })

}
