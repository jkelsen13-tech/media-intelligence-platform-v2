import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
import {createHypothesisAssessmentClient,hypothesisHistoryView} from '../src/lib/hypothesisAssessmentClient.js'
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/HypothesisHistory.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/HypothesisAssessmentHistory.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {default:Panel}=await import(pathToFileURL(output))
function fixture(iid='synthetic-question') {
 const first=hypothesisFixture();first.question_id=iid;first.comparison.rationale='Original synthetic assessment.'
 const next=structuredClone(first);Object.assign(next,{id:'synthetic-assessment-2',revision:2,predecessor_id:first.id,
  revision_trigger:'new_evidence',revision_effect:'less_certain'})
 next.comparison.rationale='Later synthetic assessment.'
 const history={contract_version:'mip_hypothesis_history_v1',investigation_id:iid,publication_allowed:false,
  temporal_scope:'retained_versions_only',historical_commit_visibility_qualified:false,
  entries:[first,next].map(r=>({revision_id:r.id,revision:r.revision,completed_at:r.completed_at,status:'available',assessment:r,current_context:true,reassessment_pending:false}))}
 const backlog={contract_version:'mip_hypothesis_reassessment_backlog_v1',investigation_id:iid,
  publication_allowed:false,completed_reassessment:false,coverage:'retained_causes_only',causes:[]}
 const client={history:async()=>({data:history}),backlog:async()=>({data:backlog}),reconcile:async()=>({data:backlog})}
 return{history,backlog,client}
}
const content=tree=>JSON.stringify(tree.toJSON())
const props=client=>({client,investigationId:'synthetic-question',workspaceVersionId:'synthetic-workspace',userScopeKey:'synthetic-user',canReconcile:true})
test('history client carries only explicit request fields and sanitizes errors',async()=>{
 const calls=[],client=createHypothesisAssessmentClient(async(action,input)=>{calls.push({action,input});return{data:{}}})
 await client.history('iid');await client.backlog('iid');await client.reconcile('iid')
 assert.deepEqual(calls.map(c=>c.action),['history','backlog','reconcile'])
 assert.ok(calls.every(c=>Object.keys(c.input).join()==='investigation_id'))
 const denied=createHypothesisAssessmentClient(async()=>({error:{code:'secret-detail',message:'synthetic sensitive detail'}}))
 assert.deepEqual(await denied.history('iid'),{data:null,error:{code:'request_failed'}})
 assert.equal((await createHypothesisAssessmentClient().history('iid')).error.code,'not_configured')
})
test('history mapping rejects cross-scope, public, unsupported temporal and withheld-text responses',()=>{
 for(const change of [h=>h.investigation_id='other',h=>h.publication_allowed=true,h=>h.historical_commit_visibility_qualified=true,
  h=>h.entries[0].status='withheld',h=>h.entries[1].revision=1]){
  const f=fixture();change(f.history)
  assert.equal(hypothesisHistoryView(f.history,f.backlog,'synthetic-question'),null)
 }
 const f=fixture();f.backlog.causes=[{cause_id:'c',revision_id:'not-in-history',kind:'retained_source_change',state:'pending_explicit_reconciliation'}]
 assert.equal(hypothesisHistoryView(f.history,f.backlog,'synthetic-question'),null)
})
test('history panel selects immutable revisions without claiming a verified time reconstruction',async()=>{
 const f=fixture();let tree
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(f.client)))})
 assert.match(content(tree),/Later synthetic assessment/)
 assert.doesNotMatch(content(tree),/Original synthetic assessment/)
 act(()=>tree.root.findByType('select').props.onChange({target:{value:'synthetic-assessment-1'}}))
 assert.match(content(tree),/Original synthetic assessment/)
 assert.match(content(tree),/time view is not available yet/)
 act(()=>tree.unmount())
})
test('pending changes stay separate; permission changes suppress saved text',async()=>{
 for(const kind of ['retained_source_change','retained_assessment_change','permission_changed']){
  const f=fixture();f.backlog.causes=[{cause_id:'c',revision_id:'synthetic-assessment-2',kind,change_position:'9007199254740993',state:'pending_explicit_reconciliation'}]
  let tree;await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(f.client)))})
  assert.match(content(tree),/await explicit reassessment/)
  if(kind==='permission_changed')assert.doesNotMatch(content(tree),/Later synthetic assessment/)
  else{assert.match(content(tree),/Later synthetic assessment/);assert.match(content(tree),/Reassessment is pending/)}
  act(()=>tree.unmount())
 }
})
test('account changes and logout discard old responses and old private text',async()=>{
 const f=fixture();let resolve,tree
 const delayed={...f.client,history:()=>new Promise(r=>{resolve=r})}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(delayed)))})
 await act(async()=>{tree.update(createElement(Panel,{...props(f.client),userScopeKey:'other-user',investigationId:'other-question'}))})
 await act(async()=>resolve({data:f.history}))
 assert.doesNotMatch(content(tree),/Later synthetic assessment|Original synthetic assessment/)
 await act(async()=>tree.update(createElement(Panel,{...props(f.client),userScopeKey:null})))
 assert.equal(tree.toJSON(),null);act(()=>tree.unmount())
})
test('refresh clears content immediately and revoked access cannot leave the old result displayed',async()=>{
 const f=fixture();let denied=false,failures=[],tree
 const client={...f.client,history:async()=>denied?{error:{code:'access_denied'}}:{data:f.history}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onAccessFailure:code=>failures.push(code)}))})
 assert.match(content(tree),/Later synthetic assessment/);denied=true
 await act(async()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Refresh assessment history').props.onClick())
 assert.doesNotMatch(content(tree),/Later synthetic assessment/)
 assert.deepEqual(failures,['access_denied']);act(()=>tree.unmount())
})
test('missed-change reconciliation is explicit and cannot mark assessment completed',async()=>{
 const f=fixture();let reconciles=0,tree
 const client={...f.client,reconcile:async()=>{reconciles++;return{data:f.backlog}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 assert.equal(reconciles,0)
 await act(async()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Check for missed changes').props.onClick())
 assert.equal(reconciles,1);assert.match(content(tree),/Later synthetic assessment/)
 act(()=>tree.unmount())
})
