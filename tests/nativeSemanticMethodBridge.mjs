// Actual existing full-generation fixture consumer; no production target or SQL replacement.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {guard,quote as q} from '../verifier/integrated/transport.mjs'
import {connectAuthenticatedPg} from '../supabase/qualification/collector-native-capture/authenticatedPgDriver.mjs'
import {createNativeSemanticChangeReader} from '../supabase/qualification/native-semantic-integration/reader.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'

export async function assertNativeSemanticMethodConsumer(f,v,{causeId,revisionId,observedMethod,phase,priorDigest=null}){
 guard()
 let owned=false,client=null,primary=null,stage='preflight'
 const cleanup=[],login='semantic_method_'+randomUUID().replaceAll('-','')
 const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
 let result=null
 try{
  assert.match(f.db,/^mip_integrated_[a-f0-9]{32}$/)
  for(const id of [v.user,v.iid,v.method,causeId,revisionId,observedMethod])assert.match(id,uuid)
  assert.ok(['pending','resolved'].includes(phase))
  assert.ok(priorDigest===null||/^[a-f0-9]{64}$/.test(priorDigest))
  assert.equal(await f.admin('show server_version_num'),'170006')
  assert.equal(await f.admin('select count(*) from pg_roles where rolname='+q(login)),'0')
  const journal=()=>f.admin("select (select count(*) from mip_hypothesis.revisions)::text||':'||(select count(*) from mip_hypothesis.reassessment_causes)::text||':'||(select count(*) from mip_hypothesis.generation_outputs)::text")
  const before=await journal()
  stage='login'
  await f.admin('create role '+login+" login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password 'semantic-method-synthetic-only'")
  owned=true
  // Only this owned synthetic LOGIN, not server/database/global logging.
  for(const [name,value] of [['log_parameter_max_length_on_error','0'],['log_min_duration_statement','-1'],
   ['log_min_duration_sample','-1'],['log_transaction_sample_rate','0'],['log_statement','none']])
   await f.admin('alter role '+login+' set '+name+'='+q(value))
  await f.admin('grant mip_hypothesis_gateway to '+login+' with inherit true,set false')
  const sessionCount=()=>f.admin('select count(*) from pg_stat_activity where datname='+q(f.db)+' and usename='+q(login))
  assert.equal(await sessionCount(),'0')
  const uri=new URL('postgresql://127.0.0.1:5432/'+f.db)
  uri.username=login;uri.password='semantic-method-synthetic-only'
  const config={connectionString:uri.href,expectedLogin:login,disposable:true,sessionPoolerHost:null}
  const read=createNativeSemanticChangeReader(config)
  client=await connectAuthenticatedPg(config)
  stage='composition'
  const store=createHypothesisStore((sql,args)=>client.query(sql,args),{semanticChangeReader:read})
  const handler=createHypothesisHandler({authenticate:async header=>header==='Bearer synthetic-method-member'?{id:v.user}:null,
   store,sourceProject:v.source,allowedOrigins:['https://synthetic.invalid']})
  const input={investigation_id:v.iid,revision_id:revisionId,cause_id:causeId,expected_envelope_digest:null}
  const request=body=>handler(new Request('https://synthetic.invalid/hypothesis',{method:'POST',
   headers:{origin:'https://synthetic.invalid',authorization:'Bearer synthetic-method-member','content-type':'application/json'},
   body:JSON.stringify({action:'semantic_change',input:body})}))
  stage='method_read'
  const response=await request(input)
  assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'private, no-store')
  const envelope=(await response.json()).data
  assert.equal(envelope.identity.id,causeId)
  assert.equal(envelope.metadata.revision_id,revisionId)
  assert.equal(envelope.scope.id,v.iid)
  assert.equal(envelope.metadata.kind,'method_changed')
  assert.equal(envelope.metadata.canonical_cause,'method_changed')
  assert.equal(envelope.metadata.detail.accepted_method_revision,v.method)
  assert.equal(envelope.metadata.detail.observed_method_revision,observedMethod)
  assert.equal(envelope.metadata.detail.classification,'method_change_requires_reassessment_not_approval')
  assert.equal(envelope.metadata.state,phase==='pending'?'pending_explicit_reconciliation':'reassessment_recorded')
  assert.equal(envelope.currentness.state,'unknown')
  assert.equal(envelope.authority.publication_allowed,false)
  assert.equal(envelope.metadata.review_approval_claimed,false)
  assert.equal(envelope.metadata.completion_claimed,false)
  assert.ok(!/meeting record|Synthetic explanation/.test(JSON.stringify(envelope)))
  const digest=envelope.envelope_digest.sha256
  const retry=await request({...input,expected_envelope_digest:digest})
  assert.equal(retry.status,200);assert.deepEqual((await retry.json()).data,envelope)
  if(priorDigest!==null){
   assert.notEqual(digest,priorDigest)
   assert.equal((await request({...input,expected_envelope_digest:priorDigest})).status,409)
  }
  assert.equal((await request({...input,verifiedUserId:randomUUID()})).status,400)
  assert.equal(await journal(),before)
  stage='session_cleanup'
  await client.end();client=null
  let returned=false
  for(let i=0;i<100;i++){
   if(await sessionCount()==='0'){returned=true;break}
   await new Promise(resolve=>setTimeout(resolve,10))
  }
  assert.equal(returned,true)
  result={digest,publication_allowed:false}
 }catch(error){
  const code=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'NONE'
  const frames=String(error?.stack??'').split('\n').slice(1).flatMap(x=>x.match(/nativeSemanticMethodBridge\.mjs:\d{1,6}:\d{1,6}/g)??[]).slice(0,3).join(' ')
  primary=Error('semantic_method_'+stage+'_sqlstate_'+code+' '+frames)
 }finally{
  if(client)try{await client.end()}catch{cleanup.push(Error('semantic_method_close_unverified'))}
  if(owned){
   try{
    const count=await f.admin('select count(*) from pg_stat_activity where datname='+q(f.db)+' and usename='+q(login))
    if(count!=='0')cleanup.push(Error('semantic_method_sessions_not_returned'))
    await f.admin('select pg_terminate_backend(pid) from pg_stat_activity where datname='+q(f.db)+' and usename='+q(login))
   }catch{cleanup.push(Error('semantic_method_session_cleanup_failed'))}
   try{await f.admin('drop role '+login)}catch{cleanup.push(Error('semantic_method_role_cleanup_failed'))}
  }
 }
 const failures=[primary,...cleanup].filter(Boolean)
 if(failures.length>1)throw new AggregateError(failures,'semantic_method_operation_failed')
 if(failures.length)throw failures[0]
 return result
}
