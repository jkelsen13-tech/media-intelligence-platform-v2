import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { canonicalRecord, assertCapacity, createQikHistoricalExecutor } from '../supabase/qualification/historical-qik-executor/executor.mjs'
import { FIELD_CONTRACTS, PROJECTS, CATEGORIES, VERSION } from '../scripts/mipHistoricalArticleTransferPlan.mjs'
import { stableStringify, fingerprintPayload, parseJsonLossless } from '../scripts/mipLegacyGraphStaging.mjs'
const sha=text=>createHash('sha256').update(text).digest('hex')
const operation='11111111-1111-4111-8111-111111111111'
const limits={records:10000,objects:10000,bytes:134217728}
function row(project,index=1) {
  const id='00000000-0000-4000-8000-'+String(index).padStart(12,'0')
  const payload=Object.fromEntries(FIELD_CONTRACTS[project].articles.map(k=>[k,null]))
  Object.assign(payload,{id,title:'Unicode: café 日本 😀',claims:parseJsonLossless('{"x":9007199254740993.123456789,"y":null}')})
  return {ordinal:String(index),project,table_name:'articles',native_identity_json:JSON.stringify({id}),
    native_version_json:'{"xmin":"124","ctid":"(1,2)","relation_oid":"15000"}',
    roots_json:JSON.stringify([id]),dependencies_json:'[]',body:Buffer.from(stableStringify(payload))}
}
function fixture() {
  const rows=[row(PROJECTS.nie,1),row(PROJECTS.yhb,2)],snapshots=[],records=[]
  for(const r of rows) {
    const snapshot_sha256=sha(r.project),value=canonicalRecord(r,snapshot_sha256)
    r.body=Buffer.from(value.payload_json);r.record_meta=value.meta;r.canonical=true
    records.push(value.meta);snapshots.push({project:r.project,snapshot_sha256,
      inventory_sha256:sha('inventory '+r.project),root_article_ids:JSON.parse(r.roots_json),
      inventoried_categories:[...CATEGORIES]})
  }
  const input={version:VERSION,destination_project:PROJECTS.qik,snapshots,records,objects:[]}
  const route={project:PROJECTS.qik,qualified:true,route_sha256:sha('route'),authorization_sha256:sha('authorization'),
    max_unit_bytes:134217728,max_manifest_bytes:10000000,qualification:{material_host:'qik_only',
      engine_sha:'b5b80ee37c6cd068d17f59b506bab6df70839ea6',acl_verified:true,cost_ceiling_verified:true,
      full_engine_capacity_verified:true,runtime:'qik_edge',measured_cpu_ms:10,measured_peak_bytes:100000,
      measured_wall_ms:100,measured_records:10000,measured_objects:10000,measured_manifest_bytes:10000000,
      measured_max_unit_bytes:134217728}}
  const plan=assertCapacity(route,input,limits).plan
  const exported={state:'sealed',manifest_text:stableStringify(plan.manifest),manifest_sha256:plan.manifest_sha256,
    route_sha256:route.route_sha256,authorization_sha256:route.authorization_sha256,
    manifest_bytes:Buffer.byteLength(stableStringify(plan.manifest))}
  return {rows,route,input:plan.manifest,exported}
}
// Test database models byte/metadata persistence and failed responses only.
// It makes NO claim about PostgreSQL privileges, transaction isolation or capacity.
function syntheticDb(f=fixture()) {
  const units=new Map();let checkpoint=null,loseCommit=false,changeExport=false,guards=0,readbacks=0
  return {f,units,stats:()=>({guards,readbacks}),loseNextCommit:()=>{loseCommit=true},
    changeOriginal:()=>{changeExport=true},query:async({text,values=[]})=>{
      const [op,arg]=values
      let rows=[]
      if(text==='select mip_history.guard()') {guards++;rows=[{}]}
      else if(text==='select * from mip_history.route') rows=[f.route]
      else if(text.startsWith('select state,manifest_sha256')) rows=changeExport?[]:[f.exported]
      else if(text.startsWith('select ordinal,record_meta')) rows=f.rows.filter(r=>same(r.record_meta.identity,JSON.parse(values[2])))
      else if(text.startsWith('select p.ordinal,octet_length(p.body)')) {readbacks++;rows=arg.map(n=>f.rows.find(r=>r.ordinal===String(n)))}
      else if(text.startsWith('select manifest_sha256,unit_sha256')) rows=units.has(arg)?[units.get(arg)]:[]
      else if(text.startsWith('select mip_history.commit_unit')) {
        const [,manifest_sha256,unit_id,unit_sha256,ordinals,receipt]=values
        const value={manifest_sha256,unit_sha256,ordinals,receipt:JSON.parse(receipt)}
        if(units.has(unit_id)&&!same(units.get(unit_id),value)) throw new Error('private raw material must never escape')
        units.set(unit_id,value)
        if(loseCommit) {loseCommit=false;throw new Error('simulated lost commit acknowledgement with private payload')}
        rows=[{}]
      } else if(text.startsWith('select value from mip_history.checkpoint')) rows=checkpoint?[{value:checkpoint}]:[]
      else if(text.startsWith('select mip_history.cas_checkpoint')) {
        const match=(checkpoint?.sha256??null)===arg
        if(match)checkpoint=JSON.parse(values[2])
        rows=[{stored:match}]
      } else if(text.startsWith('select receipt from mip_history.unit')) rows=units.has(arg)?[{receipt:units.get(arg).receipt}]:[]
      else throw new Error('unexpected query')
      return {rows}
    }}
}
const same=(a,b)=>stableStringify(a)===stableStringify(b)
test('canonicalization retains exact decimals, Unicode, null and native identity',()=>{
  const r=row(PROJECTS.yhb),result=canonicalRecord(r,sha('snapshot'))
  assert.ok(result.payload_json.includes('9007199254740993.123456789'))
  assert.ok(result.payload_json.includes('café 日本 😀'))
  assert.ok(result.payload_json.includes('"y":null'))
  assert.equal(result.meta.identity.source_id,fingerprintPayload(JSON.parse(r.native_identity_json)))
  assert.equal(result.meta.payload_sha256,sha(result.payload_json))
})
test('canonicalization uses pinned serializer, not PostgreSQL JSON spacing/order',()=>{
  const r=row(PROJECTS.nie);r.body=Buffer.from(' '+r.body.toString().replaceAll('":','" : ')+' ')
  const value=canonicalRecord(r,sha('snapshot'))
  assert.equal(stableStringify(parseJsonLossless(r.body.toString())),value.payload_json)
})
test('field drift and fabricated article identity are refused',()=>{
  const r=row(PROJECTS.nie);r.native_identity_json='{"id":"wrong"}'
  assert.throws(()=>canonicalRecord(r,sha('snapshot')),e=>e.code==='identity_contract')
  r.table_name='nodes';assert.throws(()=>canonicalRecord(r,sha('snapshot')),e=>e.code==='field_contract')
})
test('unqualified route, absent metrics and full-engine CPU/memory failures refuse',()=>{
  for(const mutate of [
    f=>f.route.qualified=false,
    f=>delete f.route.qualification.measured_records,
    f=>f.route.qualification.measured_cpu_ms=2000,
    f=>f.route.qualification.measured_peak_bytes=256*1024*1024,
    f=>f.route.max_unit_bytes=1,
  ]) {
    const f=fixture();mutate(f)
    assert.throws(()=>assertCapacity(f.route,f.input,limits))
  }
})
test('exact original export drives engine; no source reconnect or public enqueue',async()=>{
  const db=syntheticDb(),executor=createQikHistoricalExecutor(db)
  const result=await executor.resume(operation,{manifest_limits:limits,max_units:10})
  assert.equal(result.state,'readback_verified')
  assert.equal(db.units.size,2)
  assert.ok(db.stats().guards>=3)
  assert.ok(db.stats().readbacks>=4)
  assert.equal(result.public_processing_authorized,false)
})
test('ambiguous commit reconciles independent committed readback, without overwrite',async()=>{
  const db=syntheticDb();db.loseNextCommit()
  const result=await createQikHistoricalExecutor(db).resume(operation,{manifest_limits:limits,max_units:10})
  assert.equal(result.state,'readback_verified');assert.equal(db.units.size,2)
})
test('retry reopens identical original export and verifies receipt prefix',async()=>{
  const db=syntheticDb(),executor=createQikHistoricalExecutor(db)
  const first=await executor.resume(operation,{manifest_limits:limits,max_units:1})
  assert.equal(first.state,'budget_paused')
  const second=await executor.resume(operation,{manifest_limits:limits,max_units:10})
  assert.equal(second.state,'readback_verified')
  assert.equal(second.verified_this_invocation,1)
  const third=await executor.resume(operation,{manifest_limits:limits,max_units:10})
  assert.equal(third.verified_this_invocation,0)
})
test('expired or missing original export never acquires a replacement',async()=>{
  const db=syntheticDb();db.changeOriginal()
  await assert.rejects(()=>createQikHistoricalExecutor(db).resume(operation,{manifest_limits:limits}),
    e=>e.code==='original_export_unavailable')
  assert.equal(db.units.size,0)
})
test('checkpoint prefix tampering is refused before additional commit',async()=>{
  const db=syntheticDb(),executor=createQikHistoricalExecutor(db)
  await executor.resume(operation,{manifest_limits:limits,max_units:1})
  db.units.values().next().value.receipt.commit_sha256=sha('tampered')
  const result=await executor.resume(operation,{manifest_limits:limits,max_units:10})
  assert.equal(result.state,'not_started');assert.equal(result.code,'adapter_operation_failed')
  assert.equal(db.units.size,1)
})
test('smaller invocation budget never splits a deterministic unit',async()=>{
  const db=syntheticDb()
  const result=await createQikHistoricalExecutor(db).resume(operation,{manifest_limits:limits,max_material_bytes:1})
  assert.equal(result.state,'unit_exceeds_budget');assert.equal(db.units.size,0)
})
test('unexpected database failures expose only fixed errors, never raw material',async()=>{
  const executor=createQikHistoricalExecutor({query:async()=>{throw new Error('private title / credential')}})
  await assert.rejects(()=>executor.resume(operation,{manifest_limits:limits}),
    e=>e.message==='adapter_operation_failed'&&!String(e).includes('private'))
})
test('candidate SQL contains transaction, immutable, permission and no publication guards',async()=>{
  const sql=await readFile(new URL('../supabase/qualification/historical-qik-executor/candidate.sql',import.meta.url),'utf8')
  assert.match(sql,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
  assert.match(sql,/pg_export_snapshot/)
  assert.match(sql,/original_export_exists/)
  assert.match(sql,/object_capture_unqualified/)
  assert.match(sql,/force row level security/)
  assert.match(sql,/revoke all on all functions/)
  assert.match(sql,/unit_immutable/)
  assert.doesNotMatch(sql,/insert into public\.|mip_legacy_graph_v1|create policy[^;]*to public/i)
})
// Real ACL verification is deliberately separate from the in-memory tests.
// A future qik-only synthetic qualification runner must supply TWO independent
// authenticated sessions. Do not use material source credentials here.
export async function assertActualPrivatePermissions({executor,anonymous}) {
  const role=await executor.query({text:'select session_user as role',values:[]})
  assert.equal(role.rows[0].role,'mip_history_executor')
  for(const sql of [
    'select * from mip_history.payload',
    'select mip_history.acquire(null::uuid)',
    'select * from mip_history.source_contract',
  ]) await assert.rejects(()=>anonymous.query({text:sql,values:[]}))
  for(const sql of [
    'select * from mip_history.source_contract',
    'update mip_history.route set qualified=true',
    'delete from mip_history.payload',
    'update mip_history.unit set receipt=receipt',
  ]) await assert.rejects(()=>executor.query({text:sql,values:[]}))
}

test('source contracts enumerate all allowlisted families and original native occurrences',async()=>{
  const {buildSourceContract}=await import('../supabase/qualification/historical-qik-executor/contracts.mjs')
  for(const project of [PROJECTS.nie,PROJECTS.yhb]) {
    const c=buildSourceContract(project)
    assert.deepEqual(c.tables,Object.keys(FIELD_CONTRACTS[project]).sort())
    assert.ok(c.inventory_sql.includes('from storage.objects'))
    assert.ok(c.inventory_sql.includes("and not exists(select 1 from missing)"))
    for(const family of c.families) {
      assert.deepEqual(family.fields,FIELD_CONTRACTS[project][family.table_name])
      assert.ok(family.select_sql.includes('t.xmin::text'))
      assert.ok(family.select_sql.includes('t.ctid::text'))
      assert.doesNotMatch(family.select_sql,/from public\."?(nodes|arc_membership_candidates)"?\s/)
    }
  }
})

// Future parent-owned full-PG harness; NOT executed by the ordinary test file.
// Fixture sessions must point to throwaway synthetic PG databases, NEVER real
// source projects or production public schemas. The provisioner supplies the
// installed candidate, source contracts, synthetic Vault refs, measured synthetic
// route bounds, and completely isolated source databases. No credential values
// are returned by this function or by fixture tools.
export async function qualifyAcquisitionWithPostgres({executor,anonymous,sourceWriter,operation_id,limits,
  changeSyntheticArticle,assertSourceReadOnly,assertNoPublicWrites}) {
  await assertActualPrivatePermissions({executor,anonymous})
  await assertSourceReadOnly()
  const adapter=createQikHistoricalExecutor(executor)
  assert.equal((await adapter.acquire(operation_id)).state,'acquired')
  const frozen=await executor.query({text:'select ordinal,body from mip_history.payload where operation_id=$1 order by ordinal',values:[operation_id]})
  assert.ok(frozen.rows.length>0)
  // Native source changes after RR export are intentionally allowed. Reopen must
  // use the original qik bytes, without a new source snapshot.
  await changeSyntheticArticle(sourceWriter)
  await assert.rejects(()=>adapter.acquire(operation_id))
  assert.equal((await adapter.seal(operation_id,{manifest_limits:limits})).state,'sealed')
  const first=await adapter.resume(operation_id,{manifest_limits:limits,max_units:1})
  assert.ok(['budget_paused','readback_verified'].includes(first.state))
  const second=await adapter.resume(operation_id,{manifest_limits:limits,max_units:100})
  assert.equal(second.state,'readback_verified')
  const after=await executor.query({text:'select ordinal,body from mip_history.payload where operation_id=$1 order by ordinal',values:[operation_id]})
  assert.deepEqual(after.rows.map(r=>stableStringify(parseJsonLossless(Buffer.from(r.body).toString('utf8')))),
    frozen.rows.map(r=>stableStringify(parseJsonLossless(Buffer.from(r.body).toString('utf8')))))
  await assert.rejects(()=>executor.query({text:'delete from mip_history.payload where operation_id=$1',values:[operation_id]}))
  await assertNoPublicWrites()
}

test('sealed retries fetch manifest once and use metadata-only repeat fences',async()=>{
  const base=syntheticDb();let manifests=0,fences=0
  const db={query:async input=>{
    if(input.text.startsWith('select state,manifest_sha256')) {
      if(input.text.includes('else null end as manifest_text')) manifests++
      else {fences++;assert.ok(!input.text.includes('then manifest_text'))}
    }
    return base.query(input)
  }}
  assert.equal((await createQikHistoricalExecutor(db).resume(operation,{manifest_limits:limits,max_units:10})).state,'readback_verified')
  assert.equal(manifests,1);assert.ok(fences>1)
})
test('manifest size refusal precedes parse and material transfer',async()=>{
  const f=fixture();f.exported.manifest_bytes=10000001;f.exported.manifest_text=null
  const db=syntheticDb(f)
  await assert.rejects(()=>createQikHistoricalExecutor(db).resume(operation,{manifest_limits:limits}),e=>e.code==='capacity_unqualified')
  assert.equal(db.stats().readbacks,0);assert.equal(db.units.size,0)
})
test('same-size changed sealed identity and route authorization are refused at repeat fences',async()=>{
  for(const mode of ['hash','route','authorization','missing']) {
    const base=syntheticDb();let initial=false
    const db={query:async input=>{
      if(input.text.startsWith('select state,manifest_sha256')) {
        if(initial) {
          if(mode==='hash')base.f.exported.manifest_sha256=sha('different fixed original')
          if(mode==='route')base.f.route.route_sha256=sha('different route')
          if(mode==='authorization')base.f.route.authorization_sha256=sha('different authorization')
          if(mode==='missing')base.changeOriginal()
        }
        initial=true
      }
      return base.query(input)
    }}
    const result=await createQikHistoricalExecutor(db).resume(operation,{manifest_limits:limits,max_units:10})
    assert.equal(result.state,'not_started');assert.equal(base.units.size,0)
  }
})
test('SQL preallocation suppression refuses bodies before wire parsing or committing',async()=>{
  const base=syntheticDb()
  const db={query:async input=>{
    const result=await base.query(input)
    if(input.text.startsWith('select p.ordinal,octet_length(p.body)')) {
      assert.ok(input.text.includes('sum(octet_length(p.body)) over()<=$3'))
      return {rows:result.rows.map(r=>({...r,body:null}))}
    }
    return result
  }}
  const result=await createQikHistoricalExecutor(db).resume(operation,{manifest_limits:limits,max_units:10})
  assert.equal(result.state,'incomplete');assert.equal(base.units.size,0)
})
