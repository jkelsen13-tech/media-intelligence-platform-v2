import {FIXTURE_IDS,FIXTURE_VERSIONS} from '../src/lib/investigationWorkspaceFixtures.js'
import {hypothesisEndpoint,integratedHypothesisPayload} from './privateMarketsHypothesisFixture.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {createPrivateMarketsHandler} from '../supabase/qualification/markets-evidence/handler.mjs'
import {PRIVATE_MARKETS_SQL} from '../supabase/qualification/markets-evidence/store.mjs'
import {syntheticAppIsolation} from '../verifier/markets-browser/isolatedPublicSurfaces.mjs'
import {marketsAuth,marketsPreview,marketsEndpoint,marketsOrigin,marketsResult,marketScope,marketsAt} from './privateMarketsWorkspaceFixture.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/PrivateMarketsHypothesisApp.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/App.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',
 jsx:'automatic',external:['react','react/jsx-runtime'],define:{'import.meta.env':'{"DEV":false,"BASE_URL":"/"}'},loader:{'.css':'empty'},plugins:[syntheticAppIsolation]})
const persisted=[],history=[]
globalThis.window={location:{hash:'',search:'',pathname:'/'},history:{replaceState:(...args)=>history.push(args)},
 localStorage:{getItem:()=>null,setItem:(...args)=>persisted.push(args),removeItem(){}},
 matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),addEventListener(){},removeEventListener(){}}
const {default:App}=await import(pathToFileURL(output))
const content=tree=>JSON.stringify(tree.toJSON())
const button=(tree,name)=>tree.root.findAllByType('button').find(b=>b.children.join('')===name)
const read=tree=>tree.root.findAllByType('form').find(f=>f.findAllByType('button').some(b=>b.children.join('')==='Read private evidence paths')).props.onSubmit({preventDefault(){}})
async function openRead(tree){await act(async()=>button(tree,'Open private Markets evidence').props.onClick());await act(async()=>read(tree))}
function harness({query,mode=()=> 'ready'}={}){
 const calls=[]
 const handler=createPrivateMarketsHandler({allowedOrigins:[marketsOrigin],sourceProject:'synthetic-only',
  authenticate:async bearer=>{assert.match(bearer,/^Bearer synthetic-/);return{id:marketsAuth().user.id}},
  query:async(sql,args,options)=>{
   assert.equal(sql,PRIVATE_MARKETS_SQL);assert.equal(args[0],marketsAuth().user.id)
   assert.ok([FIXTURE_IDS.comparable,FIXTURE_IDS.scope].includes(args[1]));assert.ok(Object.values(FIXTURE_VERSIONS).includes(args[2]));assert.equal(args[3],'synthetic-only')
   if(query)return query(sql,args,options)
   if(mode()==='denied')throw Object.assign(Error('synthetic'),{code:'42501'})
   const data=marketsResult({asset_id:args[4],event_id:args[5],at:args[6]})
   data.investigation_id=args[1];data.workspace_version_id=args[2];data.observation_id=args[2]===FIXTURE_VERSIONS.v1?'88888881-8888-4888-8888-888888888881':marketScope.observation
   if(mode()==='empty')data.paths=[]
   if(mode()==='wrong_observation')data.observation_id='00000000-0000-4000-8000-000000000099'
   if(mode()==='wrong_version')for(const p of data.paths){p.asset_version_id=p.aliases_version_id=p.hops[0].subject_version_id=p.hops[0].subject.version_id='00000000-0000-4000-8000-000000000099'}
   if(mode()==='wrong_event_version')for(const p of data.paths){const h=p.hops.at(-1);h.object_version_id=h.object.version_id='00000000-0000-4000-8000-000000000099'}
   return {rows:[{value:data}]}
  }})
 return{calls,fetch:async(url,options)=>{
  assert.equal(url,marketsEndpoint);assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store')
  assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer')
  const input=JSON.parse(options.body);calls.push(input)
  assert.deepEqual(Object.keys(input).sort(),['asset_id','at','event_id','investigation_id','workspace_version_id'])
  // Deliberately ignore AbortSignal in the fake network: the real client must still suppress retired replies.
  return handler(new Request(url,{method:options.method,headers:{...options.headers,origin:marketsOrigin},body:options.body}))
 }}
}

const response=data=>new Response(JSON.stringify({data}),{headers:{'content-type':'application/json'}})
const denial=()=>new Response(JSON.stringify({error:{code:'access_denied'}}),{status:403,headers:{'content-type':'application/json'}})
const hText='Later synthetic reasoning: the alternatives still remain difficult to distinguish.'
const workspace=tree=>tree.root.find(n=>n.type?.name==='PrivateInvestigationWorkspace').props.workspace
const assertBoth=tree=>{assert.match(content(tree),/Synthetic equity instrument/);assert.ok(content(tree).includes(hText))}
const noPrivate=tree=>{assert.doesNotMatch(content(tree),/Synthetic equity instrument|Synthetic cryptoasset|Later synthetic reasoning|SUPERSEDED/);assert.equal(workspace(tree).state.bundle,null);assert.equal(workspace(tree).state.inspector,null)}
function network(){
 const h=harness(),calls=[];let hook=null
 return {calls,setHook:f=>hook=f,fetch:async(url,options)=>{
  const family=url===hypothesisEndpoint?'hypothesis':'markets'
  const input=JSON.parse(options.body),action=family==='hypothesis'?input.action:'read'
  assert.ok([hypothesisEndpoint,marketsEndpoint].includes(url),'no external calls')
  calls.push({family,action,token:options.headers.Authorization})
  const normal=()=>family==='hypothesis'?response(integratedHypothesisPayload(action,null,input.input.investigation_id)):h.fetch(url,options)
  return hook?hook({family,action,options,normal}):normal()
 }}
}
const props=()=>({privateInvestigationPreview:marketsPreview(),authSessionOverride:marketsAuth(),privateMarketsEndpoint:marketsEndpoint,hypothesisEndpoint})
test('dual actual App clients coexist and optional endpoints are independently default closed',async()=>{
 const original=globalThis.fetch,n=network();globalThis.fetch=n.fetch;let tree
 try{
  const p=props();await act(async()=>{tree=TestRenderer.create(createElement(App,{...p,privateMarketsEndpoint:null,hypothesisEndpoint:null}))})
  assert.equal(n.calls.length,0)
  await act(async()=>tree.update(createElement(App,{...p,privateMarketsEndpoint:null})))
  assert.ok(content(tree).includes(hText));assert.ok(n.calls.every(c=>c.family==='hypothesis'))
  await act(async()=>tree.update(createElement(App,{...p,hypothesisEndpoint:null})));await openRead(tree)
  assert.match(content(tree),/Synthetic equity instrument/);assert.ok(!content(tree).includes(hText))
  await act(async()=>tree.update(createElement(App,p)));assertBoth(tree)
  await act(async()=>button(tree,'Explore this asset’s events').props.onClick());assertBoth(tree)
  assert.equal(workspace(tree).state.bundle.observation.id,marketScope.observation)
  assert.doesNotMatch(JSON.stringify({persisted,history}),/Later synthetic reasoning|Synthetic equity|synthetic-markets/)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
for(const denied of ['hypothesis','markets'])test('current '+denied+' denial clears both App views and late other-client success cannot revive scope',async()=>{
 const original=globalThis.fetch,n=network();globalThis.fetch=n.fetch;let tree,release,pendingSignal
 try{
  const p=props();await act(async()=>{tree=TestRenderer.create(createElement(App,p))});await openRead(tree);assertBoth(tree)
  const pending=denied==='hypothesis'?'markets':'hypothesis'
  n.setHook(({family,action,options,normal})=>family===pending&&(family==='markets'||action==='history')
   ?new Promise(r=>{pendingSignal=options.signal;release=async()=>r(await normal())}):family===denied?denial():normal())
  await act(async()=>{if(pending==='markets')read(tree);else button(tree,'Refresh assessment history').props.onClick()})
  assert.equal(typeof release,'function')
  await act(async()=>{if(denied==='markets')read(tree);else button(tree,'Refresh assessment history').props.onClick()})
  assert.match(content(tree),/This investigation is unavailable/);noPrivate(tree)
  if(pending==='markets')assert.equal(pendingSignal.aborted,true)
  await act(async()=>release());noPrivate(tree)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
for(const family of ['hypothesis','markets'])for(const late of ['success','denial'])
 test('dual clients ignore old-session '+family+' '+late+' without clearing or reviving replacement scope',async()=>{
 const original=globalThis.fetch,n=network();globalThis.fetch=n.fetch;let tree,release,oldSignal
 try{
  const p=props();n.setHook(({family:f,action,options,normal})=>f===family&&(f==='markets'||action==='history')&&options.headers.Authorization==='Bearer synthetic-old'
   ?new Promise(r=>{oldSignal=options.signal;release=async()=>r(late==='denial'?denial():await normal())}):normal())
  await act(async()=>{tree=TestRenderer.create(createElement(App,{...p,authSessionOverride:marketsAuth('synthetic-old')}))});await openRead(tree)
  assert.equal(typeof release,'function')
  await act(async()=>tree.update(createElement(App,{...p,authSessionOverride:marketsAuth('synthetic-new')})));await openRead(tree);assertBoth(tree);assert.equal(oldSignal.aborted,true)
  await act(async()=>release());assertBoth(tree);assert.doesNotMatch(content(tree),/This investigation is unavailable/)
  await act(async()=>tree.update(createElement(App,{...p,authSessionOverride:{loading:false,user:null,session:null}})));noPrivate(tree)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
for(const family of ['hypothesis','markets'])test('malformed '+family+' 403 does not authoritatively revoke the other App view',async()=>{
 const original=globalThis.fetch,n=network();globalThis.fetch=n.fetch;let tree
 try{
  await act(async()=>{tree=TestRenderer.create(createElement(App,props()))});await openRead(tree);assertBoth(tree)
  n.setHook(({family:f,normal})=>f===family?new Response('{}',{status:403}):normal())
  await act(async()=>family==='markets'?read(tree):button(tree,'Refresh assessment history').props.onClick())
  assert.ok(workspace(tree).state.bundle);assert.doesNotMatch(content(tree),/This investigation is unavailable/)
  if(family==='markets')assert.ok(content(tree).includes(hText));else assert.match(content(tree),/Synthetic equity instrument/)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
test('actual displayed session expiry clears both App clients without additional requests',async()=>{
 const original=globalThis.fetch,n=network();globalThis.fetch=n.fetch;let tree
 try{
  const p=props();p.authSessionOverride.session.expires_at=Math.floor(Date.now()/1000)+3
  await act(async()=>{tree=TestRenderer.create(createElement(App,p))});await openRead(tree);assertBoth(tree)
  const count=n.calls.length;await act(async()=>{await new Promise(r=>setTimeout(r,3200))})
  assert.equal(n.calls.length,count);noPrivate(tree);assert.match(content(tree),/Sign in to read assigned investigations/)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})

for(const replacement of ['investigation','version'])for(const family of ['hypothesis','markets'])for(const late of ['success','denial'])
 test('dual App '+replacement+' action preserves replacement scope after old '+family+' '+late,async()=>{
 const original=globalThis.fetch,n=network();globalThis.fetch=n.fetch;let tree,release,oldSignal,held=false
 try{
  await act(async()=>{tree=TestRenderer.create(createElement(App,props()))});await openRead(tree);assertBoth(tree)
  const initial=workspace(tree).state.bundle
  n.setHook(({family:f,action,options,normal})=>{
   if(!held&&f===family&&(f==='markets'||action==='history')){
    held=true;oldSignal=options.signal
    const oldResponse=normal() // Snapshot actual old request before scope changes; never regenerate replacement data.
    return new Promise(r=>release=async()=>r(late==='denial'?denial():await oldResponse))
   }return normal()
  })
  await act(async()=>family==='markets'?read(tree):button(tree,'Refresh assessment history').props.onClick())
  assert.equal(typeof release,'function')
  await act(async()=>replacement==='investigation'
   ?workspace(tree).actions.selectInvestigation(FIXTURE_IDS.scope)
   :workspace(tree).actions.selectVersion(FIXTURE_IDS.comparable,FIXTURE_VERSIONS.v1))
  const next=workspace(tree).state.bundle;assert.ok(next);assert.notEqual(next,initial)
  assert.equal(next.investigation_id,replacement==='investigation'?FIXTURE_IDS.scope:FIXTURE_IDS.comparable)
  assert.equal(next.version.id,replacement==='investigation'?FIXTURE_VERSIONS.v3:FIXTURE_VERSIONS.v1)
  if(family==='markets')assert.equal(oldSignal.aborted,true)
  // Same-session hypothesis client may survive navigation; component lifecycle must ignore its old completion.
  await openRead(tree);assertBoth(tree)
  const expectedObservation=next.observation.id
  await act(async()=>release());assertBoth(tree)
  assert.equal(workspace(tree).state.bundle,next)
  assert.equal(workspace(tree).state.bundle.observation.id,expectedObservation)
  assert.ok(content(tree).includes(expectedObservation));assert.doesNotMatch(content(tree),/This investigation is unavailable/)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
