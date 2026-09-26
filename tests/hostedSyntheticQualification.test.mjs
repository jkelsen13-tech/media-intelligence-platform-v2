import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {verifyWorkloadIdentity} from '../supabase/qualification/mip-cutover-authority/workloadIdentity.js'
import {
 DISPOSABLE_AUDIENCE,DISPOSABLE_IMPLEMENTATION,DISPOSABLE_ISSUER,DISPOSABLE_KID,
 DISPOSABLE_PRINCIPAL,DISPOSABLE_RUNTIME,generateDisposableWorkloadKey,
 liveHs256WorkerJwtSpec,mintWorkloadRs256,runDisposableOperatorOneshot,shapeWorkerJwt
} from '../supabase/qualification/hosted-synthetic/60_disposable_credential_session.mjs'
import {assertRouteAShape} from '../supabase/qualification/hosted-synthetic/61_broker_connection_adapter.mjs'
import {
 HOSTED_SYNTHETIC_INSTALL,cleanupHostedSynthetic,installHostedSynthetic,
 recoverPublicSourceWindow,stripOuterTransaction
} from '../supabase/qualification/hosted-synthetic/installHostedSynthetic.mjs'
import {
 INDEX_ENV_NAMES,INVOKE_TOKEN,LIVE_EVENT_ID,LIVE_MARKER,PACKAGE_ROLES,
 PUBLIC_SOURCE_RELATIONS,QIK_REF,SYNTHETIC_RELATIONS,columnPrivilege,
 createHostedSyntheticDb,emptyInvoke,functionExecute,hostedSyntheticHost,
 privilege,stubPublicSource,workerFetchImpl
} from './hostedSyntheticFixture.mjs'

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const SNAPSHOT_SIG='comparison_qualification.source_snapshot(jsonb,text)'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

test('adapter does not grant snapshot execute to service_role',async()=>{
 const sql=await read('supabase/qualification/hosted-synthetic/10_synthetic_source_adapter.sql')
 const cleanup=await read('supabase/qualification/hosted-synthetic/90_cleanup.sql')
 assert.match(sql,/synthetic_events/)
 assert.doesNotMatch(sql,/^\s*grant execute\b/im)
 assert.doesNotMatch(sql,/\b(?:from|join)\s+public\.(events|articles|event_articles|pipeline_config)\b/i)
 assert.doesNotMatch(cleanup,/revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public/i)
 assert.doesNotMatch(cleanup,/\bdrop\s+(?:table|schema|function|view|role)\b[^;]*\bcascade\b/i)
 assert.doesNotMatch(cleanup,/alter\s+table\b[^;]*\bdisable\s+trigger/i)
 assert.doesNotMatch(cleanup,/delete\s+from\s+\w*\.?journal/i)
 assert.doesNotMatch(cleanup,/drop\s+table\s+public\./i)
})

test('install order skips fixture/snapshot and names live qik ref plus index env',async()=>{
 const order=await read('supabase/qualification/hosted-synthetic/00_INSTALL_ORDER.md')
 const pkg=await read('supabase/qualification/hosted-synthetic/HOSTED_SYNTHETIC_OPERATION_PACKAGE.md')
 const creds=await read('supabase/qualification/hosted-synthetic/40_credential_operators.md')
 const index=await read('supabase/functions/source-comparison-generation-candidate/index.ts')
 for(const text of [order,pkg,creds])assert.match(text,new RegExp(QIK_REF))
 assert.match(order,/SKIP.*source-fixture/)
 assert.match(order,/SKIP.*source-snapshot/)
 assert.match(order,/one transaction/)
 assert.match(pkg,/LIVE HOLD/)
 assert.match(pkg,/I authorize one bounded hosted-synthetic qualification operation/)
 assert.doesNotMatch(creds,/jwt\.io/i)
 assert.match(creds,/createHmac/)
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
 assert.match(spec.signer,/owner-machine/)
})

test('7 operator utility with disposable signing material',()=>{
 assert.throws(()=>shapeWorkerJwt(''),/hosted_synthetic_worker_jwt_role/)
 const shaped=shapeWorkerJwt()
 assert.equal(assertRouteAShape(shaped).role,DISPOSABLE_PRINCIPAL)
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
})

test('2 pre-existing package role is refused; unrelated grant is preserved',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await db.exec('create role mip_kernel_owner_v2 nologin nosuperuser nobypassrls')
 await assert.rejects(installHostedSynthetic(db,{until:0}),/hosted_synthetic_preexisting_role/)
})

test('2 unrelated public SELECT grant survives install and cleanup',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await db.exec('create role unrelated_reader nologin nosuperuser nobypassrls')
 await db.exec('grant select on public.events to unrelated_reader')
 await installHostedSynthetic(db)
 assert.equal(await privilege(db,'unrelated_reader','public.events'),true)
 await cleanupHostedSynthetic(db)
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname='unrelated_reader'")).rows[0].n,1)
 assert.equal(await privilege(db,'unrelated_reader','public.events'),true)
 assert.equal((await db.query("select canonical_title from public.events where id=$1",[LIVE_EVENT_ID])).rows[0]
  .canonical_title,LIVE_MARKER)
})

test('3 failure between 005 and 20 leaves no residual package public SELECT after recovery',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await db.exec('create role unrelated_reader nologin nosuperuser nobypassrls')
 await db.exec('grant select on public.events to unrelated_reader')
 await installHostedSynthetic(db,{until:11,atomicWindow:false})
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),true)
 await recoverPublicSourceWindow(db)
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),false)
 assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.events','canonical_title'),false)
 assert.equal(await privilege(db,'unrelated_reader','public.events'),true)
 await cleanupHostedSynthetic(db)
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname='mip_kernel_owner_v2'")).rows[0].n,0)
 assert.equal(await privilege(db,'unrelated_reader','public.events'),true)
})

test('3 atomic 005-20 wrapper rolls back so 005 grants never commit',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await installHostedSynthetic(db,{until:10})
 await db.exec('begin')
 await db.exec(stripOuterTransaction(await read('supabase/qualification/mip-cutover-authority/005_broker_sessions.sql')))
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),true)
 await db.exec('rollback')
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname='mip_kernel_owner_v2'")).rows[0].n,0)
})

test('3 005 SQL commit without capture still recovers table and column SELECT',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await db.exec('create role unrelated_reader nologin nosuperuser nobypassrls')
 await db.exec('grant select on public.events to unrelated_reader')
 await installHostedSynthetic(db,{until:10})
 await db.exec(await read('supabase/qualification/mip-cutover-authority/005_broker_sessions.sql'))
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),true)
 const recorded=(await db.query(`select count(*)::int n from hosted_synthetic_operation.introduced_grants
  where grantee='mip_kernel_owner_v2' and privilege='SELECT'`)).rows[0].n
 assert.equal(recorded,0)
 await recoverPublicSourceWindow(db)
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),false)
 assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.events','canonical_title'),false)
 assert.equal(await privilege(db,'unrelated_reader','public.events'),true)
})

test('3 recovery clears leftover column SELECT after table revoke',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await installHostedSynthetic(db,{until:11,atomicWindow:false})
 await db.exec('revoke select on public.events from mip_kernel_owner_v2')
 await db.exec('grant select (canonical_title) on public.events to mip_kernel_owner_v2')
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),false)
 assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.events','canonical_title'),true)
 await recoverPublicSourceWindow(db)
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),false)
 assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.events','canonical_title'),false)
})

test('cleanup revokes authenticator membership of a created worker role',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await db.exec('create role authenticator nologin nosuperuser nobypassrls')
 await installHostedSynthetic(db)
 await db.exec('grant mip_comparison_worker_v1 to authenticator')
 await cleanupHostedSynthetic(db)
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname='mip_comparison_worker_v1'")).rows[0].n,0)
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname='authenticator'")).rows[0].n,1)
})

test('5 residual column-only SELECT is denied after 20',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await installHostedSynthetic(db,{until:11,atomicWindow:false})
 await db.exec('revoke select on public.events from mip_kernel_owner_v2')
 await db.exec('grant select (canonical_title) on public.events to mip_kernel_owner_v2')
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),false)
 assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.events','canonical_title'),true)
 await installHostedSynthetic(db,{from:12,until:12,atomicWindow:false})
 assert.equal(await privilege(db,'mip_kernel_owner_v2','public.events'),false)
 assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.events','canonical_title'),false)
 await db.exec('set role mip_kernel_owner_v2')
 try{
  await assert.rejects(db.query('select canonical_title from public.events'),/permission denied/)
 }finally{await db.exec('reset role')}
 await db.exec('grant select (canonical_title) on public.events to mip_kernel_owner_v2')
 await assert.rejects(cleanupHostedSynthetic(db),/hosted_synthetic_residual_public_column_select/)
 await db.exec('rollback')
 assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.events','canonical_title'),true)
})

test('5 inherited column-only SELECT makes 20 refuse without touching PUBLIC',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await installHostedSynthetic(db,{until:11,atomicWindow:false})
 await db.exec('create role inherit_col_parent nologin nosuperuser nobypassrls')
 await db.exec('grant inherit_col_parent to mip_kernel_owner_v2')
 await db.exec('grant select (canonical_title) on public.events to inherit_col_parent')
 await assert.rejects(
  installHostedSynthetic(db,{from:12,until:12,atomicWindow:false}),
  /hosted_synthetic_public_column_select_not_revoked/)
 await db.exec('rollback')
 assert.equal(await columnPrivilege(db,'inherit_col_parent','public.events','canonical_title'),true)
 assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.events','canonical_title'),true)
 const pub=(await db.query(`
  select count(*)::int n from information_schema.role_table_grants
  where table_schema='public' and table_name='events' and grantee='PUBLIC' and privilege_type='SELECT'`)).rows[0].n
 assert.equal(pub,0)
})

test('1 unexpected postgres-owned object in a package schema makes cleanup refuse',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await installHostedSynthetic(db)
 await db.exec('create table comparison_qualification.foreign_leftover(id int)')
 await assert.rejects(cleanupHostedSynthetic(db),/hosted_synthetic_unexpected_object/)
 await db.exec('rollback')
 assert.equal((await db.query("select to_regclass('comparison_qualification.foreign_leftover') is not null as ok")).rows[0].ok,true)
 assert.equal((await db.query("select to_regnamespace('comparison_qualification') is not null as ok")).rows[0].ok,true)
})

test('4 6 7 short producer lifetime, install/process/cleanup regression, disposable operator',async t=>{
 const db=await createHostedSyntheticDb(t)
 await stubPublicSource(db)
 await installHostedSynthetic(db)

 const life=(await db.query(`select extract(epoch from (producer_expires_at-clock_timestamp()))::int sec,
  producer_expires_at::text exp, producer_session_id::text sid
  from hosted_synthetic_operation.operation`)).rows[0]
 assert.ok(life.sec>0 && life.sec<=15*60,String(life.sec))
 assert.doesNotMatch(life.exp,/2999/)
 assert.match(life.sid,UUID)

 const snapDef=(await db.query(
  "select pg_get_functiondef('comparison_qualification.source_snapshot(jsonb,text)'::regprocedure) def"
 )).rows[0].def
 assert.match(snapDef,/synthetic_events/)
 assert.doesNotMatch(snapDef,/public\.events/)

 for(const rel of PUBLIC_SOURCE_RELATIONS){
  for(const role of PACKAGE_ROLES){
   assert.equal(await privilege(db,role,'public.'+rel),false,`${role} public.${rel}`)
  }
  const col=rel==='pipeline_config'?'key':rel==='event_articles'?'event_id':'id'
  assert.equal(await columnPrivilege(db,'mip_kernel_owner_v2','public.'+rel,col),false,rel)
 }
 for(const rel of SYNTHETIC_RELATIONS){
  assert.equal(await privilege(db,'mip_kernel_owner_v2','comparison_qualification.'+rel),true,rel)
  assert.equal(await privilege(db,'mip_kernel_owner_v2','comparison_qualification.'+rel,'INSERT'),false,rel)
 }
 assert.equal(await functionExecute(db,'service_role',SNAPSHOT_SIG),false)
 assert.equal(await functionExecute(db,'mip_comparison_producer_owner_v1',SNAPSHOT_SIG),true)

 const gen=(await db.query(`select source_project,input_payload::text input
  from comparison_qualification.generations`)).rows
 assert.equal(gen.length,1)
 assert.equal(gen[0].source_project,'hosted-synthetic-qik')
 assert.doesNotMatch(gen[0].input,new RegExp(LIVE_MARKER))

 const issued=await runDisposableOperatorOneshot(db)
 assert.match(issued.session,UUID)
 assert.equal(issued.session.split('.').length,1)
 assert.equal(assertRouteAShape(issued.workerJwtShape).role,DISPOSABLE_PRINCIPAL)

 const calls=[]
 const host=hostedSyntheticHost(db,{session:issued.session,
  fetchImpl:workerFetchImpl(db,{onCall:c=>calls.push(c)})})
 assert.equal((await host(new Request('https://qualification.invalid/worker',{
  method:'POST',duplex:'half',
  headers:{authorization:'Bearer '+INVOKE_TOKEN,'content-length':'1'},
  body:new ReadableStream({pull(c){c.enqueue(new Uint8Array([1]));c.close()}})}))).status,400)
 assert.equal((await host(new Request('https://qualification.invalid/worker',{method:'POST'}))).status,403)
 const completed=await host(emptyInvoke())
 assert.equal(completed.status,200,await completed.clone().text())
 assert.deepEqual(await completed.json(),{state:'completed'})
 assert.equal((await db.query('select state from comparison_qualification.jobs')).rows[0].state,'completed')
 assert.equal((await db.query('select implementation_ref from comparison_qualification.generations')).rows[0]
  .implementation_ref,DISPOSABLE_IMPLEMENTATION)
 const idle=await host(emptyInvoke())
 assert.deepEqual(await idle.json(),{state:'idle'})

 await cleanupHostedSynthetic(db)
 assert.equal((await db.query("select canonical_title from public.events where id=$1",[LIVE_EVENT_ID])).rows[0]
  .canonical_title,LIVE_MARKER)
 assert.equal((await db.query("select to_regnamespace('comparison_qualification') n")).rows[0].n,null)
 assert.equal((await db.query("select to_regnamespace('hosted_synthetic_operation') n")).rows[0].n,null)
 assert.equal((await db.query("select count(*)::int n from pg_roles where rolname='mip_kernel_owner_v2'")).rows[0].n,0)
})
