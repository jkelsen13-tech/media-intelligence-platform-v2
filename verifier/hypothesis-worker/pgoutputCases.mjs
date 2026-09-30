import {nativeAckBoundary,sourceFenceCases} from './sourceFenceCases.mjs'
// Native pgoutput over actual synthetic hypothesis revisions. No production source or body export.
import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {quote as q,transport} from '../integrated/transport.mjs'
import {producerRole} from '../integrated/fixture.mjs'
import {encryptedRemoteJournal} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
import {decodeRevisionCommits,recordPgoutputBatch} from '../../supabase/qualification/hypothesis-assessments/pgoutputRecorder.mjs'
import {commitEnvelope,commitJournalKey} from '../../supabase/qualification/hypothesis-assessments/commitRecorder.mjs'
export async function pgoutputCases(t,f,runWorker){
 const runtime='synthetic-decoder-'+randomUUID(),mapping=randomUUID(),material={version:'synthetic-v1',key:randomBytes(32)}
 await f.admin('insert into mip_identity.mapping_versions select '+q(mapping)+','+q(runtime)+
  ',principal,issuer,audience,'+q(runtime+':'+producerRole)+',key_revision,max_lifetime_seconds,approval_ref from mip_identity.mapping_versions where revision='+
  q(f.mappings['runtime-a'+producerRole])+';insert into mip_identity.mapping_heads values('+
  [runtime,producerRole,mapping].map(q).join(',')+',true);')
 const session=await f.issue(runtime,producerRole)
 const journal=encryptedRemoteJournal({sql:transport(f.db,'mip_journal_gateway_v2'),session,
  keyProvider:r=>{if(r!==runtime)throw Error('mip_wrong_runtime');return material}})
 const pub='synthetic_revision_metadata',slot='synthetic_revision_'+randomUUID().replaceAll('-','')
 await f.admin('create publication '+pub+' for table mip_hypothesis.revision_transactions (revision_id,epoch,creator_xid) with (publish='+q('insert')+');')
 // Run additional fixture generations before opening the original exact-one-revision stream.
 await sourceFenceCases(t,f,{journal,runtime,session,observationEpoch:f.observationEpoch,
  relationId:await f.admin("select 'mip_hypothesis.revision_transactions'::regclass::oid::text"),pub,runWorker})
 await f.admin('select slot_name from pg_create_logical_replication_slot('+q(slot)+','+q('pgoutput')+');')
 try {
  const relationId=await f.admin("select 'mip_hypothesis.revision_transactions'::regclass::oid::text")
  const context={source_id:randomUUID(),stream_epoch:randomUUID()},observationEpoch=f.observationEpoch
  let lastAcknowledgement
  const boundary=await nativeAckBoundary(f,{journal,context,slot,runtime,session,observationEpoch})
  const peek=async()=>JSON.parse(await f.admin("select coalesce(jsonb_agg(encode(data,'hex') order by sequence),'[]') from pg_logical_slot_peek_binary_changes("+
   q(slot)+",null,null,'proto_version','1','publication_names',"+q(pub)+",'binary','false','streaming','false','messages','false') with ordinality as changes(lsn,xid,data,sequence);")).map(x=>Buffer.from(x,'hex'))
  const confirmed=()=>f.admin('select confirmed_flush_lsn::text from pg_replication_slots where slot_name='+q(slot))
  const v=await f.investigation();await v.captureGeneration();await runWorker(v)
  const frames=await peek(),decoded=decodeRevisionCommits(frames,{relationId,observationEpoch})
  const expected=JSON.parse(await f.admin('select jsonb_agg(id::text) from mip_hypothesis.revisions where investigation_id='+q(v.iid)))
  await t.test('actual pgoutput contains exact revision metadata and no assessment/source body fields',async()=>{
   assert.equal(decoded.length,1)
   assert.deepEqual(decoded.flatMap(c=>c.input.revisions.map(r=>r.revision_id)),expected)
   const text=Buffer.concat(frames).toString('utf8')
   for(const forbidden of ['Synthetic explanation','meeting record','remaining_uncertainty','assessment','lease_token','input_payload'])
    assert.equal(text.includes(forbidden),false)
   assert.equal(await f.admin('select count(*) from pg_publication_tables where pubname='+q(pub)),'1')
  })
  await t.test('incomplete native delivery leaves slot position unchanged and makes no acknowledgement',async()=>{
   const before=await confirmed();let ack=false
   await assert.rejects(()=>recordPgoutputBatch({frames:frames.slice(0,-1),relationId,observationEpoch,context,journal,acknowledge:async()=>{ack=true}}))
   assert.equal(ack,false);assert.equal(await confirmed(),before)
  })
  await t.test('actual slot advancement follows durable exact metadata; lost acknowledgement replays without changing evidence',async()=>{
   let lose=true,acks=0
   const acknowledge=async position=>{
    assert.equal(position.source_id,context.source_id);assert.equal(position.stream_epoch,context.stream_epoch)
    for(const c of decoded){
     const envelope=commitEnvelope(context,c.input)
     assert.deepEqual(await journal.get(commitJournalKey(envelope)),envelope)
    }
    lastAcknowledgement=await boundary.fenced(position)
    acks++;if(lose){lose=false;throw Error('synthetic_lost_source_ack')}
   }
   const run=()=>recordPgoutputBatch({frames,relationId,observationEpoch,context,journal,acknowledge})
   await assert.rejects(run,/synthetic_lost_source_ack/)
   assert.equal(await confirmed(),decoded.at(-1).end_lsn)
   assert.equal((await run()).historical_time_qualified,false);assert.equal(acks,2)
   assert.equal((await peek()).length,0)
  })
  await t.test('revoked recorder mapping denies a new native delivery and retains unacknowledged source work',async()=>{
   const next=await f.investigation();await next.captureGeneration();await runWorker(next)
   const nextFrames=await peek();assert.equal(decodeRevisionCommits(nextFrames,{relationId,observationEpoch}).length,1)
   const before=await confirmed();let ack=false
   await f.admin('update mip_identity.mapping_heads set active=false where runtime='+q(runtime))
   await assert.rejects(()=>boundary.options.advance({session,request:lastAcknowledgement.request_id}),/mip_identity_mapping_revoked/)
   await assert.rejects(()=>recordPgoutputBatch({frames:nextFrames,relationId,observationEpoch,context,journal,acknowledge:async()=>{ack=true}}))
   assert.equal(ack,false);assert.equal(await confirmed(),before)
   assert.equal(decodeRevisionCommits(await peek(),{relationId,observationEpoch}).length,1)
  })
 }finally {
  await f.admin('select pg_drop_replication_slot('+q(slot)+');drop publication '+pub+';')
 }
}
