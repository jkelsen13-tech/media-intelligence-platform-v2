// AUTHORED ONLY: run only in a fresh dedicated pinned PG17.6 synthetic cluster.
// Tests the actual full backend + C3-disabled profile + joint native installer.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {createHash} from 'node:crypto'
import {prepareClosedHistoricalInstall,installClosedHistoricalInTransaction} from '../supabase/qualification/historical-qik-executor/install.mjs'
import {prepareAtomicInstall,installComparisonAtomic,qualifyComparisonAudit,DBLINK_PREFLIGHT_SQL,validateAtomicConfig,reconcileComparisonInstall} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
import {REQUIRED_RELATIONS,RESERVED_ROLES} from '../supabase/qualification/qik-comparison-adapter/catalogPreflight.mjs'
import {LOAD_ORDER} from '../supabase/qualification/qik-ingest/installQikIngest.mjs'
import {NATIVE_MODE,NATIVE_PROJECTION_MODE,NATIVE_BINDING_MODE,NATIVE_DISPLAY_MODE,NATIVE_CALLER_MODE,nativeAuthorization,NATIVE_ORDER,NATIVE_PROJECTION_ORDER,NATIVE_BINDING_ORDER,NATIVE_DISPLAY_ORDER,NATIVE_CALLER_ORDER,NATIVE_ROLES,assertNativeGovernedClosure,verifyNativeBindingCurrentBoundary,verifyNativeDisplayCurrentBoundary,verifyNativeCallerCurrentBoundary} from '../supabase/qualification/native-governed-install/install.mjs'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const database='postgres',password='mip-efta-disposable-ci-only'
const backendInstaller='native_install_principal',backendAudit='native_install_audit'
const ident=s=>{assert.match(s,/^[a-z][a-z0-9_]{0,62}$/);return '"'+s+'"'}
async function connect(user='postgres',pass=password){
 const c=new pg.Client({host:'127.0.0.1',port:5432,database,user,password:pass,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000})
 try{await c.connect();return c}catch(error){await c.end();throw error}
}
const roleCatalog=async db=>(await db.query("select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles order by rolname")).rows
const safeResult=r=>({state:r?.state??null,phase:r?.phase??null,sqlstate:r?.sqlstate??null,diagnostic:r?.diagnostic??null,native_failure:r?.native_failure??null})
const numericPosition=x=>/^[0-9]{1,9}$/.test(String(x??''))?Number(x):null
const edgeCatalog=async db=>(await db.query('select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members order by roleid,member,grantor')).rows
// Fault injection loses the caller's acknowledgement AFTER the real PG command.
// It does not replace SQL execution or assert that an actual network failed.
async function loseAcknowledgementOnce(command,operation){
 const original=pg.Client.prototype.query;let injected=false
 pg.Client.prototype.query=async function(...args){
  const result=await original.apply(this,args)
  if(!injected&&this.connectionParameters?.user===backendInstaller&&typeof args[0]==='string'&&args[0].trim().toLowerCase()===command){
   injected=true;throw Object.assign(Error('synthetic_command_acknowledgement_lost'),{code:'08006'})
  }
  return result
 }
 try{const result=await operation();return {result,injected}}
 finally{pg.Client.prototype.query=original}
}
for(const selectedMode of [NATIVE_MODE,NATIVE_PROJECTION_MODE,NATIVE_BINDING_MODE,NATIVE_DISPLAY_MODE,NATIVE_CALLER_MODE])test(selectedMode+' joint native installation uses actual PG17.6 nonsuper principal, rollback, cleanup and disabled audit', {
 skip:process.env.MIP_NATIVE_GOVERNED_INSTALL_DISPOSABLE!=='synthetic-pg17-only',timeout:300000
},async t=>{
 let root,principal,baseline,armed=false,primary=null,stage='pristine',lastInstall=null;const cleanup=[]
 const projection=selectedMode!==NATIVE_MODE,binding=selectedMode===NATIVE_BINDING_MODE,display=selectedMode===NATIVE_DISPLAY_MODE,caller=selectedMode===NATIVE_CALLER_MODE,selectedOrder=caller?NATIVE_CALLER_ORDER:display?NATIVE_DISPLAY_ORDER:binding?NATIVE_BINDING_ORDER:projection?NATIVE_PROJECTION_ORDER:NATIVE_ORDER
 const refusalRelation=projection?'public.nodes':'public.articles',refusalPath=projection?NATIVE_PROJECTION_ORDER.at(-1).path:'supabase/qualification/arc-membership-native/001_governed_cohort.sql'
 try{
  assert.equal(process.env.MIP_QIK_COMPARISON_DISPOSABLE,'synthetic-pg17-only')
  assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
  root=await connect();await assertPristineFixture(root)
  assert.equal((await root.query("select bool_and(error is null and(type='local' or(type='host' and auth_method='scram-sha-256'))) ok from pg_hba_file_rules")).rows[0].ok,true)
  baseline=(await roleCatalog(root)).map(r=>r.rolname);armed=true
  stage='actual_dependency_program';const {cfg,plan}=await prepareFullBackend(root,selectedMode)
  principal=await connect(backendInstaller)
  await t.test('separate SCRAM session matches observed restricted installer attributes',async()=>{
   assert.deepEqual((await principal.query("select session_user::text principal,current_user::text effective,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolcanlogin from pg_roles where rolname=current_user")).rows[0],
    {principal:backendInstaller,effective:backendInstaller,rolsuper:false,rolcreaterole:true,rolcreatedb:true,rolbypassrls:true,rolinherit:true,rolcanlogin:true})
   await assert.rejects(connect(backendInstaller,'deliberately-wrong-synthetic-password'),e=>e.code==='28P01')
   for(const name of ['articles','entities','story_arcs','pipeline_config','arc_membership_candidates',...(projection?['nodes','arc_milestones']:[])]){
    assert.deepEqual((await principal.query("select relkind::text kind,pg_get_userbyid(relowner) owner,relrowsecurity rls,relforcerowsecurity force from pg_class where oid=$1::regclass",['public.'+name])).rows[0],{kind:'r',owner:backendInstaller,rls:true,force:false})
   }
  })
  await t.test('new mode requires distinct authorization and manifest; all historical source pins retained',async()=>{
   assert.throws(()=>validateAtomicConfig({...cfg,authorization:'owner-authorized-disabled-comparison-install'}))
   assert.throws(()=>validateAtomicConfig({...cfg,nativeMode:undefined}))
   assert.notEqual((await prepareAtomicInstall(read)).manifest_sha256,plan.manifest_sha256)
   await assert.rejects(installComparisonAtomic({...cfg,expectedNativeProgramSha256:'0'.repeat(64)},read),/atomic_manifest_mismatch/)
   await assert.rejects(installComparisonAtomic({...cfg,expectedManifestSha256:'0'.repeat(64)},read),/atomic_manifest_mismatch/)
   assert.throws(()=>validateAtomicConfig({...cfg,authorization:nativeAuthorization(projection?NATIVE_MODE:NATIVE_PROJECTION_MODE)}))
   const prior=await prepareAtomicInstall(read,{nativeMode:NATIVE_MODE})
   assert.deepEqual(plan.native.steps.slice(0,9),prior.native.steps)
   if(projection)assert.notEqual(plan.native.program_sha256,prior.native.program_sha256)
   if(caller){
    const v5=await prepareAtomicInstall(read,{nativeMode:NATIVE_DISPLAY_MODE})
    assert.deepEqual(plan.native.steps.slice(0,NATIVE_DISPLAY_ORDER.length),v5.native.steps)
    assert.notEqual(plan.native.program_sha256,v5.native.program_sha256)
    assert.throws(()=>validateAtomicConfig({...cfg,authorization:nativeAuthorization(NATIVE_DISPLAY_MODE)}))
   }
   if(display){
    const v4=await prepareAtomicInstall(read,{nativeMode:NATIVE_BINDING_MODE})
    assert.deepEqual(plan.native.steps.slice(0,NATIVE_BINDING_ORDER.length),v4.native.steps)
    assert.notEqual(plan.native.program_sha256,v4.native.program_sha256)
    assert.throws(()=>validateAtomicConfig({...cfg,authorization:nativeAuthorization(NATIVE_BINDING_MODE)}))
   }
   assert.deepEqual(plan.native.steps.map(s=>s.blob),selectedOrder.map(s=>s.blob))
   for(const s of plan.native.steps.filter(s=>s.assertion))assert.match(s.assertion_sha256,/^[a-f0-9]{64}$/)
  })
  if(caller)await t.test('v6 refuses missing actual Auth expiry grant authority and rolls back original leases',async()=>{
   const roles=await roleCatalog(root),edges=await edgeCatalog(root)
   await root.query('alter table auth.sessions owner to postgres')
   await root.query('grant select(id,user_id),update(id) on auth.sessions to '+ident(backendInstaller)+' with grant option')
   try{
    const rejected=await installComparisonAtomic(cfg,read)
    assert.equal(rejected.state,'installation_refused')
    assert.equal(rejected.native_failure?.stage,'caller_authority_preflight')
    assert.equal(rejected.native_failure?.name,'native_install_caller_authority_prerequisite')
    assert.deepEqual(await roleCatalog(root),roles);assert.deepEqual(await edgeCatalog(root),edges)
    assert.equal((await root.query("select to_regnamespace('mip_native_caller') is null absent")).rows[0].absent,true)
   }finally{
    await root.query('revoke all on auth.sessions from '+ident(backendInstaller))
    await root.query('revoke all(id,user_id,not_after) on auth.sessions from '+ident(backendInstaller))
    await root.query('alter table auth.sessions owner to '+ident(backendInstaller))
   }
  })
  stage='transaction_failure'
  const beforeRoles=await roleCatalog(root),beforeEdges=await edgeCatalog(root)
  await principal.query('create policy native_qualification_refuse on '+refusalRelation+' as restrictive for select to public using(false)')
  const failed=await installComparisonAtomic(cfg,read);lastInstall=safeResult(failed)
  await t.test('actual late source-authority failure rolls back full backend/native DDL and memberships',async()=>{
   assert.equal(failed.state,'installation_refused')
   assert.equal(failed.phase,'native_joint_install',JSON.stringify(lastInstall))
   assert.equal(failed.sqlstate,'P0001',JSON.stringify(lastInstall))
   assert.equal(failed.native_failure?.stage,'checkpoint_assertion',JSON.stringify(lastInstall))
   assert.equal(failed.native_failure?.source,refusalPath,JSON.stringify(lastInstall))
   assert.equal(failed.native_failure?.name,'arc_native_source_authority',JSON.stringify(lastInstall))
   assert.deepEqual(await roleCatalog(root),beforeRoles)
   assert.deepEqual(await edgeCatalog(root),beforeEdges)
   assert.equal((await root.query("select count(*)::int n from pg_namespace where nspname in('mip_mentions','mip_arc_native','mip_arc_qik_source','mip_arc_projection_private','mip_native_comparison','mip_native_display','mip_native_caller','mip_identity','mip_comparison_install') or nspname like 'mip_nca_%'")).rows[0].n,0)
   assert.equal((await root.query("select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='dblink'")).rows[0].nspname,'extensions')
   assert.equal((await principal.query('select count(*)::int n from qik_ingest_operation.persistent_install_receipt')).rows[0].n,1)
  })
  stage='rollback_acknowledgement'
  const rollbackAttempt=await loseAcknowledgementOnce('rollback',()=>installComparisonAtomic(cfg,read))
  const rollbackUnknown=rollbackAttempt.result;lastInstall=safeResult(rollbackUnknown)
  await t.test('lost rollback acknowledgement requires reconciliation and independently restores baseline',async()=>{
   assert.equal(rollbackAttempt.injected,true,JSON.stringify(lastInstall))
   assert.equal(rollbackUnknown.state,'rollback_unverified',JSON.stringify(lastInstall))
   assert.equal(rollbackUnknown.sqlstate,'P0001',JSON.stringify(lastInstall))
   assert.equal(rollbackUnknown.native_failure?.stage,'checkpoint_assertion',JSON.stringify(lastInstall))
   assert.equal(rollbackUnknown.native_failure?.source,refusalPath,JSON.stringify(lastInstall))
   assert.equal(rollbackUnknown.native_failure?.name,'arc_native_source_authority',JSON.stringify(lastInstall))
   assert.equal(rollbackUnknown.needs_reconciliation,true)
   assert.equal((await reconcileComparisonInstall(cfg,read)).state,'not_installed')
   assert.deepEqual(await roleCatalog(root),beforeRoles)
   assert.deepEqual(await edgeCatalog(root),beforeEdges)
  })
  await principal.query('drop policy native_qualification_refuse on '+refusalRelation)
  if(caller)await t.test('v6 late complete caller assertion fails after genuine cleanups and rolls back the entire joint install',async()=>{
   const roles=await roleCatalog(root),edges=await edgeCatalog(root)
   const original=pg.Client.prototype.query;let injected=false,sawClean=false
   pg.Client.prototype.query=async function(...args){
    if(this.connectionParameters?.user===backendInstaller&&args[0]==='select mip_comparison_install.native_boundary_v6()'){
     const before=await original.call(this,"select not exists(select 1 from pg_roles where rolname like 'mip_nci_%' or rolname like 'mip_tmp_%') clean")
     sawClean=before.rows[0].clean
    }
    const answer=await original.apply(this,args)
    if(!injected&&this.connectionParameters?.user===backendInstaller&&typeof args[0]==='string'
     &&args[0].includes('create schema mip_native_caller authorization mip_mentions_owner;')){
     // Actual forbidden grant while the original native creator lease still
     // exists. The late assertion must reject it after both real cleanups.
     await original.call(this,'grant create on schema mip_native_caller to mip_mentions_gateway')
     injected=true
    }
    return answer
   }
   let rejected
   try{rejected=await installComparisonAtomic(cfg,read)}finally{pg.Client.prototype.query=original}
   assert.equal(injected,true);assert.equal(sawClean,true)
   assert.equal(rejected.state,'installation_refused')
   assert.equal(rejected.phase,'native_final_joint_closure')
   assert.equal(rejected.native_failure?.stage,'caller_verifier_assertion')
   assert.deepEqual(await roleCatalog(root),roles);assert.deepEqual(await edgeCatalog(root),edges)
   assert.equal((await root.query("select to_regnamespace('mip_native_caller') is null and to_regnamespace('mip_comparison_install') is null absent")).rows[0].absent,true)
  })
  stage='joint_install';const commitAttempt=await loseAcknowledgementOnce('commit',()=>installComparisonAtomic(cfg,read))
  const attempt=commitAttempt.result;lastInstall=safeResult(attempt)
  assert.equal(commitAttempt.injected,true,JSON.stringify(lastInstall))
  assert.equal(attempt.state,'commit_ambiguous',JSON.stringify(lastInstall));assert.equal(attempt.needs_reconciliation,true)
  const installed=await reconcileComparisonInstall(cfg,read);lastInstall=safeResult(installed)
  await t.test('actual committed program reconciles after lost COMMIT acknowledgement without replay',async()=>{
   assert.equal(installed.state,'installed_disabled_audit_pending',JSON.stringify({phase:installed.phase,sqlstate:installed.sqlstate,diagnostic:installed.diagnostic}))
   assert.equal(installed.needs_reconciliation,false)
   assert.equal(installed.native_mode,selectedMode);assert.equal(installed.native_program_sha256,plan.native.program_sha256)
   assert.equal(plan.native.steps.at(-1).path,selectedOrder.at(-1).path)
   await assertNativeGovernedClosure(principal,cfg)
   const receipt=(await principal.query('select mode,program_sha256,stage_assertions from mip_comparison_install.native_programs where operation_id=$1',[cfg.operationId])).rows[0]
   assert.equal(receipt.mode,selectedMode);assert.equal(receipt.program_sha256,plan.native.program_sha256)
   assert.deepEqual(receipt.stage_assertions,plan.native.steps.filter(s=>s.assertion).map(s=>({path:s.path,sha256:s.assertion_sha256})))
  })
  if(projection)await t.test('private final closure verifies source permissions, exact ACLs and complete survivor fences after real cleanup',async()=>{
   await root.query(plan.native.steps.at(-1).assertion)
   assert.equal((await root.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_arc_projection_private' and c.relkind='r'")).rows[0].n,6)
   assert.equal((await root.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_arc_projection_private'")).rows[0].n,17)
   await root.query('begin')
   try{
    await root.query('grant select on mip_arc_projection_private.projections to public')
    await assert.rejects(root.query(plan.native.steps.at(-1).assertion),e=>e.code==='P0001'&&e.message==='arc_projection_table_acl')
   }finally{await root.query('rollback')}
   await root.query(plan.native.steps.at(-1).assertion)
  })
  if(binding)await t.test('v4 current verifier has fixed source, no arguments or data return, exact ACL and no owner schema access',async()=>{
   await verifyNativeBindingCurrentBoundary(principal,plan.native,cfg)
   const verifier=(await root.query("select pg_get_userbyid(p.proowner) owner,p.pronargs,p.prorettype::regtype::text result,p.prosecdef,p.proconfig,p.prosrc,not has_schema_privilege(p.proowner,n.oid,'USAGE,CREATE') isolated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid='mip_comparison_install.native_boundary_v4()'::regprocedure")).rows[0]
   assert.equal(verifier.owner,'mip_arc_native_owner');assert.equal(verifier.pronargs,0)
   assert.equal(verifier.result,'void');assert.equal(verifier.prosecdef,true);assert.equal(verifier.isolated,true)
   assert.deepEqual(verifier.proconfig,['search_path=""'])
   assert.equal(verifier.prosrc,'begin execute '+"'"+plan.native.steps.at(-1).assertion.replaceAll("'","''")+"'"+'; end')
   for(const role of ['anon','authenticated','service_role','mip_mentions_gateway','mip_arc_native_worker','mip_projection_publisher_v1']){
    assert.equal((await root.query("select has_function_privilege($1,'mip_comparison_install.native_boundary_v4()','EXECUTE') allowed",[role])).rows[0].allowed,false)
   }
   assert.equal((await root.query("select count(*)::int n from pg_proc p where p.pronamespace='mip_native_comparison'::regnamespace")).rows[0].n,7)
   assert.equal((await root.query("select count(*)::int n from pg_class c where c.relnamespace='mip_native_comparison'::regnamespace and c.relkind='r'")).rows[0].n,2)
  })
  if(binding)await t.test('v4 fresh reconciliation rejects protected helper, verifier source and owner-edge drift without replay',async()=>{
   const pristine=await edgeCatalog(root)
   const mutation=async({apply,restore,expectedName,expectedStage})=>{
    try{
     await apply()
     const observed=await reconcileComparisonInstall(cfg,read)
     assert.equal(observed.state,'reconciliation_unavailable')
     assert.equal(observed.needs_reconciliation,true)
     assert.equal(observed.phase,'native_reconciliation')
     assert.equal(observed.native_failure?.name,expectedName)
     assert.equal(observed.native_failure?.stage,expectedStage)
    }finally{await restore()}
    const restored=await reconcileComparisonInstall(cfg,read)
    assert.equal(restored.state,'installed_disabled_audit_pending')
    assert.equal(restored.needs_reconciliation,false)
    assert.deepEqual(await edgeCatalog(root),pristine)
   }
   await mutation({
    apply:()=>root.query('grant execute on function mip_native_comparison.comparison_metadata(uuid,text,uuid,uuid) to public'),
    restore:()=>root.query('revoke execute on function mip_native_comparison.comparison_metadata(uuid,text,uuid,uuid) from public'),
    expectedName:'native_comparison_function_acl',expectedStage:'binding_verifier_assertion'
   })
   await mutation({
    apply:()=>root.query('drop policy native_comparison_kernel_sources on public.articles'),
    restore:()=>root.query('create policy native_comparison_kernel_sources on public.articles for select to mip_kernel_owner_v2 using(true)'),
    expectedName:'native_comparison_source_authority',expectedStage:'binding_verifier_assertion'
   })
   await mutation({
    apply:()=>root.query('create policy native_comparison_restrictive_probe on public.articles as restrictive for select to mip_kernel_owner_v2 using(false)'),
    restore:()=>root.query('drop policy native_comparison_restrictive_probe on public.articles'),
    expectedName:'native_comparison_source_authority',expectedStage:'binding_verifier_assertion'
   })
   const original=(await root.query("select pg_get_functiondef('mip_comparison_install.native_boundary_v4()'::regprocedure) definition")).rows[0].definition
   await mutation({
    apply:()=>root.query("create or replace function mip_comparison_install.native_boundary_v4() returns void language plpgsql security definer set search_path='' as 'begin return; end'"),
    restore:()=>root.query(original),
    expectedName:'native_install_assertion_helper_boundary',expectedStage:'binding_verifier_source'
   })
   await mutation({
    apply:()=>root.query('grant mip_publication_owner_v2 to '+ident(backendInstaller)),
    restore:()=>root.query('revoke mip_publication_owner_v2 from '+ident(backendInstaller)),
    expectedName:'native_comparison_owner_membership',expectedStage:'binding_verifier_assertion'
   })
   assert.equal((await root.query('select count(*)::int n from mip_comparison_install.native_programs')).rows[0].n,1)
  })
  if(display)await t.test('v5 current verifier has fixed source, no arguments or data return, exact ACL and no owner schema access',async()=>{
   await verifyNativeDisplayCurrentBoundary(principal,plan.native,cfg)
   const verifier=(await root.query("select pg_get_userbyid(p.proowner) owner,p.pronargs,p.prorettype::regtype::text result,p.prosecdef,p.proconfig,p.prosrc,not has_schema_privilege(p.proowner,n.oid,'USAGE,CREATE') isolated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid='mip_comparison_install.native_boundary_v5()'::regprocedure")).rows[0]
   assert.equal(verifier.owner,'mip_arc_native_owner');assert.equal(verifier.pronargs,0)
   assert.equal(verifier.result,'void');assert.equal(verifier.prosecdef,true);assert.equal(verifier.isolated,true)
   assert.deepEqual(verifier.proconfig,['search_path=""'])
   assert.equal(verifier.prosrc,'begin execute '+"'"+plan.native.steps.at(-1).assertion.replaceAll("'","''")+"'"+'; end')
   for(const role of ['anon','authenticated','service_role','mip_mentions_gateway','mip_arc_native_worker','mip_projection_publisher_v1']){
    assert.equal((await root.query("select has_function_privilege($1,'mip_comparison_install.native_boundary_v5()','EXECUTE') allowed",[role])).rows[0].allowed,false)
   }
   assert.equal((await root.query("select count(*)::int n from pg_proc p where p.pronamespace='mip_native_comparison'::regnamespace")).rows[0].n,7)
   assert.equal((await root.query("select count(*)::int n from pg_class c where c.relnamespace='mip_native_comparison'::regnamespace and c.relkind='r'")).rows[0].n,2)
  })
  if(display)await t.test('v5 fresh reconciliation rejects protected helper, verifier source and owner-edge drift without replay',async()=>{
   assert.equal((await root.query("select count(*)::int n from pg_proc where pronamespace='mip_native_display'::regnamespace")).rows[0].n,4)
   assert.equal((await root.query("select count(*)::int n from pg_class where relnamespace='mip_native_display'::regnamespace")).rows[0].n,0)
   const pristine=await edgeCatalog(root)
   const mutation=async({apply,restore,expectedName,expectedStage})=>{
    try{
     await apply()
     const observed=await reconcileComparisonInstall(cfg,read)
     assert.equal(observed.state,'reconciliation_unavailable')
     assert.equal(observed.needs_reconciliation,true)
     assert.equal(observed.phase,'native_reconciliation')
     assert.equal(observed.native_failure?.name,expectedName)
     assert.equal(observed.native_failure?.stage,expectedStage)
    }finally{await restore()}
    const restored=await reconcileComparisonInstall(cfg,read)
    assert.equal(restored.state,'installed_disabled_audit_pending')
    assert.equal(restored.needs_reconciliation,false)
    assert.deepEqual(await edgeCatalog(root),pristine)
   }
   await mutation({
    apply:()=>root.query('grant execute on function mip_native_comparison.comparison_metadata(uuid,text,uuid,uuid) to public'),
    restore:()=>root.query('revoke execute on function mip_native_comparison.comparison_metadata(uuid,text,uuid,uuid) from public'),
    expectedName:'native_comparison_function_acl',expectedStage:'display_verifier_assertion'
   })
   await mutation({
    apply:()=>root.query('drop policy native_comparison_kernel_sources on public.articles'),
    restore:()=>root.query('create policy native_comparison_kernel_sources on public.articles for select to mip_kernel_owner_v2 using(true)'),
    expectedName:'native_comparison_source_authority',expectedStage:'display_verifier_assertion'
   })
   await mutation({
    apply:()=>root.query('create policy native_comparison_restrictive_probe on public.articles as restrictive for select to mip_kernel_owner_v2 using(false)'),
    restore:()=>root.query('drop policy native_comparison_restrictive_probe on public.articles'),
    expectedName:'native_comparison_source_authority',expectedStage:'display_verifier_assertion'
   })
   await mutation({
    apply:()=>root.query('grant execute on function mip_native_display.accepted_event(uuid,text,jsonb) to mip_mentions_gateway'),
    restore:()=>root.query('revoke execute on function mip_native_display.accepted_event(uuid,text,jsonb) from mip_mentions_gateway'),
    expectedName:'native_display_function_acl',expectedStage:'display_verifier_assertion'
   })
   await mutation({
    apply:()=>root.query('grant create on schema mip_native_display to mip_mentions_gateway'),
    restore:()=>root.query('revoke create on schema mip_native_display from mip_mentions_gateway'),
    expectedName:'native_display_schema_boundary',expectedStage:'display_verifier_assertion'
   })
   await mutation({
    apply:()=>root.query('alter function mip_native_display.read_current(uuid,uuid,text,uuid,text) security invoker'),
    restore:()=>root.query('alter function mip_native_display.read_current(uuid,uuid,text,uuid,text) security definer'),
    expectedName:'native_display_function_boundary',expectedStage:'display_verifier_assertion'
   })
   const original=(await root.query("select pg_get_functiondef('mip_comparison_install.native_boundary_v5()'::regprocedure) definition")).rows[0].definition
   await mutation({
    apply:()=>root.query("create or replace function mip_comparison_install.native_boundary_v5() returns void language plpgsql security definer set search_path='' as 'begin return; end'"),
    restore:()=>root.query(original),
    expectedName:'native_install_assertion_helper_boundary',expectedStage:'display_verifier_source'
   })
   await mutation({
    apply:()=>root.query('grant mip_publication_owner_v2 to '+ident(backendInstaller)),
    restore:()=>root.query('revoke mip_publication_owner_v2 from '+ident(backendInstaller)),
    expectedName:'native_comparison_owner_membership',expectedStage:'display_verifier_assertion'
   })
   assert.equal((await root.query('select count(*)::int n from mip_comparison_install.native_programs')).rows[0].n,1)
  })

  if(display)await t.test('real committed v5 then closed history preserves transport and current boundaries; history rolls back before independent audit',async()=>{
   stage='ordered_history'
   const historyOperation='6'.repeat(32)
   const transport=async db=>(await db.query(`select e.oid::text extension_oid,e.extname,e.extversion,e.extowner::text,e.extnamespace::text,e.extrelocatable,e.extconfig,e.extcondition,
     n.nspname,n.nspowner::text,n.nspacl::text,p.oid::text,p.proname,p.proargtypes::text,p.proowner::text,p.proacl::text,
     p.prosecdef,p.proconfig,p.provolatile,p.proparallel,p.proleakproof,md5(p.prosrc) source_digest
     from pg_extension e join pg_namespace n on n.oid=e.extnamespace
     join pg_proc p on p.pronamespace=n.oid where e.extname='dblink' order by p.oid`)).rows
   const schemas=async db=>(await db.query('select oid::text,nspname,nspowner::text,nspacl::text from pg_namespace order by nspname')).rows
   const beforeTransport=await transport(principal),beforeRoles=await roleCatalog(principal),
    beforeEdges=await edgeCatalog(principal),beforeSchemas=await schemas(principal)
   assert.ok(beforeTransport.length>0)
   assert.ok(beforeTransport.every(r=>r.nspname==='mip_factual_transport'))
   assert.equal((await principal.query("select to_regnamespace('vault') is null and to_regnamespace('mip_history') is null and to_regnamespace('mip_history_transport') is null absent")).rows[0].absent,true)
   const historyInstaller=Buffer.from(await read('supabase/qualification/historical-qik-executor/install.mjs'))
   assert.equal(createHash('sha1').update(Buffer.from('blob '+historyInstaller.length+'\0')).update(historyInstaller).digest('hex'),'d4c72b5e2ff50ce19d46de9c6911135fc0216f48')
   const historical=await prepareClosedHistoricalInstall(read)
   assert.equal(historical.blob,'6fe6035223de1dac94fba6c238e33324bc0ca266')
   let vaultReady=false,historyBegun=false,historyPrimary=null,historyStage='vault_fixture'
   const historyCleanup=[]
   try{
    // Empty synthetic shape only. No Vault extension, encryption, secret row,
    // acquisition, source connection, or hosted Vault compatibility is qualified.
    // Root commits this isolated shape so the separately authenticated installer
    // can see it; finally removes these exact objects AFTER historical ROLLBACK.
    await root.query('begin')
    try{
     await root.query('create schema vault authorization postgres')
     await root.query('revoke all on schema vault from public,anon,authenticated,service_role')
     await root.query('create table vault.synthetic_fixture_secrets(id uuid primary key,decrypted_secret text not null)')
     await root.query('create view vault.decrypted_secrets as select id,decrypted_secret from vault.synthetic_fixture_secrets')
     await root.query('revoke all on vault.synthetic_fixture_secrets,vault.decrypted_secrets from public,anon,authenticated,service_role')
     await root.query('grant usage on schema vault to '+ident(backendInstaller))
     await root.query('grant select on vault.decrypted_secrets to '+ident(backendInstaller))
     await root.query('commit');vaultReady=true
    }catch(error){await root.query('rollback');throw error}
    assert.equal((await principal.query(`select
      (select nspowner='postgres'::regrole from pg_namespace where nspname='vault') and
      (select bool_and(relowner='postgres'::regrole) from pg_class where relnamespace='vault'::regnamespace and relkind in('r','v')) and
      has_schema_privilege(current_user,'vault','USAGE') and not has_schema_privilege(current_user,'vault','CREATE') and
      has_table_privilege(current_user,'vault.decrypted_secrets','SELECT') and
      not has_table_privilege(current_user,'vault.synthetic_fixture_secrets','SELECT') and
      not has_table_privilege(current_user,'vault.decrypted_secrets','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and
      (select count(*)=0 from vault.decrypted_secrets) ok`)).rows[0].ok,true)
    historyStage='historical_begin';await principal.query('begin');historyBegun=true
    const identity=(await principal.query('select session_user::text login,current_user::text effective,rolsuper from pg_roles where rolname=current_user')).rows[0]
    assert.deepEqual(identity,{login:backendInstaller,effective:backendInstaller,rolsuper:false})
    historyStage='historical_install'
    const installed=await installClosedHistoricalInTransaction(principal,historical,{expectedLogin:backendInstaller,operationId:historyOperation})
    assert.deepEqual(installed,{state:'installed_in_transaction',committed:false,production_qualified:false})
    historyStage='historical_current_assertion'
    await principal.query(historical.assertion)
    historyStage='historical_helper_assertion'
    assert.ok(historical.helper.indexOf('as $$')>=0&&historical.helper.lastIndexOf('$$;')>historical.helper.indexOf('as $$'))
    const helper=(await principal.query(`select p.proowner=$1::regrole and p.prosecdef and p.pronargs=1
      and p.proargtypes='2950'::oidvector and p.prorettype='text'::regtype
      and p.prosrc=$2 and p.proconfig=array['search_path=pg_catalog, mip_history, mip_factual_transport','statement_timeout=110s','lock_timeout=3s']::text[]
      and has_function_privilege('mip_history_owner',p.oid,'EXECUTE')
      and not has_function_privilege('mip_history_executor',p.oid,'EXECUTE')
      and not has_schema_privilege('mip_history_owner','mip_factual_transport','USAGE')
      and not has_schema_privilege('mip_history_executor','mip_factual_transport','USAGE')
      and not has_table_privilege('mip_history_owner','vault.decrypted_secrets','SELECT')
      and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee not in($1::regrole,'mip_history_owner'::regrole) or a.privilege_type<>'EXECUTE'
        or (a.grantee<>p.proowner and a.is_grantable)) ok
      from pg_proc p where p.oid='mip_history_transport.acquire_original(uuid)'::regprocedure`,
      [backendInstaller,historical.helper.slice(historical.helper.indexOf('as $$')+5,historical.helper.lastIndexOf('$$;'))])).rows[0]
    assert.equal(helper?.ok,true)
    historyStage='historical_closed_state'
    assert.equal((await principal.query('select (select count(*) from mip_history.route)+(select count(*) from mip_history.source_contract)+(select count(*) from mip_history.family_contract)+(select count(*) from mip_history.export)=0 closed')).rows[0].closed,true)
    assert.deepEqual(await transport(principal),beforeTransport)
    assert.deepEqual(await edgeCatalog(principal),beforeEdges)
    historyStage='main_boundary_with_history'
    // This same transaction sees the actual uncommitted history objects. No
    // autonomous observer is claimed to see them; the audit runs AFTER rollback.
    await verifyNativeDisplayCurrentBoundary(principal,plan.native,cfg)
    await assertNativeGovernedClosure(principal,cfg)
   }catch(error){
    historyPrimary={stage:historyStage,
     installer_stage:['plan','principal','transport','roles','body','helper','cleanup','assertion'].includes(error?.stage)?error.stage:null,
     sqlstate:/^[A-Z0-9]{5}$/.test(error?.sqlstate??error?.code??'')?(error.sqlstate??error.code):null,
     position:numericPosition(error?.position),internal_position:numericPosition(error?.internalPosition)}
   }finally{
    // Always attempt rollback first, even when the history install/assertion
    // failed. Never drop the root-owned fixture while its dependent tx is open.
    let rolledBack=!historyBegun
    if(historyBegun)try{await principal.query('rollback');rolledBack=true}catch{historyCleanup.push('historical_rollback')}
    if(vaultReady&&rolledBack)try{
     await root.query('begin')
     try{
      await root.query('drop view vault.decrypted_secrets')
      await root.query('drop table vault.synthetic_fixture_secrets')
      await root.query('drop schema vault')
      await root.query('commit');vaultReady=false
     }catch(error){await root.query('rollback');throw error}
    }catch{historyCleanup.push('synthetic_vault_removal')}
    if(vaultReady&&!rolledBack)historyCleanup.push('synthetic_vault_removal_deferred')
   }
   if(historyPrimary||historyCleanup.length)throw Error('ordered_history_qualification_failed:'+JSON.stringify({primary:historyPrimary,cleanup:historyCleanup}))
   assert.deepEqual(await transport(principal),beforeTransport)
   assert.deepEqual(await roleCatalog(principal),beforeRoles)
   assert.deepEqual(await edgeCatalog(principal),beforeEdges)
   assert.deepEqual(await schemas(principal),beforeSchemas)
   assert.equal((await principal.query("select to_regnamespace('vault') is null and to_regnamespace('mip_history') is null and to_regnamespace('mip_history_transport') is null and not exists(select 1 from pg_roles where rolname=any($1)) absent",[['mip_history_owner','mip_history_executor','mip_hci_'+historyOperation]])).rows[0].absent,true)
   await verifyNativeDisplayCurrentBoundary(principal,plan.native,cfg)
   await assertNativeGovernedClosure(principal,cfg)
  })

  if(caller)await t.test('v6 committed caller has complete fixed final boundary after both genuine creator cleanups',async()=>{
   await verifyNativeCallerCurrentBoundary(principal,plan.native,cfg)
   assert.deepEqual((await root.query("select has_schema_privilege('mip_arc_native_owner','auth','USAGE,CREATE') auth_schema,has_schema_privilege('mip_arc_native_owner','mip_native_caller','USAGE,CREATE') caller_schema,has_column_privilege('mip_arc_native_owner','auth.sessions','not_after','SELECT') expiry_read")).rows[0],
    {auth_schema:false,caller_schema:false,expiry_read:false})
   // The actual restricted fixed verifier above must inspect complete current
   // Auth/caller ACLs by catalog OID, without gaining either schema's USAGE.

   const verifier=(await root.query("select pg_get_userbyid(p.proowner) owner,p.pronargs,p.prorettype::regtype::text result,p.prosecdef,p.proconfig,p.prosrc,not has_schema_privilege(p.proowner,n.oid,'USAGE,CREATE') isolated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid='mip_comparison_install.native_boundary_v6()'::regprocedure")).rows[0]
   assert.equal(verifier.owner,'mip_arc_native_owner');assert.equal(verifier.pronargs,0)
   assert.equal(verifier.result,'void');assert.equal(verifier.prosecdef,true);assert.equal(verifier.isolated,true)
   assert.deepEqual(verifier.proconfig,['search_path=""'])
   assert.equal(verifier.prosrc.startsWith('begin execute '+"'"+plan.native.steps.at(-1).assertion.replaceAll("'","''")+'\n'),true)
   const bootstrap=(await root.query("select p.rolname role_name,p.oid::text role_oid,m.rolname member_name,m.oid::text member_oid,g.oid::text grantor_oid,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where p.rolname in('mip_mentions_admin','mip_mentions_gateway') or m.rolname in('mip_mentions_admin','mip_mentions_gateway') order by p.rolname,m.rolname,g.oid")).rows
   assert.equal(bootstrap.length,2)
   assert.deepEqual(bootstrap.map(e=>[e.role_name,e.member_name,e.admin_option,e.inherit_option,e.set_option]),[['mip_mentions_admin',backendInstaller,true,false,false],['mip_mentions_gateway',backendInstaller,true,false,false]])
   assert.equal(verifier.prosrc.includes(JSON.stringify(bootstrap)),true)
   assert.match(verifier.prosrc,/native_caller_bootstrap/)
   const v5=await prepareAtomicInstall(read,{nativeMode:NATIVE_DISPLAY_MODE})
   assert.equal(plan.native.steps.at(-1).assertion.startsWith(v5.native.steps.at(-1).assertion+'\n'),true)
   assert.equal((await root.query("select count(*)::int n from pg_proc where pronamespace='mip_native_caller'::regnamespace")).rows[0].n,6)
   assert.equal((await root.query("select count(*)::int n from pg_class where relnamespace='mip_native_caller'::regnamespace and relkind='r'")).rows[0].n,2)
   assert.equal((await root.query("select count(*)::int n from mip_native_caller.admissions")).rows[0].n,0)
   assert.equal((await root.query("select count(*)::int n from auth.sessions")).rows[0].n,0)
   for(const role of ['anon','authenticated','service_role','mip_mentions_gateway','mip_efta_auth_session_owner_v1'])
    assert.equal((await root.query("select has_function_privilege($1,'mip_comparison_install.native_boundary_v6()','EXECUTE') allowed",[role])).rows[0].allowed,false)
   await assert.rejects(principal.query('set role mip_efta_auth_session_owner_v1'),e=>e.code==='42501')
   assert.equal((await root.query("select count(*)::int n from pg_auth_members where roleid='mip_efta_auth_session_owner_v1'::regrole or member='mip_efta_auth_session_owner_v1'::regrole")).rows[0].n,0)
  })
  if(caller)await t.test('v6 fresh reconciliation detects caller Auth, helper and owner drift while preserving every prior boundary',async()=>{
   const pristine=await edgeCatalog(root)
   const mutation=async(apply,restore,expectedStage)=>{
    try{
     await apply();const observed=await reconcileComparisonInstall(cfg,read)
     assert.equal(observed.state,'reconciliation_unavailable')
     assert.equal(observed.needs_reconciliation,true)
     assert.equal(observed.phase,'native_reconciliation')
     assert.equal(observed.native_failure?.stage,expectedStage)
    }finally{await restore()}
    const restored=await reconcileComparisonInstall(cfg,read)
    assert.equal(restored.state,'installed_disabled_audit_pending')
    assert.equal(restored.needs_reconciliation,false)
    assert.deepEqual(await edgeCatalog(root),pristine)
   }
   assert.equal((await root.query("select has_function_privilege('mip_mentions_admin','mip_native_caller.configure_admission(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean)','EXECUTE') and not has_function_privilege('mip_mentions_admin','mip_native_caller.configure(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean)','EXECUTE') allowed")).rows[0].allowed,true)
   await mutation(
    ()=>root.query('grant execute on function mip_native_caller.configure_admission(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean) to mip_mentions_gateway'),
    ()=>root.query('revoke execute on function mip_native_caller.configure_admission(uuid,uuid,uuid,uuid,uuid,text,name,uuid,text,timestamptz,timestamptz,boolean) from mip_mentions_gateway'),
    'caller_verifier_assertion')
   await mutation(
    ()=>root.query('grant execute on function mip_native_caller.assert_session(uuid,uuid,bigint) to public'),
    ()=>root.query('revoke execute on function mip_native_caller.assert_session(uuid,uuid,bigint) from public'),
    'caller_verifier_assertion')
   await mutation(
    ()=>root.query('grant create on schema mip_native_caller to mip_mentions_gateway'),
    ()=>root.query('revoke create on schema mip_native_caller from mip_mentions_gateway'),
    'caller_verifier_assertion')
   await mutation(
    ()=>root.query('revoke select(not_after) on auth.sessions from mip_efta_auth_session_owner_v1'),
    ()=>root.query('grant select(not_after) on auth.sessions to mip_efta_auth_session_owner_v1'),
    'caller_verifier_assertion')
   await mutation(
    ()=>root.query('grant mip_efta_auth_session_owner_v1 to '+ident(backendInstaller)),
    ()=>root.query('revoke mip_efta_auth_session_owner_v1 from '+ident(backendInstaller)),
    'caller_verifier_assertion')
   const original=(await root.query("select pg_get_functiondef('mip_comparison_install.native_boundary_v6()'::regprocedure) definition")).rows[0].definition
   await mutation(
    ()=>root.query("create or replace function mip_comparison_install.native_boundary_v6() returns void language plpgsql security definer set search_path='' as 'begin return; end'"),
    ()=>root.query(original),'caller_verifier_source')
   await mutation(
    ()=>root.query('grant execute on function mip_native_display.accepted_event(uuid,text,jsonb) to mip_mentions_gateway'),
    ()=>root.query('revoke execute on function mip_native_display.accepted_event(uuid,text,jsonb) from mip_mentions_gateway'),
    'caller_verifier_assertion')
   await verifyNativeCallerCurrentBoundary(principal,plan.native,cfg)
   await principal.query(plan.assertions);await principal.query(plan.dojAssertions);await principal.query(plan.compatibility)
  })

  if(caller)await t.test('v6 fixed verifier rejects changed grantor topology and restores the exact observed automatic edges',async()=>{
   const baseline=await edgeCatalog(root)
   const grant=(await root.query("select g.rolname grantor from pg_auth_members a join pg_roles g on g.oid=a.grantor where roleid='mip_mentions_gateway'::regrole and member=$1::regrole",[backendInstaller])).rows
   assert.equal(grant.length,1)
   const alternate=grant[0].grantor===backendInstaller?'postgres':backendInstaller
   assert.notEqual(alternate,grant[0].grantor)
   await root.query('begin')
   try{
    // PG17 forbids granting ADMIN back through the grantor's own chain.
    // This alternate grant conveys no ADMIN, inherited privileges or SET path;
    // the original automatic ADMIN-only edge remains untouched.
    await root.query('grant mip_mentions_gateway to '+ident(backendInstaller)+' with admin false,inherit false,set false granted by '+ident(alternate))
    const observed=(await root.query("select g.rolname grantor,a.admin_option,a.inherit_option,a.set_option from pg_auth_members a join pg_roles g on g.oid=a.grantor where a.roleid='mip_mentions_gateway'::regrole and a.member=$1::regrole order by g.rolname",[backendInstaller])).rows
    assert.equal(observed.length,2)
    assert.deepEqual(observed.find(e=>e.grantor===grant[0].grantor),{grantor:grant[0].grantor,admin_option:true,inherit_option:false,set_option:false})
    assert.deepEqual(observed.find(e=>e.grantor===alternate),{grantor:alternate,admin_option:false,inherit_option:false,set_option:false})
    assert.equal((await root.query("select pg_has_role($1,'mip_mentions_gateway','USAGE') or pg_has_role($1,'mip_mentions_gateway','SET') expanded",[backendInstaller])).rows[0].expanded,false)
    assert.notDeepEqual(await edgeCatalog(root),baseline)
    await assert.rejects(root.query('select mip_comparison_install.native_boundary_v6()'),e=>e.code==='P0001')
   }finally{await root.query('rollback')}
   assert.deepEqual(await edgeCatalog(root),baseline)
   await verifyNativeCallerCurrentBoundary(principal,plan.native,cfg)
  })
  if(caller)await t.test('actual retained non-owner ADMIN grantor can provision scoped runtime callers after commit, then restore disabled closure',async()=>{
   const adminLogin='native_caller_admin_probe',gatewayLogin='native_caller_gateway_probe'
   const roles=await roleCatalog(root),edges=await edgeCatalog(root)
   const scope='92000000-0000-0000-0000-000000000001',revision='92000000-0000-0000-0000-000000000002'
   const user='92000000-0000-0000-0000-000000000003',bindingId='92000000-0000-0000-0000-000000000004',broker='92000000-0000-0000-0000-000000000005'
   const configure='select mip_native_caller.configure_admission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)'
   const args=[revision,null,user,scope,bindingId,'0'.repeat(64),gatewayLogin,broker,'synthetic-installer-proof','2026-01-01T00:00:00Z','2099-01-01T00:00:00Z',true]
   let adminSession,gatewaySession,adminCreated=false,gatewayCreated=false,primary=null;const cleanup=[]
   try{
    for(const role of [adminLogin,gatewayLogin]){
     await principal.query('create role '+ident(role)+" login nosuperuser nocreatedb nocreaterole inherit nobypassrls noreplication password '"+password+"'")
     if(role===adminLogin)adminCreated=true;else gatewayCreated=true
    }
    await principal.query('grant mip_mentions_admin to '+ident(adminLogin)+' with admin false,inherit true,set false')
    await principal.query('grant mip_mentions_gateway to '+ident(gatewayLogin)+' with admin false,inherit true,set false')
    adminSession=await connect(adminLogin);gatewaySession=await connect(gatewayLogin)
    for(const [client,login]of [[adminSession,adminLogin],[gatewaySession,gatewayLogin]]){
     assert.deepEqual((await client.query('select session_user::text principal,current_user::text effective')).rows[0],{principal:login,effective:login})
     for(const owner of NATIVE_ROLES.filter(r=>!['mip_mentions_admin','mip_mentions_gateway'].includes(r)))await assert.rejects(client.query('set role '+ident(owner)),e=>e.code==='42501')
     await assert.rejects(client.query('select * from mip_native_caller.admissions'),e=>e.code==='42501')
    }
    // Runtime memberships are deliberately outside the disabled profile.
    assert.equal((await reconcileComparisonInstall(cfg,read)).state,'reconciliation_unavailable')
    await assert.rejects(gatewaySession.query(configure,args),e=>e.code==='42501')
    await assert.rejects(adminSession.query(configure,args),e=>e.code==='P0001'&&e.message==='scope access denied')
    await adminSession.query('select mip_mentions.set_membership($1,$2,false)',[scope,adminLogin])
    await assert.rejects(adminSession.query(configure,args),e=>e.code==='P0001'&&e.message==='scope access denied')
    await adminSession.query('select mip_mentions.set_membership($1,$2,true)',[scope,adminLogin])
    await adminSession.query(configure,args);await adminSession.query(configure,args)
    assert.equal((await root.query('select count(*)::int n from mip_native_caller.admissions where revision=$1',[revision])).rows[0].n,1)
    await assert.rejects(adminSession.query(configure.replace('configure_admission','configure'),args),e=>e.code==='42501')
    await assert.rejects(gatewaySession.query('select mip_native_caller.read_current($1,$2,$3,$4,$5,$6)',[user,broker,1,scope,bindingId,'0'.repeat(64)]),e=>e.code==='P0001')
    const revoked=[...args];revoked[0]='92000000-0000-0000-0000-000000000006';revoked[1]=revision;revoked[11]=false
    await adminSession.query(configure,revoked)
    await adminSession.query('select mip_mentions.set_membership($1,$2,null)',[scope,adminLogin])
   }catch(error){primary={sqlstate:/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'NONE',frames:String(error?.stack??'').split('\n').slice(1).flatMap(line=>line.match(/nativeGovernedInstallerPostgres17\.test\.mjs:\d{1,6}:\d{1,6}/g)??[]).slice(0,3)}}
   finally{
    if(adminSession)try{await adminSession.query('select mip_mentions.set_membership($1,$2,null)',[scope,adminLogin])}catch{cleanup.push('membership')}
    for(const [name,client]of [['admin',adminSession],['gateway',gatewaySession]])if(client)try{await client.end()}catch{cleanup.push('close_'+name)}
    for(const [name,group,created]of [[gatewayLogin,'mip_mentions_gateway',gatewayCreated],[adminLogin,'mip_mentions_admin',adminCreated]])if(created){
     try{await principal.query('revoke '+ident(group)+' from '+ident(name))}catch{cleanup.push('revoke_group')}
     try{await principal.query('drop role '+ident(name))}catch{cleanup.push('drop_login')}
    }
   }
   if(primary||cleanup.length)throw Error('native_runtime_bootstrap_fixture_failed:'+JSON.stringify({primary,cleanup}))
   assert.deepEqual(await roleCatalog(root),roles);assert.deepEqual(await edgeCatalog(root),edges)
   await verifyNativeCallerCurrentBoundary(principal,plan.native,cfg)
   assert.equal((await reconcileComparisonInstall(cfg,read)).state,'installed_disabled_audit_pending')
  })
  // The autonomous audit observes the surviving main installation only, after
  // the ordered historical transaction and synthetic Vault fixture are gone.
  stage='audit';const audited=await qualifyComparisonAudit(cfg,read)
  await t.test('actual autonomous comparison audit qualifies while all activation fences stay closed',async()=>{
   assert.equal(audited.state,'installed_disabled_audit_qualified')
   assert.equal(audited.activation_allowed,false)
   assert.equal((await root.query('select count(*)::int n from mip_identity.efta_scope')).rows[0].n,0)
   assert.equal((await root.query('select count(*)::int n from mip_identity.doj_policy_versions')).rows[0].n,0)
   assert.equal((await root.query('select bool_and(not collection_authorized) closed from qik_ingest.collection_gate')).rows[0].closed,true)
   assert.equal((await root.query('select count(*)::int n from qik_ingest.schedule_intent where active')).rows[0].n,0)
  })
  await t.test('real cleanup leaves no owner SET path, helper, role edge or native data API expansion',async()=>{
   await assertNativeGovernedClosure(principal,cfg)
   for(const role of NATIVE_ROLES)await assert.rejects(principal.query('set role '+ident(role)),e=>e.code==='42501')
   for(const role of ['anon','authenticated','service_role']){
    assert.equal((await root.query("select bool_or(has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) bad from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('mip_mentions','mip_arc_native','mip_arc_qik_source','mip_arc_projection_private','mip_native_comparison','mip_native_display','mip_native_caller') and c.relkind='r'",[role])).rows[0].bad,false)
   }
   assert.equal((await root.query("select count(*)::int n from pg_roles where rolname like 'mip_nci_%' or rolname like 'mip_tmp_%'")).rows[0].n,0)
   assert.equal((await root.query("select count(*)::int n from pg_namespace where nspname like 'mip_nca_%'")).rows[0].n,0)
  })
 }catch(error){primary={stage,code:/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:'assertion',name:['Error','error','AssertionError'].includes(error?.name)?error.name:null,position:numericPosition(error?.position),internal_position:numericPosition(error?.internalPosition),installation:lastInstall}}
 finally{
  for(const [name,c]of [['principal',principal],['root',root]])if(c)try{await c.end()}catch{cleanup.push('close_'+name)}
  if(armed){
   let clean
   try{
    clean=new pg.Client({host:'127.0.0.1',port:5432,database:'template1',user:'postgres',password,connectionTimeoutMillis:5000,query_timeout:20000,statement_timeout:15000})
    await clean.connect()
    const created=(await roleCatalog(clean)).map(r=>r.rolname).filter(r=>!baseline.includes(r))
    const allowed=new Set([...RESERVED_ROLES,...NATIVE_ROLES,backendInstaller,backendAudit,'anon','authenticated','service_role','qik_ingest_fn_owner','qik_ingest_runtime','mip_tmp_'+'2'.repeat(32),'mip_nci_'+'2'.repeat(32),'mip_history_owner','mip_history_executor','mip_hci_'+'6'.repeat(32),'native_caller_admin_probe','native_caller_gateway_probe'])
    if(!created.every(r=>allowed.has(r)))throw Error('unexpected_role')
    await clean.query("select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres' and pid<>pg_backend_pid()")
    await clean.query('drop database postgres')
    await clean.query('create database postgres owner postgres')
    for(const role of created)await clean.query('drop role '+ident(role))
    assert.deepEqual((await roleCatalog(clean)).map(r=>r.rolname),baseline)
   }catch{cleanup.push('cluster_baseline')}
   finally{if(clean)try{await clean.end()}catch{cleanup.push('close_cleanup')}}
  }
  if(primary||cleanup.length)throw Error('native_install_qualification_failed:'+JSON.stringify({primary,cleanup}))
 }
})
async function assertPristineFixture(db){
 const r=(await db.query(
  "select current_database() db,current_setting('server_version_num') v,session_user::text login,current_user::text effective,"+
  "(select jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createrole',rolcreaterole,'createdb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass',rolbypassrls,'limit',rolconnlimit,'until',rolvaliduntil,'config',rolconfig) order by rolname) from pg_roles) roles,"+
  "(select jsonb_agg(datname order by datname) from pg_database) databases,"+
  "(select jsonb_agg(nspname order by nspname) from pg_namespace) schemas,"+
  "(select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner)) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace) extensions,"+
  "(select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') public_relations,"+
  "(select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') public_functions,"+
  "(select count(*)::integer from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public') public_types,"+
  "(select count(*)::integer from pg_largeobject_metadata) large_objects,"+
  "(select count(*)::integer from pg_foreign_server)+(select count(*)::integer from pg_event_trigger)+(select count(*)::integer from pg_default_acl)+(select count(*)::integer from pg_publication)+(select count(*)::integer from pg_subscription) extras"
 )).rows[0]
 const names=['postgres','pg_database_owner','pg_read_all_data','pg_write_all_data','pg_monitor',
  'pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables','pg_read_server_files',
  'pg_write_server_files','pg_execute_server_program','pg_signal_backend','pg_checkpoint',
  'pg_use_reserved_connections','pg_create_subscription','pg_maintain'].sort()
 const goodRole=role=>{
  const admin=role.name==='postgres'
  return role.super===admin&&role.inherit===true&&role.createrole===admin
   &&role.createdb===admin&&role.login===admin&&role.replication===admin
   &&role.bypass===admin&&role.limit===-1&&role.until===null&&role.config===null
 }
 if(!r||r.db!=='postgres'||r.v!=='170006'||r.login!=='postgres'||r.effective!=='postgres'
  ||JSON.stringify(r.databases)!==JSON.stringify(['postgres','template0','template1'])
  ||JSON.stringify(r.schemas)!==JSON.stringify(['information_schema','pg_catalog','pg_toast','public'])
  ||r.extensions?.length!==1||r.extensions[0].name!=='plpgsql'||r.extensions[0].version!=='1.0'||r.extensions[0].schema!=='pg_catalog'||r.extensions[0].owner!=='postgres'
  ||r.public_relations!==0||r.public_functions!==0||r.public_types!==0||r.large_objects!==0||r.extras!==0
  ||JSON.stringify(r.roles?.map(x=>x.name))!==JSON.stringify(names)||!r.roles.every(goodRole))
  throw Error('atomic_fixture_not_pristine')
 const edges=(await db.query("select p.rolname parent,m.rolname member,a.admin_option admin,a.inherit_option inherit,a.set_option set from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member order by p.rolname,m.rolname")).rows
 assert.deepEqual(edges,['pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables'].map(parent=>({parent,member:'pg_monitor',admin:false,inherit:true,set:true})))
}

async function prepareFullBackend(root,selectedMode){
 let owner;
 try{
  await root.query("create role "+backendInstaller+" login superuser password '"+password+"'");
  await root.query('alter database postgres owner to '+ident(backendInstaller));
  owner=await connect(backendInstaller);
  await owner.query('create schema extensions;create extension pgcrypto with schema extensions;create extension vector with schema public;create extension dblink with schema extensions');
  assert.equal((await owner.query("select extversion from pg_extension where extname='vector'")).rows[0].extversion,'0.8.2');
  await owner.query(await read('supabase/qualification/qik-ingest/fixture_substrate.sql'));
  await owner.query('create schema auth');
  for(const relation of REQUIRED_RELATIONS.filter(r=>['public','auth'].includes(r.schema_name))){
   const exists=(await owner.query('select to_regclass($1) name',[relation.qualified])).rows[0].name;
   if(!exists){
    const columns=Object.entries(relation.requiredColumns);
    await owner.query('create table '+relation.qualified+' ('+(columns.length
     ?columns.map(([n,t])=>ident(n)+' '+t+(n==='id'?' primary key':'')).join(',')
     :'id uuid primary key,payload jsonb')+')');
   }else{
    const cols=new Set((await owner.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",[relation.qualified])).rows.map(x=>x.attname));
    for(const[n,t]of Object.entries(relation.requiredColumns))if(!cols.has(n))await owner.query('alter table '+relation.qualified+' add column '+ident(n)+' '+t);
   }
  }
  await owner.query(await read('supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'));
  for(const file of LOAD_ORDER){
   await owner.query(await read('supabase/qualification/qik-ingest/'+file));
   if(file!=='05_operation_ledger.sql')await owner.query('select qik_ingest_operation.capture_step($1)',[file]);
  }
  await owner.query('create table qik_ingest_operation.persistent_install_receipt(id boolean primary key,operation_id text,installer name,sql_manifest_sha256 text,runtime_login name,runtime_token_hash text,runtime_creator_grantor name,installed_at timestamptz default now())');
  await owner.query('insert into qik_ingest_operation.persistent_install_receipt(id,operation_id,installer,sql_manifest_sha256) values(true,$1,$2,$3)',['3'.repeat(32),backendInstaller,'1'.repeat(64)]);
  await owner.query("create role "+backendAudit+" login nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication password '"+password+"'");
  await owner.query('grant qik_ingest_fn_owner to '+ident(backendInstaller)+' with admin false,inherit true,set true');
  await root.query('alter function public.mip_pipeline_v1(text,jsonb) owner to postgres');
  await root.query('alter role '+ident(backendInstaller)+' nosuperuser createrole createdb bypassrls');
  await root.query("alter database postgres set session_preload_libraries='auto_explain'");
  await root.query("alter database postgres set auto_explain.log_min_duration='10000'");
  await root.query("alter database postgres set auto_explain.log_nested_statements='off'");
  await owner.end();owner=null;
  // Match the observed native source ownership/RLS shape before installation.
  const nativeBase=await connect(backendInstaller);
  try{
   await nativeBase.query("create table public.entities(id uuid primary key,canonical_name text,normalized_name text,type text,aliases text[],mention_count integer default 0,last_seen timestamptz);alter table public.story_arcs add column started_at date not null,add column title text,add column summary text,add column last_update_at timestamptz;alter table public.arc_membership_candidates add column article_id uuid,add column arc_id uuid,add column state text,add column updated_at timestamptz");
   await nativeBase.query("alter table public.articles enable row level security;alter table public.entities enable row level security;alter table public.story_arcs enable row level security;alter table public.pipeline_config enable row level security;alter table public.arc_membership_candidates enable row level security");
  }finally{await nativeBase.end()}
  if(selectedMode!==NATIVE_MODE){
   const selected=await connect(backendInstaller)
   try{
    for(const [relation,columns] of [
     ['articles',{reader_state:'text',source_status:'text'}],
     ['story_arcs',{category:'text',root_node_id:'uuid'}],
     ['nodes',{id:'uuid',type:'text'}],
     ['arc_milestones',{id:'uuid',arc_id:'uuid',milestone_key:'text',status:'text'}]
    ]){
     const existing=new Map((await selected.query("select attname,format_type(atttypid,atttypmod) type from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",['public.'+relation])).rows.map(x=>[x.attname,x.type]))
     for(const [name,type] of Object.entries(columns)){
      if(existing.has(name))assert.equal(existing.get(name),type)
      else await selected.query('alter table public.'+ident(relation)+' add column '+ident(name)+' '+type)
     }
    }
    await selected.query('alter table public.nodes enable row level security;alter table public.arc_milestones enable row level security')
   }finally{await selected.end()}
  }
  if(selectedMode===NATIVE_CALLER_MODE){
   const shape=await connect(backendInstaller)
   try{await shape.query('alter table auth.sessions add column if not exists not_after timestamptz')}
   finally{await shape.end()}
  }
  const plan=await prepareAtomicInstall(read,{nativeMode:selectedMode});
  const pre=await connect(backendInstaller);
  let metadata;
  try{metadata=(await pre.query(DBLINK_PREFLIGHT_SQL)).rows[0];assert.equal(metadata.expected,true);assert.equal(metadata.unused,true);assert.equal(metadata.no_servers,true)}
  finally{await pre.end()}
  const url=name=>'postgresql://'+name+':'+password+'@127.0.0.1:5432/postgres';
  const cfg={authorization:nativeAuthorization(selectedMode),nativeMode:selectedMode,operationId:'2'.repeat(32),
   expectedLogin:backendInstaller,connectionString:url(backendInstaller),c3OperationId:'3'.repeat(32),c3ManifestSha256:'1'.repeat(64),
   expectedManifestSha256:plan.manifest_sha256,expectedNativeProgramSha256:plan.native.program_sha256,dblinkMetadataSha256:metadata.metadata_sha256,collectorSource:'qik-fixture-v1',
   auditLogin:backendAudit,auditConnectionString:url(backendAudit),disposable:true};
  return {cfg,plan};
 }finally{if(owner)await owner.end()}
}
