import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {assertCredentialLogging,installCredentialHelper,assignCredential,removeCredentialHelper} from '../supabase/qualification/collector-native-capture/credentialDelivery.mjs'
import {installOwnedPackages,cleanupOwnedPackages} from '../supabase/qualification/collector-native-capture/ownedPackageInstall.mjs'
import {connectAuthenticatedPg} from '../supabase/qualification/collector-native-capture/authenticatedPgDriver.mjs'
import {bootstrapAuthenticatedOperation,cleanupAuthenticatedOperation,operationNames,readForwardWatermark} from '../supabase/qualification/collector-native-capture/authenticatedBootstrap.mjs'
import {runAuthenticatedQualification} from '../supabase/qualification/collector-native-capture/authenticatedQualification.mjs'

test('authenticated native collector/CAS: real logins, exact bytes, three runs, owned cleanup',async t=>{
  if(process.env.MIP_DISPOSABLE_POSTGRES!=='collector-native-capture-authenticated') {
    t.skip('requires explicitly selected disposable native PostgreSQL')
    return
  }
  const operationId=randomBytes(16).toString('hex')
  const database='mip_cnc_auth_'+operationId.slice(0,16)
  const names=operationNames(operationId)
  const passwords=Object.fromEntries(['collector','native','cas'].map(k=>[k,randomBytes(32).toString('hex')]))
  const token=randomBytes(32).toString('hex')
  const config={host:'127.0.0.1',port:Number(process.env.PGPORT||5432),user:'postgres',password:process.env.PGPASSWORD||'mip-disposable-ci-only'}
  const root=new pg.Client({...config,database:'postgres'}),clients=[]
  let admin,created=false,bootstrapped=false,installed=false,stage='connect',primary=null
  await root.connect()
  try {
    // Do not drop preexisting databases or roles to make a test pass.
    assert.equal((await root.query('select 1 from pg_database where datname=$1',[database])).rowCount,0)
    for(const role of ['qik_ingest_fn_owner','qik_ingest_runtime','mip_cas_owner','mip_cas_gateway','mip_cas_codec_verifier']) {
      assert.equal((await root.query('select 1 from pg_roles where rolname=$1',[role])).rowCount,0,'preexisting package role '+role)
    }
    await root.query('create database "'+database+'"');created=true
    admin=new pg.Client({...config,database});await admin.connect()
    const exec=sql=>admin.query(sql)
    await exec("load 'auto_explain'")
    await exec("set auto_explain.log_min_duration=10000")
    await exec("set auto_explain.log_nested_statements=off")
    await exec("set auto_explain.log_parameter_max_length=-1")
    await exec("set log_error_verbosity=verbose")
    await exec("set log_parameter_max_length=-1")
    await exec("set log_statement='all'")
    await assert.rejects(assertCredentialLogging(admin),/cnc_credential_logging_refused/)
    await exec("set log_statement='ddl'")
    await exec("set log_min_duration_statement=-1")
    await exec("set log_min_duration_sample=-1")
    await exec("set log_transaction_sample_rate=0")
    await exec("set log_parameter_max_length_on_error=0")
    await exec('create extension if not exists pgcrypto')
    await exec(await readFile(new URL('../supabase/qualification/qik-ingest/fixture_substrate.sql',import.meta.url),'utf8'))
    await exec(await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql',import.meta.url),'utf8'))
    await exec(await readFile(new URL('../supabase/migrations/20260906042413_evidence_change_queue_v1.sql',import.meta.url),'utf8'))
    await exec(await readFile(new URL('../supabase/migrations/20260907234007_evidence_change_producer_claim_v1.sql',import.meta.url),'utf8'))
    const watermarkBaseline=await readForwardWatermark(admin)
    // Preexisting CAS refuses after C3's transactional steps; rollback must
    // preserve the old CAS sentinel and remove this attempt's partial C3.
    await exec('create schema mip_cas_source_install')
    await assert.rejects(installOwnedPackages(admin,randomBytes(16).toString('hex')),/cnc_owned_install_failed/)
    assert.equal((await admin.query("select to_regnamespace('qik_ingest_operation') is null absent")).rows[0].absent,true)
    assert.notEqual((await admin.query("select to_regnamespace('mip_cas_source_install') existing")).rows[0].existing,null)
    await exec('drop schema mip_cas_source_install')
    // Failure before runtime bootstrap ledger commits still restores the
    // package-owned forward watermark, including an originally absent row.
    const failedOperation=randomBytes(16).toString('hex')
    await installOwnedPackages(admin,failedOperation)
    await assert.rejects(bootstrapAuthenticatedOperation(admin,{operationId:failedOperation,passwords:{},token,sourceId:randomUUID(),investigation:randomUUID(),userId:randomUUID()}),/cnc_secret_invalid/)
    await cleanupOwnedPackages(admin,failedOperation)
    assert.deepEqual(await readForwardWatermark(admin),watermarkBaseline)
    stage='install';await installOwnedPackages(admin,operationId);installed=true
    await assert.rejects(installOwnedPackages(admin,randomBytes(16).toString('hex')),/cnc_owned_install_failed/)
    assert.equal((await admin.query("select obj_description('qik_ingest_operation'::regnamespace,'pg_namespace') marker")).rows[0].marker,'cnc-owner:'+operationId)
    stage='bootstrap'
    const manifest=await bootstrapAuthenticatedOperation(admin,{operationId,passwords,token,watermarkBaseline,sourceId:randomUUID(),investigation:randomUUID(),userId:randomUUID()})
    bootstrapped=true
    // Block the role tuple from an independent actual connection; cancel the
    // dynamic ALTER via statement timeout and prove only sanitized text escapes.
    await root.query('begin')
    try {
      await root.query('select oid from pg_authid where rolname=$1 for update',[names.cas])
      await admin.query('begin')
      await admin.query("set local statement_timeout='1000ms'")
      await installCredentialHelper(admin)
      await assert.rejects(assignCredential(admin,names.cas,passwords.cas),error=>{
        const exposed=[error.message,error.detail,error.hint,error.where,error.internalQuery].filter(Boolean).join('\n')
        assert.equal(exposed.includes(passwords.cas),false)
        assert.match(error.message,/cnc_password_assignment_failed/)
        return true
      })
    } finally {
      await admin.query('rollback')
      await root.query('rollback')
    }
    // Reproduce hosted settings on ONLY these disposable login roles.
    for(const name of Object.values(names)) {
      for(const [setting,value] of [
        ['session_preload_libraries',"'auto_explain'"],
        ['auto_explain.log_min_duration','10000'],
        ['auto_explain.log_nested_statements','off'],
        ['auto_explain.log_parameter_max_length','-1'],
        ['log_statement',"'ddl'"],['log_error_verbosity',"'verbose'"],
        ['log_min_duration_statement','-1'],['log_min_duration_sample','-1'],
        ['log_transaction_sample_rate','0'],['log_parameter_max_length','-1'],
        ['log_parameter_max_length_on_error','0'],
      ])await admin.query('alter role "'+name+'" set '+setting+'='+value)
    }
    const connection=(name,password)=>'postgresql://'+name+':'+password+'@127.0.0.1:'+config.port+'/'+database
    await assert.rejects(connectAuthenticatedPg({connectionString:connection(names.cas,'a'.repeat(64)),expectedLogin:names.cas,disposable:true}),/cnc_authenticated_connection_failed/)
    await assert.rejects(connectAuthenticatedPg({connectionString:connection(names.cas,passwords.cas),expectedLogin:names.collector,disposable:true}),/cnc_connection_invalid/)
    stage='authenticate'
    for(const kind of ['collector','native','cas']) {
      const client=await connectAuthenticatedPg({connectionString:connection(names[kind],passwords[kind]),expectedLogin:names[kind],effectiveRole:kind==='native'?'service_role':null,disposable:true})
      clients.push(client)
      const identity=(await client.query('select session_user::text login,current_user::text effective')).rows[0]
      assert.equal(identity.login,names[kind]);assert.equal(identity.effective,kind==='native'?'service_role':names[kind])
    }
    stage='qualification'
    const result=await runAuthenticatedQualification({admin,collector:clients[0],native:clients[1],cas:clients[2],manifest,token})
    assert.deepEqual(result.residual,{articles:2,jobs:3,captures:3,articleIdentities:2,jobEvents:6,evidenceChanges:5,changeJobs:10,evidenceCandidates:3,articleInsertVersions:2,importReceipts:6,ingestionRuns:3,sourceRuns:3,disabledSyntheticSource:1})
    assert.equal(result.cas.exactBytes,true)
    assert.equal(result.cas.rehydrated,true)
    assert.equal(result.cas.revocationDenied,true)
    // Close authenticated sessions BEFORE removing their roles.
    for(const client of clients.splice(0))await client.end()
    await cleanupAuthenticatedOperation(admin,operationId);bootstrapped=false
    stage='package_cleanup';await cleanupOwnedPackages(admin,operationId);installed=false
    assert.deepEqual(await readForwardWatermark(admin),watermarkBaseline)
    assert.equal((await admin.query('select count(*)::int n from public.articles')).rows[0].n,3)
    if(process.env.MIP_DISPOSABLE_PG_LOG_PATH) {
      const logMarker='cnc-log-proof:'+operationId
      await admin.query("do $log$ begin raise log '"+logMarker+"';end $log$")
      await new Promise(resolve=>setTimeout(resolve,250))
      const serverLog=await readFile(process.env.MIP_DISPOSABLE_PG_LOG_PATH,'utf8')
      assert.equal(serverLog.includes(logMarker),true,'native server log positive control missing')
      for(const secret of [...Object.values(passwords),token])assert.equal(serverLog.includes(secret),false,'runtime secret reached native server log')
      t.diagnostic('native server log scan: passwords and run token absent')
    }
    assert.equal((await admin.query('select 1 from pg_roles where rolname=any($1::text[])',[Object.values(names)])).rowCount,0)
    assert.equal((await admin.query("select 1 from pg_namespace where nspname in ('mip_cas','qik_ingest','qik_ingest_operation')")).rowCount,0)
  } catch(error) {
    primary=error
    t.diagnostic(JSON.stringify({stage,code:error.code??null,error:/^cnc_[a-z_]+$/.test(error.message??'')?error.message:'native_operation_failed'}))
  } finally {
    const cleanupErrors=[]
    for(const client of clients.splice(0))try{await client.end()}catch(e){cleanupErrors.push(e)}
    if(admin) {
      if(bootstrapped)try{await cleanupAuthenticatedOperation(admin,operationId)}catch(e){cleanupErrors.push(e)}
      if(installed)try{await cleanupOwnedPackages(admin,operationId)}catch(e){cleanupErrors.push(e)}
      try{await admin.end()}catch(e){cleanupErrors.push(e)}
    }
    if(created)try{
      await root.query('drop database "'+database+'"')
      assert.equal((await root.query('select 1 from pg_database where datname=$1',[database])).rowCount,0)
    }catch(e){cleanupErrors.push(e)}
    await root.end()
    for(const error of cleanupErrors)t.diagnostic(JSON.stringify({stage:'cleanup',code:error.code??null,error:/^cnc_[a-z_]+$/.test(error.message??'')?error.message:'native_cleanup_failed'}))
    if(primary||cleanupErrors.length)throw new AggregateError([...(primary?[primary]:[]),...cleanupErrors],'cnc_disposable_verification_failed')
  }
})
