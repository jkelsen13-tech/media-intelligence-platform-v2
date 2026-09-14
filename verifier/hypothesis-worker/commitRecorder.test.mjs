import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {fixture,producerRole} from '../integrated/fixture.mjs'
import {transport,quote as q} from '../integrated/transport.mjs'
import {encryptedRemoteJournal} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
import {recordCommittedMetadata,commitEnvelope,commitJournalKey} from '../../supabase/qualification/hypothesis-assessments/commitRecorder.mjs'
import {isolatedCommitRecorder} from './commitContainer.mjs'
async function childRun({context,input,journal,crash}){
 const child=isolatedCommitRecorder()
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(Error('mip_commit_child_timeout'))},30000)
  child.on('message',async message=>{
   if(message.done){clearTimeout(timer);child.kill();resolve(message.state);return}
   try{
    let result
    if(message.kind==='put')result=await journal.putOnce(...message.args)
    else if(message.kind==='get')result=await journal.get(...message.args)
    else if(message.kind==='ack')result=await journal.putOnce('synthetic-source-ack:'+context.stream_epoch,message.args[0])
    else throw Error('mip_invalid_protocol')
    if(crash===message.kind){child.kill();return}
    child.send({reply:true,id:message.id,result})
   }catch{child.send({reply:true,id:message.id,error:true})}
  })
  child.on('exit',()=>{clearTimeout(timer);resolve('terminated')})
  child.send({start:true,context,input})
 })
}
test('synthetic commit recorder uses existing encrypted remote journal and actual isolated process restart',async t=>{
 const f=await fixture(t),runtime='temporal-synthetic-'+randomUUID(),mapping=randomUUID()
 // Separate runtime, key custody and session. Reuse the existing producer identity vocabulary only
 // in this fixture, with no application/source/worker capabilities. Not a production identity decision.
 await f.admin('insert into mip_identity.mapping_versions select '+q(mapping)+','+q(runtime)+
  ',principal,issuer,audience,'+q(runtime+':'+producerRole)+',key_revision,max_lifetime_seconds,approval_ref from mip_identity.mapping_versions where revision='+
  q(f.mappings['runtime-a'+producerRole])+';insert into mip_identity.mapping_heads values('+
  [runtime,producerRole,mapping].map(q).join(',')+',true);')
 const material={version:'synthetic-commit-v1',key:randomBytes(32)}
 const session=await f.issue(runtime,producerRole)
 const journalFor=session=>encryptedRemoteJournal({sql:transport(f.db,'mip_journal_gateway_v2'),session,
  keyProvider:r=>{if(r!==runtime)throw Error('mip_wrong_runtime');return material}})
 const journal=journalFor(session)
 const make=()=>({context:{source_id:randomUUID(),stream_epoch:randomUUID()},input:{commit_lsn:'1/ABC',xid:'7',
  commit_time:'2026-09-14T12:00:00.123456Z',revisions:[{revision_id:randomUUID(),observation_epoch:randomUUID(),creator_xid:'4294967303'}]}})
 await t.test('exact replay succeeds; changed metadata cannot replace retained commit',async()=>{
  const args=make();let acknowledgements=0
  const run=input=>recordCommittedMetadata({...args,input,journal,acknowledge:async()=>{acknowledgements++}})
  await run(args.input);await run(args.input)
  await assert.rejects(()=>run({...args.input,commit_time:'2026-09-14T12:00:01Z'}),/mip_journal_content_conflict/)
  assert.equal(acknowledgements,2)
 })
 await t.test('comparison worker cannot read recorder runtime; recorder has no producer enqueue capability',async()=>{
  const args=make(),envelope=commitEnvelope(args.context,args.input),key=commitJournalKey(envelope)
  await journal.putOnce(key,envelope)
  assert.equal(await f.journal(f.session).get(key),null)
  await assert.rejects(()=>f.producerRpc('producer_enqueue',[randomUUID(),session,runtime,{},null]))
  const cipher=await f.admin('select envelope::text from mip_identity.journal where runtime='+q(runtime)+' and entry_key='+q(key))
  assert.equal(cipher.includes(args.input.revisions[0].revision_id),false)
  assert.equal(cipher.includes('commit_time'),false)
 })
 for(const crash of ['put','get','ack'])await t.test('process killed after '+crash+' resumes exact retained metadata with fresh session',async()=>{
  const args=make()
  assert.equal(await childRun({...args,journal,crash}),'terminated')
  const retained=await journal.get(commitJournalKey(commitEnvelope(args.context,args.input)))
  assert.equal(retained.commit_lsn,args.input.commit_lsn)
  const fresh=journalFor(await f.issue(runtime,producerRole))
  assert.equal(await childRun({...args,journal:fresh}),'durable_metadata_acknowledged')
  assert.equal((await fresh.get('synthetic-source-ack:'+args.context.stream_epoch)).commit_lsn,args.input.commit_lsn)
 })
 await t.test('revoked current mapping prevents replay acknowledgement and preserves stranded record',async()=>{
  const args=make(),key=commitJournalKey(commitEnvelope(args.context,args.input))
  await journal.putOnce(key,commitEnvelope(args.context,args.input))
  await f.admin('update mip_identity.mapping_heads set active=false where runtime='+q(runtime))
  let ack=false
  await assert.rejects(()=>recordCommittedMetadata({...args,journal,acknowledge:async()=>{ack=true}}))
  assert.equal(ack,false)
  assert.equal(await f.admin('select count(*) from mip_identity.journal where runtime='+q(runtime)+' and entry_key='+q(key)),'1')
 })
})
