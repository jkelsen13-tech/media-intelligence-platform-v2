import {parseCapacityResource} from './historicalQikCapacityMetrics.mjs'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {access} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {planHistoricalTransferUnits} from '../scripts/mipHistoricalArticleTransfer.mjs'
import {PROJECTS,VERSION,CATEGORIES} from '../scripts/mipHistoricalArticleTransferPlan.mjs'
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
 return {version:VERSION,destination_project:PROJECTS.qik,snapshots,records,objects:[]}
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
 let runs=0
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
   child.on('error',()=>{clearTimeout(timer);reject(Error('capacity_measurement_unavailable'))})
   child.on('close',code=>{
    clearTimeout(timer)
    try{
     if(bad||code!==0)fail()
     const receipt=JSON.parse(out)
     if(receipt.status!=='passed'||receipt.hosted_edge_qualified!==false)fail()
     resolve({...receipt,measurement:parseCapacityResource(err)})
    }catch{reject(Error('capacity_measurement_failed'))}
   })
   child.stdin.end(wire)
  })
  receipts.push(value);return value
 }
 const count=async()=>Number((await qik.query({text:"select count(*)::int n from pg_stat_activity where datname=$1 and usename='mip_history_executor' and application_name='mip_historical_capacity_synthetic'",values:[parameters.database]})).rows[0].n)
 const baseline=await count()
 let primary
 try{
  // Build expanded synthetic METADATA outside the measured process.
  // One root/project with many related versions is intentional, not actual topology.
  const input=capacityMetadataFixture()
  const metadata=await measured({mode:'metadata',syntheticFixture:true,operation_id:randomUUID(),input})
  assert.equal(metadata.manifest_sha256,fingerprintPayload(input))
  assert.equal(metadata.inventory_reads,8)
  // Exactly one bounded large synthetic row is added; existing fixture rows stay.
  const id='20000000-0000-4000-8000-000000000002'
  let inserted=false
  try{
   await sources[PROJECTS.yhb].query({text:"insert into public.articles(id,title,body_text) values($1,'synthetic capacity',repeat('x',8388608))",values:[id]})
   inserted=true
   const operation=randomUUID()
   assert.equal((await adapter.acquire(operation)).state,'acquired')
   const limits={records:10000,objects:100,bytes:10*1024*1024}
   // Acquisition and canonical sealing are deliberately outside process metrics.
   let sealed
   for(let i=0;i<4;i++){
    sealed=await adapter.seal(operation,{manifest_limits:limits,max_canonical_records:100,max_canonical_bytes:24*1024*1024})
    if(sealed.state==='sealed')break
    assert.equal(sealed.state,'canonicalization_paused')
   }
   assert.equal(sealed.state,'sealed')
   const manifest=(await qik.query({text:'select manifest_text from mip_history.export where operation_id=$1',values:[operation]})).rows[0]
   const units=planHistoricalTransferUnits(JSON.parse(manifest.manifest_text),limits)
   assert.ok(units.length>1&&units.length<=100)
   const largest=Math.max(...units.map(u=>u.bytes))
   assert.ok(largest>=8388608&&largest<10*1024*1024)
   const payloadSql="select ordinal::text ordinal,octet_length(body)::int bytes,encode(sha256(body),'hex') sha256,record_meta->>'payload_sha256' expected_sha256,(record_meta->>'payload_bytes')::int expected_bytes from mip_history.payload where operation_id=$1 order by ordinal"
   const before=(await qik.query({text:payloadSql,values:[operation]})).rows
   assert.ok(before.every(r=>r.bytes===r.expected_bytes&&r.sha256===r.expected_sha256))
   const base={mode:'postgres',syntheticFixture:true,connectionString:url.href,operation_id:operation,manifest_sha256:sealed.manifest_sha256}
   const largestIndex=units.findIndex(u=>u.bytes===largest)
   const refusal=await measured({...base,action:'refuse',prefix_count:largestIndex,refusal_bytes:largest-1})
   assert.equal(refusal.pending_unit_id,units[largestIndex].unit_id)
   assert.equal(refusal.pending_unit_bytes,largest)
   assert.equal((await qik.query({text:'select count(*)::int n from mip_history.unit where operation_id=$1',values:[operation]})).rows[0].n,largestIndex)
   const transfer=await measured({...base,action:'transfer'})
   assert.equal(transfer.verified,units.length-largestIndex)
   const retry=await measured({...base,action:'retry'})
   assert.equal(retry.checkpoint_sha256,transfer.checkpoint_sha256)
   assert.equal(digest((await qik.query({text:payloadSql,values:[operation]})).rows),digest(before))
   const stored=(await qik.query({text:'select unit_id,unit_sha256,manifest_sha256,receipt from mip_history.unit where operation_id=$1',values:[operation]})).rows
   assert.equal(stored.length,units.length)
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
  }finally{if(inserted)await sources[PROJECTS.yhb].query({text:'delete from public.articles where id=$1',values:[id]})}
 }catch{primary=Error('capacity_qualification_failed')}
 let restored=false
 for(let i=0;i<100;i++){
  if(await count()===baseline){restored=true;break}
  await new Promise(resolve=>setTimeout(resolve,10))
 }
 if(!restored)throw Error('capacity_session_cleanup_failed')
 if(primary)throw primary
 return {status:'passed',scope:'synthetic_measurement_only',receipts,session_cleanup_observed:true,
  hosted_edge_qualified:false,required_frozen_scope_fit:'unproved',
  limitations:['GNU time has centisecond CPU resolution; whole cold process is not hosted request CPU',
   'metadata fixture exercises real engine planning/inventory/refusal twice; not PostgreSQL mapping at 32768 rows',
   '8MiB-plus unit is measured; 128MiB unit and actual frozen largest unit remain unmeasured',
   'existing fictional fixture admission is a branch prerequisite, never measured route qualification',
   'acquisition/seal, hosted Auth/TLS/Vault, actual topology and object bodies are excluded']}
}
