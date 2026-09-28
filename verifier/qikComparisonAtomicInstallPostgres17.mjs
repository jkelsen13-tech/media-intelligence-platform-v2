// Actual SQL qualification, synthetic dedicated PostgreSQL17.6 only.
// Requires official pgvector0.8.2; dependency build is owned by the CI workflow.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {prepareAtomicInstall,installComparisonAtomic,reconcileComparisonInstall,
 qualifyComparisonAudit,DBLINK_PREFLIGHT_SQL} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
import {REQUIRED_RELATIONS,RESERVED_ROLES,RESERVED_SCHEMAS} from '../supabase/qualification/qik-comparison-adapter/catalogPreflight.mjs'
import {LOAD_ORDER} from '../supabase/qualification/qik-ingest/installQikIngest.mjs'
const root=new URL('../',import.meta.url),H='1'.repeat(64)
const password='mip-efta-disposable-ci-only',bootstrap='atomic_fixture_bootstrap',audit='atomic_fixture_audit'
const read=async p=>readFile(new URL(p,root),'utf8')
const url=user=>'postgresql://'+user+':'+password+'@127.0.0.1:5432/postgres'
async function client(user,database='postgres'){
 const db=new pg.Client({host:'127.0.0.1',port:5432,database,user,password,
 connectionTimeoutMillis:5000,statement_timeout:30000,query_timeout:40000})
 await db.connect();return db
}
const ident=s=>'"'+s.replaceAll('"','""')+'"'
test('full pinned atomic install on non-superuser PostgreSQL17.6, rollback and audit recovery',{timeout:240000},async()=>{
 assert.equal(process.env.MIP_QIK_COMPARISON_DISPOSABLE,'synthetic-pg17-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 let owner=await client('postgres'),admin=null
 const initial=(await owner.query("select current_setting('server_version_num') v,(select rolsuper from pg_roles where rolname=current_user) super")).rows[0]
 assert.equal(initial.v,'170006');assert.equal(initial.super,true)
 assert.equal((await owner.query("select count(*)::integer n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f')")).rows[0].n,0)
 assert.equal((await owner.query("select count(*)::integer n from pg_roles where rolname like 'mip_%' or rolname like 'qik_%' or rolname like 'atomic_fixture_%'")).rows[0].n,0)
 const baseline=(await owner.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname)
 // Bootstrap credentials are hardcoded synthetic fixture material, never production.
 await owner.query("create role "+bootstrap+" login superuser password '"+password+"'")
 admin=await client(bootstrap)
 try{
  await owner.query('create schema extensions;create extension pgcrypto with schema extensions;create extension vector with schema public;create extension dblink with schema extensions')
  assert.equal((await owner.query("select extversion from pg_extension where extname='vector'")).rows[0].extversion,'0.8.2')
  await owner.query(await read('supabase/qualification/qik-ingest/fixture_substrate.sql'))
  // Complete actual observed public column contracts. No comparison fixture/seed.
  await owner.query('create schema auth')
  for(const r of REQUIRED_RELATIONS.filter(r=>['public','auth'].includes(r.schema_name))){
   const exists=(await owner.query('select to_regclass($1) name',[r.qualified])).rows[0].name
   if(!exists){
    const columns=Object.entries(r.requiredColumns)
    await owner.query('create table '+r.qualified+' ('+(columns.length
      ?columns.map(([n,t])=>ident(n)+' '+t+(n==='id'?' primary key':'')).join(',')
      :'id uuid primary key,payload jsonb')+')')
   }else{
    const names=new Set((await owner.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",[r.qualified])).rows.map(x=>x.attname))
    for(const [n,t] of Object.entries(r.requiredColumns))if(!names.has(n))await owner.query('alter table '+r.qualified+' add column '+ident(n)+' '+t)
   }
  }
  await owner.query(await read('supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'))
  for(const file of LOAD_ORDER){
   await owner.query(await read('supabase/qualification/qik-ingest/'+file))
   if(file!=='05_operation_ledger.sql')await owner.query('select qik_ingest_operation.capture_step($1)',[file])
  }
  await owner.query('create table qik_ingest_operation.persistent_install_receipt(id boolean primary key,operation_id text,installer name,sql_manifest_sha256 text,runtime_login name,runtime_token_hash text,runtime_creator_grantor name,installed_at timestamptz default now())')
  await owner.query('insert into qik_ingest_operation.persistent_install_receipt(id,operation_id,installer,sql_manifest_sha256) values(true,$1,$2,$3)',['3'.repeat(32),'postgres',H])
  await owner.query("create role "+audit+" login nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication password '"+password+"'")
  await owner.query('grant qik_ingest_fn_owner to postgres with admin false,inherit true,set true')
  // Superuser performs substrate/extension setup only. Installer is now actual
  // password-authenticated non-superuser CREATEROLE, matching qik owner flags.
  await admin.query('alter role postgres nosuperuser createrole createdb bypassrls')
  await owner.end();owner=null
  const plan=await prepareAtomicInstall(async p=>read(p))
  const pre=await client('postgres')
  const dblink=(await pre.query(DBLINK_PREFLIGHT_SQL)).rows[0]
  assert.equal(dblink.expected,true);assert.equal(dblink.unused,true);assert.equal(dblink.no_servers,true)
  await pre.end()
  const cfg={authorization:'owner-authorized-disabled-comparison-install',
   operationId:'2'.repeat(32),expectedLogin:'postgres',connectionString:url('postgres'),
   c3OperationId:'3'.repeat(32),c3ManifestSha256:H,expectedManifestSha256:plan.manifest_sha256,
   dblinkMetadataSha256:dblink.metadata_sha256,collectorSource:'qik-fixture-v1',
   auditLogin:audit,auditConnectionString:url(audit),disposable:true}
  // Force a real mid-install failure at the existing 009 uniqueness constraint.
  await admin.query("insert into public.explanations(id,assertion_id,version,is_current) values('00000000-0000-4000-8000-000000000001','synthetic-duplicate',1,true),('00000000-0000-4000-8000-000000000002','synthetic-duplicate',1,true)")
  const failed=await installComparisonAtomic(cfg,async p=>read(p))
  assert.equal(failed.state,'installation_refused')
  assert.equal(failed.needs_reconciliation,false)
  assert.equal((await admin.query('select count(*)::integer n from pg_roles where rolname=any($1::text[])',[[...RESERVED_ROLES,'mip_tmp_'+cfg.operationId]])).rows[0].n,0)
  assert.equal((await admin.query('select count(*)::integer n from pg_namespace where nspname=any($1::text[])',[[...RESERVED_SCHEMAS,'mip_comparison_install']])).rows[0].n,0)
  assert.equal((await admin.query("select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='dblink'")).rows[0].nspname,'extensions')
  await admin.query('delete from public.explanations')
  const installed=await installComparisonAtomic(cfg,async p=>read(p))
  assert.equal(installed.state,'installed_disabled_audit_pending')
  assert.equal(installed.activation_allowed,false)
  assert.equal((await reconcileComparisonInstall(cfg)).state,'installed_disabled_audit_pending')
  assert.equal((await admin.query('select count(*)::integer n from pg_auth_members where roleid in(select oid from pg_roles where rolname=any($1::text[])) or member in(select oid from pg_roles where rolname=any($1::text[]))',[[...RESERVED_ROLES]])).rows[0].n,0)
  assert.equal((await admin.query("select count(*)::integer n from mip_identity.efta_scope")).rows[0].n,0)
  assert.equal((await admin.query("select count(*)::integer n from mip_identity.doj_policy_versions")).rows[0].n,0)
  const auditResult=await qualifyComparisonAudit(cfg)
  assert.equal(auditResult.state,'installed_disabled_audit_qualified')
  assert.equal(auditResult.activation_allowed,false)
  assert.equal((await qualifyComparisonAudit(cfg)).state,'installed_disabled_audit_qualified')
  const receipt=(await admin.query('select * from mip_comparison_install.receipts')).rows
  assert.equal(receipt.length,1)
  assert.equal((await admin.query('select count(*)::integer n from mip_factual.rejection_audit')).rows[0].n,1)
  await assert.rejects(admin.query("update mip_comparison_install.receipts set state=state"),/receipt_immutable/)
  assert.equal((await installComparisonAtomic(cfg,async p=>read(p))).state,'installation_refused')
  assert.equal((await admin.query("select collection_authorized from qik_ingest.collection_gate where id")).rows[0].collection_authorized,false)
 }finally{
  if(owner)await owner.end().catch(()=>{})
  if(admin){
   // Only the independently authenticated synthetic bootstrap can restore the
   // dedicated fixture. Drop the disposable database, never application tables.
   await admin.query('alter role postgres superuser')
   await admin.end()
   const clean=await client(bootstrap,'template1')
   await clean.query("select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres' and pid<>pg_backend_pid()")
   await clean.query('drop database postgres')
   await clean.query('create database postgres owner postgres')
   const created=(await clean.query('select rolname from pg_roles')).rows.map(r=>r.rolname).filter(n=>!baseline.includes(n)&&n!==bootstrap)
   const allowed=new Set([...RESERVED_ROLES,'mip_tmp_'+'2'.repeat(32),'anon','authenticated','service_role','qik_ingest_fn_owner','qik_ingest_runtime',audit])
   assert.ok(created.every(r=>allowed.has(r)),'unexpected role prevents unbounded cleanup')
   for(const name of created)await clean.query('drop role '+ident(name))
   await clean.end()
   const restored=await client('postgres')
   await restored.query('drop role '+bootstrap)
   assert.deepEqual((await restored.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname),baseline)
   await restored.end()
  }
 }
})
