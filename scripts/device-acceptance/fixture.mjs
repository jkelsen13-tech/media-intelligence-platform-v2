// Deterministic source/session doubles, never publication or account authority.
// Actual App/views/hooks/renderers and source DTO normalizers remain mounted.
import {ownerNewsContext,fixtureUuid} from '../../tests/fixtures/newsStoryFixtures.mjs'
import {normalizePublicStoryContext,createStoryFollowingClient} from '../../src/lib/storyFollowingClient.js'
import {reviewedVersionToNewsArticle} from '../../src/lib/reviewedPublicVersion.js'
import {SPATIAL_PROJECTION_COLUMNS} from '../../src/lib/spatialProjection.js'
import {unavailableWeather} from '../../src/lib/eventTimeWeather.js'
import {createPublicDataBackend} from '../../src/lib/publicDataBackend.js'

export const AUTHORITY='SYNTHETIC_BACKEND_AND_SESSION_ONLY'
export const ACTOR_A=fixtureUuid(9001),ACTOR_B=fixtureUuid(9002)
export const context=ownerNewsContext([{at:0},{at:1,kind:'update'}])
context.story.subject_type='graph_node';context.story.subject_kind='event';context.story.subject_id=fixtureUuid(1)
for(const change of context.material_changes){change.subject_type='graph_node';change.subject_id=fixtureUuid(1)}
const normalized=normalizePublicStoryContext(context)
if(!normalized)throw Error('Device fixture rejected by actual Story normalizer')
export const STORY=normalized.story
export const RECORDED_TIME='2026-01-01T12:00:00.000Z'
const rows=Array.from({length:12},(_,i)=>({...Object.fromEntries(SPATIAL_PROJECTION_COLUMNS.map(k=>[k,null])),
  projection_contract_version:'v1',mip_object_id:fixtureUuid(i+1),subject_graph_node_id:fixtureUuid(i+1),revision_id:fixtureUuid(i+1001),revision_ordinal:1,
  object_type:'event',spatial_role:'event',precision_class:'facility',geometry_status:'coarsened_to_precision_class',review_state:'reviewed',release_state:'released',
  valid_from_utc:'2026-01-01T00:00:00Z',valid_to_utc:'2026-01-02T00:00:00Z',revision_known_at_utc:'2025-12-01T00:00:00Z',review_effective_at_utc:RECORDED_TIME,release_effective_at_utc:'2025-12-01T00:00:00Z',
  display_hint:`DEVICE_ACCEPTANCE_SYNTHETIC row ${i+1}`,display_geometry:{type:'Point',coordinates:[-81.7+(i%4)*0.01,41.4+Math.floor(i/4)*0.01]},evidence_refs:[]}))
const nodes=rows.map(row=>({id:row.subject_graph_node_id,type:'event',label:row.display_hint,summary:'Synthetic acceptance source; no real event evidence.'}))
const edges=nodes.slice(1).map((n,i)=>({id:fixtureUuid(i+2001),source:nodes[0].id,target:n.id,type:'documented',reliability:3,label:'Synthetic documented relationship'}))
const articles=normalized.story.members.map(reviewedVersionToNewsArticle)
const subscriptions=new Map()
const state={actor:ACTOR_A,offline:false,publicationAvailable:true,holdAction:null,held:[],calls:[]}
const clone=value=>JSON.parse(JSON.stringify(value))
async function observe(action,run){
  state.calls.push({action,actor:state.actor,authority:AUTHORITY});const result=run()
  if(state.holdAction===action){state.holdAction=null;await new Promise(resolve=>state.held.push(resolve))}
  return clone(result)
}
const failure=()=>({data:null,error:{code:'service_unavailable'}})
function personal(user){
  return {contract:'mip-public-story-following-v1',scope:'public_story',delivery_channel:'in_app',authenticated_user_id:user,
    story_id:STORY.story_id,subject_type:STORY.subject_type,subject_id:STORY.subject_id,story_status:'public',subscription:subscriptions.get(user)??null,
    head_public_version_id:STORY.public_version_id,story_title:'DEVICE_ACCEPTANCE_SYNTHETIC followed story',changes:[],unread_count:0,has_more:false,version_advanced:false,unclassified_version_changes:false,coverage:'declared_material_changes_only'}
}
const following=createStoryFollowingClient({call:(action,input,{expectedUserId:user})=>observe(action,()=>{
  if(state.offline)return failure()
  if(action==='read')return {data:personal(user),error:null}
  if(action==='list')return {data:{contract:'mip-public-story-following-v1',scope:'public_story',delivery_channel:'in_app',authenticated_user_id:user,items:subscriptions.get(user)?.status==='active'?[personal(user)]:[],has_more:false,next_after:null},error:null}
  const prior=subscriptions.get(user),subscription={story_id:STORY.story_id,subject_type:STORY.subject_type,subject_id:STORY.subject_id,
    anchor_public_version_id:prior?.anchor_public_version_id??input.public_version_id,acknowledged_public_version_id:input.public_version_id??prior?.acknowledged_public_version_id,
    status:action==='unsubscribe'?'unsubscribed':'active',current_event_id:input.event_id}
  subscriptions.set(user,subscription)
  return {data:{...subscription,contract:'mip-public-story-following-v1',scope:'public_story',delivery_channel:'in_app',authenticated_user_id:user,receipt_id:input.event_id,action},error:null}
})})
const emptyMap=async()=>new Map()
const news={
  loadStoryStateContext:(id,options={})=>observe('story-context',()=>state.offline||!state.publicationAvailable||id!==STORY.story_id||options.publicVersionId&&options.publicVersionId!==STORY.public_version_id?failure():{data:context,error:null}),
  loadStoryDirectory:async()=>({status:'available',stories:[STORY],has_more:false}),
  loadArticles:async(filters={})=>{const query=String(filters.search??'').toLowerCase();return {articles:articles.filter(a=>!query||(a.title+' '+a.summary).toLowerCase().includes(query)),total:articles.length}},
  loadOutletDirectory:async()=>[],loadFilteredSourceMetricRows:async()=>[],loadArticleCitationMap:emptyMap,loadEventGrouping:emptyMap,loadOutletRegions:emptyMap,
  loadCorpusMeta:async()=>null,loadNewSinceCount:async()=>0,
  loadArticleDetail:async()=>({status:'unavailable',reason:'synthetic_exact_detail_not_in_this_fixture'}),loadArticleGraphLinks:async()=>[],loadSkyVerification:async()=>null,
  loadArticleTimelineKey:async()=>null,loadArticleComparisonEvents:async()=>[],loadArticleStory:async()=>({status:'available',story:STORY})
}
export const mipBackend={investigations:{storyFollowing:following},publicData:{...createPublicDataBackend(null),news,
  loadGraph:async()=>({nodes,edges,source:'DEVICE_ACCEPTANCE_SYNTHETIC'}),loadCorpusMeta:async()=>null,loadGraphCoverage:async()=>null,loadNodeLocations:async()=>[],loadTopics:async()=>null,loadInvestigationSurface:async()=>null,
  curated:{loadPhase3BetaFlag:async()=>false},
  spatial:{loadSpatialProjection:async()=>({status:state.offline?'unavailable':'ok',reason:state.offline?'read_error':null,rows:state.offline?[]:clone(rows),error:null,loadedAt:RECORDED_TIME}),
    loadWorldViewGraph:async()=>({status:'ok',nodes,edges,edgesUnavailable:null,error:null}),loadTemporalAssessment:async()=>null,loadEventTimeWeather:async()=>unavailableWeather('synthetic_no_weather_authority')}
}}
export function installFixtureBridge(render){
  window.__MIP_DEVICE_ACCEPTANCE__={authority:AUTHORITY,story:STORY,rows:clone(rows),recordedTime:RECORDED_TIME,
    actor:(id,ready=true)=>{state.actor=id;render({user:id?{id}:null,loading:!ready})},
    offline:value=>{state.offline=value},publication:value=>{state.publicationAvailable=value},hold:action=>{state.holdAction=action},
    release:()=>{for(const resolve of state.held.splice(0))resolve()},stats:()=>({held:state.held.length,calls:clone(state.calls)})}
  render({user:{id:ACTOR_A},loading:false})
}
