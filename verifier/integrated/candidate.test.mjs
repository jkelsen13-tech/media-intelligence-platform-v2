import test from 'node:test'
import {restartRemoteStore} from './remoteStoreRestart.mjs'
import {comparisonProjectionConfig} from '../../supabase/runtime-snapshots/source-comparison-run-v16/projectionConfig.js'
import {runner,fakeDatabase} from './runtimeParity.mjs'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {isolatedWorker} from './isolatedContainer.mjs'
import {readFile} from 'node:fs/promises'
import {fixture,workerRole,producerRole} from './fixture.mjs'
import {raw,quote as q,guard,transport} from './transport.mjs'
import {issueWorkloadSession} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
guard()
await raw('postgres',"alter system set log_min_error_statement='panic';alter system set log_min_messages='panic';alter system set log_statement='none';select pg_reload_conf();")
await raw('postgres',"do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;create role authenticated;create role service_role bypassrls;end if;end $$;")
const signatures={worker_claim:['p_request','p_session','p_runtime'],worker_complete:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation','p_output'],worker_fail:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation']}
const claim=f=>f.rpc('worker_claim',[randomUUID(),f.session,'runtime-a'])
const complete=(f,j)=>f.rpc('worker_complete',[randomUUID(),f.session,'runtime-a',j.generation_id,j.lease_token,j.input_hash,j.implementation_ref,{}])
test('broker issues bound sessions; worker completes retained input through NOLOGIN/FORCE RLS kernel',async t=>{
 const f=await fixture(t);await f.capture();const j=await claim(f)
 assert.equal(await complete(f,j),'completed')
 assert.equal(await f.admin("select count(*) from comparison_qualification.outputs"),'1')
 assert.equal(await f.admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname in ('comparison_qualification','mip_identity') and (r.rolsuper or r.rolbypassrls or r.rolcanlogin)"),'0')
 assert.equal(await f.admin("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('comparison_qualification','mip_identity') and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)"),'0')
 for(const sql of ["select * from mip_identity.sessions","select * from comparison_qualification.outputs","select comparison_qualification.issue_session('mip_comparison_worker_v1','runtime-a','2999-01-01')","set role postgres","set role service_role","set role mip_kernel_owner_v2","select mip_cutover_authority.worker_claim(gen_random_uuid(),gen_random_uuid(),'runtime-a')"])
  await assert.rejects(raw(f.db,'set session authorization '+workerRole+';'+sql),/mip_database_denied/)
})
test('wrong audience, subject, runtime, expiry, token replay and stale config issue are denied',async t=>{
 const f=await fixture(t)
 for(const override of [{aud:'wrong'},{sub:'wrong'},{exp:0}]){
  await assert.rejects(f.issue('runtime-a',workerRole,{token:f.token('runtime-a',workerRole,override)}),/mip_workload_identity_denied/)
 }
 await assert.rejects(f.issue('runtime-b',workerRole,{token:f.token()}),/mip_workload_identity_denied/)
 const token=f.token(),request=randomUUID()
 const session=await f.issue('runtime-a',workerRole,{token,request})
 assert.ok(await f.issue('runtime-a',workerRole,{token,request})===session)
 await assert.rejects(f.issue('runtime-a',workerRole,{token}),/mip_identity_token_replay/)
 const policy=await f.broker('configuration',['runtime-a',workerRole])
 await f.admin("update mip_identity.mapping_heads set active=false where runtime='runtime-a' and principal="+q(workerRole))
 await assert.rejects(issueWorkloadSession({sql:async(name,args)=>name==='configuration'?policy:f.broker(name,args),token:f.token(),runtime:'runtime-a',principal:workerRole,request:randomUUID(),now:Math.floor(Date.now()/1000)}),/mip_identity_mapping_revoked/)
 await assert.rejects(f.rpc('worker_claim',[randomUUID(),session,'runtime-a']),/mip_identity_mapping_revoked/)
})
test('revoked signing key and cross-runtime sessions cannot read retained work',async t=>{
 const f=await fixture(t);await f.capture()
 await assert.rejects(f.rpc('worker_claim',[randomUUID(),f.session,'runtime-b']),/mip_identity_stale_revision/)
 await f.admin('update mip_identity.key_heads set active=false')
 await assert.rejects(claim(f),/mip_identity_key_revoked/)
 await assert.rejects(f.issue(),/mip_identity_key_revoked/)
})
test('encrypted PostgreSQL journal is exact-content, runtime-scoped and committed before acknowledgement',async t=>{
 const f=await fixture(t),j=f.journal(f.session),key='synthetic-entry'
 const value={message:'synthetic-confidential-value',argument:1}
 assert.equal((await j.putOnce(key,value)).committed,true)
 assert.deepEqual(await f.journal(f.session).get(key),value)
 await j.putOnce(key,value)
 await assert.rejects(j.putOnce(key,{...value,argument:2}),/mip_journal_content_conflict/)
 const other=await f.issue('runtime-b')
 assert.equal(await f.journal(other).get(key),null)
 assert.equal(await f.admin("select count(*) from mip_identity.journal where envelope::text like '%synthetic-confidential-value%'"),'0')
 await f.admin("update mip_identity.mapping_heads set active=false where runtime='runtime-a' and principal="+q(workerRole))
 await assert.rejects(j.get(key),/mip_identity_mapping_revoked/)
})
async function childRun(f,session,{killAfter,key}={}){
 const child=isolatedWorker()
 // No broker/database credentials, journal key, or service-role client is passed.
 const journal=f.journal(session),keys=[]
 return new Promise((resolve,reject)=>{
  let killed=false,finished=false
  child.stdout.resume();child.stderr.resume()
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('mip_child_timeout'))},45000)
  child.on('message',async m=>{
   if(m.done){finished=true;clearTimeout(timer);child.kill();resolve({state:m.state,keys});return}
   try{
    if(m.kind==='journal'&&m.name==='putOnce')keys.push(m.args[0])
    const result=m.kind==='journal'?await journal[m.name](...m.args):await f.rpc(m.name,signatures[m.name].map(k=>m.args[k]))
    if(m.kind==='rpc'&&m.name===killAfter){killed=true;clearTimeout(timer);child.kill('SIGKILL');return}
    if(child.connected)child.send({reply:true,id:m.id,result})
   }catch(error){if(child.connected)child.send({reply:true,id:m.id,error:error.message.startsWith('mip_')?error.message:'mip_operation_failed'})}
  })
  child.on('exit',()=>{clearTimeout(timer);if(killed)resolve({state:'terminated',keys});else if(!finished)reject(Error('mip_child_exited'))})
  child.send({start:true,session,runtime:'runtime-a',key})
 })
}
test('SIGKILL after committed completion recovers in a new process from encrypted remote journal',async t=>{
 const f=await fixture(t);await f.capture()
 const killed=await childRun(f,f.session,{killAfter:'worker_complete'})
 assert.equal(killed.state,'terminated')
 const key=killed.keys.find(k=>k.startsWith('worker_complete:')&&!k.endsWith(':receipt'))
 assert.ok(key)
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'1')
 const fresh=await f.issue()
 const recovered=await childRun(f,fresh,{key})
 assert.equal(recovered.state,'completed')
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'1')
 assert.equal(await f.admin("select count(*) from comparison_qualification.request_runs where rpc_name='worker_complete'"),'1')
})
test('SIGKILL after claim preserves stranded processing and requires explicit reconciliation',async t=>{
 const f=await fixture(t);await f.capture()
 const killed=await childRun(f,f.session,{killAfter:'worker_claim'})
 const key=killed.keys.find(k=>k.startsWith('worker_claim:'))
 const recovered=await childRun(f,await f.issue(),{key})
 assert.equal(recovered.state,'retained_pending_explicit_recovery')
 assert.equal(await f.admin('select state from comparison_qualification.jobs'),'processing')
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'0')
 assert.equal(await f.rpc('worker_claim',[randomUUID(),await f.issue(),'runtime-a']),null)
})

test('collector backlog/delta reconciliation binds every exact change to its retained generation and acknowledgement',async t=>{
 const f=await fixture(t)
 const backlog=Number(await f.admin('select mip_identity.capture_backlog()'))
 const request=randomUUID()
 const first=await f.producerRpc('capture_delta',[request,f.producer,'runtime-a'])
 assert.ok(first)
 assert.ok(await f.producerRpc('capture_delta',[request,f.producer,'runtime-a'])===first)
 let rows=await f.producerRpc('reconciliation',[f.producer,'runtime-a'])
 assert.equal(rows.length,backlog);assert.ok(rows.every(r=>r.generation_id===first&&!r.acknowledged))
 const expected=JSON.parse(await f.admin("select jsonb_agg(jsonb_build_object('id',id,'relation',relation_name,'key',row_key) order by id) from mip_identity.source_changes"))
 assert.deepEqual(rows.map(r=>({id:r.change_id,relation:r.relation,key:r.row_key})).sort((a,b)=>a.id.localeCompare(b.id)),expected)
 assert.equal((await childRun(f,f.session)).state,'completed')
 rows=await f.producerRpc('reconciliation',[f.producer,'runtime-a'])
 assert.ok(rows.every(r=>r.acknowledged&&r.input_hash&&r.output_hash))
 await f.admin("update public.articles set title='Synthetic corrected title' where id=(select id from public.articles order by id limit 1)")
 const second=await f.producerRpc('capture_delta',[randomUUID(),f.producer,'runtime-a'])
 assert.ok(second&&second!==first)
 rows=await f.producerRpc('reconciliation',[f.producer,'runtime-a'])
 assert.equal(rows.length,backlog+1)
 const delta=rows.find(r=>r.kind==='delta')
 assert.ok(delta.before_hash!==delta.after_hash&&delta.generation_id===second&&!delta.acknowledged)
 assert.ok(rows.filter(r=>r.kind==='backlog').every(r=>r.generation_id===first&&r.acknowledged))
 assert.equal((await childRun(f,await f.issue())).state,'completed')
 assert.equal(await f.producerRpc('capture_delta',[randomUUID(),f.producer,'runtime-a']),null)
 rows=await f.producerRpc('reconciliation',[f.producer,'runtime-a'])
 assert.ok(rows.every(r=>r.acknowledged))
})
test('rolled-back source edits leave no delta; truncate and worker self-produced changes are denied',async t=>{
 const f=await fixture(t);await f.admin('select mip_identity.capture_backlog()')
 const before=await f.admin('select count(*) from mip_identity.source_changes')
 await f.admin("begin;update public.articles set title='rolled back';rollback;")
 assert.equal(await f.admin('select count(*) from mip_identity.source_changes'),before)
 await assert.rejects(f.admin('truncate public.articles'),/mip_database_denied/)
 await assert.rejects(raw(f.db,"set session authorization "+workerRole+";insert into mip_identity.source_changes(source,relation_name,row_key,kind,transaction_id) values('source','fake','fake','delta','fake')"),/mip_database_denied/)
})

async function observedWait(f,label){
 for(let i=0;i<100;i++){
  if(await f.admin("select exists(select 1 from pg_stat_activity where application_name="+q(label)+" and cardinality(pg_blocking_pids(pid))>0)")==='t')return
  await new Promise(r=>setTimeout(r,20))
 }
 throw Error('mip_expected_lock_not_observed')
}
async function sleeping(f,label){
 for(let i=0;i<100;i++){
  if(await f.admin("select exists(select 1 from pg_stat_activity where application_name="+q(label)+" and wait_event='PgSleep')")==='t')return
  await new Promise(r=>setTimeout(r,20))
 }
 throw Error('mip_barrier_not_reached')
}
for(const entity of ['key','mapping','source','implementation'])for(const first of ['acceptance','revocation'])test(entity+' '+first+' first serializes sensitive acceptance',async t=>{
 const f=await fixture(t);await f.capture();const j=await claim(f)
 const args=[randomUUID(),f.session,'runtime-a',j.generation_id,j.lease_token,j.input_hash,j.implementation_ref,{}].map(q).join(',')
 const completeSQL='select mip_identity.worker_complete('+args+');'
 const revokeSQL=entity==='source'?"select comparison_qualification.revoke_source_scope('runtime-a','source');":entity==='implementation'?"select comparison_qualification.revoke_evaluated_implementation('runtime-a','isolated-event-projection-candidate');":entity==='key'?'update mip_identity.key_heads set active=false;':"update mip_identity.mapping_heads set active=false where runtime='runtime-a' and principal="+q(workerRole)+";"
 if(first==='acceptance'){
  const accepting=f.admin("begin;set application_name='mip_accept';set local role "+workerRole+";"+completeSQL+"select pg_sleep(2);commit;")
  await sleeping(f,'mip_accept')
  const revoking=f.admin("set application_name='mip_revoke';"+revokeSQL)
  await observedWait(f,'mip_revoke')
  assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'0')
  await accepting;await revoking
  assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'1')
 }else{
  const revoking=f.admin("begin;set application_name='mip_revoke';"+revokeSQL+"select pg_sleep(2);commit;")
  await sleeping(f,'mip_revoke')
  const accepting=f.admin("set application_name='mip_accept';set session authorization "+workerRole+";"+completeSQL)
  // Attach the rejection handler immediately; the result contains only a redacted code.
  const denied=assert.rejects(accepting,/mip_identity_(key|mapping)_revoked/)
  await observedWait(f,'mip_accept')
  await revoking;await denied
  assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'0')
  assert.equal(await f.admin("select count(*) from comparison_qualification.request_runs where rpc_name='worker_complete'"),'0')
  assert.equal(await f.admin('select state from comparison_qualification.jobs'),'processing')
 }
})
test('retired key/mapping revisions cannot be restored and old sessions cannot follow a replacement mapping',async t=>{
 const f=await fixture(t)
 await f.admin("update mip_identity.mapping_heads set active=false where runtime='runtime-a' and principal="+q(workerRole))
 await assert.rejects(f.admin("update mip_identity.mapping_heads set active=true where runtime='runtime-a' and principal="+q(workerRole)),/mip_identity_fresh_revision_required/)
 const revision=randomUUID()
 await f.admin('insert into mip_identity.mapping_versions select '+q(revision)+",runtime,principal,issuer,audience,subject,key_revision,max_lifetime_seconds,'synthetic-fresh-approval' from mip_identity.mapping_versions where revision="+q(f.mappings['runtime-a'+workerRole])+";update mip_identity.mapping_heads set revision="+q(revision)+",active=true where runtime='runtime-a' and principal="+q(workerRole))
 await assert.rejects(claim(f),/mip_identity_stale_revision/)
 assert.ok(await f.issue())
 await f.admin('update mip_identity.key_heads set active=false')
 await assert.rejects(f.admin('update mip_identity.key_heads set active=true'),/mip_identity_fresh_revision_required/)
})
test('finite eligible sources receive turns despite an out-of-scope backlog and busy source',async t=>{
 const f=await fixture(t)
 await f.admin("select comparison_qualification.bind_source_scope('runtime-a','second')")
 for(let i=0;i<6;i++)await f.admin("select comparison_qualification.enqueue('source','{}','isolated-event-projection-candidate',clock_timestamp())")
 await f.admin("select comparison_qualification.enqueue('second','{}','isolated-event-projection-candidate',clock_timestamp());select comparison_qualification.enqueue('foreign','{}','isolated-event-projection-candidate',clock_timestamp());")
 const first=await claim(f),second=await claim(f)
 assert.equal(first.source_project,'source');assert.equal(second.source_project,'second')
 assert.equal(await f.admin("select j.state from comparison_qualification.jobs j join comparison_qualification.generations g on g.id=j.generation_id where g.source_project='foreign'"),'pending')
})

const publisherRole='mip_projection_publisher_v1'
async function publicationFixture(t){
 const f=await fixture(t)
 await f.admin("alter table public.articles add column reader_state text;alter table public.articles add column source_status text;update public.articles set reader_state='eligible',source_status='active';")
 // Structural relationship fixtures. These do not claim production policy approval.
 for(const name of ['claims','article_claims','claim_evidence_links','claim_corrections','explanations','story_arcs','nodes','edges','arc_events','arc_milestones','arc_membership_candidates'])
  await f.admin('create table public.'+name+'(id uuid primary key,payload jsonb not null);')
 await f.admin(await readFile(new URL('../../supabase/qualification/mip-cutover-authority/007_survivor_release.sql',import.meta.url),'utf8'))
 await f.admin('select mip_identity.install_survivor_fences()')
 const policy=randomUUID()
 await f.admin('insert into mip_identity.publication_policy_versions values('+q(policy)+",'synthetic-privacy-policy','synthetic-rights-policy','synthetic-publication-policy','survivor-reader-v1','synthetic-policy-owner');insert into mip_identity.publication_policy_heads values(true,"+q(policy)+",true);")
 const mr=randomUUID()
 await f.admin('insert into mip_identity.mapping_versions select '+q(mr)+",runtime,"+q(publisherRole)+",issuer,audience,runtime||':"+publisherRole+"',key_revision,max_lifetime_seconds,'synthetic-publication-owner' from mip_identity.mapping_versions where revision="+q(f.mappings['runtime-a'+workerRole])+";insert into mip_identity.mapping_heads values('runtime-a',"+q(publisherRole)+","+q(mr)+",true);")
 await f.capture();assert.equal((await childRun(f,f.session)).state,'completed')
 const data=JSON.parse(await f.admin("select jsonb_build_object('generation',g.id,'input',g.input_payload,'input_hash',g.input_hash,'output',o.output_payload,'output_hash',o.output_hash) from comparison_qualification.generations g join comparison_qualification.outputs o on o.generation_id=g.id"))
 const evidence=data.output.projection.article_claims.map(ac=>{
  const a=data.input.eventInputs.flatMap(e=>e.members).find(m=>m.article.id===ac.article_id).article
  const field=['title','summary','body_text'].find(k=>typeof a[k]==='string'&&a[k].includes(ac.surface_text))
  assert.ok(field,'synthetic surface must be retained exactly')
  return {article_id:ac.article_id,claim_key:ac.claim_key,field,excerpt:ac.surface_text,field_hash:createHash('sha256').update(a[field]).digest('hex'),auditability_state:'verified_retained_source'}
 })
 const explanations=data.output.projection.explanations.map(x=>({...x,review_status:'published',falsification_condition:'Synthetic fixture: contradictory retained source invalidates this statement.',archived_sources:evidence.map(e=>({status:'retained',field_hash:e.field_hash,article_id:e.article_id}))}))
 async function review(overrides={}){
  const r={revision:randomUUID(),generation_id:data.generation,input_hash:data.input_hash,output_hash:data.output_hash,policy_revision:policy,privacy_status:'eligible',rights_status:'eligible',evidence,explanations,relationship_context:null,valid_until:'2999-01-01',policy_ref:'synthetic-owner-policy-not-production',authorization_ref:'synthetic-explicit-review',...overrides}
  await f.admin('insert into mip_identity.publication_reviews('+Object.keys(r).join(',')+') values('+Object.entries(r).map(([key,value])=>key==='relationship_context'?'mip_identity.survivor_context()':q(value)).join(',')+');insert into mip_identity.publication_review_heads values('+[data.generation,r.revision,true].map(q).join(',')+') on conflict(generation_id) do update set revision=excluded.revision,active=true;')
  return r.revision
 }
 const session=await f.issue('runtime-a',publisherRole),rpc=transport(f.db,publisherRole)
 return {...f,data,policy,evidence,explanations,review,publisher:session,pub:rpc,stage:r=>rpc('stage_review',[session,'runtime-a',r]),release:(r,request=randomUUID())=>rpc('release_isolated',[request,session,'runtime-a',r])}
}
test('authoritative synthetic review stages immutable payload and releases only into private isolated receipt',async t=>{
 const f=await publicationFixture(t),revision=await f.review(),request=randomUUID()
 assert.equal(await f.release(revision,request),'isolated_released')
 assert.equal(await f.release(revision,request),'isolated_released')
 assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'1')
 assert.equal(await f.admin("select count(*) from comparison_qualification.outputs where output_payload#>>'{projection,explanations,0,review_status}'='awaiting_review'"),'1')
 assert.equal(await f.admin("select count(*) from mip_cutover_authority.approved_payloads where payload#>>'{projection,explanations,0,review_status}'='published'"),'1')
 await assert.rejects(f.admin('select mip_identity.release_public()'),/mip_public_release_disabled/)
 for(const sql of ['select * from mip_identity.publication_reviews','select * from mip_identity.private_releases',"select mip_identity.stage_review(gen_random_uuid(),'runtime-a',gen_random_uuid())","insert into mip_identity.publication_review_heads values(gen_random_uuid(),gen_random_uuid(),true)"])
  await assert.rejects(raw(f.db,'set session authorization '+workerRole+';'+sql),/mip_database_denied/)
 for(const role of ['anon','authenticated','service_role'])
  await assert.rejects(raw(f.db,'set session authorization '+role+';select * from mip_identity.private_releases'),/mip_database_denied/)
})
test('missing privacy, rights, evidence, review and expired authority all fail closed',async t=>{
 const f=await publicationFixture(t)
 for(const overrides of [{privacy_status:'unknown'},{rights_status:'ineligible'},{evidence:[]},{explanations:[]},{valid_until:'2000-01-01'},{evidence:f.evidence.map(e=>({...e,field_hash:'wrong'}))},{explanations:f.explanations.map(x=>({...x,falsification_condition:'missing: review'}))}]){
  const r=await f.review(overrides)
  await assert.rejects(f.release(r),/mip_publication_/)
 }
 assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'0')
 assert.equal(await f.admin('select count(*) from mip_cutover_authority.approved_payloads'),'0')
})
test('source/topology/relationship mutations invalidate staging; rollback leaves prior authorization intact',async t=>{
 const f=await publicationFixture(t),r=await f.review()
 await f.stage(r)
 await f.admin("begin;insert into public.nodes values(gen_random_uuid(),'{\"synthetic\":true}');rollback;")
 assert.equal(await f.release(r),'isolated_released')
 await f.admin("insert into public.nodes values(gen_random_uuid(),'{\"synthetic\":true}')")
 await assert.rejects(f.release(r),/mip_publication_stale_source/)
 assert.ok(Number(await f.admin("select count(*) from mip_cutover_authority.dependency_heads h join mip_cutover_authority.dependency_versions v on v.id=h.version_id where v.state='revoked'"))>0)
 const fresh=await f.review()
 assert.equal(await f.release(fresh),'isolated_released')
 await assert.rejects(f.admin('update mip_identity.publication_review_heads set revision='+q(r)),/mip_identity_fresh_revision_required/)
 await f.admin('delete from public.event_articles where ctid=(select ctid from public.event_articles limit 1)')
 await assert.rejects(f.release(fresh),/mip_publication_stale_source/)
})
for(const first of ['release','mutation'])test('publication '+first+' first fences retained relationship mutation',async t=>{
 const f=await publicationFixture(t),r=await f.review()
 const releaseSQL='set local role '+publisherRole+';select mip_identity.release_isolated('+[randomUUID(),f.publisher,'runtime-a',r].map(q).join(',')+');'
 const changeSQL="insert into public.story_arcs values(gen_random_uuid(),'{\"synthetic\":true}');"
 if(first==='release'){
  const releasing=f.admin("begin;set application_name='mip_release';"+releaseSQL+"select pg_sleep(2);commit;")
  await sleeping(f,'mip_release')
  const mutating=f.admin("set application_name='mip_mutation';"+changeSQL)
  await observedWait(f,'mip_mutation');await releasing;await mutating
  assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'1')
  await assert.rejects(f.release(r),/mip_publication_stale_source/)
 }else{
  const mutating=f.admin("begin;set application_name='mip_mutation';"+changeSQL+"select pg_sleep(2);commit;")
  await sleeping(f,'mip_mutation')
  const releasing=f.admin("begin;set application_name='mip_release';"+releaseSQL+'commit;')
  const denied=assert.rejects(releasing,/mip_publication_stale_source/)
  await observedWait(f,'mip_release');await mutating;await denied
  assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'0')
  assert.equal(await f.admin('select count(*) from mip_cutover_authority.approved_payloads'),'0')
 }
})

test('current policy revision is required; withdrawal cannot resurrect old review or payload',async t=>{
 const f=await publicationFixture(t),r=await f.review()
 await f.stage(r)
 await f.admin('update mip_identity.publication_policy_heads set active=false')
 await assert.rejects(f.release(r),/mip_publication_policy_revoked/)
 await assert.rejects(f.admin('update mip_identity.publication_policy_heads set active=true'),/mip_identity_fresh_revision_required/)
 const freshPolicy=randomUUID()
 await f.admin('insert into mip_identity.publication_policy_versions select '+q(freshPolicy)+",privacy_rule_ref,rights_rule_ref,publication_rule_ref,adapter_ref,'synthetic-new-policy-approval' from mip_identity.publication_policy_versions where revision="+q(f.policy)+";update mip_identity.publication_policy_heads set revision="+q(freshPolicy)+",active=true;")
 await assert.rejects(f.release(r),/mip_publication_policy_revoked/)
 const newReview=await f.review({policy_revision:freshPolicy})
 assert.equal(await f.release(newReview),'isolated_released')
 assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'1')
})

test('retained evidence links and corrections require admitted same-event sources and remain in approved payload',async t=>{
 const f=await publicationFixture(t),c=f.data.output.projection.claims[0],e=f.evidence[0],id=randomUUID(),link=randomUUID(),correction=randomUUID()
 await f.admin("alter table public.claims add column event_id text,add column canonical_text text,add column status text,add column rule_version text;alter table public.claim_evidence_links add column claim_id text,add column linked_from_article_id text,add column evidence_url text;alter table public.claim_corrections add column claim_id text,add column correcting_article_id text,add column correction_text text;")
 await f.admin("insert into public.claims values("+[id,{},c.event_id,c.canonical_text,'active','sc-v2-event-projection'].map(q).join(',')+");insert into public.claim_evidence_links values("+[link,{},id,e.article_id,'https://isolated.invalid/retained'].map(q).join(',')+");insert into public.claim_corrections values("+[correction,{},id,e.article_id,'Synthetic explicit correction'].map(q).join(',')+");")
 const r=await f.review();assert.equal(await f.release(r),'isolated_released')
 assert.equal(await f.admin("select jsonb_array_length(payload->'corrections') from mip_cutover_authority.approved_payloads"),'1')
 assert.equal(await f.admin("select jsonb_array_length(payload->'evidence_links') from mip_cutover_authority.approved_payloads"),'1')
 await f.admin('update public.claim_corrections set correcting_article_id='+q(randomUUID()))
 const badCorrection=await f.review()
 await assert.rejects(f.release(badCorrection),/mip_publication_correction_ineligible/)
 await f.admin('update public.claim_corrections set correcting_article_id='+q(e.article_id)+';update public.claim_evidence_links set linked_from_article_id='+q(randomUUID()))
 const badLink=await f.review()
 await assert.rejects(f.release(badLink),/mip_publication_link_ineligible/)
 assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'1')
})

test('fresh review cannot override withdrawn topology or a missing source fence',async t=>{
 const f=await publicationFixture(t)
 await f.admin("alter table public.nodes add column state text;insert into public.nodes values(gen_random_uuid(),'{}','withdrawn')")
 const r=await f.review()
 await assert.rejects(f.release(r),/mip_publication_dependency_ineligible/)
 await f.admin("delete from public.nodes;alter table public.nodes disable trigger survivor_mutation_lock")
 await assert.rejects(f.review(),/mip_survivor_relation_or_fence_missing/)
})

test('frozen v15/v16 handler and retained worker compute the same exact deduplicated synthetic projection',async t=>{
 const f=await fixture(t),legacy=await runner()
 const tables=JSON.parse(await f.admin("select jsonb_build_object('events',(select jsonb_agg(to_jsonb(e)) from public.events e),'articles',(select jsonb_agg(to_jsonb(a)) from public.articles a),'event_articles',(select jsonb_agg(to_jsonb(m)) from public.event_articles m),'pipeline_config',(select jsonb_agg(to_jsonb(c)) from public.pipeline_config c))"))
 const db=fakeDatabase(tables)
 const prepared=await legacy.buildEventInputs(db)
 assert.equal(prepared.inputs.length,1)
 // Both paths use the same frozen lexicon and existing config; no F2 values invented.
 const lexicon=JSON.parse(await readFile(new URL('../../supabase/runtime-snapshots/source-comparison-run-v16/loadedLanguageLexicon.json',import.meta.url),'utf8'))
 await f.admin('update mip_cutover_authority.runtime_config set lexicon='+q(lexicon))
 await f.capture();assert.equal((await childRun(f,f.session)).state,'completed')
 const actual=JSON.parse(await f.admin('select output_payload from comparison_qualification.outputs')).projection
 const result=await legacy.rebuildProjection(db,comparisonProjectionConfig(tables.pipeline_config),false)
 assert.ok(!result.error)
 assert.deepEqual(tables.claims.map(({id,...r})=>r),actual.claims.map(({claim_key,...r})=>r))
 assert.deepEqual(tables.article_claims.map(r=>({article_id:r.article_id,surface_text:r.surface_text,extraction_confidence:r.extraction_confidence})),actual.article_claims.map(r=>({article_id:r.article_id,surface_text:r.surface_text,extraction_confidence:r.extraction_confidence})))
 assert.deepEqual(tables.explanations.map(({id,recomputed_at,...r})=>r),actual.explanations)
 assert.equal(await f.admin("select count(*) from comparison_qualification.jobs where state='completed'"),'1')
})
test('frozen scheduled runner acknowledges a newly arrived pending row; generation reconciliation leaves later delta pending',async t=>{
 const f=await fixture(t),legacy=await runner()
 const tables=JSON.parse(await f.admin("select jsonb_build_object('events',(select jsonb_agg(to_jsonb(e)) from public.events e),'articles',(select jsonb_agg(to_jsonb(a)) from public.articles a),'event_articles',(select jsonb_agg(to_jsonb(m)) from public.event_articles m),'pipeline_config',(select jsonb_agg(to_jsonb(c)) from public.pipeline_config c))"))
 const early=randomUUID(),late=randomUUID()
 tables.source_comparison_enrichment_queue=[{id:early,state:'pending'}]
 let added=false
 const db=fakeDatabase(tables,{afterRead:table=>{if(table==='articles'&&!added){added=true;tables.source_comparison_enrichment_queue.push({id:late,state:'pending'})}}})
 legacy.setClient(db)
 const response=await legacy.invoke(new Request('https://isolated.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-fixture','content-type':'application/json'},body:JSON.stringify({trigger:'pg_cron'})}))
 assert.equal(response.status,200)
 assert.deepEqual(tables.source_comparison_enrichment_queue.map(r=>[r.id,r.state]),[[early,'succeeded'],[late,'succeeded']])
 await f.admin('select mip_identity.capture_backlog()')
 await f.producerRpc('capture_delta',[randomUUID(),f.producer,'runtime-a'])
 await f.admin("update public.articles set title='Synthetic later delta' where id=(select id from public.articles order by id limit 1)")
 assert.equal((await childRun(f,f.session)).state,'completed')
 const rows=await f.producerRpc('reconciliation',[f.producer,'runtime-a'])
 assert.ok(rows.filter(r=>r.kind==='backlog').every(r=>r.acknowledged))
 assert.ok(rows.filter(r=>r.kind==='delta').every(r=>!r.acknowledged&&r.generation_id===null))
})
test('frozen mutable rebuild can delete old output before failure; retained worker failure preserves prior generation',async t=>{
 const f=await fixture(t),legacy=await runner()
 const tables=JSON.parse(await f.admin("select jsonb_build_object('events',(select jsonb_agg(to_jsonb(e)) from public.events e),'articles',(select jsonb_agg(to_jsonb(a)) from public.articles a),'event_articles',(select jsonb_agg(to_jsonb(m)) from public.event_articles m),'pipeline_config',(select jsonb_agg(to_jsonb(c)) from public.pipeline_config c))"))
 const old=randomUUID();tables.claims=[{id:old,rule_version:'sc-v2-event-projection'}]
 tables.article_claims=[{id:randomUUID(),claim_id:old}];tables.claim_evidence_links=[];tables.explanations=[]
 const db=fakeDatabase(tables,{failInsert:'article_claims'})
 const result=await legacy.rebuildProjection(db,comparisonProjectionConfig(tables.pipeline_config),false)
 assert.match(result.error,/article_claims insert failed/)
 assert.ok(!tables.claims.some(r=>r.id===old));assert.equal(tables.article_claims.length,0)
 await f.capture();assert.equal((await childRun(f,f.session)).state,'completed')
 await f.admin("update public.pipeline_config set value='\"invalid\"'::jsonb")
 await f.capture();assert.equal((await childRun(f,await f.issue())).state,'failed')
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'1')
 assert.equal(await f.admin("select count(*) from comparison_qualification.jobs where state='failed'"),'1')
})

for(const entity of ['source','implementation'])test(entity+' revocation after process loss retains work and requires fresh approved mapping',async t=>{
 const f=await fixture(t);await f.capture()
 const killed=await childRun(f,f.session,{killAfter:'worker_complete'})
 const key=killed.keys.find(k=>k.startsWith('worker_complete:')&&!k.endsWith(':receipt'))
 const revoke=entity==='source'?"select comparison_qualification.revoke_source_scope('runtime-a','source')":"select comparison_qualification.revoke_evaluated_implementation('runtime-a','isolated-event-projection-candidate')"
 await f.admin(revoke)
 await assert.rejects(f.journal(f.session).get(key),/mip_identity_mapping_revoked/)
 await assert.rejects(f.issue(),/mip_identity_mapping_revoked/)
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'1')
 const bind=entity==='source'?"select comparison_qualification.bind_source_scope('runtime-a','source')":"select comparison_qualification.bind_evaluated_implementation('runtime-a','isolated-event-projection-candidate')"
 await f.admin(bind)
 await assert.rejects(f.issue(),/mip_identity_mapping_revoked/)
})
test('identity expiry while completion waits rolls back output acknowledgement and receipt',async t=>{
 const f=await fixture(t);await f.capture();const j=await claim(f)
 const block=f.admin("begin;set application_name='mip_expiry_holder';select 1 from comparison_qualification.jobs where generation_id="+q(j.generation_id)+" for update;select pg_sleep(4);commit;")
 await sleeping(f,'mip_expiry_holder')
 const session=await f.issue('runtime-a',workerRole,{token:f.token('runtime-a',workerRole,{exp:Math.floor(Date.now()/1000)+2})})
 const attempt=f.rpc('worker_complete',[randomUUID(),session,'runtime-a',j.generation_id,j.lease_token,j.input_hash,j.implementation_ref,{}])
 const denied=assert.rejects(attempt,/mip_identity_expired|mip_session_expired|mip_session_invalid|mip_authz_stale_session/)
 await block;await denied
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'0')
 assert.equal(await f.admin("select count(*) from comparison_qualification.request_runs where rpc_name='worker_complete'"),'0')
 assert.equal(await f.admin('select state from comparison_qualification.jobs'),'processing')
})

test('collector rejects generation capture for a different configured source atomically',async t=>{
 const f=await fixture(t);await f.admin('select mip_identity.capture_backlog()')
 await f.admin("select comparison_qualification.bind_source_scope('runtime-a','different');update mip_cutover_authority.runtime_config set source='different' where runtime_id='runtime-a';")
 await assert.rejects(f.producerRpc('capture_delta',[randomUUID(),f.producer,'runtime-a']),/mip_collector_source_mismatch/)
 assert.equal(await f.admin('select count(*) from comparison_qualification.generations'),'0')
 assert.equal(await f.admin('select count(*) from mip_identity.generation_changes'),'0')
 assert.ok(Number(await f.admin('select count(*) from mip_identity.source_changes'))>0)
})

test('finite-source fairness bounds successful claims while every eligible source remains busy',async t=>{
 const f=await fixture(t),sources=['source','second','third']
 for(const source of sources){
  if(source!=='source')await f.admin('select comparison_qualification.bind_source_scope(\'runtime-a\','+q(source)+')')
  for(let i=0;i<4;i++)await f.admin('select comparison_qualification.enqueue('+q(source)+", '{}','isolated-event-projection-candidate',clock_timestamp())")
 }
 const observed=[]
 for(let i=0;i<9;i++)observed.push((await claim(f)).source_project)
 for(let i=0;i<observed.length;i+=3)assert.deepEqual([...new Set(observed.slice(i,i+3))].sort(),[...sources].sort())
 // Bound is successful serialized claims for finite unlocked eligible sources.
 // No wall-clock, locked-row, infinite-arrival or cross-runtime starvation claim.
})

test('remote PostgreSQL service restart preserves committed encrypted journal and exact completion recovery',async t=>{
 const f=await fixture(t);await f.capture()
 const killed=await childRun(f,f.session,{killAfter:'worker_complete'})
 const key=killed.keys.find(k=>k.startsWith('worker_complete:')&&!k.endsWith(':receipt'))
 const before=await f.admin('select md5(envelope::text) from mip_identity.journal where entry_key='+q(key))
 assert.equal(await f.admin('show synchronous_commit'),'on')
 assert.equal(await f.admin('show fsync'),'on')
 await restartRemoteStore()
 assert.ok(await f.admin('select md5(envelope::text) from mip_identity.journal where entry_key='+q(key))===before)
 assert.equal((await childRun(f,await f.issue(),{key})).state,'completed')
 assert.equal(await f.admin('select count(*) from comparison_qualification.outputs'),'1')
 assert.equal(await f.admin("select count(*) from comparison_qualification.request_runs where rpc_name='worker_complete'"),'1')
})

async function operationFixture(t){
 const f=await publicationFixture(t)
 await f.admin(await readFile(new URL('../../supabase/qualification/mip-cutover-authority/008_operation_evidence.sql',import.meta.url),'utf8'))
 // Exactly retained PostgreSQL JSONB digest; no JS numeric/string round-trip for source hashes.
 const scopes=JSON.parse(await f.admin("select jsonb_agg(distinct jsonb_build_object('source_project',g.source_project,'material_ref','article:'||(m.value#>>'{article,id}'),'material_version',comparison_qualification.argument_digest(m.value->'article'),'operation',op,'audience','isolated_internal_review','domain',d)) from comparison_qualification.generations g cross join lateral jsonb_array_elements(g.input_payload->'eventInputs') e cross join lateral jsonb_array_elements(e.value->'members') m cross join unnest(array['retention','analysis','excerpt_display']) op cross join unnest(array['rights','privacy']) d where g.id="+q(f.data.generation)))
 const check=s=>f.admin('select mip_identity.operation_check('+q(s)+')').then(JSON.parse)
 async function evidence(scope,override={}){
  const row={revision:randomUUID(),scope,authority_adapter:'synthetic-fixture-v1',source_ref:'synthetic://policy',source_version:'synthetic-v1',source_hash:'a'.repeat(64),evidence_ref:'synthetic://receipt',approval_owner_ref:'synthetic-fixture-owner',approval_record_ref:'synthetic://approval',approval_status:'recorded',disposition:'allow',effective_at:'2000-01-01',expires_at:'2999-01-01',conditions:[],synthetic:true,...override}
  await f.admin('insert into mip_identity.operation_evidence_versions('+Object.keys(row).join(',')+') values('+Object.values(row).map(q).join(',')+');insert into mip_identity.operation_evidence_heads values('+[scope,row.revision,true].map(q).join(',')+') on conflict(scope) do update set revision=excluded.revision,active=true;')
  return row.revision
 }
 const seed=async()=>{for(const s of scopes) await evidence(s)}
 return {...f,scopes,check,evidence,seed}
}
test('operation adapter denies actual/unbound records and synthetic review flags without evidence',async t=>{
 const f=await operationFixture(t),r=await f.review()
 assert.equal((await f.check(f.scopes[0])).reason,'missing_operation_evidence')
 await assert.rejects(f.release(r),/mip_operation_denied_missing_operation_evidence/)
 assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'0')
 assert.equal(await f.admin('select count(*) from mip_cutover_authority.approved_payloads'),'0')
 await f.evidence(f.scopes[0],{synthetic:false,authority_adapter:'unverified-source-register'})
 assert.equal((await f.check(f.scopes[0])).reason,'authoritative_adapter_unbound')
})
test('rights and privacy permissions do not transfer between seven operations, audiences, versions or projects',async t=>{
 const f=await operationFixture(t),base={...f.scopes[0],operation:'ingestion',domain:'rights'}
 await f.evidence(base)
 assert.equal((await f.check(base)).reason,'synthetic_mechanism_only')
 for(const op of ['retention','analysis','excerpt_display','full_content_display','redistribution','external_model_disclosure'])
  assert.equal((await f.check({...base,operation:op})).allowed,false)
 for(const delta of [{domain:'privacy'},{audience:'public'},{material_version:'stale'},{source_project:'cross-runtime-source'},{material_ref:'article:other'}])
  assert.equal((await f.check({...base,...delta})).allowed,false)
})
test('operation adapter gives inspectable reasons for unsupported, expired, conflicting and conditional evidence',async t=>{
 const f=await operationFixture(t),s=f.scopes[0]
 for(const [override,reason] of [
  [{approval_status:'proposed'},'approval_proposed'],[{approval_status:'missing'},'approval_missing'],
  [{approval_status:'conflicting'},'approval_conflicting'],[{disposition:'unknown'},'permission_unknown'],
  [{disposition:'conflicting'},'permission_conflicting'],[{disposition:'withdrawn'},'permission_withdrawn'],
  [{disposition:'deny'},'permission_deny'],[{expires_at:'2001-01-01'},'permission_expired'],
  [{effective_at:'2998-01-01'},'permission_not_effective'],[{source_hash:'url-is-not-a-hash'},'unsupported_evidence_reference'],
  [{approval_record_ref:''},'unsupported_evidence_reference'],
  [{conditions:[{status:'pending',evidence_ref:'synthetic://attribution'}]},'unfulfilled_permission_condition'],
  [{conditions:[{status:'verified'}]},'unfulfilled_permission_condition']
 ]){
  await f.evidence(s,override);assert.equal((await f.check(s)).reason,reason)
 }
})
test('synthetic operation closure stages privately; workers and broad roles cannot attest permission state',async t=>{
 const f=await operationFixture(t);await f.seed();const r=await f.review()
 assert.equal(await f.release(r),'isolated_released')
 assert.equal(await f.admin('select count(*) from mip_identity.review_operation_bindings'),'1')
 await assert.rejects(f.admin('select mip_identity.release_public()'),/mip_public_release_disabled/)
 for(const role of [workerRole,producerRole,publisherRole,'anon','authenticated','service_role']){
  for(const sql of ["update mip_identity.operation_evidence_heads set active=true","select * from mip_identity.operation_evidence_versions","select mip_identity.operation_check('{}')"])
   await assert.rejects(raw(f.db,'set session authorization '+role+';'+sql),/mip_database_denied/)
 }
 assert.equal(await f.admin("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_identity' and c.relname like '%operation%' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)"),'0')
 await assert.rejects(f.admin("update mip_identity.operation_evidence_versions set disposition='deny'"),/mip_|immutable|append/i)
})
test('permission withdrawal requires fresh decision and review; retired revisions and old payload cannot resurrect',async t=>{
 const f=await operationFixture(t);await f.seed();const r=await f.review();await f.stage(r)
 const s=f.scopes[0],old=(await f.check(s)).revision
 await f.admin('update mip_identity.operation_evidence_heads set active=false where scope='+q(s))
 await assert.rejects(f.release(r),/mip_operation_denied_revoked_operation_evidence/)
 await assert.rejects(f.admin('update mip_identity.operation_evidence_heads set active=true where scope='+q(s)),/mip_identity_fresh_revision_required/)
 await f.evidence(s)
 await assert.rejects(f.release(r),/mip_operation_fresh_review_required/)
 await assert.rejects(f.admin('update mip_identity.operation_evidence_heads set revision='+q(old)+' where scope='+q(s)),/mip_identity_fresh_revision_required/)
 assert.equal(await f.release(await f.review()),'isolated_released')
})
for(const first of ['release','revocation'])test('operation '+first+' first serializes permission revocation with private release',async t=>{
 const f=await operationFixture(t);await f.seed();const r=await f.review()
 const releasingSQL='set local role '+publisherRole+';select mip_identity.release_isolated('+[randomUUID(),f.publisher,'runtime-a',r].map(q).join(',')+');'
 const revokingSQL='update mip_identity.operation_evidence_heads set active=false where scope='+q(f.scopes[0])+';'
 if(first==='release'){
  const releasing=f.admin("begin;set application_name='mip_op_release';"+releasingSQL+"select pg_sleep(2);commit;")
  await sleeping(f,'mip_op_release')
  const revoking=f.admin("set application_name='mip_op_revoke';"+revokingSQL)
  await observedWait(f,'mip_op_revoke');await releasing;await revoking
  assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'1')
  await assert.rejects(f.release(r),/mip_operation_denied_revoked_operation_evidence/)
 }else{
  const revoking=f.admin("begin;set application_name='mip_op_revoke';"+revokingSQL+"select pg_sleep(2);commit;")
  await sleeping(f,'mip_op_revoke')
  const releasing=f.admin("begin;set application_name='mip_op_release';"+releasingSQL+"commit;")
  const denied=assert.rejects(releasing,/mip_operation_denied_revoked_operation_evidence/)
  await observedWait(f,'mip_op_release');await revoking;await denied
  assert.equal(await f.admin('select count(*) from mip_identity.private_releases'),'0')
  assert.equal(await f.admin('select count(*) from mip_cutover_authority.approved_payloads'),'0')
  assert.equal(await f.admin('select count(*) from mip_identity.review_operation_bindings'),'0')
 }
})

async function factualFixture(t){
 const f=await operationFixture(t)
 await f.admin("alter table public.explanations add column assertion_id text,add column version int not null default 1,add column is_current boolean not null default true,add column source_ids uuid[] not null default '{}',add column review_status text not null default 'awaiting_review',add column state text not null default 'ok',add column supporting_passage text,add column falsification_condition text,add column archived_sources jsonb,add column rule_version text;")
 await f.admin(await readFile(new URL('../../supabase/qualification/mip-cutover-authority/009_factual_enforcement.sql',import.meta.url),'utf8'))
 // Disposable remote connection is outside worker scope. Never print connection strings.
 const auditRole='mip_audit_'+randomUUID().replaceAll('-',''),password=randomUUID()
 await f.admin('create role '+auditRole+' login password '+q(password)+';grant usage on schema mip_factual to '+auditRole+';grant insert on mip_factual.rejection_audit to '+auditRole+';create policy audit_sink on mip_factual.rejection_audit for insert to '+auditRole+' with check(true);')
 await f.admin('insert into mip_factual.audit_connection values(true,'+q('host=127.0.0.1 port=5432 dbname='+f.db+' user='+auditRole+' password='+password+' connect_timeout=3 options=-csynchronous_commit=on')+');')
 const explanationIds=[],sourceIds=[...new Set(f.data.input.eventInputs.flatMap(e=>e.members.map(m=>m.article.id)))]
 for(const x of f.explanations){
  const id=randomUUID()
  await f.admin('insert into public.explanations(id,payload,assertion_id,source_ids,supporting_passage,falsification_condition,archived_sources,rule_version) values('+[id,{},x.assertion_id].map(q).join(',')+',array['+sourceIds.map(q).join(',')+']::uuid[],'+[x.supporting_passage,x.falsification_condition,x.archived_sources,x.rule_version].map(q).join(',')+');')
  explanationIds.push(id)
 }
 const approve=id=>raw(f.db,'set session authorization mip_factual_reviewer_v3;select mip_factual.review_publish('+q(id)+", 'synthetic-explicit-human-review-fixture');")
 return {...f,explanationIds,sourceIds,approve}
}
test('D4 database rejects publication and autonomous audit survives full outer rollback without sensitive content',async t=>{
 const f=await factualFixture(t),id=f.explanationIds[0]
 await f.admin('update public.explanations set supporting_passage=null where id='+q(id))
 await assert.rejects(f.admin("begin;insert into public.nodes values(gen_random_uuid(),'{\"rollback_marker\":true}');update public.explanations set review_status='published' where id="+q(id)+';commit;'),/mip_factual_rejected_provenance/)
 assert.equal(await f.admin('select count(*) from mip_factual.rejection_audit'),'1')
 assert.equal(await f.admin("select count(*) from public.nodes where payload ? 'rollback_marker'"),'0')
 const audit=JSON.parse(await f.admin('select to_jsonb(a) from mip_factual.rejection_audit a'))
 assert.equal(audit.explanation_id,id);assert.equal(audit.rule,'provenance')
 assert.deepEqual(Object.keys(audit).sort(),['id','explanation_id','assertion_digest','attempted_transition','rule','recorded_at'].sort())
 assert.equal(await f.admin("select count(*) from public.explanations where review_status='published'"),'0')
})
test('D4 requires separate human review, rejects provenance bypass and independently filters malformed published rows',async t=>{
 const f=await factualFixture(t),id=f.explanationIds[0]
 await assert.rejects(f.admin("update public.explanations set review_status='published' where id="+q(id)),/mip_factual_rejected_human_review/)
 await f.approve(id)
 assert.equal(await f.admin('select count(*) from mip_factual.reader_explanations where id='+q(id)),'1')
 // Trusted fixture corrupts a row while only the write guard is disabled, proving independent reader exclusion.
 await f.admin("alter table public.explanations disable trigger factual_publication_guard;update public.explanations set supporting_passage=null where id="+q(id)+";alter table public.explanations enable trigger factual_publication_guard;")
 assert.equal(await f.admin('select count(*) from mip_factual.reader_explanations where id='+q(id)),'0')
})
for(const kind of ['corrected','withdrawn'])test('D5 '+kind+' source preserves history, renews review, skips withdrawn and leaves unrelated assertions unchanged',async t=>{
 const f=await factualFixture(t),id=f.explanationIds[0],source=f.sourceIds[0]
 await f.approve(id)
 const other=randomUUID(),withdrawn=randomUUID()
 await f.admin('insert into public.explanations(id,payload,assertion_id,review_status) values('+q(other)+",'{}','synthetic-unrelated','awaiting_review');insert into public.explanations(id,payload,assertion_id,source_ids,review_status) values("+q(withdrawn)+",'{}','synthetic-already-withdrawn',array["+q(source)+"]::uuid[],'withdrawn');")
 const before=await f.admin('select to_jsonb(e) from public.explanations e where id='+q(other))
 const old=await f.admin('select to_jsonb(e) from public.explanations e where id='+q(id))
 await f.admin('update public.articles set source_status='+q(kind)+' where id='+q(source))
 const fresh=JSON.parse(await f.admin('select to_jsonb(e) from public.explanations e join mip_factual.source_change_links l on l.new_explanation_id=e.id where l.prior_explanation_id='+q(id)))
 assert.equal(fresh.review_status,'awaiting_review');assert.equal(fresh.state,'source_'+kind);assert.equal(fresh.version,2)
 assert.equal(await f.admin('select to_jsonb(e) from public.explanations e where id='+q(other)),before)
 assert.equal(await f.admin('select count(*) from mip_factual.explanation_history where row_data='+q(JSON.parse(old))),'1')
 assert.equal(await f.admin('select count(*) from mip_factual.source_changes where '+q(withdrawn)+'=any(skipped_withdrawn_ids)'),'1')
 assert.equal(await f.admin('select count(*) from mip_factual.reader_explanations where id in ('+[id,fresh.id].map(q).join(',')+')'),'0')
 await f.admin("update public.articles set source_status='active' where id="+q(source))
 await assert.rejects(f.admin("update public.explanations set review_status='published',state='ok' where id="+q(fresh.id)),/mip_factual_rejected_human_review/)
 await assert.rejects(f.approve(id),/mip_factual_fresh_version_required/)
 await f.approve(fresh.id)
 assert.equal(await f.admin('select count(*) from mip_factual.reader_explanations where id='+q(fresh.id)),'1')
})
test('D4 audit unavailability denies publication; audit and reviewer APIs reject worker and broad-role writes',async t=>{
 const f=await factualFixture(t),id=f.explanationIds[0]
 for(const role of [workerRole,producerRole,publisherRole,'anon','authenticated','service_role']){
  for(const sql of ['select * from mip_factual.audit_connection','select * from mip_factual.rejection_audit',"select mip_factual.review_publish("+q(id)+",'forged')","update public.explanations set review_status='published'"])
   await assert.rejects(raw(f.db,'set session authorization '+role+';'+sql),/mip_database_denied/)
 }
 await f.admin("update mip_factual.audit_connection set connection_string='host=127.0.0.1 port=1 connect_timeout=1'")
 await assert.rejects(f.admin("update public.explanations set review_status='published' where id="+q(id)),/mip_audit_unavailable/)
 assert.equal(await f.admin("select count(*) from public.explanations where review_status='published'"),'0')
})
test('D4 D5 integrates with operation-gated staging and disabled public release',async t=>{
 const f=await factualFixture(t);await f.seed()
 await assert.rejects(f.release(await f.review()),/mip_factual_release_ineligible/)
 for(const id of f.explanationIds)await f.approve(id)
 assert.equal(await f.release(await f.review()),'isolated_released')
 await f.admin("update public.articles set source_status='corrected' where id="+q(f.sourceIds[0]))
 assert.equal(await f.admin('select count(*) from mip_factual.reader_explanations'),'0')
 await assert.rejects(f.release(await f.review()),/mip_publication_|mip_factual_|mip_operation_/)
 await assert.rejects(f.admin('select mip_identity.release_public()'),/mip_public_release_disabled/)
})

for(const first of ['review','source'])test('D5 '+first+' first serializes human publication and corrected-source propagation',async t=>{
 const f=await factualFixture(t),id=f.explanationIds[0],source=f.sourceIds[0]
 const reviewSQL='set local role mip_factual_reviewer_v3;select mip_factual.review_publish('+q(id)+",'synthetic-race-review');"
 const sourceSQL="update public.articles set source_status='corrected' where id="+q(source)+';'
 if(first==='review'){
  const reviewing=f.admin("begin;set application_name='mip_factual_review';"+reviewSQL+"select pg_sleep(2);commit;")
  await sleeping(f,'mip_factual_review')
  const changing=f.admin("set application_name='mip_factual_source';"+sourceSQL)
  await observedWait(f,'mip_factual_source');await reviewing;await changing
  assert.equal(await f.admin('select count(*) from mip_factual.reader_explanations'),'0')
  assert.equal(await f.admin('select count(*) from mip_factual.source_changes'),'1')
 }else{
  const changing=f.admin("begin;set application_name='mip_factual_source';"+sourceSQL+"select pg_sleep(2);commit;")
  await sleeping(f,'mip_factual_source')
  const reviewing=f.admin("begin;set application_name='mip_factual_review';"+reviewSQL+"commit;")
  const denied=assert.rejects(reviewing,/mip_factual_fresh_version_required/)
  await observedWait(f,'mip_factual_review');await changing;await denied
  assert.equal(await f.admin('select count(*) from mip_factual.reader_explanations'),'0')
 }
})
test('D5 rolled-back source change leaves source, assertions and source-change audit unchanged',async t=>{
 const f=await factualFixture(t),id=f.explanationIds[0],source=f.sourceIds[0]
 await f.approve(id)
 const before=await f.admin('select to_jsonb(e) from public.explanations e where id='+q(id))
 await f.admin("begin;update public.articles set source_status='withdrawn' where id="+q(source)+";rollback;")
 assert.equal(await f.admin('select to_jsonb(e) from public.explanations e where id='+q(id)),before)
 assert.equal(await f.admin('select count(*) from mip_factual.source_changes'),'0')
 assert.equal(await f.admin('select count(*) from mip_factual.reader_explanations where id='+q(id)),'1')
})
