import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createHypothesisHandler} from '../../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../../supabase/qualification/hypothesis-assessments/store.mjs'
import {createHypothesisAssessmentClient,hypothesisHistoryView} from '../../src/lib/hypothesisAssessmentClient.js'
import {setup,hold,blocked,q,raw,workerRole} from './fixture.mjs'
import {isolatedWorker} from './isolatedContainer.mjs'
import {syntheticEvaluation} from './syntheticMethod.mjs'
import {assessmentFromEvaluation,runDurableHypothesisWorker,recoverHypothesisRequest} from '../../supabase/qualification/hypothesis-assessments/worker.mjs'
const completeArgs=(v,j,output,request=randomUUID(),session=v.session)=>({p_request:request,p_session:session,p_runtime:v.runtime,
 p_generation:j.generation_id,p_token:j.lease_token,p_input_hash:j.input_hash,p_implementation:j.implementation_ref,p_output:output})
const output=j=>{const g=JSON.parse(j.input_text);return assessmentFromEvaluation(g,syntheticEvaluation(g))}
const claim=(f,v,request=randomUUID())=>f.claim(v.session,v.runtime,request)
const counts=(f,v)=>f.admin('select (select count(*) from mip_hypothesis.generation_outputs o join mip_hypothesis.generations g on g.id=o.generation_id where g.investigation_id='+q(v.iid)+")||':'||(select count(*) from mip_hypothesis.revisions where investigation_id="+q(v.iid)+")||':'||(select count(*) from mip_hypothesis.generation_requests r join mip_hypothesis.generations g on g.id=r.generation_id where g.investigation_id="+q(v.iid)+" and r.operation='worker_complete')")
const rpcSql=(f,name,args)=>'select mip_hypothesis.'+name+'('+f.signatures[name].map(k=>q(args[k])).join(',')+')'
const method=v=>({revision:v.method,implementation:v.implementation,model_version:'none',evaluate:syntheticEvaluation})
const options=(f,v,extra={})=>({rpc:f.rpc,journal:f.journal(v.session),runtime:v.runtime,session:v.session,method:method(v),requestId:randomUUID,sha256:f.sha,...extra})
async function childRun(f,v,{key,crash}={}) {
 const child=isolatedWorker(),journal=f.journal(v.session)
 let recoveryKey=null,errorSeen=false
 return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(Error('mip_worker_test_timeout'))},30000)
  child.on('message',async message=>{
   if(message.done){clearTimeout(timer);child.kill();resolve({state:message.state,key:message.recovery_key,errorSeen});return}
   try {
    let result
    if(message.kind==='journal')result=await journal[message.name](...message.args)
    else {
     recoveryKey=message.name+':'+message.args.p_request
     if(crash==='before_complete_commit'&&message.name==='worker_complete') {
      const held=await hold(f.db,rpcSql(f,message.name,message.args),workerRole)
      child.kill();await held.finish(false);return
     }
     result=await f.rpc(message.name,message.args)
     if((crash==='after_complete_commit'&&message.name==='worker_complete')||(crash==='after_claim_commit'&&message.name==='worker_claim')) {child.kill();return}
    }
    child.send({reply:true,id:message.id,result})
   } catch {errorSeen=true;child.send({reply:true,id:message.id,error:'mip_test_rpc_denied'})}
  })
  child.on('exit',()=>{clearTimeout(timer);resolve({state:'terminated',key:recoveryKey,errorSeen})})
  child.send({start:true,runtime:v.runtime,session:v.session,method:{revision:v.method,implementation:v.implementation,model_version:'none'},...(key?{key}:{})})
 })
}
test('isolated hypothesis generation authority, retained computation and restart package',async t=>{
 const f=await setup(t)
 await t.test('configured synthetic client-handler-store-worker-review path uses native gateway transactions',async()=>{
  const v=await f.investigation()
  let queries=0,token='synthetic-owner',dropReview=false
  const query=async(sql,values)=>{
   // SQL comes exclusively from createHypothesisStore, never request JSON.
   assert.match(sql,/^select mip_hypothesis\.[a-z_]+\(/)
   queries++
   const result=await raw(f.db,'set session authorization mip_hypothesis_gateway;prepare mip_transport as '+sql+
    ';execute mip_transport('+values.map(q).join(',')+');')
   return {rows:[{value:JSON.parse(result)}]}
  }
  const store=createHypothesisStore(query)
  // Explicit synthetic Auth boundary, not a provider JWT/production identity qualification.
  const authenticate=async authorization=>authorization==='Bearer synthetic-owner'?{id:v.user,is_anonymous:false}:null
  const handler=createHypothesisHandler({authenticate,store,sourceProject:v.source,
   allowedOrigins:['https://mip-synthetic.invalid'],generationTarget:{runtimeId:v.runtime,methodRevision:v.method}})
  const send=async(action,input,{origin='https://mip-synthetic.invalid'}={})=>{
   const response=await handler(new Request('https://mip-synthetic.invalid/hypotheses',{method:'POST',
    headers:{authorization:'Bearer '+token,origin,'content-type':'application/json'},
    body:JSON.stringify({action,input})}))
   assert.equal(response.headers.get('cache-control'),'private, no-store')
   const result=await response.json()
   if(dropReview&&action==='acknowledge_review'&&response.ok){dropReview=false;throw Error('synthetic_lost_acknowledgement')}
   return result
  }
  const client=createHypothesisAssessmentClient(send)
  let before=queries
  token='synthetic-untrusted'
  assert.equal((await client.history(v.iid)).error.code,'authentication_required')
  assert.equal(queries,before)
  token='synthetic-owner'
  assert.equal((await send('history',{investigation_id:v.iid,user_id:v.user})).error.code,'invalid_request')
  assert.equal((await send('history',{investigation_id:v.iid},{origin:'https://other.invalid'})).error.code,'origin_denied')
  assert.equal(queries,before)
  const empty=await client.history(v.iid);assert.deepEqual(empty.data.entries,[])
  assert.equal((await client.authoringContext(v.iid,v.vid)).error,null)
  const span=await client.authoringSpan({investigation_id:v.iid,workspace_version_id:v.vid,
   input_position:v.entry.position,source_field:'summary',start:2,end:5})
  assert.equal(span.error,null)
  const input={investigation_id:v.iid,workspace_version_id:v.vid,request_id:randomUUID(),spec:v.spec}
  const capture=await client.captureGeneration(input);assert.equal(capture.error,null)
  assert.deepEqual((await client.captureGeneration(input)).data,capture.data)
  assert.equal((await client.generationBacklog(v.iid)).data.entries.length,1)
  assert.equal((await runDurableHypothesisWorker(options(f,v))).state,'completed')
  assert.equal(await counts(f,v),'1:1:1')
  const history=(await client.history(v.iid)).data,backlog=(await client.backlog(v.iid)).data
  assert.ok(hypothesisHistoryView(history,backlog,v.iid))
  const saved=history.entries[0]
  assert.equal(saved.assessment.review_state,'unreviewed')
  const ack={investigation_id:v.iid,request_id:randomUUID(),revision_id:saved.revision_id,previous_receipt_id:null}
  dropReview=true
  assert.equal((await client.acknowledgeReview(ack)).error.code,'request_failed')
  const receipt=await client.acknowledgeReview(ack);assert.equal(receipt.error,null)
  const reviews=(await client.reviewHistory(v.iid)).data
  assert.equal(reviews.entries.length,1)
  assert.deepEqual(reviews.entries[0].receipt,receipt.data)
  assert.equal(receipt.data.is_approval,false);assert.equal(receipt.data.publication_allowed,false)
  assert.deepEqual((await client.history(v.iid)).data.entries[0].assessment,saved.assessment)
  assert.equal((await client.history(randomUUID())).error.code,'access_denied')
  await f.admin(v.revokeSql)
  const withheld=(await client.history(v.iid)).data.entries[0]
  assert.equal(withheld.status,'withheld');assert.equal(Object.hasOwn(withheld,'assessment'),false)
  assert.equal((await client.acknowledgeReview(ack)).error.code,'access_denied')
  assert.equal((await client.reviewHistory(v.iid)).data.entries[0].target_status,'withheld')
  await v.revokeAccess()
  assert.equal((await client.reviewHistory(v.iid)).error.code,'access_denied')
  assert.equal(await counts(f,v),'1:1:1')
 })
 await t.test('atomic real retained-input capture; no caller source body or input hash accepted',async()=>{
  const v=await f.investigation(),request=randomUUID(),g=await v.captureGeneration({request})
  const replay=await v.captureGeneration({request})
  assert.ok(JSON.stringify(g)===JSON.stringify(replay),'exact capture receipt')
  await assert.rejects(v.captureGeneration({spec:{...v.spec,body:'untrusted'}}),/mip_hypothesis_generation_spec/)
  await assert.rejects(v.captureGeneration({request,spec:{...v.spec,hypothesis_relationship:'overlapping'}}),/mip_hypothesis_generation_retry_conflict/)
  const j=await claim(f,v),input=JSON.parse(j.input_text)
  assert.equal(f.sha(j.input_text),j.input_hash)
  assert.equal(input.spans[0].excerpt,'😀 B')
  assert.equal(input.context.head,null)
  assert.equal(input.spans[0].source_span.end,5)
  assert.equal(await f.admin('select count(*) from comparison_qualification.generations'),'0')
  await f.rpc('worker_complete',completeArgs(v,j,output(j)))
  assert.equal(await counts(f,v),'1:1:1')
 })
 await t.test('separate worker table/function ownership, FORCE RLS and no escalation',async()=>{
  const v=await f.investigation()
  assert.equal(await f.admin("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_hypothesis' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)"),'0')
  assert.equal(await f.admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='mip_hypothesis' and (r.rolsuper or r.rolbypassrls or r.rolcanlogin)"),'0')
  for(const sql of ["select * from mip_hypothesis.review_acknowledgements",
   'select mip_hypothesis.acknowledge_review('+[v.user,v.iid,randomUUID(),randomUUID()].map(q).join(',')+',null)',
   'select mip_hypothesis.review_history('+[v.user,v.iid].map(q).join(',')+')',
   "select * from mip_hypothesis.generations","select * from mip_hypothesis.generation_outputs","update mip_hypothesis.method_heads set active=true",
   "set role service_role","set role mip_hypothesis_owner","set role mip_identity_broker_v2","select * from mip_identity.sessions",
   'select mip_hypothesis.capture_generation('+[v.user,v.iid,v.vid,v.source,randomUUID(),v.runtime,v.method,v.spec].map(q).join(',')+')'])
   await assert.rejects(raw(f.db,'set session authorization '+workerRole+';'+sql),/mip_database_denied/)
  await assert.rejects(raw(f.db,"set session authorization mip_hypothesis_gateway;insert into mip_hypothesis.method_versions values(gen_random_uuid(),'invented','none','owner_authorized_method','invented','{}',clock_timestamp())"),/mip_database_denied/)
 })
 await t.test('closed CC source scope and missing permission never enter generation',async()=>{
  const v=await f.investigation()
  await f.admin(v.revokeSql)
  await assert.rejects(v.captureGeneration(),/mip_database_denied_42501/)
  assert.equal(await f.admin('select count(*) from mip_hypothesis.generations where investigation_id='+q(v.iid)),'0')
  await f.admin('select comparison_qualification.bind_source_scope('+[v.runtime,'cc-definition-batch-v1'].map(q).join(',')+')')
  await assert.rejects(f.gateway('capture_generation',[v.user,v.iid,v.vid,'cc-definition-batch-v1',randomUUID(),v.runtime,v.method,v.spec]),/mip_database_denied_42501/)
 })
 await t.test('wrong audience/subject/runtime, expired identity and cross-runtime session denied',async()=>{
  const v=await f.investigation();await v.captureGeneration()
  for(const override of [{aud:'wrong'},{sub:'wrong'},{exp:0}])
   await assert.rejects(f.issue(v.runtime,workerRole,{token:f.token(v.runtime,workerRole,override)}),/mip_workload_identity_denied/)
  await assert.rejects(f.issue(v.runtime,workerRole,{token:f.token('runtime-b')}),/mip_workload_identity_denied/)
  await assert.rejects(f.claim(f.session,v.runtime),/mip_identity_stale_revision/)
  const token=f.token(v.runtime),request=randomUUID()
  await f.issue(v.runtime,workerRole,{token,request})
  await assert.rejects(f.issue(v.runtime,workerRole,{token}),/mip_identity_token_replay/)
 })
 await t.test('revoked mapping and stale replacement cannot reuse a retained generation',async()=>{
  const v=await f.investigation();await v.captureGeneration()
  await f.admin("update mip_identity.mapping_heads set active=false where runtime="+q(v.runtime))
  await assert.rejects(claim(f,v),/mip_identity_mapping_revoked/)
  const revision=randomUUID()
  await f.admin('insert into mip_identity.mapping_versions select '+q(revision)+',runtime,principal,issuer,audience,subject,key_revision,max_lifetime_seconds,approval_ref from mip_identity.mapping_versions where revision='+q(v.mapping)+
   ';update mip_identity.mapping_heads set revision='+q(revision)+',active=true where runtime='+q(v.runtime))
  v.session=await f.issue(v.runtime)
  assert.equal(await claim(f,v),null)
  assert.equal(await f.admin('select state from mip_hypothesis.generation_jobs j join mip_hypothesis.generations g on g.id=j.generation_id where g.investigation_id='+q(v.iid)),'pending')
 })
 await t.test('source and evaluated-implementation revocation during processing strand work',async()=>{
  for(const kind of ['source','implementation']){
   const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v)
   await f.admin('select comparison_qualification.revoke_'+(kind==='source'?'source_scope':'evaluated_implementation')+'('+[v.runtime,kind==='source'?v.source:v.implementation].map(q).join(',')+')')
   await assert.rejects(f.rpc('worker_complete',completeArgs(v,j,output(j))),/mip_identity_mapping_revoked/)
   assert.equal(await counts(f,v),'0:0:0')
   assert.equal(await f.admin('select state from mip_hypothesis.generation_jobs where generation_id='+q(j.generation_id)),'processing')
  }
 })
 await t.test('revoked reviewer membership denies completion and retains processing',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v)
  await v.revokeAccess()
  await assert.rejects(f.rpc('worker_complete',completeArgs(v,j,output(j))),/mip_database_denied_42501/)
  assert.equal(await counts(f,v),'0:0:0')
 })
 await t.test('revoked method denies completion and cannot be reactivated under old revision',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v)
  await f.admin('update mip_hypothesis.method_heads set active=false where revision='+q(v.method))
  await assert.rejects(f.rpc('worker_complete',completeArgs(v,j,output(j))),/mip_hypothesis_method_unavailable/)
  await assert.rejects(f.admin('update mip_hypothesis.method_heads set active=true where revision='+q(v.method)),/mip_identity_fresh_revision_required/)
  assert.equal(await counts(f,v),'0:0:0')
 })
 await t.test('ineligible and out-of-runtime work cannot obstruct eligible investigation',async()=>{
  const a=await f.investigation(),b=await f.investigation()
  await a.captureGeneration()
  await a.revokeAccess()
  await f.admin('select comparison_qualification.bind_evaluated_implementation('+[a.runtime,b.implementation].map(q).join(',')+')')
  const eligible=await b.captureGeneration({runtime:a.runtime})
  const foreign=await b.captureGeneration()
  const j=await claim(f,a)
  assert.equal(j.generation_id,eligible.generation_id)
  assert.equal(await f.admin('select state from mip_hypothesis.generation_jobs where generation_id='+q(foreign.generation_id)),'pending')
  assert.equal(await f.admin('select count(*) from mip_hypothesis.generation_blocks b join mip_hypothesis.generations g on g.id=b.generation_id where g.investigation_id='+q(a.iid)),'1')
 })
 await t.test('rotating investigation selection advances an eligible later investigation',async()=>{
  const a=await f.investigation(),b=await f.investigation()
  await f.admin('select comparison_qualification.bind_evaluated_implementation('+[a.runtime,b.implementation].map(q).join(',')+')')
  const first=await a.captureGeneration();await a.captureGeneration()
  const later=await b.captureGeneration({runtime:a.runtime})
  assert.equal((await claim(f,a)).generation_id,first.generation_id)
  assert.equal((await claim(f,a)).generation_id,later.generation_id)
  // Processing jobs are not recycled; fairness is among finite eligible pending work at claim time.
 })
 await t.test('database independently rejects output source, method, rating, review and argument escalation',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v),baseline=output(j)
  const mutations=[
   a=>a.release_state='public',a=>a.review_state='reviewed',a=>a.method_version='other',
   a=>a.evidence[0].material_version=randomUUID(),a=>a.evidence[0].source_span.end=20,
   a=>a.evidence[0].origin_group='worker-asserted-independent',
   a=>a.hypotheses[0].likelihood={kind:'probability',value:.8,reason:'invented'},
   a=>a.comparison.confidence={kind:'qualitative',label:'high',method_ref:'invented',reason:'invented'},
   a=>a.arguments[0].evidence_ids=['missing'],
   a=>{a.comparison.state='better_supported';a.comparison.favored_ids=['a'];a.arguments[0].relation='reports_allegation'},
   a=>a.extra='unbound',a=>a.evidence.push(a.evidence[0])]
  for(const mutate of mutations){const a=structuredClone(baseline);mutate(a);await assert.rejects(f.rpc('worker_complete',completeArgs(v,j,a)),/mip_hypothesis_|mip_database_denied_22023/)}
  assert.equal(await counts(f,v),'0:0:0')
  await f.rpc('worker_complete',completeArgs(v,j,baseline))
  assert.equal(await counts(f,v),'1:1:1')
 })
 await t.test('permission acceptance first: output/revision/ack/receipt commit, revocation waits',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v),args=completeArgs(v,j,output(j))
  const held=await hold(f.db,rpcSql(f,'worker_complete',args),workerRole)
  let pending=f.admin(v.revokeSql);pending.catch(()=>{})
  await blocked(f,held.pid);assert.equal(await counts(f,v),'0:0:0')
  await held.finish();await pending
  assert.equal(await counts(f,v),'1:1:1')
  const history=await f.gateway('read_bound_history',[v.user,v.iid])
  assert.equal(history.entries[0].status,'withheld')
 })
 await t.test('permission revocation first: output/revision/ack/receipt all reject',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v)
  const held=await hold(f.db,v.revokeSql)
  const pending=f.rpc('worker_complete',completeArgs(v,j,output(j)));pending.catch(()=>{})
  await blocked(f,held.pid);await held.finish()
  await assert.rejects(pending,/mip_database_denied_42501/)
  assert.equal(await counts(f,v),'0:0:0')
 })
 await t.test('source correction during processing rejects stale retained generation',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v)
  await f.admin("update public.articles set source_status='corrected',summary='Synthetic corrected record.' where url="+q(v.url))
  await assert.rejects(f.rpc('worker_complete',completeArgs(v,j,output(j))),/mip_database_denied_40001/)
  assert.equal(await counts(f,v),'0:0:0')
 })
 await t.test('exact completion retry requires current authority and identical output',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v),args=completeArgs(v,j,output(j))
  const first=await f.rpc('worker_complete',args)
  v.session=await f.issue(v.runtime)
  const retry=await f.rpc('worker_complete',{...args,p_session:v.session})
  assert.ok(JSON.stringify(first)===JSON.stringify(retry),'exact committed result')
  const changed=structuredClone(args.p_output);changed.revision_reason='Different synthetic arguments.'
  await assert.rejects(f.rpc('worker_complete',{...args,p_session:v.session,p_output:changed}),/mip_hypothesis_generation_retry_conflict/)
  await f.admin(v.revokeSql)
  await assert.rejects(f.rpc('worker_complete',{...args,p_session:v.session}),/mip_database_denied_42501/)
  assert.equal(await counts(f,v),'1:1:1')
 })
 await t.test('worker method mismatch is explicitly failed without invented assessment',async()=>{
  const v=await f.investigation();await v.captureGeneration()
  const r=await runDurableHypothesisWorker(options(f,v,{method:{...method(v),revision:randomUUID()}}))
  assert.equal(r.state,'failed');assert.equal(await counts(f,v),'0:0:0')
 })
 await t.test('expired lease does not requeue, force-cancel or accept completion',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v)
  await f.admin("update mip_hypothesis.generation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id="+q(j.generation_id))
  assert.equal(await claim(f,v),null)
  await assert.rejects(f.rpc('worker_complete',completeArgs(v,j,output(j))),/mip_hypothesis_lease_unavailable/)
  assert.equal(await f.admin('select state from mip_hypothesis.generation_jobs where generation_id='+q(j.generation_id)),'processing')
 })
 await t.test('real container computes over retained spans with no broad credentials or network',async()=>{
  const v=await f.investigation();await v.captureGeneration()
  const r=await childRun(f,v)
  assert.equal(r.state,'completed');assert.equal(r.errorSeen,false)
  assert.equal(await counts(f,v),'1:1:1')
  assert.equal(await f.admin('select output->\'comparison\'->>\'rationale\' from mip_hypothesis.generation_outputs o join mip_hypothesis.generations g on g.id=o.generation_id where g.investigation_id='+q(v.iid)),
   'Synthetic mechanism inspected 3 retained code points; this is not semantic qualification.')
 })
 for(const crash of ['before_complete_commit','after_complete_commit'])await t.test('actual termination/restart '+crash+' recovers exact durable completion',async()=>{
  const v=await f.investigation();await v.captureGeneration()
  const lost=await childRun(f,v,{crash})
  assert.equal(lost.state,'terminated');assert.ok(lost.key?.startsWith('worker_complete:'))
  v.session=await f.issue(v.runtime)
  const recovered=await childRun(f,v,{key:lost.key})
  assert.equal(recovered.state,'completed');assert.equal(recovered.errorSeen,false)
  assert.equal(await counts(f,v),'1:1:1')
 })
 await t.test('actual lost claim response preserves stranded work; fresh process cannot invent lease',async()=>{
  const v=await f.investigation();await v.captureGeneration()
  const lost=await childRun(f,v,{crash:'after_claim_commit'})
  assert.equal(lost.state,'terminated');assert.ok(lost.key?.startsWith('worker_claim:'))
  v.session=await f.issue(v.runtime)
  const recovered=await childRun(f,v,{key:lost.key})
  assert.equal(recovered.state,'retained_pending_explicit_recovery')
  assert.equal(await counts(f,v),'0:0:0')
  assert.equal(await f.admin('select state from mip_hypothesis.generation_jobs j join mip_hypothesis.generations g on g.id=j.generation_id where g.investigation_id='+q(v.iid)),'processing')
 })
 await t.test('encrypted remote exact-content journal, scoped runtime, no plaintext and protocol separation',async()=>{
  const a=await f.investigation(),b=await f.investigation(),j=f.journal(a.session),k='hypothesis-v1:synthetic-journal'
  await j.putOnce(k,{synthetic:'confidential-fixture-only'})
  await j.putOnce(k,{synthetic:'confidential-fixture-only'})
  await assert.rejects(j.putOnce(k,{synthetic:'different'}),/mip_journal_content_conflict/)
  assert.equal(await f.journal(b.session).get(k),null)
  assert.equal(await f.admin("select count(*) from mip_identity.journal where envelope::text like '%confidential-fixture-only%'"),'0')
  await assert.rejects(recoverHypothesisRequest(options(f,a,{key:'worker_complete:'+randomUUID()})),/mip_recovery_binding/)
 })
 await t.test('generated reassessment resolves exact human causes atomically and stays unreviewed/private',async()=>{
  const v=await f.investigation();await v.captureGeneration();let j=await claim(f,v)
  const first=await f.rpc('worker_complete',completeArgs(v,j,output(j)))
  await f.gateway('request_reassessment',[v.user,v.iid,randomUUID(),first.revision_id,'contradiction','Synthetic concern; not a permission or method approval.'])
  await v.captureGeneration();j=await claim(f,v)
  assert.equal(JSON.parse(j.input_text).cause_details.length,1)
  await f.rpc('worker_complete',completeArgs(v,j,output(j)))
  assert.equal(await counts(f,v),'2:2:2')
  const history=await f.gateway('read_bound_history',[v.user,v.iid])
  assert.equal(history.entries[1].assessment.review_state,'unreviewed')
  const backlog=await f.gateway('reassessment_backlog',[v.user,v.iid])
  assert.equal(backlog.causes.filter(c=>c.state==='pending_explicit_reconciliation').length,0)
 })
 await t.test('unselected retained input permissions still protect generated history and create causes',async()=>{
  const v=await f.investigation();await v.captureGeneration({spec:{...v.spec,spans:[]}})
  const j=await claim(f,v);await f.rpc('worker_complete',completeArgs(v,j,output(j)))
  await f.admin(v.revokeSql)
  const history=await f.gateway('read_bound_history',[v.user,v.iid])
  assert.equal(history.entries[0].status,'withheld')
  assert.ok((await f.gateway('reassessment_backlog',[v.user,v.iid])).causes.some(c=>c.kind==='permission_changed'))
 })
 await t.test('private operational ledger binds exact generation records and never returns lease secrets or source text',async()=>{
  const v=await f.investigation(),g=await v.captureGeneration();const j=await claim(f,v)
  const ledger=await f.gateway('generation_backlog',[v.user,v.iid])
  assert.equal(ledger.entries.length,1);assert.equal(ledger.entries[0].generation_id,g.generation_id)
  assert.equal(ledger.entries[0].state,'processing');assert.equal(ledger.current_authority_qualified,false)
  assert.equal(ledger.automatic_retry,false)
  assert.ok(!JSON.stringify(ledger).includes(j.lease_token),'lease secret excluded')
  assert.ok(!JSON.stringify(ledger).includes('😀 B'),'source text excluded')
  await v.revokeAccess()
  await assert.rejects(f.gateway('generation_backlog',[v.user,v.iid]),/mip_database_denied_42501/)
 })
 await t.test('expired session cannot commit an idle receipt after waiting on a permission fence',async()=>{
  const v=await f.investigation();await v.captureGeneration()
  const held=await hold(f.db,v.revokeSql)
  const exp=Math.floor(Date.now()/1000)+3
  const session=await f.issue(v.runtime,workerRole,{token:f.token(v.runtime,workerRole,{exp})})
  const request=randomUUID(),pending=f.claim(session,v.runtime,request);pending.catch(()=>{})
  await blocked(f,held.pid)
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,exp*1000-Date.now()+100)))
  await held.finish()
  await assert.rejects(pending,/mip_identity_expired/)
  assert.equal(await f.admin('select count(*) from mip_hypothesis.generation_requests where request_id='+q(request)),'0')
 })
 await t.test('capture acknowledgement can be recovered after the generation has completed',async()=>{
  const v=await f.investigation(),request=randomUUID(),first=await v.captureGeneration({request})
  const j=await claim(f,v);await f.rpc('worker_complete',completeArgs(v,j,output(j)))
  const retry=await v.captureGeneration({request})
  assert.ok(JSON.stringify(first)===JSON.stringify(retry),'capture receipt survives later completion')
 })

 await t.test('method replacement retains a distinct pending cause and explicit new-version reassessment',async()=>{
  const v=await f.investigation();await v.captureGeneration();
  const j=await claim(f,v);await f.rpc('worker_complete',completeArgs(v,j,output(j)));
  const next=randomUUID();
  await f.admin('insert into mip_hypothesis.method_versions values('+[next,v.implementation,'none','synthetic_mechanism_only','synthetic-method-replacement',{}].map(q).join(',')+',clock_timestamp());update mip_hypothesis.method_heads set revision='+q(next)+' where implementation='+q(v.implementation));
  const backlog=await f.gateway('reassessment_backlog',[v.user,v.iid]);
  const causes=backlog.causes.filter(c=>c.kind==='method_changed');
  assert.equal(causes.length,1);assert.equal(causes[0].state,'pending_explicit_reconciliation');
  assert.equal(causes[0].detail.accepted_method_revision,v.method);
  assert.equal(causes[0].detail.observed_method_revision,next);
  const history=await f.gateway('read_bound_history',[v.user,v.iid]);
  assert.equal(history.entries[0].reassessment_pending,true);
  await f.gateway('reconcile_reassessment_causes',[v.user,v.iid]);
  assert.equal((await f.gateway('reassessment_backlog',[v.user,v.iid])).causes.filter(c=>c.kind==='method_changed').length,1);
  const g=await v.captureGeneration({method:next});
  const newer=await claim(f,v);assert.equal(newer.generation_id,g.generation_id);
  await f.rpc('worker_complete',completeArgs(v,newer,output(newer)));
  assert.equal(await counts(f,v),'2:2:2');
  const finished=await f.gateway('reassessment_backlog',[v.user,v.iid]);
  assert.equal(finished.causes.filter(c=>c.kind==='method_changed').length,1);
  assert.notEqual(finished.causes.find(c=>c.kind==='method_changed').state,'pending_explicit_reconciliation');
 });
 await t.test('rolled-back method removal leaves no cause; committed removal retains cause and unrelated history',async()=>{
  const v=await f.investigation(),other=await f.investigation();
  for(const item of [v,other]){await item.captureGeneration();const j=await claim(f,item);await f.rpc('worker_complete',completeArgs(item,j,output(j)))}
  const prior=await f.gateway('read_bound_history',[other.user,other.iid]);
  const removal='delete from mip_hypothesis.method_heads where implementation='+q(v.implementation);
  const held=await hold(f.db,removal);await held.finish(false);
  assert.equal((await f.gateway('reassessment_backlog',[v.user,v.iid])).causes.filter(c=>c.kind==='method_changed').length,0);
  await f.admin(removal);
  const causes=(await f.gateway('reassessment_backlog',[v.user,v.iid])).causes.filter(c=>c.kind==='method_changed');
  assert.equal(causes.length,1);assert.equal(causes[0].detail.observed_method_revision,null);
  assert.equal(causes[0].detail.observed_active,false);
  assert.deepEqual(await f.gateway('read_bound_history',[other.user,other.iid]),prior);
  assert.equal(await counts(f,v),'1:1:1');
  await assert.rejects(v.captureGeneration(),/mip_hypothesis_method_unavailable/);
 });


 await t.test('fresh-generation recovery preserves expired attempt and commits exact linked retry',async()=>{
  const v=await f.investigation(),original=await v.captureGeneration(),j=await claim(f,v),request=randomUUID();
  const args=[v.user,v.iid,v.vid,v.source,request,v.runtime,v.method,original.generation_id,v.spec];
  await assert.rejects(f.gateway('recover_generation',args),/mip_hypothesis_recovery_not_stranded/);
  await f.admin('update mip_hypothesis.generation_jobs set lease_expires_at=null where generation_id='+q(original.generation_id));
  await assert.rejects(f.gateway('recover_generation',args),/mip_hypothesis_recovery_not_stranded/);
  await f.admin("update mip_hypothesis.generation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id="+q(original.generation_id));
  const recovered=await f.gateway('recover_generation',args);
  assert.notEqual(recovered.generation_id,original.generation_id);
  assert.equal(recovered.prior_generation_id,original.generation_id);
  const lineage=await f.gateway('generation_backlog',[v.user,v.iid]);
  assert.equal(lineage.contract_version,'mip_hypothesis_generation_backlog_v2');
  assert.equal(lineage.entries.find(e=>e.generation_id===original.generation_id).recovery_generation_id,recovered.generation_id);
  assert.equal(lineage.entries.find(e=>e.generation_id===recovered.generation_id).recovery_prior_generation_id,original.generation_id);
  assert.equal(lineage.entries.find(e=>e.generation_id===original.generation_id).state,'processing');
  assert.equal(JSON.stringify(lineage).includes(j.lease_token),false);
  assert.equal(recovered.prior_retained,true);assert.equal(recovered.force_cancellation,false);assert.equal(recovered.automatic_retry,false);
  assert.deepEqual(await f.gateway('recover_generation',args),recovered);
  assert.equal(await f.admin('select state from mip_hypothesis.generation_jobs where generation_id='+q(original.generation_id)),'processing');
  const changed=[...args];changed[4]=randomUUID();
  await assert.rejects(f.gateway('recover_generation',changed),/mip_hypothesis_recovery_conflict/);
  await assert.rejects(f.rpc('worker_complete',completeArgs(v,j,output(j))),/mip_hypothesis_lease_unavailable/);
  const next=await claim(f,v);assert.equal(next.generation_id,recovered.generation_id);
  await f.rpc('worker_complete',completeArgs(v,next,output(next)));
  assert.deepEqual(await f.gateway('recover_generation',args),recovered);
  assert.equal(await counts(f,v),'1:1:1');
  await v.revokeAccess();
  await assert.rejects(f.gateway('recover_generation',args));
 });
 await t.test('recovery refuses wrong owner, scope, completed job and revoked input permission',async()=>{
  const v=await f.investigation(),original=await v.captureGeneration(),j=await claim(f,v);
  const args=[v.user,v.iid,v.vid,v.source,randomUUID(),v.runtime,v.method,original.generation_id,v.spec];
  const wrong=[...args];wrong[0]=randomUUID();
  await assert.rejects(f.gateway('recover_generation',wrong),/mip_hypothesis_recovery_owner_scope/);
  const scope=[...args];scope[3]='synthetic-other-source';
  await assert.rejects(f.gateway('recover_generation',scope));
  await f.rpc('worker_complete',completeArgs(v,j,output(j)));
  await assert.rejects(f.gateway('recover_generation',args),/mip_hypothesis_recovery_not_stranded/);
  assert.equal(await f.admin('select count(*) from mip_hypothesis.generation_recoveries where prior_generation_id='+q(original.generation_id)),'0');
  const blockedV=await f.investigation(),blockedG=await blockedV.captureGeneration();await claim(f,blockedV);
  await f.admin("update mip_hypothesis.generation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id="+q(blockedG.generation_id));
  await f.admin(blockedV.revokeSql);
  await assert.rejects(f.gateway('recover_generation',[blockedV.user,blockedV.iid,blockedV.vid,blockedV.source,randomUUID(),blockedV.runtime,blockedV.method,blockedG.generation_id,blockedV.spec]));
  assert.equal(await f.admin('select count(*) from mip_hypothesis.generation_recoveries where prior_generation_id='+q(blockedG.generation_id)),'0');
 });
 await t.test('recovery is atomic on rollback and inaccessible to the worker role',async()=>{
  const v=await f.investigation(),original=await v.captureGeneration(),j=await claim(f,v);
  const failure=completeArgs(v,j,output(j));delete failure.p_output;
  await f.rpc('worker_fail',failure);
  const args=[v.user,v.iid,v.vid,v.source,randomUUID(),v.runtime,v.method,original.generation_id,v.spec];
  await assert.rejects(f.call(workerRole,'recover_generation',args));
  const held=await hold(f.db,'select mip_hypothesis.recover_generation('+args.map(q).join(',')+')','mip_hypothesis_gateway');
  await held.finish(false);
  assert.equal(await f.admin('select count(*) from mip_hypothesis.generation_recoveries where prior_generation_id='+q(original.generation_id)),'0');
  assert.equal(await f.admin('select count(*) from mip_hypothesis.generations where request_id='+q(args[4])),'0');
  const r=await f.gateway('recover_generation',args);
  assert.equal(r.prior_state,'failed');
  assert.equal(await f.admin('select state from mip_hypothesis.generation_jobs where generation_id='+q(original.generation_id)),'failed');
 });
 await t.test('revoked signing key denies claim and completion despite an outstanding lease',async()=>{
  const v=await f.investigation();await v.captureGeneration();const j=await claim(f,v)
  await f.admin('update mip_identity.key_heads set active=false')
  await assert.rejects(claim(f,v),/mip_identity_key_revoked/)
  await assert.rejects(f.rpc('worker_complete',completeArgs(v,j,output(j))),/mip_identity_key_revoked/)
  assert.equal(await counts(f,v),'0:0:0')
 })
})
