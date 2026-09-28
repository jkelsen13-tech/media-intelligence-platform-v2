// Armed assertions invoked by nativeGovernedInstallerPostgres17.test.mjs after
// its concrete full installer/bootstrap and synthetic control-metadata setup.
// Every runtime connection below is a real LOGIN, never SET ROLE impersonation.
import assert from 'node:assert/strict'
import pg from 'pg'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {auditNativeActivationMetadata} from '../supabase/qualification/native-governed-activation/audit.mjs'
import {GROUPS,prepareNativeActivation} from '../supabase/qualification/native-governed-activation/prepare.mjs'
import {activationTransaction,transitionNativeActivation,reconcileNativeActivation,normalizeActivationRequest} from '../supabase/qualification/native-governed-activation/activation.mjs'
const read=path=>readFile(new URL('../'+path,import.meta.url))
const safeTransition=r=>JSON.stringify({state:r?.state??null,phase:r?.phase??null,sqlstate:r?.sqlstate??null,
 transaction:r?.transaction??null,permissions_current:r?.permissions_current===true,
 connection_cleanup_verified:r?.connection_cleanup_verified===true,cleanup_diagnostic:r?.cleanup_diagnostic??null})
const uuid=n=>'71000000-0000-4000-8000-'+String(n).padStart(12,'0')
async function connect(connectionString,login){
 const u=new URL(connectionString)
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/postgres')
 assert.equal(decodeURIComponent(u.username),login);assert.equal(u.search,'');assert.equal(u.hash,'')
 const db=new pg.Client({connectionString,ssl:false,connectionTimeoutMillis:5000,query_timeout:15000})
 await db.connect()
 const id=(await db.query("select session_user::text s,current_user::text c,current_setting('server_version_num') version,rolsuper from pg_roles where rolname=current_user")).rows[0]
 assert.equal(id.s,login);assert.equal(id.c,login);assert.equal(id.version,'170006');assert.equal(id.rolsuper,false)
 return db
}
async function query(config,sql,args=[]){
 const db=await connect(config.connectionString,config.expectedLogin)
 try{return await db.query(sql,args)}finally{await db.end()}
}
async function refusesOldV6(config){
 const db=await connect(config.connectionString,config.expectedLogin)
 try{
  await db.query('begin')
  await assert.rejects(db.query('select mip_comparison_install.native_boundary_v6()'))
 }finally{await db.query('rollback');await db.end()}
}
export async function runNativeActivationQualification(t,f){
 const config=f.config
 assert.equal(process.env.MIP_QIK_COMPARISON_DISPOSABLE,'synthetic-pg17-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 const plan=await prepareNativeActivation(read,{expectedLogin:config.expectedLogin,operationId:config.operationId,expectedMetadataAuditor:config.expectedMetadataAuditor})
 assert.equal(config.expectedSuccessorProgram,plan.program_sha256)
 const pending=structuredClone(f.pending)
 assert.equal(pending.action,'pending');assert.equal(pending.predecessor,null)
 const active=structuredClone(f.active)
 active.predecessor=pending.revision;active.action='active'
 const disabled={revision:uuid(900),predecessor:active.revision,action:'disabled_bootstrap',
  members:pending.members,authority:{},ephemeral:{}}
 const role=g=>pending.members.find(m=>m.group===g).name
 await t.test('exact sealed bootstrap and original verifier refuses the restored extra grantor paths',async()=>{
  await query(config,"select mip_native_activation.assert_current('disabled_bootstrap',null)")
  const audit=await auditNativeActivationMetadata(config,read)
  assert.equal(audit.permission_boundary_current,true);assert.equal(audit.authority_current,false)
  const versions=(await query(config,"select extversion from pg_extension where extname='vector'")).rows
  assert.equal(versions[0]?.extversion,'0.8.2')
  await refusesOldV6(config)
 })
 await t.test('direct SQL rejects JSON null/non-string scalar authority and member values atomically',async()=>{
  const good=normalizeActivationRequest(pending)
  const cases=[]
  for(const k of Object.keys(good.authority))for(const value of [null,1,true,{},[]])
   cases.push({members:good.members,authority:{...good.authority,[k]:value}})
  for(const k of ['name','oid','group','group_oid'])for(const value of [null,1,true,{},[]]){
   const members=structuredClone(good.members);members[0][k]=value
   cases.push({members,authority:good.authority})
  }
  let index=1000
  for(const bad of cases)await assert.rejects(query(config,
   'select mip_native_activation.transition($1,null,$2,$3::jsonb,$4::jsonb,null,null,$5,$6)',
   [uuid(index++),'pending',JSON.stringify(bad.members),JSON.stringify(bad.authority),good.ephemeral.authSession,good.ephemeral.tokenExp]))
  const rows=(await query(config,'select count(*)::int n from mip_native_activation.revisions')).rows[0]
  assert.equal(rows.n,0)
 })
 await t.test('phase1 provisions only admin/gateway/broker after real current Auth/can_decide checks',async()=>{
  const bad=structuredClone(pending);bad.revision=uuid(901);bad.ephemeral.authSession=uuid(999)
  const denied=await transitionNativeActivation(config,bad,read)
  assert.equal(denied.permissions_current,false);assert.equal(denied.transaction,'not_committed')
  const ok=await transitionNativeActivation(config,pending,read)
  assert.equal(ok.state,'pending',safeTransition(ok));assert.equal(ok.permissions_current,true,safeTransition(ok))
  const rows=(await query(config,"select p.rolname g,m.rolname u,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member where m.rolname=any($1) order by p.rolname",[pending.members.map(m=>m.name)])).rows
  assert.deepEqual(rows.map(r=>r.g),['mip_identity_broker_v2','mip_mentions_admin','mip_mentions_gateway'])
  assert.ok(rows.every(r=>!r.admin_option&&r.inherit_option&&!r.set_option))
 })
 await t.test('phase2 missing admission/session fails atomically and leaves pending worker rights absent',async()=>{
  active.ephemeral.brokerSession=uuid(991);active.ephemeral.workerSession=uuid(992)
  const denied=await transitionNativeActivation(config,active,read)
  assert.equal(denied.permissions_current,false);assert.equal(denied.transaction,'not_committed')
  const head=(await query(config,"select revision::text from mip_native_activation.head where singleton")).rows[0]
  assert.equal(head.revision,pending.revision)
  const edges=(await query(config,"select count(*)::int n from pg_auth_members where member in(select oid from pg_roles where rolname=any($1))",
   [[role('mip_arc_native_worker'),role('mip_comparison_worker_v1')]])).rows[0]
  assert.equal(edges.n,0)
 })
 let publisherSession,workerSession
 await t.test('real broker LOGIN issues two current sessions via existing APIs; real admin configures admission',async()=>{
  const broker=await connect(f.urls.broker,role('mip_identity_broker_v2'))
  try{
   const issue=async(runtime,principal,mapping,key,index)=>{
    const wire=(await broker.query('select mip_identity.configuration($1,$2) value',[runtime,principal])).rows[0].value
    assert.equal(wire.mappingRevision,mapping);assert.equal(wire.keyRevision,key)
    const now=Math.floor(Date.now()/1000),expires=Math.min(now+300,now+wire.maxLifetimeSeconds)
    const hash=createHash('sha256').update('synthetic-activation-token-'+index).digest('hex')
    return (await broker.query('select mip_identity.issue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) session',
     [uuid(index),runtime,principal,mapping,key,wire.issuer,wire.audience,wire.mappings[0].subject,now-1,expires,hash])).rows[0].session
   }
   publisherSession=await issue(active.authority.caller_runtime,'mip_projection_publisher_v1',active.authority.mapping,active.authority.key,101)
   workerSession=await issue(active.authority.worker_runtime,'mip_comparison_worker_v1',active.authority.worker_mapping,active.authority.worker_key,102)
   assert.notEqual(publisherSession,workerSession)
  }finally{await broker.end()}
  const admin=await connect(f.urls.admin,role('mip_mentions_admin'))
  try{
   const a=active.authority
   await admin.query('select mip_native_caller.configure_admission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [a.admission,null,a.subject,a.scope,a.binding,a.manifest,role('mip_mentions_gateway'),publisherSession,
     a.caller_runtime,f.admissionValidFrom,a.valid_until,true])
  }finally{await admin.end()}
  active.ephemeral.brokerSession=publisherSession;active.ephemeral.workerSession=workerSession
 })
 await t.test('phase2 installs exact five runtime edges and reconciles actual current authority',async()=>{
  const ok=await transitionNativeActivation(config,active,read)
  assert.equal(ok.state,'active',safeTransition(ok));assert.equal(ok.permissions_current,true,safeTransition(ok))
  const retry=await transitionNativeActivation(config,active,read)
  assert.equal(retry.permissions_current,true,safeTransition(retry))
  const count=(await query(config,'select count(*)::int n from mip_native_activation.revisions where revision=$1',[active.revision])).rows[0]
  assert.equal(count.n,1)
  const audited=await auditNativeActivationMetadata(config,read)
  assert.equal(audited.permission_boundary_current,true);assert.equal(audited.state,'active');assert.equal(audited.authority_current,false)
  const current=await reconcileNativeActivation(config,active,read)
  assert.equal(current.permissions_current,true,safeTransition(current))
  const rows=(await query(config,"select p.rolname g,m.rolname u,a.grantor::text grantor,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member where m.rolname=any($1) order by p.rolname",[pending.members.map(m=>m.name)])).rows
  assert.deepEqual(rows.map(r=>r.g),GROUPS)
  assert.ok(rows.every(r=>!r.admin_option&&r.inherit_option&&!r.set_option))
  const retained=(await query(config,'select authority::text value from mip_native_activation.revisions where revision=$1',[active.revision])).rows[0].value
  assert.equal(retained.includes(publisherSession),false);assert.equal(retained.includes(workerSession),false)
  assert.equal(retained.includes(active.ephemeral.authSession),false)
  await refusesOldV6(config)
 })
 await t.test('real runtime worker LOGIN has exact API access without owner/SET paths or caller access',async()=>{
  const worker=await connect(f.urls.worker,role('mip_comparison_worker_v1'))
  try{
   const rights=(await worker.query("select pg_has_role(session_user,'mip_comparison_worker_v1','USAGE') api,pg_has_role(session_user,'mip_comparison_worker_v1','SET') can_set,pg_has_role(session_user,'mip_kernel_owner_v2','MEMBER') owner")).rows[0]
   assert.deepEqual(rights,{api:true,can_set:false,owner:false})
   const page=(await worker.query('select mip_identity.worker_journal_pending($1,$2,$3,$4) value',[workerSession,active.authority.worker_runtime,'',1])).rows[0].value
   assert.ok(Array.isArray(page));assert.ok(page.length<=1)
   await assert.rejects(worker.query('select id from auth.sessions limit 1'),e=>e.code==='42501')
  }finally{await worker.end()}
 })
 await t.test('lost acknowledgement after real COMMIT resolves only through fresh exact reconciliation',async()=>{
  const next={...structuredClone(active),revision:uuid(902),predecessor:active.revision}
  const db=await connect(config.connectionString,config.expectedLogin)
  const original=db.query.bind(db)
  db.query=async(sql,args)=>{const r=await original(sql,args);if(sql==='commit')throw Error('synthetic lost ACK');return r}
  const unknown=await activationTransaction(db,config,next)
  assert.equal(unknown.transaction,'commit_outcome_unknown');assert.equal(unknown.permissions_current,false)
  const reconciled=await reconcileNativeActivation(config,next,read)
  assert.equal(reconciled.permissions_current,true,safeTransition(reconciled))
  active.revision=next.revision;active.predecessor=next.predecessor;disabled.predecessor=next.revision
 })
 await t.test('actual admission revocation invalidates active currentness but does not block rights deactivation',async()=>{
  const admin=await connect(f.urls.admin,role('mip_mentions_admin'))
  try{
   const a=active.authority
   await admin.query('select mip_native_caller.configure_admission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [uuid(903),a.admission,a.subject,a.scope,a.binding,a.manifest,role('mip_mentions_gateway'),publisherSession,
     a.caller_runtime,f.admissionValidFrom,a.valid_until,false])
  }finally{await admin.end()}
  const stale=await reconcileNativeActivation(config,active,read)
  assert.equal(stale.permissions_current,false)
  // Actual partial external revocation is recoverable; never reinstate the edge.
  const revoker=await connect(config.connectionString,config.expectedLogin)
  try{
   await revoker.query('begin')
   await revoker.query('set local role "'+plan.issuer+'"')
   await revoker.query('revoke mip_comparison_worker_v1 from "'+role('mip_comparison_worker_v1')+'" granted by "'+plan.issuer+'" restrict')
   await revoker.query('set local role "'+config.expectedLogin+'"')
   await revoker.query('commit')
  }finally{await revoker.end()}
  const off=await transitionNativeActivation(config,disabled,read)
  assert.equal(off.state,'disabled_bootstrap',safeTransition(off));assert.equal(off.permissions_current,true,safeTransition(off))
  assert.equal((await auditNativeActivationMetadata(config,read)).permission_boundary_current,true)
  const edges=(await query(config,"select count(*)::int n from pg_auth_members where member in(select oid from pg_roles where rolname=any($1))",[pending.members.map(m=>m.name)])).rows[0]
  assert.equal(edges.n,0)
  const old=await transitionNativeActivation(config,active,read)
  assert.equal(old.permissions_current,false)
  await refusesOldV6(config)
 })
 await t.test('real independent metadata auditor cannot read session authority or raw Auth and has no installer execution',async()=>{
  const db=await connect(config.metadataAuditConnectionString,config.expectedMetadataAuditor)
  try{
   await assert.rejects(db.query('select authority from mip_native_activation.revisions'),e=>e.code==='42501')
   await assert.rejects(db.query('select id from auth.sessions'),e=>e.code==='42501')
   await assert.rejects(db.query("select mip_native_activation.assert_structure()"),e=>e.code==='42501')
  }finally{await db.end()}
 })
 await t.test('old v6 passes only inside separate zero-extra-edge DROP checkpoint; rollback restores successor',async()=>{
  const db=await connect(config.connectionString,config.expectedLogin)
  try{
   await db.query('begin')
   await db.query('savepoint historical_only')
   await db.query('drop role "'+plan.issuer+'"')
   await db.query('select mip_comparison_install.native_boundary_v6()')
   await db.query('rollback to savepoint historical_only')
   await db.query("select mip_native_activation.assert_current('disabled_bootstrap',$1)",[disabled.revision])
   await db.query('rollback')
  }finally{await db.end()}
 })
}
