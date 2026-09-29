// Actual managed successor integration. Only fresh armed disposable PG17.6.
// Synthetic source substrate reuses the historical ordered dependency files;
// provider setup is distinct from genuine nonsuper provision/install/audit/retirement.
import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {readFile} from 'node:fs/promises'
import {randomBytes,randomUUID} from 'node:crypto'
import {REQUIRED_RELATIONS} from '../qik-comparison-adapter/catalogPreflight.mjs'
import {LOAD_ORDER} from '../qik-ingest/installQikIngest.mjs'
import {NATIVE_MODE,NATIVE_CALLER_MODE} from '../native-governed-install/install.mjs'
import {PROFILE as ACTIVATION_PROFILE} from '../native-governed-activation/prepare.mjs'
import {prepareAtomicInstall,installComparisonAtomic,reconcileComparisonInstall,qualifyComparisonAudit} from '../qik-comparison-adapter/atomicInstall.mjs'
import {auditNativeActivationMetadata} from '../native-governed-activation/audit.mjs'
import {provisionManagedPrerequisites} from './provision.mjs'
import {retireManagedAuditors} from './retirement.mjs'
const read=p=>readFile(new URL('../../../'+p,import.meta.url),'utf8')
const backendInstaller='postgres',password=process.env.MIP_COMPAT_CUSTOMER_PASSWORD
const ident=s=>{assert.match(s,/^[a-z][a-z0-9_]{0,62}$/);return '"'+s+'"'}
const uri=(name,pw)=>'postgresql://'+name+':'+encodeURIComponent(pw)+'@127.0.0.1:5432/postgres'
async function connect(user='postgres',pass=password,database='postgres'){
 const db=new pg.Client({host:'127.0.0.1',port:5432,database,user,password:pass,connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000})
 await db.connect();return db
}
async function transferSyntheticOwnership(provider){
 const schemas=['public','evidence_pipeline','qik_ingest','qik_ingest_operation']
 // Only source-fixture objects owned by the synthetic provider are reassigned.
 // Extension members and objects already owned by protected source roles stay unchanged.
 const relations=(await provider.query("select n.nspname,c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1) and c.relowner=current_user::regrole and c.relkind in('r','p','S','v','m') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and (c.relkind<>'S' or not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.refclassid='pg_class'::regclass and d.deptype in('a','i')))",[schemas])).rows
 for(const r of relations)await provider.query('alter '+({S:'sequence',v:'view',m:'materialized view'}[r.relkind]??'table')+' '+ident(r.nspname)+'.'+ident(r.relname)+' owner to postgres')
 const functions=(await provider.query("select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=any($1) and p.proowner=current_user::regrole and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')",[schemas])).rows
 for(const r of functions)await provider.query('alter function '+r.signature+' owner to postgres')
 for(const name of schemas)await provider.query('alter schema '+ident(name)+' owner to postgres')
 assert.equal((await provider.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1) and c.relowner=current_user::regrole and c.relkind in('r','p','S','v','m') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')",[schemas])).rows[0].n,0)
}
async function prepareSourcePrerequisites(root,selectedMode,step){
 let owner;
 try{
  owner=root;
  step('fixture-provider-extensions');
  await owner.query('create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;create extension if not exists vector with schema public');
  assert.equal((await owner.query("select extversion from pg_extension where extname='vector'")).rows[0].extversion,'0.8.2');
  step('fixture-source-substrate');
  await owner.query(await read('supabase/qualification/qik-ingest/fixture_substrate.sql'));
  await owner.query('create schema if not exists auth');
  for(const relation of REQUIRED_RELATIONS.filter(r=>['public','auth'].includes(r.schema_name))){
   step('fixture-required-'+relation.qualified);
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
  step('fixture-pipeline');
  await owner.query(await read('supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'));
  for(const file of LOAD_ORDER){
   step('fixture-ordered-'+file);
   await owner.query(await read('supabase/qualification/qik-ingest/'+file));
   if(file!=='05_operation_ledger.sql')await owner.query('select qik_ingest_operation.capture_step($1)',[file]);
  }
  await owner.query('create table qik_ingest_operation.persistent_install_receipt(id boolean primary key,operation_id text,installer name,sql_manifest_sha256 text,runtime_login name,runtime_token_hash text,runtime_creator_grantor name,installed_at timestamptz default now())');
  await owner.query('insert into qik_ingest_operation.persistent_install_receipt(id,operation_id,installer,sql_manifest_sha256) values(true,$1,$2,$3)',['3'.repeat(32),backendInstaller,'1'.repeat(64)]);
  await owner.query('grant qik_ingest_fn_owner to '+ident(backendInstaller)+' with admin false,inherit true,set true');
  await root.query('alter function public.mip_pipeline_v1(text,jsonb) owner to postgres');
  step('fixture-source-ownership');
  await transferSyntheticOwnership(root);
  owner=null;
  // Match the observed native source ownership/RLS shape before installation.
  step('fixture-customer-native-shape');
  const nativeBase=await connect(backendInstaller);
  try{
   await nativeBase.query("create table public.entities(id uuid primary key,canonical_name text,normalized_name text,type text,aliases text[],mention_count integer default 0,last_seen timestamptz);alter table public.story_arcs add column started_at date not null,add column title text,add column summary text,add column last_update_at timestamptz;alter table public.arc_membership_candidates add column article_id uuid,add column arc_id uuid,add column state text,add column updated_at timestamptz");
   await nativeBase.query("alter table public.articles enable row level security;alter table public.entities enable row level security;alter table public.story_arcs enable row level security;alter table public.pipeline_config enable row level security;alter table public.arc_membership_candidates enable row level security");
  }finally{await nativeBase.end()}
  if(selectedMode!==NATIVE_MODE){
   step('fixture-customer-selected-shape');
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
   step('fixture-auth-prerequisite-readback');
   const shape=await connect(backendInstaller)
   try{assert.equal((await shape.query("select format_type(atttypid,atttypmod) kind from pg_attribute where attrelid='auth.sessions'::regclass and attname='not_after' and not attisdropped")).rows[0]?.kind,'timestamp with time zone')}
   finally{await shape.end()}
  }
 }finally{}
}

test('managed provision, full disabled installation, independent audits and terminal auditor retirement',async()=>{
 for(const key of ['MIP_MANAGED_PROVISIONING_ARM','MIP_QIK_COMPARISON_DISPOSABLE','MIP_NATIVE_ACTIVATION_ARM'])assert.equal(process.env[key],'synthetic-pg17-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 const provider=await connect('supabase_admin',process.env.MIP_COMPAT_ADMIN_PASSWORD)
 let owned=false,phase='pristine',observed=null,failed=false
 const before=(await provider.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname)
 const provision={provisioningProfile:'supabase-managed-v1',operationId:'4'.repeat(32),expectedLogin:'postgres',auditLogin:'mip_native_audit_v1',expectedMetadataAuditor:'mip_native_metadata_audit_v1',c3OperationId:'3'.repeat(32),c3ManifestSha256:'1'.repeat(64),disposable:true}
 const secrets={installer:uri('postgres',password),audit:uri(provision.auditLogin,randomBytes(36).toString('base64url')),metadataAudit:uri(provision.expectedMetadataAuditor,randomBytes(36).toString('base64url')),caPem:''}
 try{
  assert.equal((await provider.query("select current_setting('server_version_num') v")).rows[0].v,'170006')
  phase='pristine-schemas'
  assert.equal((await provider.query("select count(*)::int n from pg_namespace where nspname in('evidence_pipeline','qik_ingest','qik_ingest_operation','mip_managed_provisioning','mip_native_activation')")).rows[0].n,0)
  // The managed image includes provider Auth infrastructure. It is not
  // application residue and must not be dropped or customer-reowned.
  phase='provider-auth-baseline'
  assert.equal((await provider.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='auth' and r.rolname not in('supabase_auth_admin','supabase_admin')")).rows[0].n,0)

  phase='pristine-application-relations'
  assert.equal((await provider.query("select count(*)::int n from pg_class c where relnamespace='public'::regnamespace and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')")).rows[0].n,0)
  phase='pristine-dblink'
  assert.equal((await provider.query("select count(*)::int n from pg_extension where extname='dblink'")).rows[0].n,0)
  owned=true;phase='real-ordered-source-prerequisites'
  await prepareSourcePrerequisites(provider,NATIVE_CALLER_MODE,step=>{phase=step})
  phase='actual-managed-provision'
  observed=await provisionManagedPrerequisites(provision,secrets)
  assert.equal(observed.state,'provisioned_authentication_verified')
  const customer=await connect()
  let receipt
  try{receipt=(await customer.query('select * from mip_managed_provisioning.receipts')).rows[0]}
  finally{await customer.end()}
  const options={nativeMode:NATIVE_CALLER_MODE,activationProfile:ACTIVATION_PROFILE,expectedLogin:'postgres',operationId:'2'.repeat(32),expectedMetadataAuditor:provision.expectedMetadataAuditor,provisioningProfile:provision.provisioningProfile,provisioningOperationId:provision.operationId}
  const plan=await prepareAtomicInstall(read,options)
  const cfg={...options,authorization:'owner-authorized-native-governed-activation-bootstrap-install',connectionString:secrets.installer,auditLogin:provision.auditLogin,auditConnectionString:secrets.audit,c3OperationId:provision.c3OperationId,c3ManifestSha256:provision.c3ManifestSha256,expectedManifestSha256:plan.manifest_sha256,expectedNativeProgramSha256:plan.native.program_sha256,expectedSuccessorProgram:plan.activation.program_sha256,dblinkMetadataSha256:receipt.extension_metadata_sha256,collectorSource:'qik-fixture-v1',disposable:true}
  phase='full-managed-install'
  observed=await installComparisonAtomic(cfg,read)
  assert.equal(observed.state,'installed_disabled_audit_pending')
  assert.equal(observed.connection_cleanup_verified,true)
  phase='same-install-reconcile'
  observed=await reconcileComparisonInstall(cfg,read);assert.equal(observed.state,'installed_disabled_audit_pending')
  phase='post-install-credential-maintenance-refused'
  const connectionBefore=(await provider.query("select encode(sha256(convert_to(connection_string,'UTF8')),'hex') digest from mip_factual.audit_connection where id")).rows[0].digest
  for(const input of [secrets,{...secrets,audit:uri(provision.auditLogin,randomBytes(36).toString('base64url'))}]){
   observed=await provisionManagedPrerequisites(provision,input)
   assert.equal(observed.state,'provisioning_refused');assert.equal(observed.phase,'installed_phase')
   assert.equal(observed.connection_cleanup_verified,true)
  }
  assert.equal((await provider.query("select encode(sha256(convert_to(connection_string,'UTF8')),'hex') digest from mip_factual.audit_connection where id")).rows[0].digest,connectionBefore)
  phase='autonomous-audit'
  observed=await qualifyComparisonAudit(cfg,read);assert.equal(observed.audit_qualified,true)
  phase='rejected-publication-autonomous-persistence'
  const publisher=await connect()
  try{
   // Synthetic fixture source only, never a hosted article or publication.
   const source=randomUUID()
   await publisher.query("insert into public.articles(id,feed,outlet,title,url,reader_state,source_status) values($1,'fixture','fixture','fixture','https://news.example/guard/'||$1::text,'eligible','active')",[source])
   for(const rule of ['provenance','source_state','human_review']){
    const id=randomUUID(),assertion='fixture-managed-guard:'+id
    const sources=rule==='source_state'?[randomUUID()]:[source]
    await publisher.query('begin')
    try{
     await assert.rejects(publisher.query("insert into public.explanations(id,assertion_id,review_status,is_current,state,supporting_passage,archived_sources,falsification_condition,source_ids) values($1,$2,'published',true,'ok',$3,jsonb_build_array(jsonb_build_object('status','retained')),'synthetic counterexample',$4::uuid[])",[id,assertion,rule==='provenance'?'':'synthetic passage',sources]),e=>e.code==='P0001'&&e.message==='mip_factual_rejected_'+rule)
    }finally{await publisher.query('rollback')}
    assert.equal((await provider.query('select count(*)::int n from public.explanations where id=$1',[id])).rows[0].n,0)
    const retained=(await provider.query("select rule,attempted_transition,assertion_digest=mip_comparison_kernel_v1.argument_digest(jsonb_build_object('assertion_id',$2::text)) bound from mip_factual.rejection_audit where explanation_id=$1",[id,assertion])).rows
    assert.equal(retained.length,1)
    assert.deepEqual(retained[0],{rule,attempted_transition:'published',bound:true})
   }
  }finally{await publisher.end()}
  const audit={...options,expectedInstallManifest:plan.manifest_sha256,expectedNativeProgram:plan.native.program_sha256,expectedSuccessorProgram:plan.activation.program_sha256,metadataAuditConnectionString:secrets.metadataAudit,disposable:true}
  phase='independent-metadata-audit'
  observed=await auditNativeActivationMetadata(audit,read)
  assert.equal(observed.permission_boundary_current,true);assert.equal(observed.state,'disabled_bootstrap')
  // Provider authority induces fixture drift only; customer provisioning remains unchanged.
  phase='independent-installer-attribute-drift'
  const roleBefore=(await provider.query("select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolreplication from pg_roles where rolname='postgres'")).rows[0]
  assert.equal(roleBefore.rolreplication,true)
  try{
   await provider.query('alter role postgres noreplication')
   observed=await auditNativeActivationMetadata(audit,read)
   assert.equal(observed.permission_boundary_current,false)
   assert.equal(observed.phase,'managed_installer')
   assert.equal(observed.connection_cleanup_verified,true)
  }finally{
   await provider.query('alter role postgres replication')
   assert.deepEqual((await provider.query("select rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolreplication from pg_roles where rolname='postgres'")).rows[0],roleBefore)
  }
  phase='independent-audit-after-exact-restoration'
  observed=await auditNativeActivationMetadata(audit,read)
  assert.equal(observed.permission_boundary_current,true)
  const held=await connect(provision.expectedMetadataAuditor,new URL(secrets.metadataAudit).password)
  const retirement={...cfg,authorization:'owner-authorized-terminal-managed-auditor-retirement'}
  try{
   phase='retirement-refuses-live-auditor'
   observed=await retireManagedAuditors(retirement);assert.equal(observed.state,'refused')
  }finally{await held.end()}
  phase='unchanged-after-refusal'
  observed=await auditNativeActivationMetadata(audit,read);assert.equal(observed.permission_boundary_current,true)
  const historySQL="select jsonb_build_object('bootstrap',(select jsonb_agg(to_jsonb(t)) from mip_native_activation.bootstrap t),'revisions',(select jsonb_agg(to_jsonb(t)) from mip_native_activation.revisions t),'rejections',(select jsonb_agg(to_jsonb(t)) from mip_factual.rejection_audit t),'receipts',(select jsonb_agg(to_jsonb(t)) from mip_comparison_install.receipts t)) value"
  const retained=(await provider.query(historySQL)).rows[0].value
  phase='terminal-retirement-lost-ack'
  const original=pg.Client.prototype.query;let lost=false
  pg.Client.prototype.query=async function(...args){const answer=await original.apply(this,args);if(!lost&&args[0]==='commit'){lost=true;throw Error('synthetic_lost_ack')}return answer}
  try{observed=await retireManagedAuditors(retirement)}finally{pg.Client.prototype.query=original}
  assert.equal(lost,true);assert.equal(observed.state,'outcome_unknown')
  phase='same-terminal-operation-reconcile'
  observed=await retireManagedAuditors(retirement);assert.equal(observed.state,'auditors_retired');assert.equal(observed.needs_reconciliation,false)
  assert.deepEqual((await provider.query(historySQL)).rows[0].value,retained)
  assert.equal((await provider.query("select count(*)::int n from pg_roles where rolname in('mip_native_audit_v1','mip_native_metadata_audit_v1')")).rows[0].n,0)
  assert.equal((await provider.query("select collection_authorized from qik_ingest.collection_gate")).rows[0].collection_authorized,false)
 }catch(error){failed=true
  if(observed===null)observed={diagnostic:/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code+':'+(/^[A-Za-z_0-9]{1,100}$/.test(error?.routine??'')?error.routine:'unknown'):'fixture_assertion'}
 }
 finally{
  await provider.end()
  if(owned){
   const cleanup=await connect('supabase_admin',process.env.MIP_COMPAT_ADMIN_PASSWORD,'template1')
   try{
    await cleanup.query("select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres' and pid<>pg_backend_pid()")
    const created=(await cleanup.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname).filter(r=>!before.includes(r))
    assert.ok(created.every(r=>r.startsWith('mip_')||r.startsWith('qik_')||['anon','authenticated','service_role'].includes(r)))
    await cleanup.query('drop database postgres');await cleanup.query('create database postgres owner postgres')
    for(const name of created)await cleanup.query('drop role '+ident(name))
    assert.deepEqual((await cleanup.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname),before)
   }catch{failed=true;phase+=':cleanup'}finally{await cleanup.end()}
  }
 }
 const safe=observed?{state:observed.state,phase:observed.phase,sqlstate:observed.sqlstate,diagnostic:observed.diagnostic,native_failure:observed.native_failure}:null
 assert.equal(failed,false,'managed integration failed at '+phase+' '+JSON.stringify(safe)+'; raw errors withheld')
})
