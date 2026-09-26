import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import pg from 'pg'
import {installPersistentQik,cleanupPersistentQik} from '../supabase/qualification/qik-ingest/persistentInstall.mjs'
import {runNativeHost} from '../supabase/qualification/qik-ingest/nativeHost.mjs'
import {installCredentialHelper,assignCredential,removeCredentialHelper} from '../supabase/qualification/collector-native-capture/credentialDelivery.mjs'
import {FEED} from './qikIngestTestKit.mjs'
const packageRoles=['qik_ingest_fn_owner','qik_ingest_runtime']
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8')
const ident=name=>'"'+name.replaceAll('"','""')+'"'

test('persistent C3: restricted login, atomic install, reconnect and existing native host',async t=>{
  if(process.env.MIP_DISPOSABLE_POSTGRES!=='qik-persistent-install'){t.skip('requires explicit disposable PostgreSQL');return}
  // Root provisions the disposable fixture. It never executes package install,
  // bootstrap, synthetic qualification, or package cleanup.
  const rootConfig={host:process.env.MIP_TEST_ROOT_SOCKET||'127.0.0.1',port:Number(process.env.PGPORT||5432),
    user:'postgres',database:'postgres',password:process.env.PGPASSWORD||'mip-disposable-ci-only'}
  const operationId=randomBytes(16).toString('hex'),database='mip_c3_persist_'+operationId.slice(0,12)
  const adminName='mip_c3_admin_'+operationId.slice(0,12),adminPassword=randomBytes(32).toString('hex')
  const names={collector:'cnc_'+operationId+'_collector'},token=randomBytes(32).toString('hex')
  const password=randomBytes(32).toString('hex')
  const root=new pg.Client(rootConfig),clients=[],createdBaseRoles=[]
  let setup,admin,createdDb=false,createdAdmin=false,baselineAbsent=false,installed=false,runtimeCreated=false,server,stage='provision',primary
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
    // No service_role membership or ADMIN grant is given to the installer.
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
    assert.equal((await admin.query("select pg_has_role(current_user,'service_role','MEMBER') member")).rows[0].member,false)
    assert.equal((await admin.query("select datdba=current_user::regrole owned from pg_database where datname=current_database()")).rows[0].owned,true)
    assert.equal((await admin.query("select nspowner::regrole::text owner from pg_namespace where nspname='public'")).rows[0].owner,'pg_database_owner')
    assert.equal((await admin.query("select relowner=current_user::regrole owned from pg_class where oid='public.articles'::regclass")).rows[0].owned,true)
    t.diagnostic(JSON.stringify(identity))

    const configInstall={operationId,expectedLogin:adminName}
    stage='rollback'
    let injected=false,impersonation=false
    const fault={query:(sql,params)=>{
      if(/set\s+session\s+authorization/i.test(sql)){impersonation=true;throw Error('impersonation')}
      if(sql.startsWith('create table qik_ingest_operation.persistent_install_receipt')){injected=true;throw Error('injected')}
      return admin.query(sql,params)
    }}
    await assert.rejects(installPersistentQik(fault,configInstall),/persistent_install_failed/)
    assert.equal(injected,true);assert.equal(impersonation,false)
    assert.equal((await admin.query("select to_regnamespace('qik_ingest') n")).rows[0].n,null)
    assert.equal((await admin.query('select count(*)::int n from public.mip_consolidation_watermarks')).rows[0].n,0)
    assert.equal((await admin.query('select 1 from pg_roles where rolname=any($1::text[])',[packageRoles])).rowCount,0)
    stage='command_install'
    const dbUrl=new URL('postgresql://127.0.0.1:'+config.port+'/'+database)
    dbUrl.username=adminName;dbUrl.password=adminPassword
    const child=spawn(process.execPath,[new URL('../supabase/qualification/qik-ingest/runPersistentInstall.mjs',import.meta.url).pathname,'install','--execute','--disposable'],
      {env:{PATH:process.env.PATH,MIP_DISPOSABLE_POSTGRES:'qik-persistent-install',MIP_C3_PERSISTENT_AUTHORIZATION:'owner-authorized-disabled-install',
        MIP_C3_INSTALLER_DATABASE_URL:dbUrl.href,MIP_C3_INSTALLER_LOGIN:adminName,MIP_C3_OPERATION_ID:operationId},stdio:['ignore','pipe','pipe']})
    let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x)
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)})
    assert.equal((out+err).includes(adminPassword),false)
    const result=JSON.parse(out);assert.equal(code,0,JSON.stringify(result));installed=true
    assert.equal(result.state,'installed_disabled');assert.equal(result.connection_closed,true)
    assert.equal(result.installer,adminName)
    await admin.end();admin=new pg.Client(config);await admin.connect()
    stage='reconnected'
    assert.equal((await admin.query('select session_user::text s,current_user::text c')).rows[0].s,adminName)
    assert.equal((await admin.query("select collection_authorized from qik_ingest.collection_gate where id")).rows[0].collection_authorized,false)
    assert.equal((await admin.query('select count(*)::int n from qik_ingest.runtime_credentials')).rows[0].n,0)
    assert.equal((await admin.query('select count(*)::int n from qik_ingest.schedule_intent where active')).rows[0].n,0)
    assert.equal((await admin.query("select to_regnamespace('mip_cas') n")).rows[0].n,null)
    const watermarks=(await admin.query('select source_project_ref,watermark,captured_at from public.mip_consolidation_watermarks')).rows
    const yhb=watermarks.find(r=>r.source_project_ref==='yhbwnrtlqbjtcrrlpbge'),qik=watermarks.find(r=>r.source_project_ref==='qikvmopbtijoebdqosyq')
    assert.equal(yhb.watermark.articles,36183);assert.equal(yhb.watermark.kind,'yhb_ingest_pause_observation')
    assert.equal(yhb.watermark.freshness,'historical_observation');assert.equal(yhb.captured_at.toISOString(),'2026-09-26T05:03:32.000Z')
    assert.equal(qik.watermark.articles_observed_at_package,1);assert.equal(qik.watermark.continuity_verified,false)
    assert.ok(Math.abs(Date.now()-qik.captured_at.getTime())<60000)
    stage='foreign_cleanup'
    const cleanupConfig={...configInstall,cleanupAuthorization:'owner-authorized-persistent-cleanup'}
    await assert.rejects(cleanupPersistentQik(admin,{...cleanupConfig,operationId:randomBytes(16).toString('hex')}),/persistent_cleanup_failed/)
    await admin.query('create table public.persist_sentinel(id integer);insert into public.persist_sentinel values(42);grant select on public.persist_sentinel to qik_ingest_fn_owner')
    await assert.rejects(cleanupPersistentQik(admin,cleanupConfig),/persistent_cleanup_failed/)
    assert.equal((await admin.query("select has_table_privilege('qik_ingest_fn_owner','public.persist_sentinel','SELECT') allowed")).rows[0].allowed,true)
    assert.equal((await admin.query('select operation_id from qik_ingest_operation.persistent_install_receipt')).rows[0].operation_id,operationId)
    await admin.query('revoke select on public.persist_sentinel from qik_ingest_fn_owner')
    // Fixture-only owner provisioning; the installer never issues this login,
    // password, token, gate change or feed approval.
    stage='runtime_provision'
    await admin.query('begin');await admin.query("set local statement_timeout='1000ms'")
    await admin.query('create role '+ident(names.collector)+' login nosuperuser nocreatedb nocreaterole inherit nobypassrls')
    await installCredentialHelper(admin);await assignCredential(admin,names.collector,password);await removeCredentialHelper(admin)
    await admin.query('grant qik_ingest_runtime to '+ident(names.collector))
    await admin.query("insert into qik_ingest.runtime_credentials values(encode(sha256(convert_to($1,'UTF8')),'hex'),true,'disposable separately provisioned owner token')",[token])
    await admin.query('commit');runtimeCreated=true
    server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/rss+xml'});res.end(FEED)})
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    const feed='http://127.0.0.1:'+server.address().port+'/feed.xml'
    await admin.query('update qik_ingest.collection_gate set collection_authorized=true where id')
    await admin.query("update public.ingest_sources set enabled=true,collection_enabled=true,feed_url=$1 where id='11111111-1111-4111-8111-111111111111'",[feed])
    await admin.end();admin=null
    const runtimeUrl=new URL('postgresql://127.0.0.1:'+config.port+'/'+database)
    runtimeUrl.username=names.collector;runtimeUrl.password=password
    const oldMarker=process.env.MIP_DISPOSABLE_POSTGRES
    process.env.MIP_DISPOSABLE_POSTGRES='qik-native-caller'
    try{
      stage='native_host'
      const first=await runNativeHost({connectionString:runtimeUrl.href,expectedLogin:names.collector,token,runId:'qik-host-'+operationId+'-first',allowedFeedUrls:[feed],disposable:true})
      assert.equal(first.state,'completed',JSON.stringify(first));assert.equal(first.inserted,2);assert.equal(first.connection_closed,true)
      const second=await runNativeHost({connectionString:runtimeUrl.href,expectedLogin:names.collector,token,runId:'qik-host-'+operationId+'-second',allowedFeedUrls:[feed],disposable:true})
      assert.equal(second.state,'completed');assert.equal(second.duplicates,2)
    }finally{process.env.MIP_DISPOSABLE_POSTGRES=oldMarker}
    await new Promise(resolve=>server.close(resolve));server=null
    admin=new pg.Client(config);await admin.connect()
    stage='explicit_cleanup'
    await assert.rejects(cleanupPersistentQik(admin,configInstall),/persistent_cleanup_authorization_required/)
    await assert.rejects(cleanupPersistentQik(admin,cleanupConfig),/persistent_cleanup_failed/)
    await admin.query('update public.ingest_sources set enabled=false,collection_enabled=false')
    await admin.query('update qik_ingest.collection_gate set collection_authorized=false')
    await admin.query('delete from qik_ingest.runtime_credentials')
    await admin.query('revoke qik_ingest_runtime from '+ident(names.collector))
    await admin.query('drop role '+ident(names.collector));runtimeCreated=false
    const preserved=(await admin.query('select source_project_ref,channel,watermark,captured_at::text from public.mip_consolidation_watermarks order by 1,2')).rows
    await cleanupPersistentQik(admin,cleanupConfig);installed=false
    assert.deepEqual((await admin.query('select source_project_ref,channel,watermark,captured_at::text from public.mip_consolidation_watermarks order by 1,2')).rows,preserved)
    assert.equal((await admin.query('select count(*)::int n from public.articles')).rows[0].n,3)
    assert.equal((await admin.query('select id from public.persist_sentinel')).rows[0].id,42)
    assert.equal((await admin.query("select to_regnamespace('qik_ingest_operation') n")).rows[0].n,null)
    t.diagnostic('atomic install, identity preservation, disabled defaults, restart persistence, separate runtime host and explicit exact cleanup verified')
  }catch(error){primary=error;t.diagnostic(JSON.stringify({stage,code:error.code??null,error:/^persistent_[a-z_]+$/.test(error.message??'')?error.message:'persistent_test_failed'}))}
  finally{
    const errors=[]
    if(server)await new Promise(resolve=>server.close(resolve))
    if(admin){try{await admin.query('rollback')}catch(e){errors.push(e)}try{await admin.end()}catch(e){errors.push(e)}}
    if(setup)try{await setup.end()}catch(e){errors.push(e)}
    if(createdDb)try{await root.query('drop database '+ident(database))}catch(e){errors.push(e)}
    const owned=[...(baselineAbsent&&createdDb?[...Object.values(names),...packageRoles]:[]),...createdBaseRoles,...(createdAdmin?[adminName]:[])]
    for(const role of owned)try{if((await root.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)await root.query('drop role '+ident(role))}catch(e){errors.push(e)}
    try{assert.equal((await root.query('select 1 from pg_database where datname=$1',[database])).rowCount,0);assert.equal((await root.query('select 1 from pg_roles where rolname=any($1::text[])',[owned])).rowCount,0)}catch(e){errors.push(e)}
    await root.end()
    if(primary||errors.length)throw new AggregateError([...(primary?[primary]:[]),...errors],'persistent_verification_failed')
  }
})
