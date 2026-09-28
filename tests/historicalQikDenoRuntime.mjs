// Pinned Deno 2.5.2 probe; disposable original PostgreSQL custody only.
// No source acquisition, hosted endpoint, environment credential or production URL.
import {Buffer} from 'node:buffer'
import process from 'node:process'
globalThis.Buffer ??= Buffer
globalThis.process ??= process
const fail=()=>{throw Error('historical_deno_failed')}
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
async function input(){
 const reader=Deno.stdin.readable.getReader(),chunks=[];let size=0
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)fail();chunks.push(value)}}
 finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let at=0
 for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
}
let client,receipt,failed=false
try{
 if(Deno.version.deno!=='2.5.2'||Deno.env.get('MIP_HISTORICAL_EXECUTOR_DISPOSABLE')!=='synthetic-pg17-only')fail()
 const c=await input()
 if(!exact(c,['syntheticFixture','connectionString','operation_id','manifest_sha256'])||c.syntheticFixture!==true||
 typeof c.connectionString!=='string'||c.connectionString.length>2048||!UUID.test(c.operation_id)||!SHA.test(c.manifest_sha256))fail()
 const url=new URL(c.connectionString)
 if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='5432'||
 !/^\/mip_hist_qik_[a-f0-9]{12}$/.test(url.pathname)||url.search||url.hash||
 decodeURIComponent(url.username)!=='mip_history_executor'||decodeURIComponent(url.password)!=='mip-historical-fixture-only')fail()
 if(typeof globalThis.Buffer?.from!=='function'||Buffer.from('A😀é').toString('utf8')!=='A😀é'||
 process.env.MIP_HISTORICAL_EXECUTOR_DISPOSABLE!=='synthetic-pg17-only')fail()
 const pg=await import('pg')
 if(typeof pg.default?.Client!=='function')fail()
 const {createHash}=await import('node:crypto')
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
 const {createQikHistoricalExecutor}=await import('../supabase/qualification/historical-qik-executor/executor.mjs')
 client=new pg.default.Client({host:'127.0.0.1',port:5432,database:url.pathname.slice(1),
 user:'mip_history_executor',password:decodeURIComponent(url.password),ssl:false,
 application_name:'mip_historical_deno_synthetic',connectionTimeoutMillis:3000,statement_timeout:10000})
 client.on('error',()=>{})
 await client.connect()
 const identity=(await client.query('select session_user::text login,current_user::text effective')).rows[0]
 if(identity.login!=='mip_history_executor'||identity.effective!==identity.login)fail()
 const before=(await client.query('select count(*)::int n from mip_history.unit where operation_id=$1',[c.operation_id])).rows[0].n
 if(before!==0)fail()
 let bodyQueries=0
 const adapter=createQikHistoricalExecutor({query:async request=>{
  if(request.text.startsWith('select p.ordinal,octet_length(p.body)'))bodyQueries++
  return client.query({text:request.text,values:request.values})
 }})
 const limits={records:10000,objects:100,bytes:10*1024*1024}
 for(let i=0;i<2;i++){
  const sealed=await adapter.seal(c.operation_id,{manifest_limits:limits})
  if(sealed.state!=='sealed'||sealed.manifest_sha256!==c.manifest_sha256)fail()
 }
 const first=await adapter.resume(c.operation_id,{manifest_limits:limits,max_units:1,timeout_ms:8000})
 if(first.state!=='budget_paused'||first.verified_this_invocation!==1||first.material_bytes_this_invocation<1||
 first.manifest_sha256!==c.manifest_sha256||first.public_processing_authorized!==false)fail()
 const finish=await adapter.resume(c.operation_id,{manifest_limits:limits,max_units:100,timeout_ms:8000})
 if(finish.state!=='readback_verified'||finish.remaining_units!==0||finish.verified_this_invocation<1||
 finish.manifest_sha256!==c.manifest_sha256||finish.public_processing_authorized!==false)fail()
 const retry=await adapter.resume(c.operation_id,{manifest_limits:limits,max_units:100,timeout_ms:8000})
 if(retry.state!=='readback_verified'||retry.verified_this_invocation!==0||retry.material_bytes_this_invocation!==0||
 retry.manifest_sha256!==c.manifest_sha256||retry.public_processing_authorized!==false||bodyQueries<6)fail()
 // Independent real SQL read of stored bytes; only digests/counts leave the child.
 const payload=(await client.query("select ordinal::text ordinal,octet_length(body)::int bytes,encode(sha256(body),'hex') sha256,record_meta->>'payload_sha256' expected_sha256,(record_meta->>'payload_bytes')::int expected_bytes from mip_history.payload where operation_id=$1 order by ordinal",[c.operation_id])).rows
 if(payload.length<2||payload.length>10000||payload.some(r=>r.sha256!==r.expected_sha256||r.bytes!==r.expected_bytes))fail()
 const count=(await client.query('select count(*)::int n from mip_history.unit where operation_id=$1',[c.operation_id])).rows[0].n
 const checkpoint=(await client.query('select value from mip_history.checkpoint where operation_id=$1',[c.operation_id])).rows[0]?.value
 if(!checkpoint||!SHA.test(checkpoint.sha256)||checkpoint.verified_units.length!==count||count!==finish.verified_this_invocation+1)fail()
 receipt={status:'passed',deno:'2.5.2',node_globals:true,pg_import:true,first_verified:1,
 finished_verified:finish.verified_this_invocation,retry_verified:0,body_queries:bodyQueries,
 manifest_sha256:c.manifest_sha256,payload_sha256:digest(payload),records:payload.length,
 payload_bytes:payload.reduce((n,r)=>n+r.bytes,0),units:count,checkpoint_sha256:checkpoint.sha256,
 connection_closed:true,public_processing_authorized:false}
}catch{failed=true}
finally{
 if(client){try{await client.end()}catch{failed=true}}
}
if(failed||!receipt){
 console.log('{"status":"failed","code":"historical_deno_failed"}');Deno.exitCode=1
}else console.log(JSON.stringify(receipt))
