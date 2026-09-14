import {incarnationCases} from './incarnationCases.mjs'
import {readSnapshotPages} from './snapshotReader.mjs'
// Actual source capture/coverage in the existing disposable service, synthetic revisions only.
import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {quote as q,transport} from '../integrated/transport.mjs'
import {producerRole} from '../integrated/fixture.mjs'
import {hold} from './fixture.mjs'
import {encryptedRemoteJournal} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
import {recordBootstrap,recordPagedBootstrap,bootstrapPageKey} from '../../supabase/qualification/hypothesis-assessments/temporalBootstrap.mjs'
import {consumeSourceCapture} from '../../supabase/qualification/hypothesis-assessments/coveredRevisionConsumer.mjs'
import {decodeRevisionCommits} from '../../supabase/qualification/hypothesis-assessments/pgoutputRecorder.mjs'
import {nativeAckBoundary} from './sourceFenceCases.mjs'
import {exportSnapshot} from './snapshotExporter.mjs'
export async function continuityCases(t,f,runWorker){
 // Earlier 018 regressions remain a preserved baseline. This final installed interface removes its bypass grants.
 await f.admin(await readFile(new URL('../../supabase/qualification/hypothesis-assessments/019_stream_continuity.sql',import.meta.url),'utf8'))
 const relationId=await f.admin("select 'mip_hypothesis.revision_transactions'::regclass::oid::text")
 async function staged(t,{paged=false,onFirstPage}={}){
  const runtime='synthetic-coverage-'+randomUUID(),mapping=randomUUID(),material={version:'synthetic-coverage-v1',key:randomBytes(32)}
  await f.admin('insert into mip_identity.mapping_versions select '+q(mapping)+','+q(runtime)+
   ',principal,issuer,audience,'+q(runtime+':'+producerRole)+',key_revision,max_lifetime_seconds,approval_ref from mip_identity.mapping_versions where revision='+
   q(f.mappings['runtime-a'+producerRole])+';insert into mip_identity.mapping_heads values('+[runtime,producerRole,mapping].map(q).join(',')+',true);')
  let session=await f.issue(runtime,producerRole)
  const journalFor=s=>encryptedRemoteJournal({sql:transport(f.db,'mip_journal_gateway_v2'),session:s,
   keyProvider:r=>{if(r!==runtime)throw Error('mip_wrong_runtime');return material}})
  let journal=journalFor(session)
  const context={source_id:randomUUID(),stream_epoch:randomUUID()},observationEpoch=f.observationEpoch
  const suffix=randomUUID().replaceAll('-',''),pub='synthetic_coverage_'+suffix,slot='synthetic_bootstrap_'+suffix
  await f.admin('create publication '+pub+' for table mip_hypothesis.revision_transactions (revision_id,epoch,creator_xid) with (publish='+q('insert')+');')
  const exported=await exportSnapshot(f.db,slot)
  t.after(async()=>{
   await f.admin('select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name='+q(slot)+';drop publication '+pub+';')
  })
  let baseline,capturedIds=[]
  try{
   if(paged){
    baseline=await recordPagedBootstrap({context,observationEpoch,journal,pageSize:3,
     input:{consistent_lsn:exported.consistent_lsn,snapshot_id:exported.snapshot_id},
     withSnapshot:(id,consume)=>readSnapshotPages(f.db,id,async fetchPage=>{
      let first=true
      await consume(async size=>{
       const rows=await fetchPage(size);capturedIds.push(...rows.map(r=>r.revision_id))
       if(first){first=false;if(onFirstPage)await onFirstPage()}
       return rows
      })
     })})
   }else{
    const rows=JSON.parse(await f.admin('begin isolation level repeatable read read only;set transaction snapshot '+q(exported.snapshot_id)+
     ";select coalesce(jsonb_agg(jsonb_build_object('revision_id',r.id,'transaction_epoch',m.epoch,'creator_xid',m.creator_xid::text) order by r.id),'[]') "+
     'from mip_hypothesis.revisions r left join mip_hypothesis.revision_transactions m on m.revision_id=r.id;commit;'))
    baseline=await recordBootstrap({context,observationEpoch,journal,input:{consistent_lsn:exported.consistent_lsn,snapshot_id:exported.snapshot_id,rows}})
   }
  }finally{await exported.close()}
  const b=await nativeAckBoundary(f,{journal,context,slot,runtime,session,observationEpoch})
  await f.admin('insert into mip_temporal.stream_configs values('+[b.bindingId,pub,exported.consistent_lsn,baseline.hash].map(q).join(',')+
   ');insert into mip_temporal.stream_heads values('+[b.bindingId,exported.consistent_lsn,null].map(q).join(',')+');')
  const prepareSql=p=>'select mip_temporal.prepare_covered_advance('+[
   p.session,p.capture,p.request,p.source,p.stream,p.end,p.bootstrap,p.frames,p.hash].map(q).join(',')+');'
  const advanceSql=p=>'select mip_temporal.advance_covered('+[p.session,p.request].map(q).join(',')+');'
  const prepare=p=>f.admin('set session authorization mip_temporal_recorder;'+prepareSql(p))
  const advance=async p=>JSON.parse(await f.admin('set session authorization mip_temporal_ack_gateway;'+advanceSql(p)))
  const capture=(before=exported.consistent_lsn,id=randomUUID())=>f.admin('set session authorization mip_temporal_recorder;select mip_temporal.capture_next('+
   [session,b.bindingId,before,id].map(q).join(',')+');').then(JSON.parse)
  const consume=(c,extra={})=>consumeSourceCapture({capture:c,bindingId:b.bindingId,context,observationEpoch,relationId,session,journal,prepare,advance,...extra})
  const confirmed=()=>f.admin('select confirmed_flush_lsn::text from pg_replication_slots where slot_name='+q(slot))
  const checkpointCount=()=>f.admin('select count(*) from mip_temporal.stream_checkpoints p join mip_temporal.stream_captures c on c.id=p.capture_id where c.binding_id='+q(b.bindingId))
  const produce=async()=>{const v=await f.investigation();await v.captureGeneration();await runWorker(v);return JSON.parse(await f.admin('select jsonb_agg(id::text) from mip_hypothesis.revisions where investigation_id='+q(v.iid)))}
  const peek=async()=>JSON.parse(await f.admin("select coalesce(jsonb_agg(encode(data,'hex') order by sequence),'[]') from pg_logical_slot_peek_binary_changes("+
   q(slot)+",null,null,'proto_version','1','publication_names',"+q(pub)+",'binary','false','streaming','false','messages','false') with ordinality as c(lsn,xid,data,sequence);")).map(x=>Buffer.from(x,'hex'))
  return {...b,runtime,context,observationEpoch,baseline,pub,slot,capture,consume,confirmed,checkpointCount,produce,peek,prepare,advance,advanceSql,
   before:exported.consistent_lsn,snapshotId:exported.snapshot_id,capturedIds,journal:()=>journal,session:()=>session,
   refresh:async()=>{session=await f.issue(runtime,producerRole);journal=journalFor(session)}}
 }
 await t.test('source captures only the next native transaction and chains exact reconciled revision IDs',async t=>{
  const b=await staged(t),first=await b.produce(),second=await b.produce()
  const c1=await b.capture(),d1=decodeRevisionCommits(c1.frames.map(x=>Buffer.from(x,'hex')),{relationId,observationEpoch:f.observationEpoch})
  assert.deepEqual(d1.flatMap(c=>c.input.revisions.map(r=>r.revision_id)),first)
  assert.equal(await b.confirmed(),b.before)
  await assert.rejects(()=>b.capture(b.before),/mip_coverage_request_conflict/)
  await b.consume(c1)
  const c2=await b.capture(c1.end_lsn)
  const d2=decodeRevisionCommits(c2.frames.map(x=>Buffer.from(x,'hex')),{relationId,observationEpoch:f.observationEpoch})
  assert.deepEqual(d2.flatMap(c=>c.input.revisions.map(r=>r.revision_id)),second)
  await b.consume(c2)
  const chain=JSON.parse(await f.admin('select jsonb_agg(jsonb_build_object('+
   "'id',p.capture_id,'before',p.before_lsn::text,'end',p.end_lsn::text,'predecessor',p.predecessor) order by p.end_lsn) "+
   'from mip_temporal.stream_checkpoints p join mip_temporal.stream_captures c on c.id=p.capture_id where c.binding_id='+q(b.bindingId)))
  assert.deepEqual(chain,[{id:c1.id,before:b.before,end:c1.end_lsn,predecessor:null},{id:c2.id,before:c1.end_lsn,end:c2.end_lsn,predecessor:c1.id}])
  await b.refresh()
  assert.deepEqual(await b.capture(b.before,c1.id),c1)
  assert.equal((await b.consume(c1)).historical_time_qualified,false)
  assert.equal(await b.confirmed(),c2.end_lsn);assert.equal(await b.checkpointCount(),'2')
  const empty=await b.capture(c2.end_lsn)
  assert.equal(empty.state,'no_revision_transaction_observed');assert.equal(empty.covered_through,c2.end_lsn)
  assert.equal(empty.historical_time_qualified,false)
 })
 await t.test('source permit rejects a skipped transaction even with genuine later native metadata',async t=>{
  const b=await staged(t);await b.produce();await b.produce()
  const all=decodeRevisionCommits(await b.peek(),{relationId,observationEpoch:f.observationEpoch})
  assert.equal(all.length,2)
  const capture=await b.capture()
  await assert.rejects(()=>b.prepare({session:b.session(),capture:capture.id,request:randomUUID(),source:b.context.source_id,
   stream:b.context.stream_epoch,end:all[1].end_lsn,bootstrap:capture.bootstrap_hash,frames:capture.frame_hash,hash:'a'.repeat(64)}),/mip_coverage_capture_mismatch/)
  await assert.rejects(()=>b.prepare({session:b.session(),capture:capture.id,request:randomUUID(),source:b.context.source_id,
   stream:b.context.stream_epoch,end:capture.end_lsn,bootstrap:capture.bootstrap_hash,frames:'b'.repeat(64),hash:'a'.repeat(64)}),/mip_coverage_capture_mismatch/)
  assert.equal(await b.confirmed(),b.before);assert.equal(await b.checkpointCount(),'0')
 })
 await t.test('rolled-back coverage receipt recovers native advancement with committed capture and fresh session',async t=>{
  const b=await staged(t);await b.produce()
  const c=await b.capture();let request
  await assert.rejects(()=>b.consume(c,{advance:async p=>{request=p;throw Error('synthetic_before_native_advance')}}),/synthetic_before_native_advance/)
  const held=await hold(f.db,b.advanceSql(request),'mip_temporal_ack_gateway')
  await held.finish(false)
  assert.equal(await b.confirmed(),c.end_lsn)
  assert.equal(await b.checkpointCount(),'0')
  assert.equal(await f.admin('select last_lsn::text from mip_temporal.stream_heads where binding_id='+q(b.bindingId)),b.before)
  await b.refresh()
  assert.deepEqual(await b.capture(b.before,c.id),c)
  await b.consume(c)
  assert.equal(await b.checkpointCount(),'1')
  assert.equal(await f.admin('select last_lsn::text from mip_temporal.stream_heads where binding_id='+q(b.bindingId)),c.end_lsn)
 })
 await t.test('slot movement outside the protocol denies progress and preserves the captured transaction',async t=>{
  const b=await staged(t);await b.produce();await b.produce()
  const all=decodeRevisionCommits(await b.peek(),{relationId,observationEpoch:f.observationEpoch}),c=await b.capture()
  await f.admin('select end_lsn from pg_replication_slot_advance('+[b.slot,all[1].end_lsn].map(q).join(',')+');')
  await assert.rejects(()=>b.capture(b.before,c.id),/mip_coverage_position_gap/)
  await assert.rejects(()=>b.consume(c),/mip_coverage_position_gap/)
  assert.equal(await b.checkpointCount(),'0')
  assert.equal(await f.admin('select count(*) from mip_temporal.stream_captures where id='+q(c.id)),'1')
 })
 await t.test('slot loss denies recovery without deleting source captures or fabricating continuity',async t=>{
  const b=await staged(t);await b.produce();const c=await b.capture()
  await f.admin('select pg_drop_replication_slot('+q(b.slot)+');')
  await assert.rejects(()=>b.capture(b.before,c.id),/mip_temporal_slot_denied/)
  await assert.rejects(()=>b.consume(c),/mip_temporal_slot_denied/)
  assert.equal(await b.checkpointCount(),'0')
  assert.equal(await f.admin('select count(*) from mip_temporal.stream_captures where id='+q(c.id)),'1')
 })
 await t.test('publication expansion and revoked source authority fail closed before new capture',async t=>{
  const b=await staged(t);await b.produce()
  await f.admin('alter publication '+b.pub+" set (publish='insert,update');")
  await assert.rejects(()=>b.capture(),/mip_coverage_publication_denied/)
  assert.equal(await f.admin('select count(*) from mip_temporal.stream_captures where binding_id='+q(b.bindingId)),'0')
  await f.admin('alter publication '+b.pub+" set (publish='insert');")
  const c=await b.capture()
  await f.admin(b.revokeSql)
  await assert.rejects(()=>b.consume(c),/mip_temporal_binding_denied/)
  assert.equal(await b.confirmed(),b.before)
 })
 await t.test('current interface removes unbound advancement and denies direct coverage writes',async t=>{
  const b=await staged(t)
  for(const [role,signature] of [
   ['mip_temporal_recorder','mip_temporal.prepare_advance(uuid,uuid,uuid,uuid,uuid,pg_lsn,text)'],
   ['mip_temporal_ack_gateway','mip_temporal.advance(uuid,uuid)'],
   ['service_role','mip_temporal.capture_next(uuid,uuid,pg_lsn,uuid)'],
   ['mip_comparison_worker_v1','mip_temporal.advance_covered(uuid,uuid)']])
   assert.equal(await f.admin('select has_function_privilege('+[role,signature,'EXECUTE'].map(q).join(',')+')'),'f')
  for(const role of ['mip_temporal_recorder','mip_temporal_ack_gateway','service_role'])
   await assert.rejects(()=>f.admin('set session authorization '+role+';update mip_temporal.stream_heads set last_lsn='+q('0/FFFFFF')+' where binding_id='+q(b.bindingId)),/mip_database_denied_42501/)
  assert.equal(await f.admin("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_temporal' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)"),'0')
  assert.equal(await b.confirmed(),b.before)
 })
 await t.test('paged native snapshot excludes between-page commits and its complete manifest gates covered stream advancement',async t=>{
  const before=JSON.parse(await f.admin("select coalesce(jsonb_agg(id::text order by id),'[]') from mip_hypothesis.revisions"))
  assert.ok(before.length>3)
  let late
  const b=await staged(t,{paged:true,onFirstPage:async()=>{
   const v=await f.investigation();await v.captureGeneration();await runWorker(v)
   late=JSON.parse(await f.admin('select jsonb_agg(id::text) from mip_hypothesis.revisions where investigation_id='+q(v.iid)))
  }})
  assert.deepEqual(b.capturedIds,before);assert.equal(b.baseline.revisions,before.length);assert.ok(b.baseline.pages>1)
  const c=await b.capture()
  const decoded=decodeRevisionCommits(c.frames.map(x=>Buffer.from(x,'hex')),{relationId,observationEpoch:f.observationEpoch})
  assert.deepEqual(decoded.flatMap(x=>x.input.revisions.map(r=>r.revision_id)),late)
  const current=JSON.parse(await f.admin("select jsonb_agg(id::text order by id) from mip_hypothesis.revisions"))
  assert.deepEqual([...b.capturedIds,...late].sort(),current)
  const old=b.journal(),missingKey=bootstrapPageKey(b.context,b.baseline.pages-1)
  await assert.rejects(()=>b.consume(c,{journal:{putOnce:old.putOnce,get:async k=>k===missingKey?null:old.get(k)}}))
  assert.equal(await b.confirmed(),b.before);assert.equal(await b.checkpointCount(),'0')
  await b.consume(c)
  assert.equal(await b.confirmed(),c.end_lsn);assert.equal(await b.checkpointCount(),'1')
  await assert.rejects(()=>readSnapshotPages(f.db,b.snapshotId,async fetchPage=>{await fetchPage(1)}),/mip_snapshot_read_failed/)
 })

 await t.test('native source incarnation registration isolation',async t=>incarnationCases(t,f,staged))

}
