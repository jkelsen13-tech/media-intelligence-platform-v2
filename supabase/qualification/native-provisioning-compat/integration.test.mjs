import {qualifyCanonicalEntity} from './canonicalEntityQualification.mjs'
import {qualifySessionLocks} from './sessionLockQualification.mjs'
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
  // Mirrors independently observed qik provider baseline, not a customer
  // provisioning operation: supabase_auth_admin owns sessions and postgres
  // already has table-level SELECT WITH GRANT OPTION.
  step('fixture-provider-auth-grant');
  const authOwner=(await owner.query("select pg_get_userbyid(relowner) owner from pg_class where oid='auth.sessions'::regclass")).rows[0].owner
  assert.ok(['supabase_admin','supabase_auth_admin'].includes(authOwner))
  // A sessions table newly created by this disposable source fixture must
  // reproduce qik's independently observed provider Auth ownership.
  if(authOwner==='supabase_admin')await owner.query('alter table auth.sessions owner to supabase_auth_admin')
  assert.equal((await owner.query("select pg_get_userbyid(relowner) owner from pg_class where oid='auth.sessions'::regclass")).rows[0].owner,'supabase_auth_admin')
  await owner.query('grant select on auth.sessions to postgres with grant option');
  step('fixture-pipeline');
  await owner.query(await read('supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'));
  for(const file of LOAD_ORDER){
   step('fixture-ordered-'+file);
   await owner.query(await read('supabase/qualification/qik-ingest/'+file));
   if(file!=='05_operation_ledger.sql')await owner.query('select qik_ingest_operation.capture_step($1)',[file]);
  }
  await owner.query('create table qik_ingest_operation.persistent_install_receipt(id boolean primary key,operation_id text,installer name,sql_manifest_sha256 text,runtime_login name,runtime_token_hash text,runtime_creator_grantor name,installed_at timestamptz default now())');
  await owner.query('insert into qik_ingest_operation.persistent_install_receipt(id,operation_id,installer,sql_manifest_sha256) values(true,$1,$2,$3)',['3'.repeat(32),backendInstaller,'1'.repeat(64)]);
  // Match qik's observed customer SET-only, non-inherited C3 owner edge.
  await owner.query('grant qik_ingest_fn_owner to '+ident(backendInstaller)+' with admin false,inherit false,set true');
  await root.query('alter function public.mip_pipeline_v1(text,jsonb) owner to postgres');
  step('fixture-source-ownership');
  await transferSyntheticOwnership(root);
  owner=null;
  // Match the observed native source ownership/RLS shape before installation.
  step('fixture-customer-native-shape');
  const nativeBase=await connect(backendInstaller);
  try{
   const edge=(await nativeBase.query("select pg_has_role(current_user,'qik_ingest_fn_owner','SET') can_set,pg_has_role(current_user,'qik_ingest_fn_owner','USAGE') can_inherit")).rows[0];
   assert.equal(edge.can_set,true);assert.equal(edge.can_inherit,false);
   await nativeBase.query("create table public.entities(id uuid primary key,canonical_name text not null,normalized_name text not null,entity_type text not null,aliases text[] not null,mention_count integer not null default 0,created_at timestamptz not null default now(),last_seen timestamptz not null default now());alter table public.story_arcs add column started_at date not null,add column title text,add column summary text,add column last_update_at timestamptz;alter table public.arc_membership_candidates add column article_id uuid,add column arc_id uuid,add column state text,add column updated_at timestamptz");
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
 const provision={provisioningProfile:'supabase-managed-solo-session-lock-v1',operationId:'4'.repeat(32),expectedLogin:'postgres',auditLogin:'mip_native_audit_v1',expectedMetadataAuditor:'mip_native_metadata_audit_v1',c3OperationId:'3'.repeat(32),c3ManifestSha256:'1'.repeat(64),disposable:true}
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
  // Hosted qik already has this exact provider-issued service membership.
  // The disposable image's privileged group is created by provider setup,
  // so the provider supplies its observed service edge as infrastructure only.
  phase='fixture-provider-existing-service-edge'
  await provider.query('grant supabase_privileged_role to supabase_etl_admin with admin false,inherit true,set true')
  phase='provider-existing-auth-lock-privilege-only'
  await provider.query('grant update(id) on auth.sessions to postgres')
  assert.equal((await provider.query("select has_column_privilege('postgres','auth.sessions','id','UPDATE WITH GRANT OPTION') delegated,pg_has_role('postgres','supabase_auth_admin','SET') owner_set")).rows[0].delegated,false)
  assert.equal((await provider.query("select pg_has_role('postgres','supabase_auth_admin','SET') owner_set")).rows[0].owner_set,false)
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
  const originalQuery=pg.Client.prototype.query
  pg.Client.prototype.query=async function(...args){
   if(args[0]==='select mip_comparison_install.native_boundary_v6()'){
    const evidence=await originalQuery.call(this,"select (select rolreplication from pg_roles where rolname='postgres') replication,pg_has_role('postgres','mip_mentions_admin','USAGE') admin_usage,pg_has_role('postgres','mip_mentions_admin','SET') admin_set,pg_has_role('postgres','mip_mentions_gateway','USAGE') gateway_usage,pg_has_role('postgres','mip_mentions_gateway','SET') gateway_set,has_schema_privilege('postgres','mip_native_caller','USAGE,CREATE') caller_schema,has_function_privilege('postgres',(select oid from pg_proc where pronamespace='mip_native_caller'::regnamespace and proname='configure_admission'),'EXECUTE') configure_execute,has_function_privilege('postgres',(select oid from pg_proc where pronamespace='mip_native_caller'::regnamespace and proname='read_current'),'EXECUTE') read_execute,(select position('and rolinherit and rolreplication)' in prosrc)>0 from pg_proc where oid='mip_comparison_install.native_boundary_v6()'::regprocedure) managed_helper")
    console.log('Synthetic caller bootstrap booleans: '+JSON.stringify(evidence.rows))
   }
   if(typeof args[0]==='string'&&args[0].includes('do $session_lock_boundary$')){
    const fixed=await originalQuery.call(this,"select proname,pg_get_function_sqlbody(oid) body,proargnames,proconfig from pg_proc where pronamespace='mip_auth_session_lock'::regnamespace order by proname")
    console.log('Synthetic fixed helper catalog: '+JSON.stringify(fixed.rows))
    try{return await originalQuery.apply(this,args)}catch(e){
     if(['session_lock_boundary','session_lock_function_boundary','session_lock_effective_boundary'].includes(e.message))console.log('Synthetic helper boundary refusal: '+e.message)
     throw e
    }
   }
   if(args[0]===plan.dojBody){
    try{return await originalQuery.apply(this,args)}catch(e){
     const offset=Number.isInteger(Number(e.position))?Number(e.position)-1:null
     const category=/permission denied for schema qik_ingest/i.test(e.message??'')?'schema_qik_ingest':/permission denied for function/i.test(e.message??'')?'function':/must be member of role|permission denied to set role/i.test(e.message??'')?'set_role':/permission denied/i.test(e.message??'')?'permission_other':'other'
     console.log('Synthetic DOJ unit failure: '+JSON.stringify({sqlstate:/^[0-9A-Z]{5}$/.test(e.code??'')?e.code:null,category,position:offset,excerpt:offset!==null?plan.dojBody.slice(Math.max(0,offset-100),offset+120):null}))
     throw e
    }
   }
   return originalQuery.apply(this,args)
  }
  try{observed=await installComparisonAtomic(cfg,read)}finally{pg.Client.prototype.query=originalQuery}
  // Only exact compiler-authored static SQL, never server context, args or error text.
  if(observed.native_failure?.stage==='successor_preparation'&&Number.isInteger(observed.native_failure.position)){
   const offset=observed.native_failure.position-1
   console.log('Bound static successor source excerpt: '+JSON.stringify(plan.activation.sql.slice(Math.max(0,offset-120),offset+180)))
  }
  assert.equal(observed.state,'installed_disabled_audit_pending')
  assert.equal(observed.connection_cleanup_verified,true)
  phase='doj-predecessor-execution-boundary'
  const dojAcl=(await provider.query("select has_function_privilege('mip_efta_owner_v1','mip_identity.operation_check_pre_doj_v1(jsonb)','EXECUTE') old_direct,has_function_privilege('mip_efta_owner_v1','mip_identity.operation_check(jsonb)','EXECUTE') governed_wrapper")).rows[0]
  assert.equal(dojAcl.old_direct,false)
  assert.equal(dojAcl.governed_wrapper,true)
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
  phase='post-install-customer-route-permission-boundary'
  const originalColumnAcl=(await provider.query("select a.attacl::text acl from pg_attribute a where a.attrelid='mip_factual.audit_connection'::regclass and a.attname='connection_string'")).rows[0].acl
  // Execute the held SQL body in the disposable installation. Only fixed qik
  // identities, the CA path and the dblink endpoint are substituted. The stub
  // checks the transformed URI and injects an error without exposing a secret.
  // Actual qik-to-direct-host TLS was separately proven read-only on qik.
  const maintenance=(await read('supabase/qualification/native-provisioning-compat/qikAuditRouteMaintenance.sql')).toString()
   .replace('a382dcdbf2924852b711b6a8b0c713eb',options.operationId)
   .replaceAll('221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320',plan.manifest_sha256)
   .replace("ca_path := pg_catalog.current_setting('ssl_ca_file',true);","ca_path := '/fixture/provider-ca.pem';")
   .replace('mip_factual_transport_raw.dblink(','mip_fixture_route.dblink(')
  assert.notEqual(maintenance,(await read('supabase/qualification/native-provisioning-compat/qikAuditRouteMaintenance.sql')).toString())
  const poolUri='postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:'+new URL(secrets.audit).password+'@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslrootcert=system&sslmode=verify-full&connect_timeout=5'
  await provider.query('update mip_factual.audit_connection set connection_string=$1 where id',[poolUri])
  await provider.query("create schema mip_fixture_route;create function mip_fixture_route.dblink(conn text,statement text) returns setof record language plpgsql security invoker set search_path='' as $f$ begin if current_user<>'postgres' or session_user<>'postgres' or conn !~ '^postgresql://mip_native_audit_v1:[^@]+@db[.]qikvmopbtijoebdqosyq[.]supabase[.]co:5432/postgres[?]' or position('sslrootcert=%2Ffixture%2Fprovider-ca.pem' in conn)=0 or position('sslmode=verify-full' in conn)=0 or position('connect_timeout=5' in conn)=0 or statement<>'select current_user::text,(select ssl from pg_catalog.pg_stat_ssl where pid=pg_catalog.pg_backend_pid())' then raise exception 'fixture_route_refused';end if;if current_setting('mip_fixture.fail_probe',true)='on' then raise exception 'SYNTHETIC_SECRET_CANARY';end if;return query select 'mip_native_audit_v1'::text,true;end $f$;grant usage on schema mip_fixture_route to postgres;grant execute on function mip_fixture_route.dblink(text,text) to postgres")
  const routeCustomer=await connect()
  try{
   assert.equal((await routeCustomer.query("select current_user='postgres' and session_user='postgres' and not (select rolsuper from pg_roles where rolname=current_user) and not has_column_privilege(current_user,'mip_factual.audit_connection','connection_string','UPDATE') ok")).rows[0].ok,true)
   phase='maintenance-grant-missing'
   await routeCustomer.query('begin')
   await assert.rejects(routeCustomer.query(maintenance),e=>e.message==='qik_audit_route_grant_missing')
   await routeCustomer.query('rollback')
   phase='provider-temporary-route-grant'
   await provider.query('grant update(connection_string) on mip_factual.audit_connection to postgres')
   phase='maintenance-probe-failure-redaction'
   await routeCustomer.query('begin')
   await routeCustomer.query("set local mip_fixture.fail_probe='on'")
   await assert.rejects(routeCustomer.query(maintenance),e=>e.message==='qik_audit_route_probe_refused'&&!JSON.stringify(e).includes('SYNTHETIC_SECRET_CANARY'))
   await routeCustomer.query('rollback')
   phase='maintenance-rollback'
   await routeCustomer.query('begin')
   await routeCustomer.query(maintenance)
   await routeCustomer.query('rollback')
   assert.equal((await provider.query("select connection_string=$1 unchanged from mip_factual.audit_connection where id",[poolUri])).rows[0].unchanged,true)
   phase='maintenance-commit'
   await routeCustomer.query('begin')
   await routeCustomer.query(maintenance)
   await routeCustomer.query('commit')
   assert.equal((await provider.query("select connection_string like 'postgresql://mip_native_audit_v1:%@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?%' transformed from mip_factual.audit_connection where id")).rows[0].transformed,true)
   phase='maintenance-already-applied'
   await routeCustomer.query('begin')
   await assert.rejects(routeCustomer.query(maintenance),e=>e.message==='qik_audit_route_already_applied')
   await routeCustomer.query('rollback')
  }finally{await routeCustomer.end()}
  phase='provider-route-grant-revocation'
  await provider.query('revoke update(connection_string) on mip_factual.audit_connection from postgres')
  assert.equal((await provider.query("select has_column_privilege('postgres','mip_factual.audit_connection','connection_string','UPDATE') allowed")).rows[0].allowed,false)
  assert.equal((await provider.query("select a.attacl::text acl from pg_attribute a where a.attrelid='mip_factual.audit_connection'::regclass and a.attname='connection_string'")).rows[0].acl,originalColumnAcl)
  await provider.query('drop schema mip_fixture_route cascade')
  // The disposable auditor uses its local loopback route for the existing
  // real dblink audit; this provider fixture reset is not qik route evidence.
  await provider.query("update mip_factual.audit_connection set connection_string=$1 where id",[secrets.audit+'?application_name=mip-audit-route-fixture'])
  assert.notEqual((await provider.query("select encode(sha256(convert_to(connection_string,'UTF8')),'hex') digest from mip_factual.audit_connection where id")).rows[0].digest,connectionBefore)
  observed=await reconcileComparisonInstall(cfg,read);assert.equal(observed.state,'installed_disabled_audit_pending')
  phase='autonomous-audit'
  observed=await qualifyComparisonAudit(cfg,read);assert.equal(observed.audit_qualified,true)
  phase='rejected-publication-autonomous-persistence'
  const publisher=await connect()
  try{
   // Synthetic fixture source only, never a hosted article or publication.
   const source=randomUUID()
   phase='publication-fixture-source'
   await publisher.query("insert into public.articles(id,feed,outlet,title,url,reader_state,source_status) values($1::uuid,'fixture','fixture','fixture','https://news.example/guard/'||$1::text,'eligible','active')",[source])
   for(const rule of ['provenance','source_state','human_review']){
    const id=randomUUID(),assertion='fixture-managed-guard:'+id
    const sources=rule==='source_state'?[randomUUID()]:[source]
    phase='publication-'+rule+'-guard'
    await publisher.query('begin')
    try{
     let rejection=null
     try{await publisher.query("insert into public.explanations(id,assertion_id,review_status,is_current,state,supporting_passage,archived_sources,falsification_condition,source_ids) values($1,$2,'published',true,'ok',$3,jsonb_build_array(jsonb_build_object('status','retained')),'synthetic counterexample',$4::uuid[])",[id,assertion,rule==='provenance'?'':'synthetic passage',sources])}
     catch(e){rejection={sqlstate:/^[0-9A-Z]{5}$/.test(e.code??'')?e.code:null,guard:['mip_factual_rejected_provenance','mip_factual_rejected_source_state','mip_factual_rejected_human_review','mip_audit_unavailable'].includes(e.message)?e.message:null}}
     observed={...observed,fixture_rejection:rejection}
     assert.deepEqual(rejection,{sqlstate:'P0001',guard:'mip_factual_rejected_'+rule})
    }finally{await publisher.query('rollback')}
    phase='publication-'+rule+'-rollback-readback'
    assert.equal((await provider.query('select count(*)::int n from public.explanations where id=$1',[id])).rows[0].n,0)
    const retained=(await provider.query("select rule,attempted_transition,assertion_digest=mip_comparison_kernel_v1.argument_digest(jsonb_build_object('assertion_id',$2::text)) bound from mip_factual.rejection_audit where explanation_id=$1",[id,assertion])).rows
    assert.equal(retained.length,1)
    assert.deepEqual(retained[0],{rule,attempted_transition:'published',bound:true})
   }
  }finally{await publisher.end()}
  const audit={...options,expectedInstallManifest:plan.manifest_sha256,expectedNativeProgram:plan.native.program_sha256,expectedSuccessorProgram:plan.activation.program_sha256,metadataAuditConnectionString:secrets.metadataAudit,disposable:true}
  phase='statistics-schema-isolation'
  const statsReader=await connect(provision.expectedMetadataAuditor,new URL(secrets.metadataAudit).password)
  try{
   assert.equal((await statsReader.query("select has_schema_privilege(session_user,'extensions','USAGE') allowed")).rows[0].allowed,false)
   await assert.rejects(()=>statsReader.query('select count(*) from extensions.pg_stat_statements'),e=>e.code==='42501')
   await assert.rejects(()=>statsReader.query('select count(*) from extensions.pg_stat_statements_info'),e=>e.code==='42501')
  }finally{await statsReader.end()}
  phase='independent-metadata-audit'
  const originalAuditQuery=pg.Client.prototype.query
  pg.Client.prototype.query=async function(...args){
   const result=await originalAuditQuery.apply(this,args)
   if(typeof args[0]==='string'&&args[0].startsWith('\nselect r.oid::text oid,session_user::text login')&&result.rows[0]?.safe!==true){
    const checks=await originalAuditQuery.call(this,`select
     (select count(*)::int from pg_namespace n where n.nspname<>'information_schema' and n.nspname !~ '^pg_' and has_schema_privilege(current_user,n.oid,'CREATE')) schema_create,
     (select count(*)::int from pg_shdepend where refclassid='pg_authid'::regclass and refobjid=current_user::regrole and deptype='o') ownership,
     (select count(*)::int from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=current_user::regrole and a.privilege_type='EXECUTE') direct_execute,
     (select count(*)::int from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee in(select oid from pg_roles where rolname=any($1)) and has_function_privilege(current_user,p.oid,'EXECUTE')) group_execute,
     (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname<>'information_schema' and n.nspname !~ '^pg_' and case when c.relkind in('r','p','v','m','f') and(n.nspname<>'mip_native_activation' or c.relname not in('bootstrap','head','revisions')) then has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') else false end) outside_tables
    `,args[1])
    console.log('Synthetic metadata identity violation counts: '+JSON.stringify(checks.rows))
    const relations=await originalAuditQuery.call(this,"select n.nspname,c.relname,c.relkind,has_table_privilege(current_user,c.oid,'SELECT') select_allowed,has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') writes_allowed,has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES') column_writes from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname<>'information_schema' and n.nspname !~ '^pg_' and case when c.relkind in('r','p','v','m','f') and(n.nspname<>'mip_native_activation' or c.relname not in('bootstrap','head','revisions')) then has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') else false end")
    console.log('Synthetic metadata exposed relation names/privileges: '+JSON.stringify(relations.rows))
   }
   return result
  }
  try{observed=await auditNativeActivationMetadata(audit,read)}finally{pg.Client.prototype.query=originalAuditQuery}
  assert.equal(observed.permission_boundary_current,true);assert.equal(observed.state,'disabled_bootstrap')
  phase='canonical-entity-successor-semantics'
  await qualifyCanonicalEntity({provider,connect})
  const entityBefore=(await provider.query("select attname,attacl from pg_attribute where attrelid='public.entities'::regclass and attnum>0 order by attnum")).rows
  phase='independent-canonical-column-permission-drift'
  try{
   await provider.query('revoke select(entity_type) on public.entities from mip_mentions_owner')
   observed=await auditNativeActivationMetadata(audit,read)
   assert.equal(observed.permission_boundary_current,false)
   assert.equal(observed.phase,'canonical_entity_contract')
  }finally{
   await provider.query('grant select(entity_type) on public.entities to mip_mentions_owner')
   assert.deepEqual((await provider.query("select attname,attacl from pg_attribute where attrelid='public.entities'::regclass and attnum>0 order by attnum")).rows,entityBefore)
  }
  phase='independent-canonical-update-fence-drift'
  const fenceBefore=(await provider.query("select oid,tgenabled,tgtype,tgattr::text attrs from pg_trigger where tgrelid='public.entities'::regclass order by oid")).rows
  try{
   await provider.query('alter table public.entities disable trigger canonical_entity_update_fence')
   observed=await auditNativeActivationMetadata(audit,read)
   assert.equal(observed.permission_boundary_current,false)
   assert.equal(observed.phase,'canonical_entity_contract')
  }finally{
   await provider.query('alter table public.entities enable always trigger canonical_entity_update_fence')
   assert.deepEqual((await provider.query("select oid,tgenabled,tgtype,tgattr::text attrs from pg_trigger where tgrelid='public.entities'::regclass order by oid")).rows,fenceBefore)
  }
  phase='independent-canonical-after-exact-restoration'
  observed=await auditNativeActivationMetadata(audit,read)
  assert.equal(observed.permission_boundary_current,true)
  // Development approval acknowledges provider access; it never trusts the
  // shared pg_read_all_data capability or any other LOGIN that reaches it.
  phase='metadata-extra-relation-refused'
  await provider.query('create table public.fixture_metadata_extra(id integer)')
  try{
   await provider.query('grant select on public.fixture_metadata_extra to mip_native_metadata_audit_v1')
   observed=await auditNativeActivationMetadata(audit,read)
   assert.equal(observed.permission_boundary_current,false);assert.equal(observed.phase,'auditor_identity')
  }finally{await provider.query('drop table public.fixture_metadata_extra')}
  phase='independent-after-extra-relation-cleanup'
  observed=await auditNativeActivationMetadata(audit,read)
  assert.equal(observed.permission_boundary_current,true)
  phase='trusted-provider-effective-access'
  for(const name of ['supabase_etl_admin','supabase_read_only_user']){
   assert.equal((await provider.query("select has_table_privilege($1,'mip_factual.audit_connection','SELECT') allowed",[name])).rows[0].allowed,true)
  }
  phase='untrusted-shared-capability-drift'
  await provider.query('create role fixture_untrusted_reader login noinherit')
  try{
   await provider.query('grant pg_read_all_data to fixture_untrusted_reader with admin false,inherit true,set true')
   observed=await reconcileComparisonInstall(cfg,read)
   assert.equal(observed.state,'reconciliation_unavailable')
   assert.equal(observed.diagnostic,'atomic_audit_effective_table')
   observed=await auditNativeActivationMetadata(audit,read)
   assert.equal(observed.permission_boundary_current,false)
   assert.equal(observed.phase,'managed_effective_boundary')
   assert.equal(observed.connection_cleanup_verified,true)
  }finally{
   await provider.query('revoke pg_read_all_data from fixture_untrusted_reader')
   await provider.query('drop role fixture_untrusted_reader')
  }
  phase='trusted-provider-extra-edge-drift'
  const edgesBefore=(await provider.query("select * from pg_auth_members where roleid='supabase_etl_admin'::regrole or member='supabase_etl_admin'::regrole order by roleid,member,grantor")).rows
  await provider.query('create role fixture_provider_extra nologin')
  try{
   await provider.query('grant fixture_provider_extra to supabase_etl_admin with admin false,inherit true,set true')
   observed=await reconcileComparisonInstall(cfg,read)
   assert.equal(observed.state,'reconciliation_unavailable')
   observed=await auditNativeActivationMetadata(audit,read)
   assert.equal(observed.permission_boundary_current,false)
   assert.equal(observed.phase,'managed_effective_boundary')
   assert.equal(observed.connection_cleanup_verified,true)
  }finally{
   await provider.query('revoke fixture_provider_extra from supabase_etl_admin')
   await provider.query('drop role fixture_provider_extra')
   assert.deepEqual((await provider.query("select * from pg_auth_members where roleid='supabase_etl_admin'::regrole or member='supabase_etl_admin'::regrole order by roleid,member,grantor")).rows,edgesBefore)
  }
  phase='independent-after-provider-exact-restoration'
  observed=await auditNativeActivationMetadata(audit,read)
  assert.equal(observed.permission_boundary_current,true)
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
  phase='independent-session-helper-drift'
  const helperDef=(await provider.query("select pg_get_functiondef('mip_auth_session_lock.key_share(uuid,uuid)'::regprocedure) d")).rows[0].d
  const helperBefore=(await provider.query("select proowner,proacl,prosqlbody::text body,proconfig from pg_proc where oid='mip_auth_session_lock.key_share(uuid,uuid)'::regprocedure")).rows[0]
  for(const drift of ['execution','configuration','body']){
   try{
    if(drift==='execution')await provider.query('grant execute on function mip_auth_session_lock.key_share(uuid,uuid) to anon')
    if(drift==='configuration')await provider.query("alter function mip_auth_session_lock.key_share(uuid,uuid) set search_path=public")
    if(drift==='body')await provider.query("create or replace function mip_auth_session_lock.key_share(u uuid,s uuid) returns bool language sql volatile security definer parallel unsafe set search_path='' begin atomic select false;end")
    observed=await auditNativeActivationMetadata(audit,read)
    assert.equal(observed.permission_boundary_current,false)
   }finally{
    if(drift==='execution')await provider.query('revoke execute on function mip_auth_session_lock.key_share(uuid,uuid) from anon')
    else await provider.query(helperDef)
    assert.deepEqual((await provider.query("select proowner,proacl,prosqlbody::text body,proconfig from pg_proc where oid='mip_auth_session_lock.key_share(uuid,uuid)'::regprocedure")).rows[0],helperBefore)
   }
   observed=await auditNativeActivationMetadata(audit,read)
   assert.equal(observed.permission_boundary_current,true)
  }
  phase='fixed-session-lock-successor-semantics'
  await qualifySessionLocks({provider,connect})
  phase='independent-after-session-fixture-cleanup'
  observed=await auditNativeActivationMetadata(audit,read)
  assert.equal(observed.permission_boundary_current,true)
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
  if(phase==='fixed-session-lock-successor-semantics'&&/^[a-z_0-9]{1,100}$/.test(error?.constraint??''))console.log('Synthetic session fixture constraint: '+error.constraint)
  observed={...(observed??{}),fixture_sqlstate:/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null}
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
 const safe=observed?{state:observed.state,phase:observed.phase,sqlstate:observed.sqlstate,diagnostic:observed.diagnostic,native_failure:observed.native_failure,fixture_sqlstate:observed.fixture_sqlstate,fixture_rejection:observed.fixture_rejection}:null
 assert.equal(failed,false,'managed integration failed at '+phase+' '+JSON.stringify(safe)+'; raw errors withheld')
})
