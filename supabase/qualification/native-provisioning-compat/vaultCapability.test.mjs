// Narrow Vault capability proof; no production installation or secret material.
import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {randomBytes} from 'node:crypto'
const roles=['supabase_etl_admin','supabase_read_only_user']
const fail=()=>{throw Error('vault_capability_refused')}
async function connect(user,password){
 const db=new pg.Client({host:'127.0.0.1',port:5432,database:'postgres',user,password,connectionTimeoutMillis:5000,statement_timeout:10000})
 await db.connect();return db
}
test('Vault caller function ACL protects synthetic plaintext from provider read-all principals',async()=>{
 assert.equal(process.env.MIP_VAULT_CAPABILITY_ARM,'synthetic-pg17-local-only')
 assert.equal(process.env.MIP_DISPOSABLE_POSTGRES,'qik-persistent-install')
 const provider=await connect('supabase_admin',process.env.MIP_COMPAT_ADMIN_PASSWORD)
 const customer=await connect('postgres',process.env.MIP_COMPAT_CUSTOMER_PASSWORD)
 const peers=[];let secretId=null,owned=false,phase='baseline',failure=null
 const synthetic=randomBytes(48).toString('hex')
 const safeIdent=s=>{if(!/^[a-z][a-z0-9_]*$/.test(s))fail();return '"'+s+'"'}
 try{
  if((await customer.query("select current_user='postgres' and session_user='postgres' and not (select rolsuper from pg_roles where rolname=current_user) and current_setting('server_version_num')='170006' ok")).rows[0].ok!==true)fail()
  const extension=(await customer.query("select extversion,extowner::regrole::text owner from pg_extension where extname='supabase_vault'")).rows
  assert.deepEqual(extension,[{extversion:'0.3.1',owner:'supabase_admin'}])
  const before=(await customer.query("select rolname,rolcanlogin,rolsuper,rolbypassrls,rolinherit,rolcreaterole,rolreplication from pg_roles where rolname=any($1) order by rolname",[roles])).rows
  assert.equal(before.length,2)
  for(const role of before)assert.equal(role.rolcanlogin&&!role.rolsuper&&role.rolbypassrls&&role.rolinherit&&!role.rolcreaterole,true)
  phase='provider-only-authentication-fixture'
  for(const role of roles){
   const password=randomBytes(32).toString('hex')
   // Administrator prepares only synthetic login credentials, not customer Vault operations or ACLs.
   await provider.query('alter role '+safeIdent(role)+" password '"+password+"'")
   const db=await connect(role,password);peers.push(db)
   assert.deepEqual((await db.query('select current_user::text u,session_user::text s')).rows[0],{u:role,s:role})
   assert.equal((await db.query("select has_schema_privilege(current_user,'vault','USAGE') and has_table_privilege(current_user,'vault.decrypted_secrets','SELECT') and not has_function_privilege(current_user,'vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea)','EXECUTE') ok")).rows[0].ok,true)
  }
  phase='customer-create'
  secretId=(await customer.query('select vault.create_secret($1) id',[synthetic])).rows[0].id
  owned=true
  assert.equal((await customer.query('select decrypted_secret=$2 matches from vault.decrypted_secrets where id=$1',[secretId,synthetic])).rows[0].matches,true)
  phase='actual-provider-denials'
  for(const db of peers){
   assert.equal((await db.query('select count(*)::int n from vault.secrets where id=$1',[secretId])).rows[0].n,1)
   // Only ciphertext metadata above. Decrypt calls MUST fail before returning any value.
   await assert.rejects(db.query('select decrypted_secret from vault.decrypted_secrets where id=$1',[secretId]),e=>e.code==='42501')
   await assert.rejects(db.query("select vault._crypto_aead_det_decrypt(null::bytea,null::bytea,0::bigint,null::bytea,null::bytea)"),e=>e.code==='42501')
  }
  phase='customer-rollback'
  await customer.query('begin')
  const rolled=(await customer.query('select vault.create_secret($1) id',[randomBytes(48).toString('hex')])).rows[0].id
  await customer.query('rollback')
  assert.equal((await customer.query('select count(*)::int n from vault.secrets where id=$1',[rolled])).rows[0].n,0)
  phase='customer-update'
  const next=randomBytes(48).toString('hex')
  await customer.query('select vault.update_secret($1,$2)',[secretId,next])
  assert.equal((await customer.query('select decrypted_secret=$2 matches from vault.decrypted_secrets where id=$1',[secretId,next])).rows[0].matches,true)
  for(const db of peers)await assert.rejects(db.query('select decrypted_secret from vault.decrypted_secrets where id=$1',[secretId]),e=>e.code==='42501')
  assert.deepEqual((await customer.query("select rolname,rolcanlogin,rolsuper,rolbypassrls,rolinherit,rolcreaterole,rolreplication from pg_roles where rolname=any($1) order by rolname",[roles])).rows,before)
 }catch(e){failure={phase,sqlstate:/^[A-Z0-9]{5}$/.test(e?.code??'')?e.code:null}}
 finally{
  await customer.query('rollback').catch(()=>{})
  if(owned){
   const removed=await customer.query('delete from vault.secrets where id=$1',[secretId])
   if(removed.rowCount!==1||(await customer.query('select count(*)::int n from vault.secrets where id=$1',[secretId])).rows[0].n!==0)failure={phase:'owned-cleanup',sqlstate:null}
  }
  for(const db of peers)await db.end()
  await customer.end();await provider.end()
 }
 assert.equal(failure,null,'bounded Vault capability failure '+JSON.stringify(failure))
})
