import {syntheticAppIsolation} from '../verifier/hypothesis-browser/appIsolation.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
import {readInvestigationWorkspacePreview,FIXTURE_IDS,FIXTURE_USER} from '../src/lib/investigationWorkspaceFixtures.js'

// Hosted synthetic composition test: real App, workspace, state hook, history,
// session hook and HTTP transport. Only unrelated public views/data/auth are
// isolated; this is not a browser-layout or live authorization qualification.
const root=fileURLToPath(new URL('../',import.meta.url))
const output=root+'tests/.compiled/AppHypothesisComposition.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/App.jsx'],outfile:output,
 bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],
 define:{'import.meta.env':'{"DEV":false,"BASE_URL":"/"}'},loader:{'.css':'empty'},
 plugins:[syntheticAppIsolation]})
globalThis.window={location:{hash:'',search:'',pathname:'/'},history:{replaceState(){}},
 matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),
 addEventListener(){},removeEventListener(){}}
const {default:App}=await import(pathToFileURL(output))
const endpoint='https://synthetic.invalid/hypothesis'
const auth=token=>({loading:false,user:FIXTURE_USER,session:{user:FIXTURE_USER,access_token:token,expires_at:Math.floor(Date.now()/1000)+3600}})
const preview=()=>readInvestigationWorkspacePreview('?privateInvestigationFixture=populated',{DEV:true})
const response=data=>new Response(JSON.stringify({data}),{headers:{'content-type':'application/json'}})
function payload(action,label='Synthetic App history is visible'){
 if(action==='backlog')return {contract_version:'mip_hypothesis_reassessment_backlog_v1',investigation_id:FIXTURE_IDS.comparable,
 publication_allowed:false,completed_reassessment:false,coverage:'retained_causes_only',causes:[]}
 const assessment=hypothesisFixture();assessment.question_id=FIXTURE_IDS.comparable;assessment.comparison.rationale=label
 return {contract_version:'mip_hypothesis_history_v1',investigation_id:FIXTURE_IDS.comparable,publication_allowed:false,
 temporal_scope:'retained_versions_only',historical_commit_visibility_qualified:false,entries:[{revision_id:assessment.id,
 revision:assessment.revision,completed_at:assessment.completed_at,status:'available',assessment,current_context:true,reassessment_pending:false}]}
}
const text=tree=>JSON.stringify(tree.toJSON())
const refresh=tree=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Refresh assessment history')
test('normal App routes configured synthetic history through workspace; current denial clears private bundle',async()=>{
 const original=globalThis.fetch,calls=[];let tree,deny=false
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,endpoint);assert.equal(options.headers.Authorization,'Bearer synthetic-current')
  const {action,input}=JSON.parse(options.body);calls.push(action);assert.equal(input.investigation_id,FIXTURE_IDS.comparable)
  return deny?new Response(JSON.stringify({error:{code:'access_denied'}}),{status:403,headers:{'content-type':'application/json'}}):response(payload(action))
 }
 try{
  const p={privateInvestigationPreview:preview(),authSessionOverride:auth('synthetic-current')}
  await act(async()=>{tree=TestRenderer.create(createElement(App,p))})
  assert.equal(calls.length,0,'default null endpoint must stay closed')
  await act(async()=>tree.update(createElement(App,{...p,hypothesisEndpoint:endpoint})))
  assert.ok(calls.includes('history'));assert.match(text(tree),/Synthetic App history is visible/)
  const workspace=()=>tree.root.find(n=>n.type?.name==='PrivateInvestigationWorkspace').props.workspace
  assert.equal(workspace().state.bundle.investigation_id,FIXTURE_IDS.comparable)
  deny=true
  await act(async()=>refresh(tree).props.onClick())
  assert.match(text(tree),/This investigation is unavailable/)
  assert.doesNotMatch(text(tree),/Synthetic App history is visible/)
  assert.equal(workspace().state.bundle,null)
  assert.equal(workspace().state.inspector,null)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
for(const lateKind of ['success','denial']) test('normal App ignores superseded '+lateKind+' and logout clears current private history',async()=>{
 const original=globalThis.fetch;let tree,release,oldSignal
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,endpoint);const {action}=JSON.parse(options.body)
  if(options.headers.Authorization==='Bearer synthetic-old'&&action==='history'){
   oldSignal=options.signal;return new Promise(r=>release=r)
  }
  return response(payload(action,'Current synthetic App assessment'))
 }
 try{
  const p={privateInvestigationPreview:preview(),hypothesisEndpoint:endpoint}
  await act(async()=>{tree=TestRenderer.create(createElement(App,{...p,authSessionOverride:auth('synthetic-old')}))})
  assert.equal(typeof release,'function','normal App must actually issue history through the transport')
  await act(async()=>tree.update(createElement(App,{...p,authSessionOverride:auth('synthetic-new')})))
  assert.equal(oldSignal.aborted,true);assert.match(text(tree),/Current synthetic App assessment/)
  await act(async()=>release(lateKind==='success'?response(payload('history','Superseded private text')):
   new Response(JSON.stringify({error:{code:'access_denied'}}),{status:403,headers:{'content-type':'application/json'}})))
  assert.doesNotMatch(text(tree),/Superseded private text/);assert.match(text(tree),/Current synthetic App assessment/)
  await act(async()=>tree.update(createElement(App,{...p,authSessionOverride:{loading:false,user:null,session:null}})))
  assert.doesNotMatch(text(tree),/Current synthetic App assessment|Superseded private text/)
  assert.match(text(tree),/Sign in to read assigned investigations/)
 }finally{act(()=>tree?.unmount());globalThis.fetch=original}
})
