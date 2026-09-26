import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import pg from 'pg'
import {installPersistentQik,cleanupPersistentQik} from '../supabase/qualification/qik-ingest/persistentInstall.mjs'
import {runNativeHost} from '../supabase/qualification/qik-ingest/nativeHost.mjs'
import {provisionPersistentRuntime,revokePersistentRuntime} from '../supabase/qualification/qik-ingest/persistentRuntime.mjs'
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
    stage='active_source_refusal'
    // Simulate an already-active substrate within a rolled-back fixture change.
    await admin.query('begin')
    const checks=(await admin.query("select conname from pg_constraint where conrelid='public.ingest_sources'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%collection_enabled%'")).rows
    for(const row of checks)await admin.query('alter table public.ingest_sources drop constraint '+ident(row.conname))
    await admin.query("update public.ingest_sources set enabled=true,collection_enabled=true where id='11111111-1111-4111-8111-111111111111'")
    await assert.rejects(installPersistentQik(admin,configInstall),/persistent_active_sources_refused/)
    assert.equal((await admin.query("select to_regnamespace('qik_ingest') n")).rows[0].n,null)
    await admin.query('rollback')
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
    stage='duplicate_install'
    await assert.rejects(installPersistentQik(admin,configInstall),/persistent_install_failed/)
    assert.equal((await admin.query('select operation_id from qik_ingest_operation.persistent_install_receipt')).rows[0].operation_id,operationId)
    stage='foreign_cleanup'
    const cleanupConfig={...configInstall,cleanupAuthorization:'owner-authorized-persistent-cleanup'}
    await assert.rejects(cleanupPersistentQik(admin,{...cleanupConfig,operationId:randomBytes(16).toString('hex')}),/persistent_cleanup_failed/)
    await admin.query('create table public.persist_sentinel(id integer);insert into public.persist_sentinel values(42);grant select on public.persist_sentinel to qik_ingest_fn_owner')
    await assert.rejects(cleanupPersistentQik(admin,cleanupConfig),/persistent_cleanup_failed/)
    assert.equal((await admin.query("select has_table_privilege('qik_ingest_fn_owner','public.persist_sentinel','SELECT') allowed")).rows[0].allowed,true)
    assert.equal((await admin.query('select operation_id from qik_ingest_operation.persistent_install_receipt')).rows[0].operation_id,operationId)
    await admin.query('revoke select on public.persist_sentinel from qik_ingest_fn_owner')
    // A separate owner action grants only the existing runtime group for 30 minutes.
    stage='runtime_provision'
    const runtimeConfig={operationId,expectedLogin:adminName,runtimePassword:password,token,
      authorization:'owner-authorized-restricted-runtime'}
    await assert.rejects(provisionPersistentRuntime(admin,{...runtimeConfig,authorization:null}),/persistent_runtime_authorization_required/)
    // An activation that commits while provision waits must be observed before role creation.
    const activator=new pg.Client(config);await activator.connect()
    let waitingProvision
    try {
      await activator.query('begin')
      await activator.query('update qik_ingest.collection_gate set collection_authorized=true where id')
      waitingProvision=provisionPersistentRuntime(admin,runtimeConfig)
      let waited=false
      for(let i=0;i<80;i++){
        const wait=(await root.query('select wait_event_type from pg_stat_activity where pid=$1',[admin.processID])).rows[0]?.wait_event_type
        if(wait==='Lock'){waited=true;break}
        await new Promise(resolve=>setTimeout(resolve,25))
      }
      assert.equal(waited,true,'provision must wait for gate activation transaction')
      await activator.query('commit')
      await assert.rejects(waitingProvision,/persistent_runtime_provision_failed/)
      assert.equal((await admin.query('select collection_authorized from qik_ingest.collection_gate where id')).rows[0].collection_authorized,true)
      assert.equal((await admin.query('select 1 from pg_roles where rolname=$1',[names.collector])).rowCount,0)
      assert.equal((await admin.query('select count(*)::int n from qik_ingest.runtime_credentials')).rows[0].n,0)
      assert.equal((await admin.query('select runtime_login from qik_ingest_operation.persistent_install_receipt')).rows[0].runtime_login,null)
    }finally{
      await activator.query('rollback').catch(()=>{})
      if(waitingProvision)await waitingProvision.catch(()=>{})
      await activator.end()
    }
    await admin.query('update qik_ingest.collection_gate set collection_authorized=false where id')
    // Source activation can commit with the gate closed; provision must still recheck sources.
    const sourceActivator=new pg.Client(config);await sourceActivator.connect()
    let sourceProvision
    try {
      await sourceActivator.query('begin')
      await sourceActivator.query('update qik_ingest.collection_gate set collection_authorized=true where id')
      await sourceActivator.query("update public.ingest_sources set enabled=true,collection_enabled=true where id='11111111-1111-4111-8111-111111111111'")
      await sourceActivator.query('update qik_ingest.collection_gate set collection_authorized=false where id')
      sourceProvision=provisionPersistentRuntime(admin,runtimeConfig)
      let waited=false
      for(let i=0;i<80;i++){
        const wait=(await root.query('select wait_event_type from pg_stat_activity where pid=$1',[admin.processID])).rows[0]?.wait_event_type
        if(wait==='Lock'){waited=true;break}
        await new Promise(resolve=>setTimeout(resolve,25))
      }
      assert.equal(waited,true,'provision must wait for source activation transaction')
      await sourceActivator.query('commit')
      await assert.rejects(sourceProvision,/persistent_runtime_provision_failed/)
      assert.equal((await admin.query('select collection_authorized from qik_ingest.collection_gate where id')).rows[0].collection_authorized,false)
      assert.equal((await admin.query("select enabled and collection_enabled active from public.ingest_sources where id='11111111-1111-4111-8111-111111111111'")).rows[0].active,true)
      assert.equal((await admin.query('select 1 from pg_roles where rolname=$1',[names.collector])).rowCount,0)
      assert.equal((await admin.query('select runtime_login from qik_ingest_operation.persistent_install_receipt')).rows[0].runtime_login,null)
    }finally{
      await sourceActivator.query('rollback').catch(()=>{})
      if(sourceProvision)await sourceProvision.catch(()=>{})
      await sourceActivator.end()
    }
    await admin.query("update public.ingest_sources set enabled=false,collection_enabled=false where id='11111111-1111-4111-8111-111111111111'")
    let stopped=false
    const runtimeFault={query:(sql,params)=>{if(sql.startsWith('insert into qik_ingest.runtime_credentials')){stopped=true;throw Error('injected')}return admin.query(sql,params)}}
    await assert.rejects(provisionPersistentRuntime(runtimeFault,runtimeConfig),/persistent_runtime_provision_failed/)
    assert.equal(stopped,true)
    assert.equal((await admin.query('select 1 from pg_roles where rolname=$1',[names.collector])).rowCount,0)
    assert.equal((await admin.query('select count(*)::int n from qik_ingest.runtime_credentials')).rows[0].n,0)
    assert.equal((await admin.query('select runtime_login from qik_ingest_operation.persistent_install_receipt')).rows[0].runtime_login,null)
    // Provision holds both table locks through receipt COMMIT; a later activation waits.
    let lockAcquired,releaseLock
    const acquired=new Promise(resolve=>lockAcquired=resolve)
    const held=new Promise(resolve=>releaseLock=resolve)
    const pausedDb={query:async(sql,params)=>{
      const value=await admin.query(sql,params)
      if(sql==='lock table public.ingest_sources, qik_ingest.collection_gate in share row exclusive mode'){
        lockAcquired();await held
      }
      return value
    }}
    const lateActivator=new pg.Client(config);await lateActivator.connect()
    let firstProvision,lateUpdate
    try {
      firstProvision=provisionPersistentRuntime(pausedDb,runtimeConfig)
      let acquireTimer
      try {
        await Promise.race([acquired,new Promise((_,reject)=>{
          acquireTimer=setTimeout(()=>reject(Error('provision_lock_not_acquired')),2000)
        })])
      }finally{clearTimeout(acquireTimer)}
      await lateActivator.query('begin')
      lateUpdate=lateActivator.query('update qik_ingest.collection_gate set collection_authorized=true where id')
      let waited=false
      for(let i=0;i<80;i++){
        const wait=(await root.query('select wait_event_type from pg_stat_activity where pid=$1',[lateActivator.processID])).rows[0]?.wait_event_type
        if(wait==='Lock'){waited=true;break}
        await new Promise(resolve=>setTimeout(resolve,25))
      }
      assert.equal(waited,true,'activation must wait for provision transaction')
      releaseLock()
      const first=await firstProvision
      assert.equal(first.state,'restricted_runtime_provisioned')
      await lateUpdate
      await lateActivator.query('commit')
      assert.equal((await admin.query('select collection_authorized from qik_ingest.collection_gate where id')).rows[0].collection_authorized,true)
    }finally{
      releaseLock()
      if(firstProvision)await firstProvision.catch(()=>{})
      if(lateUpdate)await lateUpdate.catch(()=>{})
      await lateActivator.query('rollback').catch(()=>{})
      await lateActivator.end()
    }
    await admin.query('update qik_ingest.collection_gate set collection_authorized=false where id')
    const firstRevocation=await revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
      authorization:'owner-authorized-restricted-runtime-revocation'})
    assert.equal(firstRevocation.state,'restricted_runtime_revoked')
    assert.equal((await admin.query('select runtime_login from qik_ingest_operation.persistent_install_receipt')).rows[0].runtime_login,null)
    const runtimeChild=spawn(process.execPath,[new URL('../supabase/qualification/qik-ingest/runPersistentRuntime.mjs',import.meta.url).pathname,
      'provision','--execute','--disposable'],{env:{PATH:process.env.PATH,MIP_DISPOSABLE_POSTGRES:'qik-persistent-install',
      MIP_C3_RUNTIME_AUTHORIZATION:runtimeConfig.authorization,MIP_C3_INSTALLER_DATABASE_URL:dbUrl.href,
      MIP_C3_INSTALLER_LOGIN:adminName,MIP_C3_OPERATION_ID:operationId,
      MIP_C3_RUNTIME_PASSWORD:password,MIP_C3_RUNTIME_TOKEN:token},stdio:['ignore','pipe','pipe']})
    let runtimeOut='',runtimeErr='';runtimeChild.stdout.on('data',x=>runtimeOut+=x);runtimeChild.stderr.on('data',x=>runtimeErr+=x)
    const runtimeCode=await new Promise((resolve,reject)=>{runtimeChild.on('error',reject);runtimeChild.on('close',resolve)})
    assert.equal((runtimeOut+runtimeErr).includes(password),false)
    assert.equal((runtimeOut+runtimeErr).includes(token),false)
    const provisioned=JSON.parse(runtimeOut)
    assert.equal(runtimeCode,0,JSON.stringify(provisioned));runtimeCreated=true
    assert.equal(provisioned.state,'restricted_runtime_provisioned')
    assert.equal(provisioned.password_valid_minutes,30)
    await assert.rejects(provisionPersistentRuntime(admin,runtimeConfig),/persistent_runtime_provision_failed/)
    const memberships=(await admin.query("select m.admin_option,m.inherit_option,m.set_option from pg_auth_members m join pg_roles a on a.oid=m.member join pg_roles b on b.oid=m.roleid where a.rolname=$1 and b.rolname='qik_ingest_runtime'",[names.collector])).rows
    assert.deepEqual(memberships,[{admin_option:false,inherit_option:true,set_option:false}])
    const runtimeRole=(await admin.query('select rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolvaliduntil from pg_roles where rolname=$1',[names.collector])).rows[0]
    assert.equal(runtimeRole.rolsuper,false);assert.equal(runtimeRole.rolcreaterole,false)
    assert.equal(runtimeRole.rolcreatedb,false);assert.equal(runtimeRole.rolbypassrls,false)
    assert.equal(runtimeRole.rolinherit,true)
    assert.ok(runtimeRole.rolvaliduntil.getTime()>Date.now())
    assert.ok(runtimeRole.rolvaliduntil.getTime()<=Date.now()+31*60*1000)
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
    await assert.rejects(cleanupPersistentQik(admin,cleanupConfig),/persistent_cleanup_failed/)
    await admin.query("update public.ingestion_runs set state='running' where run_id=$1",['qik-host-'+operationId+'-first'])
    await assert.rejects(revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
      authorization:'owner-authorized-restricted-runtime-revocation'}),/persistent_runtime_revoke_failed/)
    await admin.query("update public.ingestion_runs set state='completed' where run_id=$1",['qik-host-'+operationId+'-first'])
    const heldRuntime=new pg.Client({host:'127.0.0.1',port:rootConfig.port,database,user:names.collector,password})
    await heldRuntime.connect()
    try{await assert.rejects(revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
      authorization:'owner-authorized-restricted-runtime-revocation'}),/persistent_runtime_revoke_failed/)}
    finally{await heldRuntime.end()}
    assert.equal((await admin.query('select count(*)::int n from qik_ingest.runtime_credentials')).rows[0].n,1)
    const boundJob=(await admin.query('select native_job_id from qik_ingest.observed_items where native_job_id is not null limit 1')).rows[0].native_job_id
    await admin.query("update evidence_pipeline.import_jobs set state='retry_wait' where id=$1",[boundJob])
    await assert.rejects(revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
      authorization:'owner-authorized-restricted-runtime-revocation'}),/persistent_runtime_revoke_failed/)
    await admin.query("update evidence_pipeline.import_jobs set state='completed' where id=$1",[boundJob])
    // A completed native job can still have run-level extraction debt.
    await admin.query("update public.ingestion_runs set counters=jsonb_set(counters,'{extraction_incomplete}','1'::jsonb) where run_id=$1",['qik-host-'+operationId+'-first'])
    await assert.rejects(revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
      authorization:'owner-authorized-restricted-runtime-revocation'}),/persistent_runtime_revoke_failed/)
    await admin.query("update public.ingestion_runs set counters=counters-'extraction_incomplete' where run_id=$1",['qik-host-'+operationId+'-first'])
    // No observation can identify the token on an empty failed qik run. Age is not attribution.
    const emptyDebt='qik-empty-debt-'+operationId
    const completeEmpty='qik-empty-complete-'+operationId
    const unrelatedFailed='unrelated-empty-failed-'+operationId
    const qikAlgorithm='qik-ingest-rss-v1-retain-from-yhb-v8'
    await admin.query("insert into public.ingestion_runs(run_id,mode,state,started_at,algorithm_version,counters) values($1,'discover','failed','2000-01-01T00:00:00Z',$2,'{}'::jsonb)",[emptyDebt,qikAlgorithm])
    await assert.rejects(revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
      authorization:'owner-authorized-restricted-runtime-revocation'}),/persistent_runtime_revoke_failed/)
    assert.equal((await admin.query('select count(*)::int n from qik_ingest.runtime_credentials')).rows[0].n,1)
    assert.equal((await admin.query('select runtime_login from qik_ingest_operation.persistent_install_receipt')).rows[0].runtime_login,names.collector)
    await admin.query('delete from public.ingestion_runs where run_id=$1',[emptyDebt]) // disposable fixture only
    await admin.query("insert into public.ingestion_runs(run_id,mode,state,algorithm_version,counters) values($1,'discover','completed',$2,'{}'::jsonb),($3,'discover','failed','legacy-other-algorithm','{}'::jsonb)",[completeEmpty,qikAlgorithm,unrelatedFailed])
    // A foreign incoming membership must never be silently dropped with the role.
    const foreign='mip_c3_foreign_'+operationId.slice(0,12)
    await admin.query('create role '+ident(foreign)+' nologin noinherit')
    try {
      await admin.query('grant '+ident(names.collector)+' to '+ident(foreign)+' with admin false, inherit false, set false')
      await assert.rejects(revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
        authorization:'owner-authorized-restricted-runtime-revocation'}),/persistent_runtime_revoke_failed/)
      await admin.query('revoke '+ident(names.collector)+' from '+ident(foreign))
    } finally {await admin.query('drop role '+ident(foreign))}
    // An admitted RPC holds the token row; the DELETE must wait for its transaction.
    const admission=new pg.Client({host:'127.0.0.1',port:rootConfig.port,database,user:names.collector,password})
    await admission.connect()
    await admission.query('begin')
    await admission.query('select public.mip_qik_ingest_plan($1)',[token])
    const pending=revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
      authorization:'owner-authorized-restricted-runtime-revocation'}).then(value=>({value}),error=>({error}))
    let waited=false
    for(let i=0;i<40;i++){
      const wait=(await root.query('select wait_event_type from pg_stat_activity where pid=$1',[admin.processID])).rows[0]?.wait_event_type
      if(wait==='Lock'){waited=true;break}
      await new Promise(resolve=>setTimeout(resolve,25))
    }
    assert.equal(waited,true,'revocation must wait for admitted transaction')
    await admission.query('commit');await admission.end()
    const outcome=await pending
    let revoked
    if(outcome.error){
      assert.match(outcome.error.message,/persistent_runtime_revoke_failed/)
      assert.equal((await admin.query('select count(*)::int n from qik_ingest.runtime_credentials')).rows[0].n,1)
      revoked=await revokePersistentRuntime(admin,{operationId,expectedLogin:adminName,
        authorization:'owner-authorized-restricted-runtime-revocation'})
    }else revoked=outcome.value
    runtimeCreated=false
    assert.equal(revoked.state,'restricted_runtime_revoked')
    assert.equal((await admin.query('select count(*)::int n from public.ingestion_runs where run_id=any($1::text[])',[[completeEmpty,unrelatedFailed]])).rows[0].n,2)
    assert.equal((await admin.query('select count(*)::int n from qik_ingest.runtime_credentials')).rows[0].n,0)
    assert.equal((await admin.query('select 1 from pg_roles where rolname=$1',[names.collector])).rowCount,0)
    const preserved=(await admin.query('select source_project_ref,channel,watermark,captured_at::text from public.mip_consolidation_watermarks order by 1,2')).rows
    await cleanupPersistentQik(admin,cleanupConfig);installed=false
    assert.equal((await admin.query('select count(*)::int n from public.ingestion_runs where run_id=any($1::text[])',[[completeEmpty,unrelatedFailed]])).rows[0].n,2)
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
