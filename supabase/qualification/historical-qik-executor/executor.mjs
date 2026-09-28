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
// One profile for all pre-allocation checks; it does not replace full-engine measurements.
function profile(route) {
  const q=route?.qualification
  if(route?.project!==PROJECTS.qik||route.qualified!==true||q?.material_host!=='qik_only'||
    q?.engine_sha!=='b5b80ee37c6cd068d17f59b506bab6df70839ea6'||q?.acl_verified!==true||
    q?.cost_ceiling_verified!==true||q?.full_engine_capacity_verified!==true) fail('route_unqualified')
  if(q.runtime!=='qik_edge'||!Number.isFinite(q.measured_cpu_ms)||q.measured_cpu_ms<0||q.measured_cpu_ms>=2000||
    !Number.isFinite(q.measured_peak_bytes)||q.measured_peak_bytes<0||q.measured_peak_bytes>=256*1024*1024||
    !Number.isFinite(q.measured_wall_ms)||q.measured_wall_ms<0||q.measured_wall_ms>=120000||
    !['measured_records','measured_objects','measured_manifest_bytes','measured_max_unit_bytes'].every(k=>Number.isSafeInteger(q[k])&&q[k]>=0)||
    !Number.isSafeInteger(Number(route.max_unit_bytes))||Number(route.max_unit_bytes)<1||Number(route.max_unit_bytes)>134217728||
    !Number.isSafeInteger(Number(route.max_manifest_bytes))||Number(route.max_manifest_bytes)<1) fail('capacity_unqualified')
  return {manifest:Math.min(Number(route.max_manifest_bytes),q.measured_manifest_bytes,268435455),
    body:Math.min(Number(route.max_unit_bytes),q.measured_max_unit_bytes),records:q.measured_records}
}
const bytesWithin=(n,max)=>Number.isSafeInteger(Number(n))&&Number(n)>=0&&Number(n)<=max
export function assertCapacity(route,input,limits) {
  const bound=profile(route),plan=planHistoricalArticles(input,limits),units=planHistoricalTransferUnits(input,limits),q=route.qualification
  if(q.measured_records<plan.manifest.records.length||q.measured_objects<plan.manifest.objects.length||
    !bytesWithin(Buffer.byteLength(stableStringify(plan.manifest)),bound.manifest)||
    units.some(u=>u.bytes>bound.body)) fail('capacity_unqualified')
  if(input.objects.length) fail('object_capture_unqualified')
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
  function bindRoute(route,e) {
    if(route.route_sha256!==e.route_sha256||route.authorization_sha256!==e.authorization_sha256) fail('original_export_changed')
  }
  async function original(operation_id,route,signal) {
    const bound=profile(route)
    // CASE prevents an oversized value from entering the driver/Edge heap.
    const rows=await query('select state,manifest_sha256,route_sha256,authorization_sha256,octet_length(manifest_text) as manifest_bytes,case when octet_length(manifest_text)<=$2 then manifest_text else null end as manifest_text from mip_history.export where operation_id=$1',
      [operation_id,bound.manifest],signal)
    if(rows.length!==1||rows[0].state!=='sealed') fail('original_export_unavailable')
    const e=rows[0];bindRoute(route,e)
    if(!bytesWithin(e.manifest_bytes,bound.manifest)||typeof e.manifest_text!=='string') fail('capacity_unqualified')
    const input=textJson(e.manifest_text)
    if(hash(e.manifest_text)!==e.manifest_sha256||stableStringify(input)!==e.manifest_text) fail('original_export_changed')
    return {...e,input}
  }
  async function sealedFence(operation_id,route,exported,signal) {
    const now=await guard(signal)
    if(!same(now,route)) fail('original_export_changed')
    // Sealed export/payload UPDATE and DELETE are already refused by SQL.
    // No complete manifest or source body is fetched at repeat boundaries.
    const rows=await query('select state,manifest_sha256,route_sha256,authorization_sha256,octet_length(manifest_text) as manifest_bytes from mip_history.export where operation_id=$1',[operation_id],signal)
    if(rows.length!==1||rows[0].state!=='sealed') fail('original_export_unavailable')
    const e=rows[0];bindRoute(route,e)
    if(e.manifest_sha256!==exported.manifest_sha256||Number(e.manifest_bytes)!==Number(exported.manifest_bytes)) fail('original_export_changed')
  }
  async function rowsByOrdinal(operation_id,ordinals,max_bytes,route,signal) {
    const bound=profile(route)
    if(!bytesWithin(max_bytes,bound.body)) fail('capacity_unqualified')
    const rows=await query('select p.ordinal,octet_length(p.body) as body_bytes,case when sum(octet_length(p.body)) over()<=$3 and sum(octet_length(p.record_meta::text)) over()<=$4 then p.body else null end as body,case when sum(octet_length(p.body)) over()<=$3 and sum(octet_length(p.record_meta::text)) over()<=$4 then p.record_meta else null end as record_meta from unnest($2::bigint[]) with ordinality requested(ordinal,position) join mip_history.payload p on p.operation_id=$1 and p.ordinal=requested.ordinal order by requested.position',
      [operation_id,ordinals,max_bytes,bound.manifest],signal)
    if(rows.length!==ordinals.length||rows.some(r=>r.body===null||r.record_meta===null)||
      !bytesWithin(rows.reduce((n,r)=>n+Buffer.byteLength(r.body),0),max_bytes)) fail('capacity_unqualified')
    return rows
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
  async function seal(operation_id,{manifest_limits,max_canonical_records=100,max_canonical_bytes=8388608,signal}={}) {
    return safe(async()=>{
      if(!Number.isSafeInteger(max_canonical_records)||max_canonical_records<1||max_canonical_records>100||
        !Number.isSafeInteger(max_canonical_bytes)||max_canonical_bytes<1||max_canonical_bytes>134217728) fail('capacity_unqualified')
      const route=await guard(signal),bound=profile(route)
      const exports=await query("select state,route_sha256,authorization_sha256,octet_length(raw_inventory::text) as inventory_bytes,encode(sha256(convert_to(raw_inventory::text,'UTF8')),'hex') as inventory_sha256,case when state='acquired' and octet_length(raw_inventory::text)<=$2 then raw_inventory else null end as raw_inventory from mip_history.export where operation_id=$1",
        [operation_id,bound.manifest],signal)
      if(exports.length!==1) fail('original_export_unavailable')
      const initial=exports[0];bindRoute(route,initial)
      if(initial.state==='sealed') {
        const old=await original(operation_id,route,signal)
        await sealedFence(operation_id,route,old,signal)
        return {state:'sealed',manifest_sha256:old.manifest_sha256}
      }
      if(initial.state!=='acquired') fail('original_export_unavailable')
      if(!bytesWithin(initial.inventory_bytes,bound.manifest)||initial.raw_inventory===null) fail('capacity_unqualified')
      const raw=initial.raw_inventory,descriptors=new Map()
      for(const project of [PROJECTS.nie,PROJECTS.yhb]) {
        const captured=raw[project]
        if(!captured) fail('closure_contract')
        const inventory=textJson(captured.inventory_json),descriptor=textJson(captured.descriptor_json)
        if(descriptor.readonly!=='on'||descriptor.isolation!=='repeatable read') fail('original_export_changed')
        if(!Array.isArray(inventory.object_inventory)||inventory.object_inventory.length) fail('object_capture_unqualified')
        if(!same([...inventory.categories].sort(),[...CATEGORIES].sort())||
          !same(Object.keys(inventory.family_counts).sort(),Object.keys(FIELD_CONTRACTS[project]).sort())||
          inventory.closure?.complete!==true||inventory.closure?.unsupported_families?.length!==0) fail('closure_contract')
        const snapshot_sha256=fingerprintPayload({project,descriptor,contract_sha256:captured.contract_sha256})
        descriptors.set(project,{inventory,snapshot_sha256})
        // A resumed original snapshot must agree with every durable canonical row.
        const checked=await query("select count(*)::integer as mismatches from mip_history.payload where operation_id=$1 and project=$2 and canonical and record_meta->>'snapshot_sha256' is distinct from $3",
          [operation_id,project,snapshot_sha256],signal)
        if(checked[0]?.mismatches!==0) fail('original_export_changed')
      }
      async function acquiredFence() {
        const now=await guard(signal)
        if(!same(now,route)) fail('original_export_changed')
        const rows=await query("select state,route_sha256,authorization_sha256,encode(sha256(convert_to(raw_inventory::text,'UTF8')),'hex') as inventory_sha256 from mip_history.export where operation_id=$1",[operation_id],signal)
        if(rows.length!==1||rows[0].state!=='acquired') fail('original_export_changed')
        bindRoute(route,rows[0])
        if(rows[0].inventory_sha256!==initial.inventory_sha256) fail('original_export_changed')
      }
      let processed=0,used=0
      for(;;) {
        await acquiredFence()
        // Existing canonical flag is the durable cursor. No caller-controlled skip.
        const pending=await query('select ordinal,octet_length(body) as body_bytes from mip_history.payload where operation_id=$1 and not canonical order by ordinal limit 1',[operation_id],signal)
        if(!pending.length) break
        const left=max_canonical_bytes-used,rawBytes=Number(pending[0].body_bytes)
        if(!bytesWithin(rawBytes,bound.body)) fail('capacity_unqualified')
        if(processed>=max_canonical_records||rawBytes>left) return {state:processed?'canonicalization_paused':'unit_exceeds_budget'}
        const found=await query('select ordinal,project,table_name,case when octet_length(native_identity_json)+octet_length(native_version_json)+octet_length(roots_json)+octet_length(dependencies_json)<=$4 then native_identity_json else null end as native_identity_json,case when octet_length(native_identity_json)+octet_length(native_version_json)+octet_length(roots_json)+octet_length(dependencies_json)<=$4 then native_version_json else null end as native_version_json,case when octet_length(native_identity_json)+octet_length(native_version_json)+octet_length(roots_json)+octet_length(dependencies_json)<=$4 then roots_json else null end as roots_json,case when octet_length(native_identity_json)+octet_length(native_version_json)+octet_length(roots_json)+octet_length(dependencies_json)<=$4 then dependencies_json else null end as dependencies_json,case when octet_length(body)<=$3 then body else null end as body from mip_history.payload where operation_id=$1 and ordinal=$2 and not canonical',
          [operation_id,pending[0].ordinal,Math.min(left,bound.body),bound.manifest],signal)
        if(found.length!==1) fail('original_export_changed')
        const row=found[0]
        if(row.body===null||row.native_identity_json===null||row.native_version_json===null||row.roots_json===null||row.dependencies_json===null) fail('capacity_unqualified')
        const descriptor=descriptors.get(row.project)
        if(!descriptor) fail('closure_contract')
        const value=canonicalRecord(row,descriptor.snapshot_sha256),outputBytes=Buffer.byteLength(value.payload_json)
        if(outputBytes>bound.body) fail('capacity_unqualified')
        const charged=Buffer.byteLength(row.body)+outputBytes
        if(charged>left) return {state:processed?'canonicalization_paused':'unit_exceeds_budget'}
        await acquiredFence()
        await query('select mip_history.canonicalize($1,$2,$3,$4::jsonb)',
          [operation_id,row.ordinal,Buffer.from(value.payload_json),stableStringify(value.meta)],signal)
        processed++;used+=charged
      }
      await acquiredFence()
      // Complete METADATA remains required by the unchanged planner. CASE bounds
      // the returned set before Edge allocation; no canonical bodies are reread.
      const summary=await query('select count(*)::integer as records,coalesce(sum(octet_length(record_meta::text)),0)::text as metadata_bytes from mip_history.payload where operation_id=$1 and canonical',[operation_id],signal)
      if(!bytesWithin(summary[0]?.records,bound.records)||!bytesWithin(summary[0]?.metadata_bytes,bound.manifest)) fail('capacity_unqualified')
      const rows=await query('select project,case when sum(octet_length(record_meta::text)) over()<=$2 and count(*) over()<=$3 then record_meta else null end as record_meta from mip_history.payload where operation_id=$1 and canonical order by ordinal',
        [operation_id,bound.manifest,bound.records],signal)
      if(rows.length!==summary[0].records||rows.some(r=>r.record_meta===null)) fail('capacity_unqualified')
      const snapshots=[],records=[]
      for(const project of [PROJECTS.nie,PROJECTS.yhb]) {
        const {inventory,snapshot_sha256}=descriptors.get(project)
        const sourceRecords=rows.filter(r=>r.project===project).map(r=>r.record_meta)
        if(sourceRecords.some(r=>r.snapshot_sha256!==snapshot_sha256)) fail('original_export_changed')
        for(const table of Object.keys(FIELD_CONTRACTS[project]))
          if(sourceRecords.filter(r=>r.identity.table===table).length!==inventory.family_counts[table]) fail('closure_contract')
        snapshots.push({project,snapshot_sha256,inventory_sha256:fingerprintPayload({captured_inventory:inventory,records:sourceRecords}),
          root_article_ids:inventory.roots,inventoried_categories:inventory.categories})
        records.push(...sourceRecords)
      }
      if(records.length!==rows.length) fail('closure_contract')
      const input={version:VERSION,destination_project:PROJECTS.qik,snapshots,records,objects:[]}
      const {plan}=assertCapacity(route,input,manifest_limits)
      await acquiredFence()
      await query('select mip_history.seal($1,$2,$3)',[operation_id,stableStringify(plan.manifest),plan.manifest_sha256],signal)
      return {state:'sealed',manifest_sha256:plan.manifest_sha256}
    })
  }
  async function resume(operation_id,{manifest_limits,max_units=1,max_material_bytes,timeout_ms=30000}={}) {
    return safe(async()=>{
      const route=await guard(),exported=await original(operation_id,route)
      const {input,manifest_sha256}=exported
      const {units}=assertCapacity(route,input,manifest_limits)
      if(route.route_sha256!==exported.route_sha256 || route.authorization_sha256!==exported.authorization_sha256)
        fail('route_unqualified')
      const byUnit=new Map(units.map(u=>[u.unit_id,u]))
      const fence=signal=>sealedFence(operation_id,route,exported,signal)
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
              return wire(await rowsByOrdinal(operation_id,await mapping(operation_id,candidate,signal),candidate.bytes,route,signal))
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
          const records=wire(await rowsByOrdinal(operation_id,expected,unit.bytes,route,signal))
          return {state:'committed',operation_id,manifest_sha256,unit_id,receipt:committed.receipt,records}
        },
        async putUnit({operation_id:op,manifest_sha256:sha,unit,content,signal}) {
          if(op!==operation_id||sha!==manifest_sha256||!same(byUnit.get(unit.unit_id),unit)) fail('unit_mapping')
          const ordinals=await mapping(operation_id,unit,signal)
          if(!same(content,wire(await rowsByOrdinal(operation_id,ordinals,unit.bytes,route,signal)))) fail('unit_conflict')
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
