import test from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {createStore,createCodecVerifier,encodeCanonical,decodeCanonical} from '../../supabase/qualification/content-addressed-storage/store.mjs'
const exec=promisify(execFile),i='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',alice='00000000-0000-4000-8000-000000000003',bob='00000000-0000-4000-8000-000000000004'
const policy={policyVersion:1,maxRaw:1048576,maxEncoded:1048576,maxPage:50,allowedLocations:['disposable_postgres'],allowedCodecs:['identity-v1','gzip-v1'],allowedTiers:['hot','warm','cold','deep_archive']}
const envelopePolicy={policy_version:1,max_raw:1048576,max_encoded:1048576,max_page:50,allowed_locations:policy.allowedLocations,allowed_codecs:policy.allowedCodecs,allowed_tiers:policy.allowedTiers}
const provenance={source_version:'synthetic-v1',acquired_at:'2026-09-14T00:00:00Z',rights_ref:'synthetic-only',privacy_ref:'synthetic-only'}
const fixtureProvenance=provenance
const q=x=>x===null?'null':Buffer.isBuffer(x)?"decode('"+x.toString('hex')+"','hex')":typeof x==='number'?String(x):"'"+(typeof x==='object'?JSON.stringify(x):x).replaceAll("'","''")+"'"
async function sql(s){const r=await exec('psql',['-X','-v','ON_ERROR_STOP=1','-At','-h','127.0.0.1','-U','postgres','-d','mip_cas_test','-c',s],{env:{...process.env,PGPASSWORD:'mip-disposable-ci-only'},timeout:10000,maxBuffer:4*1024*1024});return r.stdout.trim().split('\n').filter(x=>x&&!['SET','RESET','BEGIN','COMMIT','ROLLBACK'].includes(x)).at(-1)}
const hashBytes=raw=>createHash('sha256').update(raw).digest('hex')
// Explicit owner-only fixture seeding, never part of gateway/codec transport.
async function seedCapture(scope,raw,p=provenance){
 await sql("insert into mip_cas.source_identities values("+q(randomUUID())+","+q(scope)+","+q(p.source_version)+","+q(hashBytes(raw))+","+raw.length+","+q(p.acquired_at)+")")
 await sql("insert into mip_cas.source_permissions values("+q(scope)+","+q(p.source_version)+","+q(p.rights_ref)+","+q(p.privacy_ref)+",clock_timestamp()+interval '1 hour') on conflict do nothing")
}
const names=new Set(['admit','bind','locate','read','put','index_put','transition','rehydrate','complete','cleanup'])
function callAs(role){return async(name,args)=>{assert(names.has(name));const result=await sql('set session authorization '+role+';select mip_cas.'+name+'('+args.map(q).join(',')+')');return result?JSON.parse(result):null}}
test('content addressed tier qualification: native PostgreSQL, synthetic principals only',async t=>{
 if(process.env.MIP_DISPOSABLE_POSTGRES!=='content-addressed-qualification')throw Error('disposable_guard')
 await exec('createdb',['-h','127.0.0.1','-U','postgres','mip_cas_test'],{env:{...process.env,PGPASSWORD:'mip-disposable-ci-only'}})
 await sql(await readFile('supabase/qualification/content-addressed-storage/001_store.sql','utf8'))
 await sql("create role cas_alice login;create role cas_bob login;create role cas_codec login;grant mip_cas_gateway to cas_alice,cas_bob;grant mip_cas_codec_verifier to cas_codec;insert into mip_cas.principals values('cas_alice',"+q(alice)+"),('cas_bob',"+q(bob)+");insert into mip_cas.access values("+q(alice)+","+q(i)+",clock_timestamp()+interval '1 hour'),("+q(bob)+","+q(other)+",clock_timestamp()+interval '1 hour')")
 await sql("insert into mip_cas.source_permissions values("+q(i)+",'synthetic-v1','synthetic-only','synthetic-only',clock_timestamp()+interval '1 hour'),("+q(i)+",'synthetic-v2','synthetic-only','synthetic-only',clock_timestamp()+interval '1 hour'),("+q(other)+",'synthetic-v1','synthetic-only','synthetic-only',clock_timestamp()+interval '1 hour')")
 const a=callAs('cas_alice'),b=callAs('cas_bob'),codecAuthority=createCodecVerifier({call:callAs('cas_codec'),policy}),store=createStore({call:a,investigation:i,provenance,codecAuthority,policy}),value={text:'Exact Unicode 🧭 and whitespace\n  retained',n:1}
 await seedCapture(i,Buffer.from(JSON.stringify(value)))
 await seedCapture(other,Buffer.from(JSON.stringify(value)))
 await seedCapture(i,Buffer.from(JSON.stringify({...value,n:2})),{...provenance,source_version:'synthetic-v2'})
 await t.test('lossless canonical roundtrip and putOnce/get exact retry',async()=>{
  assert.deepEqual(await store.putOnce('revision:1',value),{committed:true})
  assert.deepEqual(await store.get('revision:1'),value)
  await store.putOnce('revision:1',value)
  const conflicting=createStore({call:a,investigation:i,provenance:{...provenance,source_version:'synthetic-v2'},codecAuthority,policy})
  await assert.rejects(conflicting.putOnce('revision:1',{...value,n:2}),/mip_cas_retry_conflict/)
  for(const codec of ['identity-v1','gzip-v1']){
   const e=encodeCanonical(Buffer.from('canonical 🧭'),codec,policy)
   assert.deepEqual(decodeCanonical({state:'canonical_encoded',...envelopePolicy,...e,encoded:e.encoded.toString('base64'),raw_size:e.raw.length}),e.raw)
  }
 })
 await t.test('cross user and investigation isolation, no direct object/index table access',async()=>{
  await assert.rejects(b('read',[i,'revision:1','canonical']),/mip_cas_denied/)
  await assert.rejects(a('read',[other,'revision:1','metadata']),/mip_cas_denied/)
  await assert.rejects(sql('set session authorization cas_bob;select * from mip_cas.objects'),/permission denied/)
  await assert.rejects(sql('set session authorization cas_alice;set role mip_cas_owner'),/permission denied/)
 })
 await t.test('dedup preserves separate references and scopes',async()=>{
  const beforeObjects=await sql('select count(*) from mip_cas.objects')
  await store.putOnce('revision:1-alias',value)
  const otherStore=createStore({call:b,investigation:other,provenance,codecAuthority,policy})
  await otherStore.putOnce('other-ref',value)
  assert.equal(await sql('select count(*) from mip_cas.objects'),beforeObjects)
  assert.equal(await sql('select count(*) from mip_cas.refs'),'3')
  await assert.rejects(store.transition('revision:1',1,'cold'),/mip_cas_shared_tier_custodian_required/)
 })
 await t.test('metadata/index progressive retrieval cannot supply factual evidence',async()=>{
  const meta=await store.metadata('revision:1')
  assert.equal(meta.encoded,undefined)
  await store.indexPut('revision:1',meta.hash,0,{summary:'POISONED allegation',entities:['X'],claims:['POISON'],timeline:[],vector_refs:['synthetic-vector']})
  const index=await store.index('revision:1');assert.equal(index.index_is_evidence,false);assert.equal(index.encoded,undefined)
  assert.deepEqual(JSON.parse((await store.factualEvidence('revision:1')).toString()),value)
  await assert.rejects(store.indexPut('revision:1','0'.repeat(64),1,{summary:'wrong'}),/mip_cas_index_invalid/)
  await assert.rejects(store.indexPut('revision:1',meta.hash,0,{summary:'stale'}),/mip_cas_index_version/)
  await assert.rejects(a('read',[i,'revision:1','summary_as_evidence']),/mip_cas_level/)
  await sql("update mip_cas.indexes set canonical_hash='"+'0'.repeat(64)+"' where ref_id="+q(meta.ref_id))
  await assert.rejects(store.index('revision:1'),/mip_cas_stale_index/)
  await store.indexPut('revision:1',meta.hash,1,{summary:'Restored locator'})
 })
 await t.test('bounded scoped locator search and keyset pagination remain locator-only',async()=>{
  const meta=await store.metadata('revision:1'),alias=await store.metadata('revision:1-alias')
  await store.indexPut('revision:1-alias',alias.hash,0,{summary:'Restored locator',entities:['Entity-A'],claims:['Untrusted claim'],timeline:['2026-09-14'],vector_refs:['vector-id']})
  const first=await store.locate('summary','Restored',{limit:1})
  assert.equal(first.candidates.length,1);assert.equal(first.locator_only,true);assert.equal(first.factual_support_qualified,false)
  assert.deepEqual(Object.keys(first.candidates[0]).sort(),['canonical_hash','ref_id','source_version'])
  const second=await store.locate('summary','Restored',{limit:1,after:first.next_cursor})
  assert.equal(second.candidates.length,1);assert.notEqual(first.candidates[0].ref_id,second.candidates[0].ref_id)
  assert.equal((await b('locate',[other,'summary','Restored',null,5])).candidates.length,0)
  await assert.rejects(b('locate',[i,'summary','Restored',null,5]),/mip_cas_denied/)
  for(const field of ['entities','claims','timeline','vector_refs'])assert.equal((await store.locate(field,field==='entities'?'Entity-A':field==='claims'?'Untrusted claim':field==='timeline'?'2026-09-14':'vector-id')).candidates.length,1)
  await assert.rejects(store.locate('summary','x',{limit:51}),/locator_request_invalid/)
  await assert.rejects(store.locate('encoded','x'),/locator_request_invalid/)
  await sql("update mip_cas.indexes set canonical_hash='"+'0'.repeat(64)+"' where ref_id="+q(meta.ref_id))
  await assert.rejects(store.locate('summary','Restored'),/mip_cas_stale_index/)
  await store.indexPut('revision:1',meta.hash,2,{summary:'Restored locator'})
 })
 await t.test('exact citation joins retained identity/version and verified byte span, never latest or similar',async()=>{
  const provenance={...fixtureProvenance,source_version:'citation-old-v1'}
  const store=createStore({call:a,investigation:i,provenance,codecAuthority,policy})
  await seedCapture(i,Buffer.from(JSON.stringify({passage:'Original retained passage'})),provenance)
  await seedCapture(i,Buffer.from(JSON.stringify({passage:'A similar but changed passage'})),{...provenance,source_version:'citation-new-v1'})
  await store.putOnce('source-old',{passage:'Original retained passage'})
  const newer=createStore({call:a,investigation:i,provenance:{...provenance,source_version:'citation-new-v1'},codecAuthority,policy})
  await newer.putOnce('source-latest',{passage:'A similar but changed passage'})
  const meta=await store.metadata('source-old'),raw=await store.factualEvidence('source-old')
  const start=12,end=20,span=raw.subarray(start,end)
  const c={logical_key:'source-old',ref_id:meta.ref_id,canonical_hash:meta.hash,source_version:'citation-old-v1',start_byte:start,end_byte:end,span_hash:createHash('sha256').update(span).digest('hex')}
  const result=await store.resolveCitation(c);assert.deepEqual(result.bytes,span);assert.equal(result.claim_truth_qualified,false)
  await assert.rejects(store.resolveCitation({...c,logical_key:'source-latest'}),/citation_identity_mismatch/)
  await assert.rejects(store.resolveCitation({...c,source_version:'citation-new-v1'}),/citation_identity_mismatch/)
  await assert.rejects(store.resolveCitation({...c,span_hash:'0'.repeat(64)}),/citation_span_hash/)
  await assert.rejects(store.resolveCitation({...c,end_byte:999999}),/citation_span_bounds/)
  await assert.rejects(store.resolveCitation({...c,start_byte:-1}),/citation_invalid/)
  await store.transition('source-old',1,'cold')
  await assert.rejects(store.resolveCitation(c),/canonical_unavailable/)
  const cold=await store.metadata('source-old'),job=await store.requestRehydration('source-old',randomUUID(),cold.version)
  await store.completeRehydration('source-old',job.job_id)
  assert.deepEqual((await store.resolveCitation(c)).bytes,span)
 })
 await t.test('corruption/hash/codec mismatch never returns evidence',async()=>{
  const e=encodeCanonical(Buffer.from('test'),'gzip-v1',policy),record={state:'canonical_encoded',...envelopePolicy,...e,encoded:e.encoded.toString('base64'),raw_size:e.raw.length}
  assert.throws(()=>decodeCanonical({...record,encoded_hash:'0'.repeat(64)}),/encoded_hash/)
  assert.throws(()=>decodeCanonical({...record,hash:'0'.repeat(64)}),/canonical_hash/)
  assert.throws(()=>decodeCanonical({...record,codec:'unknown-v9'}),/codec_unsupported/)
  assert.throws(()=>decodeCanonical({...record,codec:'identity-v1'}),/canonical_hash/)
  const bytes=Buffer.from('canonical'),wrong=encodeCanonical(Buffer.from('different'),'gzip-v1',policy)
  await assert.rejects(a('put',[i,'malformed-gzip',bytes,'gzip-v1',wrong.encoded,provenance]),/mip_cas_codec_gateway_denied/)
  await assert.rejects(a('put',[i,'bad-identity',bytes,'identity-v1',Buffer.from('different'),provenance]),/mip_cas_codec_gateway_denied/)
 })
 await t.test('separate codec admission prevents cross-investigation first writer poisoning',async()=>{
  const provenance={...fixtureProvenance,source_version:'poison-proof-v1'}
  const store=createStore({call:a,investigation:i,provenance,codecAuthority,policy})
  const raw=Buffer.from(JSON.stringify({poison:'target'})),wrong=encodeCanonical(Buffer.from('poisoned'),'gzip-v1',policy)
  await assert.rejects(b('put',[other,'poison',raw,'gzip-v1',wrong.encoded,provenance]),/mip_cas_codec_gateway_denied/)
  await assert.rejects(b('admit',[raw,'gzip-v1',wrong.encoded]),/permission denied/)
  await seedCapture(i,raw,provenance)
  await codecAuthority.admit(raw)
  const receipt=await a('bind',[i,'poison-proof',raw,provenance])
  assert.deepEqual(await store.get('poison-proof'),{poison:'target'})
  await assert.rejects(a('put',[i,'codec-conflict',raw,'identity-v1',raw,provenance]),/mip_cas_representation_conflict/)
  await assert.rejects(sql("update mip_cas.representations set encoded=decode('00','hex') where hash="+q(receipt.hash)),/mip_cas_representation_immutable/)
  await assert.rejects(sql("update mip_cas.representations set codec='identity-v1' where hash="+q(receipt.hash)),/mip_cas_representation_immutable/)
  for(const p of [{...provenance,extra:'x'},{...provenance,rights_ref:7},{...provenance,acquired_at:'yesterday'},{...provenance,privacy_ref:''}])await assert.rejects(a('bind',[i,'bad-provenance',raw,p]),/mip_cas_provenance_invalid/)
 })
 await t.test('tier CAS races, cold read, authorized rehydration and exact replay',async()=>{
  const provenance={...fixtureProvenance,source_version:'tier-object-v1'}
  const store=createStore({call:a,investigation:i,provenance,codecAuthority,policy})
  await seedCapture(i,Buffer.from(JSON.stringify({unique:'tier'})),provenance)
  await store.putOnce('tier-object',{unique:'tier'})
  const race=await Promise.allSettled([store.transition('tier-object',1,'cold'),store.transition('tier-object',1,'warm')])
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1)
  let m=await store.metadata('tier-object')
  if(m.tier!=='cold'){await store.transition('tier-object',m.version,'cold');m=await store.metadata('tier-object')}
  await assert.rejects(store.factualEvidence('tier-object'),/canonical_unavailable/)
  const request=randomUUID(),j=await store.requestRehydration('tier-object',request,m.version)
  assert.deepEqual(await store.requestRehydration('tier-object',request,m.version),j)
  await assert.rejects(b('complete',[i,'tier-object',j.job_id]),/mip_cas_denied/)
  await store.completeRehydration('tier-object',j.job_id)
  await store.completeRehydration('tier-object',j.job_id)
  assert.deepEqual(await store.get('tier-object'),{unique:'tier'})
  for(const [version,field] of [[8,'codecs'],[9,'locations'],[10,'tiers'],[11,'encoded']]){
   await sql("insert into mip_cas.policies select "+version+",max_raw,"+(field==='encoded'?"1":"max_encoded")+",max_objects,max_total,max_refs,max_jobs,max_page,"+(field==='locations'?"array['replay-other-location']":"locations")+","+(field==='codecs'?"array['identity-v1']":"codecs")+","+(field==='tiers'?"array['hot']":"tiers")+",qualification,"+(field==='locations'?"'replay-other-location'":"initial_location")+",initial_tier from mip_cas.policies where version=1;update mip_cas.active_policy set version="+version)
   try{
    await assert.rejects(a('rehydrate',[i,'tier-object',request,m.version]),/mip_cas_completed_job_stale/)
    await assert.rejects(a('complete',[i,'tier-object',j.job_id]),/mip_cas_completed_job_stale/)
   }finally{await sql('update mip_cas.active_policy set version=1')}
  }
  assert.equal((await store.metadata('tier-object')).hash,m.hash)
  assert.equal(await sql('select count(*) from mip_cas.events where hash='+q(m.hash)),String(m.version))
 })
 await t.test('finite job quota, expiry denial, cleanup does not delete evidence',async()=>{
  let m=await store.metadata('tier-object');await assert.rejects(store.transition('tier-object',m.version,m.tier),/mip_cas_transition_conflict/);await assert.rejects(store.transition('tier-object',m.version,'invalid'),/transition_request_invalid/);await store.transition('tier-object',m.version,'deep_archive');m=await store.metadata('tier-object')
  await assert.rejects(store.get('tier-object'),/canonical_unavailable/)
  const oldJob=await sql('select id from mip_cas.jobs where ref_id='+q(m.ref_id)+" and state='completed'")
  await assert.rejects(store.completeRehydration('tier-object',oldJob),/mip_cas_completed_job_stale/)
  const prior=JSON.parse(await sql('select json_build_object(\'request\',request_id,\'version\',expected_version) from mip_cas.jobs where id='+q(oldJob)))
  await assert.rejects(store.requestRehydration('tier-object',prior.request,prior.version),/mip_cas_completed_job_stale/)
  // Two existing completed jobs plus fourteen pending jobs reaches the per-principal ceiling.
  let last
  for(let n=0;n<14;n++)last=await store.requestRehydration('tier-object',randomUUID(),m.version)
  await assert.rejects(store.requestRehydration('tier-object',randomUUID(),m.version),/mip_cas_job_quota/)
  await sql("update mip_cas.jobs set expires_at=clock_timestamp()-interval '1 second'")
  await assert.rejects(store.completeRehydration('tier-object',last.job_id),/mip_cas_job_denied/)
  assert.equal(await store.cleanup(),16)
  assert.equal((await store.metadata('tier-object')).hash,m.hash)
  assert.equal(await sql('select count(*) from mip_cas.jobs'),'0')
 })
 await t.test('SQL admission location and codec are policy driven while unknown JS codecs fail closed',async()=>{
  const provenance={...fixtureProvenance,source_version:'future-codec-v1'}
  const raw=Buffer.from('Future codec synthetic representation')
  await seedCapture(i,raw,provenance)
  const result=await sql("begin;insert into mip_cas.policies select 3,max_raw,max_encoded,max_objects,max_total,max_refs,max_jobs,max_page,array['test-remote-provider'],array['future-lossless-v2'],tiers,qualification,'test-remote-provider','warm' from mip_cas.policies where version=1;update mip_cas.active_policy set version=3;set session authorization cas_codec;select mip_cas.admit("+q(raw)+",'future-lossless-v2',"+q(raw)+");reset session authorization;set session authorization cas_alice;select mip_cas.bind("+q(i)+",'future-codec',"+q(raw)+","+q(provenance)+");select mip_cas.read("+q(i)+",'future-codec','canonical');rollback")
  const retained=JSON.parse(result)
  assert.equal(retained.location,'test-remote-provider');assert.equal(retained.tier,'warm')
  assert.equal(retained.codec,'future-lossless-v2');assert.equal(retained.policy_version,3)
  assert.deepEqual(retained.allowed_locations,['test-remote-provider'])
  assert.equal(retained.hash,createHash('sha256').update(raw).digest('hex'))
  assert.throws(()=>decodeCanonical(retained),/codec_unsupported/)
  assert.equal(await sql('select version from mip_cas.active_policy'),'1')
  await assert.rejects(a('admit',[raw,'future-lossless-v2',raw]),/permission denied/)
 })
 await t.test('source capture authority binds exact bytes and acquired time, never caller labels',async()=>{
  const provenance={...fixtureProvenance,source_version:'trusted-capture-v1'}
  const raw=Buffer.from('trusted source capture'),wrong=Buffer.from('falsely attributed bytes')
  await seedCapture(i,raw,provenance)
  await assert.rejects(seedCapture(i,wrong,provenance),/duplicate key/)
  await assert.rejects(seedCapture(i,raw,{...provenance,acquired_at:'2026-09-13T00:00:00Z'}),/duplicate key/)
  const before=await sql('select count(*) from mip_cas.refs')
  await assert.rejects(a('put',[i,'forged-bytes',wrong,'identity-v1',wrong,provenance]),/mip_cas_source_rights_unverified/)
  await assert.rejects(a('put',[i,'forged-time',raw,'identity-v1',raw,{...provenance,acquired_at:'2026-09-13T00:00:00Z'}]),/mip_cas_source_rights_unverified/)
  assert.equal(await sql('select count(*) from mip_cas.refs'),before)
  await assert.rejects(sql("update mip_cas.source_identities set acquired_at=acquired_at-interval '1 day'"),/mip_cas_immutable/)
  await assert.rejects(sql("set session authorization cas_alice;insert into mip_cas.source_identities values("+q(randomUUID())+","+q(i)+",'forged',"+q(hashBytes(raw))+","+raw.length+","+q(provenance.acquired_at)+")"),/permission denied/)
  const receipt=await a('put',[i,'trusted-capture',raw,'identity-v1',raw,provenance])
  assert.equal(receipt.source_identity_qualified,false);assert.equal(receipt.temporal_provenance_qualified,false)
  await assert.rejects(a('bind',[i,'trusted-capture',raw,{...provenance,acquired_at:'2026-09-13T00:00:00Z'}]),/mip_cas_source_rights_unverified/)
  // A correction is a new trusted identity, not replacement of the prior source version.
  const corrected={...provenance,source_version:'corrected-capture-v1'}
  await seedCapture(i,wrong,corrected)
  await assert.rejects(a('put',[i,'stale-label',wrong,'identity-v1',wrong,provenance]),/mip_cas_source_rights_unverified/)
  await a('put',[i,'corrected-capture',wrong,'identity-v1',wrong,corrected])
  assert.equal((await a('read',[i,'trusted-capture','canonical'])).hash,hashBytes(raw))
 })
 await t.test('separate admission then policy change refuses new binds and existing admit/bind retries',async()=>{
  const provenance={...fixtureProvenance,source_version:'policy-race-v1'}
  const raw=Buffer.from('separately admitted policy race'),old=Buffer.from(JSON.stringify(value))
  await seedCapture(i,raw,provenance);await codecAuthority.admit(raw)
  const before=await sql('select count(*) from mip_cas.refs'),oldRef=await store.metadata('revision:1')
  for(const [version,field] of [[4,'codecs'],[5,'locations'],[6,'tiers']]){
   await sql("insert into mip_cas.policies select "+version+",max_raw,max_encoded,max_objects,max_total,max_refs,max_jobs,max_page,"+(field==='locations'?"array['policy-other-location']":"locations")+","+(field==='codecs'?"array['identity-v1']":"codecs")+","+(field==='tiers'?"array['warm']":"tiers")+",qualification,"+(field==='locations'?"'policy-other-location'":"initial_location")+","+(field==='tiers'?"'warm'":"initial_tier")+" from mip_cas.policies where version=1;update mip_cas.active_policy set version="+version)
   try{
    await assert.rejects(a('bind',[i,'policy-race-new',raw,provenance]),/mip_cas_bind_representation_unverified/)
    await assert.rejects(a('bind',[i,'revision:1',old,fixtureProvenance]),/mip_cas_bind_representation_unverified/)
    const e=encodeCanonical(raw,'gzip-v1',policy)
    await assert.rejects(callAs('cas_codec')('admit',[raw,e.codec,e.encoded]),field==='codecs'?/mip_cas_invalid/:/mip_cas_representation_unverified/)
    assert.equal(await sql('select count(*) from mip_cas.refs'),before)
   }finally{await sql('update mip_cas.active_policy set version=1')}
  }
  assert.equal((await store.metadata('revision:1')).ref_id,oldRef.ref_id)
  assert.equal(await sql("select count(*) from mip_cas.refs where logical_key='policy-race-new'"),'0')
 })
 await t.test('archived cross-scope dedup and existing bind retries require custodian',async()=>{
  for(const tier of ['cold','deep_archive']){
   const raw=Buffer.from('archive-bind-'+tier),key='archive-'+tier,provenance={...fixtureProvenance,source_version:'archive-'+tier+'-v1'}
   await seedCapture(i,raw,provenance);await seedCapture(other,raw,provenance);await codecAuthority.admit(raw)
   await a('bind',[i,key,raw,provenance]);await a('transition',[i,key,1,tier])
   const before=await sql('select count(*) from mip_cas.refs')
   await assert.rejects(b('bind',[other,key,raw,provenance]),/mip_cas_shared_tier_custodian_required/)
   await assert.rejects(a('bind',[i,key,raw,provenance]),/mip_cas_shared_tier_custodian_required/)
   assert.equal(await sql('select count(*) from mip_cas.refs'),before)
   const j=await a('rehydrate',[i,key,randomUUID(),2]);await a('complete',[i,key,j.job_id])
   await b('bind',[other,key,raw,provenance])
   await assert.rejects(a('transition',[i,key,3,tier]),/mip_cas_shared_tier_custodian_required/)
  }
 })
 await t.test('two-session bind versus demotion holds representation lock through reference commit',async()=>{
  // Return the promise inside an object so awaiting the barrier does not await transaction completion.
  async function start(name,statement){
   const pending=sql("begin;set application_name="+q(name)+";"+statement+";select pg_sleep(2);commit")
   for(let n=0;n<100;n++){
    if(await sql("select count(*) from pg_stat_activity where application_name="+q(name)+" and wait_event='PgSleep'")==='1')return {pending}
    await new Promise(resolve=>setTimeout(resolve,10))
   }
   await pending;throw Error('race_barrier_not_observed')
  }
  for(const first of ['bind','demote']){
   const raw=Buffer.from('race-'+first),key='race-'+first,provenance={...fixtureProvenance,source_version:'race-'+first+'-v1'}
   await seedCapture(i,raw,provenance);await seedCapture(other,raw,provenance);await codecAuthority.admit(raw);await a('bind',[i,key,raw,provenance])
   const bind="set session authorization cas_bob;select mip_cas.bind("+[other,key,raw,provenance].map(q).join(',')+")"
   const demote="set session authorization cas_alice;select mip_cas.transition("+[i,key,1,'cold'].map(q).join(',')+")"
   const barrier=await start('cas-race-'+first,first==='bind'?bind:demote)
   const loser=first==='bind'?a('transition',[i,key,1,'cold']):b('bind',[other,key,raw,provenance])
   const results=await Promise.allSettled([barrier.pending,loser])
   assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected')
   assert.match(String(results[1].reason),/mip_cas_shared_tier_custodian_required/)
   const state=JSON.parse(await sql("select json_build_object('tier',s.tier,'scopes',count(distinct r.investigation)) from mip_cas.representations s join mip_cas.refs r on r.hash=s.hash where s.hash="+q(hashBytes(raw))+" group by s.tier"))
   assert.deepEqual(state,first==='bind'?{tier:'hot',scopes:2}:{tier:'cold',scopes:1})
  }
 })
 await t.test('revoked old scope cannot strand principal quota; bounded cleanup is principal-global',async()=>{
  const provenance={...fixtureProvenance,source_version:'authorized-b-archive-v1'}
  await sql("insert into mip_cas.access values("+q(alice)+","+q(other)+",clock_timestamp()+interval '1 hour')")
  const raw=Buffer.from('authorized B archive'),key='authorized-b-archive'
  await seedCapture(other,raw,provenance);await codecAuthority.admit(raw);await a('bind',[other,key,raw,provenance]);await a('transition',[other,key,1,'cold'])
  const old=await store.metadata('tier-object')
  await sql("update mip_cas.jobs set expires_at=clock_timestamp()-interval '1 second' where user_id="+q(alice))
  // More than one cleanup batch, all in A. No caller gains evidence or metadata access to A.
  for(let n=0;n<20;n++)await sql("insert into mip_cas.jobs values("+[randomUUID(),old.ref_id,alice,randomUUID()].map(q).join(',')+",clock_timestamp()-interval '1 second',"+old.version+",'pending')")
  await sql('delete from mip_cas.access where user_id='+q(alice)+' and investigation='+q(i))
  try{
   await assert.rejects(a('cleanup',[i]),/mip_cas_denied/)
   const fresh=await a('rehydrate',[other,key,randomUUID(),2])
   assert.equal(fresh.state,'pending')
   const refs=await sql('select count(*) from mip_cas.refs'),events=await sql('select count(*) from mip_cas.events')
   const results=await Promise.all([a('cleanup',[other]),a('rehydrate',[other,key,randomUUID(),2])])
   assert.equal(results[0],16);assert.equal(results[1].state,'pending')
   assert.equal(await sql('select count(*) from mip_cas.refs'),refs);assert.equal(await sql('select count(*) from mip_cas.events'),events)
   assert.equal(await sql("select count(*) from mip_cas.jobs where user_id="+q(alice)+" and expires_at<=clock_timestamp()"),'6')
   assert.equal(await a('cleanup',[other]),6)
   const active=Number(await sql("select count(*) from mip_cas.jobs where user_id="+q(alice)+" and expires_at>clock_timestamp()"))
   for(let n=active;n<15;n++)await a('rehydrate',[other,key,randomUUID(),2])
   const race=await Promise.allSettled([a('rehydrate',[other,key,randomUUID(),2]),a('rehydrate',[other,key,randomUUID(),2])])
   assert.equal(race.filter(x=>x.status==='fulfilled').length,1)
   assert.match(String(race.find(x=>x.status==='rejected').reason),/mip_cas_job_quota/)
  }finally{
   await sql("insert into mip_cas.access values("+q(alice)+","+q(i)+",clock_timestamp()+interval '1 hour')")
   await sql("update mip_cas.jobs set expires_at=clock_timestamp()-interval '1 second' where user_id="+q(alice))
   while(await a('cleanup',[other])){}
  }
 })
 await t.test('cleanup hard safety ceiling remains bounded under oversized owner policy',async()=>{
  const ref=await store.metadata('tier-object')
  const result=await sql("begin;insert into mip_cas.policies select 12,max_raw,max_encoded,max_objects,max_total,max_refs,2147483647,max_page,locations,codecs,tiers,qualification,initial_location,initial_tier from mip_cas.policies where version=1;update mip_cas.active_policy set version=12;insert into mip_cas.jobs select gen_random_uuid(),"+q(ref.ref_id)+","+q(alice)+",gen_random_uuid(),clock_timestamp()-interval '1 second',"+ref.version+",'pending' from generate_series(1,1002);set session authorization cas_alice;select mip_cas.cleanup("+q(i)+");rollback")
  assert.equal(result,'1000')
  assert.equal(await sql('select version from mip_cas.active_policy'),'1')
  assert.equal(await sql('select count(*) from mip_cas.jobs'),'0')
 })
 await t.test('reference quota and immutable identity/history',async()=>{
  const existing=Number(await sql('select count(*) from mip_cas.refs where investigation='+q(i)))
  for(let n=0;n<127-existing;n++)await store.putOnce('quota-'+n,value)
  const finalSlot=await Promise.allSettled([store.putOnce('ref-last-a',value),store.putOnce('ref-last-b',value)])
  assert.equal(finalSlot.filter(x=>x.status==='fulfilled').length,1)
  assert.match(String(finalSlot.find(x=>x.status==='rejected').reason),/mip_cas_ref_quota/)
  await assert.rejects(store.putOnce('over-quota',value),/mip_cas_ref_quota/)
  await assert.rejects(sql('update mip_cas.refs set hash=hash'),/mip_cas_immutable/)
  await assert.rejects(sql('delete from mip_cas.objects'),/mip_cas_immutable/)
  await assert.rejects(sql('truncate mip_cas.events'),/mip_cas_immutable/)
 })
 await t.test('native catalog roles, ACLs, owners, forced RLS and fixed search path',async()=>{
  assert.equal(await sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_cas' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity or pg_get_userbyid(c.relowner)<>'mip_cas_owner')"),'0')
  assert.equal(await sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_cas' and (pg_get_userbyid(p.proowner)<>'mip_cas_owner' or not coalesce(p.proconfig @> array['search_path='||chr(34)||chr(34)],false))"),'0')
  assert.equal(await sql("select count(*) from pg_namespace n,cross lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='mip_cas' and a.grantee=0".replace(',cross lateral',' cross join lateral')),'0')
  assert.equal(await sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='mip_cas' and a.grantee=0"),'0')
  assert.equal(await sql("select has_function_privilege('cas_alice','mip_cas.admit(bytea,text,bytea)','EXECUTE')"),'f')
  assert.equal(await sql("select has_function_privilege('cas_codec','mip_cas.read(uuid,text,text)','EXECUTE')"),'f')
  for(const name of ['refs_hash_scope','events_hash_version','jobs_user_expiry'])assert.equal(await sql("select count(*) from pg_indexes where schemaname='mip_cas' and indexname="+q(name)),'1')
  // Access-path structural coverage uses catalog below; tiny fixtures do not establish production planner choices.
  assert.equal(await sql("select indexdef like '%(hash, investigation)%' from pg_indexes where schemaname='mip_cas' and indexname='refs_hash_scope'"),'t')
  assert.equal(await sql("select count(*) from pg_roles where rolname in('mip_cas_owner','mip_cas_gateway','mip_cas_codec_verifier') and (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)"),'0')
 })
 await t.test('unknown policy/location/codec/representation and stale cursors fail closed',async()=>{
  const meta=await store.metadata('revision:1')
  await assert.rejects(sql("begin;delete from mip_cas.active_policy;set session authorization cas_alice;select mip_cas.read("+q(i)+",'revision:1','metadata')"),/mip_cas_policy_unavailable/)
  for(const field of ['locations','codecs','tiers']){
   await assert.rejects(sql("begin;insert into mip_cas.policies select 2,max_raw,max_encoded,max_objects,max_total,max_refs,max_jobs,max_page,"+(field==='locations'?"array[]::text[]":"locations")+","+(field==='codecs'?"array[]::text[]":"codecs")+","+(field==='tiers'?"array[]::text[]":"tiers")+",qualification,initial_location,initial_tier from mip_cas.policies where version=1;update mip_cas.active_policy set version=2;set session authorization cas_alice;select mip_cas.read("+q(i)+",'revision:1','canonical')"),/mip_cas_representation_unverified|mip_cas_policy_unavailable|violates check constraint/)
  }
  await assert.rejects(sql("begin;alter table mip_cas.representations disable trigger immutable_representation;delete from mip_cas.representations where hash="+q(meta.hash)+";set session authorization cas_alice;select mip_cas.read("+q(i)+",'revision:1','canonical')"),/mip_cas_representation_unavailable/)
  await assert.rejects(a('bind',[i,'unknown-rights',Buffer.from(JSON.stringify(value)),{...provenance,rights_ref:'unknown'}]),/mip_cas_source_rights_unverified/)
  await assert.rejects(a('bind',[i,'unknown-version',Buffer.from(JSON.stringify(value)),{...provenance,source_version:'unknown'}]),/mip_cas_source_rights_unverified/)
  const unknown=createStore({call:async()=>({...meta,policy_version:999}),investigation:i,provenance,policy})
  await assert.rejects(unknown.get('revision:1'),/storage_policy_changed/)
  assert.throws(()=>decodeCanonical({state:'canonical_encoded'}),/codec_policy_unavailable/)
  const page=await store.locate('summary','Restored',{limit:1})
  for(const cursor of [{...page.next_cursor,extra:true},{...page.next_cursor,query_hash:'0'.repeat(64)},{...page.next_cursor,last_ref:randomUUID()},{...page.next_cursor,index_epoch:-1}])
   await assert.rejects(store.locate('summary','Restored',{limit:1,after:cursor}),/locator_cursor_invalid|mip_cas_cursor_stale_or_ambiguous/)
  await store.indexPut('revision:1',meta.hash,3,{summary:'Restored locator'})
  await assert.rejects(store.locate('summary','Restored',{limit:1,after:page.next_cursor}),/locator_cursor_invalid|mip_cas_cursor_stale_or_ambiguous/)
 })
 await t.test('transport mutation denies locator, codec receipts and read policy substitution',async()=>{
  const page=await store.locate('summary','Restored',{limit:1})
  for(const mutate of [
   r=>({...r,locator_only:false}),r=>({...r,factual_support_qualified:true}),r=>({...r,publication_allowed:true}),r=>({...r,source_identity_qualified:true}),r=>({...r,temporal_provenance_qualified:true}),
   r=>({...r,policy_version:999}),r=>({...r,extra:'payload'}),r=>({...r,candidates:[...r.candidates,...r.candidates]}),
   r=>({...r,candidates:r.candidates.map(c=>({...c,encoded:'payload'}))}),
   r=>({...r,candidates:r.candidates.map(c=>({...c,canonical_hash:'invalid'}))}),
   r=>({...r,next_cursor:{...r.next_cursor,policy_version:999}})
  ]){
   const bad=createStore({call:async()=>mutate(structuredClone(page)),investigation:i,provenance,policy})
   await assert.rejects(bad.locate('summary','Restored',{limit:1}),/locator_/)
  }
  const raw=Buffer.from('transport-codec'),e=encodeCanonical(raw,'gzip-v1',policy)
  const receipt={hash:e.hash,raw_size:raw.length,encoded_hash:e.encoded_hash,codec:e.codec,policy_version:1,location:'disposable_postgres',tier:'hot',codec_qualified:false}
  for(const mutate of [r=>({...r,codec_qualified:true}),r=>({...r,extra:true}),r=>({...r,policy_version:'1'}),r=>({...r,encoded_hash:'0'.repeat(64)}),r=>({...r,raw_size:NaN})]){
   const bad=createCodecVerifier({call:async()=>mutate({...receipt}),policy})
   await assert.rejects(bad.admit(raw),/codec_receipt/)
  }
  const native=await a('read',[i,'revision:1','canonical'])
  for(const mutate of [r=>({...r,policy_version:999}),r=>({...r,max_raw:NaN}),r=>({...r,max_encoded:0}),r=>({...r,max_page:'50'}),r=>({...r,publication_allowed:true}),r=>({...r,source_identity_qualified:true}),r=>({...r,temporal_provenance_qualified:true})]){
   const bad=createStore({call:async()=>mutate({...native}),investigation:i,provenance,policy})
   await assert.rejects(bad.get('revision:1'),/storage_policy_changed|read_contract_invalid/)
  }
  for(const invalid of [' '+native.encoded,native.encoded+'\n',native.encoded.replace(/.$/,'!')]){
   assert.throws(()=>decodeCanonical({...native,encoded:invalid}),/encoded_/)
  }
  for(const changed of [{...policy,policyVersion:0},{...policy,maxRaw:Infinity},{...policy,maxEncoded:1.5},{...policy,maxPage:Number.MAX_SAFE_INTEGER+1}])
   assert.throws(()=>createCodecVerifier({call:async()=>receipt,policy:changed}),/codec_policy_unavailable/)
 })
 await t.test('write receipts, generic allowed locations and logical keys are validated',async()=>{
  const native=await a('read',[i,'revision:1','canonical'])
  const receipt={ref_id:native.ref_id,hash:native.hash,committed:true,production_qualified:false,source_identity_qualified:false,temporal_provenance_qualified:false}
  for(const mutate of [r=>({...r,extra:true}),r=>({...r,ref_id:randomUUID()}),r=>({...r,committed:false}),r=>({...r,production_qualified:true}),r=>({...r,source_identity_qualified:true}),r=>({...r,temporal_provenance_qualified:true}),r=>({...r,hash:'0'.repeat(64)})]){
   const bad=createStore({call:async action=>action==='read'?native:mutate({...receipt}),investigation:i,provenance,policy})
   await assert.rejects(bad.putOnce('revision:1',value),/readback_mismatch/)
  }
  const mock=response=>createStore({call:async()=>response,investigation:i,provenance,policy})
  for(const r of [{job_id:'bad',state:'pending'},{job_id:randomUUID(),state:'approved'},{job_id:randomUUID(),state:'pending',extra:true}])
   await assert.rejects(mock(r).requestRehydration('key',randomUUID(),1),/rehydration_receipt_invalid/)
  await assert.rejects(mock({completed:true}).completeRehydration('key',randomUUID()),/completion_receipt_invalid/)
  await assert.rejects(mock(3).transition('key',1,'warm'),/transition_receipt_invalid/)
  await assert.rejects(mock({accepted:true}).indexPut('key',native.hash,0,{}),/index_receipt_invalid/)
  for(const r of [-1,1.5,NaN,'1'])await assert.rejects(mock(r).cleanup(),/cleanup_receipt_invalid/)
  for(const invalid of ['', 'x'.repeat(257),null]){
   let calls=0
   const local=createStore({call:async()=>{calls++;throw Error('unexpected_transport')},investigation:i,provenance,policy})
   for(const action of [
    ()=>local.metadata(invalid),()=>local.index(invalid),()=>local.get(invalid),()=>local.factualEvidence(invalid),
    ()=>local.putOnce(invalid,value),()=>local.requestRehydration(invalid,randomUUID(),1),
    ()=>local.completeRehydration(invalid,randomUUID()),()=>local.transition(invalid,1,'warm'),
    ()=>local.indexPut(invalid,native.hash,0,{})
   ])await assert.rejects(action(),/logical_key_invalid/)
   assert.equal(calls,0)
  }
  const remotePolicy={...policy,allowedLocations:['test-remote-provider']}
  const metadata={...(await store.metadata('revision:1')),location:'test-remote-provider',allowed_locations:remotePolicy.allowedLocations}
  const otherLocation=createStore({call:async()=>metadata,investigation:i,provenance,policy:remotePolicy})
  assert.equal((await otherLocation.metadata('revision:1')).location,'test-remote-provider')
  for(const changed of [{...policy,allowedLocations:[]},{...policy,allowedCodecs:['gzip-v1','gzip-v1']},{...policy,allowedTiers:[null]}])
   assert.throws(()=>createCodecVerifier({call:async()=>receipt,policy:changed}),/codec_policy_unavailable/)
 })
 await t.test('object-count and aggregate-byte quotas are enforced atomically',async()=>{
  await sql("insert into mip_cas.policies select 7,max_raw,max_encoded,(select count(*)+1 from mip_cas.objects),max_total,max_refs,max_jobs,max_page,locations,codecs,tiers,qualification,initial_location,initial_tier from mip_cas.policies where version=1;update mip_cas.active_policy set version=7")
  try{
   const c=callAs('cas_codec')
   const candidates=[Buffer.from('object-final-a'),Buffer.from('object-final-b')]
   const race=await Promise.allSettled(candidates.map(raw=>c('admit',[raw,'identity-v1',raw])))
   assert.equal(race.filter(x=>x.status==='fulfilled').length,1)
   assert.match(String(race.find(x=>x.status==='rejected').reason),/mip_cas_object_quota/)
  }finally{await sql('update mip_cas.active_policy set version=1')}
  const before=await sql('select count(*) from mip_cas.objects')
  await assert.rejects(sql("do $quota$declare n integer;b bytea;begin for n in 1..257 loop b:=convert_to('object-quota-'||n,'UTF8');perform mip_cas.admit(b,'identity-v1',b);end loop;end$quota$"),/mip_cas_object_quota/)
  assert.equal(await sql('select count(*) from mip_cas.objects'),before)
  await assert.rejects(sql("do $quota$declare n integer;b bytea;begin for n in 1..17 loop b:=convert_to(repeat(chr(64+n),1048576),'UTF8');perform mip_cas.admit(b,'identity-v1',b);end loop;end$quota$"),/mip_cas_object_quota/)
  assert.equal(await sql('select count(*) from mip_cas.objects'),before)
 })
 await t.test('revocation rejects retained metadata, evidence and rehydration',async()=>{
  await sql('delete from mip_cas.access where user_id='+q(alice))
  await assert.rejects(store.metadata('revision:1'),/mip_cas_denied/)
  await assert.rejects(store.get('revision:1'),/mip_cas_denied/)
  await assert.rejects(store.requestRehydration('tier-object',randomUUID(),3),/mip_cas_denied/)
 })
 console.log('MIP_CAS_SYNTHETIC_ONLY='+JSON.stringify({production_qualified:false,publication_allowed:false,deployment_qualified:false,rights_qualified:false,codec_qualified:false,physical_tiers_qualified:false}))
})
