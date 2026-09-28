import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {
  prepareArcMembership, persistOrApprovePreparedArc, INPUT_VERSION, RECOVERED_SCORER_BLOB,
} from '../supabase/qualification/arc-membership-prepared/prepare.mjs'
import {fixture,requests,fakeClient,id} from '../supabase/qualification/arc-membership-prepared/syntheticFixture.mjs'
import {
  scoreArcMembership, buildArcMembershipAuditSample, ARC_MEMBERSHIP_SCORER_RULE_VERSION,
} from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js'

async function run(data,options={},transport={}) {
  const mock=fakeClient(data,transport)
  const receipt=await prepareArcMembership({connection:{connectionString:'postgres://synthetic:synthetic@127.0.0.1/mip_arc_prepared_test'},requests:requests(data),
    sourceKind:'historical_public',...options},{ClientClass:mock.Client})
  return {receipt,log:mock.log}
}
test('recovered scorer and runner source identities are unchanged',async()=>{
  const base=new URL('../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/',import.meta.url)
  for(const [name,hash] of Object.entries({
    'lib.js':RECOVERED_SCORER_BLOB,
    'index.ts':'26423833f2010c0dbde95fdd921208f28529d9b3',
    'auth.js':'282d8da0fca76d05d626c2329896abe390a0ba0b',
  })) {
    const bytes=await readFile(new URL(name,base))
    assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),hash)
  }
})
test('private prepared result exactly preserves recovered score and audit arithmetic',async()=>{
  const data=fixture(), {receipt,log}=await run(data)
  const candidate=data.articles[0],members=data.articles.slice(1),entities=[301,302,303].map(n=>({id:id(n),confidence:0.9}))
  const expected={...scoreArcMembership(candidate,data.arcs[0],members,entities,entities,data.release[0]),
    candidate_id:data.candidates[0].id,candidate_updated_at:data.candidates[0].updated_at}
  assert.deepEqual(receipt.scores,[expected])
  const audit=buildArcMembershipAuditSample([expected],{lowConfidence:0.70,highSampleSize:30,
    seed:'arc-membership-audit:'+ARC_MEMBERSHIP_SCORER_RULE_VERSION})
  assert.deepEqual(receipt.audit,{population:audit.population,sample:audit.sample.map(row=>({
    candidate_id:row.candidate_id,audit_stratum:row.audit_stratum}))})
  assert.equal(receipt.contract,INPUT_VERSION)
  assert.equal(receipt.approval_allowed,false)
  assert.equal(receipt.publication_allowed,false)
  assert.equal(receipt.durable,false)
  assert.equal(receipt.native_lineage_qualified,false)
  assert.equal(log[0],'connect')
  assert.equal(log[1],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.equal(log.at(-2),'COMMIT');assert.equal(log.at(-1),'end')
  const firstRead=log.findIndex(line=>line.includes('arc-prepared:candidates'))
  assert.ok(log.findIndex(line=>line.includes('arc-prepared:snapshot'))<firstRead)
  assert.ok(!log.some(line=>/^(insert|update|delete|call|grant|create)\b/i.test(line)))
})
test('all previously omitted consumed fields alter the versioned hash and stale retry refuses',async()=>{
  const base=fixture(), original=(await run(base)).receipt
  const mutations=[
    data=>{data.articles[1].summary+=' changed'},
    data=>{data.articles[1].outlet='another publisher'},
    data=>{data.articles[0].outlet='candidate publisher changed'},
    data=>{data.arcs[0].started_at='2025-12-01'},
    data=>{data.articles[1].published_at='2026-01-03T12:00:00Z'},
    data=>{data.entities[0].confidence='0.8'},
    data=>{data.floor[0].value='0.75'},
    data=>{data.release[0].auto_approval_threshold='0.99'},
  ]
  for(const mutate of mutations){
    const changed=structuredClone(base);mutate(changed)
    assert.notEqual((await run(changed)).receipt.input_sha256,original.input_sha256)
    await assert.rejects(run(changed,{expectedInputHash:original.input_sha256}),/arc_prepared_stale_source/)
  }
  assert.equal((await run(base,{expectedInputHash:original.input_sha256})).receipt.input_sha256,original.input_sha256)
})
test('complete member/entity pages exceed legacy 1000-row response cap and are order independent',async()=>{
  const data=fixture()
  const template=data.articles[1]
  data.articles=[data.articles[0],...Array.from({length:1001},(_,i)=>({...template,id:id(1000+i)}))]
  data.entities=data.articles.flatMap(row=>[301,302].map(n=>({article_id:row.id,entity_id:id(n),confidence:'0.9'})))
  const first=await run(data,{limits:{page:97}})
  assert.equal(first.receipt.counts.members,1001)
  assert.equal(first.receipt.counts.entity_relations,2004)
  assert.ok(first.log.filter(sql=>sql.includes('arc-prepared:members')).length>10)
  assert.ok(first.log.filter(sql=>sql.includes('arc-prepared:entities')).length>20)
  const reversed=structuredClone(data);reversed.articles.reverse();reversed.entities.reverse()
  assert.equal((await run(reversed,{limits:{page:128}})).receipt.input_sha256,first.receipt.input_sha256)
  await assert.rejects(run(data,{limits:{members:1000}}),/row_count_overflow/)
  await assert.rejects(run(data,{limits:{entities:2003}}),/row_count_overflow/)
})
test('explicit field allowlist fetches no article body, URL, excerpt, generation evidence or payload',async()=>{
  const data=fixture(), sentinel='DO_NOT_COPY_PRIVATE_SENTINEL'
  data.articles.forEach(row=>{row.body_text=sentinel;row.url=sentinel})
  data.candidates[0].generation_evidence={secret:sentinel}
  data.articles[0].summary=sentinel
  const {receipt,log}=await run(data)
  assert.ok(!JSON.stringify(receipt).includes(sentinel))
  const statements=log.filter(sql=>sql.startsWith('/* arc-prepared:'))
  for(const sql of statements) assert.doesNotMatch(sql,/\b(body_text|url|excerpt|generation_evidence|payload)\b/)
  assert.ok(!('membership_fingerprint' in receipt))
  assert.ok(!JSON.stringify(receipt).includes('Acme'))
})
test('row and total-byte overflow fail closed, including oversized fields',async()=>{
  const data=fixture()
  await assert.rejects(run(data,{limits:{rowBytes:32}}),/row_overflow/)
  await assert.rejects(run(data,{limits:{totalBytes:100}}),/byte_overflow/)
  data.articles[0].summary='x'.repeat(65537)
  await assert.rejects(run(data),/row_overflow/)
})
test('missing, duplicate, foreign, stale and post-review candidates are refused',async()=>{
  const data=fixture(), original=requests(data)
  for(const mutate of [
    value=>{value.candidates=[]},
    value=>{value.candidates[0].state='approved'},
    value=>{value.candidates[0].updated_at='2026-01-15 12:00:00+00'},
    value=>{value.candidates[0].article_id=id(777)},
    value=>{value.candidates[0].arc_id=id(778)},
    value=>{value.arcs=[]},
    value=>{value.articles=value.articles.slice(1)},
  ]) {
    const changed=structuredClone(data);mutate(changed)
    await assert.rejects(run(changed,{requests:original}),/missing_or_foreign|stale_or_foreign_candidate/)
  }
  const duplicate=structuredClone(data);duplicate.entities.push({...duplicate.entities[0]})
  await assert.rejects(run(duplicate),/duplicate_or_order/)
  await assert.rejects(run(data,{requests:[...original,...original]}),/requests/)
  await assert.rejects(run(data,{},{
    override(name){if(name==='members')return {rows:[{row_bytes:100,data:{...data.articles[1],arc_id:id(888)}}]}}
  }),/foreign_member/)
  await assert.rejects(run(data,{},{
    override(name){if(name==='entities')return {rows:[{row_bytes:100,data:{...data.entities[0],article_id:id(888)}}]}}
  }),/foreign_entity/)
})
test('database errors rollback and close without returning a partial result or private driver message',async()=>{
  const data=fixture(), mock=fakeClient(data,{override(name){if(name==='members')throw Error('PRIVATE_DRIVER_BODY')}})
  await assert.rejects(prepareArcMembership({connection:{connectionString:'postgres://synthetic:synthetic@127.0.0.1/mip_arc_prepared_test'},requests:requests(data),sourceKind:'historical_public'},
    {ClientClass:mock.Client}),error=>error.message==='arc_prepared_read_failed')
  assert.equal(mock.log.at(-2),'ROLLBACK');assert.equal(mock.log.at(-1),'end')
  assert.ok(!mock.log.includes('COMMIT'))
  for(const options of [{failCommit:true},{failClose:true},{failCommit:true,failRollback:true}])
    await assert.rejects(run(data,{},options),/arc_prepared_(read|close|rollback)_failed/)
  await assert.rejects(run(data,{},{
    override(name){if(name==='snapshot')return {rows:[{isolation:'read committed',read_only:'off'}]}}
  }),/arc_prepared_snapshot/)
})
test('native mode, persistence and approval refuse before opening a connection',async()=>{
  const data=fixture(), mock=fakeClient(data)
  await assert.rejects(prepareArcMembership({connection:{connectionString:'postgres://synthetic:synthetic@127.0.0.1/mip_arc_prepared_test'},requests:requests(data),sourceKind:'native'},
    {ClientClass:mock.Client}),/native_source_admission_unqualified/)
  assert.deepEqual(mock.log,[])
  assert.throws(()=>persistOrApprovePreparedArc({candidate_id:id(1)}),/guarded_persistence_and_approval_unqualified/)
  data.release=[{fixture_passed:true,auto_approval_enabled:true,auto_approval_threshold:'0'}]
  const {receipt}=await run(data)
  assert.equal(receipt.scores[0].eligible_for_auto_approval,true)
  assert.equal(receipt.approval_allowed,false)
  assert.equal(receipt.scores_persisted,false)
})
test('missing configuration is explicit and malformed/duplicate configuration is refused',async()=>{
  const data=fixture(), before=(await run(data)).receipt
  data.floor=[]
  const missing=(await run(data)).receipt
  assert.notEqual(missing.input_sha256,before.input_sha256)
  data.floor=[{value:'0.70'},{value:'0.70'}]
  await assert.rejects(run(data),/configuration_rows/)
  data.floor=[{value:'NaN'}]
  await assert.rejects(run(data),/confidence/)
  await assert.rejects(run(fixture(),{audit:{seed:'private source text with spaces'}}),/audit/)
})
