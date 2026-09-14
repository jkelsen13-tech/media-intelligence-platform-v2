import {syntheticAppIsolation} from '../verifier/hypothesis-browser/appIsolation.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {readInvestigationWorkspacePreview,FIXTURE_BUNDLES} from '../src/lib/investigationWorkspaceFixtures.js'

// Real App, context, navigation buttons, private hook and handoff helper.
// Unrelated public renderers/data and auth are isolated, not live-qualified.
const root=fileURLToPath(new URL('../',import.meta.url))
const output=root+'tests/.compiled/AppPublicContextContinuity.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
const backendIsolation={name:'route-public-data',setup(build){
 build.onResolve({filter:/\/lib\/mipBackend(\.js)?$/},args=>{
  if(args.importer.endsWith('/src/App.jsx'))return {path:args.path,namespace:'route-backend'}
 })
 build.onLoad({filter:/.*/,namespace:'route-backend'},()=>({contents:'export const mipBackend=globalThis.__routeBackend'}))
}}
await esbuild.build({absWorkingDir:root,entryPoints:['src/App.jsx'],outfile:output,
 bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],
 define:{'import.meta.env':'{"DEV":false,"BASE_URL":"/"}'},loader:{'.css':'empty'},
 plugins:[backendIsolation,syntheticAppIsolation]})
const event='acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const graph={source:'supabase',nodes:[
 {id:event,type:'event',label:'Synthetic public event',occurred_at:'2024-04-08'},
 {id:other,type:'actor',label:'Synthetic selected child'}],edges:[]}
const signedOut={loading:false,user:null,session:null}
const preview=mode=>readInvestigationWorkspacePreview('?privateInvestigationFixture='+mode,{DEV:true})
const shell=tree=>tree.root.find(n=>n.type?.name==='InvestigationWorkspace').props
const workspace=tree=>tree.root.find(n=>n.type?.name==='PrivateInvestigationWorkspace').props.workspace
const click=async(tree,label)=>act(async()=>{
 const button=tree.root.findAllByType('button').find(n=>n.props.role==='tab'&&n.children.includes(label))
 assert.ok(button,'real workspace tab exists: '+label)
 button.props.onClick()
})
let sequence=0
async function mount({deferred=false,privateMode=null,auth=null,publicGraph=graph}={}){
 const original={window:globalThis.window,fetch:globalThis.fetch,backend:globalThis.__routeBackend}
 let release,tree
 const listeners=new Map()
 globalThis.window={location:{hash:'#/event/'+event+'/investigations?entity='+other+'&time=2024-04-08',search:'',pathname:'/'},
 history:{replaceState(_state,_title,url){window.location.hash=String(url).slice(String(url).indexOf('#'))}},
 matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
 addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name)}}
 globalThis.fetch=async()=>{throw new Error('Unexpected external fetch in synthetic routing test')}
 globalThis.__routeBackend={investigations:{},publicData:{
 loadCorpusMeta:async()=>null,loadGraph:()=>deferred?new Promise(r=>{release=r}):Promise.resolve(publicGraph),
 loadGraphCoverage:async()=>null,loadNodeLocations:async()=>[],loadTopics:async()=>null,
 curated:{loadPhase3BetaFlag:async()=>false},loadInvestigationSurface:async()=>null}}
 const {default:App}=await import(pathToFileURL(output).href+'?routing='+ ++sequence)
 const fixture=preview(privateMode??'empty')
 const props={investigationWorkspaceClient:fixture.client,investigationEvidenceChecksClient:fixture.checksClient,
 investigationEvidenceReviewsClient:fixture.reviewsClient,authSessionOverride:auth??(privateMode?fixture.auth:signedOut)}
 try {await act(async()=>{tree=TestRenderer.create(createElement(App,props))})}
 catch(error){globalThis.window=original.window;globalThis.fetch=original.fetch;globalThis.__routeBackend=original.backend;throw error}
 return {tree,props,App,dispatchHash:async hash=>act(async()=>{
  window.location.hash=hash
  const listener=listeners.get('hashchange');assert.equal(typeof listener,'function')
  listener()
 }),release:async()=>act(async()=>release(publicGraph)),async close(){
  await act(async()=>tree.unmount());globalThis.window=original.window;globalThis.fetch=original.fetch;globalThis.__routeBackend=original.backend
 }}
}
for(const destination of ['Graph','Timeline','World View']) test('public Investigations URL retains exact event/time via '+destination,async()=>{
 const run=await mount()
 try{
  const before=shell(run.tree).investigationContext
  assert.equal(before.canonical_subject_id,event)
  await click(run.tree,destination)
  const after=shell(run.tree).investigationContext
  assert.equal(after.canonical_subject_id,event);assert.equal(after.canonical_subject_type,'event')
  assert.equal(after.as_of_time,before.as_of_time);assert.deepEqual(after.selected_time_range,before.selected_time_range)
  assert.match(window.location.hash,new RegExp('^#/event/'+event+'/'))
  assert.ok(!window.location.hash.includes('11111111-1111-4111-8111-111111111111'))
  for(const label of ['Graph','Timeline','World View']){
   await click(run.tree,label);assert.equal(shell(run.tree).investigationContext.canonical_subject_id,event)
  }
 }finally{await run.close()}
})
test('public context survives Graph navigation before public data resolves',async()=>{
 const run=await mount({deferred:true})
 try{
  await click(run.tree,'Graph')
  assert.equal(shell(run.tree).investigationContext.canonical_subject_id,event)
  await run.release()
  assert.equal(shell(run.tree).investigationContext.canonical_subject_id,event)
  assert.match(window.location.hash,new RegExp('^#/event/'+event+'/graph'))
 }finally{await run.close()}
})
for(const boundary of ['mismatch','denial','logout']) test('private '+boundary+' cannot reuse prior public event or stale URL inspector',async()=>{
 const run=await mount({privateMode:'populated'})
 try{
  assert.ok(workspace(run.tree).state.bundle,'private question actually loaded')
  assert.notEqual(workspace(run.tree).state.panels.canonicalSubject.id,event)
  assert.notEqual(workspace(run.tree).state.panels.canonicalSubject.id,other)
  // Clicking the already-active tab must not reset the private-entry latch.
  await click(run.tree,'Investigations')
  if(boundary==='denial'){
   const w=workspace(run.tree)
   await act(async()=>assert.equal(w.actions.rejectInputImpactAccess('access_denied',w.state.bundle),true))
   assert.equal(workspace(run.tree).state.bundle,null)
  }
  if(boundary==='logout'){
   await act(async()=>run.tree.update(createElement(run.App,{...run.props,authSessionOverride:signedOut})))
   assert.equal(workspace(run.tree).state.bundle,null)
  }
  await click(run.tree,'Graph')
  assert.equal(shell(run.tree).investigationContext.canonical_subject_id,null)
  assert.equal(shell(run.tree).selectedChild,null,'stale linkSelection.entity must not restore an inspector')
  assert.equal(window.location.hash,'#/')
  for(const label of ['Timeline','World View','Graph']){
   await click(run.tree,label)
   assert.equal(shell(run.tree).investigationContext.canonical_subject_id,null)
   assert.equal(shell(run.tree).selectedChild,null)
  }
 }finally{await run.close()}
})
test('signed-in public entry with no selected private question retains event',async()=>{
 const run=await mount({auth:preview('empty').auth})
 try{await click(run.tree,'Graph');assert.equal(shell(run.tree).investigationContext.canonical_subject_id,event)}
 finally{await run.close()}
})

test('authorized exact loaded public match still replaces prior context without stale child',async()=>{
 const subject=FIXTURE_BUNDLES.comparable.version.state.canonical_subject.id
 const publicGraph={...graph,nodes:[...graph.nodes,{id:subject,type:'event',label:'Exact synthetic public match'}]}
 const run=await mount({privateMode:'populated',publicGraph})
 try{
  assert.equal(workspace(run.tree).state.panels.canonicalSubject.id,subject)
  await click(run.tree,'Graph')
  assert.equal(shell(run.tree).investigationContext.canonical_subject_id,subject)
  assert.equal(shell(run.tree).selectedChild?.id,subject)
  assert.match(window.location.hash,new RegExp('^#/event/'+subject+'/graph'))
  assert.ok(!window.location.hash.includes(other))
 }finally{await run.close()}
})

for(const destination of ['Graph','Timeline','World View']) test('explicit public hash overrides retained matching private bundle via '+destination,async()=>{
 const oldSubject=FIXTURE_BUNDLES.comparable.version.state.canonical_subject.id
 const newSubject='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
 const publicGraph={...graph,nodes:[...graph.nodes,
  {id:oldSubject,type:'event',label:'Old private question public match'},
  {id:newSubject,type:'event',label:'New public URL event'}]}
 const run=await mount({privateMode:'populated',publicGraph})
 try{
  const oldBundle=workspace(run.tree).state.bundle
  assert.ok(oldBundle);assert.equal(workspace(run.tree).state.panels.canonicalSubject.id,oldSubject)
  await run.dispatchHash('#/event/'+newSubject+'/investigations?time=2025-03-04')
  assert.equal(workspace(run.tree).state.bundle,oldBundle,'old private data remains loaded for this adversary')
  assert.equal(shell(run.tree).investigationContext.canonical_subject_id,newSubject)
  for(const label of [destination,'Investigations','Graph','Timeline','World View']){
   await click(run.tree,label)
   const context=shell(run.tree).investigationContext
   assert.equal(context.canonical_subject_id,newSubject)
   assert.equal(context.canonical_subject_type,'event')
   assert.equal(context.as_of_time,'2025-03-04')
   assert.match(window.location.hash,new RegExp('^#/event/'+newSubject+'/'))
   assert.ok(!window.location.hash.includes(oldSubject),'old private match must not substitute')
  }
 }finally{await run.close()}
})
test('explicit private re-selection after public hash latches through logout',async()=>{
 const run=await mount({privateMode:'populated'})
 try{
  const id=workspace(run.tree).state.selectedInvestigationId
  await run.dispatchHash('#/event/'+event+'/investigations?time=2025-03-04')
  const inspectorWorkspace=run.tree.root.find(n=>n.type?.name==='PrivateInvestigationInspector').props.workspace
  assert.equal(inspectorWorkspace,workspace(run.tree),'both components receive the same navigation workspace')
  assert.equal(inspectorWorkspace.actions,workspace(run.tree).actions,'private selection shares wrapped actions')
  await act(async()=>workspace(run.tree).actions.selectInvestigation(id))
  assert.ok(workspace(run.tree).state.bundle)
  await act(async()=>run.tree.update(createElement(run.App,{...run.props,authSessionOverride:signedOut})))
  await click(run.tree,'Graph')
  assert.equal(shell(run.tree).investigationContext.canonical_subject_id,null)
  assert.equal(shell(run.tree).selectedChild,null)
  assert.equal(window.location.hash,'#/')
 }finally{await run.close()}
})
