import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const base = new URL('../supabase/runtime-snapshots/spatial-runtime-v6/', import.meta.url)
const receipt = JSON.parse(readFileSync(new URL('../verifier/spatial-runtime-v6-registration.json', import.meta.url),'utf8'))
const result = await build({
  stdin: {
    contents: 'export * from "./handler.ts"; export * from "./canonical.ts"; export * from "./operations.ts"; export * from "./config.ts";',
    resolveDir: fileURLToPath(base), loader:'ts',
  },
  bundle:true, platform:'node', format:'esm', write:false,
})
const { createHandler, OPERATIONS, validateParams, buildCanonicalArgs, bootConfig, MAX_BODY_BYTES } =
  await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))

const userId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const runId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const params={policy_family_code:'fixture',policy_version:'1',canonical_content:{z:2,a:1},effective_at:'2026-01-01T00:00:00Z'}
const request=(body={operation:'append_policy_artifact',params},headers={})=>new Request('https://fixture.invalid/spatial-runtime',{
  method:'POST',headers:{authorization:'Bearer fixture-only','content-type':'application/json',...headers},body:JSON.stringify(body),
})
function fixture({profile=true,auth=true,failures=[]}={}){
  const calls=[],logs=[],authCalls=[]
  let connects=0,releases=0
  const client={
    async queryObject(sql,args){
      calls.push({sql,args})
      if(sql.includes('mip_profile_exists'))return {rows:[{mip_profile_exists:profile}]}
      if(sql.startsWith('select spatial.') && failures.length)throw {fields:{code:failures.shift()},message:'PRIVATE SQL detail'}
      return {rows:[]}
    },
    release(){releases++},
  }
  const handler=createHandler({
    env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SPATIAL_RUNTIME_ALLOWED_ORIGIN:'https://reader.invalid'},
    pool:{async connect(){connects++;return client}},
    authFetch:async(url,options)=>{authCalls.push({url,options});return new Response(JSON.stringify(auth?{id:userId}:{}),{status:auth?200:401})},
    randomUUID:()=>runId,log:e=>logs.push(e),
  })
  return {handler,calls,logs,authCalls,get connects(){return connects},get releases(){return releases}}
}

test('retrieved spatial source bytes match the observed live registration exactly',()=>{
  assert.equal(receipt.source_only,true)
  assert.equal(receipt.redeployment_ready,false)
  assert.equal(receipt.deployed_version,6)
  assert.equal(receipt.verify_jwt,true)
  assert.deepEqual(readdirSync(base).sort(),receipt.files.map(f=>f.name).sort())
  for(const file of receipt.files){
    assert.equal(createHash('sha256').update(readFileSync(new URL(file.name,base))).digest('hex'),file.sha256,file.name)
  }
})

test('all twelve operation signatures match observed live database names, order and types',()=>{
  assert.equal(Object.keys(OPERATIONS).length,12)
  assert.equal(receipt.catalog.length,12)
  for(const op of Object.values(OPERATIONS)){
    const row=receipt.catalog.find(r=>'spatial.'+r.proname===op.fn)
    assert.ok(row,op.fn)
    assert.equal(row.pronargs,op.arity)
    assert.deepEqual(row.proargnames,op.params.map(p=>p.name))
    const types=op.params.map(p=>p.kind!=='client'?'text':({sha256hex:'text',timestamptz:'timestamp with time zone'}[p.type]??p.type))
    assert.deepEqual(row.argument_types.split(', '),types)
    assert.equal(row.writer_execute,true)
    assert.equal(row.anon_execute,false)
    assert.equal(row.authenticated_execute,false)
    assert.ok(row.proconfig.some(s=>s.startsWith('search_path=')))
    assert.ok(op.params.some(p=>p.name===op.primary && p.kind==='hash'))
  }
})

test('boot uses only the dedicated writer and publishable environment contract',()=>{
  const reads=[]
  const env={SPATIAL_WRITER_DB_URL:'postgres://spatial_writer_runtime:fixture@127.0.0.1/fixture?sslmode=require',SUPABASE_URL:'https://fixture.invalid',SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_publishable_fixture"}'}
  const result=bootConfig(name=>{reads.push(name);return env[name]})
  assert.deepEqual(reads,['SPATIAL_WRITER_DB_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEYS','SPATIAL_RUNTIME_ALLOWED_ORIGIN'])
  assert.equal(result.env.SUPABASE_PUBLISHABLE_KEY,'sb_publishable_fixture')
  assert.throws(()=>bootConfig(name=>({...env,SPATIAL_WRITER_DB_URL:'postgres://postgres:fixture@127.0.0.1/fixture?sslmode=require'})[name]))
  assert.throws(()=>bootConfig(name=>({...env,SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_secret_fixture"}'})[name]))
})

test('missing and rejected authentication never reach the database',async()=>{
  const f=fixture()
  const r=await f.handler(new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))
  assert.equal(r.status,401)
  assert.equal(f.authCalls.length,0)
  const denied=fixture({auth:false})
  assert.equal((await denied.handler(request())).status,401)
  assert.equal(denied.connects,0)
  assert.equal(f.connects,0)
})

test('unknown operations and supplied identities fail before database checkout',async()=>{
  for(const body of [{operation:'not_registered',params:{}},{operation:'append_policy_artifact',params:{...params,run_id:runId}}]){
    const f=fixture()
    assert.equal((await f.handler(request(body))).status,400)
    assert.equal(f.connects,0)
    assert.deepEqual(f.logs,[])
  }
})

test('multibyte body size is bounded independently of a false-low content length',async()=>{
  const f=fixture()
  const response=await f.handler(request({operation:'append_policy_artifact',params:{...params,canonical_content:'é'.repeat(MAX_BODY_BYTES)}},{'content-length':'1'}))
  assert.equal(response.status,413)
  assert.equal(f.connects,0)
})

test('successful append uses parameterized canonical arguments and a server-owned receipt',async()=>{
  const f=fixture()
  const response=await f.handler(request())
  const body=await response.json()
  assert.equal(response.status,200)
  const call=f.calls.find(c=>c.sql.startsWith('select spatial.'))
  assert.equal(call.sql,'select spatial.append_policy_artifact($1,$2,$3,$4,$5,$6,$7,$8)')
  assert.equal(call.args[3],'{"a":1,"z":2}')
  assert.equal(call.args[4],createHash('sha256').update('{"a":1,"z":2}').digest('hex'))
  assert.equal(call.args[7],runId)
  assert.equal(body.fingerprint,call.args[4])
  assert.equal(f.calls.at(-1).sql,'COMMIT')
  assert.equal(f.releases,1)
  assert.deepEqual(Object.keys(f.logs[0]).sort(),['event','run_id','auth_user_id','operation','fingerprint'].sort())
})

test('profile denial rolls back without canonical append or success log',async()=>{
  const f=fixture({profile:false})
  assert.equal((await f.handler(request())).status,403)
  assert.ok(f.calls.some(c=>c.sql==='ROLLBACK'))
  assert.ok(!f.calls.some(c=>c.sql.startsWith('select spatial.')))
  assert.equal(f.releases,1)
  assert.deepEqual(f.logs,[])
})

test('constraint rejection stays sanitized and leaves no committed attempt',async()=>{
  const f=fixture({failures:['23514']})
  const response=await f.handler(request())
  assert.equal(response.status,422)
  assert.deepEqual(await response.json(),{ok:false,code:'CANONICAL_REJECTED'})
  assert.ok(!f.calls.some(c=>c.sql==='COMMIT'))
  assert.equal(f.connects,1)
  assert.equal(f.releases,1)
  assert.deepEqual(f.logs,[])
})

test('serialization retry is bounded to one retry and releases both attempts',async()=>{
  const f=fixture({failures:['40001']})
  assert.equal((await f.handler(request())).status,200)
  assert.equal(f.connects,2)
  assert.equal(f.releases,2)
  assert.equal(f.logs.length,1)
  const failed=fixture({failures:['40001','40001']})
  assert.equal((await failed.handler(request())).status,500)
  assert.equal(failed.connects,2)
  assert.equal(failed.releases,2)
  assert.deepEqual(failed.logs,[])
})

test('content hashes are accepted only by the governed evidence-snapshot operation',async()=>{
  assert.throws(()=>validateParams(OPERATIONS.append_policy_artifact,{...params,content_hash:'a'.repeat(64)}))
  const op=OPERATIONS.append_evidence_snapshot
  const fields=Object.fromEntries(op.params.filter(p=>p.kind==='client').map(p=>[p.key,!p.required?null:({text:'fixture',uuid:userId,jsonb:{fixture:true},integer:0,timestamptz:'2026-01-01T00:00:00Z',sha256hex:'a'.repeat(64)})[p.type]]))
  const validated=validateParams(op,fields)
  const built=await buildCanonicalArgs('append_evidence_snapshot',validated,runId)
  assert.equal(built.args[op.params.findIndex(p=>p.key==='content_hash')],'a'.repeat(64))
  assert.notEqual(built.fingerprint,'a'.repeat(64),'receipt remains server-computed')
})
