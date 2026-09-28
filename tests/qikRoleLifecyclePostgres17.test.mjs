import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import pg from 'pg'

// Only the existing owned loopback PG17.6 source/synthetic service is admitted.
// This fixture never reads a URL, an actual secret, or any application material.
const armed=process.env.MIP_QIK_ROLE_LIFECYCLE_DISPOSABLE==='synthetic-pg17-only'
const quote=name=>{
 assert.match(name,/^mip_role_probe_[a-f0-9]{12}_(installer|recipient|implicit|issuer|worker)$/)
 return '"'+name+'"'
}
test('PG17 automatic ADMIN authority and scoped non-owner issuer lifecycle',
 {skip:!armed,timeout:60000},async t=>{
 const prefix='mip_role_probe_'+randomBytes(6).toString('hex')+'_'
 const names=Object.fromEntries(['installer','recipient','implicit','issuer','worker'].map(k=>[k,prefix+k]))
 const clients=[],created=[]
 let admin,installer
 async function connect(user='postgres',password='mip-efta-disposable-ci-only'){
  const raw=new pg.Client({host:'127.0.0.1',port:5432,database:'postgres',user,password,
   ssl:false,connectionTimeoutMillis:5000,statement_timeout:10000,
   application_name:'mip_role_lifecycle_synthetic'})
  raw.on('error',()=>{})
  try{await raw.connect()}catch{throw Error('role_probe_connection_failed')}
  clients.push(raw)
  return {raw,query:async(...args)=>{
   try{return await raw.query(...args)}catch(error){
    throw Object.assign(Error('role_probe_sql_'+(error.code??'failure')),{code:error.code})
   }
  }}
 }
 try{
  admin=await connect()
  assert.equal((await admin.query('show server_version_num')).rows[0].server_version_num,'170006')
  for(const name of Object.values(names))
   assert.equal((await admin.query({text:'select 1 from pg_roles where rolname=$1',values:[name]})).rows.length,0)
  await admin.query('create role '+quote(names.installer)+
   " login noinherit nosuperuser nocreatedb createrole noreplication nobypassrls password 'synthetic-role-probe-only'")
  created.push(names.installer)
  await admin.query('create role '+quote(names.recipient)+
   ' nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls')
  created.push(names.recipient)
  installer=await connect(names.installer,'synthetic-role-probe-only')
  await installer.query('begin')
  const edges=async role=>(await installer.query({text:`select m.roleid::text roleid,m.member::text member,m.grantor::text grantor,
   m.admin_option,m.inherit_option,m.set_option from pg_auth_members m
   where m.roleid=$1::regrole order by m.roleid,m.member,m.grantor`,values:[role]})).rows
  const installerOid=(await installer.query('select session_user::regrole::oid::text oid')).rows[0].oid
  const bootstrapOid=(await admin.query('select session_user::regrole::oid::text oid')).rows[0].oid
  await t.test('implicit creator grant is bootstrap-issued and creator REVOKE cannot remove it',async()=>{
   await installer.query('create role '+quote(names.implicit)+' nologin noinherit')
   const before=await edges(names.implicit)
   assert.deepEqual(before,[{roleid:before[0].roleid,member:installerOid,grantor:bootstrapOid,
    admin_option:true,inherit_option:false,set_option:false}])
   await installer.query('revoke '+quote(names.implicit)+' from '+quote(names.installer))
   assert.deepEqual(await edges(names.implicit),before)
   await installer.query('grant '+quote(names.implicit)+' to '+quote(names.recipient)+
    ' with admin false,inherit false,set false')
   assert.equal((await edges(names.implicit)).filter(r=>r.member!==installerOid)[0].grantor,installerOid)
   await installer.query('revoke '+quote(names.implicit)+' from '+quote(names.recipient))
   assert.deepEqual(await edges(names.implicit),before)
   await installer.query('drop role '+quote(names.implicit))
  })
  await t.test('scoped issuer creates the worker and then loses all role-creation attributes',async()=>{
   await installer.query('create role '+quote(names.issuer)+
    ' nologin noinherit nosuperuser nocreatedb createrole noreplication nobypassrls')
   await installer.query('grant '+quote(names.issuer)+' to '+quote(names.installer)+
    ' with admin false,inherit false,set true')
   await installer.query('set local role '+quote(names.issuer))
   await installer.query('create role '+quote(names.worker)+
    ' nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls')
   await installer.query('reset role')
   await installer.query('alter role '+quote(names.issuer)+' nocreaterole')
   const flags=(await installer.query({text:`select rolcanlogin,rolinherit,rolsuper,rolcreatedb,
    rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname=$1`,values:[names.issuer]})).rows[0]
   assert.ok(Object.values(flags).every(value=>value===false))
   const issuerOid=(await installer.query({text:'select $1::regrole::oid::text oid',values:[names.issuer]})).rows[0].oid
   const workerEdges=await edges(names.worker)
   assert.deepEqual(workerEdges,[{roleid:workerEdges[0].roleid,member:issuerOid,grantor:bootstrapOid,
    admin_option:true,inherit_option:false,set_option:false}])
   const rights=(await installer.query({text:`select pg_has_role(session_user,$1,'USAGE') usable,
    pg_has_role(session_user,$1,'SET') settable`,values:[names.worker]})).rows[0]
   assert.deepEqual(rights,{usable:false,settable:false})
   const owned=(await installer.query({text:`select count(*)::int n from pg_shdepend
    where refclassid='pg_authid'::regclass and refobjid=$1::regrole and deptype in ('o','a')`,
    values:[names.issuer]})).rows[0].n
   assert.equal(owned,0)
  })
  await t.test('issuer fixed GRANT/REVOKE and savepoint removal restore exact topology',async()=>{
   const beforeIssuer=await edges(names.issuer),beforeWorker=await edges(names.worker)
   await installer.query('set local role '+quote(names.issuer))
   await installer.query('grant '+quote(names.worker)+' to '+quote(names.recipient)+
    ' with admin false,inherit true,set true')
   await installer.query('reset role')
   const active=await edges(names.worker)
   assert.equal(active.length,beforeWorker.length+1)
   await installer.query('savepoint active_drop_refusal')
   await assert.rejects(()=>installer.query('drop role '+quote(names.issuer)),error=>error.code==='2BP01')
   await installer.query('rollback to savepoint active_drop_refusal')
   await installer.query('release savepoint active_drop_refusal')
   assert.deepEqual(await edges(names.worker),active)
   await installer.query('savepoint old_checkpoint')
   await installer.query('set local role '+quote(names.issuer))
   await installer.query('revoke '+quote(names.worker)+' from '+quote(names.recipient))
   await installer.query('reset role')
   await installer.query('drop role '+quote(names.issuer))
   assert.deepEqual(await edges(names.worker),[])
   await installer.query('rollback to savepoint old_checkpoint')
   await installer.query('release savepoint old_checkpoint')
   assert.deepEqual(await edges(names.issuer),beforeIssuer)
   assert.deepEqual(await edges(names.worker),active)
   await installer.query('set local role '+quote(names.issuer))
   await installer.query('revoke '+quote(names.worker)+' from '+quote(names.recipient))
   await installer.query('reset role')
   assert.deepEqual(await edges(names.worker),beforeWorker)
  })
  await installer.query('rollback')
  for(const name of [names.implicit,names.issuer,names.worker])
   assert.equal((await admin.query({text:'select 1 from pg_roles where rolname=$1',values:[name]})).rows.length,0)
  t.diagnostic('Synthetic PG17.6 authority probe only; no final application permission or hosted qik proof.')
 }finally{
  if(installer)try{await installer.query('rollback')}catch{}
  for(const raw of clients.slice().reverse())if(raw!==admin?.raw)await raw.end()
  if(admin){
   for(const name of created.slice().reverse())await admin.query('drop role '+quote(name))
   for(const name of Object.values(names))
    assert.equal((await admin.query({text:'select 1 from pg_roles where rolname=$1',values:[name]})).rows.length,0)
   await admin.raw.end()
  }
 }
})
