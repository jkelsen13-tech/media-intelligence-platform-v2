import {parseCapacityResource,capacityFailureStage,capacityFailureCode} from './historicalQikCapacityMetrics.mjs'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {access} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {planHistoricalTransferUnits} from '../scripts/mipHistoricalArticleTransfer.mjs'
import {PROJECTS,VERSION,CATEGORIES,planHistoricalArticles} from '../scripts/mipHistoricalArticleTransferPlan.mjs'
import {fingerprintPayload,stableStringify} from '../scripts/mipLegacyGraphStaging.mjs'

// Imported ONLY from the armed PG17 fixture after ordinary tests finish.
// No route rows or qualifications are inserted or updated by this harness.
export function capacityMetadataFixture(){
 const root='20000000-0000-4000-8000-000000000001'
 const snapshots=[PROJECTS.nie,PROJECTS.yhb].map(project=>({project,
  snapshot_sha256:fingerprintPayload({synthetic:project}),
  inventory_sha256:fingerprintPayload({synthetic_inventory:project}),
  root_article_ids:[root],inventoried_categories:[...CATEGORIES]}))
 const records=[]
 for(const snapshot of snapshots)for(let i=0;i<16384;i++){
  records.push({identity:{project:snapshot.project,table:i===0?'articles':'article_claims',
   source_id:i===0?fingerprintPayload({id:root}):fingerprintPayload({synthetic_native:i}),
   version_sha256:fingerprintPayload({synthetic_version:i})},
   snapshot_sha256:snapshot.snapshot_sha256,payload_sha256:fingerprintPayload({synthetic_payload:i}),
   payload_bytes:128,root_article_ids:[root],dependencies:[]})
 }
 // Engine inventory equality compares canonical order, including categories.
 // Canonical fixture generation is outside measurement; each measured invocation
 // still repeats the unchanged engine's planning/sorting/hashing.
 return planHistoricalArticles({version:VERSION,destination_project:PROJECTS.qik,snapshots,records,objects:[]},
  {records:32768,objects:1,bytes:128*1024*1024}).manifest
}
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const fail=()=>{throw Error('capacity_qualification_failed')}
export async function runHistoricalQikCapacity({sources,qik,executor,adapter}){
 if(process.platform!=='linux'||process.env.MIP_HISTORICAL_EXECUTOR_DISPOSABLE!=='synthetic-pg17-only')fail()
 const binary=process.env.DENO_BINARY,cache=process.env.DENO_DIR
 if(!binary?.startsWith('/')||!cache?.startsWith('/'))fail()
 // Fail unavailable; never install another runtime or substitute a claimed measurement.
 await access('/usr/bin/time')
 const parameters=executor.raw.connectionParameters
 if(parameters.host!=='127.0.0.1'||Number(parameters.port)!==5432||
  !/^mip_hist_qik_[a-f0-9]{12}$/.test(parameters.database)||
  parameters.user!=='mip_history_executor'||parameters.password!=='mip-historical-fixture-only')fail()
 const root=fileURLToPath(new URL('..',import.meta.url))
 const config=fileURLToPath(new URL('../supabase/functions/native-comparison-display/deno.json',import.meta.url))
 const lock=fileURLToPath(new URL('../supabase/functions/native-comparison-display/deno.lock',import.meta.url))
 const childPath=fileURLToPath(new URL('./historicalQikCapacityDeno.mjs',import.meta.url))
 const url=new URL('postgresql://127.0.0.1:5432/'+parameters.database)
 url.username=parameters.user;url.password=parameters.password
 const receipts=[]
 let runs=0,stage='bootstrap'
 async function measured(input){
  if(++runs>4)fail()
  const wire=JSON.stringify(input);if(Buffer.byteLength(wire)>32*1024*1024)fail()
  const value=await new Promise((resolve,reject)=>{
   const child=spawn('/usr/bin/time',['-f','CAPACITY_RESOURCE %U %S %M %e',binary,
    'run','--cached-only','--frozen','--lock='+lock,'--config='+config,
    '--node-modules-dir=none','--no-prompt','--allow-read='+root+','+cache,
    '--allow-env','--allow-net=127.0.0.1:5432',childPath],
    {cwd:root,detached:true,env:{PATH:process.env.PATH??'',DENO_DIR:cache,
     DENO_NO_UPDATE_CHECK:'1',NO_COLOR:'1',MIP_HISTORICAL_EXECUTOR_DISPOSABLE:'synthetic-pg17-only'},
     stdio:['pipe','pipe','pipe']})
   let out='',err='',bad=false
   const kill=()=>{bad=true;try{process.kill(-child.pid,'SIGKILL')}catch{child.kill('SIGKILL')}}
   const timer=setTimeout(kill,60000)
   child.stdout.on('data',b=>{out+=b.toString();if(Buffer.byteLength(out)>4096)kill()})
   child.stderr.on('data',b=>{err+=b.toString();if(Buffer.byteLength(err)>65536)kill()})
   child.stdin.on('error',kill)
   child.on('error',()=>{clearTimeout(timer);reject(Object.assign(Error('capacity_measurement_unavailable'),{code:'measurement_unavailable'}))})
   child.on('close',code=>{
    clearTimeout(timer)
    let measurement
    try{measurement=parseCapacityResource(err)}catch{}
    let parsed
    try{parsed=JSON.parse(out)}catch{}
    if(bad||code!==0||parsed?.status!=='passed'){
     const failure=Object.assign(Error('capacity_child_failed'),{
      code:bad?'child_killed':parsed?.status==='failed'?'probe_failure':'child_exit',
      child_stage:capacityFailureStage(parsed?.stage),
      child_code:capacityFailureCode(parsed?.failure_code)})
     if(measurement)failure.measurement=measurement
     reject(failure);return
    }
    if(parsed.hosted_edge_qualified!==false||!measurement){
     reject(Object.assign(Error('capacity_child_receipt_failed'),{code:!measurement?'measurement_invalid':'child_receipt'}));return
    }
    resolve({...parsed,measurement})
   })
   child.stdin.end(wire)
  })
  receipts.push(value);return value
 }
 const count=async()=>Number((await qik.query({text:"select count(*)::int n from pg_stat_activity where datname=$1 and usename='mip_history_executor' and application_name='mip_historical_capacity_synthetic'",values:[parameters.database]})).rows[0].n)
 const baseline=await count()
 let primary,sourceCleanupFailed=false
 try{
  // Build expanded synthetic METADATA outside the measured process.
  // One root/project with many related versions is intentional, not actual topology.
  stage='metadata_generate'
  const input=capacityMetadataFixture()
  stage='metadata_child'
  const metadata=await measured({mode:'metadata',syntheticFixture:true,operation_id:randomUUID(),input})
  stage='metadata_assert'
  assert.equal(metadata.manifest_sha256,fingerprintPayload(input))
  assert.equal(metadata.inventory_reads,8)
  // Exactly one bounded large synthetic row is added; existing fixture rows stay.
  const id='20000000-0000-4000-8000-000000000002'
  let inserted=false
  try{
   stage='body_insert'
   await sources[PROJECTS.yhb].query({text:"insert into public.articles(id,title,body_text) values($1,'synthetic capacity',repeat('x',8388608))",values:[id]})
   inserted=true
   const operation=randomUUID()
   stage='body_acquire'
   assert.equal((await adapter.acquire(operation)).state,'acquired')
   const limits={records:10000,objects:100,bytes:10*1024*1024}
   // Acquisition and canonical sealing are deliberately outside process metrics.
   stage='body_seal'
   let sealed
   for(let i=0;i<4;i++){
    sealed=await adapter.seal(operation,{manifest_limits:limits,max_canonical_records:100,max_canonical_bytes:24*1024*1024})
    if(sealed.state==='sealed')break
    assert.equal(sealed.state,'canonicalization_paused')
   }
   assert.equal(sealed.state,'sealed')
   stage='body_manifest'
   const manifest=(await qik.query({text:'select manifest_text from mip_history.export where operation_id=$1',values:[operation]})).rows[0]
   const units=planHistoricalTransferUnits(JSON.parse(manifest.manifest_text),limits)
   assert.ok(units.length>1&&units.length<=100)
   const largest=Math.max(...units.map(u=>u.bytes))
   assert.ok(largest>=8388608&&largest<10*1024*1024)
   const payloadSql="select ordinal::text ordinal,octet_length(body)::int bytes,encode(sha256(body),'hex') sha256,record_meta->>'payload_sha256' expected_sha256,(record_meta->>'payload_bytes')::int expected_bytes from mip_history.payload where operation_id=$1 order by ordinal"
   stage='body_readback_before'
   const before=(await qik.query({text:payloadSql,values:[operation]})).rows
   assert.ok(before.every(r=>r.bytes===r.expected_bytes&&r.sha256===r.expected_sha256))
   const base={mode:'postgres',syntheticFixture:true,connectionString:url.href,operation_id:operation,manifest_sha256:sealed.manifest_sha256}
   const largestIndex=units.findIndex(u=>u.bytes===largest)
   stage='body_refusal_child'
   const refusal=await measured({...base,action:'refuse',prefix_count:largestIndex,refusal_bytes:largest-1})
   stage='body_refusal_assert'
   assert.equal(refusal.pending_unit_id,units[largestIndex].unit_id)
   assert.equal(refusal.pending_unit_bytes,largest)
   assert.equal((await qik.query({text:'select count(*)::int n from mip_history.unit where operation_id=$1',values:[operation]})).rows[0].n,largestIndex)
   stage='body_transfer_child'
   const transfer=await measured({...base,action:'transfer'})
   stage='body_transfer_assert'
   assert.equal(transfer.verified,units.length-largestIndex)
   stage='body_retry_child'
   const retry=await measured({...base,action:'retry'})
   stage='body_retry_assert'
   assert.equal(retry.checkpoint_sha256,transfer.checkpoint_sha256)
   stage='body_readback_after'
   assert.equal(digest((await qik.query({text:payloadSql,values:[operation]})).rows),digest(before))
   const stored=(await qik.query({text:'select unit_id,unit_sha256,manifest_sha256,receipt from mip_history.unit where operation_id=$1',values:[operation]})).rows
   assert.equal(stored.length,units.length)
   stage='body_checkpoint'
   const checkpoint=(await qik.query({text:'select value from mip_history.checkpoint where operation_id=$1',values:[operation]})).rows[0].value
   const {sha256,...body}=checkpoint
   assert.equal(sha256,fingerprintPayload(body));assert.equal(sha256,retry.checkpoint_sha256)
   assert.equal(checkpoint.verified_units.length,units.length)
   units.forEach((unit,i)=>{
    const found=stored.filter(r=>r.unit_id===unit.unit_id&&r.unit_sha256===unit.unit_sha256&&r.manifest_sha256===sealed.manifest_sha256)
    assert.equal(found.length,1)
    assert.deepEqual(checkpoint.verified_units[i],{unit_id:unit.unit_id,receipt_sha256:fingerprintPayload(found[0].receipt)})
   })
   receipts.push({scope:'independent_sql_readback',records:before.length,largest_unit_bytes:largest,
    manifest_bytes:Buffer.byteLength(manifest.manifest_text),payload_digest:digest(before),
    hosted_edge_qualified:false})
  }catch(error){primary=error;throw error}
  finally{
   if(inserted)try{await sources[PROJECTS.yhb].query({text:'delete from public.articles where id=$1',values:[id]})}
   catch{sourceCleanupFailed=true;if(!primary){stage='body_cleanup';throw Error('capacity_cleanup_failed')}}
  }
 }catch(error){
  const code=error?.code==='ERR_ASSERTION'?'assertion_failed':capacityFailureCode(error?.code)
  const childStage=capacityFailureStage(error?.child_stage),childCode=capacityFailureCode(error?.child_code)
  primary=Object.assign(Error('capacity_'+capacityFailureStage(stage)+'_'+code+
   (childStage!=='unknown'?'_child_'+childStage+'_'+childCode:'')),{
   stage:capacityFailureStage(stage),code,
   child_stage:capacityFailureStage(error?.child_stage),child_code:capacityFailureCode(error?.child_code)})
  // This object is constructed solely from the strict local measurement parser.
  if(error?.measurement)primary.measurement=error.measurement
  if(sourceCleanupFailed){primary.cleanup_stage='body_cleanup';primary.message+='_cleanup_body_cleanup'}
 }
 let restored=false
 try{
  for(let i=0;i<100;i++){
   if(await count()===baseline){restored=true;break}
   await new Promise(resolve=>setTimeout(resolve,10))
  }
 }catch{}
 if(!restored){
  if(primary){primary.cleanup_stage='session_cleanup';primary.message+='_cleanup_session_cleanup';throw primary}
  throw Error('capacity_session_cleanup_failed')
 }
 if(primary)throw primary
 return {status:'passed',scope:'synthetic_measurement_only',receipts,session_cleanup_observed:true,
  hosted_edge_qualified:false,required_frozen_scope_fit:'unproved',
  limitations:['GNU time has centisecond CPU resolution; whole cold process is not hosted request CPU',
   'metadata fixture exercises real engine planning/inventory/refusal twice; not PostgreSQL mapping at 32768 rows',
   '8MiB-plus unit is measured; 128MiB unit and actual frozen largest unit remain unmeasured',
   'existing fictional fixture admission is a branch prerequisite, never measured route qualification',
   'acquisition/seal, hosted Auth/TLS/Vault, actual topology and object bodies are excluded']}
}
