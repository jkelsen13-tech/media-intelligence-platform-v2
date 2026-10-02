import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { installStoryFollowingFixture } from '../scripts/storyFollowingPackage.mjs'
import { createInvestigationApiHandler, createInvestigationApiTransport } from '../supabase/functions/investigation-api/handler.mjs'
import { createInvestigationBackend } from '../src/lib/investigationBackend.js'
import { evaluateNewsStoryState, newsSourceReports } from '../src/lib/newsStoryState.js'

async function fixture(t) {
  const f=await createReviewedVersionFixture(),{db,scalar}=f
  t.after(()=>db.close())
  const first=await f.ingest({...f.article,title:'WITHHELD_PREDECESSOR_TITLE_TOKEN'})
  await db.query("update public.articles set title='WITHHELD_PREDECESSOR_TITLE_TOKEN' where id=$1",[first.article_id])
  // Preserve the existing owner gate requiring two eligible outlets after A's
  // withdrawal. The correction must not relax that independent admission gate.
  const supporting=await f.ingest({...f.article,url:'https://example.invalid/correction-support',outlet:'Synthetic source C'})
  await db.query("update public.articles set reader_state='eligible' where id=$1",[supporting.article_id])
  await db.query("insert into public.event_articles(event_id,article_id,membership_method) values($1,$2,'synthetic-owner')",[f.event_id,supporting.article_id])
  await db.query("update public.claims set canonical_text='WITHHELD_PREDECESSOR_CLAIM_TOKEN' where id=$1",[f.claim_id])
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  await installStoryFollowingFixture(db)
  const actor=randomUUID(),otherActor=randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2)',[actor,otherActor])
  const firstVersion=await f.bindArticle(first),storyId=await f.bindStory([firstVersion])
  const v1=await f.readStory((await scalar('select story_id from mip_private.reviewed_public_story_versions where public_version_id=$1',[storyId])),storyId)
  let bearer=actor,queue=Promise.resolve()
  const calls=[],serverCalls=[]
  const serial=run=>{const result=queue.then(run);queue=result.catch(()=>{});return result}
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})
  const transport=createInvestigationApiTransport({url:'https://qikvmopbtijoebdqosyq.supabase.co',anonKey:'sb_publishable_fixture',serviceKey:'sb_secret_fixture',fetchImpl:async(url,init)=>{
    const request=new Request(url,init),path=new URL(url).pathname
    if(path==='/auth/v1/user')return json({id:request.headers.get('authorization').slice(7)})
    assert.equal(path,'/rest/v1/rpc/mip_public_story_following_v1')
    assert.equal(request.headers.has('authorization'),false)
    assert.equal(request.headers.get('apikey'),'sb_secret_fixture')
    const body=await request.json();serverCalls.push(body)
    return serial(async()=>{
      await db.exec('set role service_role')
      try{return json(await scalar('select public.mip_public_story_following_v1($1,$2::jsonb)',[body.p_action,JSON.stringify(body.p_input)]))}
      catch(e){return json({code:e.code,message:'Private database diagnostic withheld'},400)}
      finally{await db.exec('reset role')}
    })
  }})
  const handler=createInvestigationApiHandler(transport)
  const client=createClient('https://qikvmopbtijoebdqosyq.supabase.co','sb_publishable_fixture',{accessToken:async()=>bearer,global:{fetch:async(url,init)=>{
    const request=new Request(url,init),path=new URL(url).pathname,body=await request.clone().json();calls.push({path,body})
    if(path==='/rest/v1/rpc/read_reviewed_public_story_context_v1')return serial(async()=>{
      await db.exec('set role anon')
      try{return json(await scalar('select public.read_reviewed_public_story_context_v1($1,$2)',[body.p_story_id,body.p_public_version_id]))}
      finally{await db.exec('reset role')}
    })
    assert.equal(path,'/functions/v1/investigation-api/story-following')
    const response=await handler(request);assert.equal(response.headers.get('cache-control'),'private, no-store');return response
  }}})
  const backend=createInvestigationBackend(client).storyFollowing
  const input=(story,previous=null)=>({story_id:story.story_id,subject_type:story.subject_type,subject_id:story.subject_id,public_version_id:story.public_version_id,event_id:randomUUID(),previous_event_id:previous})
  const invoke=(action,value)=>backend[action](value,{expectedUserId:actor})
  const subscribed=await invoke('subscribe',input(v1));assert.equal(subscribed.error,null)
  const read=()=>invoke('read',{story_id:v1.story_id})
  async function claim(articleId,canonical='Safe corrected proposition from the retained source.') {
    const claimId=await scalar("insert into public.claims(event_id,canonical_text,status,rule_version) values($1,$2,'active','sc-v2-event-projection') returning id",[f.event_id,canonical])
    const excerpt='A source reports a vessel arrival.'
    return scalar("insert into public.article_claims(article_id,claim_id,surface_text,char_start,char_end,evidence_source_field,evidence_excerpt,auditability_state) values($1,$2,$3,2,$4,'summary',$3,'verified_retained_source') returning id",[articleId,claimId,excerpt,2+Array.from(excerpt).length])
  }
  async function successor(publicSource,kind='correction') {
    const id=await f.bindStory([publicSource],{review:randomUUID(),predecessor:v1.public_version_id,reason:'Synthetic reviewed correction replaces the prior publication.'})
    const story=await f.readStory(v1.story_id,id)
    const declaration={material_change_id:randomUUID(),story_id:v1.story_id,public_version_id:story.public_version_id,
      previous_public_version_id:v1.public_version_id,effective_at:'2026-10-01T10:00:00.123456Z',
      reason:'Synthetic admitted correction; predecessor content is withheld.',evidence_refs:[publicSource],review_refs:[story.review_ref],policy_version:story.policy_version,
      kind,importance:'material',novelty:'correction',event_state:'active'}
    return {story,declaration}
  }
  const declare=input=>scalar('select mip_private.declare_public_story_material_change_v1($1::jsonb)',[JSON.stringify(input)])
  return {...f,actor,otherActor,firstVersion,v1,backend,input,invoke,read,claim,successor,declare,calls,serverCalls,setBearer:value=>{bearer=value}}
}

test('reviewed correction of a superseded claim remains an unread admitted successor without predecessor payload',async t=>{
  const f=await fixture(t)
  const newClaim=await f.claim(f.first.article_id)
  await f.db.query("update public.claims set status='superseded' where id=$1",[f.claim_id])
  assert.equal(await f.readArticle(f.first.article_id,f.firstVersion),null)
  const first=(await f.db.query('select capture_id from mip_private.reviewed_public_article_versions where public_version_id=$1',[f.firstVersion])).rows[0]
  const source={article_id:f.first.article_id,capture_id:first.capture_id,capture_hash:await f.scalar('select content_hash from evidence_pipeline.article_captures where id=$1',[first.capture_id])}
  const correctedSource=await f.bindArticle(source,{review:randomUUID(),predecessor:f.firstVersion,reason:'Corrected reviewed claim replaces a superseded claim.',claims:[newClaim]})
  const {story,declaration}=await f.successor(correctedSource)
  const before=await f.read();assert.equal(before.data.unclassified_version_changes,true)
  const saved=await f.declare(declaration)
  assert.equal(saved.kind,'correction');assert.deepEqual(await f.declare(declaration),saved)
  const current=await f.read();assert.equal(current.error,null);assert.equal(current.data.subscription.status,'active')
  assert.equal(current.data.unread_count,1);assert.equal(current.data.unclassified_version_changes,false)
  assert.equal(current.data.changes[0].previous_public_version_id,f.v1.public_version_id)
  const context=await f.backend.loadStoryContext(story.story_id,{publicVersionId:story.public_version_id})
  assert.equal(context.error,null);assert.equal(context.data.material_changes.length,1)
  assert.equal(evaluateNewsStoryState(context.data,Date.now()).reason_code,'reviewed_correction')
  assert.doesNotMatch(JSON.stringify([current,context]),new RegExp(`WITHHELD_PREDECESSOR_CLAIM_TOKEN|${f.article_claim_id}|PRIVATE_BODY_ONLY_TOKEN|source_snapshot|request_fingerprint|declared_by`))
  assert.equal((await f.backend.loadStoryContext(story.story_id,{publicVersionId:f.v1.public_version_id})).data,null)
  const ack=await f.invoke('acknowledge',f.input(story,current.data.subscription.current_event_id))
  assert.equal(ack.error,null);assert.equal(ack.data.acknowledged_public_version_id,story.public_version_id)
  assert.equal((await f.read()).data.unread_count,0)
  assert.ok(f.serverCalls.every(call=>call.p_input.user_id===f.actor))
})

test('withdrawn predecessor source cannot suppress admitted correction or expose predecessor fields',async t=>{
  const f=await fixture(t),newClaim=await f.claim(f.second.article_id)
  const correctedSource=await f.bindArticle(f.second,{review:randomUUID(),claims:[newClaim]})
  const {story,declaration}=await f.successor(correctedSource)
  await f.db.query("update public.articles set source_status='withdrawn' where id=$1",[f.first.article_id])
  assert.equal(await f.readStory(f.v1.story_id,f.v1.public_version_id),null)
  assert.ok(await f.readStory(story.story_id,story.public_version_id))
  await f.declare(declaration)
  const current=await f.read();assert.equal(current.data.unread_count,1);assert.equal(current.data.subscription.status,'active')
  const context=await f.backend.loadStoryContext(story.story_id,{publicVersionId:story.public_version_id})
  assert.equal(context.error,null);assert.equal(evaluateNewsStoryState(context.data,Date.now()).reason_code,'reviewed_correction')
  assert.doesNotMatch(JSON.stringify([current,context]),/WITHHELD_PREDECESSOR_TITLE_TOKEN|WITHHELD_PREDECESSOR_CLAIM_TOKEN|PRIVATE_BODY_ONLY_TOKEN|source_snapshot|request_fingerprint|declared_by/)
  const ack=await f.invoke('acknowledge',f.input(story,current.data.subscription.current_event_id));assert.equal(ack.error,null)
  assert.equal((await f.read()).data.unread_count,0)
  await f.db.query("update public.articles set source_status='withdrawn' where id=$1",[f.second.article_id])
  const denied=await f.read();assert.equal(denied.data.story_status,'revoked');assert.deepEqual(denied.data.changes,[])
  assert.equal(denied.data.story_title,null);assert.equal(denied.data.head_public_version_id,null)
  assert.equal((await f.backend.loadStoryContext(story.story_id,{publicVersionId:story.public_version_id})).data,null)
  const forbidden=await f.invoke('acknowledge',f.input(story,denied.data.subscription.current_event_id));assert.equal(forbidden.error.code,'access_denied')
})

test('canonical lineage, successor permission, publication owner and account boundaries refuse forged correction',async t=>{
  const f=await fixture(t),newClaim=await f.claim(f.second.article_id)
  const correctedSource=await f.bindArticle(f.second,{review:randomUUID(),claims:[newClaim]})
  const {story,declaration}=await f.successor(correctedSource)
  const foreignId=await f.bindStory([correctedSource],{type:'article',subject:f.second.article_id,review:randomUUID()})
  await assert.rejects(f.declare({...declaration,previous_public_version_id:foreignId}),e=>e.code==='22023')
  await assert.rejects(f.declare({...declaration,previous_public_version_id:randomUUID()}),e=>e.code==='22023')
  await assert.rejects(f.declare({...declaration,evidence_refs:[f.firstVersion]}),e=>e.code==='22023')
  await assert.rejects(f.declare({...declaration,private_note:'PRIVATE_CORRECTION_NOTE_TOKEN'}),e=>e.code==='22023')
  for(const role of ['anon','authenticated','service_role']) {
    await f.db.exec('set role '+role)
    try {await assert.rejects(f.declare(declaration),e=>e.code==='42501')}
    finally {await f.db.exec('reset role')}
  }
  await f.db.exec('set role anon')
  try {await assert.rejects(f.db.query('select * from mip_private.reviewed_public_story_versions'),e=>e.code==='42501')}
  finally {await f.db.exec('reset role')}
  await f.declare(declaration)
  f.setBearer(f.otherActor)
  const count=f.serverCalls.length
  assert.equal((await f.read()).error.code,'authentication_required');assert.equal(f.serverCalls.length,count)
  const other=await f.backend.read({story_id:story.story_id},{expectedUserId:f.otherActor})
  assert.equal(other.error,null);assert.equal(other.data.subscription,null);assert.equal(other.data.unread_count,0)
  f.setBearer(f.actor)
  await f.db.query("update public.articles set reader_state='pending_review' where id=$1",[f.second.article_id])
  await assert.rejects(f.declare({...declaration,material_change_id:randomUUID()}),e=>e.code==='22023')
  assert.equal((await f.read()).data.story_status,'revoked')
})

test('source-report correction remains attributed instead of admitting a proposition',async t=>{
  const f=await fixture(t)
  const report=await f.bindArticle(f.second,{kind:'source_report',review:randomUUID(),claims:[]})
  const {story,declaration}=await f.successor(report)
  await f.db.query("update public.articles set source_status='withdrawn' where id=$1",[f.first.article_id])
  await f.declare(declaration)
  assert.equal((await f.read()).data.unread_count,1)
  const context=await f.backend.loadStoryContext(story.story_id,{publicVersionId:story.public_version_id})
  assert.equal(context.error,null);assert.equal(context.data.evidence_versions[0].admission_kind,'source_report')
  assert.equal(evaluateNewsStoryState(context.data,Date.now()).available,false)
  assert.equal(evaluateNewsStoryState(context.data,Date.now()).reason_code,'latest_material_change_is_attributed_report_pending_verification')
  assert.equal(newsSourceReports(context.data,Date.now())[0].verification_label,'Pending MIP verification / reconciliation')
  assert.doesNotMatch(JSON.stringify(context),/WITHHELD_PREDECESSOR_TITLE_TOKEN|WITHHELD_PREDECESSOR_CLAIM_TOKEN|PRIVATE_BODY_ONLY_TOKEN/)
})

test('a follow already revoked before successor admission never resumes through a correction declaration',async t=>{
  const f=await fixture(t)
  await f.db.query("update public.articles set source_status='withdrawn' where id=$1",[f.first.article_id])
  const before=await f.read();assert.equal(before.data.subscription.status,'revoked')
  const report=await f.bindArticle(f.second,{kind:'source_report',review:randomUUID(),claims:[]})
  const {story,declaration}=await f.successor(report);await f.declare(declaration)
  const current=await f.read()
  assert.equal(current.data.story_status,'public');assert.equal(current.data.subscription.status,'revoked')
  assert.equal(current.data.subscription.current_event_id,before.data.subscription.current_event_id)
  assert.equal(current.data.unread_count,0);assert.deepEqual(current.data.changes,[])
  const context=await f.backend.loadStoryContext(story.story_id,{publicVersionId:story.public_version_id})
  assert.equal(context.error,null);assert.equal(context.data.material_changes.length,1)
  const subscribed=await f.invoke('subscribe',f.input(story,current.data.subscription.current_event_id))
  assert.equal(subscribed.error,null);assert.equal(subscribed.data.acknowledged_public_version_id,story.public_version_id)
  assert.equal((await f.read()).data.subscription.status,'active')
  assert.equal((await f.read()).data.unread_count,0)
})
