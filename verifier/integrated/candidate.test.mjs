import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {fork} from 'node:child_process'
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
 const child=fork(new URL('./workerProcess.mjs',import.meta.url),[],{silent:true,env:{}})
 // No broker/database credentials, journal key, or service-role client is passed.
 const journal=f.journal(session),keys=[]
 return new Promise((resolve,reject)=>{
  let killed=false,finished=false
  child.stdout.resume();child.stderr.resume()
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('mip_child_timeout'))},30000)
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
for(const entity of ['key','mapping'])for(const first of ['acceptance','revocation'])test(entity+' '+first+' first serializes sensitive acceptance',async t=>{
 const f=await fixture(t);await f.capture();const j=await claim(f)
 const args=[randomUUID(),f.session,'runtime-a',j.generation_id,j.lease_token,j.input_hash,j.implementation_ref,{}].map(q).join(',')
 const completeSQL='select mip_identity.worker_complete('+args+');'
 const revokeSQL=entity==='key'?'update mip_identity.key_heads set active=false;':"update mip_identity.mapping_heads set active=false where runtime='runtime-a' and principal="+q(workerRole)+";"
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
 for(const name of ['claims','article_claims','claim_evidence_links','claim_corrections','explanations','story_arcs','nodes'])
  await f.admin('create table public.'+name+'(id uuid primary key,payload jsonb not null);')
 await f.admin(await readFile(new URL('../../supabase/qualification/mip-cutover-authority/007_survivor_release.sql',import.meta.url),'utf8'))
 await f.admin('select mip_identity.install_survivor_fences()')
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
 const explanations=data.output.projection.explanations.map(x=>({...x,review_status:'published',falsification_condition:'Synthetic fixture: contradictory retained source invalidates this statement.',archived_sources:evidence.map(e=>({status:'retained',field_hash:e.field_hash}))}))
 async function review(overrides={}){
  const context=JSON.parse(await f.admin('select mip_identity.survivor_context()'))
  const r={revision:randomUUID(),generation_id:data.generation,input_hash:data.input_hash,output_hash:data.output_hash,privacy_status:'eligible',rights_status:'eligible',evidence,explanations,relationship_context:context,valid_until:'2999-01-01',policy_ref:'synthetic-owner-policy-not-production',authorization_ref:'synthetic-explicit-review',...overrides}
  await f.admin('insert into mip_identity.publication_reviews('+Object.keys(r).join(',')+') values('+Object.values(r).map(q).join(',')+');insert into mip_identity.publication_review_heads values('+[data.generation,r.revision,true].map(q).join(',')+') on conflict(generation_id) do update set revision=excluded.revision,active=true;')
  return r.revision
 }
 const session=await f.issue('runtime-a',publisherRole),rpc=transport(f.db,publisherRole)
 return {...f,data,evidence,explanations,review,publisher:session,pub:rpc,stage:r=>rpc('stage_review',[session,'runtime-a',r]),release:(r,request=randomUUID())=>rpc('release_isolated',[request,session,'runtime-a',r])}
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
