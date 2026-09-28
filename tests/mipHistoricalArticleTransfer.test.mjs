import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { transferHistoricalArticles, planHistoricalTransferUnits, TRANSFER_VERSION, SOURCE_CAPABILITIES, SINK_CAPABILITIES } from '../scripts/mipHistoricalArticleTransfer.mjs'
import { planHistoricalArticles, FIELD_CONTRACTS, PROJECTS, VERSION, CATEGORIES, LIMITS, MANIFEST_HARD_LIMITS, manifestLimits } from '../scripts/mipHistoricalArticleTransferPlan.mjs'
import { fingerprintPayload, parseJsonLossless, stableStringify } from '../scripts/mipLegacyGraphStaging.mjs'

const H=value=>createHash('sha256').update(value).digest('hex')
const copy=value=>structuredClone(value)
const OP='00000000-0000-4000-8000-000000000001'
const ROOT='00000000-0000-4000-8000-000000000002'
const SENTINEL='SYNTHETIC_PRIVATE_CONTENT_DO_NOT_CHECKPOINT'
function fixture() {
  const records=[],snapshots=[],wire=new Map(),objects=[],objectBytes=new Map()
  for (const project of [PROJECTS.nie,PROJECTS.yhb]) {
    const snapshot_sha256=H('snapshot:'+project)
    snapshots.push({project,snapshot_sha256,inventory_sha256:H('inventory:'+project),
      root_article_ids:[ROOT],inventoried_categories:[...CATEGORIES]})
    const payload=Object.fromEntries(FIELD_CONTRACTS[project].articles.map(k=>[k,null]))
    Object.assign(payload,{id:ROOT,title:SENTINEL,body_text:SENTINEL,
      claims:parseJsonLossless('{"exact":9007199254740993}')})
    const payload_json=stableStringify(payload)
    const identity={project,table:'articles',source_id:fingerprintPayload({id:ROOT}),version_sha256:H('version:'+project)}
    records.push({identity,snapshot_sha256,payload_sha256:H(payload_json),payload_bytes:Buffer.byteLength(payload_json),
      root_article_ids:[ROOT],dependencies:[]})
    wire.set(stableStringify(identity),{identity,snapshot_sha256,payload_json})
    const bytes=Uint8Array.from(Buffer.from(SENTINEL+project))
    const object={project,snapshot_sha256,object_identity_sha256:H('object:'+project),
      content_sha256:H(bytes),bytes:bytes.length,article_ids:[ROOT]}
    objects.push(object);objectBytes.set(object.object_identity_sha256,bytes)
  }
  return {input:{version:VERSION,destination_project:PROJECTS.qik,snapshots,records,objects},wire,objectBytes}
}
function harness(f=fixture(),limits) {
  const bounds=manifestLimits(limits)
  const plan=planHistoricalArticles(f.input,bounds),commits=new Map(),checkpointStore=new Map()
  const counts={put:0,record:0,object:0,read:0,inventory:0}
  const hooks={}
  const grant={version:TRANSFER_VERSION,mode:'synthetic_test_only',operation_id:OP,
    manifest_sha256:plan.manifest_sha256,destination_project:PROJECTS.qik,
    authorization_sha256:H('synthetic authorization'),route_sha256:H('synthetic route'),
    manifest_limits:bounds,manifest_totals:{records:plan.manifest.records.length,objects:plan.manifest.objects.length,bytes:plan.bytes},
    source_capabilities:Object.fromEntries(plan.manifest.snapshots.map(s=>[s.project,[...SOURCE_CAPABILITIES]])),
    sink_capabilities:[...SINK_CAPABILITIES],checkpoint_capabilities:['durable_metadata_only','compare_and_swap']}
  const sources=Object.fromEntries(plan.manifest.snapshots.map(snapshot=>[snapshot.project,{
    async withFrozenSnapshot(request,callback) {
      assert.deepEqual(request.snapshot,snapshot)
      if (hooks.unavailable) throw new Error('original snapshot no longer available')
      if (hooks.delayOpen) await new Promise(resolve=>setTimeout(resolve,hooks.delayOpen))
      return callback({
        async checkFence() {
          const value={project:snapshot.project,snapshot_sha256:snapshot.snapshot_sha256,
            inventory_sha256:snapshot.inventory_sha256,route_sha256:grant.route_sha256,
            read_only:true,stable:true,resume_exact:true}
          return hooks.fence?hooks.fence(value):value
        },
        async readInventory() {
          counts.inventory++
          const value=copy({snapshot,records:plan.manifest.records.filter(r=>r.identity.project===snapshot.project),
            objects:plan.manifest.objects.filter(o=>o.project===snapshot.project)})
          return hooks.inventory?hooks.inventory(value):value
        },
        async readRecords({rows,max_bytes}) {
          counts.record++
          assert.equal(max_bytes,rows.reduce((n,r)=>n+r.payload_bytes,0))
          const value=rows.map(r=>copy(f.wire.get(stableStringify(r.identity))))
          return hooks.records?hooks.records(value):value
        },
        async readObject({object,max_bytes}) {
          counts.object++;assert.equal(max_bytes,object.bytes)
          const value=copy(f.objectBytes.get(object.object_identity_sha256))
          return hooks.object?hooks.object(value):value
        },
      })
    },
  }]))
  const sink={
    async readUnit(request) {
      counts.read++
      let value=commits.has(request.unit_id)?copy(commits.get(request.unit_id)):
        {state:'absent',operation_id:request.operation_id,manifest_sha256:request.manifest_sha256,unit_id:request.unit_id}
      return hooks.readback?hooks.readback(value):value
    },
    async putUnit({operation_id,manifest_sha256,unit,content}) {
      counts.put++
      if (hooks.refusePut) throw new Error(SENTINEL)
      const value={state:'committed',operation_id,manifest_sha256,unit_id:unit.unit_id,
        receipt:{operation_id,manifest_sha256,unit_id:unit.unit_id,unit_sha256:unit.unit_sha256,
          retention:'private_pending',commit_sha256:H('commit:'+unit.unit_id)},
        [unit.kind==='records'?'records':'bytes']:copy(content)}
      if (commits.has(unit.unit_id)) assert.deepEqual(commits.get(unit.unit_id),value)
      else commits.set(unit.unit_id,value)
      if (hooks.losePutAck) throw new Error('synthetic lost response '+SENTINEL)
      return {ignored:true}
    },
  }
  const checkpoints={
    async load({operation_id}) { return checkpointStore.has(operation_id)?copy(checkpointStore.get(operation_id)):null },
    async compareAndSwap({operation_id,expected_sha256,checkpoint}) {
      assert.equal(checkpointStore.get(operation_id)?.sha256??null,expected_sha256)
      if (hooks.failCheckpoint && checkpoint.verified_units.length) throw new Error(SENTINEL)
      checkpointStore.set(operation_id,copy(checkpoint))
      if (hooks.loseCheckpointAck) throw new Error(SENTINEL)
      return {state:'stored',checkpoint_sha256:checkpoint.sha256}
    },
  }
  const options={input:f.input,manifest_limits:bounds,operation_id:OP,sources,sink,checkpoints,
    admission:{async verify() { if(hooks.admissionError) throw new Error(SENTINEL);return copy(grant) }}}
  return {f,plan,grant,hooks,counts,commits,checkpointStore,options,
    run:overrides=>transferHistoricalArticles({...options,...overrides})}
}
function metadataOnly(value) {
  const text=JSON.stringify(value)
  assert.ok(!text.includes(SENTINEL));assert.ok(!text.includes('payload_json'))
  assert.ok(!text.includes('body_text'));assert.ok(!text.includes('9007199254740993'))
}
test('all source versions and object bytes enter isolated pending custody with lossless content',async()=>{
  const h=harness(),r=await h.run()
  assert.equal(h.plan.executable,false)
  assert.equal(r.state,'readback_verified');assert.equal(r.remaining_units,0)
  assert.equal(r.mode,'synthetic_test_only');assert.equal(r.public_processing_authorized,false)
  assert.equal(h.counts.put,4);assert.equal(h.commits.size,4)
  for(const c of h.commits.values()) {
    assert.equal(c.receipt.retention,'private_pending')
    if(c.records) assert.ok(c.records[0].payload_json.includes('9007199254740993'))
  }
  const identities=[...h.commits.values()].flatMap(c=>c.records??[]).map(r=>r.identity)
  assert.equal(identities[0].source_id,identities[1].source_id)
  assert.notEqual(identities[0].project,identities[1].project)
  assert.notEqual(identities[0].version_sha256,identities[1].version_sha256)
  metadataOnly(r);metadataOnly([...h.checkpointStore.values()])
})
test('unit and byte ceilings pause and resume the exact frozen manifest without repeated writes',async()=>{
  const h=harness()
  const first=await h.run({max_units:1})
  assert.equal(first.state,'budget_paused');assert.equal(first.verified_this_invocation,1)
  const second=await h.run({max_units:1})
  assert.equal(second.state,'budget_paused');assert.equal(second.verified_this_invocation,1)
  assert.equal(h.counts.put,2)
  const done=await h.run()
  assert.equal(done.state,'readback_verified');assert.equal(h.counts.put,4)
  const before=copy(h.counts)
  const retry=await h.run()
  assert.equal(retry.state,'readback_verified');assert.equal(retry.verified_this_invocation,0)
  assert.equal(h.counts.put,before.put);assert.equal(h.counts.record,before.record)
  assert.equal(h.counts.object,before.object);assert.equal(h.counts.read,before.read)
  const small=harness(),paused=await small.run({max_material_bytes:1})
  assert.equal(paused.state,'unit_exceeds_budget');assert.equal(small.counts.put,0)
})
test('lost commit and checkpoint acknowledgments reconcile exact readback',async()=>{
  const h=harness();h.hooks.losePutAck=true;h.hooks.loseCheckpointAck=true
  const r=await h.run()
  assert.equal(r.state,'readback_verified');assert.equal(h.counts.put,4)
  assert.equal(h.checkpointStore.get(OP).verified_units.length,4);metadataOnly(r)
})
test('commit before checkpoint failure resumes through readback without resubmission',async()=>{
  const h=harness();h.hooks.failCheckpoint=true
  const failed=await h.run()
  assert.equal(failed.state,'incomplete');assert.equal(failed.code,'checkpoint_outcome_unresolved')
  assert.equal(h.counts.put,1);assert.equal(h.commits.size,1)
  h.hooks.failCheckpoint=false
  const resumed=await h.run()
  assert.equal(resumed.state,'readback_verified');assert.equal(h.counts.put,4)
})
test('snapshot expiry on resume refuses substitution with fresh rows',async()=>{
  const h=harness();await h.run({max_units:1});h.hooks.unavailable=true
  const r=await h.run()
  assert.equal(r.state,'incomplete');assert.equal(r.code,'adapter_operation_failed')
  assert.equal(h.counts.put,1);metadataOnly(r)
})
test('inventory and fence drift fail before any material write',async()=>{
  for(const kind of ['inventory','fence']) {
    const h=harness()
    if(kind==='inventory') h.hooks.inventory=v=>({...v,records:[]})
    else h.hooks.fence=v=>({...v,snapshot_sha256:H('replacement snapshot')})
    const r=await h.run()
    assert.equal(r.state,'not_started');assert.equal(h.counts.put,0)
    assert.equal(r.code,kind==='inventory'?'frozen_inventory_changed':'snapshot_not_frozen')
  }
})
test('missing admission capability and opaque adapter errors never become authorization or payload logs',async()=>{
  const h=harness();h.grant.source_capabilities[PROJECTS.nie].pop()
  const r=await h.run();assert.equal(r.code,'capability_missing');assert.equal(h.counts.inventory,0)
  const x=harness();x.hooks.admissionError=true
  const failed=await x.run();assert.equal(failed.code,'adapter_operation_failed');metadataOnly(failed)
})
test('record lineage, fields, byte counts and rounded numeric substitutions fail closed',async()=>{
  for(const mutate of [
    rows=>{rows[0].identity.version_sha256=H('wrong');return rows},
    rows=>{rows[0].payload_json=rows[0].payload_json.replace('9007199254740993','9007199254740992');return rows},
    rows=>{rows[0].payload_json+=' ';return rows},
    rows=>{const p=parseJsonLossless(rows[0].payload_json);p.extra=SENTINEL;rows[0].payload_json=stableStringify(p);return rows},
  ]) {
    const h=harness();h.hooks.records=mutate
    const r=await h.run();assert.equal(r.state,'incomplete');assert.equal(h.counts.put,0)
    assert.ok(r.code.startsWith('record_'));metadataOnly(r)
  }
})
test('sink conflicting or corrupted committed content is never checkpointed',async()=>{
  const h=harness()
  h.hooks.readback=v=>{
    if(v.state==='committed'&&v.records) v.records[0].payload_json=v.records[0].payload_json.replace('9007199254740993','9007199254740992')
    return v
  }
  const r=await h.run()
  assert.equal(r.code,'record_hash_changed');assert.equal(h.counts.put,1)
  assert.equal(r.checkpoint.verified_units.length,0);metadataOnly(r)
})
test('object byte corruption refuses custody even after earlier records succeeded',async()=>{
  const h=harness();h.hooks.object=v=>{v[0]^=1;return v}
  const r=await h.run()
  assert.equal(r.state,'incomplete');assert.equal(r.code,'object_hash_changed')
  assert.equal(h.counts.put,2);assert.equal(r.checkpoint.verified_units.length,2)
})
test('changed manifest or checkpoint receipt metadata cannot resume an existing operation',async()=>{
  const h=harness();await h.run({max_units:1})
  h.checkpointStore.get(OP).verified_units[0].receipt_sha256=H('tampered')
  let r=await h.run();assert.equal(r.code,'checkpoint_binding_changed');assert.equal(h.counts.put,1)
  const x=harness();await x.run({max_units:1})
  const changed=copy(x.f.input);changed.records[0].identity.version_sha256=H('new occurrence')
  x.grant.manifest_sha256=planHistoricalArticles(changed).manifest_sha256
  r=await x.run({input:changed})
  assert.equal(r.code,'checkpoint_binding_changed');assert.equal(x.counts.put,1)
})
test('write refusal yields unresolved status and no invented receipt',async()=>{
  const h=harness();h.hooks.refusePut=true
  const r=await h.run()
  assert.equal(r.state,'incomplete');assert.equal(r.code,'unit_commit_unresolved')
  assert.equal(r.checkpoint.verified_units.length,0);assert.equal(h.commits.size,0);metadataOnly(r)
})
test('timeout prevents a late source callback from initiating material writes',async()=>{
  const h=harness();h.hooks.delayOpen=35
  const r=await h.run({timeout_ms:5})
  assert.equal(r.code,'transfer_timed_out')
  await new Promise(resolve=>setTimeout(resolve,50))
  assert.equal(h.counts.put,0);assert.equal(h.counts.record,0)
})
test('incomplete manifest closure and missing real route interfaces fail before transfer',async()=>{
  const h=harness(),bad=copy(h.f.input);bad.snapshots[0].inventoried_categories=[]
  await assert.rejects(()=>h.run({input:bad}),/manifest_closure_incomplete/)
  await assert.rejects(()=>h.run({sink:{readUnit:async()=>null}}),/adapter_missing/)
  assert.equal(h.counts.put,0)
})

test('whole-corpus metadata exceeds 10k while automatic batches preserve complete membership and retry',async()=>{
  const f=fixture(),template=f.input.records[0]
  // Distinct historical source versions share one canonical synthetic wire value;
  // no large payload fixture and no real historical material.
  for(let i=0;i<10000;i++) {
    const r=copy(template);r.identity.version_sha256=H('historical-version:'+i)
    f.input.records.push(r)
    f.wire.set(stableStringify(r.identity),{identity:r.identity,snapshot_sha256:r.snapshot_sha256,
      payload_json:f.wire.get(stableStringify(template.identity)).payload_json})
  }
  assert.throws(()=>planHistoricalArticles(f.input),/record_limit/)
  const limits={records:10002,objects:2,bytes:LIMITS.bytes}
  const h=harness(f,limits)
  assert.equal(h.plan.manifest.records.length,10002)
  assert.equal(h.plan.pages.reduce((n,p)=>n+p.rows.length,0),10002)
  assert.ok(h.plan.pages.every(p=>p.rows.length<=100))
  let r=await h.run({max_units:1})
  const manifest=r.manifest_sha256
  assert.equal(r.pending_unit_id,null)
  let runs=1
  while(r.state==='budget_paused'&&runs<5) {
    r=await h.run({max_units:100});runs++
    assert.equal(r.manifest_sha256,manifest)
    assert.ok(r.material_bytes_this_invocation<=LIMITS.bytes)
    assert.equal(r.pending_unit_id,null)
  }
  assert.equal(r.state,'readback_verified')
  assert.equal([...h.commits.values()].reduce((n,c)=>n+(c.records?.length??0),0),10002)
  assert.equal(h.counts.put,h.plan.pages.length+2)
  const before=h.counts.put;await h.run();assert.equal(h.counts.put,before)
  metadataOnly(r)
})
test('expanded aggregate metadata capacity does not silently expand invocation bytes or route capacity',async()=>{
  const f=fixture();f.input.records[0].payload_bytes=LIMITS.bytes+1
  assert.throws(()=>planHistoricalArticles(f.input),/byte_limit/)
  const limits={records:10000,objects:10000,bytes:LIMITS.bytes*2}
  const h=harness(f,limits),r=await h.run()
  assert.equal(r.state,'unsupported_unit_capacity');assert.equal(h.counts.put,0)
  const mismatch=harness(f,limits);mismatch.grant.manifest_totals.bytes--
  const rejected=await mismatch.run()
  assert.equal(rejected.code,'route_capacity_mismatch');assert.equal(mismatch.counts.inventory,0)
  await assert.rejects(()=>h.run({max_material_bytes:LIMITS.bytes+1}),/invocation_budget/)
  assert.throws(()=>manifestLimits({...limits,records:MANIFEST_HARD_LIMITS.records+1}),/manifest_limit/)
})

test('byte-aware record units retain deterministic membership independently of invocation ceiling',async()=>{
  const f=fixture(),a=f.input.records[0]
  a.payload_bytes=80*1024*1024
  const b=copy(a);b.identity.version_sha256=H('second-large-record')
  f.input.records.push(b)
  const limits={records:10000,objects:10000,bytes:LIMITS.bytes*2}
  const h=harness(f,limits),seen=[]
  const units=planHistoricalTransferUnits(f.input,limits)
  const rows=units.filter(u=>u.kind==='records').flatMap(u=>u.rows)
  assert.deepEqual(rows.map(r=>stableStringify(r.identity)).sort(),
    h.plan.manifest.records.map(r=>stableStringify(r.identity)).sort())
  assert.equal(new Set(units.map(u=>u.unit_id)).size,units.length)
  assert.ok(units.filter(u=>u.kind==='records').every(u=>u.bytes<=LIMITS.bytes))
  const reordered=copy(f.input);reordered.records.reverse()
  assert.deepEqual(planHistoricalTransferUnits(reordered,limits),units)
  // Metadata-only probe stops before reading or allocating oversized synthetic
  // payload bytes. The sink observes the exact next-unit digest and byte bound.
  h.options.sink.readUnit=async request=>{seen.push(copy({...request,signal:undefined}));throw Error('probe stop')}
  const r=await h.run()
  assert.equal(r.code,'adapter_operation_failed')
  assert.equal(seen[0].max_bytes,80*1024*1024)
  assert.equal(h.plan.pages[0].rows.length,2)
  assert.equal(h.plan.pages[0].rows.reduce((n,r)=>n+r.payload_bytes,0),160*1024*1024)
  const firstUnit=seen[0].unit_id
  const again=await h.run({max_material_bytes:100*1024*1024})
  assert.equal(again.code,'adapter_operation_failed');assert.equal(seen[1].unit_id,firstUnit)
  const small=await h.run({max_material_bytes:70*1024*1024})
  assert.equal(small.state,'unit_exceeds_budget');assert.equal(small.pending_unit_id,firstUnit)
  assert.equal(seen.length,2);assert.equal(h.counts.record,0);assert.equal(h.counts.put,0)
})
test('an indivisible oversized object returns actionable capacity state without allocating its bytes',async()=>{
  const f=fixture();f.input.objects[0].bytes=LIMITS.bytes+1
  const h=harness(f,{records:10000,objects:10000,bytes:LIMITS.bytes*2})
  const r=await h.run()
  assert.equal(r.state,'unsupported_unit_capacity')
  assert.equal(r.checkpoint.verified_units.length,2)
  assert.equal(h.counts.object,0);assert.equal(h.counts.put,2)
  assert.ok(r.pending_unit_id);assert.ok(r.remaining_units>0);metadataOnly(r)
})
