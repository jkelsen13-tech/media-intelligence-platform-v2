import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { INITIAL_STAGES, prepareLaunchFixtureFoundation, launchCatalog, installLaunchStageFixture } from '../scripts/launchInstallationSequence.mjs'

export const scalar=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
export async function roleCall(db,role,sql,args=[]){
  if(!['anon','authenticated','service_role'].includes(role))throw Error('fixture role unavailable')
  await db.exec('begin;set local role '+role)
  try{const result=await scalar(db,sql,args);await db.exec('commit');return result}
  catch(e){await db.exec('rollback');throw e}
}
export async function wholeLaunchFixture(){
  const db=await PGlite.create(),receipts=[]
  try{
    await prepareLaunchFixtureFoundation(db)
    for(const stage of INITIAL_STAGES)receipts.push(await installLaunchStageFixture(db,stage,{approvedCatalog:await launchCatalog(db)}))
    return {db,receipts}
  }catch(e){await db.close();throw e}
}
// Explicit synthetic administrator admissions. No genuine reviewer, provider,
// rights, criteria acceptance or independent factual verification is asserted.
export async function populateLaunchHistory(db){
  const rpc=(action,input)=>scalar(db,'select public.mip_pipeline_v1($1,$2::jsonb)',[action,JSON.stringify(input)])
  const subject=await scalar(db,"insert into public.nodes(type,label) values('event','Synthetic launch qualification subject') returning id")
  const event=await scalar(db,"insert into public.events(canonical_title,comparison_validation_state) values('Synthetic launch qualification event','approved') returning id")
  async function source(name){
    await rpc('enqueue',{run_id:'synthetic-launch-sequence',article:{url:'https://example.invalid/launch-sequence/'+name,title:'Synthetic '+name,
      outlet:'Synthetic source '+name,summary:'Retained source reporting; factual verification pending.',body_text:'PRIVATE_COMPLETE_BODY_OUTSIDE_ADMISSION',published_at:'2026-10-01T00:00:00Z'}})
    const job=await rpc('claim'),retained=await rpc('finish',{job_id:job.id,lease_token:job.lease_token})
    await db.query("update public.articles set reader_state='eligible' where id=$1",[retained.article_id])
    await db.query("insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id) values($1,'Synthetic subject','event',1,$2)",[retained.article_id,subject])
    await db.query("insert into public.event_articles(event_id,article_id,membership_method) values($1,$2,'synthetic-explicit-owner')",[event,retained.article_id])
    const hash=await scalar(db,'select content_hash from evidence_pipeline.article_captures where id=$1',[retained.capture_id])
    const version=await scalar(db,"select mip_private.bind_reviewed_public_article_version($1,$2,$3,'source_report',$4,'synthetic-policy-v1','Pending independent verification; synthetic report-only admission.')",[retained.article_id,retained.capture_id,hash,'synthetic-source-review:'+name])
    return {...retained,hash,version}
  }
  const first=await source('first'),second=await source('second')
  const bindStory=(members,previous=null)=>scalar(db,"select mip_private.bind_reviewed_public_story_version('graph_node',$1,$2::uuid[],$3,'synthetic-story-policy-v1',$4,$5)",
    [subject,members,'synthetic-story-review:'+members.length,previous,previous?'Synthetic second retained report':null])
  const v1=await bindStory([first.version]),v2=await bindStory([first.version,second.version],v1)
  const story=await scalar(db,'select public.read_reviewed_public_story_v1((select story_id from mip_private.reviewed_public_story_versions where public_version_id=$1),$1)',[v2])
  const material=await scalar(db,'select mip_private.declare_public_story_material_change_v1($1::jsonb)',[JSON.stringify({material_change_id:randomUUID(),story_id:story.story_id,
    public_version_id:v2,previous_public_version_id:v1,effective_at:'2026-10-01T00:00:00Z',reason:'Explicit synthetic reporting development, pending verification.',
    evidence_refs:[second.version],review_refs:[story.review_ref],policy_version:story.policy_version,kind:'update',importance:'material',novelty:'genuinely_new',event_state:'unresolved'})])
  const viewer=randomUUID();await db.query('insert into public.mip_profiles values($1)',[viewer])
  const follow=await roleCall(db,'service_role',"select public.mip_public_story_following_v1('subscribe',$1::jsonb)",[JSON.stringify({user_id:viewer,story_id:story.story_id,
    subject_type:story.subject_type,subject_id:story.subject_id,public_version_id:v2,event_id:randomUUID(),previous_event_id:null})])
  await db.query('insert into evidence_pipeline.selective_criteria_versions values($1,$2,$3,$4,$5::jsonb)',[
    'synthetic-criteria','synthetic-v1','synthetic-policy','synthetic-explicit-test-acceptance',JSON.stringify({contract_version:'selective-metadata-rules-1',analyze_signals:['explicit_scope','correction','new_relevant_input'],low_value_domains:[],religion_shared_scope:true})])
  const rights=await scalar(db,"select mip_private.append_market_revision('source_rights',$1,$2::jsonb,'synthetic-rights-test','synthetic-method-v1')",[
    first.version,JSON.stringify({publicVersionId:first.version,captureId:first.capture_id,payloadHash:first.hash,displayExcerpt:false,attribution:'Synthetic only; no rights admission',termsUrl:'https://example.invalid/terms',checkedAt:'2026-10-02T00:00:00Z',validUntil:null,reviewRef:'synthetic-test'})])
  await scalar(db,"select mip_private.bind_comparison_member($1,$2,'synthetic-comparison-review')",[first.version,event])
  const pending=await scalar(db,"insert into public.articles(feed,outlet,title,url,summary,body_text,ingestion_run_id) values('synthetic','Synthetic private source','Pending private plan','https://example.invalid/launch-sequence/legacy','Pending raw summary','Pending raw body','synthetic-launch-legacy') returning id")
  const selected=await roleCall(db,'service_role',"select public.mip_legacy_extraction_v1('read_pending',$1::jsonb)",[JSON.stringify({run_tag:'synthetic-launch-legacy',limit:25,extractor_version:'legacy-pure-candidates-v1'})])
  const selectedSource=selected.articles.find(a=>a.id===pending)
  const plan={metadata_only:false,normalization:{title:selectedSource.title,summary:selectedSource.summary,body_text:selectedSource.body_text,image_url:null,image_alt:null},claims:[],entities:[],citations:[],proposed_digest:false}
  const legacy=await roleCall(db,'service_role',"select public.mip_legacy_extraction_v1('complete_private',$1::jsonb)",[
    JSON.stringify({article_id:pending,record_version_id:selectedSource.record_version_id,source_hash:selectedSource.source_hash,extractor_version:'legacy-pure-candidates-v1',plan})])
  return {first,second,story,material,viewer,follow,rights,legacy,pending}
}
export async function retainedHistory(db){
  const result={}
  for(const table of ['public.articles','evidence_pipeline.record_versions','evidence_pipeline.article_captures','evidence_pipeline.import_jobs','evidence_pipeline.import_receipts',
    'evidence_pipeline.evidence_changes','evidence_pipeline.change_jobs','mip_private.reviewed_public_article_versions','mip_private.reviewed_public_story_versions',
    'mip_private.public_story_material_changes','mip_private.public_story_follows','mip_private.public_story_follow_events','evidence_pipeline.selective_criteria_versions',
    'evidence_pipeline.investigation_selective_intake_receipts','mip_private.legacy_extraction_completions','mip_private.legacy_reviewed_completions',
    'mip_private.market_revision_qualifications','mip_private.comparison_reviewed_members','mip_private.comparison_reviewed_surfaces'])
    result[table]=await scalar(db,`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from ${table} t`)
  return result
}
