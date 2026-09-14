import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {createExactCitationAdapter,createCanonicalFieldSource} from '../../supabase/qualification/content-addressed-storage/exactCitation.mjs'
import {createStore} from '../../supabase/qualification/content-addressed-storage/store.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
const q=x=>x===null?'null':Buffer.isBuffer(x)?"decode('"+x.toString('hex')+"','hex')":typeof x==='number'?String(x):"'"+(typeof x==='object'?JSON.stringify(x):x).replaceAll("'","''")+"'"
const policy={policyVersion:1,maxRaw:1048576,maxEncoded:1048576,maxPage:50,allowedLocations:['disposable_postgres'],allowedCodecs:['identity-v1','gzip-v1'],allowedTiers:['hot','warm','cold','deep_archive']}
export async function exactCitationCases(t,f,context){
 await f.admin(await readFile(new URL('../../supabase/qualification/content-addressed-storage/001_store.sql',import.meta.url),'utf8'))
 await f.admin(await readFile(new URL('../../supabase/qualification/content-addressed-storage/002_exact_citation.sql',import.meta.url),'utf8'))
 const x=await context(t),i=x.identity.iid,revision=x.revisions[0]
 const saved=JSON.parse(await f.admin('select assessment from mip_hypothesis.revisions where id='+q(revision))),e=saved.evidence[0],eid=e.id
 const retained=JSON.parse(await f.admin("select jsonb_build_object('workspace',b.workspace_version_id,'parent',coalesce(nullif(inp->'capture','null'::jsonb),inp->'record_version')::text) from mip_hypothesis.acceptance_bindings b join evidence_pipeline.investigation_observations o on o.id=b.observation_id cross join lateral jsonb_array_elements(o.snapshot->'inputs') inp where b.revision_id="+q(revision)+" and inp->>'position'="+q(e.input_position)))
 const parent=Buffer.from(retained.parent),record=JSON.parse(retained.parent)
 const acquired=await f.admin("select to_char("+q(record.captured_at??record.recorded_at)+"::timestamptz at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')")
 const parentKey='citation-parent:'+randomUUID(),fieldKey='citation-field:'+randomUUID(),reader='mip_citation_fixture_reader'
 await f.admin('create role '+reader+' login;grant mip_citation_gateway,mip_cas_gateway to '+reader+';insert into mip_cas.principals values('+q(reader)+','+q(x.identity.user)+');insert into mip_cas.access values('+q(x.identity.user)+','+q(i)+",clock_timestamp()+interval '1 hour')")
 const cas=async(name,args)=>JSON.parse(await f.admin('set session authorization '+reader+';select mip_cas.'+name+'('+args.map(q).join(',')+')')||'null')
 const call=async(name,args)=>{assert(['read','bind','preview'].includes(name));return JSON.parse(await f.admin('set session authorization '+reader+';select mip_citation.'+name+'('+args.map(q).join(',')+')'))}
 const source=async(name,args)=>JSON.parse(await f.admin('set session authorization mip_citation_source;select to_jsonb(mip_citation.'+name+'('+args.map(q).join(',')+'))'))
 // Source-owner seeding is synthetic only. No caller-facing extraction/rights authority.
 const seed=async(raw,version,capture=randomUUID())=>{
  const p={source_version:version,acquired_at:acquired,rights_ref:'synthetic-citation',privacy_ref:'synthetic-citation'}
  await f.admin('insert into mip_cas.source_identities values('+[capture,i,version,sha(raw),raw.length,acquired].map(q).join(',')+');insert into mip_cas.source_permissions values('+[i,version,p.rights_ref,p.privacy_ref].map(q).join(',')+",clock_timestamp()+interval '1 hour')")
  return p
 }
 const pp=await seed(parent,e.material_version)
 await cas('put',[i,parentKey,parent,'identity-v1',parent,pp])
 const plan=await source('plan',[i,retained.workspace,e.input_position,e.source_span.source_field,parentKey])
 const field=Buffer.from(plan.field_base64,'base64');let fp
 const fieldSource=createCanonicalFieldSource({sourceCall:source,casCall:cas,investigation:i,policy,attestDerivedField:async attestation=>{
  assert.equal(attestation.field_source_version,plan.field_source_version);assert.equal(attestation.field_hash,sha(field))
  if(!fp)fp=await seed(field,attestation.field_source_version,attestation.field_capture_id);return fp
 }})
 const registration=await fieldSource.register({workspaceVersion:retained.workspace,inputPosition:e.input_position,sourceField:e.source_span.source_field,parentKey,fieldKey})
 assert.equal((await fieldSource.register({workspaceVersion:retained.workspace,inputPosition:e.input_position,sourceField:e.source_span.source_field,parentKey,fieldKey})).field_id,registration.field_id)
 const fid=registration.field_id
 const adapter=createExactCitationAdapter({call,investigation:i,policy}),store=createStore({call:cas,investigation:i,policy})
 const initialRequest=randomUUID()
 await t.test('bind timeout is unknown outcome; late commit and exact request retry produce one receipt',async()=>{
  const request=initialRequest;let release,committedResolve,committedReject,mutationEntered=false
  const gate=new Promise(resolve=>{release=resolve})
  const committed=new Promise((resolve,reject)=>{committedResolve=resolve;committedReject=reject});committed.catch(()=>{})
  const delayed=createExactCitationAdapter({investigation:i,policy,call:async(name,args)=>{
   if(name!=='bind')return call(name,args)
   // Explicit unqualified, noncooperative transport: mutation starts only AFTER caller timeout.
   mutationEntered=true;await gate
   try{const value=await call(name,args);committedResolve(value);return value}catch(error){committedReject(error);throw error}
  }})
  try{
   await assert.rejects(()=>delayed.bind(revision,eid,fid,request),error=>error.message==='exact_citation_outcome_unknown'&&error.requestId===request)
   assert.equal(mutationEntered,true)
   assert.equal(await f.admin('select count(*) from mip_citation.bindings where investigation='+q(i)),'0')
  }finally{release();if(mutationEntered)await committed}
  const replay=await adapter.bind(revision,eid,fid,request)
  assert.equal(replay.request_id,request)
  assert.equal(await f.admin('select count(*) from mip_citation.binding_requests where investigation='+q(i)+' and user_id='+q(x.identity.user)+' and request_id='+q(request)),'1')
  assert.equal(await f.admin('select count(*) from mip_citation.bindings where investigation='+q(i)+' and assessment_revision='+q(revision)+' and evidence_id='+q(eid)),'1')
  await assert.rejects(()=>call('bind',[i,revision,'different-evidence',fid,request]),/citation_request_conflict/)
 })
 const baseline=await call('read',[i,revision,eid]),result=await adapter.read(revision,eid)
 await t.test('native saved Unicode code points become exact field UTF-8 offsets with separate parent provenance',async()=>{
  assert.equal(result.passage,Array.from(field.toString('utf8')).slice(e.source_span.start,e.source_span.end).join(''))
  assert.equal(sha(Buffer.from(result.passage)),e.source_span.excerpt_sha256)
  assert.equal(result.provenance.byte_start,Buffer.byteLength(Array.from(field.toString('utf8')).slice(0,e.source_span.start).join('')))
  assert.ok(result.provenance.byte_end-result.provenance.byte_start>e.source_span.end-e.source_span.start)
  assert.notEqual(result.provenance.parent_source_provenance.source_version,result.provenance.field_representation_provenance.source_version)
  for(const k of ['claim_truth_qualified','source_authority_qualified','ingest_extraction_qualified','rights_qualified','codec_qualified','temporal_provenance_qualified','production_qualified','transport_qualified','deployment_qualified','publication_allowed'])assert.equal(result[k],false)
 })
 await t.test('returned nested provenance is a detached immutable snapshot',async()=>{
  const transportResponse=structuredClone(baseline)
  const snapshot=await createExactCitationAdapter({investigation:i,policy,call:async()=>transportResponse}).read(revision,eid)
  for(const part of [snapshot,snapshot.provenance,snapshot.provenance.mapping,snapshot.provenance.parent_source_provenance,snapshot.provenance.field_representation_provenance])assert.equal(Object.isFrozen(part),true)
  assert.throws(()=>{snapshot.provenance.mapping.source_field='title'},TypeError)
  assert.throws(()=>{snapshot.provenance.parent_source_provenance.source_version='latest'},TypeError)
  transportResponse.identity.mapping.source_field='title'
  transportResponse.parent.provenance.source_version='latest'
  assert.equal(snapshot.provenance.mapping.source_field,e.source_span.source_field)
  assert.equal(snapshot.provenance.parent_source_provenance.source_version,e.material_version)
 })
 await t.test('exact raw-field admission rejects JSON wrapping and different bytes under the derived source identity',async()=>{
  for(const bad of [Buffer.from(JSON.stringify(field.toString('utf8'))),Buffer.concat([field,Buffer.from(' ')]),Buffer.from([255])]){
   const badKey='invalid-field:'+randomUUID()
   await assert.rejects(()=>cas('put',[i,badKey,bad,'identity-v1',bad,fp]),/mip_cas_source_rights_unverified/)
   assert.equal(await f.admin('select count(*) from mip_cas.refs where investigation='+q(i)+' and logical_key='+q(badKey)),'0')
  }
  assert.equal((await adapter.read(revision,eid)).passage,result.passage)
 })
 await t.test('investigation-leading citation keys have no global tiny-cap admission mechanism',async()=>{
  assert.equal(await f.admin("select to_regprocedure('mip_citation.quota()') is null"),'t')
  const indexes=await f.admin("select string_agg(indexdef,';') from pg_indexes where schemaname='mip_citation'")
  assert.match(indexes,/\(investigation, id\)/)
  assert.match(indexes,/\(investigation, material_version, source_field, id\)/)
  assert.match(indexes,/\(investigation, field_id, assessment_revision, evidence_id\)/)
  // Rollback-only structural fixture, not source-authorized registrations or a scale benchmark.
  // Cross former global ceilings without changing production policy or bypassing a quota trigger.
  const topology=JSON.parse(await f.admin("begin;with added as (insert into mip_citation.fields(id,investigation,workspace_version,input_position,material_version,source_field,identity) select gen_random_uuid(),gen_random_uuid(),workspace_version,input_position,material_version,source_field,identity from mip_citation.fields cross join generate_series(1,5000) where investigation="+q(i)+" and id="+q(fid)+" returning investigation,id) insert into mip_citation.bindings select a.investigation,gen_random_uuid(),'structural-only',a.id,b.identity from added a cross join mip_citation.bindings b where b.investigation="+q(i)+" and b.assessment_revision="+q(revision)+" and b.evidence_id="+q(eid)+";select jsonb_build_object('fields',(select count(*) from mip_citation.fields),'bindings',(select count(*) from mip_citation.bindings));rollback"))
  assert.ok(topology.fields>1024);assert.ok(topology.bindings>4096)
  assert.equal(await f.admin('select count(*) from mip_citation.fields'),'1')
  assert.equal(await f.admin('select count(*) from mip_citation.bindings'),'1')
 })
 await t.test('source orchestrator rejects altered planned bytes before raw admission',async()=>{
  let writes=0
  const badSource=createCanonicalFieldSource({investigation:i,policy,sourceCall:async(name,args)=>{
   const value=await source(name,args)
   if(name==='plan')value.field_base64=Buffer.from(JSON.stringify(field.toString('utf8'))).toString('base64')
   return value
  },casCall:async(name,args)=>{if(name==='put')writes++;return cas(name,args)},attestDerivedField:async()=>fp})
  await assert.rejects(()=>badSource.register({workspaceVersion:retained.workspace,inputPosition:e.input_position,sourceField:e.source_span.source_field,parentKey,fieldKey}))
  assert.equal(writes,0)
 })
 await t.test('source-only registration permits exact retry; conflicting and cross-scope mappings deny',async()=>{
  await assert.rejects(()=>source('plan',[i,retained.workspace,'',e.source_span.source_field,parentKey]),/citation_field_invalid/)
  await assert.rejects(()=>f.admin('set session authorization '+reader+';select mip_citation.plan('+[i,retained.workspace,e.input_position,e.source_span.source_field,parentKey].map(q).join(',')+')'))
  assert.equal(await source('register_field',[i,retained.workspace,e.input_position,e.source_span.source_field,parentKey,fieldKey]),fid)
  await assert.rejects(()=>source('register_field',[i,retained.workspace,e.input_position,'title',parentKey,fieldKey]))
  await assert.rejects(()=>source('register_field',[randomUUID(),retained.workspace,e.input_position,e.source_span.source_field,parentKey,fieldKey]))
  assert.equal((await adapter.bind(revision,eid,fid,initialRequest)).request_id,initialRequest)
  await assert.rejects(()=>call('bind',[i,revision,eid,randomUUID(),initialRequest]),/citation_request_conflict/)
  await assert.rejects(()=>call('read',[randomUUID(),revision,eid]))
  await assert.rejects(()=>f.admin('set session authorization '+reader+';select * from mip_citation.fields'))
  await assert.rejects(()=>f.admin('update mip_citation.fields set identity=identity where id='+q(fid)),/citation_immutable/)
 })
 await t.test('native ASCII conversion uses rollback-only administrator faults',async()=>{
  const patch="alter table mip_hypothesis.revisions disable trigger immutable_rows;alter table mip_hypothesis.acceptance_bindings disable trigger immutable_rows;"+
   "update mip_hypothesis.revisions set assessment=jsonb_set(assessment,'{evidence,0,source_span}',"+q({source_field:e.source_span.source_field,start:0,end:1,excerpt_sha256:sha(Buffer.from('A'))})+"::jsonb) where id="+q(revision)+";"+
   "update mip_hypothesis.acceptance_bindings set metadata=jsonb_set(jsonb_set(metadata,'{0,start}','0'),'{0,end}','1') where revision_id="+q(revision)
  const ascii=JSON.parse(await f.admin('begin;'+patch+';set session authorization '+reader+';select mip_citation.preview('+[i,revision,eid,fid].map(q).join(',')+');rollback')).identity
  assert.equal(ascii.byte_start,0);assert.equal(ascii.byte_end,1);assert.equal(ascii.span_hash,sha(Buffer.from('A')))
  assert.deepEqual(await call('read',[i,revision,eid]),baseline)
 })
 await t.test('wrong canonical bytes/hash/version/field/offset unit and ambiguous response mappings deny',async()=>{
  const mutations=[
   v=>{v.field.encoded=Buffer.from('wrong bytes').toString('base64')},
   v=>{v.field.hash='0'.repeat(64)},
   v=>{v.parent.encoded_hash='0'.repeat(64)},
   v=>{v.field.provenance.source_version='latest'},
   v=>{v.identity.mapping.source_field='title'},
   v=>{v.identity.mapping.source_field='title';v.identity.source_field='title'},
   v=>{v.identity.mapping.resolver_offset_unit='utf16_code_units'},
   v=>{v.identity.byte_end=v.identity.end_code_point},
   v=>{v.identity.byte_start++},
   v=>{v.identity.span_hash='0'.repeat(64)},
   v=>{v.identity.mapping=[v.identity.mapping,v.identity.mapping]},
   v=>{v.identity.mapping.field_ref_id=randomUUID()},
   v=>{v.identity.investigation=randomUUID()},
   v=>{v.field.state='rehydration_required'},
   v=>{v.identity.mapping.field_source_version=v.identity.mapping.parent_source_version},
   v=>{delete v.identity.mapping.assessment_offset_unit},
   v=>{v.identity.start_code_point=null}
  ]
  for(const mutate of mutations){
   const response=structuredClone(baseline);mutate(response)
   await assert.rejects(()=>createExactCitationAdapter({investigation:i,policy,call:async()=>response}).read(revision,eid))
  }
 })
 await t.test('tampered persisted binding or mapping denied in native rollback probes',async()=>{
  for(const table of ['bindings','fields']){
   const where=table==='fields'?'id='+q(fid):'assessment_revision='+q(revision)+' and evidence_id='+q(eid)
   await assert.rejects(()=>f.admin('begin;alter table mip_citation.'+table+' disable trigger immutable_rows;update mip_citation.'+table+" set identity=jsonb_set(identity,'{field_hash}',"+q(JSON.stringify('0'.repeat(64)))+"::jsonb) where "+where+';set session authorization '+reader+';select mip_citation.read('+[i,revision,eid].map(q).join(',')+');rollback'),/citation_mapping_tampered|citation_binding_tampered/)
  }
  assert.deepEqual(await call('read',[i,revision,eid]),baseline)
 })
 await t.test('current access, retained permissions and both source-rights tuples rechecked on native reads',async()=>{
  const faults=[
   "update mip_cas.access set expires_at=clock_timestamp()-interval '1 second' where investigation="+q(i),
   "update mip_cas.source_permissions set expires_at=clock_timestamp()-interval '1 second' where source_version="+q(pp.source_version),
   "update mip_cas.source_permissions set expires_at=clock_timestamp()-interval '1 second' where source_version="+q(fp.source_version),
   "update mip_identity.operation_evidence_heads set active=false where scope->>'source_version'="+q(e.material_version)+" and scope->>'domain'='privacy'",
   "delete from evidence_pipeline.investigation_memberships where investigation_id="+q(i)+" and user_id="+q(x.identity.user)
  ]
  for(const fault of faults)await assert.rejects(()=>f.admin('begin;'+fault+';set session authorization '+reader+';select mip_citation.read('+[i,revision,eid].map(q).join(',')+');rollback'),/mip_cas_denied|mip_cas_source_rights_unverified|hypothesis.*read.*denied|citation_assessment_denied/)
  assert.equal((await adapter.read(revision,eid)).passage,result.passage)
 })
 await t.test('cold/deep parent or field must rehydrate exact versions; indexes never substitute',async()=>{
  await store.indexPut(fieldKey,plan.field_hash,0,{summary:'false substitute passage',vector_refs:['not-evidence']})
  for(const key of [fieldKey,parentKey])for(const tier of ['cold','deep_archive']){
   const current=await store.metadata(key);const version=await store.transition(key,current.version,tier)
   await assert.rejects(()=>adapter.read(revision,eid),/citation_rehydration_required/)
   const job=await store.requestRehydration(key,randomUUID(),version)
   await assert.rejects(()=>adapter.read(revision,eid),/citation_rehydration_required/)
   await store.completeRehydration(key,job.job_id)
   assert.equal((await adapter.read(revision,eid)).passage,result.passage)
  }
 })
}
