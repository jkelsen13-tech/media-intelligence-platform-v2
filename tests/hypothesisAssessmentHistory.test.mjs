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

function completedFixture() {
 const f=fixture(),cause='synthetic-completed-cause'
 f.history.entries[1].assessment.reassessment_causes=[{cause_id:cause,reason:'Synthetic saved consideration of this change.'}]
 Object.assign(f.backlog,{contract_version:'mip_hypothesis_reassessment_backlog_v2',is_completion_receipt:false,
  causes:[{cause_id:cause,revision_id:'synthetic-assessment-1',kind:'retained_source_change',state:'reassessment_recorded',
   resolution_revision_id:'synthetic-assessment-2'}]})
 return f
}
test('resolved causes link to the saved reassessment and do not remain pending',async()=>{
 const f=completedFixture();let tree
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(f.client)))})
 act(()=>tree.root.findByType('select').props.onChange({target:{value:'synthetic-assessment-1'}}))
 assert.equal(tree.root.findAllByType('p').some(p=>p.children.join('')==='1 recorded change has a saved reassessment.'),true)
 assert.doesNotMatch(content(tree),/await explicit reassessment|causes remain pending/)
 act(()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Open reassessment revision 2').props.onClick())
 assert.match(content(tree),/Later synthetic assessment/)
 const details=tree.root.findAllByType('details').find(d=>d.props.className==='piw-linked-record')
 act(()=>{const node={open:true};details.props.onToggle({target:node,currentTarget:node})})
 assert.match(content(tree),/Synthetic saved consideration/)
 assert.match(content(tree),/separate from review approval and publication eligibility/)
 act(()=>tree.unmount())
})
test('history and resolution snapshots must agree before completed assessment text is revealed',()=>{
 for(const change of [f=>f.backlog.causes[0].state='pending_explicit_reconciliation',
  f=>f.backlog.causes[0].resolution_revision_id='synthetic-assessment-1',
  f=>f.history.entries[1].assessment.reassessment_causes[0].cause_id='different',
  f=>f.backlog.contract_version='mip_hypothesis_reassessment_backlog_v1']){
  const f=completedFixture();change(f)
  assert.equal(hypothesisHistoryView(f.history,f.backlog,'synthetic-question'),null)
 }
})
test('resolving a permission cause does not restore withheld prior assessment text',async()=>{
 const f=completedFixture()
 f.backlog.causes[0].kind='permission_changed'
 Object.assign(f.history.entries[0],{status:'withheld',reason:'permission_binding_changed_fresh_review_required'})
 delete f.history.entries[0].assessment
 let tree;await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(f.client)))})
 act(()=>tree.root.findByType('select').props.onChange({target:{value:'synthetic-assessment-1'}}))
 assert.match(content(tree),/saved assessment is withheld/)
 assert.doesNotMatch(content(tree),/Original synthetic assessment/)
 assert.match(content(tree),/does not approve publication or restore/)
 act(()=>tree.unmount())
})

test('history comparison clears on refresh denial and logout',async()=>{
 const f=fixture();let denied=false,tree
 const client={...f.client,history:async()=>denied?{error:{code:'access_denied'}}:{data:f.history}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 const comparison=tree.root.findAllByType('details').find(d=>d.findAllByType('summary').some(s=>s.children.join('').startsWith('Inspect changes')))
 act(()=>{const node={open:true};comparison.props.onToggle({target:node,currentTarget:node})})
 assert.match(content(tree),/Original synthetic assessment/)
 denied=true
 await act(async()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Refresh assessment history').props.onClick())
 assert.doesNotMatch(content(tree),/Original synthetic assessment|Later synthetic assessment/)
 await act(async()=>tree.update(createElement(Panel,{...props(client),userScopeKey:null})))
 assert.equal(tree.toJSON(),null);act(()=>tree.unmount())
})

function humanRequestFixture(){
 const f=fixture()
 f.backlog.causes=[{cause_id:'synthetic-human-cause',revision_id:'synthetic-assessment-2',
  kind:'human_reconsideration',state:'pending_explicit_reconciliation',
  detail:{request_id:'synthetic-human-request',trigger:'methodology'}}]
 return f
}
function withheldDetail(){
 return {data:{contract_version:'mip_hypothesis_request_detail_v1',investigation_id:'synthetic-question',
  request_id:'synthetic-human-request',cause_id:'synthetic-human-cause',revision_id:'synthetic-assessment-2',
  trigger:'methodology',publication_allowed:false,is_approval:false,status:'withheld',
  withheld_reason:'current_evidence_permission_required'}}
}
function revealComparison(tree){
 const comparison=tree.root.findAllByType('details').find(d=>d.findAllByType('summary').some(s=>s.children.join('').startsWith('Inspect changes')))
 act(()=>{const node={open:true};comparison.props.onToggle({target:node,currentTarget:node})})
 assert.match(content(tree),/Original synthetic assessment/)
 assert.match(content(tree),/Later synthetic assessment/)
}
async function startHumanAction(tree,kind){
 if(kind==='request'){
  await act(async()=>tree.root.findByType('textarea').props.onChange({target:{value:'Synthetic concern.'}}))
  act(()=>{void tree.root.findByType('form').props.onSubmit({preventDefault(){}})})
 }else act(()=>{void tree.root.findAllByType('button').find(b=>b.children.join('')==='Inspect reassessment request').props.onClick()})
}
for(const kind of ['request','detail'])for(const code of ['authentication_required','access_denied'])
 test('human '+kind+' '+code+' clears parent private assessment and open comparison',async()=>{
  const f=humanRequestFixture(),failures=[];let resolve,tree
  const method=kind==='request'?'requestReassessment':'requestDetail'
  const client={...f.client,[method]:()=>new Promise(r=>resolve=r)}
  await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onAccessFailure:c=>failures.push(c)}))})
  revealComparison(tree);await startHumanAction(tree,kind)
  await act(async()=>resolve({error:{code}}))
  assert.doesNotMatch(content(tree),/Original synthetic assessment|Later synthetic assessment|Synthetic concern/)
  assert.match(content(tree),/Assessment history is unavailable/)
  assert.deepEqual(failures,[code]);act(()=>tree.unmount())
 })
test('validated request-detail permission withholding clears parent but unsupported/cross-scope responses do not revoke it',async()=>{
 for(const change of [null,r=>r.data.investigation_id='other',r=>r.data.withheld_reason='unsupported',r=>r.data.publication_allowed=true]){
  const f=humanRequestFixture(),failures=[];let resolve,tree
  const client={...f.client,requestDetail:()=>new Promise(r=>resolve=r)}
  await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onAccessFailure:c=>failures.push(c)}))})
  revealComparison(tree);await startHumanAction(tree,'detail')
  const response=withheldDetail();if(change)change(response)
  await act(async()=>resolve(response))
  if(change){assert.match(content(tree),/Later synthetic assessment/);assert.deepEqual(failures,[])}
  else{assert.doesNotMatch(content(tree),/Original synthetic assessment|Later synthetic assessment/);assert.deepEqual(failures,['access_denied'])}
  act(()=>tree.unmount())
 }
})
for(const kind of ['request','detail'])for(const replacement of ['client','scope','unmount'])
 test('late human '+kind+' denial after '+replacement+' cannot clear replacement context',async()=>{
  const f=humanRequestFixture(),failures=[];let resolve,tree
  const method=kind==='request'?'requestReassessment':'requestDetail'
  const client={...f.client,[method]:()=>new Promise(r=>resolve=r)}
  const baseProps={...props(client),onAccessFailure:c=>failures.push(c)}
  await act(async()=>{tree=TestRenderer.create(createElement(Panel,baseProps))})
  revealComparison(tree);await startHumanAction(tree,kind)
  const nextProps=replacement==='client'?{...baseProps,client:{...f.client}}:{...baseProps,userScopeKey:'replacement-user'}
  if(replacement==='unmount'){
   act(()=>tree.unmount())
   await act(async()=>{tree=TestRenderer.create(createElement(Panel,nextProps))})
  }else await act(async()=>tree.update(createElement(Panel,nextProps)))
  assert.match(content(tree),/Later synthetic assessment/)
  await act(async()=>resolve({error:{code:'access_denied'}}))
  assert.match(content(tree),/Later synthetic assessment/)
  assert.deepEqual(failures,[]);act(()=>tree.unmount())
 })
test('ambiguous human request response preserves parent and exact retry identity',async()=>{
 const f=humanRequestFixture(),failures=[],calls=[];let tree
 const client={...f.client,requestReassessment:async input=>{calls.push(structuredClone(input));return{error:{code:'request_failed'}}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onAccessFailure:c=>failures.push(c)}))})
 revealComparison(tree)
 await startHumanAction(tree,'request');await act(async()=>{})
 assert.match(content(tree),/Recording is unconfirmed/);assert.match(content(tree),/Later synthetic assessment/)
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}))
 assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(failures,[])
 act(()=>tree.unmount())
})
