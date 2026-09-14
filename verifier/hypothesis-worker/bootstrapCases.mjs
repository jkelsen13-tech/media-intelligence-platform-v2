// Actual exported snapshot + pgoutput boundary, using only synthetic retained assessments.
import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {quote as q,transport} from '../integrated/transport.mjs'
import {producerRole} from '../integrated/fixture.mjs'
import {hold,blocked} from './fixture.mjs'
import {encryptedRemoteJournal} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
import {recordBootstrap,recordBootstrappedPgoutputBatch} from '../../supabase/qualification/hypothesis-assessments/temporalBootstrap.mjs'
import {decodeRevisionCommits} from '../../supabase/qualification/hypothesis-assessments/pgoutputRecorder.mjs'
import {nativeAckBoundary} from './sourceFenceCases.mjs'
import {exportSnapshot} from './snapshotExporter.mjs'
export async function bootstrapCases(t,f,runWorker){
 const runtime='synthetic-bootstrap-'+randomUUID(),mapping=randomUUID(),material={version:'synthetic-bootstrap-v1',key:randomBytes(32)}
 await f.admin('insert into mip_identity.mapping_versions select '+q(mapping)+','+q(runtime)+
 ',principal,issuer,audience,'+q(runtime+':'+producerRole)+',key_revision,max_lifetime_seconds,approval_ref from mip_identity.mapping_versions where revision='+
 q(f.mappings['runtime-a'+producerRole])+';insert into mip_identity.mapping_heads values('+[runtime,producerRole,mapping].map(q).join(',')+',true);')
 const session=await f.issue(runtime,producerRole)
 const journal=encryptedRemoteJournal({sql:transport(f.db,'mip_journal_gateway_v2'),session,
 keyProvider:r=>{if(r!==runtime)throw Error('mip_wrong_runtime');return material}})
 const context={source_id:randomUUID(),stream_epoch:randomUUID()},observationEpoch=f.observationEpoch
 const old=await f.investigation();await old.captureGeneration();await runWorker(old)
 const ids=()=>f.admin("select coalesce(jsonb_agg(id::text order by id),'[]') from mip_hypothesis.revisions").then(JSON.parse)
 const before=await ids(),pub='synthetic_bootstrap_metadata',slot='synthetic_bootstrap_'+randomUUID().replaceAll('-','')
 await f.admin('create publication '+pub+' for table mip_hypothesis.revision_transactions (revision_id,epoch,creator_xid) with (publish='+q('insert')+');')
 const exported=await exportSnapshot(f.db,slot)
 let closed=false
 try{
  const lock="hashtextextended("+q('synthetic-bootstrap:'+randomUUID())+",0)"
  const blocker=await hold(f.db,'select pg_advisory_xact_lock('+lock+')')
  let released=false,readFailure,rows
  const pending=f.admin('begin isolation level repeatable read read only;set transaction snapshot '+q(exported.snapshot_id)+
   ';select pg_advisory_xact_lock('+lock+");select coalesce(jsonb_agg(jsonb_build_object('revision_id',r.id,'transaction_epoch',m.epoch,'creator_xid',m.creator_xid::text) order by r.id),'[]') "+
   'from mip_hypothesis.revisions r left join mip_hypothesis.revision_transactions m on m.revision_id=r.id;commit;')
   .catch(e=>{readFailure=e;return null})
  try{
   try{await blocked(f,blocker.pid)}catch(e){throw readFailure??e}
   const late=await f.investigation();await late.captureGeneration();await runWorker(late)
   await blocker.finish(true);released=true
   const result=await pending;if(readFailure)throw readFailure
   rows=JSON.parse(result)
  }finally{
   if(!released)await blocker.finish(false)
   await exported.close();closed=true
  }
  const after=await ids(),input={consistent_lsn:exported.consistent_lsn,snapshot_id:exported.snapshot_id,rows}
  const relationId=await f.admin("select 'mip_hypothesis.revision_transactions'::regclass::oid::text")
  const frames=JSON.parse(await f.admin("select coalesce(jsonb_agg(encode(data,'hex') order by sequence),'[]') from pg_logical_slot_peek_binary_changes("+
   q(slot)+",null,null,'proto_version','1','publication_names',"+q(pub)+",'binary','false','streaming','false','messages','false') with ordinality as c(lsn,xid,data,sequence);")).map(x=>Buffer.from(x,'hex'))
  const decoded=decodeRevisionCommits(frames,{relationId,observationEpoch})
  const boundary=await nativeAckBoundary(f,{journal,context,slot,runtime,session,observationEpoch})
  const confirmed=()=>f.admin('select confirmed_flush_lsn::text from pg_replication_slots where slot_name='+q(slot))
  await t.test('exported native snapshot excludes a commit made while its imported reader waits; stream includes it exactly',async()=>{
   assert.deepEqual(rows.map(r=>r.revision_id),before)
   const streamed=decoded.flatMap(c=>c.input.revisions.map(r=>r.revision_id))
   assert.deepEqual(streamed,after.filter(id=>!before.includes(id)))
   assert.equal(streamed.length,1)
   assert.deepEqual([...rows.map(r=>r.revision_id),...streamed].sort(),after)
  })
  await t.test('missing bootstrap denies actual stream acknowledgement without moving the slot',async()=>{
   const position=await confirmed();let ack=false
   await assert.rejects(()=>recordBootstrappedPgoutputBatch({context,observationEpoch,relationId,frames,journal,acknowledge:async()=>{ack=true}}))
   assert.equal(ack,false);assert.equal(await confirmed(),position)
  })
  await t.test('exact durable bootstrap gates actual fenced native advancement and survives exporter closure',async()=>{
   const first=await recordBootstrap({context,observationEpoch,input,journal})
   const replay=await recordBootstrap({context,observationEpoch,input,journal})
   assert.equal(first.hash,replay.hash);assert.equal(first.revisions,before.length)
   assert.equal(first.historical_time_qualified,false)
   await assert.rejects(()=>recordBootstrap({context,observationEpoch,input:{...input,rows:[]},journal}),/mip_journal_content_conflict/)
   const result=await recordBootstrappedPgoutputBatch({context,observationEpoch,relationId,frames,journal,acknowledge:boundary.fenced})
   assert.equal(result.commits,1);assert.equal(result.historical_time_qualified,false)
   assert.equal(await confirmed(),decoded[0].end_lsn)
  })
  await t.test('closed export cannot be imported as a fresh snapshot or used to fabricate a new observation',async()=>{
   await assert.rejects(()=>f.admin('begin isolation level repeatable read read only;set transaction snapshot '+q(exported.snapshot_id)+';select 1;commit;'))
  })
 }finally{
  if(!closed)await exported.close()
  await f.admin('select pg_drop_replication_slot('+q(slot)+');drop publication '+pub+';')
 }
}
