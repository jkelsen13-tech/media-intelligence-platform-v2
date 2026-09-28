import test from 'node:test'
import assert from 'node:assert/strict'
import { fingerprintPayload } from '../scripts/mipLegacyGraphStaging.mjs'
import { PROJECTS, VERSION, LIMITS, CATEGORIES, FIELD_CONTRACTS,
  planHistoricalArticles, assertHistoricalRetry } from '../scripts/mipHistoricalArticleTransferPlan.mjs'

const H = n => n.toString(16).padStart(64,'0')
const U = n => '00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0')
function fixture() {
  return { version:VERSION,destination_project:PROJECTS.qik,
    snapshots:[PROJECTS.yhb,PROJECTS.nie].map((project,i)=>({
      project,snapshot_sha256:H(i+1),inventory_sha256:H(i+3),
      root_article_ids:[U(1)],inventoried_categories:[...CATEGORIES],
    })),
    records:[PROJECTS.yhb,PROJECTS.nie].map((project,i)=>({
      identity:{project,table:'articles',source_id:fingerprintPayload({id:U(1)}),version_sha256:H(10+i)},
      snapshot_sha256:H(i+1),payload_sha256:H(20+i),payload_bytes:12,
      root_article_ids:[U(1)],dependencies:[],
    })), objects:[] }
}
const throwsCode = (fn,code) => assert.throws(fn, e=>e.code===code)

test('two-source plan is deterministic, bounded and explicitly non-executing',()=>{
  const input=fixture(), plan=planHistoricalArticles(input)
  assert.equal(plan.executable,false)
  assert.equal(plan.pages.length,2)
  assert.equal(plan.bytes,24)
  assert.deepEqual(plan.gaps,[])
  assert.equal(plan.manifest.records.length,2) // same native UUID is never merged across projects
  const reversed=structuredClone(input)
  reversed.records.reverse(); reversed.snapshots.reverse()
  reversed.snapshots.forEach(s=>s.inventoried_categories.reverse())
  assert.equal(plan.manifest_sha256,planHistoricalArticles(reversed).manifest_sha256)
  assert.deepEqual(assertHistoricalRetry(plan,reversed),plan)
  assert.deepEqual(input,fixture())
  assert.match(plan.custody_contract.compatibility,/qualified executor extension/)
})
test('retry refuses changed snapshot, inventory, membership, or payload hash',()=>{
  const original=fixture(), prior=planHistoricalArticles(original)
  for (const mutate of [
    x=>{x.snapshots[0].snapshot_sha256=H(90);x.records[0].snapshot_sha256=H(90)},
    x=>{x.snapshots[0].inventory_sha256=H(90)},
    x=>{x.snapshots[0].root_article_ids.push(U(2))},
    x=>{x.records[0].payload_sha256=H(90)},
    x=>{x.records.pop()},
  ]) {
    const changed=structuredClone(original);mutate(changed)
    throwsCode(()=>assertHistoricalRetry(prior,changed),'frozen_manifest_changed')
  }
  const corrupt=structuredClone(prior);corrupt.manifest.records.pop()
  throwsCode(()=>assertHistoricalRetry(corrupt,original),'frozen_manifest_changed')
})
test('strict metadata shapes reject bodies, URLs and unknown source families',()=>{
  for (const mutate of [
    x=>{x.records[0].body_text='SYNTHETIC_NOT_MATERIAL'},
    x=>{x.objects.push({url:'https://example.invalid'})},
    x=>{x.snapshots[0].secret='SYNTHETIC'},
  ]) {
    const x=fixture();mutate(x);throwsCode(()=>planHistoricalArticles(x),'metadata_shape')
  }
  const x=fixture();x.records[0].identity.table='auth.users'
  throwsCode(()=>planHistoricalArticles(x),'unsupported_source_family')
  const y=fixture();y.records[0].identity.source_id={body:'SYNTHETIC'}
  throwsCode(()=>planHistoricalArticles(y),'hash_required')
})
test('snapshot and root mismatches fail before planning',()=>{
  const x=fixture();x.records[0].snapshot_sha256=H(99)
  throwsCode(()=>planHistoricalArticles(x),'snapshot_mismatch')
  const y=fixture();y.records[0].root_article_ids=[U(2)]
  throwsCode(()=>planHistoricalArticles(y),'outside_article_roots')
  const z=fixture();z.snapshots[1]=structuredClone(z.snapshots[0])
  throwsCode(()=>planHistoricalArticles(z),'two_source_snapshots_required')
})
test('missing dependency, root identity, category and object bytes are explicit gaps',()=>{
  const x=fixture()
  x.snapshots[0].inventoried_categories=[]
  x.records[0].identity.source_id=H(77)
  x.records[0].dependencies=[{project:PROJECTS.nie,table:'events',source_id:H(88),version_sha256:H(89)}]
  x.objects=[{project:PROJECTS.yhb,snapshot_sha256:H(1),object_identity_sha256:H(90),
    content_sha256:H(91),bytes:32,article_ids:[U(1)]}]
  const plan=planHistoricalArticles(x)
  for(const code of ['category_inventory_missing','root_record_missing','dependency_missing','object_bytes_not_in_custody'])
    assert.ok(plan.gaps.some(g=>g.code===code))
  assert.equal(plan.bytes,56)
  assert.equal(plan.executable,false)
})
test('pages honor existing 100-row limit and stable full-manifest run identity',()=>{
  const x=fixture(), template=x.records[0]
  x.records=Array.from({length:101},(_,i)=>({...structuredClone(template),
    identity:{...template.identity,source_id:H(i+100),version_sha256:H(i+200)}}))
  const p=planHistoricalArticles(x)
  assert.deepEqual(p.pages.map(page=>page.rows.length),[100,1])
  assert.ok(p.pages.every(page=>page.run_id.includes(p.manifest_sha256)))
  assert.ok(p.pages.every(page=>page.sha256===fingerprintPayload(page.rows)))
})
test('limits, duplicate identities and missing versions fail closed',()=>{
  const x=fixture();x.records[0].payload_bytes=LIMITS.bytes
  throwsCode(()=>planHistoricalArticles(x),'byte_limit')
  x.records[0].payload_bytes=LIMITS.bytes-12
  assert.equal(planHistoricalArticles(x).bytes,LIMITS.bytes)
  x.records[0].payload_bytes=-1
  throwsCode(()=>planHistoricalArticles(x),'byte_count')
  const y=fixture();y.records.push(structuredClone(y.records[0]))
  throwsCode(()=>planHistoricalArticles(y),'duplicate_identity')
  const z=fixture();z.records=Array(LIMITS.records+1).fill(z.records[0])
  throwsCode(()=>planHistoricalArticles(z),'record_limit')
  const v=fixture();delete v.records[0].identity.version_sha256
  throwsCode(()=>planHistoricalArticles(v),'metadata_shape')
})
test('historical partial rows and cell journals retain distinct explicit field contracts',()=>{
  const c=FIELD_CONTRACTS[PROJECTS.nie]
  assert.equal(c.articles.length,28)
  assert.equal(FIELD_CONTRACTS[PROJECTS.yhb].articles.length,30)
  assert.equal(c.articles_decode_backup_20260726_r2.length,21)
  assert.equal(c.articles_pre_d5_backup_20260730.length,22)
  assert.deepEqual(c.articles_decode_backup_20260726_r3,['id','column_name','old_value'])
  assert.deepEqual(c.arc_backup_20260726_articles,['id','arc_id','arc_assign_attempted_at'])
  const x=fixture(), base=x.records[1]
  x.records.push({...structuredClone(base),identity:{...base.identity,
    table:'articles_decode_backup_20260726_r3',version_sha256:H(71)}})
  x.records.push({...structuredClone(base),identity:{...base.identity,
    table:'articles_decode_backup_20260726_r3',version_sha256:H(72)}})
  const p=planHistoricalArticles(x)
  assert.equal(p.pages.find(page=>page.table==='articles_decode_backup_20260726_r3').rows.length,2)
})
