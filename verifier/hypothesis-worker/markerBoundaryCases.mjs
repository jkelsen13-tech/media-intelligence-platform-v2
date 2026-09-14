// Native proof only. Administrative marker emission/advance here is confined to disposable CI.
// Source authority, registration and covered-consumer integration are explicitly not implemented.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID,randomBytes} from 'node:crypto'
import {quote as q,transport} from '../integrated/transport.mjs'
import {producerRole} from '../integrated/fixture.mjs'
import {hold} from './fixture.mjs'
import {encryptedRemoteJournal} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
import {decodeRevisionCommits,recordPgoutputBatch} from '../../supabase/qualification/hypothesis-assessments/pgoutputRecorder.mjs'
import {decodeMarkerBoundary,retainMarkerBoundary} from '../../supabase/qualification/hypothesis-assessments/pgoutputBoundaryRecorder.mjs'
export async function markerBoundaryCases(t,f,{runWorker,holdRevision}){
 await f.admin(await readFile(new URL('../../supabase/qualification/hypothesis-assessments/021_stream_boundary_proof.sql',import.meta.url),'utf8'))
 const relationId=await f.admin("select 'mip_temporal.stream_markers'::regclass::oid::text")
 const revisionRelation=await f.admin("select 'mip_hypothesis.revision_transactions'::regclass::oid::text")
 const runtime='synthetic-marker-'+randomUUID(),mapping=randomUUID(),material={version:'synthetic-marker-v1',key:randomBytes(32)}
 await f.admin('insert into mip_identity.mapping_versions select '+q(mapping)+','+q(runtime)+
  ',principal,issuer,audience,'+q(runtime+':'+producerRole)+',key_revision,max_lifetime_seconds,approval_ref from mip_identity.mapping_versions where revision='+
  q(f.mappings['runtime-a'+producerRole])+';insert into mip_identity.mapping_heads values('+[runtime,producerRole,mapping].map(q).join(',')+',true);')
 let session=await f.issue(runtime,producerRole)
 const journal=()=>encryptedRemoteJournal({sql:transport(f.db,'mip_journal_gateway_v2'),session,
  keyProvider:r=>{if(r!==runtime)throw Error('wrong_runtime');return material}})
 const markerSql=id=>'insert into mip_temporal.stream_markers(marker_id,epoch) values('+[id,f.observationEpoch].map(q).join(',')+');'
 async function stream(t){
  const suffix=randomUUID().replaceAll('-',''),pub='synthetic_marker_'+suffix,slot='synthetic_marker_'+suffix
  await f.admin('create publication '+pub+' for table mip_hypothesis.revision_transactions(revision_id,epoch,creator_xid),mip_temporal.stream_markers(marker_id,epoch,creator_xid) with (publish=\'insert\');')
  await f.admin('select slot_name from pg_create_logical_replication_slot('+[slot,'pgoutput'].map(q).join(',')+');')
  t.after(()=>f.admin('select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name='+q(slot)+';drop publication '+pub+';'))
  const context={source_id:randomUUID(),stream_epoch:randomUUID()}
  const confirmed=()=>f.admin('select confirmed_flush_lsn::text from pg_replication_slots where slot_name='+q(slot))
  const peek=async()=>JSON.parse(await f.admin("select coalesce(jsonb_agg(encode(data,'hex') order by sequence),'[]') from pg_logical_slot_peek_binary_changes("+
   q(slot)+",null,1,'proto_version','1','publication_names',"+q(pub)+",'binary','false','streaming','false','messages','false') with ordinality as c(lsn,xid,data,sequence);")).map(x=>Buffer.from(x,'hex'))
  const advance=end=>f.admin('select end_lsn::text from pg_replication_slot_advance('+[slot,end].map(q).join(',')+');')
  const emit=id=>f.admin(markerSql(id))
  const retain=(frames,id,j=journal())=>retainMarkerBoundary({frames,markerId:id,relationId,observationEpoch:f.observationEpoch,context,journal:j})
  return {pub,slot,context,confirmed,peek,advance,emit,retain}
 }
 await t.test('unrelated WAL and empty peek never prove coverage; committed native marker does',async t=>{
  const b=await stream(t),before=await b.confirmed(),id=randomUUID()
  await f.admin('create table public.synthetic_marker_unrelated(id uuid);insert into public.synthetic_marker_unrelated values(gen_random_uuid());')
  assert.equal((await b.peek()).length,0);assert.equal(await b.confirmed(),before)
  await b.emit(id)
  const data=await b.peek(),proof=decodeMarkerBoundary(data,{relationId,observationEpoch:f.observationEpoch,markerId:id})
  assert.equal(await b.confirmed(),before)
  await assert.rejects(()=>b.retain(data,id,{putOnce:async()=>({committed:true}),get:async()=>null}),/not_durable/)
  assert.equal(await b.confirmed(),before)
  const saved=await b.retain(data,id)
  assert.equal(saved.end_lsn,proof.end_lsn);assert.equal(saved.historical_time_qualified,false)
  assert.equal(await b.advance(saved.end_lsn),saved.end_lsn)
  assert.equal((await b.peek()).length,0)
  assert.deepEqual(await b.retain(data,id),saved)
 })
 await t.test('open actual revision transaction survives consuming a later marker and decodes after commit',async t=>{
  const b=await stream(t),pending=await holdRevision(),id=randomUUID()
  let ended=false
  try{
   await b.emit(id)
   const data=await b.peek(),saved=await b.retain(data,id)
   await b.advance(saved.end_lsn)
   assert.equal((await b.peek()).length,0)
   await pending.finish(true);ended=true
   const revisions=decodeRevisionCommits(await b.peek(),{relationId:revisionRelation,observationEpoch:f.observationEpoch})
   assert.equal(revisions.length,1)
   const expected=JSON.parse(await f.admin('select jsonb_agg(id::text) from mip_hypothesis.revisions where investigation_id='+q(pending.investigationId)))
   assert.deepEqual(revisions[0].input.revisions.map(r=>r.revision_id),expected)
   assert.notEqual(revisions[0].end_lsn,saved.end_lsn)
   await recordPgoutputBatch({frames:await b.peek(),relationId:revisionRelation,observationEpoch:f.observationEpoch,context:b.context,journal:journal(),
    acknowledge:p=>b.advance(p.end_lsn)})
   assert.equal((await b.peek()).length,0)
  }finally{if(!ended)await pending.finish(false)}
 })
 await t.test('rolled-back actual revision and rolled-back marker produce no published transaction',async t=>{
  const b=await stream(t),before=await b.confirmed(),pending=await holdRevision()
  await pending.finish(false)
  const id=randomUUID(),marker=await hold(f.db,markerSql(id))
  assert.equal((await b.peek()).length,0);await marker.finish(false)
  assert.equal((await b.peek()).length,0);assert.equal(await b.confirmed(),before)
  await b.emit(randomUUID())
  assert.equal((await b.peek()).length,4)
 })
 await t.test('intervening revision must be retained before requested marker and cannot decode as marker',async t=>{
  const b=await stream(t),v=await f.investigation()
  await v.captureGeneration();await runWorker(v)
  const id=randomUUID();await b.emit(id)
  const first=await b.peek(),before=await b.confirmed()
  await assert.rejects(()=>b.retain(first,id),/mip_marker_boundary_denied/)
  assert.equal(await b.confirmed(),before)
  await recordPgoutputBatch({frames:first,relationId:revisionRelation,observationEpoch:f.observationEpoch,context:b.context,journal:journal(),
   acknowledge:p=>b.advance(p.end_lsn)})
  const next=await b.peek(),saved=await b.retain(next,id)
  await b.advance(saved.end_lsn);assert.equal((await b.peek()).length,0)
 })
 await t.test('fixture exact publication and no gateway marker grants; native source integration stays closed',async t=>{
  const b=await stream(t)
  const tables=JSON.parse(await f.admin("select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'columns',attnames,'filter',rowfilter) order by schemaname,tablename) from pg_publication_tables where pubname="+q(b.pub)))
  assert.deepEqual(tables,[
   {schema:'mip_hypothesis',table:'revision_transactions',columns:['revision_id','epoch','creator_xid'],filter:null},
   {schema:'mip_temporal',table:'stream_markers',columns:['marker_id','epoch','creator_xid'],filter:null}])
  for(const role of ['mip_temporal_recorder','mip_temporal_ack_gateway','mip_comparison_worker_v1','service_role'])
   await assert.rejects(()=>f.admin('set session authorization '+role+';'+markerSql(randomUUID())),/mip_database_denied_42501/)
  assert.equal(await f.admin("select relrowsecurity and relforcerowsecurity from pg_class where oid='mip_temporal.stream_markers'::regclass"),'t')
  const definition=await f.admin("select pg_get_functiondef('mip_temporal.check_stream(uuid,uuid)'::regprocedure)")
  assert.ok(definition.includes(')<>1')) // Existing one-table source contract is intentionally not broadened.
 })
 await t.test('slot loss does not erase retained proof or grant source-recovery authority',async t=>{
  const b=await stream(t),id=randomUUID();await b.emit(id)
  const data=await b.peek(),saved=await b.retain(data,id)
  await f.admin('select pg_drop_replication_slot('+q(b.slot)+');')
  await assert.rejects(()=>b.advance(saved.end_lsn))
  session=await f.issue(runtime,producerRole)
  assert.deepEqual(await b.retain(data,id),saved)
  assert.equal(saved.authority_integrated,false)
 })
 await t.test('revoked journal mapping blocks retention; source WAL remains unacknowledged',async t=>{
  const b=await stream(t),id=randomUUID();await b.emit(id)
  const data=await b.peek(),before=await b.confirmed()
  await f.admin('update mip_identity.mapping_heads set active=false where runtime='+q(runtime))
  await assert.rejects(()=>b.retain(data,id))
  assert.equal(await b.confirmed(),before)
  assert.equal((await b.peek()).length,4)
 })
}
