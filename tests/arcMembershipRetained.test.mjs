import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {prepareArcMembership} from '../supabase/qualification/arc-membership-prepared/prepare.mjs'
import {admitHistoricalArc,readHistoricalArc,persistOrApproveRetainedArc} from '../supabase/qualification/arc-membership-retained/retained.mjs'
import {fixture,requests,id,fakeClient} from '../supabase/qualification/arc-membership-prepared/syntheticFixture.mjs'
const connection={connectionString:'postgres://synthetic:synthetic@localhost/mip_arc_retained_test'}
const scope=id(901),generation=id(902)
async function harness() {
 const data=fixture(),store=new Map();let allowed=true
 const plain=fakeClient(data)
 const baseline=await prepareArcMembership({connection,sourceKind:'historical_public',requests:requests(data)},{ClientClass:plain.Client})
 const fake=fakeClient(data,{override:(_name,sql,args)=>{
  if(!sql.includes('arc-retained:'))return
  if(!allowed)throw Error('PRIVATE_ERROR_SENTINEL')
  if(sql.includes(':authority'))return {rows:[]}
  const key=args[0]+'|'+args[1],old=store.get(key)
  if(sql.includes(':admit')){
   if(old&&old.input_sha256!==args[2])throw Error('arc_retained_retry_conflict')
   store.set(key,{canonical_input:args[3],input_sha256:args[2]});return {rows:[]}
  }
  if(old&&old.input_sha256!==args[2])throw Error('arc_retained_retry_conflict')
  return {rows:old?[old]:[]}
 }})
 const input={connection,scope,generation,sourceKind:'historical_public',expectedInputHash:baseline.input_sha256,requests:requests(data)}
 return {data,store,baseline,input,transport:{ClientClass:fake.Client},log:fake.log,revoke:()=>{allowed=false}}
}
test('complete v1 equivalence, canonical single input, original replay after current mutation',async()=>{
 const h=await harness()
 const first=await admitHistoricalArc(h.input,h.transport)
 assert.equal(first.input_sha256,h.baseline.input_sha256)
 assert.deepEqual(first.scores,h.baseline.scores);assert.deepEqual(first.audit,h.baseline.audit)
 const stored=[...h.store.values()][0]
 assert.deepEqual(Object.keys(stored).sort(),['canonical_input','input_sha256'])
 assert.equal(createHash('sha256').update(stored.canonical_input).digest('hex'),first.input_sha256)
 h.data.articles[0].title='CHANGED_LATEST_SENTINEL';h.data.entities=[]
 assert.deepEqual(await readHistoricalArc(h.input,h.transport),first)
 assert.deepEqual(await admitHistoricalArc(h.input,h.transport),first)
 assert.equal(h.store.size,1)
 assert.equal(first.approval_allowed,false);assert.equal(first.publication_allowed,false);assert.equal(first.scores_persisted,false)
 assert.ok(!JSON.stringify(first).includes('SENTINEL'))
 assert.ok(h.log.includes('BEGIN ISOLATION LEVEL REPEATABLE READ'))
 assert.ok(h.log.includes('COMMIT'));assert.equal(h.log.at(-1),'end')
})
test('missing, revoked, conflicting identity and revision all refuse',async()=>{
 const h=await harness()
 await assert.rejects(readHistoricalArc(h.input,h.transport),/missing/)
 await admitHistoricalArc(h.input,h.transport)
 await assert.rejects(admitHistoricalArc({...h.input,expectedInputHash:'f'.repeat(64)},h.transport),/retry_conflict/)
 await assert.rejects(admitHistoricalArc({...h.input,requests:h.input.requests.map(r=>({...r,candidate_updated_at:'2026-01-14 12:00:00.000001+00'}))},h.transport),/retry_conflict/)
 h.revoke()
 await assert.rejects(readHistoricalArc(h.input,h.transport),e=>e.message==='arc_retained_operation_failed'&&e.cause===undefined&&e.detail===undefined)
})
test('native refused before connection, no writer capability',async()=>{
 let connected=false
 class Client{async connect(){connected=true}}
 await assert.rejects(admitHistoricalArc({sourceKind:'native'},{ClientClass:Client}),/native_unqualified/)
 await assert.rejects(readHistoricalArc({sourceKind:'native'},{ClientClass:Client}),/native_unqualified/)
 assert.equal(connected,false)
 assert.throws(persistOrApproveRetainedArc,/guarded_writer_unqualified/)
})
test('omitted consumed fields and drift refuse exact admission hash',async()=>{
 for(const mutate of [
  d=>{d.arcs[0].summary='different'},
  d=>{d.articles[0].outlet='different'},
  d=>{d.articles[0].published_at='2026-01-16T01:02:03Z'},
  d=>{d.entities[0].confidence='0.1'},
  d=>{d.release[0].auto_approval_threshold='0.95'},
  d=>{d.floor[0].value='0.8'},
 ]) {
  const h=await harness();mutate(h.data)
  await assert.rejects(admitHistoricalArc(h.input,h.transport),/stale_source/)
  assert.equal(h.store.size,0);assert.ok(h.log.includes('ROLLBACK'))
 }
})
test('page completeness, fail-closed bounds, and no metadata source copy',async()=>{
 const h=await harness()
 h.data.articles.push({...h.data.articles[1],id:id(150)})
 h.data.entities.push({article_id:id(150),entity_id:id(301),confidence:'0.9'})
 const p=fakeClient(h.data)
 const baseline=await prepareArcMembership({...h.input,expectedInputHash:null,limits:{page:1}},{ClientClass:p.Client})
 h.input.expectedInputHash=baseline.input_sha256
 const result=await admitHistoricalArc({...h.input,limits:{page:1}},h.transport)
 assert.deepEqual(result.scores,baseline.scores)
 assert.equal(result.counts.members,baseline.counts.members)
 await assert.rejects(admitHistoricalArc({...h.input,generation:id(903),limits:{members:1}},h.transport),/overflow/)
 assert.ok(!JSON.stringify(result).includes(h.data.articles[0].title))
})
test('replay rejects nested extra keys and malformed canonical or context even when rehashed',async()=>{
 for(const mutate of [
  e=>{e.articles[0].body_text='FORBIDDEN_SENTINEL'},
  e=>{e.members.push({...e.members[0]})},
  e=>{e.entities[0].article_id=id(999)},
  e=>{e.release.extra='FORBIDDEN_SENTINEL'},
 ]) {
  const h=await harness();await admitHistoricalArc(h.input,h.transport)
  const stored=[...h.store.values()][0],e=JSON.parse(stored.canonical_input);mutate(e)
  const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x
  stored.canonical_input=JSON.stringify(canon(e));stored.input_sha256=createHash('sha256').update(stored.canonical_input).digest('hex')
  await assert.rejects(readHistoricalArc({...h.input,expectedInputHash:stored.input_sha256},h.transport),/arc_(prepared|retained)_/)
 }
})
