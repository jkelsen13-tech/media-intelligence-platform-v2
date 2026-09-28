import {prepareAtomicInstall,validateAtomicConfig} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
import {NATIVE_CALLER_MODE,nativeAuthorization} from '../supabase/qualification/native-governed-install/install.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {normalizeActivationRequest,activationTransaction} from '../supabase/qualification/native-governed-activation/activation.mjs'
import {prepareNativeActivation,GROUPS,ROLES,SQL_PATH,SQL_BLOB} from '../supabase/qualification/native-governed-activation/prepare.mjs'
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const config={expectedLogin:'synthetic_installer',expectedMetadataAuditor:'synthetic_metadata_auditor',operationId:'a'.repeat(32),expectedInstallManifest:'b'.repeat(64),
 expectedNativeProgram:'c'.repeat(64),expectedSuccessorProgram:'d'.repeat(64)}
function request(){
 return {revision:uuid(1),predecessor:null,action:'active',
  members:GROUPS.map((group,i)=>({group,group_oid:String(1000+i),name:'synthetic_runtime_'+i,oid:String(2000+i)})),
  authority:{scope:uuid(10),subject:uuid(11),binding:uuid(12),manifest:'a'.repeat(64),admission:uuid(13),
   caller_runtime:'synthetic-caller',worker_runtime:'synthetic-worker',source:'synthetic-source',implementation:'synthetic-implementation',
   mapping:uuid(14),key:uuid(15),worker_mapping:uuid(16),worker_key:uuid(17),valid_until:'2099-01-01T00:00:00.000Z'},
  ephemeral:{brokerSession:uuid(20),workerSession:uuid(21),authSession:uuid(22),tokenExp:4070908800}}
}
function connection({commitError=false,closeError=false,rollbackError=false,transitionError=false,reconcileMissing=false,unsafeLogging=false}={}){
 const calls=[]
 return {calls,async query(sql,args){
  calls.push({sql,args})
  if(sql.includes('from pg_settings'))return {rows:Object.entries({
   log_statement:unsafeLogging?'all':'none',log_min_duration_statement:'-1',log_min_duration_sample:'-1',
   log_transaction_sample_rate:'0',log_parameter_max_length_on_error:'0',statement_timeout:'10000'
  }).map(([name,setting])=>({name,setting}))}
  if(sql.includes('from mip_native_activation.bootstrap'))return {rows:[{matches:true}]}
  if(sql.includes('from mip_native_activation.revisions'))return {rows:reconcileMissing?[]:[{matches:true}]}
  if(sql.includes('mip_native_activation.transition')){
   if(transitionError)throw Error('unsafe server context '+uuid(20))
   return {rows:[{state:'active'}]}
  }
  if(sql==='commit'&&commitError)throw Error('synthetic lost acknowledgement '+uuid(21))
  if(sql==='rollback'&&rollbackError)throw Error('synthetic rollback failed')
  return {rows:[]}
 },async end(){calls.push({sql:'end'});if(closeError)throw Error('synthetic close failed')}}
}
test('successor source is exact UTF8 and compiles fixed metadata helpers without callback or waiver',async()=>{
 const bytes=await readFile(new URL('../'+SQL_PATH,import.meta.url))
 assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),SQL_BLOB)
 const p=await prepareNativeActivation(async()=>bytes,{expectedLogin:config.expectedLogin,operationId:config.operationId,expectedMetadataAuditor:config.expectedMetadataAuditor})
 assert.match(p.sql,/create function mip_native_activation.assert_structure\(\)/)
 assert.doesNotMatch(p.sql,/__[A-Z_]+__/)
 assert.equal(ROLES.length,new Set(ROLES).size)
 assert.equal(p.issuer,'mip_agi_'+config.operationId)
 await assert.rejects(prepareNativeActivation(async()=>Buffer.concat([bytes,Buffer.from('\n')]),{expectedLogin:config.expectedLogin,operationId:config.operationId,expectedMetadataAuditor:config.expectedMetadataAuditor}),/source_digest/)
})
test('normalized durable authority binds separate publisher and worker sessions without retaining them',()=>{
 const r=request(),n=normalizeActivationRequest(r)
 for(const v of [r.ephemeral.brokerSession,r.ephemeral.workerSession,r.ephemeral.authSession])
  assert.equal(JSON.stringify(n.authority).includes(v),false)
 assert.notEqual(n.authority.broker_session_hash,n.authority.worker_session_hash)
 assert.deepEqual(r.members,n.members)
})
test('five distinct real runtime names/OIDs required; no group union or identity alias',()=>{
 for(const mutate of [
  r=>r.members[1].name=r.members[0].name,
  r=>r.members[1].oid=r.members[0].oid,
  r=>r.members[1].group=r.members[0].group,
  r=>r.members[0].name='postgres;select 1',
  r=>r.members[0].admin=true,
  r=>r.ephemeral.workerSession=r.ephemeral.brokerSession,
  r=>r.authority.payload='forbidden'
 ]){
  const r=request();mutate(r);assert.throws(()=>normalizeActivationRequest(r))
 }
})
test('disabled revision carries no stale authority or session context',()=>{
 const r={...request(),action:'disabled_bootstrap',authority:{},ephemeral:{}}
 assert.deepEqual(normalizeActivationRequest(r).authority,{})
 r.ephemeral={brokerSession:uuid(20)}
 assert.throws(()=>normalizeActivationRequest(r),/request_shape/)
})
test('acknowledged commit needs exact SQL transition and verified cleanup',async()=>{
 const db=connection(),r=await activationTransaction(db,config,request())
 assert.equal(r.transaction,'acknowledged_commit');assert.equal(r.permissions_current,true)
 assert.equal(r.connection_cleanup_verified,true);assert.equal(r.publication_allowed,false)
 assert.equal(r.reuse_eligible,false);assert.equal(r.production_qualified,false)
 assert.equal(db.calls.filter(c=>c.sql.includes('mip_native_activation.transition')).length,1)
 assert.equal(db.calls.some(c=>c.sql.includes(uuid(20))),false)
 assert.equal(JSON.stringify(r).includes(uuid(20)),false)
})
test('lost commit acknowledgement is unknown, never automatically retried or claimed rolled back',async()=>{
 const db=connection({commitError:true}),r=await activationTransaction(db,config,request())
 assert.equal(r.transaction,'commit_outcome_unknown');assert.equal(r.permissions_current,false)
 assert.equal(r.needs_reconciliation,true)
 assert.equal(db.calls.filter(c=>c.sql==='commit').length,1)
 assert.equal(db.calls.some(c=>c.sql==='rollback'),false)
 assert.equal(JSON.stringify(r).includes(uuid(21)),false)
})
test('known commit survives close uncertainty but current-success flag is withheld',async()=>{
 const r=await activationTransaction(connection({closeError:true}),config,request())
 assert.equal(r.transaction,'acknowledged_commit');assert.equal(r.permissions_current,false)
 assert.equal(r.needs_reconciliation,true);assert.equal(r.connection_cleanup_verified,false)
})
test('operation failure rolls back and redacts server context',async()=>{
 const db=connection({transitionError:true}),r=await activationTransaction(db,config,request())
 assert.equal(r.transaction,'not_committed');assert.equal(r.permissions_current,false)
 assert.equal(db.calls.some(c=>c.sql==='rollback'),true)
 assert.equal(JSON.stringify(r).includes('unsafe server'),false)
})
test('rollback failure stays unverified after a successful close',async()=>{
 const r=await activationTransaction(connection({transitionError:true,rollbackError:true}),config,request())
 assert.equal(r.connection_cleanup_verified,false);assert.equal(r.needs_reconciliation,true)
 assert.equal(r.cleanup_diagnostic,'native_activation_rollback_unverified')
})
test('reconciliation refuses missing revision and never invokes transition',async()=>{
 const db=connection({reconcileMissing:true}),r=await activationTransaction(db,config,request(),{reconcile:true})
 assert.equal(r.permissions_current,false)
 assert.equal(db.calls.some(c=>c.sql.includes('mip_native_activation.transition')),false)
})
test('reconciliation rechecks actual current topology and authority',async()=>{
 const db=connection(),r=await activationTransaction(db,config,request(),{reconcile:true})
 assert.equal(r.permissions_current,true)
 assert.equal(db.calls.filter(c=>c.sql.includes('mip_native_activation.assert_current')).length,1)
 assert.equal(db.calls.some(c=>c.sql.includes('mip_native_activation.transition')),false)
})
test('unsafe logging refuses before any transient session reaches SQL',async()=>{
 const db=connection({unsafeLogging:true}),r=await activationTransaction(db,config,request())
 assert.equal(r.permissions_current,false)
 assert.equal(db.calls.some(c=>c.args?.includes(uuid(20))),false)
})

test('pending provisioning carries only live Auth/scope metadata and no broker or worker token',()=>{
 const r=request()
 r.action='pending'
 r.authority={scope:r.authority.scope,subject:r.authority.subject,valid_until:r.authority.valid_until}
 r.ephemeral={authSession:r.ephemeral.authSession,tokenExp:r.ephemeral.tokenExp}
 const n=normalizeActivationRequest(r)
 assert.equal(n.ephemeral.brokerSession,null);assert.equal(n.ephemeral.workerSession,null)
 assert.equal(n.authority.auth_session_hash.length,64)
 r.authority.worker_runtime='forbidden-until-phase2'
 assert.throws(()=>normalizeActivationRequest(r),/request_shape/)
})

test('successor preparation preserves every compiled historical fragment and native program identity',async()=>{
 const read=p=>readFile(new URL('../'+p,import.meta.url));
 const legacy=await prepareAtomicInstall(read,{nativeMode:NATIVE_CALLER_MODE});
 const successor=await prepareAtomicInstall(read,{nativeMode:NATIVE_CALLER_MODE,activationProfile:'native-governed-activation-v1',
  expectedLogin:config.expectedLogin,operationId:config.operationId,expectedMetadataAuditor:config.expectedMetadataAuditor});
 assert.equal(successor.native.program_sha256,legacy.native.program_sha256);
 for(const key of Object.keys(legacy).filter(k=>k!=='manifest_sha256'))assert.deepEqual(successor[key],legacy[key]);
 assert.notEqual(successor.manifest_sha256,legacy.manifest_sha256);
 assert.equal(successor.activation.profile,'native-governed-activation-v1');
 await assert.rejects(prepareAtomicInstall(read,{nativeMode:'native-governed-v5',activationProfile:'native-governed-activation-v1'}),/activation_profile/);
 await assert.rejects(prepareAtomicInstall(read,{nativeMode:NATIVE_CALLER_MODE,expectedMetadataAuditor:config.expectedMetadataAuditor}),/activation_profile/);
 const c={authorization:nativeAuthorization(NATIVE_CALLER_MODE),nativeMode:NATIVE_CALLER_MODE,
  operationId:config.operationId,expectedLogin:config.expectedLogin,c3OperationId:'1'.repeat(32),c3ManifestSha256:'1'.repeat(64),
  expectedManifestSha256:successor.manifest_sha256,expectedNativeProgramSha256:legacy.native.program_sha256,
  dblinkMetadataSha256:'1'.repeat(64),collectorSource:'qik-synthetic',auditLogin:'synthetic_audit',
  auditConnectionString:'postgresql://synthetic_audit:synthetic@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?sslmode=verify-full&sslrootcert=system&connect_timeout=5',
  activationProfile:'native-governed-activation-v1',expectedMetadataAuditor:config.expectedMetadataAuditor,
  expectedSuccessorProgram:successor.activation.program_sha256};
 assert.throws(()=>validateAtomicConfig(c),/configuration/);
 c.authorization='owner-authorized-native-governed-activation-bootstrap-install';
 assert.equal(validateAtomicConfig(c).activationProfile,'native-governed-activation-v1');
});

test('successor candidate manifest pins the complete changed executable source and concrete fixture',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../verifier/qik-native-activation-successor.json',import.meta.url),'utf8'));
 assert.equal(manifest.profile,'native-governed-activation-v1');
 const paths=new Set();
 for(const entry of manifest.sources){
  assert.equal(paths.has(entry.path),false);paths.add(entry.path);
  const bytes=await readFile(new URL('../'+entry.path,import.meta.url));
  assert.equal(Buffer.from(bytes.toString('utf8')).equals(bytes),true);
  assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),entry.git_blob,entry.path);
 }
 for(const path of [
  'supabase/qualification/native-governed-install/install.mjs',
  'supabase/qualification/qik-comparison-adapter/atomicInstall.mjs',
  'supabase/qualification/native-governed-activation/001_profile.sql',
  'supabase/qualification/native-governed-activation/prepare.mjs',
  'supabase/qualification/native-governed-activation/activation.mjs',
  'supabase/qualification/native-governed-activation/audit.mjs',
  'tests/nativeGovernedInstallerPostgres17.test.mjs',
  'tests/nativeGovernedActivationPostgres17.test.mjs'
 ])assert.equal(paths.has(path),true,path);
 assert.equal(manifest.production_qualified,false);
});

test('transition diagnostics expose only a fixed phase and valid SQLSTATE without server context',async()=>{
 const fields={
  message:'SYNTHETIC_PRIVATE_ERROR_MESSAGE_6841',
  detail:'SYNTHETIC_PRIVATE_ERROR_DETAIL_6842',
  query:'SYNTHETIC_PRIVATE_ERROR_QUERY_6843',
  stack:'SYNTHETIC_PRIVATE_ERROR_STACK_6844',
  hint:'SYNTHETIC_PRIVATE_ERROR_HINT_6845',
  where:'SYNTHETIC_PRIVATE_ERROR_WHERE_6846',
  internalQuery:'SYNTHETIC_PRIVATE_INTERNAL_QUERY_6847'
 };
 for(const [code,expected]of [['42501','42501'],['ECONNRESET',null],['private-code',null]]){
  const db=connection(),query=db.query.bind(db);
  db.query=async(sql,args)=>{
   if(sql.includes('mip_native_activation.transition')){
    db.calls.push({sql,args});
    throw Object.assign(new Error(fields.message),fields,{code});
   }
   return query(sql,args);
  };
  const r=await activationTransaction(db,config,request());
  assert.equal(r.phase,'transition');assert.equal(r.sqlstate,expected);
  assert.equal(r.transaction,'not_committed');assert.equal(r.permissions_current,false);
  assert.equal(r.connection_cleanup_verified,true);assert.equal(r.cleanup_diagnostic,null);
  assert.equal(r.needs_reconciliation,false);
  assert.equal(db.calls.filter(c=>c.sql==='rollback').length,1);
  assert.equal(db.calls.filter(c=>c.sql==='end').length,1);
  assert.equal(db.calls.some(c=>c.sql==='commit'),false);
  const serialized=JSON.stringify(r);
  for(const marker of Object.values(fields))assert.equal(serialized.includes(marker),false);
  if(expected===null)assert.equal(serialized.includes(code),false);
  for(const key of Object.keys(fields))assert.equal(Object.hasOwn(r,key),false);
  for(const secret of Object.values(request().ephemeral))assert.equal(serialized.includes(String(secret)),false);
 }
});
test('SQLSTATE diagnostics do not convert a lost commit acknowledgement into a rollback',async()=>{
 const db=connection(),query=db.query.bind(db);
 db.query=async(sql,args)=>{
  const result=await query(sql,args);
  if(sql==='commit')throw Object.assign(new Error('SYNTHETIC_PRIVATE_COMMIT_MESSAGE_6851'),{
   code:'08006',detail:'SYNTHETIC_PRIVATE_COMMIT_DETAIL_6852',query:'SYNTHETIC_PRIVATE_COMMIT_QUERY_6853',
   stack:'SYNTHETIC_PRIVATE_COMMIT_STACK_6854'
  });
  return result;
 };
 const r=await activationTransaction(db,config,request());
 assert.equal(r.phase,'commit');assert.equal(r.sqlstate,'08006');
 assert.equal(r.transaction,'commit_outcome_unknown');assert.equal(r.permissions_current,false);
 assert.equal(r.needs_reconciliation,true);assert.equal(r.connection_cleanup_verified,true);
 assert.equal(db.calls.some(c=>c.sql==='rollback'),false);
 assert.equal(db.calls.filter(c=>c.sql==='commit').length,1);
 assert.equal(db.calls.filter(c=>c.sql==='end').length,1);
 assert.equal(JSON.stringify(r).includes('SYNTHETIC_PRIVATE_COMMIT_'),false);
});

test('successor Auth check preserves the pinned caller live-session body without widening original EXECUTE',async()=>{
 const callerBytes=await readFile(new URL('../supabase/qualification/native-comparison-caller/001_admission.sql',import.meta.url));
 assert.equal(createHash('sha1').update('blob '+callerBytes.length+'\0').update(callerBytes).digest('hex'),'a9428d8b2120514a0d6ee13a53d801dba7b6e060');
 const caller=callerBytes.toString('utf8'),profile=await readFile(new URL('../'+SQL_PATH,import.meta.url),'utf8');
 const original=caller.split('create function mip_native_caller.assert_session(')[1].split('end $$;')[0];
 const successor=profile.split('create function mip_native_activation.auth_current(')[1].split('end $f$;')[0];
 const checks=original.slice(original.indexOf(' if u is null'));
 assert.equal(successor.slice(successor.indexOf(' if u is null')),checks);
 assert.ok(successor.indexOf('publication_fence where id for share')<successor.indexOf('select x.not_after'));
 assert.equal(successor.includes('perform mip_native_caller.assert_session'),false);
 assert.match(successor,/u uuid:=\(a->>'subject'\)::uuid;session_id uuid:=auth_session/);
});
