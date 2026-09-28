// Actual PG helper for the FULL main/012 + native caller synthetic fixture.
// Main C9 stages native SQL as root; the separate nonsuper v6 installer fixture
// proves restricted installation and actual removal of both creator leases.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateDisplay} from '../supabase/qualification/native-comparison-display/displayContract.mjs';
const READ='select mip_native_caller.read_current($1,$2,$3,$4,$5,$6) result';
const CONFIG='select mip_native_caller.configure_admission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)';
const OWNER_CONFIG='select mip_native_caller.configure($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)';
async function assertDenoCaller({gateway,db,login,expected,user,session,exp,value}){
 if(process.env.MIP_DISPOSABLE_POSTGRES!=='qik-native-caller')throw Error('native_caller_deno_not_armed');
 const binary=process.env.DENO_BINARY,cache=process.env.DENO_DIR,parameters=gateway.connectionParameters;
 if(typeof binary!=='string'||!binary.startsWith('/')||typeof cache!=='string'||!cache.startsWith('/'))throw Error('native_caller_deno_missing_runtime');
 if(!parameters||parameters.host!=='127.0.0.1'||Number(parameters.port)!==5432||parameters.database!=='postgres'
 ||parameters.user!==login||typeof parameters.password!=='string'||!parameters.password)throw Error('native_caller_deno_connection_refused');
 const url=new URL('postgresql://127.0.0.1:5432/postgres');url.username=login;url.password=parameters.password;
 const context={syntheticFixture:true,connectionString:url.href,expectedLogin:login,selection:expected,user,session,exp};
 const root=fileURLToPath(new URL('..',import.meta.url));
 const config=fileURLToPath(new URL('../supabase/functions/native-comparison-display/deno.json',import.meta.url));
 const lock=fileURLToPath(new URL('../supabase/functions/native-comparison-display/deno.lock',import.meta.url));
 const harness=fileURLToPath(new URL('./nativeComparisonDenoRuntime.mjs',import.meta.url));
 const count=async()=>Number((await db.query("select count(*)::int n from pg_stat_activity where usename=$1 and application_name='mip-cnc-authenticated-qualification'",[login])).rows[0].n);
 const baseline=await count();
 let receipt=null,operationError=null;
 try{
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(binary,['run','--cached-only','--frozen','--lock='+lock,'--config='+config,'--node-modules-dir=none',
    '--no-prompt','--allow-read='+root+','+cache,'--allow-env','--allow-net=127.0.0.1:5432',harness],{
    cwd:root,env:{PATH:process.env.PATH??'',DENO_DIR:cache,DENO_NO_UPDATE_CHECK:'1',NO_COLOR:'1',MIP_DISPOSABLE_POSTGRES:'qik-native-caller'},
    stdio:['pipe','pipe','pipe']});
   let output='',stderrBytes=0,failed=false,settled=false;
   const refuse=()=>{failed=true;child.kill('SIGKILL')};
   const timer=setTimeout(refuse,30000);
   child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(Buffer.byteLength(output)>2048)refuse()});
   child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;if(stderrBytes>65536)refuse()});
   child.stdin.on('error',()=>{failed=true});
   child.on('error',()=>{if(settled)return;settled=true;clearTimeout(timer);reject(Error('native_caller_deno_spawn_failed'))});
   child.on('close',code=>{
    if(settled)return;settled=true;clearTimeout(timer);
    if(failed||code!==0){reject(Error('native_caller_deno_runtime_failed'));return}
    try{resolve(JSON.parse(output))}catch{reject(Error('native_caller_deno_receipt_failed'))}
   });
   // The only credential-bearing bytes are written to the child's stdin.
   child.stdin.end(JSON.stringify(context));
  });
  assert.deepEqual(Object.keys(result).sort(),['deno','dto_sha256','http_status','index_unavailable','node_globals','pg_import','status'].sort());
  assert.equal(result.status,'passed');assert.equal(result.deno,'2.5.2');assert.equal(result.http_status,200);
  assert.equal(result.index_unavailable,true);assert.equal(result.node_globals,true);assert.equal(result.pg_import,true);
  assert.equal(result.dto_sha256,createHash('sha256').update(JSON.stringify(value),'utf8').digest('hex'));
  receipt=result;
 }catch(error){operationError=error}
 // A child may have been killed while connected. Independently require its
 // actual pg session to disappear; any cleanup uncertainty fails this check.
 let restored=false;
 for(let i=0;i<100;i++){if(await count()===baseline){restored=true;break}await new Promise(resolve=>setTimeout(resolve,10))}
 if(!restored){const error=Error('native_caller_deno_connection_cleanup_failed');error.callerCleanupFailed=true;throw error}
 if(operationError)throw operationError;
 return receipt;
}

export async function assertNativeComparisonCaller(fx){
 assert.equal(fx.syntheticFixture,true);
 const {db,admin,gateway,outsider,worker,binding,broker,id,openAdmin,verifyMainBoundary}=fx;
 assert.equal(typeof admin?.query,'function');
 for(const f of [id,openAdmin,verifyMainBoundary,fx.withRevokedBinding,fx.withRevokedBroker])assert.equal(typeof f,'function');
 const expected={scope:binding.scope,binding_id:binding.binding_id,manifest_hash:binding.manifest_hash};
 const user=id(92001),session=id(92002),other=id(92003),start='2026-01-01T00:00:00Z',end='2099-01-01T00:00:00Z';
 const exp=Math.floor(Date.now()/1000)+3600;
 const login=(await gateway.query('select session_user::text login')).rows[0].login;
 const source=await readFile(new URL('../supabase/qualification/native-comparison-caller/001_admission.sql',import.meta.url),'utf8');
 const begin=source.indexOf('do $native_caller_final$'),finish=source.indexOf('end $native_caller_final$;',begin);
 assert.ok(begin>0&&finish>begin);const boundary=source.slice(begin,finish+'end $native_caller_final$;'.length);
 const read=async(client=gateway,over=[])=>{
  const args=[user,session,exp,expected.scope,expected.binding_id,expected.manifest_hash];
  for(const [i,v]of over)args[i]=v;
  return (await client.query(READ,args)).rows[0].result;
 };
 let revision=null,n=92100,checks=0,seeded=false,primary=null,adminLogin=null,priorCanDecide=null,membershipTouched=false;
 const membership=async()=>{const rows=(await db.query('select can_decide from mip_mentions.members where scope=$1 and principal=$2',[expected.scope,adminLogin])).rows;assert.ok(rows.length<=1);return rows.length?rows[0].can_decide:null};
 const setAdminMembership=review=>admin.query('select mip_mentions.set_membership($1,$2::name,$3)',[expected.scope,adminLogin,review]);
 async function configure({active=true,brokerSession=broker.session,runtime=broker.runtime,previous=revision,revisionId=id(++n),validUntil=end}={}){
  const args=[revisionId,previous,user,expected.scope,expected.binding_id,expected.manifest_hash,login,brokerSession,runtime,start,validUntil,active];
  // Operational admission uses the actual independent admin SCRAM login.
  // No installer owner lease or SET ROLE is available to this path.
  await admin.query(CONFIG,args);
  revision=revisionId;return args;
 }
 async function check(fn){
  const stage=++checks;
  try{await fn()}catch(e){
   const state=/^[A-Z0-9]{5}$/.test(e?.code??'')?e.code:'NONE';
   const frame=String(e?.stack??'').split('\n').slice(1).flatMap(x=>x.match(/nativeComparisonCallerPostgresAssertions\.mjs:\d{1,6}:\d{1,6}/g)??[]).slice(0,3).join(' ');
   throw Error('native_caller_check_'+stage+' SQLSTATE='+state+' '+frame+(e?.callerCleanupFailed===true?' cleanup=failed':''));
  }
 }
 const denied=e=>e.code==='P0001',acl=e=>e.code==='42501';
 try{
 await check(async()=>{
  // This proves actual selected 012 exists; no fixture-made replacement helper.
  assert.ok((await db.query("select to_regprocedure('mip_identity.efta_assert_live_auth_session(uuid,uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,uuid,text)') is not null installed")).rows[0].installed);
  await verifyMainBoundary(boundary);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[session])).rows[0].n,0);
  await db.query('insert into auth.sessions(id,user_id,not_after) values($1,$2,$3)',[session,user,end]);seeded=true;
  await assert.rejects(read(),denied);
  const identity=(await admin.query("select session_user::text login,current_user::text effective,pg_has_role(session_user,'mip_mentions_admin','MEMBER') administrator,pg_has_role(session_user,'mip_mentions_owner','MEMBER') owner_lease")).rows[0];
  assert.equal(identity.login,identity.effective);assert.equal(identity.administrator,true);assert.equal(identity.owner_lease,false);
  adminLogin=identity.login;priorCanDecide=await membership();
  assert.ok(priorCanDecide===null||typeof priorCanDecide==='boolean');
  // Only this admin's permission on the fixture binding scope is changed.
  membershipTouched=true;
  await setAdminMembership(false);await assert.rejects(configure(),denied);
  await setAdminMembership(null);await assert.rejects(configure(),denied);
  assert.equal((await db.query('select count(*)::int n from mip_native_caller.admissions where subject_id=$1',[user])).rows[0].n,0);
  await setAdminMembership(true);
 });
 await check(async()=>{
  const args=await configure();
  await admin.query(CONFIG,args);
  assert.equal((await db.query('select count(*)::int n from mip_native_caller.admissions where subject_id=$1',[user])).rows[0].n,1);
  const value=validateDisplay(await read(),expected);
  const original=(await gateway.query('select mip_native_display.read_current($1,$2,$3,$4,$5) result',
   [expected.scope,expected.binding_id,expected.manifest_hash,broker.session,broker.runtime])).rows[0].result;
  assert.deepEqual(value,validateDisplay(original,expected));
  assert.equal(JSON.stringify(value).includes(user),false);assert.equal(JSON.stringify(value).includes(session),false);
  assert.equal(JSON.stringify(value).includes(broker.session),false);
  await assertDenoCaller({gateway,db,login,expected,user,session,exp,value});
 });
 await check(async()=>{
  for(const over of [[[0,other]],[[1,other]],[[2,1]],[[3,other]],[[4,other]],[[5,'0'.repeat(64)]]])await assert.rejects(read(gateway,over),denied);
  await db.query("update auth.sessions set not_after='2000-01-01' where id=$1",[session]);
  try{await assert.rejects(read(),denied)}finally{await db.query('update auth.sessions set not_after=$2 where id=$1',[session,end])}
  await db.query('delete from auth.sessions where id=$1',[session]);
  try{await assert.rejects(read(),denied)}finally{await db.query('insert into auth.sessions(id,user_id,not_after) values($1,$2,$3)',[session,user,end])}
  await db.query('update auth.sessions set not_after=null where id=$1',[session]);
  try{validateDisplay(await read(),expected)}finally{await db.query('update auth.sessions set not_after=$2 where id=$1',[session,end])}
 });
 await check(async()=>{
  const revoked=await configure({active:false});await assert.rejects(read(),denied);
  await configure();validateDisplay(await read(),expected);
  // Exact retry of the old revoked revision never moves the current head.
  const current=revision;
  await admin.query(CONFIG,revoked);
  assert.equal((await db.query('select revision from mip_native_caller.heads where subject_id=$1',[user])).rows[0].revision,current);
  await configure({brokerSession:other});await assert.rejects(read(),denied);await configure();
  await configure({runtime:'synthetic-wrong-runtime'});await assert.rejects(read(),denied);await configure();
  await configure({validUntil:'2026-01-02T00:00:00Z'});await assert.rejects(read(),denied);await configure();
 });
 await check(async()=>{
  for(const c of [gateway,outsider,worker]){
   await assert.rejects(c.query('select * from mip_native_caller.admissions'),acl);
   await assert.rejects(c.query('select * from mip_native_caller.heads'),acl);
   await assert.rejects(c.query(CONFIG,[id(++n),revision,user,expected.scope,expected.binding_id,expected.manifest_hash,login,broker.session,broker.runtime,start,end,true]),acl);
  }
  // The old owner-only configure remains unavailable even to the operational
  // admin; the scoped wrapper is the sole ordinary configuration surface.
  for(const c of [admin,gateway,outsider,worker])await assert.rejects(c.query(OWNER_CONFIG,
   [id(++n),revision,user,expected.scope,expected.binding_id,expected.manifest_hash,login,broker.session,broker.runtime,start,end,true]),acl);
  for(const c of [outsider,worker])await assert.rejects(read(c),acl);
 });
 await check(async()=>{
  // Rollback-only synthetic mutations use the fixture administrator and SET LOCAL
  // SESSION AUTHORIZATION to the actual reviewer identity; ordinary reads above use
  // its separately authenticated SCRAM connection. A timeout is not refusal proof.
  await fx.withRevokedBinding(async client=>assert.rejects(read(client),denied));
  await fx.withRevokedBroker(async client=>assert.rejects(read(client),denied));
  validateDisplay(await read(),expected);
 });
 await check(async()=>{
  let writer,pending,begun=false,operationError=null;
  try{
   writer=await openAdmin();
   await writer.query("set statement_timeout='5000ms'");
   const writerPid=(await writer.query('select pg_backend_pid() pid')).rows[0].pid;
   const readerPid=(await gateway.query('select pg_backend_pid() pid')).rows[0].pid;
   await gateway.query('begin');begun=true;validateDisplay(await read(),expected);
   // A committed expiry change must wait for the reader's SHARE lock on the
   // actual auth.sessions row (not just for an advisory/test-only lock).
   pending=writer.query("update auth.sessions set not_after='2000-01-01' where id=$1",[session]).then(()=>null,error=>error);
   let blocked=false;
   for(let i=0;i<100;i++){
    const p=(await db.query('select pg_blocking_pids($1) ids',[writerPid])).rows[0].ids;
    if(p.includes(readerPid)){blocked=true;break}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   assert.equal(blocked,true);await gateway.query('commit');begun=false;const updateError=await pending;pending=null;if(updateError)throw updateError;
   await assert.rejects(read(),denied);
  }catch(error){operationError=error}finally{
   const failures=[];
   if(begun)try{await gateway.query('rollback')}catch{failures.push('reader_rollback')}
   if(pending)try{if(await pending)failures.push('writer_update')}catch{failures.push('writer_update')}
   if(writer)try{await writer.end()}catch{failures.push('writer_close')}
   try{await db.query('update auth.sessions set not_after=$2 where id=$1',[session,end])}catch{failures.push('restore_session')}
   if(failures.length){
    const state=/^[A-Z0-9]{5}$/.test(operationError?.code??'')?operationError.code:'NONE';
    const failure=Error('native_caller_concurrency_cleanup');
    if(state!=='NONE')failure.code=state;
    const frames=String(operationError?.stack??'').split('\n').slice(1).flatMap(x=>x.match(/nativeComparisonCallerPostgresAssertions\.mjs:\d{1,6}:\d{1,6}/g)??[]).slice(0,3);
    failure.stack='native_caller_concurrency_cleanup\n'+frames.join('\n');
    failure.callerCleanupFailed=true;throw failure;
   }
  }
  if(operationError)throw operationError;
 });
 await check(async()=>{
  validateDisplay(await read(),expected);
  await verifyMainBoundary(boundary);
  assert.equal((await db.query("select count(*)::int n from pg_auth_members where roleid='mip_efta_auth_session_owner_v1'::regrole or member='mip_efta_auth_session_owner_v1'::regrole")).rows[0].n,0);
  // Fixture-only Auth row cleanup; admission metadata remains append-only until
  // the parent's pristine dedicated database is dropped.
  await configure({active:false});await db.query('delete from auth.sessions where id=$1',[session]);
  assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[session])).rows[0].n,0);seeded=false;
  await assert.rejects(read(),denied);
 });
 }catch(error){primary=error}
 const cleanup=[];
 if(seeded)try{await db.query('delete from auth.sessions where id=$1',[session]);assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[session])).rows[0].n,0)}catch{cleanup.push('native_caller_auth_cleanup')}
 if(membershipTouched){
  try{await setAdminMembership(priorCanDecide)}catch{cleanup.push('native_caller_admin_scope_restore')}
  try{assert.equal(await membership(),priorCanDecide)}catch{cleanup.push('native_caller_admin_scope_reconcile')}
 }
 if(primary||cleanup.length)throw Error([primary?.message,...cleanup].filter(Boolean).join(' ').slice(0,1024));
 return {checks,publication_allowed:false,attachment_allowed:false};
}
