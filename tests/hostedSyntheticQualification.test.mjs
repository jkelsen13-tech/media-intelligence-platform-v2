import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {verifyWorkloadIdentity} from '../supabase/qualification/mip-cutover-authority/workloadIdentity.js'
import {
 DISPOSABLE_AUDIENCE,DISPOSABLE_IMPLEMENTATION,DISPOSABLE_ISSUER,DISPOSABLE_KID,
 DISPOSABLE_PRINCIPAL,DISPOSABLE_RUNTIME,generateDisposableWorkloadKey,
 issueDisposableWorkerSession,liveHs256WorkerJwtSpec,mintWorkloadRs256,shapeWorkerJwt
} from '../supabase/qualification/hosted-synthetic/60_disposable_credential_session.mjs'
import {
 HOSTED_SYNTHETIC_INSTALL,INDEX_ENV_NAMES,INVOKE_TOKEN,LIVE_EVENT_ID,LIVE_MARKER,
 PACKAGE_ROLES,PUBLIC_SOURCE_RELATIONS,QIK_REF,SYNTHETIC_RELATIONS,
 cleanupPackage,createHostedSyntheticDb,emptyInvoke,execInstall,functionExecute,
 hostedSyntheticHost,privilege,stubPublicSource,workerFetchImpl
} from './hostedSyntheticFixture.mjs'

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const SNAPSHOT_SIG='comparison_qualification.source_snapshot(jsonb,text)'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

test('adapter does not grant snapshot execute to service_role',async()=>{
 const sql=await read('supabase/qualification/hosted-synthetic/10_synthetic_source_adapter.sql')
 assert.match(sql,/synthetic_events/)
 assert.doesNotMatch(sql,/grant execute[\s\S]*to service_role/i)
 assert.doesNotMatch(sql,/public\.events/)
})

test('install order skips fixture/snapshot and names live qik ref plus index env',async()=>{
 const order=await read('supabase/qualification/hosted-synthetic/00_INSTALL_ORDER.md')
 const pkg=await read('supabase/qualification/hosted-synthetic/HOSTED_SYNTHETIC_OPERATION_PACKAGE.md')
 const creds=await read('supabase/qualification/hosted-synthetic/40_credential_operators.md')
 const index=await read('supabase/functions/source-comparison-generation-candidate/index.ts')
 for(const text of [order,pkg,creds])assert.match(text,new RegExp(QIK_REF))
 assert.match(order,/SKIP.*source-fixture/)
 assert.match(order,/SKIP.*source-snapshot/)
 assert.match(order,/20_grant_rebind\.sql/)
 assert.match(order,/must run \*\*after\*\* 005/)
 for(const step of HOSTED_SYNTHETIC_INSTALL){
  await read(step.path)
  assert.notEqual(step.id,5)
  assert.notEqual(step.id,6)
 }
 for(const name of INDEX_ENV_NAMES){
  assert.match(index,new RegExp(name))
  assert.match(creds,new RegExp(name))
 }
 const spec=liveHs256WorkerJwtSpec()
 assert.equal(spec.algorithm,'HS256')
 assert.equal(spec.requiredClaim.role,DISPOSABLE_PRINCIPAL)
 assert.equal(spec.signer,'none in-repo')
 assert.match(spec.delivery,/MIP_QIK_WORKER_JWT/)
})

test('disposable Route A is shape-only and Route B RS256 maps via existing verifier',()=>{
 assert.throws(()=>shapeWorkerJwt(''),/hosted_synthetic_worker_jwt_role/)
 const shaped=shapeWorkerJwt()
 const claims=JSON.parse(Buffer.from(shaped.split('.')[1],'base64url').toString('utf8'))
 assert.equal(claims.role,DISPOSABLE_PRINCIPAL)
 assert.notEqual(shaped.split('.').length===3&&UUID.test(shaped),true)
 const {privateKey,publicJwk}=generateDisposableWorkloadKey()
 const now=100
 const token=mintWorkloadRs256({privateKey,kid:DISPOSABLE_KID,iss:DISPOSABLE_ISSUER,
  aud:DISPOSABLE_AUDIENCE,sub:DISPOSABLE_RUNTIME+':'+DISPOSABLE_PRINCIPAL,now,exp:now+500})
 const identity=verifyWorkloadIdentity({token,policy:{
  issuer:DISPOSABLE_ISSUER,audience:DISPOSABLE_AUDIENCE,maxLifetimeSeconds:600,
  keys:[{kid:DISPOSABLE_KID,jwk:publicJwk,validFrom:0,validUntil:1000}],
  mappings:[{subject:DISPOSABLE_RUNTIME+':'+DISPOSABLE_PRINCIPAL,runtime:DISPOSABLE_RUNTIME,
   principal:DISPOSABLE_PRINCIPAL,authorizationRevision:'rev'}]
 },now:150})
 assert.equal(identity.runtime,DISPOSABLE_RUNTIME)
 assert.equal(identity.principal,DISPOSABLE_PRINCIPAL)
 assert.throws(()=>verifyWorkloadIdentity({token,policy:{
  issuer:DISPOSABLE_ISSUER,audience:DISPOSABLE_AUDIENCE,maxLifetimeSeconds:600,
  keys:[{kid:DISPOSABLE_KID,jwk:publicJwk,validFrom:0,validUntil:1000}],
  mappings:[{subject:DISPOSABLE_RUNTIME+':'+DISPOSABLE_PRINCIPAL,runtime:DISPOSABLE_RUNTIME,
   principal:DISPOSABLE_PRINCIPAL,authorizationRevision:'rev'}]
 },now:800}),/denied/)
})

test('hosted-synthetic install isolates public source, issues UUID session, empty POST, cleanup',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await execInstall(db,{until:11})
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),true,
  '005 still grants public SELECT; 20 must revoke it')
 await execInstall(db,{from:12,until:17})

 const snapDef=(await db.query(
  "select pg_get_functiondef('comparison_qualification.source_snapshot(jsonb,text)'::regprocedure) def"
 )).rows[0].def
 assert.match(snapDef,/synthetic_events/)
 assert.doesNotMatch(snapDef,/public\.events/)

 for(const rel of PUBLIC_SOURCE_RELATIONS){
  for(const role of PACKAGE_ROLES){
   assert.equal(await privilege(db,role,'public.'+rel),false,`${role} public.${rel}`)
  }
 }
 for(const rel of SYNTHETIC_RELATIONS){
  assert.equal(await privilege(db,'mip_kernel_owner_v2','comparison_qualification.'+rel),true,rel)
  assert.equal(await privilege(db,'mip_kernel_owner_v2','comparison_qualification.'+rel,'INSERT'),false,rel)
  assert.equal(await privilege(db,'mip_comparison_worker_v1','comparison_qualification.'+rel),false,rel)
  assert.equal(await privilege(db,'service_role','comparison_qualification.'+rel),false,rel)
 }
 assert.equal(await functionExecute(db,'service_role',SNAPSHOT_SIG),false)
 assert.equal(await functionExecute(db,'mip_comparison_worker_v1',SNAPSHOT_SIG),false)
 assert.equal(await functionExecute(db,'mip_comparison_producer_owner_v1',SNAPSHOT_SIG),true)

 await db.exec('set role mip_kernel_owner_v2')
 try{
  await assert.rejects(db.query('select count(*)::int n from public.events'),/permission denied|permission denied for/i)
  const n=(await db.query('select count(*)::int n from comparison_qualification.synthetic_events')).rows[0].n
  assert.equal(n,1)
 }finally{await db.exec('reset role')}

 await db.exec('set role mip_comparison_worker_v1')
 try{
  await assert.rejects(db.query('select count(*)::int n from public.events'),/permission denied/)
  await assert.rejects(db.query('select count(*)::int n from comparison_qualification.synthetic_events'),
   /permission denied/)
 }finally{await db.exec('reset role')}

 const gen=(await db.query(`select source_project,input_payload::text input
  from comparison_qualification.generations`)).rows
 assert.equal(gen.length,1)
 assert.equal(gen[0].source_project,'hosted-synthetic-qik')
 assert.doesNotMatch(gen[0].input,new RegExp(LIVE_MARKER))
 assert.doesNotMatch(gen[0].input,new RegExp(LIVE_EVENT_ID))
 assert.match(gen[0].input,/Council water funding/)
 assert.match(gen[0].input,/9007199254740993/)

 const issued=await issueDisposableWorkerSession(db)
 assert.match(issued.session,UUID)
 assert.equal(issued.session.split('.').length,1)
 const sessRow=(await db.query(
  'select session_id::text id from mip_identity.sessions where session_id=$1::uuid',[issued.session]
 )).rows[0]
 assert.equal(sessRow.id,issued.session)

 const calls=[]
 const host=hostedSyntheticHost(db,{session:issued.session,
  fetchImpl:workerFetchImpl(db,{onCall:c=>calls.push(c)})})

 const bodyDenied=await host(new Request('https://qualification.invalid/worker',{
  method:'POST',duplex:'half',
  headers:{authorization:'Bearer '+INVOKE_TOKEN,'content-length':'1'},
  body:new ReadableStream({pull(c){c.enqueue(new Uint8Array([1]));c.close()}})}))
 assert.equal(bodyDenied.status,400)
 assert.deepEqual(await bodyDenied.json(),{state:'body_denied'})

 const denied=await host(new Request('https://qualification.invalid/worker',{method:'POST'}))
 assert.equal(denied.status,403)
 assert.deepEqual(await denied.json(),{state:'denied'})
 assert.equal(calls.length,0)

 const completed=await host(emptyInvoke())
 assert.equal(completed.status,200,await completed.clone().text())
 assert.deepEqual(await completed.json(),{state:'completed'})
 assert.ok(calls.some(c=>c.name==='worker_journal_pending'))
 assert.ok(calls.some(c=>c.name==='worker_claim'))
 assert.ok(calls.some(c=>c.name==='worker_complete'))
 assert.ok(calls.every(c=>c.headers['content-profile']==='mip_identity'))
 assert.ok(calls.every(c=>c.args.p_runtime===DISPOSABLE_RUNTIME))
 assert.ok(!calls.some(c=>JSON.stringify(c.args).includes(LIVE_MARKER)))

 const job=(await db.query("select state from comparison_qualification.jobs")).rows[0]
 assert.equal(job.state,'completed')
 const out=(await db.query('select output_payload from comparison_qualification.outputs')).rows[0]
 assert.ok(out.output_payload.projection)
 assert.doesNotMatch(JSON.stringify(out.output_payload),new RegExp(LIVE_MARKER))
 assert.equal((await db.query('select implementation_ref from comparison_qualification.generations')).rows[0]
  .implementation_ref,DISPOSABLE_IMPLEMENTATION)

 calls.length=0
 const idle=await host(emptyInvoke())
 assert.equal(idle.status,200)
 assert.deepEqual(await idle.json(),{state:'idle'})

 const liveBefore=(await db.query('select canonical_title from public.events where id=$1',[LIVE_EVENT_ID])).rows[0]
 assert.equal(liveBefore.canonical_title,LIVE_MARKER)
 await cleanupPackage(db)
 const liveAfter=(await db.query('select canonical_title from public.events where id=$1',[LIVE_EVENT_ID])).rows[0]
 assert.equal(liveAfter.canonical_title,LIVE_MARKER)
 assert.equal((await db.query("select to_regnamespace('comparison_qualification') n")).rows[0].n,null)
 assert.equal((await db.query("select to_regnamespace('mip_identity') n")).rows[0].n,null)
 assert.equal((await db.query("select to_regnamespace('mip_cutover_authority') n")).rows[0].n,null)
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname='mip_kernel_owner_v2'")).rows[0].n,0)
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname='mip_comparison_worker_v1'")).rows[0].n,0)
})
