import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID,createHash} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto'
import {createStore,decodeCanonical} from '../supabase/qualification/content-addressed-storage/store.mjs'
import {installCaptureCas,cleanupCaptureCas,createSessionCall,LOAD_ORDER,STORE_SQL} from '../supabase/qualification/content-addressed-storage/installCaptureCas.mjs'
import {bindExactCaptureBytes,assertCaptureHash,sha256Hex} from '../supabase/qualification/content-addressed-storage/bindExactCaptureBytes.mjs'

const fixture=JSON.parse(await readFile(new URL('../supabase/qualification/content-addressed-storage/fixtures/synthetic-canonical.json',import.meta.url),'utf8'))
const investigation='00000000-0000-4000-8000-000000000001'
const other='00000000-0000-4000-8000-000000000002'
const alice='00000000-0000-4000-8000-000000000003'
const bob='00000000-0000-4000-8000-000000000004'
const policy={policyVersion:1,maxRaw:1048576,maxEncoded:1048576,maxPage:50,allowedLocations:['disposable_postgres'],allowedCodecs:['identity-v1','gzip-v1'],allowedTiers:['hot','warm','cold','deep_archive']}
const pipelineSql=await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql',import.meta.url),'utf8')
const queueFixture=await readFile(new URL('./changeQueueFixture.sql',import.meta.url),'utf8')

async function database(){
  const db=await PGlite.create({extensions:{pgcrypto}})
  const exec=sql=>db.exec(sql)
  return {db,exec}
}
async function seedIdentity(db,scope,raw,provenance=fixture.provenance){
  const bytes=Buffer.from(raw)
  await db.query(
    'insert into mip_cas.source_identities values($1::uuid,$2::uuid,$3,$4,$5,$6::timestamptz)',
    [randomUUID(),scope,provenance.source_version,sha256Hex(bytes),bytes.length,provenance.acquired_at])
  await db.query(
    `insert into mip_cas.source_permissions values($1::uuid,$2,$3,$4,clock_timestamp()+interval '1 hour') on conflict do nothing`,
    [scope,provenance.source_version,provenance.rights_ref,provenance.privacy_ref])
}
async function provision(db){
  await db.exec('create role cas_alice login;create role cas_bob login;grant mip_cas_gateway to cas_alice,cas_bob;')
  await db.query('insert into mip_cas.principals values($1,$2::uuid),($3,$4::uuid)',['cas_alice',alice,'cas_bob',bob])
  await db.query(`insert into mip_cas.access values($1::uuid,$2::uuid,clock_timestamp()+interval '1 hour')`,[alice,investigation])
}
function storeFor(db,role='cas_alice',provenance=fixture.provenance,scope=investigation){
  return createStore({call:createSessionCall(db,role),investigation:scope,provenance,policy})
}
async function scalar(db,sql,params=[]){
  const row=(await db.query(sql,params)).rows[0]
  return row?Object.values(row)[0]:null
}

test('C4 capture/CAS source install: preflight, byte rehydrate, rights, citation, cleanup',async t=>{
  const {db,exec}=await database()
  t.after(()=>db.close())

  await t.test('load order is preflight, unmodified store SQL, then ledger',()=>{
    assert.deepEqual([...LOAD_ORDER],['00_preflight.sql','001_store.sql','05_operation_ledger.sql'])
    assert.equal(STORE_SQL,'001_store.sql')
  })

  await t.test('pre-existing package role refuses install without creating mip_cas',async()=>{
    await db.exec('create role mip_cas_owner nologin')
    await assert.rejects(installCaptureCas(exec),/mip_cas_role_already_present/)
    assert.equal(await scalar(db,"select count(*)::int from pg_namespace where nspname='mip_cas'"),0)
    await db.exec('drop role mip_cas_owner')
  })

  await installCaptureCas(exec)
  await provision(db)
  await seedIdentity(db,investigation,Buffer.from(JSON.stringify(fixture.value)))
  const store=storeFor(db)

  await t.test('second install refuses leftover schema',async()=>{
    await assert.rejects(installCaptureCas(exec),/mip_cas_already_present/)
  })

  await t.test('putOnce/get retains exact Unicode fixture bytes',async()=>{
    assert.deepEqual(await store.putOnce('capture:1',fixture.value),{committed:true})
    assert.deepEqual(await store.get('capture:1'),fixture.value)
    const raw=await store.factualEvidence('capture:1')
    assert.equal(raw.toString('utf8'),JSON.stringify(fixture.value))
  })

  await t.test('cold canonical read requires rehydrate; completion returns exact bytes',async()=>{
    const meta=await store.metadata('capture:1')
    assert.equal(meta.tier,'hot')
    assert.equal(await store.transition('capture:1',meta.version,'cold'),meta.version+1)
    const cold=await createSessionCall(db,'cas_alice')('read',[investigation,'capture:1','canonical'])
    assert.equal(cold.state,'rehydration_required')
    await assert.rejects(store.get('capture:1'),/canonical_unavailable/)
    const job=await store.requestRehydration('capture:1',randomUUID(),meta.version+1)
    assert.equal(job.state,'pending')
    assert.equal(await store.completeRehydration('capture:1',job.job_id),null)
    assert.deepEqual(await store.get('capture:1'),fixture.value)
  })

  await t.test('foreign principal and expired rights cannot retrieve bytes',async()=>{
    const denied=storeFor(db,'cas_bob')
    await assert.rejects(denied.get('capture:1'),/mip_cas_denied/)
    await db.exec("update mip_cas.source_permissions set expires_at=clock_timestamp()-interval '1 hour' where investigation='"+investigation+"' and source_version='synthetic-v1'")
    await assert.rejects(store.get('capture:1'),/mip_cas_source_rights_unverified/)
    await db.exec("update mip_cas.source_permissions set expires_at=clock_timestamp()+interval '1 hour' where investigation='"+investigation+"' and source_version='synthetic-v1'")
    assert.deepEqual(await store.get('capture:1'),fixture.value)
  })

  await t.test('exact citation joins retained version and span hash; latest/similar cannot substitute',async()=>{
    const oldProv={...fixture.provenance,source_version:'citation-old-v1'}
    const newProv={...fixture.provenance,source_version:'citation-new-v1'}
    await seedIdentity(db,investigation,Buffer.from(JSON.stringify(fixture.citation)),oldProv)
    await seedIdentity(db,investigation,Buffer.from(JSON.stringify(fixture.citationChanged)),newProv)
    const oldStore=storeFor(db,'cas_alice',oldProv)
    const newStore=storeFor(db,'cas_alice',newProv)
    await oldStore.putOnce('source-old',fixture.citation)
    await newStore.putOnce('source-latest',fixture.citationChanged)
    const meta=await oldStore.metadata('source-old')
    const raw=await oldStore.factualEvidence('source-old')
    const start=12,end=20,span=raw.subarray(start,end)
    const citation={logical_key:'source-old',ref_id:meta.ref_id,canonical_hash:meta.hash,source_version:'citation-old-v1',start_byte:start,end_byte:end,span_hash:createHash('sha256').update(span).digest('hex')}
    const result=await oldStore.resolveCitation(citation)
    assert.deepEqual(result.bytes,span)
    assert.equal(result.claim_truth_qualified,false)
    await assert.rejects(oldStore.resolveCitation({...citation,logical_key:'source-latest'}),/citation_identity_mismatch/)
    await assert.rejects(oldStore.resolveCitation({...citation,source_version:'citation-new-v1'}),/citation_identity_mismatch/)
    await assert.rejects(oldStore.resolveCitation({...citation,span_hash:'0'.repeat(64)}),/citation_span_hash/)
    await oldStore.transition('source-old',1,'cold')
    await assert.rejects(oldStore.resolveCitation(citation),/canonical_unavailable/)
    const cold=await oldStore.metadata('source-old')
    const job=await oldStore.requestRehydration('source-old',randomUUID(),cold.version)
    await oldStore.completeRehydration('source-old',job.job_id)
    assert.deepEqual((await oldStore.resolveCitation(citation)).bytes,span)
  })

  await t.test('poisoned locator metadata cannot replace factual bytes',async()=>{
    const meta=await store.metadata('capture:1')
    await store.indexPut('capture:1',meta.hash,0,{summary:'POISONED allegation'})
    const index=await store.index('capture:1')
    assert.equal(index.index_is_evidence,false)
    assert.equal(index.encoded,undefined)
    assert.deepEqual(JSON.parse((await store.factualEvidence('capture:1')).toString()),fixture.value)
  })

  await t.test('pipeline capture content_hash binds exact jsonb::text bytes',async()=>{
    await db.exec(queueFixture)
    await db.exec(pipelineSql)
    const rpc=async(action,input={})=>(await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result',[action,JSON.stringify(input)])).rows[0].result
    const jobId=await rpc('enqueue',{run_id:'c4-cas',article:fixture.pipelineArticle})
    const claimed=await rpc('claim')
    assert.equal(claimed.id,jobId)
    const finished=await rpc('finish',{job_id:claimed.id,lease_token:claimed.lease_token})
    const cap=(await db.query("select id,content_hash,convert_to(payload::text,'UTF8') bytes from evidence_pipeline.article_captures where id=$1",[finished.capture_id])).rows[0]
    const payloadBytes=Buffer.from(cap.bytes)
    assertCaptureHash({payloadBytes,contentHash:cap.content_hash})
    const captureProv={...fixture.provenance,source_version:'pipeline-capture-v1'}
    await seedIdentity(db,investigation,payloadBytes,captureProv)
    const receipt=await bindExactCaptureBytes({
      call:createSessionCall(db,'cas_alice'),
      investigation,
      logicalKey:'pipeline:'+cap.id,
      payloadBytes,
      contentHash:cap.content_hash,
      provenance:captureProv,
    })
    assert.equal(receipt.committed,true)
    assert.equal(receipt.hash,cap.content_hash)
    const record=await createSessionCall(db,'cas_alice')('read',[investigation,'pipeline:'+cap.id,'canonical'])
    assert.deepEqual(decodeCanonical(record),payloadBytes)
    await assert.rejects(bindExactCaptureBytes({
      call:createSessionCall(db,'cas_alice'),
      investigation,
      logicalKey:'pipeline:mismatch',
      payloadBytes,
      contentHash:'0'.repeat(64),
      provenance:captureProv,
    }),/capture_hash_mismatch/)
    const articles=await scalar(db,"select count(*)::int from public.articles")
    assert.equal(articles,1)
    assert.equal(await scalar(db,"select reader_state from public.articles"),'pending_review')
  })

  await t.test('unexpected mip_cas table blocks cleanup and remains',async()=>{
    await db.exec('create table mip_cas.unexpected(id int)')
    await assert.rejects(cleanupCaptureCas(exec),/mip_cas_unexpected_object/)
    assert.equal(await scalar(db,"select to_regclass('mip_cas.unexpected') is not null"),true)
    assert.equal(await scalar(db,"select to_regclass('mip_cas.objects') is not null"),true)
    await db.exec('drop table mip_cas.unexpected')
  })

  await t.test('cleanup removes package schema/roles; fixture login and public articles remain',async()=>{
    await cleanupCaptureCas(exec)
    assert.equal(await scalar(db,"select count(*)::int from pg_namespace where nspname in ('mip_cas','mip_cas_source_install')"),0)
    assert.equal(await scalar(db,"select count(*)::int from pg_roles where rolname like 'mip_cas_%'"),0)
    assert.equal(await scalar(db,"select count(*)::int from pg_roles where rolname in ('cas_alice','cas_bob')"),2)
    assert.equal(await scalar(db,"select count(*)::int from public.articles"),1)
  })

  await t.test('cleanup is replayable after a fresh install',async()=>{
    await installCaptureCas(exec)
    await cleanupCaptureCas(exec)
    assert.equal(await scalar(db,"select count(*)::int from pg_namespace where nspname='mip_cas'"),0)
  })
})
