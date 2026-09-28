import {capacityFailureStage,capacityFailureCode} from './historicalQikCapacityMetrics.mjs'
import { Buffer } from 'node:buffer'
import process from 'node:process'
globalThis.Buffer ??= Buffer
globalThis.process ??= process
const fail=()=>{throw Error('capacity_probe_failed')}
let client,receipt,failed=false,stage='bootstrap',failureCode='probe_failure'
try {
 if(Deno.version.deno!=='2.5.2'||Deno.env.get('MIP_HISTORICAL_EXECUTOR_DISPOSABLE')!=='synthetic-pg17-only')fail()
 stage='input'
 let text='',bytes=0
 const decoder=new TextDecoder('utf-8',{fatal:true})
 for await(const chunk of Deno.stdin.readable){bytes+=chunk.length;if(bytes>32*1024*1024)fail();text+=decoder.decode(chunk,{stream:true})}
 text+=decoder.decode()
 const c=JSON.parse(text);text=''
 stage='imports'
 const {fingerprintPayload}=await import('../scripts/mipLegacyGraphStaging.mjs')
 const engine=await import('../scripts/mipHistoricalArticleTransfer.mjs')
 if(c.mode==='metadata'){
  stage='metadata_input'
  if(c.syntheticFixture!==true||c.input.records.length!==32768||c.input.objects.length)fail()
  const {PROJECTS}=await import('../scripts/mipHistoricalArticleTransferPlan.mjs')
  const limits={records:32768,objects:1,bytes:128*1024*1024}
  let checkpoint=null,inventoryReads=0
  const hash=fingerprintPayload({synthetic:'capacity-only'})
  const sources=Object.fromEntries(c.input.snapshots.map(snapshot=>[snapshot.project,{
   async withFrozenSnapshot(request,work){return work({
    async checkFence(){return {project:snapshot.project,snapshot_sha256:snapshot.snapshot_sha256,
     inventory_sha256:snapshot.inventory_sha256,route_sha256:hash,read_only:true,stable:true,resume_exact:true}},
    async readInventory(){inventoryReads++;return {snapshot,records:c.input.records.filter(r=>r.identity.project===snapshot.project),objects:[]}},
    async readRecords(){fail()},async readObject(){fail()}
   })}
  }]))
  stage='metadata_plan'
  const units=engine.planHistoricalTransferUnits(c.input,limits)
  if(!units.length||units.some(u=>u.bytes<2))fail()
  const results=[]
  for(let run=0;run<2;run++){
   stage='metadata_engine'
   const result=await engine.transferHistoricalArticles({input:c.input,operation_id:c.operation_id,
    manifest_limits:limits,max_units:1,max_material_bytes:1,timeout_ms:10000,sources,
    admission:{async verify(r){stage='metadata_admission';return {version:engine.TRANSFER_VERSION,mode:'synthetic_test_only',
     operation_id:r.operation_id,manifest_sha256:r.manifest_sha256,destination_project:PROJECTS.qik,
     authorization_sha256:hash,route_sha256:hash,
     source_capabilities:Object.fromEntries(c.input.snapshots.map(s=>[s.project,[...engine.SOURCE_CAPABILITIES]])),
     sink_capabilities:[...engine.SINK_CAPABILITIES],checkpoint_capabilities:['durable_metadata_only','compare_and_swap'],
     manifest_limits:r.manifest_limits,manifest_totals:r.manifest_totals}}},
    sink:{async readUnit(){fail()},async putUnit(){fail()}},
    checkpoints:{async load(){stage='metadata_checkpoint';return checkpoint},async compareAndSwap(r){
     stage='metadata_checkpoint'
     if(r.expected_sha256!==(checkpoint?.sha256??null))fail()
     checkpoint=structuredClone(r.checkpoint);return {state:'stored',checkpoint_sha256:checkpoint.sha256}}}
   })
   stage='metadata_result';failureCode=capacityFailureCode(result.code)
   if(result.state!=='unit_exceeds_budget'||result.pending_unit_id!==units[0].unit_id||
    result.verified_this_invocation!==0||result.material_bytes_this_invocation!==0)fail()
   results.push({state:result.state,pending_unit_id:result.pending_unit_id})
  }
  stage='metadata_inventory'
  if(inventoryReads!==8||checkpoint.verified_units.length!==0)fail()
  stage='metadata_receipt'
  receipt={status:'passed',scope:'metadata_two_invocations_one_process',records:32768,
   units:units.length,inventory_reads:inventoryReads,manifest_sha256:fingerprintPayload(c.input),
   deterministic_retry:results[0].pending_unit_id===results[1].pending_unit_id,hosted_edge_qualified:false}
 }else{
  stage='postgres_input'
  if(c.mode!=='postgres'||c.syntheticFixture!==true||!['refuse','transfer','retry'].includes(c.action))fail()
  const url=new URL(c.connectionString)
  if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='5432'||
   !/^\/mip_hist_qik_[a-f0-9]{12}$/.test(url.pathname)||url.search||url.hash||
   decodeURIComponent(url.username)!=='mip_history_executor'||decodeURIComponent(url.password)!=='mip-historical-fixture-only')fail()
  if(!/^[a-f0-9-]{36}$/.test(c.operation_id)||!/^[a-f0-9]{64}$/.test(c.manifest_sha256))fail()
  stage='postgres_connect'
  const pg=await import('pg')
  client=new pg.default.Client({host:'127.0.0.1',port:5432,database:url.pathname.slice(1),
   user:'mip_history_executor',password:'mip-historical-fixture-only',ssl:false,
   application_name:'mip_historical_capacity_synthetic',connectionTimeoutMillis:3000,statement_timeout:10000})
  client.on('error',()=>{});await client.connect()
  stage='postgres_identity'
  const identity=(await client.query('select session_user::text login,current_user::text effective')).rows[0]
  if(identity.login!=='mip_history_executor'||identity.effective!==identity.login)fail()
  stage='postgres_adapter'
  let bodyQueries=0
  const {createQikHistoricalExecutor}=await import('../supabase/qualification/historical-qik-executor/executor.mjs')
  const adapter=createQikHistoricalExecutor({query:async r=>{
   if(r.text.startsWith('select p.ordinal,octet_length(p.body)'))bodyQueries++
   return client.query({text:r.text,values:r.values})
  }})
  let prefixVerified=0
  if(c.action==='refuse'){
   if(!Number.isSafeInteger(c.prefix_count)||c.prefix_count<0||c.prefix_count>99||
    !Number.isSafeInteger(c.refusal_bytes)||c.refusal_bytes<1||c.refusal_bytes>=10*1024*1024)fail()
   if(c.prefix_count){
    stage='postgres_prefix'
    const prefix=await adapter.resume(c.operation_id,{manifest_limits:{records:10000,objects:100,bytes:10*1024*1024},
     max_units:c.prefix_count,max_material_bytes:10*1024*1024,timeout_ms:20000})
    stage='postgres_prefix_result';failureCode=capacityFailureCode(prefix.code)
    if(prefix.state!=='budget_paused'||prefix.verified_this_invocation!==c.prefix_count)fail()
    prefixVerified=prefix.verified_this_invocation
   }
   bodyQueries=0
  }
  stage='postgres_resume'
  const result=await adapter.resume(c.operation_id,{manifest_limits:{records:10000,objects:100,bytes:10*1024*1024},
   max_units:100,max_material_bytes:c.action==='refuse'?c.refusal_bytes:10*1024*1024,timeout_ms:20000})
  stage='postgres_result';failureCode=capacityFailureCode(result.code)
  if(result.manifest_sha256!==c.manifest_sha256||result.public_processing_authorized!==false)fail()
  if(c.action==='refuse'&&(result.state!=='unit_exceeds_budget'||result.verified_this_invocation!==0||bodyQueries!==0))fail()
  if(c.action==='transfer'&&(result.state!=='readback_verified'||result.verified_this_invocation<1||bodyQueries<3))fail()
  if(c.action==='retry'&&(result.state!=='readback_verified'||result.verified_this_invocation!==0||result.material_bytes_this_invocation!==0||bodyQueries!==0))fail()
  stage='postgres_receipt'
  receipt={status:'passed',scope:c.action,prefix_verified:prefixVerified,state:result.state,verified:result.verified_this_invocation,
   material_bytes:result.material_bytes_this_invocation,pending_unit_id:result.pending_unit_id,
   pending_unit_bytes:result.pending_unit_bytes,checkpoint_sha256:result.checkpoint?.sha256,
   manifest_sha256:result.manifest_sha256,body_queries:bodyQueries,hosted_edge_qualified:false}
 }
}catch(error){failed=true;const code=capacityFailureCode(error?.code);if(code!=='unknown')failureCode=code}
finally{if(client)try{await client.end()}catch{if(!failed){stage='postgres_close';failureCode='probe_failure'}failed=true}}
if(failed||!receipt){console.log(JSON.stringify({status:'failed',code:'capacity_probe_failed',stage:capacityFailureStage(stage),failure_code:capacityFailureCode(failureCode)}));Deno.exitCode=1}
else console.log(JSON.stringify(receipt))
