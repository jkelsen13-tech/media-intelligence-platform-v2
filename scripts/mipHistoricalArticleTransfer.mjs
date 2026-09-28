import { createHash } from 'node:crypto'
import { planHistoricalArticles, FIELD_CONTRACTS, LIMITS, PROJECTS, manifestLimits } from './mipHistoricalArticleTransferPlan.mjs'
import { fingerprintPayload, parseJsonLossless, stableStringify } from './mipLegacyGraphStaging.mjs'

export const TRANSFER_VERSION = 'historical-article-transfer/v1'
export const SOURCE_CAPABILITIES = Object.freeze([
  'exact_frozen_snapshot_resume', 'read_only', 'complete_inventory',
  'lossless_canonical_records', 'source_qualified_versions', 'exact_object_bytes',
])
export const SINK_CAPABILITIES = Object.freeze([
  'private_pending_only', 'atomic_unit_if_absent', 'immutable_source_versions',
  'exact_readback', 'durable_commit_identity', 'immutable_object_bytes',
])
const SHA = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const INTERNAL = Symbol('historical-transfer-error')
const digestBytes = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a,b) => stableStringify(a) === stableStringify(b)
const clone = value => structuredClone(value)
function fail(code) { throw Object.assign(new Error(code), { code, [INTERNAL]: true }) }
function exact(value, keys, code='adapter_shape') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail(code)
}
function sha(value) { if (typeof value !== 'string' || !SHA.test(value)) fail('digest_required'); return value }
function method(object, name) { if (typeof object?.[name] !== 'function') fail('adapter_missing') }
function capabilities(actual, required) {
  if (!Array.isArray(actual) || !same([...actual].sort(), [...required].sort())) fail('capability_missing')
}
function checkedPlan(input, bounds) {
  const plan=planHistoricalArticles(input,bounds)
  // Object gaps are discharged only by verified bytes below. All other
  // planner gaps remain hard stops. executable:false is never authorization.
  if (plan.gaps.some(g=>g.code!=='object_bytes_not_in_custody')) fail('manifest_closure_incomplete')
  return plan
}
function unitsFor(plan) {
  const units=[]
  for (const page of plan.pages) {
    let rows=[],bytes=0
    const flush=()=>{
      if(rows.length) units.push({kind:'records',project:page.project,table:page.table,
        fields:page.fields,rows,bytes})
      rows=[];bytes=0
    }
    for(const row of page.rows) {
      if(rows.length && bytes+row.payload_bytes>LIMITS.bytes) flush()
      rows.push(row);bytes+=row.payload_bytes
      if(bytes>LIMITS.bytes) flush()
    }
    flush()
  }
  for (const object of plan.manifest.objects) units.push({
    kind:'object', project:object.project, object, bytes:object.bytes,
  })
  return units.map(body=>{
    const unit_sha256=fingerprintPayload(body)
    return { ...body, unit_sha256,
      unit_id:fingerprintPayload({version:TRANSFER_VERSION,manifest_sha256:plan.manifest_sha256,unit_sha256}) }
  })
}
// Pure metadata preview: deterministic units use the fixed global byte ceiling,
// never the caller's per-invocation budget. This grants no execution authority.
export function planHistoricalTransferUnits(input,requestedLimits) {
  return unitsFor(checkedPlan(input,manifestLimits(requestedLimits)))
}
function expectedInventory(plan, project) {
  return {
    snapshot:plan.manifest.snapshots.find(s=>s.project===project),
    records:plan.manifest.records.filter(r=>r.identity.project===project),
    objects:plan.manifest.objects.filter(o=>o.project===project),
  }
}
function verifyRecords(unit, rows) {
  if (!Array.isArray(rows) || rows.length!==unit.rows.length) fail('record_set_changed')
  rows.forEach((row,i)=>{
    exact(row,['identity','snapshot_sha256','payload_json'])
    const expected=unit.rows[i]
    if (!same(row.identity,expected.identity) || row.snapshot_sha256!==expected.snapshot_sha256) fail('record_lineage_changed')
    if (typeof row.payload_json!=='string' || Buffer.byteLength(row.payload_json,'utf8')!==expected.payload_bytes) fail('record_byte_count')
    let payload
    try { payload=parseJsonLossless(row.payload_json) } catch { fail('record_json_invalid') }
    exact(payload,FIELD_CONTRACTS[unit.project][unit.table],'record_field_drift')
    // Canonical lossless JSON is the specified wire representation. Reject
    // duplicate keys, extra whitespace and rounded numeric substitutes.
    if (stableStringify(payload)!==row.payload_json
      || fingerprintPayload(payload)!==expected.payload_sha256
      || digestBytes(Buffer.from(row.payload_json,'utf8'))!==expected.payload_sha256) fail('record_hash_changed')
    if (unit.table==='articles' && (fingerprintPayload({id:payload.id})!==expected.identity.source_id
      || !expected.root_article_ids.includes(payload.id))) fail('article_identity_changed')
  })
}
function verifyObject(unit, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength!==unit.object.bytes) fail('object_byte_count')
  if (digestBytes(bytes)!==unit.object.content_sha256) fail('object_hash_changed')
}
function verifyReceipt(unit, receipt, binding) {
  exact(receipt,['operation_id','manifest_sha256','unit_id','unit_sha256','retention','commit_sha256'])
  if (receipt.operation_id!==binding.operation_id || receipt.manifest_sha256!==binding.manifest_sha256
    || receipt.unit_id!==unit.unit_id || receipt.unit_sha256!==unit.unit_sha256
    || receipt.retention!=='private_pending') fail('receipt_mismatch')
  sha(receipt.commit_sha256)
  return fingerprintPayload(receipt)
}
function verifyReadback(unit, value, binding) {
  const common=['state','operation_id','manifest_sha256','unit_id']
  if (value?.state==='absent') {
    exact(value,common)
    if (value.operation_id!==binding.operation_id || value.manifest_sha256!==binding.manifest_sha256
      || value.unit_id!==unit.unit_id) fail('readback_binding_changed')
    return null
  }
  exact(value,[...common,'receipt',unit.kind==='records'?'records':'bytes'])
  if (value.state!=='committed' || value.operation_id!==binding.operation_id
    || value.manifest_sha256!==binding.manifest_sha256 || value.unit_id!==unit.unit_id) fail('readback_binding_changed')
  if (unit.kind==='records') verifyRecords(unit,value.records)
  else verifyObject(unit,value.bytes)
  return verifyReceipt(unit,value.receipt,binding)
}
function sealCheckpoint(body) { return {...body,sha256:fingerprintPayload(body)} }
function validateCheckpoint(value,binding,units) {
  exact(value,['version','operation_id','manifest_sha256','authorization_sha256','route_sha256','verified_units','sha256'],'checkpoint_shape')
  const {sha256,...body}=value
  if (sha256!==fingerprintPayload(body) || value.version!==TRANSFER_VERSION
    || value.operation_id!==binding.operation_id || value.manifest_sha256!==binding.manifest_sha256
    || value.authorization_sha256!==binding.authorization_sha256 || value.route_sha256!==binding.route_sha256
    || !Array.isArray(value.verified_units) || value.verified_units.length>units.length) fail('checkpoint_binding_changed')
  value.verified_units.forEach((entry,i)=>{
    exact(entry,['unit_id','receipt_sha256'],'checkpoint_shape')
    if (entry.unit_id!==units[i].unit_id) fail('checkpoint_not_exact_prefix')
    sha(entry.receipt_sha256)
  })
  return clone(value)
}
function validateAdmission(admission,plan,operation_id,bounds) {
  exact(admission,['version','mode','operation_id','manifest_sha256','destination_project',
    'authorization_sha256','route_sha256','source_capabilities','sink_capabilities','checkpoint_capabilities','manifest_limits','manifest_totals'])
  if (admission.version!==TRANSFER_VERSION || !['synthetic_test_only','owner_approved_private'].includes(admission.mode)
    || admission.operation_id!==operation_id || admission.manifest_sha256!==plan.manifest_sha256
    || admission.destination_project!==PROJECTS.qik) fail('admission_mismatch')
  if (!same(admission.manifest_limits,bounds) || !same(admission.manifest_totals,{
    records:plan.manifest.records.length,objects:plan.manifest.objects.length,bytes:plan.bytes,
  })) fail('route_capacity_mismatch')
  sha(admission.authorization_sha256);sha(admission.route_sha256)
  exact(admission.source_capabilities,plan.manifest.snapshots.map(s=>s.project))
  for (const s of plan.manifest.snapshots) capabilities(admission.source_capabilities[s.project],SOURCE_CAPABILITIES)
  capabilities(admission.sink_capabilities,SINK_CAPABILITIES)
  capabilities(admission.checkpoint_capabilities,['durable_metadata_only','compare_and_swap'])
}
function verifyFence(fence,snapshot,route) {
  exact(fence,['project','snapshot_sha256','inventory_sha256','route_sha256','read_only','stable','resume_exact'])
  if (fence.project!==snapshot.project || fence.snapshot_sha256!==snapshot.snapshot_sha256
    || fence.inventory_sha256!==snapshot.inventory_sha256 || fence.route_sha256!==route
    || fence.read_only!==true || fence.stable!==true || fence.resume_exact!==true) fail('snapshot_not_frozen')
}
/**
 * Reusable bounded orchestration, not a network/credential adapter.
 *
 * admission.verify must be provided by the approved private host and verify
 * actual owner scope AND route qualification, not echo caller booleans.
 * Whole-corpus scope is already authorized separately; manifest_limits and
 * exact manifest_totals are engineering route-capacity checks, not another
 * owner approval. Larger metadata bounds never increase invocation I/O caps. Each
 * source.withFrozenSnapshot must keep callback reads inside the same original
 * transaction/export, verify native identity/version mapping and fail if that
 * snapshot is unavailable; it must never substitute current rows.
 *
 * sink.putUnit must atomically insert-if-absent in isolated private pending
 * custody, preserve each source-qualified version, refuse any conflicting key,
 * and never dispatch a global worker, overwrite, publish or process content.
 * Its readUnit must independently return the exact committed bytes plus an
 * immutable commit identity. Previously verified prefixes rely on this qualified
 * immutability and the trusted checkpoint store; retries do not re-download
 * every completed unit. Byte budgets count selected unit bytes, not network
 * overhead or monetary cost. Durable checkpoint CAS is a separate metadata
 * operation. Adapter statements alone do not qualify a real host or channel.
 *
 * All adapter calls receive an AbortSignal. A timeout can leave a remote commit
 * ambiguous; the next invocation reads that SAME unit before any retry. The
 * caller must persist the original metadata manifest separately and resume it.
 * This module reads no env, opens no connection and exports no CLI.
 */
export async function transferHistoricalArticles({
  input, operation_id, admission, sources, sink, checkpoints, manifest_limits,
  max_units=20, max_material_bytes=LIMITS.bytes, timeout_ms=30000,
}={}) {
  if (!UUID.test(operation_id??'')) fail('operation_id_required')
  const bounds=manifestLimits(manifest_limits),plan=checkedPlan(input,bounds),units=unitsFor(plan)
  if (!Number.isSafeInteger(max_units) || max_units<1 || max_units>100
    || !Number.isSafeInteger(max_material_bytes) || max_material_bytes<1 || max_material_bytes>LIMITS.bytes
    || !Number.isSafeInteger(timeout_ms) || timeout_ms<5 || timeout_ms>120000) fail('invocation_budget')
  method(admission,'verify');method(sink,'readUnit');method(sink,'putUnit')
  method(checkpoints,'load');method(checkpoints,'compareAndSwap')
  exact(sources,plan.manifest.snapshots.map(s=>s.project))
  for (const s of plan.manifest.snapshots) method(sources[s.project],'withFrozenSnapshot')
  const controller=new AbortController(),deadline=Date.now()+timeout_ms
  let closed=false,checkpoint=null,binding=null,mode=null,verified=0,material_bytes=0,pending_unit_id=null
  const timer=setTimeout(()=>controller.abort(),timeout_ms)
  function active() { if (closed || controller.signal.aborted || Date.now()>=deadline) fail('transfer_timed_out') }
  async function call(fn,arg) {
    active()
    let onAbort
    const abort=new Promise((_,reject)=>{
      onAbort=()=>reject(Object.assign(new Error('transfer_timed_out'),{code:'transfer_timed_out',[INTERNAL]:true}))
      controller.signal.addEventListener('abort',onAbort,{once:true})
    })
    try { return await Promise.race([Promise.resolve().then(()=>{active();return fn({...arg,signal:controller.signal})}),abort]) }
    finally { controller.signal.removeEventListener('abort',onAbort) }
  }
  async function save(next) {
    const request={operation_id,expected_sha256:checkpoint?.sha256??null,checkpoint:clone(next)}
    let ack
    try { ack=await call(a=>checkpoints.compareAndSwap(a),request) } catch { /* reconcile exact metadata below */ }
    if (ack?.state==='stored' && ack.checkpoint_sha256===next.sha256) {
      exact(ack,['state','checkpoint_sha256']);checkpoint=next;return
    }
    const found=await call(a=>checkpoints.load(a),{operation_id})
    if (!found || !same(validateCheckpoint(found,binding,units),next)) fail('checkpoint_outcome_unresolved')
    checkpoint=next
  }
  const report=(state,code=null)=>({
    version:TRANSFER_VERSION,state,code,mode,manifest_sha256:plan.manifest_sha256,
    operation_id,checkpoint:checkpoint?clone(checkpoint):null,pending_unit_id,
    pending_unit_bytes:pending_unit_id===null?null:units.find(u=>u.unit_id===pending_unit_id)?.bytes??null,
    invocation_byte_limit:max_material_bytes,unit_byte_limit:LIMITS.bytes,
    verified_this_invocation:verified,material_bytes_this_invocation:material_bytes,
    remaining_units:units.length-(checkpoint?.verified_units.length??0),
    evidence:'injected_adapter_readback_only',public_processing_authorized:false,
  })
  try {
    const grant=await call(a=>admission.verify(a),{
      version:TRANSFER_VERSION,operation_id,manifest_sha256:plan.manifest_sha256,
      destination_project:PROJECTS.qik,source_projects:plan.manifest.snapshots.map(s=>s.project),
      manifest_limits:clone(bounds),manifest_totals:{records:plan.manifest.records.length,objects:plan.manifest.objects.length,bytes:plan.bytes},
    })
    validateAdmission(grant,plan,operation_id,bounds);mode=grant.mode
    binding={operation_id,manifest_sha256:plan.manifest_sha256,
      authorization_sha256:grant.authorization_sha256,route_sha256:grant.route_sha256}
    const saved=await call(a=>checkpoints.load(a),{operation_id})
    if (saved!==null) checkpoint=validateCheckpoint(saved,binding,units)
    else await save(sealCheckpoint({version:TRANSFER_VERSION,...binding,verified_units:[]}))
    const readers=new Map()
    async function inside(index) {
      active()
      if (index<plan.manifest.snapshots.length) {
        const snapshot=plan.manifest.snapshots[index],source=sources[snapshot.project]
        return call(({signal})=>source.withFrozenSnapshot({
          snapshot:clone(snapshot),manifest_sha256:plan.manifest_sha256,route_sha256:binding.route_sha256,signal,
        },async reader=>{
          active()
          method(reader,'readInventory');method(reader,'readRecords');method(reader,'readObject');method(reader,'checkFence')
          const check=async()=>{
            verifyFence(await call(a=>reader.checkFence(a),{}),snapshot,binding.route_sha256)
            const inventory=await call(a=>reader.readInventory(a),{manifest_sha256:plan.manifest_sha256})
            if (!same(inventory,expectedInventory(plan,snapshot.project))) fail('frozen_inventory_changed')
          }
          await check();readers.set(snapshot.project,reader)
          const result=await inside(index+1)
          await check()
          return result
        }),{})
      }
      for (let i=0;i<units.length;i++) {
        const unit=units[i]
        if (i<checkpoint.verified_units.length) continue
        if(unit.bytes>LIMITS.bytes) {pending_unit_id=unit.unit_id;return 'unsupported_unit_capacity'}
        if(unit.bytes>max_material_bytes) {pending_unit_id=unit.unit_id;return 'unit_exceeds_budget'}
        if (verified>=max_units || material_bytes+unit.bytes>max_material_bytes) return 'budget_paused'
        pending_unit_id=unit.unit_id
        const request={operation_id,manifest_sha256:plan.manifest_sha256,unit_id:unit.unit_id,max_bytes:unit.bytes}
        const read=async()=>verifyReadback(unit,await call(a=>sink.readUnit(a),request),binding)
        let receipt=await read()
        if (receipt===null) {
          const reader=readers.get(unit.project)
          verifyFence(await call(a=>reader.checkFence(a),{}),
            plan.manifest.snapshots.find(s=>s.project===unit.project),binding.route_sha256)
          let content
          if (unit.kind==='records') {
            content=await call(a=>reader.readRecords(a),{
              rows:clone(unit.rows),fields:[...unit.fields],max_bytes:unit.bytes,
            })
            verifyRecords(unit,content)
          } else {
            content=await call(a=>reader.readObject(a),{object:clone(unit.object),max_bytes:unit.bytes})
            verifyObject(unit,content)
          }
          // Ignore acknowledgments as custody proof, including a lost commit
          // response. Exact independent readback is always required.
          try { await call(a=>sink.putUnit(a),{
            operation_id,manifest_sha256:plan.manifest_sha256,unit:clone(unit),content:clone(content),
          }) } catch { /* unknown, conflicting or refused writes reconcile once */ }
          receipt=await read()
          if (receipt===null) fail('unit_commit_unresolved')
        }
        const next=sealCheckpoint({version:TRANSFER_VERSION,...binding,
          verified_units:[...checkpoint.verified_units,{unit_id:unit.unit_id,receipt_sha256:receipt}]})
        await save(next);verified++;material_bytes+=unit.bytes;pending_unit_id=null
      }
      pending_unit_id=null
      return 'readback_verified'
    }
    return report(await inside(0))
  } catch (error) {
    return report((checkpoint?.verified_units.length || pending_unit_id!==null)?'incomplete':'not_started',
      error?.[INTERNAL]===true?error.code:'adapter_operation_failed')
  } finally { closed=true;controller.abort();clearTimeout(timer) }
}
