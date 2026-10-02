import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createClient } from '@supabase/supabase-js'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { installComparisonReviewedVersionFixture } from '../scripts/comparisonReviewedVersionPackage.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'
import { createNewsBackend } from '../src/lib/newsBackend.js'
import { newsNavigationFromComparisonSurface } from '../src/lib/sourceComparisonReadPath.js'

const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
const out=new URL('./.compiled/App-exact-comparison-news.mjs',import.meta.url)
await mkdir(new URL('./.compiled/',import.meta.url),{recursive:true})
await esbuild.build({absWorkingDir:new URL('..',import.meta.url).pathname,entryPoints:['src/App.jsx'],outfile:out.pathname,
  bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],
  define:{'import.meta.env':'{"DEV":false,"BASE_URL":"/"}'},plugins:[{name:'bounded-App-surfaces',setup(b){
    b.onResolve({filter:/\/(views|panels|graph|components)\//},a=>{
      if(a.path.endsWith('.js')||['NewsView','SourceComparisonView'].includes(a.path.split('/').at(-1).replace(/\.jsx$/,'')))return
      return{path:a.path,namespace:'probe'}
    })
    b.onResolve({filter:/\/(mipBackend|auth|usePrivateInvestigationWorkspace)(\.js)?$/},a=>({path:a.path,namespace:'probe'}))
    b.onLoad({filter:/.*/,namespace:'probe'},a=>{
      const n=a.path.split('/').at(-1).replace(/\.jsx$/,'')
      if(n.startsWith('mipBackend'))return{contents:'export const mipBackend=globalThis.__exactComparisonBackend'}
      if(n.startsWith('auth'))return{contents:'export const useAuthSession=()=>({user:null,loading:false});export const loadAccountUiFlag=async()=>false'}
      if(n.startsWith('usePrivate'))return{contents:'export const usePrivateInvestigationWorkspace=()=>({status:"unauthenticated",state:{panels:{},bundle:null}})'}
      const stub=`import {createElement} from 'react';const probe=n=>p=>createElement('probe-'+n,p,p.children);export default probe('${n}');`
      if(n==='InvestigationWorkspace')return{contents:`import {createElement} from 'react';export default p=>createElement('probe-InvestigationWorkspace',p,p.searchSlot,p.leftNav,p.details,p.children);export const WorkspaceNavButton=p=>createElement('button',p,p.item.label);export const WorkspaceSearch=p=>createElement('probe-WorkspaceSearch',p);export const WorkspaceAccountButton=p=>createElement('probe-Account',p);export const WorkspaceInfoButton=p=>createElement('probe-Info',p);`}
      if(n==='PrivateInvestigationWorkspace')return{contents:stub+'export const PrivateInvestigationInspector=probe("PrivateInvestigationInspector");'}
      return{contents:stub}
    })
    b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}))
  }}]})

const listeners=new Map(),location={hash:'#/',pathname:'/',search:''}
globalThis.window={location,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
  addEventListener:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},
  removeEventListener:(n,f)=>listeners.get(n)?.delete(f),history:{replaceState(_s,_t,url){location.hash=url.slice(url.indexOf('#'))}}}
globalThis.document={activeElement:null}
globalThis.__exactComparisonBackend={investigations:{},publicData:{}}
const {default:App}=await import(out.href)
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(''):typeof n==='object'?text(n.children??n.props?.children):String(n)
const settle=async()=>{for(let n=0;n<6;n++)await act(async()=>{await new Promise(resolve=>setImmediate(resolve))})}
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})

async function fixture(){
  const browser=globalThis.window,document=globalThis.document
  delete globalThis.window;delete globalThis.document
  let f
  try{f=await createReviewedVersionFixture()}finally{globalThis.window=browser;globalThis.document=document}
  const {db,scalar}=f
  const secondClaim=await scalar(`insert into public.article_claims(article_id,claim_id,surface_text,char_start,char_end,evidence_source_field,evidence_excerpt,auditability_state)
    select $1,claim_id,surface_text,char_start,char_end,evidence_source_field,evidence_excerpt,auditability_state from public.article_claims where id=$2 returning id`,[f.second.article_id,f.article_claim_id])
  const firstVersion=await f.bindArticle(f.first),secondVersion=await f.bindArticle(f.second,{claims:[secondClaim]})
  await installComparisonReviewedVersionFixture(db)
  for(const [v,ac]of[[firstVersion,f.article_claim_id],[secondVersion,secondClaim]]){
    await scalar('select mip_private.bind_comparison_member($1,$2,$3)',[v,f.event_id,'synthetic-comparison-review'])
    await scalar('select mip_private.bind_comparison_surface($1,$2,$3)',[v,ac,'synthetic-surface-review'])
  }
  let actor='synthetic-account-a',queue=Promise.resolve(),rpcCount=0,holdNumber=null,held=null
  const calls=[]
  const client=createClient('https://comparison-exact-news.invalid','synthetic-public-key',{accessToken:async()=>actor,
    global:{fetch:async(input,init)=>{
      const request=new Request(input,init),url=new URL(request.url),name=url.pathname.split('/').at(-1)
      const p=url.pathname.includes('/rpc/')?await request.json():null
      const call={name,p,actor:request.headers.get('authorization'),params:url.searchParams};calls.push(call)
      const number=name==='read_reviewed_public_article_v1'?++rpcCount:null
      const run=queue.then(async()=>{
        await db.exec('set role authenticated')
        try{
          if(name==='read_reviewed_public_article_v1')return await f.readArticle(p.p_article_id,p.p_public_version_id)
          if(name==='comparison_public')return(await db.query('select * from public.comparison_public order by event_key offset $1 limit $2',
            [Number(url.searchParams.get('offset')??0),Number(url.searchParams.get('limit')??100)])).rows
          if(name==='news_reviewed_articles_public'){
            const id=url.searchParams.get('id')?.slice(3),source=url.searchParams.get('url')?.slice(3)
            const rows=(await db.query('select * from public.news_reviewed_articles_public where ($1::uuid is null or id=$1) and ($2::text is null or url=$2)',[id??null,source??null])).rows
            return request.headers.get('accept')?.includes('vnd.pgrst.object')?rows[0]??null:rows
          }
          throw Error('Unexpected SDK endpoint '+name)
        }finally{await db.exec('reset role')}
      });queue=run.catch(()=>{})
      const data=await run
      if(holdNumber!==null&&number===holdNumber){holdNumber=null;await new Promise(resolve=>{held={call,data,release:()=>{held=null;resolve()}}})}
      return response(data)
    }}})
  const backend=createPublicDataBackend(client),realNews=createNewsBackend(client),ancillary=[]
  const news={...realNews,loadArticles:async()=>({articles:[],total:0}),loadOutletDirectory:async()=>[],loadFilteredSourceMetricRows:async()=>[],
    loadArticleCitationMap:async()=>new Map(),loadEventGrouping:async()=>new Map(),loadOutletRegions:async()=>new Map(),
    loadCorpusMeta:async()=>null,loadNewSinceCount:async()=>0,loadStoryDirectory:async()=>({status:'unavailable',stories:[]})}
  for(const method of ['loadArticleStory','loadArticleGraphLinks','loadSkyVerification','loadArticleTimelineKey','loadArticleComparisonEvents'])
    news[method]=async()=>{ancillary.push(method);return method==='loadArticleGraphLinks'?[{nodeId:f.graph_node_id,label:'CURRENT-HEAD-ANALYTICS'}]:method==='loadArticleComparisonEvents'?[{eventId:'current',title:'CURRENT-HEAD-COMPARISON'}]:null}
  globalThis.__exactComparisonBackend.publicData={...backend,news,loadGraph:async()=>({nodes:[{id:f.graph_node_id,type:'event',label:'Synthetic retained owner event'}],edges:[],source:'fixture'}),
    loadGraphCoverage:async()=>null,loadNodeLocations:async()=>[],loadTopics:async()=>null,loadCorpusMeta:async()=>null,
    loadInvestigationSurface:async()=>null,curated:{loadPhase3BetaFlag:async()=>false}}
  const model=await backend.loadSourceComparisonView(),surface=model.events[0].claims[0].surfaces.find(s=>s.sourceVersion.publicVersionId===firstVersion)
  return{...f,firstVersion,secondVersion,backend,news,client,calls,ancillary,target:newsNavigationFromComparisonSurface(surface),
    setActor:value=>{actor=value},holdAfter:n=>{holdNumber=rpcCount+n},held:()=>held}
}

test('explicit comparison references use canonical exact RPC and fail closed without URL/head fallback',async t=>{
  const f=await fixture();t.after(()=>f.db.close())
  const target=f.target,result=await f.backend.resolveEligibleArticleForNews(target)
  assert.equal(result.articleId,f.first.article_id);assert.equal(result.publicVersionId,f.firstVersion)
  const detail=await f.news.loadArticleDetail(result.articleId,{publicVersionId:result.publicVersionId,sourceVersion:result.sourceVersion,
    supabaseClient:{rpc(){throw Error('client replacement forbidden')}}})
  assert.equal(detail.public_version_id,f.firstVersion);assert.equal(detail.claims[0].span_start,2)
  const refs=[null,{}, {...target.sourceVersion,articleId:f.second.article_id},{...target.sourceVersion,captureId:f.second.capture_id},
    {...target.sourceVersion,captureHash:'0'.repeat(64)},{...target.sourceVersion,articleClaimId:'00000000-0000-4000-8000-000000000001'},
    {...target.sourceVersion,sourceField:'title'},{...target.sourceVersion,spanStart:3},{...target.sourceVersion,spanEnd:target.sourceVersion.spanEnd+1},
    {...target.sourceVersion,excerptHash:'0'.repeat(64)},{...target.sourceVersion,publicVersionId:'invalid'}]
  for(const sourceVersion of refs){
    const before=f.calls.length
    assert.equal(await f.backend.resolveEligibleArticleForNews({...target,sourceVersion}),null)
    assert.equal(f.calls.slice(before).some(c=>c.name==='news_reviewed_articles_public'),false)
  }
  assert.equal(await f.backend.resolveEligibleArticleForNews({...target,url:'https://example.invalid/wrong-source'}),null)
  assert.equal(await f.backend.resolveEligibleArticleForNews(f.first.article_id),f.first.article_id)
  assert.equal(await f.backend.resolveEligibleArticleForNews({url:f.article.url}),f.first.article_id)
  assert.equal((await f.news.loadArticleDetail(f.first.article_id)).public_version_id,f.firstVersion)
  assert.equal((await f.news.loadArticleDetail(f.first.article_id,{publicVersionId:'bad'})).articlesUnavailable,'reviewed_version_invalid')
  assert.ok(f.calls.filter(c=>c.name==='read_reviewed_public_article_v1').every(c=>c.p.p_public_version_id!==null))
})

test('actual SQL → installed SDK → mounted App Comparison → News retains exact source identity through source and navigation changes',async t=>{
  const f=await fixture();t.after(()=>f.db.close());let tree
  const workspace=()=>tree.root.findByType('probe-InvestigationWorkspace'),ic=()=>workspace().props.investigationContext
  const auth=user=>({authSessionOverride:{user:{id:user},loading:false}})
  const mount=async()=>{location.hash='#/';f.setActor('synthetic-account-a');await act(async()=>{tree=TestRenderer.create(React.createElement(App,auth('synthetic-account-a')))});await settle()}
  const unmount=async()=>{if(tree){await act(async()=>tree.unmount());tree=null}}
  t.after(unmount)
  const changeView=async value=>{await act(async()=>workspace().props.onChangeView(value));await settle()}
  const click=async()=>{const buttons=tree.root.findAllByType('button').filter(b=>text(b).includes('Open in News'));assert.equal(buttons.length,2)
    const source=buttons.find(b=>text(b.parent).includes('Synthetic source A'));assert.ok(source)
    await act(async()=>source.props.onClick());await settle()}
  await t.test('pending captures preserve exact admitted claims, native article identity and tab return',async()=>{
    await f.db.exec('begin');await mount();assert.equal(ic().active_view,'news')
    await changeView('compare');assert.match(text(tree.toJSON()),/Synthetic vessel event/)
    await f.ingest({...f.article,summary:'PRIVATE_PENDING_REPLACEMENT'},'synthetic-navigation-pending')
    await click();assert.equal(ic().canonical_subject_id,f.first.article_id);assert.equal(ic().canonical_subject_type,'article')
    assert.equal(tree.root.find(n=>typeof n.type==='function'&&n.type.name==='NewsView').props.focusArticleVersionId,f.firstVersion)
    assert.match(text(tree.toJSON()),/Reviewed source version 1|capture is pending review/)
    assert.match(text(tree.toJSON()),/A source reports a vessel arrival/);assert.doesNotMatch(text(tree.toJSON()),/PRIVATE_PENDING_REPLACEMENT|CURRENT-HEAD/)
    assert.equal(f.ancillary.length,0)
    await changeView('graph');assert.equal(ic().canonical_subject_id,f.first.article_id)
    await changeView('news');assert.match(text(tree.toJSON()),/Reviewed source version 1/)
    await unmount();await f.db.exec('rollback')
  })
  await t.test('a newer admission decision never silently replaces the clicked reviewed version',async()=>{
    await f.db.exec('begin');await mount();await changeView('compare')
    const v2=await f.bindArticle(f.first,{review:'synthetic-navigation-v2',predecessor:f.firstVersion,reason:'Synthetic owner re-review of the same retained capture.'})
    await click();assert.notEqual(v2,f.firstVersion)
    assert.match(text(tree.toJSON()),/earlier reviewed decision remains authorized/)
    assert.equal(tree.root.find(n=>typeof n.type==='function'&&n.type.name==='NewsView').props.focusArticleVersionId,f.firstVersion)
    const actual=await f.news.loadArticleDetail(f.first.article_id,{publicVersionId:f.firstVersion,sourceVersion:f.target.sourceVersion})
    assert.equal(actual.is_current_source_version,false);assert.equal(actual.superseded_by_public_version_id,v2)
    assert.equal((await f.news.loadArticleDetail(f.first.article_id)).public_version_id,v2)
    assert.equal(f.ancillary.length,0)
    await unmount();await f.db.exec('rollback')
  })
  await t.test('withdrawal after resolution is rechecked in News and cannot fall back to a readable newer report',async()=>{
    await f.db.exec('begin');await mount();await changeView('compare');f.holdAfter(1)
    await click();assert.ok(f.held())
    await f.bindArticle(f.first,{kind:'source_report',claims:[],review:'synthetic-readable-report',predecessor:f.firstVersion,reason:'Synthetic report-only supersession.'})
    await f.db.query('update public.article_claims set is_current=false where id=$1',[f.article_claim_id])
    assert.equal((await f.readArticle(f.first.article_id)).admission_kind,'source_report')
    f.held().release();await settle()
    assert.match(text(tree.toJSON()),/selected reviewed source version is unavailable/)
    assert.doesNotMatch(text(tree.toJSON()),/SOURCE REPORT|Reviewed source version 2|A source reports a vessel arrival/)
    assert.equal(await f.backend.resolveEligibleArticleForNews(f.target),null)
    await unmount();await f.db.exec('rollback')
  })
  await t.test('account and view changes cancel delayed handoffs before canonical context changes',async()=>{
    await f.db.exec('begin');await mount();await changeView('compare');f.holdAfter(1)
    await click();assert.ok(f.held());const before=ic().canonical_subject_id
    f.setActor('synthetic-account-b');await act(async()=>tree.update(React.createElement(App,auth('synthetic-account-b'))));await settle()
    f.held().release();await settle();assert.equal(ic().canonical_subject_id,before);assert.equal(ic().active_view,'compare')
    f.holdAfter(1);await click();assert.ok(f.held());await changeView('graph')
    f.held().release();await settle();assert.equal(ic().active_view,'graph');assert.equal(ic().canonical_subject_id,before)
    await unmount();await f.db.exec('rollback')
  })
  await t.test('late account detail cannot overwrite freshly rechecked currentness; new subjects clear version state',async()=>{
    await f.db.exec('begin');await mount();await changeView('compare');f.holdAfter(2)
    await click();assert.ok(f.held());assert.equal(ic().canonical_subject_id,f.first.article_id)
    await f.bindArticle(f.first,{review:'synthetic-account-rereview',predecessor:f.firstVersion,reason:'Synthetic newer decision while detail is in flight.'})
    f.setActor('synthetic-account-b');await act(async()=>tree.update(React.createElement(App,auth('synthetic-account-b'))));await settle()
    assert.match(text(tree.toJSON()),/earlier reviewed decision remains authorized/)
    f.held().release();await settle();assert.match(text(tree.toJSON()),/earlier reviewed decision remains authorized/)
    assert.doesNotMatch(text(tree.toJSON()),/selected current reviewed decision|CURRENT-HEAD/)
    location.hash=`#/event/${f.graph_node_id}/graph`
    await act(async()=>{for(const fn of listeners.get('hashchange')??[])fn()});await settle();await changeView('news')
    const news=tree.root.find(n=>typeof n.type==='function'&&n.type.name==='NewsView')
    assert.equal(news.props.focusArticleVersionId,null);assert.equal(news.props.focusArticleSourceVersion,null)
    assert.equal(ic().canonical_subject_id,f.graph_node_id)
    assert.ok(f.calls.some(c=>c.actor==='Bearer synthetic-account-b'&&c.name==='read_reviewed_public_article_v1'))
    await unmount();await f.db.exec('rollback')
  })
})
