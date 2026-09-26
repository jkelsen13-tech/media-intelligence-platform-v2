import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {installQikIngest,cleanupQikIngest} from '../supabase/qualification/qik-ingest/installQikIngest.mjs'
import {createBoundNativePipelineRpc} from '../supabase/qualification/qik-ingest/nativeHandoff.mjs'
import {runQikIngestCollector} from '../supabase/qualification/qik-ingest/collector.mjs'
import {installCredentialHelper,assignCredential,removeCredentialHelper} from '../supabase/qualification/collector-native-capture/credentialDelivery.mjs'
import {rpc,FEED} from './qikIngestTestKit.mjs'

test('permanent native seam: actual restricted login, bound history, denied unrelated effects and exact cleanup',async t=>{
 if(process.env.MIP_DISPOSABLE_POSTGRES!=='qik-native-caller'){
   t.skip('requires explicitly selected disposable native PostgreSQL');return
 }
 const id=randomBytes(16).toString('hex'), database='mip_native_caller_'+id.slice(0,16)
 const login='cnc_'+id+'_collector',password=randomBytes(32).toString('hex')
 const token=randomBytes(32).toString('hex'),otherToken=randomBytes(32).toString('hex')
 const config={host:'127.0.0.1',port:Number(process.env.PGPORT||5432),
   user:'postgres',password:process.env.PGPASSWORD||'mip-disposable-ci-only'}
 const root=new pg.Client({...config,database:'postgres',
   options:'-c log_statement=none -c log_min_error_statement=panic'})
 const createdRoles=[],connections=[]
 let admin,created=false,primary,stage='connect',installed=false
 await root.connect()
 try{
   for(const role of ['qik_ingest_fn_owner','qik_ingest_runtime',login])
     assert.equal((await root.query('select 1 from pg_roles where rolname=$1',[role])).rowCount,0,'preexisting package role')
   for(const role of ['anon','authenticated','service_role'])
     if(!(await root.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)createdRoles.push(role)
   await root.query('create database "'+database+'"');created=true
   admin=new pg.Client({...config,database,options:'-c log_statement=none -c log_min_error_statement=panic'})
   await admin.connect()
   const exec=sql=>admin.query(sql)
   stage='fixture'
   for(const path of [
     'supabase/qualification/qik-ingest/fixture_substrate.sql',
     'supabase/migrations/20260905082406_evidence_pipeline_reliability.sql',
     'supabase/migrations/20260906042413_evidence_change_queue_v1.sql',
     'supabase/migrations/20260907234007_evidence_change_producer_claim_v1.sql',
   ])await exec(await readFile(new URL('../'+path,import.meta.url),'utf8'))
   const substrateBefore=(await exec("select count(*)::int n from pg_proc where pronamespace='evidence_pipeline'::regnamespace")).rows[0].n
   stage='install';await installQikIngest(exec);installed=true
   await exec('create role "'+login+'" login inherit')
   createdRoles.push(login)
   await installCredentialHelper(admin);await assignCredential(admin,login,password);await removeCredentialHelper(admin)
   await exec('grant qik_ingest_runtime to "'+login+'"')
   // Record the explicitly owned test-login membership before cleanup.
   await exec("select qik_ingest_operation.capture_step('test_login')")
   for(const secret of [token,otherToken])await admin.query(
     "insert into qik_ingest.runtime_credentials values(encode(sha256(convert_to($1,'UTF8')),'hex'),true,'disposable')",[secret])
   await exec('update qik_ingest.collection_gate set collection_authorized=true')
   await exec("update public.ingest_sources set enabled=true,collection_enabled=true where id='11111111-1111-4111-8111-111111111111'")
   const wrong=new pg.Client({...config,database,user:login,password:randomBytes(32).toString('hex')})
   try{await assert.rejects(wrong.connect(),e=>e.code==='28P01')}finally{await wrong.end()}
   const client=new pg.Client({...config,database,user:login,password})
   await client.connect();connections.push(client)
   assert.deepEqual((await client.query("select session_user,current_user,pg_has_role(current_user,'service_role','MEMBER') member")).rows[0],
     {session_user:login,current_user:login,member:false})
   assert.equal((await admin.query('select rolbypassrls or rolsuper elevated from pg_roles where rolname=$1',[login])).rows[0].elevated,false)
   const deny=async(sql,args=[])=>assert.rejects(client.query(sql,args),e=>e.code==='42501')
   stage='denials'
   await deny('set role service_role')
   await deny('select * from evidence_pipeline.import_jobs')
   await deny('select * from qik_ingest.observed_items')
   await deny("update public.articles set reader_state='eligible'")
   await deny("select public.mip_pipeline_v1('claim','{}')")
   await deny('select public.mip_qik_ingest_claim_bound($1::uuid[])',[[randomUUID()]])
   await deny('select evidence_pipeline.enqueue($1,$2)', ['forbidden',{}])
   const call=async(run,action,input,secret=token)=>(await client.query(
     'select public.mip_qik_ingest_native($1,$2,$3,$4::jsonb) result',
     [secret,run,action,JSON.stringify(input)])).rows[0].result
   const runtimeRpc=rpc(client),run='native-bound-'+id
   await runtimeRpc('begin_run',{token,run_id:run})
   const article={title:'Bound native observation',url:'https://qualification.invalid/native/'+id,
     summary:'The council approved this synthetic water project after review.'}
   const observed=await runtimeRpc('retain_item',{token,run_id:run,source_id:'11111111-1111-4111-8111-111111111111',item:article})
   const pipeline=createBoundNativePipelineRpc(client,{token,runId:run})
   const job=await pipeline.enqueueObservation({runId:run,observationId:observed.id})
   assert.equal(await pipeline.enqueueObservation({runId:run,observationId:observed.id}),job)
   await assert.rejects(call(run,'enqueue',{observation_id:observed.id},otherToken),e=>e.code==='42501')
   await assert.rejects(call(run,'enqueue',{observation_id:observed.id,article:{reader_state:'eligible'}}),e=>e.code==='22023')
   const foreign=(await admin.query("select evidence_pipeline.enqueue('foreign-run',$1::jsonb) id",
     [JSON.stringify({...article,url:article.url+'/foreign'})])).rows[0].id
   await admin.query("update evidence_pipeline.import_jobs set state='processing',attempt_count=1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()-interval '1 minute' where id=$1",[foreign])
   const foreignBefore=(await admin.query('select to_jsonb(j) row from evidence_pipeline.import_jobs j where id=$1',[foreign])).rows[0].row
   for(const action of ['claim','states'])await assert.rejects(call(run,action,{job_ids:[job,foreign]}),e=>e.code==='42501')
   await assert.rejects(call(run,'finish',{job_id:foreign,lease_token:randomUUID()}),e=>e.code==='42501')
   assert.deepEqual((await admin.query('select to_jsonb(j) row from evidence_pipeline.import_jobs j where id=$1',[foreign])).rows[0].row,foreignBefore)
   const claimed=await pipeline.claimBound([job])
   assert.equal(claimed.id,job)
   await assert.rejects(pipeline('finish',{job_id:job,lease_token:randomUUID()}),/stale or invalid job lease/)
   const completed=await pipeline('finish',{job_id:job,lease_token:claimed.lease_token})
   const rows=await pipeline.readJobStates([job])
   assert.equal(rows[0].capture_id,completed.capture_id)
   const extraction=await pipeline.extractCapture({job_id:job,capture_id:completed.capture_id})
   assert.equal(extraction.state,'candidates_retained');assert.equal(extraction.candidate_ids.length,1)
   assert.deepEqual((await pipeline.extractCapture({job_id:job,capture_id:completed.capture_id})).candidate_ids,extraction.candidate_ids)
   await assert.rejects(call(run,'capture',{job_id:job,capture_id:randomUUID()}),/retained_capture_unavailable/)
   await assert.rejects(call(run,'candidate',{job_id:job,candidate:{capture_id:completed.capture_id,candidate_kind:'claim',review_state:'approved'}}),e=>e.code==='42501')
   await assert.rejects(call(run,'claim',{job_ids:[job]},otherToken),e=>e.code==='42501')
   await runtimeRpc('finish_run',{token,run_id:run,state:'completed',counters:{inserted:1}})
   await assert.rejects(call(run,'states',{job_ids:[job]}),e=>e.code==='55000')
   stage='collector'
   for(const [suffix,xml,expected] of [
     ['run1',FEED,{inserted:2,duplicates:0,revisions:0}],
     ['run2',FEED,{inserted:0,duplicates:2,revisions:0}],
     ['run3',FEED.replace('Council Approves Water Plan','Council Revises Water Plan'),{inserted:0,duplicates:1,revisions:1}],
   ]){
     const runId='native-'+id+'-'+suffix
     const result=await runQikIngestCollector({rpc:runtimeRpc,token,runId,
       pipelineRpc:createBoundNativePipelineRpc(client,{token,runId}),fetchText:async()=>xml})
     assert.equal(result.httpStatus,200,JSON.stringify(result.body))
     for(const [key,value] of Object.entries(expected))assert.equal(result.body[key],value)
     assert.equal(result.body.source_failures,0);assert.equal(result.body.unresolved,0)
     assert.equal(result.body.extracted_captures,2);assert.equal(result.body.extraction_incomplete,0)
   }
   assert.equal((await admin.query("select count(*)::int n from evidence_pipeline.evidence_candidates where review_state='pending'")).rows[0].n,4)
   assert.equal((await admin.query("select count(*)::int n from public.articles where reader_state<>'pending_review'")).rows[0].n,0)
   const ledger=(await exec("select object_kind,count(*)::int n from qik_ingest_operation.introduced_grants where schema_name='evidence_pipeline' group by object_kind")).rows
   for(const kind of ['function','sequence','table','column'])assert.ok(ledger.some(r=>r.object_kind===kind&&r.n>0),kind)
   stage='cleanup'
   await exec('update public.ingest_sources set collection_enabled=false')
   await exec('update qik_ingest.collection_gate set collection_authorized=false')
   // Unexpected external privileges must refuse atomically, then exact owner
   // revocation allows cleanup. Do not absorb them by re-capturing the ledger.
   await exec('grant delete on evidence_pipeline.import_jobs to qik_ingest_fn_owner')
   await assert.rejects(cleanupQikIngest(exec),/qik_ingest_unrelated_privilege/)
   assert.notEqual((await exec("select to_regnamespace('qik_ingest') n")).rows[0].n,null)
   await exec('revoke delete on evidence_pipeline.import_jobs from qik_ingest_fn_owner')
   await client.end();connections.splice(connections.indexOf(client),1)
   await cleanupQikIngest(exec);installed=false
   assert.equal((await exec("select count(*)::int n from pg_roles where rolname in ('qik_ingest_runtime','qik_ingest_fn_owner')")).rows[0].n,0)
   assert.equal((await exec("select count(*)::int n from pg_policy where polname like 'qik_ingest_%'")).rows[0].n,0)
   assert.equal((await exec("select count(*)::int n from pg_proc where pronamespace='evidence_pipeline'::regnamespace")).rows[0].n,substrateBefore)
   assert.equal((await exec('select count(*)::int n from evidence_pipeline.evidence_candidates')).rows[0].n,4)
   assert.equal((await exec("select to_regnamespace('qik_ingest_operation') n")).rows[0].n,null)
 }catch(error){primary=error;t.diagnostic('native caller stage='+stage+' code='+(error.code??'none'));throw error}
 finally{
   const errors=[]
   for(const c of connections)try{await c.end()}catch(e){errors.push(e)}
   if(admin)try{await admin.end()}catch(e){errors.push(e)}
   if(created)try{await root.query('drop database "'+database+'"')}catch(e){errors.push(e)}
   // Only this test's confirmed-absent package roles and created fixture roles.
   if(created){
     for(const role of [...createdRoles,'qik_ingest_runtime','qik_ingest_fn_owner']){
       try{await root.query('drop role if exists "'+role+'"')}catch(e){errors.push(e)}
     }
     try{
       assert.equal((await root.query('select 1 from pg_database where datname=$1',[database])).rowCount,0)
       assert.equal((await root.query('select 1 from pg_roles where rolname=any($1::text[])',[[...createdRoles,'qik_ingest_runtime','qik_ingest_fn_owner']])).rowCount,0)
     }catch(e){errors.push(e)}
   }
   await root.end()
   for(const e of errors)t.diagnostic('cleanup failure SQLSTATE='+(e.code??'none'))
   if(errors.length&&!primary)throw new AggregateError(errors,'native_caller_cleanup_failed')
 }
})
