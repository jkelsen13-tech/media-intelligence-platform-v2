import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {quote as q,transport as sqlTransport} from '../integrated/transport.mjs'
import {producerRole} from '../integrated/fixture.mjs'
import {hold,blocked} from './fixture.mjs'
import {encryptedRemoteJournal} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
import {retainBoundaryRegistration,boundaryRegistrationDigest,createBoundaryCustodyTransport} from '../../supabase/qualification/hypothesis-assessments/boundaryRegistrationCustody.mjs'
import {consumeBoundaryCapture} from '../../supabase/qualification/hypothesis-assessments/coveredBoundaryConsumer.mjs'
const sha=s=>createHash('sha256').update(s).digest('hex')
export async function boundaryIntegrationCases(t,f,{staged,runWorker,holdRevision}){
 await f.admin(await readFile(new URL('../../supabase/qualification/hypothesis-assessments/022_registered_stream_boundaries.sql',import.meta.url),'utf8'))
 const revisionRelation=await f.admin("select 'mip_hypothesis.revision_transactions'::regclass::oid::text")
 const markerRelation=await f.admin("select 'mip_temporal.registered_stream_markers'::regclass::oid::text")
 async function configured(t,{incarnationMismatch=false,contractMismatch=false}={}){
  const b=await staged(t),incarnationId=randomUUID()
  await f.admin('insert into mip_temporal.source_incarnations select '+[b.bindingId,incarnationMismatch?randomUUID():incarnationId].map(q).join(',')+
   ",c.system_identifier::text,d.oid,pg_postmaster_start_time(),'synthetic-v2-registration' from pg_control_system() c cross join pg_database d where d.datname=current_database();")
  const filter="(binding_id = '"+b.bindingId+"'::uuid)"
  await f.admin('alter publication '+b.pub+' add table mip_temporal.registered_stream_markers(marker_id,binding_id,epoch,creator_xid) where '+filter+';')
  const contractDigest=sha(['mip-boundary-contract-v2',b.bindingId,b.pub,revisionRelation,markerRelation,filter].join('|'))
  await f.admin('insert into mip_temporal.boundary_stream_configs values('+[b.bindingId,contractDigest,revisionRelation,markerRelation].map(q).join(',')+');')
  const registration={version:2,sequence:1,previous:'',source:b.context.source_id,stream:b.context.stream_epoch,
   bindingId:b.bindingId,incarnationId,recoveryEvidence:sha('synthetic native initial registration'),contractDigest:contractMismatch?'f'.repeat(64):contractDigest}
  const runtime='synthetic-boundary-custody-'+randomUUID(),mapping=randomUUID(),material={version:'synthetic-v2-custody',key:randomBytes(32)}
  await f.admin('insert into mip_identity.mapping_versions select '+q(mapping)+','+q(runtime)+
   ',principal,issuer,audience,'+q(runtime+':'+producerRole)+',key_revision,max_lifetime_seconds,approval_ref from mip_identity.mapping_versions where revision='+
   q(f.mappings['runtime-a'+producerRole])+';insert into mip_identity.mapping_heads values('+[runtime,producerRole,mapping].map(q).join(',')+',true);')
  let custodySession=await f.issue(runtime,producerRole)
  const custodyJournal=()=>encryptedRemoteJournal({sql:sqlTransport(f.db,'mip_journal_gateway_v2'),session:custodySession,
   keyProvider:r=>{if(r!==runtime)throw Error('wrong_custodian');return material}})
  const approved=new Set([boundaryRegistrationDigest(registration)])
  const withAuthority=async(scope,fn)=>{
   if(scope.source!==registration.source||!approved.has(scope.digest))throw Error('synthetic_registration_not_admitted')
   const held=await hold(f.db,'select pg_advisory_xact_lock(hashtextextended('+q('boundary-custody:'+registration.source)+',0));'+
    'select 1 from mip_identity.fence where id for share;select 1 from mip_identity.mapping_heads where runtime='+q(runtime)+' for share;select 1 from mip_identity.key_heads for share;')
   try{
    const journal=custodyJournal(),index=n=>'boundary-registration-sequence:'+registration.source+':'+n
    const tx={
     head:async()=>{let last=null;for(let n=1;n<=32;n++){const entry=await journal.get(index(n));if(!entry)return last;last=entry.digest}throw Error('bounded_fixture')},
     read:d=>journal.get('boundary-registration:'+d),
     append:async(d,e,previous)=>{
      assert.equal((await tx.head())??'',previous)
      assert.equal((await journal.putOnce('boundary-registration:'+d,e)).committed,true)
      assert.equal((await journal.putOnce(index(e.sequence),{digest:d})).committed,true)
     },
     bindRequest:async(r,e)=>{assert.equal((await journal.putOnce('boundary-request:'+r,e)).committed,true)},
     readRequest:r=>journal.get('boundary-request:'+r)
    }
    return await fn(tx)
   }finally{await held.finish(true)}
  }
  await retainBoundaryRegistration({envelope:registration,withAuthority})
  const calls=[]
  const call=async(name,args)=>{
   if(!['issue_boundary_marker','capture_boundary_incarnation','prepare_boundary_incarnation','advance_boundary_incarnation'].includes(name))throw Error('rpc_denied')
   calls.push(name)
   const role=name==='advance_boundary_incarnation'?'mip_temporal_ack_gateway':'mip_temporal_recorder'
   const result=await f.admin('set session authorization '+role+';select mip_temporal.'+name+'('+args.map(q).join(',')+');')
   return name==='prepare_boundary_incarnation'?result:JSON.parse(result)
  }
  const makeApi=(reg=registration,customCall=call)=>createBoundaryCustodyTransport({envelope:reg,expectedHead:boundaryRegistrationDigest(reg),withAuthority,call:customCall})
  const api=makeApi()
  const issue=(request=randomUUID(),using=api)=>using.issue({session:b.session(),bindingId:b.bindingId,request})
  const capture=(target,before=b.before,request=randomUUID(),using=api)=>using.capture({session:b.session(),bindingId:b.bindingId,before,request,target})
  const consume=(c,extra={})=>consumeBoundaryCapture({capture:c,registration,observationEpoch:f.observationEpoch,
   revisionRelation,markerRelation,session:b.session(),journal:b.journal(),transport:api,...extra})
  return {...b,registration,contractDigest,incarnationId,api,makeApi,call,calls,issue,capture,consume,withAuthority,
   refreshAll:async()=>{await b.refresh();custodySession=await f.issue(runtime,producerRole)},
   replaceCustody:async()=>{
    const next={...registration,sequence:2,previous:boundaryRegistrationDigest(registration),bindingId:randomUUID(),incarnationId:randomUUID(),recoveryEvidence:sha('synthetic replacement')}
    approved.add(boundaryRegistrationDigest(next));await retainBoundaryRegistration({envelope:next,withAuthority})
   }}
 }
 await t.test('authorized marker closes empty revision interval through custody and actual narrow gateways',async t=>{
  const b=await configured(t),before=await b.confirmed(),request=randomUUID()
  await f.admin('create table public.boundary_unrelated(id uuid);insert into public.boundary_unrelated values(gen_random_uuid());')
  const issue=await b.issue(request)
  assert.deepEqual(await b.issue(request),issue)
  await assert.rejects(()=>b.issue(),/mip_boundary_pending_request/)
  const c=await b.capture(request)
  assert.equal(c.kind,'marker');assert.equal(await b.confirmed(),before)
  const result=await b.consume(c)
  assert.equal(result.historical_time_qualified,false);assert.equal(await b.confirmed(),c.end_lsn)
  assert.equal(await b.checkpointCount(),'1')
  await b.refreshAll();assert.deepEqual(await b.consume(c),result)
  assert.ok(b.calls.includes('issue_boundary_marker')&&b.calls.includes('prepare_boundary_incarnation')&&b.calls.includes('advance_boundary_incarnation'))
  const next=await b.issue();assert.notEqual(next.marker_id,request)
 })
 await t.test('actual open revision across consumed marker commits later and is captured before next marker',async t=>{
  const b=await configured(t),pending=await holdRevision();let ended=false
  try{
   const first=await b.issue(),marker=await b.capture(first.marker_id);await b.consume(marker)
   await pending.finish(true);ended=true
   const next=await b.issue(),revision=await b.capture(next.marker_id,marker.end_lsn)
   assert.equal(revision.kind,'revision');await b.consume(revision)
   const last=await b.capture(next.marker_id,revision.end_lsn);assert.equal(last.kind,'marker');await b.consume(last)
   const retained=await b.journal().get('commit-v1:'+b.context.source_id+':'+b.context.stream_epoch+':'+
    (await import('../../supabase/qualification/hypothesis-assessments/pgoutputRecorder.mjs')).decodeRevisionCommits(revision.frames.map(x=>Buffer.from(x,'hex')),{relationId:revisionRelation,observationEpoch:f.observationEpoch})[0].input.commit_lsn)
   const ids=JSON.parse(await f.admin('select jsonb_agg(id::text) from mip_hypothesis.revisions where investigation_id='+q(pending.investigationId)))
   assert.deepEqual(retained.revisions.map(r=>r.revision_id),ids);assert.equal(await b.checkpointCount(),'3')
  }finally{if(!ended)await pending.finish(false)}
 })
 await t.test('rollback of authorized issuer or open revision never manufactures marker or revision coverage',async t=>{
  const b=await configured(t),request=randomUUID(),before=await b.confirmed()
  const rollbackApi=b.makeApi(b.registration,async(name,args)=>{
   if(name!=='issue_boundary_marker')return b.call(name,args)
   const held=await hold(f.db,'select mip_temporal.'+name+'('+args.map(q).join(',')+');','mip_temporal_recorder')
   await held.finish(false);throw Error('synthetic_issue_rollback')
  })
  await assert.rejects(()=>b.issue(request,rollbackApi),/synthetic_issue_rollback/)
  assert.equal(await f.admin('select count(*) from mip_temporal.boundary_issues where request_id='+q(request)),'0')
  await assert.rejects(()=>b.capture(request),/mip_boundary_committed_issue_required/)
  const pending=await holdRevision();await pending.finish(false)
  await b.issue(request);const c=await b.capture(request);assert.equal(c.kind,'marker')
  assert.equal(await b.confirmed(),before);await b.consume(c);assert.equal(await b.checkpointCount(),'1')
 })
 await t.test('intervening transactions cannot be skipped or relabelled as marker',async t=>{
  const b=await configured(t);await b.produce();await b.produce()
  const issue=await b.issue(),first=await b.capture(issue.marker_id)
  assert.equal(first.kind,'revision')
  await assert.rejects(()=>b.consume({...first,kind:'marker'}))
  assert.equal(await b.confirmed(),b.before)
  await b.consume(first)
  const second=await b.capture(issue.marker_id,first.end_lsn);assert.equal(second.kind,'revision');await b.consume(second)
  const marker=await b.capture(issue.marker_id,second.end_lsn);assert.equal(marker.kind,'marker');await b.consume(marker)
  assert.equal(await b.checkpointCount(),'3')
 })
 await t.test('binding-filtered concurrent streams never consume another binding marker',async t=>{
  const a=await configured(t),b=await configured(t),ia=await a.issue(),ib=await b.issue()
  const ca=await a.capture(ia.marker_id),cb=await b.capture(ib.marker_id)
  assert.equal(ca.target_marker,ia.marker_id);assert.equal(cb.target_marker,ib.marker_id)
  await assert.rejects(()=>a.capture(ib.marker_id),/mip_registration_custody_required/)
  await a.consume(ca);await b.consume(cb)
 })
 await t.test('lost source responses reuse exact issue and capture rather than launching new identities',async t=>{
  const b=await configured(t),request=randomUUID();let loseIssue=true,loseCapture=true
  const api=b.makeApi(b.registration,async(name,args)=>{
   const result=await b.call(name,args)
   if(name==='issue_boundary_marker'&&loseIssue){loseIssue=false;throw Error('lost_issue')}
   if(name==='capture_boundary_incarnation'&&loseCapture){loseCapture=false;throw Error('lost_capture')}
   return result
  })
  await assert.rejects(()=>b.issue(request,api),/lost_issue/);await b.issue(request,api)
  const captureId=randomUUID()
  await assert.rejects(()=>b.capture(request,b.before,captureId,api),/lost_capture/)
  const c=await b.capture(request,b.before,captureId,api);await b.consume(c)
  assert.equal(await f.admin('select count(*) from mip_temporal.boundary_issues where request_id='+q(request)),'1')
  assert.equal(await b.checkpointCount(),'1')
 })
 await t.test('missing bootstrap or mutated custody readback prevents source permits and slot advancement',async t=>{
  const b=await configured(t),issue=await b.issue(),c=await b.capture(issue.marker_id),j=b.journal()
  await assert.rejects(()=>b.consume(c,{journal:{putOnce:j.putOnce,get:async k=>k.startsWith('bootstrap-v1:')?null:j.get(k)}}))
  await assert.rejects(()=>b.consume(c,{journal:{putOnce:j.putOnce,get:async k=>k.startsWith('boundary-delivery-v2:')?null:j.get(k)}}))
  assert.equal(await b.confirmed(),b.before);assert.equal(await b.checkpointCount(),'0')
  await b.consume(c)
 })
 await t.test('rolled-back SQL receipt after native advance recovers exact retained capture and permit',async t=>{
  const b=await configured(t),issue=await b.issue(),c=await b.capture(issue.marker_id)
  let request
  await assert.rejects(()=>b.consume(c,{transport:{prepare:b.api.prepare,advance:async p=>{request=p;throw Error('before_advance')}}}),/before_advance/)
  const held=await hold(f.db,'select mip_temporal.advance_boundary_incarnation('+[request.session,request.request,b.incarnationId,b.contractDigest].map(q).join(',')+');','mip_temporal_ack_gateway')
  await held.finish(false)
  assert.equal(await b.confirmed(),c.end_lsn);assert.equal(await b.checkpointCount(),'0')
  await b.refreshAll();await b.consume(c);assert.equal(await b.checkpointCount(),'1')
 })
 await t.test('changed publication filter, stale registration and wrong incarnation fail closed',async t=>{
  const b=await configured(t)
  await f.admin('alter publication '+b.pub+' set table mip_hypothesis.revision_transactions(revision_id,epoch,creator_xid),mip_temporal.registered_stream_markers(marker_id,binding_id,epoch,creator_xid);')
  await assert.rejects(()=>b.issue(),/mip_boundary_publication_denied/)
  await f.admin('alter publication '+b.pub+' set table mip_hypothesis.revision_transactions(revision_id,epoch,creator_xid),mip_temporal.registered_stream_markers(marker_id,binding_id,epoch,creator_xid) where (binding_id='+q(b.bindingId)+'::uuid);')
  const issue=await b.issue(),c=await b.capture(issue.marker_id)
  await assert.rejects(()=>b.call('capture_boundary_incarnation',[b.session(),b.bindingId,randomUUID(),b.contractDigest,b.before,randomUUID(),issue.marker_id]),/mip_source_incarnation_denied/)
  await b.replaceCustody()
  await assert.rejects(()=>b.issue(),/mip_registration_custody_required/)
  await assert.rejects(()=>b.consume(c),/mip_registration_custody_required/)
  assert.equal(await b.confirmed(),b.before)
 })
 await t.test('revoked source cannot issue, capture, prepare or replay an advanced result',async t=>{
  const b=await configured(t),issue=await b.issue(),c=await b.capture(issue.marker_id)
  await b.consume(c);await f.admin(b.revokeSql)
  await assert.rejects(()=>b.issue(),/mip_temporal_binding_denied/)
  await assert.rejects(()=>b.capture(issue.marker_id,b.before,c.id),/mip_temporal_binding_denied/)
  await assert.rejects(()=>b.consume(c),/mip_temporal_binding_denied/)
  assert.equal(await b.checkpointCount(),'1')
 })
 await t.test('slot loss leaves retained delivery and source records, with no fabricated recovery',async t=>{
  const b=await configured(t),issue=await b.issue(),c=await b.capture(issue.marker_id)
  await assert.rejects(()=>b.consume(c,{transport:{prepare:b.api.prepare,advance:async()=>{throw Error('hold')}}}),/hold/)
  await f.admin('select pg_drop_replication_slot('+q(b.slot)+');')
  await assert.rejects(()=>b.consume(c),/mip_temporal_slot_denied/)
  assert.equal(await b.checkpointCount(),'0')
  assert.equal(await f.admin('select count(*) from mip_temporal.stream_captures where id='+q(c.id)),'1')
 })
 await t.test('custody envelope pins are forwarded unchanged and independently rejected by source registration',async t=>{
  const wrongIncarnation=await configured(t,{incarnationMismatch:true})
  await assert.rejects(()=>wrongIncarnation.issue(),/mip_source_incarnation_denied/)
  assert.ok(wrongIncarnation.calls.includes('issue_boundary_marker'))
  const wrongContract=await configured(t,{contractMismatch:true})
  await assert.rejects(()=>wrongContract.issue(),/mip_boundary_contract_denied/)
  assert.ok(wrongContract.calls.includes('issue_boundary_marker'))
 })
 await t.test('v1 publication contract and direct native/table privilege exclusions are preserved',async t=>{
  const b=await configured(t)
  await assert.rejects(()=>b.capture(randomUUID()),/mip_registration_custody_required/)
  await assert.rejects(()=>f.admin('set session authorization mip_temporal_recorder;select mip_temporal.capture_incarnation('+[b.session(),b.bindingId,b.incarnationId,b.before,randomUUID()].map(q).join(',')+');'),/mip_coverage_publication_denied/)
  for(const role of ['mip_temporal_recorder','mip_temporal_ack_gateway','mip_comparison_worker_v1','service_role']){
   await assert.rejects(()=>f.admin('set session authorization '+role+';insert into mip_temporal.registered_stream_markers values('+[randomUUID(),b.bindingId,f.observationEpoch,'1'].map(q).join(',')+');'),/mip_database_denied_42501/)
   await assert.rejects(()=>f.admin('set session authorization '+role+';update mip_temporal.boundary_stream_configs set contract_digest='+q('a'.repeat(64))+';'),/mip_database_denied_42501/)
  }
 })
}
