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
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/PrivateMarketsApp.mjs'
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
   assert.deepEqual(args.slice(1,4),[marketScope.investigation,marketScope.workspace,'synthetic-only'])
   if(query)return query(sql,args,options)
   if(mode()==='denied')throw Object.assign(Error('synthetic'),{code:'42501'})
   const data=marketsResult({asset_id:args[4],event_id:args[5],at:args[6]})
   if(mode()==='empty')data.paths=[]
   if(mode()==='wrong_observation')data.observation_id='00000000-0000-4000-8000-000000000099'
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
test('normal App private Markets uses shared typed records in both directions with exact scope, no default endpoint or storage leak',async()=>{
 const original=globalThis.fetch,h=harness();globalThis.fetch=h.fetch;let tree
 try{
  const p={privateInvestigationPreview:marketsPreview(),authSessionOverride:marketsAuth()}
  await act(async()=>{tree=TestRenderer.create(createElement(App,p))})
  assert.equal(button(tree,'Open private Markets evidence'),undefined);assert.equal(h.calls.length,0)
  await act(async()=>tree.update(createElement(App,{...p,privateMarketsEndpoint:marketsEndpoint})))
  assert.equal(h.calls.length,0);await openRead(tree)
  assert.match(content(tree),/Synthetic equity instrument/);assert.match(content(tree),/Synthetic cryptoasset/)
  assert.match(content(tree),/Synthetic intermediary/);assert.match(content(tree),/A 😀 B/)
  assert.match(content(tree),/Not available in this reader/);assert.match(content(tree),/not qualified by this display/)
  assert.equal(h.calls[0].event_id,marketScope.event);assert.equal(h.calls[0].asset_id,null)
  await act(async()=>button(tree,'Explore this asset’s events').props.onClick())
  assert.equal(h.calls.at(-1).asset_id,'00000000-0000-4000-8000-000000000003');assert.equal(h.calls.at(-1).event_id,null)
  assert.match(content(tree),/Second synthetic event/)
  await act(async()=>button(tree,'Explore this event’s assets: Second synthetic event').props.onClick())
  assert.equal(h.calls.at(-1).asset_id,null);assert.equal(h.calls.at(-1).event_id,'00000000-0000-4000-8000-000000000040')
  assert.ok(h.calls.every(c=>c.at===marketsAt&&c.workspace_version_id===marketScope.workspace))
  assert.doesNotMatch(JSON.stringify({persisted,history}),/synthetic-markets|Synthetic equity|00000000-0000-4000-8000-000000000003/)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
test('current canonical Markets denial removes the entire private bundle; empty and mismatched observations never retain asset cards',async()=>{
 for(const mode of ['denied','empty','wrong_observation']){
  const original=globalThis.fetch;let currentMode='ready',tree
  const h=harness({mode:()=>currentMode});globalThis.fetch=h.fetch
  try{
   await act(async()=>{tree=TestRenderer.create(createElement(App,{privateInvestigationPreview:marketsPreview(),authSessionOverride:marketsAuth(),privateMarketsEndpoint:marketsEndpoint}))})
   await openRead(tree);assert.match(content(tree),/Synthetic equity instrument/);currentMode=mode
   await act(async()=>read(tree))
   assert.doesNotMatch(content(tree),/Synthetic equity instrument|Synthetic cryptoasset/)
   if(mode==='denied'){
    assert.match(content(tree),/This investigation is unavailable/)
    const w=tree.root.find(n=>n.type?.name==='PrivateInvestigationWorkspace').props.workspace
    assert.equal(w.state.bundle,null);assert.equal(w.state.inspector,null)
   }else if(mode==='empty')assert.match(content(tree),/No standalone asset identity is supplied/)
   else assert.match(content(tree),/unsupported or mismatched result/)
  }finally{act(()=>tree?.unmount());globalThis.fetch=original}
 }
})
for(const late of ['success','denial'])test('normal App Markets ignores superseded '+late+' and clears on logout',async()=>{
 const original=globalThis.fetch;let tree,release,first=true
 const h=harness({query:async(_,args)=>{
  if(first){first=false;return new Promise((resolve,reject)=>release=()=>{if(late==='denial')reject(Object.assign(Error('synthetic'),{code:'42501'}))
   else{const data=marketsResult({asset_id:args[4],event_id:args[5],at:args[6]});data.paths[0].name='SUPERSEDED PRIVATE ASSET';resolve({rows:[{value:data}]})}})}
  return {rows:[{value:marketsResult({asset_id:args[4],event_id:args[5],at:args[6]})}]}
 }})
 globalThis.fetch=h.fetch
 try{
  const p={privateInvestigationPreview:marketsPreview(),privateMarketsEndpoint:marketsEndpoint}
  await act(async()=>{tree=TestRenderer.create(createElement(App,{...p,authSessionOverride:marketsAuth('synthetic-old')}))})
  await openRead(tree);assert.equal(typeof release,'function')
  await act(async()=>tree.update(createElement(App,{...p,authSessionOverride:marketsAuth('synthetic-new')})))
  assert.doesNotMatch(content(tree),/SUPERSEDED PRIVATE ASSET/);await openRead(tree)
  assert.match(content(tree),/Synthetic equity instrument/)
  await act(async()=>release());assert.match(content(tree),/Synthetic equity instrument/)
  assert.doesNotMatch(content(tree),/SUPERSEDED PRIVATE ASSET|This investigation is unavailable/)
  await act(async()=>tree.update(createElement(App,{...p,authSessionOverride:{loading:false,user:null,session:null}})))
  assert.doesNotMatch(content(tree),/Synthetic equity instrument|Synthetic cryptoasset|SUPERSEDED PRIVATE ASSET/)
  assert.match(content(tree),/Sign in to read assigned investigations/)
 }finally{release?.();act(()=>tree?.unmount());globalThis.fetch=original}
})
test('invalid valid-time drafts clear prior results without a request and expired session cannot disclose',async()=>{
 const original=globalThis.fetch,h=harness();globalThis.fetch=h.fetch;let tree
 try{
  const p={privateInvestigationPreview:marketsPreview(),privateMarketsEndpoint:marketsEndpoint}
  await act(async()=>{tree=TestRenderer.create(createElement(App,{...p,authSessionOverride:marketsAuth()}))})
  await openRead(tree);const count=h.calls.length
  const input=tree.root.findAllByType('input').find(n=>n.props.placeholder==='2026-06-01T00:00:00Z')
  await act(async()=>input.props.onChange({target:{value:'2026-06-01'}}));assert.doesNotMatch(content(tree),/Synthetic equity instrument/)
  await act(async()=>read(tree));assert.equal(h.calls.length,count);assert.match(content(tree),/explicit-offset valid-time timestamp/)
  const expired=marketsAuth();expired.session.expires_at=1
  await act(async()=>tree.update(createElement(App,{...p,authSessionOverride:expired})));await openRead(tree)
  assert.equal(h.calls.length,count);assert.doesNotMatch(content(tree),/Synthetic equity instrument/)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
