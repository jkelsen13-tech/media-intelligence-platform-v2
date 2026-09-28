import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomBytes,createHash} from 'node:crypto'
import pg from 'pg'
import {createNativeSemanticAssessmentReader} from '../supabase/qualification/native-semantic-integration/reader.mjs'
const armed=process.env.MIP_NATIVE_SEMANTIC_DISPOSABLE==='synthetic-pg17-only'
const fixturePassword='mip-efta-disposable-ci-only',runtimePassword='mip-semantic-synthetic-only'
const quote=s=>{if(!/^[a-z][a-z0-9_]{0,62}$/.test(s))throw Error('semantic_fixture_identifier');return '"'+s+'"'}
const git=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')
const dependencies=[
 ['tests/changeQueueFixture.sql','235f92e0ce285cbf5426444b06b576a39adb1e38'],
 ['supabase/migrations/20260905082406_evidence_pipeline_reliability.sql','e7beb22b9a4dd2e38076b5554c7f5b4e6e0e4e77'],
 ['supabase/migrations/20260906042413_evidence_change_queue_v1.sql','1b93f947f5351097e629adc718659a1125fdfe1f'],
 ['supabase/migrations/20260906051224_evidence_assessment_dependencies_v1.sql','d6092de9540550c4d126c91494cfe3374f02a721'],
]
test('native semantic assessment consumer uses actual PG17.6 authenticated producer',{skip:!armed,timeout:90000},async()=>{
 const suffix=randomBytes(6).toString('hex'),database='mip_semantic_'+suffix,login='mip_semantic_'+suffix+'_native'
 const createdRoles=[];let admin,db,ownedDatabase=false,primary=null,cleanup=[],stage='connect'
 async function open(database){
  const c=new pg.Client({host:'127.0.0.1',port:5432,database,user:'postgres',password:fixturePassword,
   ssl:false,connectionTimeoutMillis:3000,statement_timeout:10000,application_name:'mip_semantic_synthetic_control'})
  c.on('error',()=>{});try{await c.connect();return c}catch{await c.end().catch(()=>{});throw Error('semantic_fixture_connect')}
 }
 try{
  admin=await open('postgres')
  assert.equal((await admin.query('show server_version_num')).rows[0].server_version_num,'170006')
  assert.equal((await admin.query('select count(*)::int n from pg_database where datname=$1',[database])).rows[0].n,0)
  assert.equal((await admin.query('select count(*)::int n from pg_roles where rolname=$1',[login])).rows[0].n,0)
  stage='fixture'
  for(const [name,bypass]of [['anon',false],['authenticated',false],['service_role',true]]){
   const rows=(await admin.query('select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname=$1',[name])).rows
   if(!rows.length){
    await admin.query('create role '+quote(name)+' nologin nosuperuser '+(bypass?'bypassrls':'nobypassrls'));createdRoles.push(name)
   }else assert.ok(rows[0].rolcanlogin===false&&rows[0].rolsuper===false&&rows[0].rolbypassrls===bypass)
  }
  await admin.query('create database '+quote(database));ownedDatabase=true
  // Only this owned disposable database changes logging defaults.
  await admin.query('alter database '+quote(database)+" set log_parameter_max_length_on_error='0'")
  await admin.query('alter database '+quote(database)+" set log_min_duration_statement='-1'")
  await admin.query('alter database '+quote(database)+" set log_min_duration_sample='-1'")
  await admin.query('alter database '+quote(database)+" set log_transaction_sample_rate='0'")
  await admin.query('alter database '+quote(database)+" set log_statement='none'")
  db=await open(database)
  for(const [path,pin]of dependencies){
   const bytes=await readFile(new URL('../'+path,import.meta.url));assert.equal(git(bytes),pin)
   let sql=bytes.toString('utf8')
   if(path==='tests/changeQueueFixture.sql'){
    const roles='create role anon; create role authenticated; create role service_role bypassrls;'
    assert.equal(sql.split(roles).length,2);sql=sql.replace(roles,'-- Fixture roles validated independently above.')
   }
   await db.query(sql)
  }
  await admin.query('create role '+quote(login)+" login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '"+runtimePassword+"'")
  createdRoles.push(login)
  await admin.query('grant service_role to '+quote(login)+' with inherit false,set true')
  const uri=new URL('postgresql://127.0.0.1:5432/'+database);uri.username=login;uri.password=runtimePassword
  const read=createNativeSemanticAssessmentReader({connectionString:uri.href,expectedLogin:login,disposable:true,sessionPoolerHost:null})
  const rpc=name=>async(action,input={})=>(await db.query('select public.'+name+'($1,$2::jsonb) value',[action,JSON.stringify(input)])).rows[0].value
  const intake=rpc('mip_pipeline_v1'),assessment=rpc('mip_assessments_v1')
  const add=async summary=>{
   await intake('enqueue',{run_id:'semantic-synthetic',article:{url:'https://example.invalid/semantic',
    title:'Synthetic only',outlet:'Fixture',summary,published_at:'2019-01-01T00:00:00Z'}})
   const job=await intake('claim');return intake('finish',{job_id:job.id,lease_token:job.lease_token})
  }
  stage='seed'
  const capture=await add('A report.')
  const candidate=await intake('candidate',{capture_id:capture.capture_id,candidate_key:'semantic',
   candidate_kind:'claim',statement:'A report.',source_field:'summary',span_start:0,span_end:9,
   excerpt:'A report.',extractor_version:'fixture-v1',remaining_uncertainty:'Synthetic only.'})
  const context=await assessment('context',{candidate_id:candidate})
  const sourceId=await assessment('append',{candidate_id:candidate,algorithm_key:'fixture',algorithm_version:'v1',
   outcome:'insufficient_evidence',rationale:'BODY_SENTINEL',remaining_uncertainty:'PRIVATE_SENTINEL',
   context_positions:context.context_positions})
  const original=await assessment('read',{assessment_id:sourceId})
  const request={assessmentId:sourceId,expectedInputFingerprint:original.input_fingerprint,expectedEnvelopeDigest:null,mode:'current'}
  const sessions=async()=>Number((await admin.query("select count(*)::int n from pg_stat_activity where datname=$1 and usename=$2",[database,login])).rows[0].n)
  const baseline=await sessions();assert.equal(baseline,0)
  stage='first_read'
  const first=await read(request)
  assert.ok(first.identity.id===sourceId&&first.metadata.candidate_id===candidate)
  assert.equal(first.currentness.state,'current')
  assert.ok(!/BODY_SENTINEL|PRIVATE_SENTINEL/.test(JSON.stringify(first)))
  assert.equal(first.authority.publication_allowed,false);assert.equal(first.authority.authorization_conferred,false)
  assert.equal(first.metadata.absence.kind,'unknown_or_unresolved')
  stage='exact_retry'
  const retry={...request,expectedEnvelopeDigest:first.envelope_digest.sha256}
  assert.equal((await read(retry)).envelope_digest.sha256,first.envelope_digest.sha256)
  await assert.rejects(()=>read({...request,expectedInputFingerprint:'0'.repeat(64)}),e=>e.code==='semantic_native_binding_mismatch')
  await assert.rejects(()=>read({...retry,assessmentId:'00000000-0000-4000-8000-000000000099'}),e=>e.code==='semantic_native_producer_unavailable')
  stage='correction'
  await add('A corrected report.')
  await assert.rejects(()=>read(request),e=>e.code==='semantic_native_currentness_refused')
  const retained=await read({...request,mode:'retained'})
  assert.equal(retained.identity.id,sourceId);assert.equal(retained.currentness.state,'stale')
  await assert.rejects(()=>read({...retry,mode:'retained'}),e=>e.code==='semantic_native_binding_mismatch')
  stage='denial'
  await admin.query('revoke service_role from '+quote(login))
  await assert.rejects(()=>read({...request,mode:'retained'}),e=>e.message==='semantic_native_read_failed')
  stage='cleanup_observation'
  let restored=false
  for(let i=0;i<100;i++){if(await sessions()===baseline){restored=true;break}await new Promise(r=>setTimeout(r,10))}
  assert.ok(restored)
 }catch(error){
  const state=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'NONE'
  const frames=String(error?.stack??'').split('\n').slice(1).flatMap(x=>x.match(/nativeSemanticIntegrationPostgres17\.test\.mjs:\d{1,6}:\d{1,6}/g)??[]).slice(0,3).join(' ')
  primary=Error('semantic_pg_'+stage+'_sqlstate_'+state+' '+frames)
 }finally{
  if(db)try{await db.end()}catch{cleanup.push(Error('semantic_pg_client_close_failed'))}
  if(admin&&ownedDatabase)try{await admin.query('drop database '+quote(database)+' with (force)')}catch{cleanup.push(Error('semantic_pg_database_cleanup_failed'))}
  if(admin)for(const role of createdRoles.reverse()){
   try{await admin.query('drop role '+quote(role))}catch{cleanup.push(Error('semantic_pg_role_cleanup_failed'))}
  }
  if(admin)try{await admin.end()}catch{cleanup.push(Error('semantic_pg_control_close_failed'))}
 }
 const failures=[primary,...cleanup].filter(Boolean)
 if(failures.length>1)throw new AggregateError(failures,'semantic_pg_primary_and_cleanup_failed')
 if(failures.length)throw failures[0]
})
