import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {installOwnedPackages,cleanupOwnedPackages} from '../supabase/qualification/collector-native-capture/ownedPackageInstall.mjs'
import {bootstrapAuthenticatedOperation,cleanupAuthenticatedOperation,operationNames,readForwardWatermark} from '../supabase/qualification/collector-native-capture/authenticatedBootstrap.mjs'
import {connectAuthenticatedPg} from '../supabase/qualification/collector-native-capture/authenticatedPgDriver.mjs'
import {runAuthenticatedQualification} from '../supabase/qualification/collector-native-capture/authenticatedQualification.mjs'

const packageRoles=['qik_ingest_fn_owner','qik_ingest_runtime','mip_cas_owner','mip_cas_gateway','mip_cas_codec_verifier']
const packageSchemas=['qik_ingest','qik_ingest_operation','mip_cas','mip_cas_source_install']
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8')
const ident=name=>'"'+name.replaceAll('"','""')+'"'

test('restricted installer: password login, owner privileges, rollback and complete temporary qualification',async t=>{
  if(process.env.MIP_DISPOSABLE_POSTGRES!=='collector-native-capture-restricted') {
    t.skip('requires explicitly selected disposable native PostgreSQL')
    return
  }
  // Root provisions the disposable fixture. It never executes package install,
  // bootstrap, synthetic qualification, or package cleanup.
  const rootConfig={host:process.env.MIP_TEST_ROOT_SOCKET||'127.0.0.1',port:Number(process.env.PGPORT||5432),
    user:'postgres',database:'postgres',password:process.env.PGPASSWORD||'mip-disposable-ci-only'}
  const operationId=randomBytes(16).toString('hex'),database='mip_cnc_restricted_'+operationId.slice(0,12)
  const adminName='mip_cnc_admin_'+operationId.slice(0,12),adminPassword=randomBytes(32).toString('hex')
  const names=operationNames(operationId),token=randomBytes(32).toString('hex')
  const passwords=Object.fromEntries(['collector','native','cas'].map(k=>[k,randomBytes(32).toString('hex')]))
  const root=new pg.Client(rootConfig),clients=[],createdBaseRoles=[]
  let setup,admin,createdDb=false,createdAdmin=false,baselineAbsent=false,installed=false,bootstrapped=false,stage='provision',primary
  await root.connect()
  try {
    for(const role of [...packageRoles,adminName,...Object.values(names)])
      assert.equal((await root.query('select 1 from pg_roles where rolname=$1',[role])).rowCount,0,'preexisting test role')
    baselineAbsent=true
    // The generated administrator secret exists only in process memory; setup
    // uses this session-only logging mode before its password DDL.
    await root.query("set log_statement='none'")
    await root.query("set log_min_error_statement='panic'")
    await root.query('create role '+ident(adminName)+" login nosuperuser createrole createdb inherit bypassrls password '"+adminPassword+"'")
    createdAdmin=true
    for(const role of ['anon','authenticated','service_role']) {
      if(!(await root.query('select 1 from pg_roles where rolname=$1',[role])).rowCount) {
        await root.query('create role '+ident(role)+' nologin noinherit'+(role==='service_role'?' bypassrls':''))
        createdBaseRoles.push(role)
      }
    }
    // qik postgres has authority to delegate service_role. This fixture grants
    // only ADMIN, without inheriting or SET access to that role itself.
    await root.query('grant service_role to '+ident(adminName)+' with admin true, inherit false, set false')
    for(const [setting,value] of [
      ['session_preload_libraries',"'auto_explain'"],['auto_explain.log_min_duration','10000'],
      ['auto_explain.log_nested_statements','off'],['auto_explain.log_parameter_max_length','-1'],
      ['log_statement',"'ddl'"],['log_error_verbosity',"'verbose'"],
      ['log_min_duration_statement','-1'],['log_min_duration_sample','-1'],['log_transaction_sample_rate','0'],
      ['log_parameter_max_length_on_error','0'],['createrole_self_grant',"''"],
    ])await root.query('alter role '+ident(adminName)+' set '+setting+'='+value)
    await root.query('create database '+ident(database)+' owner '+ident(adminName));createdDb=true
    setup=new pg.Client({...rootConfig,database});await setup.connect()
    await setup.query('create schema extensions; create extension pgcrypto with schema extensions')
    const extensionBefore=(await setup.query("select extnamespace::regnamespace::text n from pg_extension where extname='pgcrypto'")).rows[0].n
    assert.equal(extensionBefore,'extensions')
    for(const bytes of [Buffer.alloc(0),Buffer.from('Water 🌊 café'),Buffer.from([0,1,0,255])])
      assert.equal((await setup.query("select pg_catalog.sha256($1::bytea)=extensions.digest($1::bytea,'sha256') same",[bytes])).rows[0].same,true)
    // Enter restricted owner context even for substrate creation. Do not
    // REASSIGN OWNED postgres: that could change unrelated shared objects.
    await setup.query('set role '+ident(adminName))
    for(const path of [
      'supabase/qualification/qik-ingest/fixture_substrate.sql',
      'supabase/migrations/20260905082406_evidence_pipeline_reliability.sql',
      'supabase/migrations/20260906042413_evidence_change_queue_v1.sql',
      'supabase/migrations/20260907234007_evidence_change_producer_claim_v1.sql',
    ])await setup.query(await read(path))
    await setup.query('reset role');await setup.end();setup=null
    const config={host:'127.0.0.1',port:rootConfig.port,database,user:adminName,password:adminPassword}
    await assert.rejects(new pg.Client({...config,password:'incorrect-password'}).connect(),error=>error.code==='28P01')
    admin=new pg.Client(config);await admin.connect()
    const identity=(await admin.query("select version(),session_user::text login,current_user::text effective,rolsuper,rolcreaterole,rolcreatedb,rolinherit,rolbypassrls,current_setting('createrole_self_grant') self_grant from pg_roles where rolname=session_user")).rows[0]
    assert.equal(identity.login,adminName);assert.equal(identity.effective,adminName)
    for(const key of ['rolcreaterole','rolcreatedb','rolinherit','rolbypassrls'])assert.equal(identity[key],true)
    assert.equal(identity.rolsuper,false);assert.equal(identity.self_grant,'')
    assert.equal((await admin.query("select datdba=current_user::regrole owned from pg_database where datname=current_database()")).rows[0].owned,true)
    assert.equal((await admin.query("select nspowner::regrole::text owner from pg_namespace where nspname='public'")).rows[0].owner,'pg_database_owner')
    assert.equal((await admin.query("select relowner=current_user::regrole owned from pg_class where oid='public.articles'::regclass")).rows[0].owned,true)
    t.diagnostic(JSON.stringify(identity))
    const baseline=await readForwardWatermark(admin)
    // Independent negative prerequisites, rolled back including roles.
    stage='missing_set'
    await admin.query('begin')
    await admin.query('create role mip_cas_owner nologin noinherit')
    await assert.rejects(admin.query('create schema mip_cas authorization mip_cas_owner'),e=>e.code==='42501'&&/SET ROLE/.test(e.message))
    await admin.query('rollback')
    stage='missing_schema_create'
    await admin.query('begin')
    await admin.query('create role qik_ingest_fn_owner nologin noinherit')
    await admin.query('grant qik_ingest_fn_owner to '+ident(adminName)+' with set true, inherit false')
    await admin.query('create schema qik_ingest; grant usage on schema qik_ingest to qik_ingest_fn_owner')
    await admin.query('create function qik_ingest.probe() returns integer language sql as $$select 1$$')
    await admin.query('savepoint missing_create')
    await assert.rejects(admin.query('alter function qik_ingest.probe() owner to qik_ingest_fn_owner'),e=>e.code==='42501'&&/schema qik_ingest/.test(e.message))
    await admin.query('rollback to savepoint missing_create')
    await admin.query('grant create on schema qik_ingest to qik_ingest_fn_owner')
    await admin.query('alter function qik_ingest.probe() owner to qik_ingest_fn_owner')
    await admin.query('rollback')
    stage='partial_install_rollback'
    let injected=false
    const fault={query:(sql,params)=>{
      if(typeof sql==='string'&&sql.startsWith('create table qik_ingest_operation.authenticated_package_watermark')) {
        injected=true;throw Error('test_injected_after_packages')
      }
      return admin.query(sql,params)
    }}
    await assert.rejects(installOwnedPackages(fault,randomBytes(16).toString('hex')),/cnc_owned_install_failed/)
    assert.equal(injected,true)
    assert.equal((await admin.query('select 1 from pg_namespace where nspname=any($1::text[])',[packageSchemas])).rowCount,0)
    assert.equal((await admin.query('select 1 from pg_roles where rolname=any($1::text[])',[packageRoles])).rowCount,0)
    assert.deepEqual(await readForwardWatermark(admin),baseline)
    stage='preexisting_refusal'
    await admin.query('create schema mip_cas_source_install')
    await assert.rejects(installOwnedPackages(admin,randomBytes(16).toString('hex')),/cnc_owned_install_failed/)
    assert.notEqual((await admin.query("select to_regnamespace('mip_cas_source_install') n")).rows[0].n,null)
    assert.equal((await admin.query("select to_regnamespace('qik_ingest_operation') n")).rows[0].n,null)
    await admin.query('drop schema mip_cas_source_install')
    stage='install'
    await installOwnedPackages(admin,operationId);installed=true
    assert.equal((await admin.query("select has_schema_privilege('qik_ingest_fn_owner','qik_ingest','CREATE') allowed")).rows[0].allowed,false)
    assert.equal((await admin.query("select has_schema_privilege('qik_ingest_fn_owner','public','CREATE') allowed")).rows[0].allowed,false)
    const ownerEdges=(await admin.query("select p.rolname,m.inherit_option,m.set_option from pg_auth_members m join pg_roles p on p.oid=m.roleid where m.member=current_user::regrole and p.rolname in ('qik_ingest_fn_owner','mip_cas_owner') and m.set_option")).rows
    assert.equal(ownerEdges.length,2);assert.ok(ownerEdges.every(r=>r.inherit_option===false))
    stage='membership_drift_refusal'
    const memberships=async()=>(await admin.query("select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid='qik_ingest_fn_owner'::regrole and member=current_user::regrole order by grantor")).rows
    const priorMemberships=await memberships()
    await admin.query('grant qik_ingest_fn_owner to '+ident(adminName)+' with inherit true')
    await assert.rejects(cleanupOwnedPackages(admin,operationId),/cnc_owned_cleanup_failed/)
    assert.ok((await memberships()).some(r=>r.inherit_option))
    assert.notEqual((await admin.query("select to_regnamespace('qik_ingest_operation') n")).rows[0].n,null)
    await admin.query('grant qik_ingest_fn_owner to '+ident(adminName)+' with inherit false, set true')
    assert.deepEqual(await memberships(),priorMemberships)
    stage='unrelated_grant_refusal'
    await admin.query('create table public.restricted_sentinel(id integer primary key)')
    await admin.query('insert into public.restricted_sentinel values(42)')
    await admin.query('grant select on public.restricted_sentinel to qik_ingest_fn_owner')
    await assert.rejects(cleanupOwnedPackages(admin,operationId),/cnc_owned_cleanup_failed/)
    assert.equal((await admin.query("select has_table_privilege('qik_ingest_fn_owner','public.restricted_sentinel','SELECT') allowed")).rows[0].allowed,true)
    assert.equal((await admin.query('select id from public.restricted_sentinel')).rows[0].id,42)
    await admin.query('revoke select on public.restricted_sentinel from qik_ingest_fn_owner')
    stage='bootstrap'
    const manifest=await bootstrapAuthenticatedOperation(admin,{operationId,passwords,token,watermarkBaseline:baseline,sourceId:randomUUID(),investigation:randomUUID(),userId:randomUUID()})
    bootstrapped=true
    const connection=(name,password)=>'postgresql://'+name+':'+password+'@127.0.0.1:'+config.port+'/'+database
    for(const kind of ['collector','native','cas']) {
      const client=await connectAuthenticatedPg({connectionString:connection(names[kind],passwords[kind]),expectedLogin:names[kind],effectiveRole:kind==='native'?'service_role':null,disposable:true})
      clients.push(client)
      assert.equal((await client.query('select session_user::text login')).rows[0].login,names[kind])
    }
    assert.equal((await clients[0].query("select has_function_privilege(current_user,'public.mip_qik_ingest_native(text,text,text,jsonb)','EXECUTE') allowed")).rows[0].allowed,true)
    // The facade is reached through the actual password login; owner gate
    // rejection is distinct from an absent EXECUTE grant after owner transfer.
    await assert.rejects(clients[0].query("select public.mip_qik_ingest_native($1,$2,'states','{\"job_ids\":[]}'::jsonb)",[token,'not-started']),
      e=>e.code==='42501'&&e.message==='qik_ingest_collection_not_authorized')
    stage='qualification'
    const result=await runAuthenticatedQualification({admin,collector:clients[0],native:clients[1],cas:clients[2],manifest,token})
    assert.deepEqual(result.residual,{articles:2,jobs:3,captures:3,articleIdentities:2,jobEvents:6,evidenceChanges:5,changeJobs:10,evidenceCandidates:3,articleInsertVersions:2,importReceipts:6,ingestionRuns:3,sourceRuns:3,disabledSyntheticSource:1})
    assert.equal(result.cas.exactBytes,true);assert.equal(result.cas.rehydrated,true);assert.equal(result.cas.revocationDenied,true)
    for(const client of clients.splice(0))await client.end()
    stage='runtime_cleanup';await cleanupAuthenticatedOperation(admin,operationId);bootstrapped=false
    stage='package_cleanup';await cleanupOwnedPackages(admin,operationId);installed=false
    assert.deepEqual(await readForwardWatermark(admin),baseline)
    assert.equal((await admin.query("select extnamespace::regnamespace::text n from pg_extension where extname='pgcrypto'")).rows[0].n,'extensions')
    assert.equal((await admin.query('select id from public.restricted_sentinel')).rows[0].id,42)
    assert.equal((await admin.query('select count(*)::int n from public.articles')).rows[0].n,3)
    assert.equal((await admin.query('select 1 from pg_roles where rolname=any($1::text[])',[packageRoles.concat(Object.values(names))])).rowCount,0)
    assert.equal((await admin.query('select 1 from pg_namespace where nspname=any($1::text[])',[packageSchemas])).rowCount,0)
    t.diagnostic('restricted install, three authenticated runs, CAS bytes, rollback/refusal and cleanup verified; PostgreSQL major version shown above, not hosted proof')
  }catch(error){
    primary=error
    t.diagnostic(JSON.stringify({stage,code:error.code??null,message:/^cnc_[a-z_]+$/.test(error.message??'')?error.message:'restricted_test_failed'}))
  }finally{
    const errors=[]
    for(const client of clients.splice(0))try{await client.end()}catch(e){errors.push(e)}
    if(admin) {
      try{await admin.query('rollback')}catch(e){errors.push(e)}
      if(bootstrapped)try{await cleanupAuthenticatedOperation(admin,operationId)}catch(e){errors.push(e)}
      if(installed)try{await cleanupOwnedPackages(admin,operationId)}catch(e){errors.push(e)}
      try{await admin.end()}catch(e){errors.push(e)}
    }
    if(setup)try{await setup.end()}catch(e){errors.push(e)}
    // Last-resort fixture destruction cannot turn a package-cleanup failure
    // into PASS. Every error above is retained; only exact fresh test identities
    // may be removed after all connections close.
    if(createdDb)try{await root.query('drop database '+ident(database))}catch(e){errors.push(e)}
    const ownedRoles=[...(baselineAbsent&&createdDb?[...Object.values(names),...packageRoles]:[]),...createdBaseRoles,...(createdAdmin?[adminName]:[])]
    for(const role of ownedRoles)try{
      if((await root.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)await root.query('drop role '+ident(role))
    }catch(e){errors.push(e)}
    try {
      assert.equal((await root.query('select 1 from pg_database where datname=$1',[database])).rowCount,0)
      assert.equal((await root.query('select 1 from pg_roles where rolname=any($1::text[])',[ownedRoles])).rowCount,0)
    }catch(e){errors.push(e)}
    await root.end()
    for(const error of errors)t.diagnostic(JSON.stringify({stage:'fixture_cleanup',code:error.code??null,message:'cleanup_failed'}))
    if(primary||errors.length)throw new AggregateError([...(primary?[primary]:[]),...errors],'restricted_installer_verification_failed')
  }
})
