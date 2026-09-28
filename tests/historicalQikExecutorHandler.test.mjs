import test from 'node:test'
import assert from 'node:assert/strict'
import { createHistoricalHandler, restrictedConnection } from '../supabase/qualification/historical-qik-executor/handler.mjs'

const project='qikvmopbtijoebdqosyq'
const token='synthetic-token-only-'.repeat(3)
const url='postgresql://mip_history_executor:synthetic-only@db.'+project+'.supabase.co:5432/postgres'
const operation='11111111-1111-4111-8111-111111111111'
function setup(overrides={}) {
  const env={SUPABASE_URL:'https://'+project+'.supabase.co',MIP_HISTORY_INVOKER_TOKEN:token,
    MIP_HISTORY_EXECUTOR_DB_URL:url,...overrides.env}
  let connected=0,ended=0,called=0,options
  const client={on(){},async connect(){connected++},async end(){ended++},async query(){return {rows:[]}}}
  const handler=createHistoricalHandler({
    readSecret:key=>env[key],
    createClient:value=>{options=value;return overrides.client??client},
    makeExecutor:overrides.makeExecutor??(()=>({
      async acquire(){called++;return {state:'acquired',private_payload:'never_return'}},
      async seal(){called++;return {state:'sealed',manifest_sha256:'never_return'}},
      async resume(){called++;return {state:'readback_verified',checkpoint:{private:'never_return'}}},
    })),
  })
  const request=(body={action:'acquire',operation_id:operation},headers={})=>new Request(
    'https://'+project+'.supabase.co/functions/v1/historical-qik-executor',{
      method:'POST',headers:{'content-type':'application/json','x-mip-history-invoker':token,...headers},
      body:JSON.stringify(body)})
  return {handler,request,stats:()=>({connected,ended,called,options})}
}
test('restricted qik handler requires independent private invoker credential',async()=>{
  const f=setup()
  const result=await f.handler(f.request(undefined,{'x-mip-history-invoker':'invalid'}))
  assert.equal(result.status,401)
  assert.deepEqual(await result.json(),{state:'not_started',code:'unauthorized'})
  assert.equal(f.stats().connected,0)
})
test('privileged default database URL cannot silently become runtime identity',async()=>{
  const f=setup({env:{MIP_HISTORY_EXECUTOR_DB_URL:undefined,SUPABASE_DB_URL:url.replace('mip_history_executor','postgres')}})
  const result=await f.handler(f.request())
  assert.equal(result.status,503);assert.equal((await result.json()).code,'route_unconfigured')
  assert.equal(f.stats().connected,0)
})
test('runtime pins destination, role and TLS even with misleading URI query fields',()=>{
  assert.throws(()=>restrictedConnection(url.replace(project,'anotherproject')))
  assert.throws(()=>restrictedConnection(url.replace('mip_history_executor','postgres')))
  const options=restrictedConnection(url+'?sslmode=disable&host=evil.invalid&user=postgres')
  assert.equal(options.host,'db.'+project+'.supabase.co')
  assert.equal(options.user,'mip_history_executor')
  assert.deepEqual(options.ssl,{rejectUnauthorized:true})
})
test('HTTP accepts only operation/control metadata and strips every material result',async()=>{
  const f=setup()
  const bad=await f.handler(f.request({action:'acquire',operation_id:operation,sql:'select private_material'}))
  assert.equal(bad.status,400);assert.equal(f.stats().connected,0)
  const result=await f.handler(f.request())
  assert.deepEqual(await result.json(),{state:'acquired',code:null})
  assert.equal(f.stats().connected,1);assert.equal(f.stats().ended,1)
})
test('oversized body is refused before opening a database connection',async()=>{
  const f=setup()
  const result=await f.handler(f.request({action:'acquire',operation_id:operation,padding:'x'.repeat(5000)}))
  assert.equal(result.status,400);assert.equal(f.stats().connected,0)
})
test('raw driver errors and secrets never appear in HTTP status payloads',async()=>{
  const f=setup({client:{on(){},async connect(){throw new Error('private credential or article')},async end(){}}})
  const result=await f.handler(f.request())
  assert.deepEqual(await result.json(),{state:'not_started',code:'adapter_operation_failed'})
})
test('client construction failure releases only its own concurrency slot',async()=>{
  let attempts=0
  const env={SUPABASE_URL:'https://'+project+'.supabase.co',MIP_HISTORY_INVOKER_TOKEN:token,MIP_HISTORY_EXECUTOR_DB_URL:url}
  const handler=createHistoricalHandler({readSecret:k=>env[k],createClient:()=>{attempts++;throw new Error('fixture')},
    makeExecutor:()=>{throw new Error('unused')}})
  const f=setup()
  assert.equal((await handler(f.request())).status,503)
  assert.equal((await handler(f.request())).status,503)
  assert.equal(attempts,2)
})

test('seal accepts only bounded canonicalization controls and returns a metadata-only pause',async()=>{
  let received
  const f=setup({makeExecutor:()=>({async seal(id,budget){received={id,budget};return {state:'canonicalization_paused',body:'PRIVATE_SENTINEL'}}})})
  const body={action:'seal',operation_id:operation,manifest_limits:{records:100,objects:100,bytes:100000},
    max_canonical_records:2,max_canonical_bytes:4096}
  assert.deepEqual(await (await f.handler(f.request(body))).json(),{state:'canonicalization_paused',code:null})
  assert.equal(received.id,operation);assert.equal(received.budget.max_canonical_records,2)
  assert.equal(received.budget.max_canonical_bytes,4096)
  for(const patch of [{max_canonical_records:101},{max_canonical_records:0},{max_canonical_bytes:134217729},
    {max_canonical_bytes:'4096'},{cursor:2}]) {
    assert.equal((await f.handler(f.request({...body,...patch}))).status,400)
  }
})
