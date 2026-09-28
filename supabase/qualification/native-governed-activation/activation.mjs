// Concrete successor client. No CLI, SQL callback, issuer argument, automatic retry,
// captured payload, publication, or reuse-eligibility authority.
import {createHash} from 'node:crypto'
import {connectPersistentInstaller} from '../qik-ingest/persistentInstall.mjs'
import {assertCredentialLogging} from '../collector-native-capture/credentialDelivery.mjs'
import {GROUPS,PROFILE,prepareNativeActivation} from './prepare.mjs'
const HASH=/^[0-9a-f]{64}$/,OID=/^[1-9][0-9]*$/
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex')
const fail=c=>{throw Error('native_activation_'+c)}
function keys(value,want){
 if(!value||typeof value!=='object'||Array.isArray(value)
  ||JSON.stringify(Object.keys(value).sort())!==JSON.stringify([...want].sort()))fail('request_shape')
}
export function normalizeActivationRequest(request){
 keys(request,['revision','predecessor','action','members','authority','ephemeral'])
 if(!UUID.test(request.revision??'')||request.predecessor!==null&&!UUID.test(request.predecessor??'')
  ||request.revision===request.predecessor||!['pending','active','disabled_bootstrap'].includes(request.action))fail('request')
 if(!Array.isArray(request.members)||request.members.length!==GROUPS.length)fail('members')
 const members=request.members.map(m=>{
  keys(m,['group','group_oid','name','oid'])
  if(!GROUPS.includes(m.group)||!LOGIN.test(m.name??'')||!OID.test(m.oid??'')||!OID.test(m.group_oid??''))fail('members')
  return {...m}
 }).sort((a,b)=>a.group.localeCompare(b.group))
 if(JSON.stringify(members.map(m=>m.group))!==JSON.stringify(GROUPS)
  ||new Set(members.map(m=>m.name)).size!==GROUPS.length||new Set(members.map(m=>m.oid)).size!==GROUPS.length
  ||new Set(members.map(m=>m.group_oid)).size!==GROUPS.length)fail('members')
 let authority,ephemeral
 if(request.action==='disabled_bootstrap'){
  keys(request.authority,[]);keys(request.ephemeral,[])
  authority={};ephemeral={brokerSession:null,workerSession:null,authSession:null,tokenExp:null}
 }else if(request.action==='pending'){
  keys(request.authority,['scope','subject','valid_until'])
  keys(request.ephemeral,['authSession','tokenExp'])
  const a=request.authority,e=request.ephemeral
  if(!UUID.test(a.scope??'')||!UUID.test(a.subject??'')||typeof a.valid_until!=='string'
   ||!Number.isFinite(Date.parse(a.valid_until))||new Date(a.valid_until).toISOString()!==a.valid_until
   ||!UUID.test(e.authSession??'')||!Number.isSafeInteger(e.tokenExp)||e.tokenExp<1||e.tokenExp>253402300799)fail('pending_authority')
  authority={...a,auth_session_hash:sha(e.authSession),token_exp:String(e.tokenExp)}
  ephemeral={brokerSession:null,workerSession:null,authSession:e.authSession,tokenExp:e.tokenExp}
 }else{
  keys(request.authority,['scope','subject','binding','manifest','admission','caller_runtime','worker_runtime',
   'source','implementation','mapping','key','worker_mapping','worker_key','valid_until'])
  keys(request.ephemeral,['brokerSession','workerSession','authSession','tokenExp'])
  const a=request.authority,e=request.ephemeral
  for(const k of ['scope','subject','binding','admission','mapping','key','worker_mapping','worker_key'])
   if(!UUID.test(a[k]??''))fail('authority')
  if(!HASH.test(a.manifest??'')||!['caller_runtime','worker_runtime'].every(k=>/^[A-Za-z0-9._:-]{1,100}$/.test(a[k]??''))
   ||typeof a.source!=='string'||a.source.length<1||a.source.length>100
   ||typeof a.implementation!=='string'||a.implementation.length<1||a.implementation.length>300
   ||typeof a.valid_until!=='string'||!Number.isFinite(Date.parse(a.valid_until))
   ||new Date(a.valid_until).toISOString()!==a.valid_until)fail('authority')
  if(!UUID.test(e.brokerSession??'')||!UUID.test(e.workerSession??'')||!UUID.test(e.authSession??'')
   ||e.brokerSession===e.workerSession||!Number.isSafeInteger(e.tokenExp)||e.tokenExp<1||e.tokenExp>253402300799)fail('ephemeral_context')
  authority={...a,broker_session_hash:sha(e.brokerSession),worker_session_hash:sha(e.workerSession),
   auth_session_hash:sha(e.authSession),token_exp:String(e.tokenExp)}
  ephemeral={...e}
 }
 // Returned only to the trusted caller; never serialize ephemeral into a receipt.
 return {revision:request.revision,predecessor:request.predecessor,action:request.action,members,authority,ephemeral}
}
function config(c,plan){
 if(!c||!LOGIN.test(c.expectedLogin??'')||!/^[0-9a-f]{32}$/.test(c.operationId??'')
  ||c.authorization!=='owner-authorized-native-governed-permission-transition'
  ||![c.expectedInstallManifest,c.expectedNativeProgram,c.expectedSuccessorProgram].every(h=>HASH.test(h??''))
  ||plan.program_sha256!==c.expectedSuccessorProgram)fail('configuration')
 return {expectedLogin:c.expectedLogin,operationId:c.operationId,expectedInstallManifest:c.expectedInstallManifest,
  expectedNativeProgram:c.expectedNativeProgram,expectedSuccessorProgram:c.expectedSuccessorProgram}
}
const baselineSQL="select operation_id=$1 and installer=$2 and installer_oid=session_user::regrole::oid and install_manifest=$3 and native_program=$4 and successor_program=$5 matches from mip_native_activation.bootstrap where singleton"
export async function activationTransaction(db,c,request,{reconcile=false}={}){
 // Internal deterministic transaction primitive for synthetic tests. Production
 // exports below create the authenticated connection themselves.
 let r=null,e=null
 let begun=false,commitAttempted=false,committed=false,result
 try{
  r=normalizeActivationRequest(request);e=r.ephemeral
  await db.query('begin');begun=true
  await db.query("set local lock_timeout='5000ms'")
  await db.query("set local statement_timeout='1000ms'")
  await db.query('select pg_advisory_xact_lock(171903,7001)')
  const b=(await db.query(baselineSQL,[c.operationId,c.expectedLogin,c.expectedInstallManifest,c.expectedNativeProgram,c.expectedSuccessorProgram])).rows[0]
  if(b?.matches!==true)fail('bootstrap_mismatch')
  // Reuse the concrete no-credential-logging boundary before transient parameters.
  await assertCredentialLogging(db)
  if(reconcile){
   const exact=(await db.query("select predecessor is not distinct from $2::uuid and action=$3 and members=$4::jsonb and authority=$5::jsonb and operation_id=$6 matches from mip_native_activation.revisions where revision=$1",
    [r.revision,r.predecessor,r.action,JSON.stringify(r.members),JSON.stringify(r.authority),c.operationId])).rows[0]
   if(exact?.matches!==true)fail('reconciliation_mismatch')
   await db.query('select mip_native_activation.assert_current($1,$2,$3,$4,$5,$6)',
    [r.action,r.revision,e.brokerSession,e.workerSession,e.authSession,e.tokenExp])
  }else{
   const changed=(await db.query('select mip_native_activation.transition($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9) state',
    [r.revision,r.predecessor,r.action,JSON.stringify(r.members),JSON.stringify(r.authority),
     e.brokerSession,e.workerSession,e.authSession,e.tokenExp])).rows[0]
   if(changed?.state!==r.action)fail('transition_unconfirmed')
  }
  commitAttempted=true
  await db.query('commit');begun=false;committed=true
  result={profile:PROFILE,operation_id:c.operationId,revision:r.revision,state:r.action,
   transaction:'acknowledged_commit',permissions_current:true,needs_reconciliation:false}
 }catch{
  result={profile:PROFILE,operation_id:c.operationId,revision:r?.revision??null,state:'unverified',
   transaction:commitAttempted?'commit_outcome_unknown':'not_committed',permissions_current:false,needs_reconciliation:commitAttempted}
 }finally{
  let rollbackOK=true,closeOK=true
  if(begun&&!commitAttempted)try{await db.query('rollback');begun=false}catch{rollbackOK=false}
  try{await db.end()}catch{closeOK=false}
  result.connection_cleanup_verified=rollbackOK&&closeOK
  result.cleanup_diagnostic=!rollbackOK?'native_activation_rollback_unverified':!closeOK?'native_activation_close_unverified':null
  if(!rollbackOK||!closeOK){result.needs_reconciliation=true;result.permissions_current=false}
  result.publication_allowed=false;result.reuse_eligible=false;result.material_transferred=false;result.production_qualified=false
  result.runtime_memberships_active=result.state==='active'&&result.permissions_current
  if(committed)result.transaction='acknowledged_commit'
 }
 return Object.freeze(result)
}
async function run(configInput,request,readPinnedSource,reconcile){
 const plan=await prepareNativeActivation(readPinnedSource,{expectedLogin:configInput.expectedLogin,operationId:configInput.operationId,expectedMetadataAuditor:configInput.expectedMetadataAuditor})
 const c=config(configInput,plan)
 // Validate before connecting or passing any context to PostgreSQL.
 const copied=structuredClone(request)
 normalizeActivationRequest(copied)
 const db=await connectPersistentInstaller({connectionString:configInput.connectionString,expectedLogin:c.expectedLogin,
  sessionPoolerHost:configInput.sessionPoolerHost,disposable:configInput.disposable===true})
 return activationTransaction(db,c,copied,{reconcile})
}
export const transitionNativeActivation=(config,request,readPinnedSource)=>run(config,request,readPinnedSource,false)
export const reconcileNativeActivation=(config,request,readPinnedSource)=>run(config,request,readPinnedSource,true)
