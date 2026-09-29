// Actual component proof against disposable managed PG17; C3 rows below are
// synthetic metadata stand-ins, not a claim of whole application qualification.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import pg from 'pg'
import {provisionManagedPrerequisites,reconcileManagedPrerequisites,AUDIT_LOGIN,METADATA_LOGIN} from './provision.mjs'
const uri=(user,pw)=>'postgresql://'+user+':'+encodeURIComponent(pw)+'@127.0.0.1:5432/postgres'
const qi=s=>'"'+s.replaceAll('"','""')+'"'
test('managed prerequisite component creates, authenticates and reconciles same exact operation',async()=>{
 assert.equal(process.env.MIP_MANAGED_PROVISIONING_ARM,'synthetic-pg17-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 const provider=new pg.Client({host:'127.0.0.1',port:5432,user:'supabase_admin',password:process.env.MIP_COMPAT_ADMIN_PASSWORD,database:'postgres',connectionTimeoutMillis:5000})
 const customer=new pg.Client({host:'127.0.0.1',port:5432,user:'postgres',password:process.env.MIP_COMPAT_CUSTOMER_PASSWORD,database:'postgres',connectionTimeoutMillis:5000})
 provider.on('error',()=>{});customer.on('error',()=>{})
 await provider.connect();await customer.connect()
 let owned=false,failed=false,phase='guard',observed=null
 const cfg={provisioningProfile:'supabase-managed-v1',operationId:'4'.repeat(32),expectedLogin:'postgres',auditLogin:AUDIT_LOGIN,expectedMetadataAuditor:METADATA_LOGIN,c3OperationId:'3'.repeat(32),c3ManifestSha256:'c'.repeat(64),disposable:true}
 const secrets={installer:uri('postgres',process.env.MIP_COMPAT_CUSTOMER_PASSWORD),audit:uri(AUDIT_LOGIN,randomBytes(36).toString('base64url')),metadataAudit:uri(METADATA_LOGIN,randomBytes(36).toString('base64url')),caPem:''}
 const before=(await provider.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname)
 try{
  assert.ok(!before.includes(AUDIT_LOGIN)&&!before.includes(METADATA_LOGIN))
  assert.equal((await provider.query("select count(*)::int n from pg_namespace where nspname in('qik_ingest','qik_ingest_operation','mip_managed_provisioning')")).rows[0].n,0)
  assert.equal((await provider.query("select to_regclass('public.ingest_sources') present")).rows[0].present,null)
  assert.equal((await provider.query("select count(*)::int n from pg_extension where extname='dblink'")).rows[0].n,0)
  owned=true;phase='synthetic-c3'
  await customer.query("create schema qik_ingest;create schema qik_ingest_operation;create table public.ingest_sources(id integer primary key,enabled boolean,collection_enabled boolean);insert into public.ingest_sources values(1,false,false);create table qik_ingest.collection_gate(id boolean primary key,collection_authorized boolean);insert into qik_ingest.collection_gate values(true,false);create table qik_ingest.schedule_intent(jobname text primary key,active boolean);create table qik_ingest.runtime_credentials(id integer);create table qik_ingest_operation.persistent_install_receipt(id boolean primary key,operation_id text,sql_manifest_sha256 text)")
  await customer.query('insert into qik_ingest_operation.persistent_install_receipt values(true,$1,$2)',[cfg.c3OperationId,cfg.c3ManifestSha256])
  phase='before'
  observed=await reconcileManagedPrerequisites(cfg,secrets)
  assert.equal(observed.state,'not_provisioned');assert.equal(observed.connection_cleanup_verified,true)
  phase='provision'
  observed=await provisionManagedPrerequisites(cfg,secrets)
  assert.equal(observed.state,'provisioned_authentication_verified');assert.equal(observed.connection_cleanup_verified,true)
  const receipt=(await customer.query('select to_jsonb(r) r from mip_managed_provisioning.receipts r')).rows[0].r
  assert.equal(receipt.operation_id,cfg.operationId)
  assert.equal(receipt.audit_edge.grantor_oid,'10');assert.equal(receipt.audit_edge.grantor_name,'supabase_admin')
  assert.equal(receipt.metadata_edge.grantor_oid,'10')
  assert.equal(JSON.stringify(receipt).includes('SCRAM'),false)
  phase='exact-reconcile'
  observed=await reconcileManagedPrerequisites(cfg,secrets);assert.equal(observed.state,'provisioned_authentication_verified')
  observed=await provisionManagedPrerequisites(cfg,secrets);assert.equal(observed.state,'provisioned_authentication_verified')
  phase='no-credential-replacement'
  const changed={...secrets,audit:uri(AUDIT_LOGIN,randomBytes(36).toString('base64url'))}
  observed=await provisionManagedPrerequisites(cfg,changed);assert.equal(observed.state,'provisioned_authentication_unverified')
  observed=await reconcileManagedPrerequisites(cfg,secrets);assert.equal(observed.state,'provisioned_authentication_verified')
  assert.deepEqual((await customer.query('select to_jsonb(r) r from mip_managed_provisioning.receipts r')).rows[0].r,receipt)
  phase='different-operation-refused'
  observed=await provisionManagedPrerequisites({...cfg,operationId:'5'.repeat(32)},secrets);assert.equal(observed.state,'provisioning_refused')
  phase='topology-drift-refused'
  await customer.query('grant '+qi(AUDIT_LOGIN)+' to postgres with admin false,inherit true,set false')
  observed=await reconcileManagedPrerequisites(cfg,secrets);assert.equal(observed.state,'provisioning_refused')
  await customer.query('revoke '+qi(AUDIT_LOGIN)+' from postgres')
  observed=await reconcileManagedPrerequisites(cfg,secrets);assert.equal(observed.state,'provisioned_authentication_verified')
  phase='immutable-receipt'
  await assert.rejects(customer.query('update mip_managed_provisioning.receipts set operation_id=operation_id'),e=>e.code==='P0001')
  phase='c3-held'
  assert.equal((await customer.query('select collection_authorized from qik_ingest.collection_gate')).rows[0].collection_authorized,false)
 }catch{failed=true}
 finally{
  try{
   if(owned){
    await provider.query('drop schema if exists mip_managed_provisioning cascade;drop schema if exists qik_ingest cascade;drop schema if exists qik_ingest_operation cascade;drop table if exists public.ingest_sources')
    await provider.query('drop extension if exists dblink')
    for(const r of [AUDIT_LOGIN,METADATA_LOGIN])if((await provider.query('select 1 from pg_roles where rolname=$1',[r])).rowCount){await provider.query('drop owned by '+qi(r));await provider.query('drop role '+qi(r))}
    assert.deepEqual((await provider.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname),before)
   }
  }catch{failed=true}
  await customer.end();await provider.end()
 }
 const safe=observed?{state:observed.state,phase:observed.phase,needs_reconciliation:observed.needs_reconciliation,connection_cleanup_verified:observed.connection_cleanup_verified}:null
 assert.equal(failed,false,'managed prerequisite proof failed at '+phase+' '+JSON.stringify(safe)+'; raw errors withheld')
})
