import { createHash } from 'node:crypto'
import { transferHistoricalArticles, planHistoricalTransferUnits, SOURCE_CAPABILITIES, SINK_CAPABILITIES, TRANSFER_VERSION } from '../../../scripts/mipHistoricalArticleTransfer.mjs'
import { FIELD_CONTRACTS, PROJECTS, CATEGORIES, VERSION, planHistoricalArticles } from '../../../scripts/mipHistoricalArticleTransferPlan.mjs'
import { parseJsonLossless, stableStringify, fingerprintPayload } from '../../../scripts/mipLegacyGraphStaging.mjs'

// No environment access, CLI, HTTP endpoint, logging, public RPC or enqueue.
// db is a dedicated TLS qik connection authenticated as mip_history_executor.
// Call only from a qualified restricted component INSIDE the existing qik project.
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a,b) => stableStringify(a) === stableStringify(b)
const fail = code => { throw Object.assign(new Error(code), { code }) }
const codes = new Set(['route_unqualified','capacity_unqualified','original_export_unavailable',
  'original_export_changed','object_capture_unqualified','field_contract','identity_contract',
  'closure_contract','unit_mapping','unit_conflict','checkpoint_prefix','canonical_conflict',
  'cancelled','adapter_operation_failed'])
async function safe(work) {
  try { return await work() }
  catch(error) { fail(codes.has(error?.code) ? error.code : 'adapter_operation_failed') }
}
const textJson = value => JSON.parse(value)
function canonical(text) {
  if (typeof text !== 'string') fail('identity_contract')
  return stableStringify(parseJsonLossless(text))
}
function sourceIdentity(project,table,native,version,snapshot) {
  return { project,table,source_id:hash(canonical(native)),
    version_sha256:fingerprintPayload({ project,table,snapshot_sha256:snapshot,native_version:canonical(version) }) }
}
export function canonicalRecord(row,snapshot_sha256) {
  const fields=FIELD_CONTRACTS[row.project]?.[row.table_name]
  if (!fields) fail('field_contract')
  const raw=Buffer.from(row.body).toString('utf8'),payload=parseJsonLossless(raw)
  if (!same(Object.keys(payload).sort(),[...fields].sort())) fail('field_contract')
  const payload_json=stableStringify(payload)
  const identity=sourceIdentity(row.project,row.table_name,row.native_identity_json,row.native_version_json,snapshot_sha256)
  if (row.table_name==='articles' && canonical(row.native_identity_json)!==stableStringify({id:payload.id}))
    fail('identity_contract')
  const roots=[...new Set(textJson(row.roots_json))].sort()
  const dependencies=textJson(row.dependencies_json).map(d=>sourceIdentity(row.project,d.table,
    d.native_identity_json,d.native_version_json,snapshot_sha256)).sort((a,b)=>stableStringify(a).localeCompare(stableStringify(b)))
  return { payload_json,meta:{identity,snapshot_sha256,payload_sha256:hash(payload_json),
    payload_bytes:Buffer.byteLength(payload_json),root_article_ids:roots,dependencies} }
}
export function assertCapacity(route,input,limits) {
  const plan=planHistoricalArticles(input,limits),units=planHistoricalTransferUnits(input,limits)
  const q=route?.qualification
  if (route?.project!==PROJECTS.qik || route.qualified!==true ||
    q?.material_host!=='qik_only' || q?.engine_sha!=='b5b80ee37c6cd068d17f59b506bab6df70839ea6' ||
    q?.acl_verified!==true || q?.cost_ceiling_verified!==true ||
    q?.full_engine_capacity_verified!==true) fail('route_unqualified')
  // Measurement must cover this exact engine, complete inventory passes and
  // readback/structuredClone peak, not just a streaming payload receiver.
  if (q.runtime!=='qik_edge' || !Number.isFinite(q.measured_cpu_ms) || q.measured_cpu_ms>=2000 ||
    !Number.isFinite(q.measured_peak_bytes) || q.measured_peak_bytes>=256*1024*1024 ||
    !Number.isFinite(q.measured_wall_ms) || q.measured_wall_ms>=120000 ||
    !Number.isSafeInteger(q.measured_records) || !Number.isSafeInteger(q.measured_objects) ||
    !Number.isSafeInteger(q.measured_manifest_bytes) || !Number.isSafeInteger(q.measured_max_unit_bytes) ||
    !Number.isSafeInteger(Number(route.max_unit_bytes)) || !Number.isSafeInteger(Number(route.max_manifest_bytes)) ||
    q.measured_records<plan.manifest.records.length ||
    q.measured_objects<plan.manifest.objects.length ||
    q.measured_manifest_bytes<Buffer.byteLength(stableStringify(plan.manifest)) ||
    q.measured_max_unit_bytes<Math.max(0,...units.map(u=>u.bytes)) ||
    units.some(u=>u.bytes>Number(route.max_unit_bytes)) ||
    Buffer.byteLength(stableStringify(plan.manifest))>Number(route.max_manifest_bytes))
    fail('capacity_unqualified')
  if (input.objects.length) fail('object_capture_unqualified')
  return {plan,units}
}
export function createQikHistoricalExecutor(db) {
  if (typeof db?.query!=='function') fail('route_unqualified')
  async function query(sql,params=[],signal) {
    if (signal?.aborted) fail('cancelled')
    // Contract: query accepts AbortSignal, parameterizes values and never logs
    // query parameters/results/errors. The deployment driver must be qualified.
    const result=await safe(()=>db.query({text:sql,values:params,signal}))
    if (signal?.aborted) fail('cancelled')
    return result.rows
  }
  async function guard(signal) {
    await query('select mip_history.guard()',[],signal)
    const rows=await query('select * from mip_history.route',[],signal)
    if (rows.length!==1) fail('route_unqualified')
    return rows[0]
  }
  async function original(operation_id,signal) {
    const rows=await query('select state,manifest_text,manifest_sha256,route_sha256,authorization_sha256 from mip_history.export where operation_id=$1',[operation_id],signal)
    if (rows.length!==1 || rows[0].state!=='sealed') fail('original_export_unavailable')
    const e=rows[0],input=textJson(e.manifest_text)
    if (hash(e.manifest_text)!==e.manifest_sha256 || stableStringify(input)!==e.manifest_text)
      fail('original_export_changed')
    return {...e,input}
  }
  async function rowsByOrdinal(operation_id,ordinals,signal) {
    return query('select p.ordinal,p.body,p.record_meta from unnest($2::bigint[]) with ordinality requested(ordinal,position) join mip_history.payload p on p.operation_id=$1 and p.ordinal=requested.ordinal order by requested.position',
      [operation_id,ordinals],signal)
  }
  function wire(rows) {
    return rows.map(row=>({identity:row.record_meta.identity,snapshot_sha256:row.record_meta.snapshot_sha256,
      payload_json:Buffer.from(row.body).toString('utf8')}))
  }
  async function mapping(operation_id,unit,signal) {
    if(unit.kind!=='records') fail('object_capture_unqualified')
    const result=[]
    for(const expected of unit.rows) {
      const rows=await query('select ordinal,record_meta from mip_history.payload where operation_id=$1 and canonical and record_meta->$2=$3::jsonb',
        [operation_id,'identity',stableStringify(expected.identity)],signal)
      if(rows.length!==1 || !same(rows[0].record_meta,expected)) fail('unit_mapping')
      result.push(String(rows[0].ordinal))
    }
    return result
  }
  async function acquire(operation_id,{signal}={}) {
    return safe(async()=>{
      await guard(signal)
      const rows=await query('select mip_history.acquire($1) as state',[operation_id],signal)
      return {state:rows[0].state}
    })
  }
  async function seal(operation_id,{manifest_limits,signal}={}) {
    return safe(async()=>{
      const route=await guard(signal)
      const exports=await query('select state,raw_inventory,manifest_text,manifest_sha256 from mip_history.export where operation_id=$1',[operation_id],signal)
      if(exports.length!==1) fail('original_export_unavailable')
      if(exports[0].state==='sealed') return {state:'sealed',manifest_sha256:exports[0].manifest_sha256}
      const raw=exports[0].raw_inventory,snapshots=[],records=[]
      for(const project of [PROJECTS.nie,PROJECTS.yhb]) {
        const captured=raw[project]
        if(!captured) fail('closure_contract')
        const inventory=textJson(captured.inventory_json),descriptor=textJson(captured.descriptor_json)
        if(descriptor.readonly!=='on'||descriptor.isolation!=='repeatable read') fail('original_export_changed')
        if(!Array.isArray(inventory.object_inventory)||inventory.object_inventory.length)
          fail('object_capture_unqualified')
        if(!same([...inventory.categories].sort(),[...CATEGORIES].sort())||
          !same(Object.keys(inventory.family_counts).sort(),Object.keys(FIELD_CONTRACTS[project]).sort())||
          inventory.closure?.complete!==true||inventory.closure?.unsupported_families?.length!==0)
          fail('closure_contract')
        const snapshot_sha256=fingerprintPayload({project,descriptor,contract_sha256:captured.contract_sha256})
        const sourceRecords=[]
        let last='0'
        for(;;) {
          // One payload at a time during canonicalization; immutable raw attempt
          // already resides in qik. Never reconnect to a current source row.
          const batch=await query('select ordinal,project,table_name,native_identity_json,native_version_json,roots_json,dependencies_json,body,canonical,record_meta from mip_history.payload where operation_id=$1 and project=$2 and ordinal>$3::bigint order by ordinal limit 1',
            [operation_id,project,last],signal)
          if(!batch.length) break
          const row=batch[0]
          let value
          if(row.canonical) value={meta:row.record_meta,payload_json:Buffer.from(row.body).toString('utf8')}
          else value=canonicalRecord(row,snapshot_sha256)
          if(value.meta.snapshot_sha256!==snapshot_sha256) fail('original_export_changed')
          await query('select mip_history.canonicalize($1,$2,$3,$4::jsonb)',
            [operation_id,row.ordinal,Buffer.from(value.payload_json),stableStringify(value.meta)],signal)
          sourceRecords.push(value.meta);last=String(row.ordinal)
        }
        for(const table of Object.keys(FIELD_CONTRACTS[project])) {
          if(sourceRecords.filter(r=>r.identity.table===table).length!==inventory.family_counts[table])
            fail('closure_contract')
        }
        const snapshot={project,snapshot_sha256,inventory_sha256:fingerprintPayload({
          captured_inventory:inventory,records:sourceRecords}),root_article_ids:inventory.roots,
          inventoried_categories:inventory.categories}
        snapshots.push(snapshot);records.push(...sourceRecords)
      }
      const input={version:VERSION,destination_project:PROJECTS.qik,snapshots,records,objects:[]}
      const {plan}=assertCapacity(route,input,manifest_limits)
      await query('select mip_history.seal($1,$2,$3)',
        [operation_id,stableStringify(plan.manifest),plan.manifest_sha256],signal)
      return {state:'sealed',manifest_sha256:plan.manifest_sha256}
    })
  }
  async function resume(operation_id,{manifest_limits,max_units=1,max_material_bytes,timeout_ms=30000}={}) {
    return safe(async()=>{
      const route=await guard(),exported=await original(operation_id)
      const {input,manifest_sha256}=exported
      const {units}=assertCapacity(route,input,manifest_limits)
      if(route.route_sha256!==exported.route_sha256 || route.authorization_sha256!==exported.authorization_sha256)
        fail('route_unqualified')
      const byUnit=new Map(units.map(u=>[u.unit_id,u]))
      async function fence(signal) {
        await guard(signal)
        const current=await original(operation_id,signal)
        if(current.manifest_sha256!==manifest_sha256 || current.manifest_text!==exported.manifest_text)
          fail('original_export_changed')
      }
      const sources=Object.fromEntries(input.snapshots.map(snapshot=>[snapshot.project,{
        async withFrozenSnapshot(request,callback) {
          if(!same(request.snapshot,snapshot)||request.manifest_sha256!==manifest_sha256||
            request.route_sha256!==exported.route_sha256) fail('original_export_changed')
          await fence(request.signal)
          const reader={
            async checkFence({signal}) { await fence(signal);return {project:snapshot.project,
              snapshot_sha256:snapshot.snapshot_sha256,inventory_sha256:snapshot.inventory_sha256,
              route_sha256:exported.route_sha256,read_only:true,stable:true,resume_exact:true} },
            async readInventory({signal}) { await fence(signal);return {snapshot,
              records:input.records.filter(r=>r.identity.project===snapshot.project),
              objects:input.objects.filter(o=>o.project===snapshot.project)} },
            async readRecords({rows,fields,max_bytes,signal}) {
              const candidate=units.find(u=>u.kind==='records'&&u.project===snapshot.project&&
                same(u.rows,rows)&&same(u.fields,fields)&&u.bytes===max_bytes)
              if(!candidate) fail('unit_mapping')
              return wire(await rowsByOrdinal(operation_id,await mapping(operation_id,candidate,signal),signal))
            },
            async readObject() { fail('object_capture_unqualified') },
          }
          const result=await callback(reader)
          await fence(request.signal)
          return result
        },
      }]))
      const sink={
        async readUnit({operation_id:op,manifest_sha256:sha,unit_id,max_bytes,signal}) {
          const unit=byUnit.get(unit_id)
          if(op!==operation_id||sha!==manifest_sha256||!unit||unit.bytes!==max_bytes) fail('unit_mapping')
          const rows=await query('select manifest_sha256,unit_sha256,ordinals,receipt from mip_history.unit where operation_id=$1 and unit_id=$2',[operation_id,unit_id],signal)
          if(!rows.length) return {state:'absent',operation_id,manifest_sha256,unit_id}
          const committed=rows[0],expected=await mapping(operation_id,unit,signal)
          if(committed.manifest_sha256!==manifest_sha256||committed.unit_sha256!==unit.unit_sha256||
            !same(committed.ordinals.map(String),expected)) fail('unit_conflict')
          // Independent storage read, never an echo of putUnit's supplied content.
          const records=wire(await rowsByOrdinal(operation_id,expected,signal))
          return {state:'committed',operation_id,manifest_sha256,unit_id,receipt:committed.receipt,records}
        },
        async putUnit({operation_id:op,manifest_sha256:sha,unit,content,signal}) {
          if(op!==operation_id||sha!==manifest_sha256||!same(byUnit.get(unit.unit_id),unit)) fail('unit_mapping')
          const ordinals=await mapping(operation_id,unit,signal)
          if(!same(content,wire(await rowsByOrdinal(operation_id,ordinals,signal)))) fail('unit_conflict')
          const receipt={operation_id,manifest_sha256,unit_id:unit.unit_id,
            unit_sha256:unit.unit_sha256,retention:'private_pending',
            commit_sha256:fingerprintPayload({operation_id,manifest_sha256,unit_id:unit.unit_id,ordinals})}
          await query('select mip_history.commit_unit($1,$2,$3,$4,$5::bigint[],$6::jsonb)',
            [operation_id,manifest_sha256,unit.unit_id,unit.unit_sha256,ordinals,stableStringify(receipt)],signal)
          return receipt
        },
      }
      const checkpoints={
        async load({operation_id:op,signal}) {
          if(op!==operation_id) fail('checkpoint_prefix')
          const rows=await query('select value from mip_history.checkpoint where operation_id=$1',[operation_id],signal)
          if(!rows.length) return null
          const checkpoint=rows[0].value
          // Bind the entire previously verified prefix to immutable unit receipts.
          for(const [i,entry] of checkpoint.verified_units.entries()) {
            if(entry.unit_id!==units[i]?.unit_id) fail('checkpoint_prefix')
            const commits=await query('select receipt from mip_history.unit where operation_id=$1 and unit_id=$2',
              [operation_id,entry.unit_id],signal)
            if(commits.length!==1||fingerprintPayload(commits[0].receipt)!==entry.receipt_sha256)
              fail('checkpoint_prefix')
          }
          return checkpoint
        },
        async compareAndSwap({operation_id:op,expected_sha256,checkpoint,signal}) {
          if(op!==operation_id) fail('checkpoint_prefix')
          const rows=await query('select mip_history.cas_checkpoint($1,$2,$3::jsonb) as stored',
            [operation_id,expected_sha256,stableStringify(checkpoint)],signal)
          return rows[0].stored?{state:'stored',checkpoint_sha256:checkpoint.sha256}:{state:'conflict'}
        },
      }
      const admission={async verify(request) {
        await fence(request.signal)
        return {version:TRANSFER_VERSION,mode:'owner_approved_private',operation_id,manifest_sha256,
          destination_project:PROJECTS.qik,authorization_sha256:exported.authorization_sha256,
          route_sha256:exported.route_sha256,
          source_capabilities:Object.fromEntries(input.snapshots.map(s=>[s.project,[...SOURCE_CAPABILITIES]])),
          sink_capabilities:[...SINK_CAPABILITIES],checkpoint_capabilities:['durable_metadata_only','compare_and_swap'],
          manifest_limits:request.manifest_limits,manifest_totals:request.manifest_totals}
      }}
      return transferHistoricalArticles({input,operation_id,manifest_limits,admission,sources,sink,checkpoints,
        max_units,...(max_material_bytes===undefined?{}:{max_material_bytes}),timeout_ms})
    })
  }
  return Object.freeze({acquire,seal,resume})
}
