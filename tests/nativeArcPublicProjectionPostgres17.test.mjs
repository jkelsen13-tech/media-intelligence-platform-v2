// Source-authored ONLY. Runs real selected SQL bodies on synthetic material.
// This fixture qualifies historical behavior, not native public release authority.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import pg from 'pg'
const root=new URL('../',import.meta.url)
const read=p=>readFile(new URL(p,root),'utf8')
const database='native_arc_public_projection_qualification'
const deniedRole='native_arc_projection_fixture_reader'
const password='mip-efta-disposable-ci-only'
const base={host:'127.0.0.1',port:5432,user:'postgres',password,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:15000}
const id=n=>'c9100000-0000-4000-8000-'+String(n).padStart(12,'0')
const model='arc-v1-membership-2026-08-23.2'
const sentinel='SYNTHETIC_ORIGINAL_BODY_ONLY_91a7'
const vector=n=>'['+Array.from({length:384},(_,i)=>i===n?1:0).join(',')+']'
const sha=(s,algorithm='sha256')=>createHash(algorithm).update(s).digest('hex')
const gitBlob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex')
const ident=s=>'"'+s.replaceAll('"','""')+'"'
function functionBody(source,name){
 const start=source.toLowerCase().indexOf('create or replace function '+name.toLowerCase()+'(')
 if(start<0)throw Error('historical_function_missing')
 const tail=source.slice(start),match=tail.match(/\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)
 if(!match)throw Error('historical_function_delimiter')
 const end=tail.indexOf(match[0],match.index+match[0].length)
 if(end<0||tail.slice(end+match[0].length).trimStart()[0]!==';')throw Error('historical_function_delimiter')
 return tail.slice(0,end+match[0].length)+ ';'
}
const safe=e=>{
 const state=/^[A-Z0-9]{5}$/.test(e?.code??'')?e.code:'none'
 const position=/^[0-9]{1,8}$/.test(String(e?.internalPosition??e?.position??''))?String(e.internalPosition??e.position):'none'
 const frames=String(e?.stack??'').split('\n').slice(1).flatMap(line=>{
  const match=line.match(/nativeArcPublicProjectionPostgres17\.test\.mjs:(\d{1,6}):(\d{1,6})/);return match?[match[0]]:[]
 }).slice(0,3)
 return 'sqlstate_'+state+'_position_'+position+'_frames_'+frames.join(',')
}
async function connect(dbname){
 const client=new pg.Client({...base,database:dbname})
 try{await client.connect();return client}catch(error){try{await client.end()}catch{}throw error}
}
test('exact historical arc projection and atomic attachment dependencies',{
 skip:process.env.MIP_ARC_PUBLIC_PROJECTION_DISPOSABLE!=='synthetic-pg17-only',timeout:180000
},async t=>{
 let admin,db,parallel,createdDB=false,createdRole=false,stage='guard',primary=null,index=0
 const failures=[]
 try{
  if(process.env.MIP_DISPOSABLE_POSTGRES!=='qik-persistent-install')throw Error('historical_fixture_guard')
  admin=await connect('template1')
  assert.deepEqual((await admin.query("select current_setting('server_version_num') version,session_user::text principal")).rows[0],
   {version:'170006',principal:'postgres'})
  assert.equal((await admin.query('select count(*)::int n from pg_database where datname=$1',[database])).rows[0].n,0)
  assert.equal((await admin.query('select count(*)::int n from pg_roles where rolname=$1',[deniedRole])).rows[0].n,0)
  await admin.query('create database '+ident(database)+' owner postgres');createdDB=true
  await admin.query('create role '+ident(deniedRole)+' nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls noreplication');createdRole=true
  db=await connect(database);parallel=await connect(database)
  stage='extension'
  await db.query('create extension vector with schema public')
  assert.equal((await db.query("select extversion from pg_extension where extname='vector'")).rows[0].extversion,'0.8.2')
  stage='schema'
  const manifest=JSON.parse(await read('supabase/qualification/arc-public-projection/historical_manifest.json'))
  await db.query(await read('supabase/qualification/arc-public-projection/historical_schema.sql'))
  stage='functions'
  for(const file of manifest.files){
   const source=await read(file.path)
   assert.equal(gitBlob(source),file.blob)
   if(file.sha256)assert.equal(sha(source),file.sha256)
   if(file.selected_functions){for(const name of file.selected_functions)await db.query(functionBody(source,name))}
   else await db.query(source)
  }
  // Install the selected exact real trigger definitions; the unrelated source-
  // status D5 trigger is explicitly outside this projection-only fixture.
  for(const relation of manifest.tables)for(const trigger of relation.triggers){
   if(trigger.name===manifest.excluded_trigger_name)continue
   await db.query(trigger.definition)
  }
  for(const signature of [
   'public.mip_arc_projection_milestone_outcome(text,text)','public.mip_refresh_arc_projection_milestone(uuid)',
   'public.mip_touch_arc_membership_candidate()','public.mip_project_approved_arc_membership(uuid)',
   'public.mip_approve_arc_membership_candidate(uuid)','public.attach_article_to_arc(uuid,uuid,vector,jsonb)',
   'public.mip_retract_arc_membership_projection(uuid)','public.mip_arc_membership_projection_state_change()',
   'public.mip_intercept_direct_arc_attachment()','public.mip_invalidate_arc_membership_approvals()',
   'public.policy_edge_attributed()','public.touch_updated_at()'
  ])await db.query('revoke all on function '+signature+' from public')
  const call=async(client,sql,args)=>(await client.query(sql,args)).rows[0].result
  async function caseRows(n,{embedding=true,citation=true,rootNode=true}={}){
   const article=id(n),arc=id(n+1),candidate=id(n+2),score=id(n+3),rootId=id(n+4),milestone=id(n+5)
   if(rootNode)await db.query("insert into public.nodes(id,slug,label,type) values($1,$2,'Synthetic institution','institution')",[rootId,'synthetic-root-'+n])
   await db.query("insert into public.story_arcs(id,slug,title,category,root_node_id,summary,started_at) values($1,$2,'Synthetic inquiry','institutional_accountability',$3,'Synthetic findings','2026-01-01')",
    [arc,'synthetic-arc-'+n,rootNode?rootId:null])
   await db.query("insert into public.articles(id,feed,outlet,title,url,summary,body_text,published_at,embedding,reader_state,source_status) values($1,'synthetic','Synthetic outlet','Synthetic investigation report',$2,'Findings published today',$3,'2026-01-02',$4::vector,'eligible','active')",
    [article,'https://synthetic.invalid/projector/'+n,sentinel+' investigation completed; no charges',embedding?vector(0):null])
   if(citation)await db.query("insert into public.citations(article_id,cited_entity,cited_type,documentation_strength) values($1,'Synthetic agency','agency_release',0.85)",[article])
   await db.query("insert into public.arc_milestones(id,arc_id,title,milestone_key,notes) values($1,$2,'Synthetic concludes','ia_concludes','Synthetic baseline')",[milestone,arc])
   await db.query("insert into public.arc_membership_candidates(id,article_id,arc_id,generation_method) values($1,$2,$3,'synthetic_historical_fixture')",[candidate,article,arc])
   await db.query("insert into public.arc_membership_scores(id,candidate_id,model_version,membership_fingerprint,membership_fingerprint_hash,candidate_updated_at,cluster_confidence,decision) select $1,id,$3,'synthetic exact historical fixture',$4,updated_at,0.9,'candidate' from public.arc_membership_candidates where id=$2",
    [score,candidate,model,'a'.repeat(64)])
   return {article,arc,candidate,score,rootId,milestone,embedding}
  }
  async function guardedFixtureApproval(client,c){
   // Privileged synthetic substrate setup ONLY. This is not a production
   // manual approver, and is never exposed through an application function.
   await client.query("select set_config('app.arc_membership_approval_candidate_id',$1,true)",[c.candidate])
   await client.query("update public.arc_membership_candidates set state='approved',approved_score_id=$2 where id=$1",[c.candidate,c.score])
  }
  const attach=(client,c)=>call(client,'select public.attach_article_to_arc($1,$2,$3::vector,$4::jsonb) result',
   [c.article,c.arc,c.embedding?vector(0):null,JSON.stringify({synthetic_fixture:true,candidate_id:c.candidate})])
  const check=async(name,fn)=>t.test(name,async()=>{
   const label='check_'+(++index);stage=label
   try{await fn()}catch(e){const code=label+'_'+safe(e);primary??=code;throw Error(code)}
   finally{await db.query('rollback').catch(()=>{});await parallel.query('rollback').catch(()=>{})}
  })
  await check('actual_schema_matches_recovered_types_and_key_constraints',async()=>{
   for(const table of manifest.tables){
    const actual=(await db.query("select a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null from pg_attribute a where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum",['public.'+table.name])).rows
    assert.deepEqual(actual,table.columns)
   }
   assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity")).rows[0].n,0)
  })
  await check('unchanged_outcome_rules_fail_precedence_null_and_unknown_key',async()=>{
   for(const [key,text,expected]of [
    ['ia_concludes','inquiry abandoned','failed'],['ia_concludes','investigation completed','confirmed'],
    ['ia_charges','no charges; charged','failed'],['gp_ceasefire','ceasefire collapses; truce','failed'],
    ['lr_deadline','delayed takes effect','failed'],['ep_funding','funding allocated','confirmed'],
    ['lr_funding','funding allocated','confirmed'],['gen_reaction','public backlash','confirmed'],
    ['ia_policy','unrelated text',null],['ia_policy',null,null]
   ])assert.equal(await call(db,'select public.mip_arc_projection_milestone_outcome($1,$2) result',[key,text]),expected)
   await assert.rejects(db.query("select public.mip_arc_projection_milestone_outcome('unknown_key','synthetic')"),e=>e.code==='20000')
  })
  const first=await caseRows(100)
  await check('legacy_approver_remains_default_closed_without_any_auto_activation',async()=>{
   await db.query('insert into public.arc_membership_release_policy(model_version) values($1)',[model])
   await assert.rejects(db.query('select public.mip_approve_arc_membership_candidate($1)',[first.candidate]),e=>e.code==='P0001')
   assert.equal((await db.query('select state from public.arc_membership_candidates where id=$1',[first.candidate])).rows[0].state,'pending')
   assert.equal((await db.query('select count(*)::int n from public.arc_membership_projection_runs')).rows[0].n,0)
   assert.equal((await db.query('select bool_or(auto_approval_enabled) enabled from public.arc_membership_release_policy')).rows[0].enabled,false)
  })
  await check('real_state_trigger_projects_then_atomic_attach_and_retry_are_exact',async()=>{
   await db.query('begin');await guardedFixtureApproval(db,first)
   const run=(await db.query('select * from public.arc_membership_projection_runs where candidate_id=$1',[first.candidate])).rows[0]
   assert.equal(run.state,'active');assert.ok(run.event_node_id&&run.source_id&&run.edge_id&&run.arc_event_id)
   assert.equal((await db.query('select arc_id from public.articles where id=$1',[first.article])).rows[0].arc_id,null)
   assert.equal((await db.query('select confidence from public.arc_events where id=$1',[run.arc_event_id])).rows[0].confidence,'confirmed')
   assert.equal((await db.query('select type,doc_strength,counterfactual_test from public.edges where id=$1',[run.edge_id])).rows[0].type,'sequence')
   assert.equal((await db.query('select status from public.arc_milestones where id=$1',[first.milestone])).rows[0].status,'confirmed')
   const result=await attach(db,first);assert.equal(result.status,'attached');assert.equal(result.member_count,1);assert.equal(result.centroid_updated,true)
   const before=(await db.query('select embedding::text,last_update_at from public.story_arcs where id=$1',[first.arc])).rows[0]
   assert.equal((await attach(db,first)).status,'already_attached')
   assert.deepEqual((await db.query('select embedding::text,last_update_at from public.story_arcs where id=$1',[first.arc])).rows[0],before)
   assert.equal((await call(db,'select public.mip_project_approved_arc_membership($1) result',[first.candidate])).status,'already_projected')
   for(const table of ['nodes','sources','edges','arc_events','arc_membership_projection_runs','arc_membership_projection_milestone_evidence']){
    const rows=(await db.query('select coalesce(jsonb_agg(to_jsonb(x)),\'[]\') payload from public.'+ident(table)+' x')).rows[0].payload
    assert.equal(JSON.stringify(rows).includes(sentinel),false)
   }
   assert.equal((await db.query('select body_text from public.articles where id=$1',[first.article])).rows[0].body_text,sentinel+' investigation completed; no charges')
   await db.query('commit')
  })
  await check('real_retraction_removes_derived_rows_and_restores_original_milestone_baseline',async()=>{
   await db.query("update public.arc_membership_candidates set state='invalidated' where id=$1",[first.candidate])
   for(const table of ['nodes','sources','edges','arc_events'])
    assert.equal((await db.query('select count(*)::int n from public.'+ident(table)+' where arc_membership_candidate_id=$1',[first.candidate])).rows[0].n,0)
   assert.deepEqual((await db.query('select status,notes from public.arc_milestones where id=$1',[first.milestone])).rows[0],
    {status:'pending',notes:'Synthetic baseline'})
   assert.equal((await call(db,'select public.mip_retract_arc_membership_projection($1) result',[first.candidate])).status,'already_retracted')
   assert.equal((await db.query('select count(*)::int n from public.arc_membership_projection_milestone_evidence where candidate_id=$1',[first.candidate])).rows[0].n,1)
  })
  await check('null_embedding_no_root_and_missing_document_citation_preserve_real_branches',async()=>{
   const c=await caseRows(200,{embedding:false,citation:false,rootNode:false})
   await db.query('begin');await guardedFixtureApproval(db,c)
   const projected=(await db.query('select edge_id,arc_event_id from public.arc_membership_projection_runs where candidate_id=$1',[c.candidate])).rows[0]
   assert.equal(projected.edge_id,null)
   assert.equal((await db.query('select confidence from public.arc_events where id=$1',[projected.arc_event_id])).rows[0].confidence,'corroborated')
   const result=await attach(db,c);assert.equal(result.centroid_updated,false);assert.equal(result.member_count,0)
   assert.equal((await db.query('select embedding from public.story_arcs where id=$1',[c.arc])).rows[0].embedding,null)
   await db.query('commit')
  })
  await check('actual_atomic_duplicate_waits_on_article_then_noops_without_double_fold',async()=>{
   const c=await caseRows(300)
   await db.query('begin');await guardedFixtureApproval(db,c);await db.query('commit')
   await db.query('begin');await db.query("select set_config('app.arc_membership_approval_candidate_id',$1,true)",[c.candidate])
   await attach(db,c)
   await parallel.query('begin');await parallel.query("select set_config('app.arc_membership_approval_candidate_id',$1,true)",[c.candidate])
   let settled=false
   const pending=attach(parallel,c).then(v=>{settled=true;return v},e=>{settled=true;throw e});pending.catch(()=>{})
   try{
    let blocked=false
    for(let i=0;i<80;i++){
     blocked=(await admin.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",[parallel.processID])).rows[0]?.blocked
     if(blocked)break
     assert.equal(settled,false);await new Promise(resolve=>setTimeout(resolve,10))
    }
    assert.equal(blocked,true);await db.query('commit')
    assert.equal((await pending).status,'already_attached');await parallel.query('commit')
    assert.equal((await db.query('select embedding::text e from public.story_arcs where id=$1',[c.arc])).rows[0].e,vector(0))
   }finally{await db.query('rollback');await pending.catch(()=>{});await parallel.query('rollback')}
  })
  await check('real_refresh_prioritizes_active_failure_and_retraction_restores_remaining_evidence',async()=>{
   const a=await caseRows(500),b=await caseRows(600)
   await db.query('update public.arc_membership_candidates set arc_id=$2 where id=$1',[b.candidate,a.arc])
   await db.query('begin');await guardedFixtureApproval(db,a);await guardedFixtureApproval(db,b);await db.query('commit')
   // Exact refresh-helper fixture input, not a claim that the producer scans
   // already-confirmed milestones. That producer scans pending milestones only.
   await db.query("insert into public.arc_membership_projection_milestone_evidence(candidate_id,milestone_id,outcome,article_title,article_url,recorded_at) values($1,$2,'failed','Synthetic older failure','https://synthetic.invalid/failure','2020-01-01')",[b.candidate,a.milestone])
   await db.query('select public.mip_refresh_arc_projection_milestone($1)',[a.milestone])
   assert.equal((await db.query('select status from public.arc_milestones where id=$1',[a.milestone])).rows[0].status,'failed')
   await db.query("update public.arc_membership_candidates set state='invalidated' where id=$1",[b.candidate])
   assert.equal((await db.query('select status from public.arc_milestones where id=$1',[a.milestone])).rows[0].status,'confirmed')
   await db.query("update public.arc_membership_candidates set state='invalidated' where id=$1",[a.candidate])
   assert.deepEqual((await db.query('select status,notes from public.arc_milestones where id=$1',[a.milestone])).rows[0],{status:'pending',notes:'Synthetic baseline'})
  })
  await check('missing_real_conflict_index_rolls_back_whole_projection',async()=>{
   const c=await caseRows(700)
   await db.query('begin')
   await db.query('drop index public.sources_arc_membership_projection_candidate_uidx')
   await assert.rejects(guardedFixtureApproval(db,c),e=>e.code==='42P10')
   await db.query('rollback')
   assert.equal((await db.query('select state from public.arc_membership_candidates where id=$1',[c.candidate])).rows[0].state,'pending')
   assert.equal((await db.query('select count(*)::int n from public.nodes where arc_membership_candidate_id=$1',[c.candidate])).rows[0].n,0)
   assert.ok((await db.query("select to_regclass('public.sources_arc_membership_projection_candidate_uidx') idx")).rows[0].idx)
  })
  await check('fixture_grants_no_ambient_mutation_or_source_read',async()=>{
   await db.query('set role '+ident(deniedRole))
   try{
    await assert.rejects(db.query('select body_text from public.articles'),e=>e.code==='42501')
    await assert.rejects(db.query('select public.mip_project_approved_arc_membership($1)',[first.candidate]),e=>e.code==='42501')
    await assert.rejects(db.query('select public.attach_article_to_arc($1,$2)',[first.article,first.arc]),e=>e.code==='42501')
   }finally{await db.query('reset role')}
  })
 }catch(e){primary??=stage+'_'+safe(e)}
 finally{
  for(const [name,client]of [['parallel',parallel],['database',db]])if(client)try{await client.end()}catch{failures.push('close_'+name)}
  if(admin){
   if(createdDB)try{
    assert.equal((await admin.query('select count(*)::int n from pg_stat_activity where datname=$1',[database])).rows[0].n,0)
    await admin.query('drop database '+ident(database))
   }catch{failures.push('owned_database_cleanup')}
   if(createdRole)try{await admin.query('drop role '+ident(deniedRole))}catch{failures.push('owned_role_cleanup')}
   try{await admin.end()}catch{failures.push('close_admin')}
  }
  if(primary||failures.length){
   const codes=[...(primary?[primary]:[]),...failures]
   throw new AggregateError(codes.map(c=>Error(c)),'historical_arc_fixture_failed:'+codes.join('|'))
  }
 }
})
