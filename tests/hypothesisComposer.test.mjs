import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {syntheticAuthoringContext,fillSyntheticComposer} from './hypothesisComposerFixture.mjs'
import {buildComposerSubmission,createAssessmentDraft,validAuthoringContext,validComposerReceipt,verifyComposerSpan} from '../src/lib/hypothesisAssessmentComposer.js'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
import {createHypothesisAssessmentClient} from '../src/lib/hypothesisAssessmentClient.js'
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/HypothesisComposer.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/HypothesisAssessmentComposer.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {default:Composer,ComposerForm:Form}=await import(pathToFileURL(output))
const uid='00000000-0000-4000-8000-000000000001'
function spanFixture(c=syntheticAuthoringContext()) {
 const m=c.materials[0],input={input_position:m.input_position,source_field:'summary',start:2,end:5}
 return{input,result:{contract_version:'mip_hypothesis_authoring_span_v1',investigation_id:c.investigation_id,
  workspace_version_id:c.workspace_version_id,observation_id:c.observation_id,publication_allowed:false,...input,
  material_version:m.material_version,material_hash:m.material_hash,acquired_at:m.acquired_at,published_at:null,event_time:null,
  excerpt:'😀 B',excerpt_sha256:createHash('sha256').update('😀 B').digest('hex')}}
}
function saved(c,input) {
 return{assessment:{...input.assessment,id:uid,completed_at:'2026-09-13T12:01:00.123456Z'},workspace_version_id:c.workspace_version_id,
  observation_id:c.observation_id,current_context:true,reassessment_pending:false,publication_allowed:false}
}
const content=tree=>JSON.stringify(tree.toJSON())
function selectNamed(tree,label) {return tree.root.findAllByType('select').find(s=>s.parent.children.includes(label))}
async function fillForm(tree) {
 for(const [label,value]of [['Definition of explanation 1','Synthetic A'],['Definition of explanation 2','Synthetic B'],
  ['Saved comparison rationale','Synthetic private reasoning.'],['Main limitation','Synthetic missing evidence.'],
  ['Reason for this saved revision','Synthetic initial entry.']]){
  const f=tree.root.findAll(n=>n.props.label===label)[0]
  await act(async()=>f.findByType('textarea').props.onChange({target:{value}}))
 }
 await act(async()=>selectNamed(tree,'Comparison').props.onChange({target:{value:'insufficient_to_rank'}}))
}
test('authoring context fails closed on invented estimates, source clocks and public or cross-scope state',()=>{
 const c=syntheticAuthoringContext();assert.equal(validAuthoringContext(c,c.investigation_id,c.workspace_version_id),true)
 for(const mutate of [x=>x.estimation_methods=['unapproved'],x=>x.publication_allowed=true,x=>x.access_role='viewer',
  x=>x.materials[0].acquired_at='2026-09-14T12:00:00Z',x=>x.materials.push(x.materials[0]),x=>x.materials[0].input_position=9007199254740993,x=>x.materials[0].permission_state='blocked']){
  const bad=structuredClone(c);mutate(bad);assert.equal(validAuthoringContext(bad,c.investigation_id,c.workspace_version_id),false)
 }
 assert.equal(validAuthoringContext(c,'other',c.workspace_version_id),false)
 const d=createAssessmentDraft(c);assert.equal(d.comparison.state,'')
 assert.notEqual(d.hypotheses[0].likelihood,d.hypotheses[0].confidence);assert.equal(d.hypotheses[0].likelihood.kind,'not_estimated')
})
test('composer verifies exact Unicode passage bytes and every returned retained binding',async()=>{
 const c=syntheticAuthoringContext(),s=spanFixture(c)
 const e=await verifyComposerSpan(c,s.input,s.result,'synthetic-evidence')
 assert.equal(e.input_position,'9007199254740993');assert.equal(e.source_span.excerpt_sha256,s.result.excerpt_sha256)
 for(const mutate of [r=>r.material_version='other',r=>r.observation_id='other',r=>r.excerpt='X B',r=>r.excerpt_sha256='b'.repeat(64),r=>r.publication_allowed=true]){
  const bad=structuredClone(s.result);mutate(bad);await assert.rejects(verifyComposerSpan(c,s.input,bad,'synthetic-evidence'))
 }
})
test('composer submissions retain separate missing estimates and cannot assert scoring or independent origin',async()=>{
 const c=syntheticAuthoringContext(),s=spanFixture(c),e=await verifyComposerSpan(c,s.input,s.result,'synthetic-evidence')
 const d=fillSyntheticComposer(c,e),submission=buildComposerSubmission(c,d,uid)
 assert.equal(submission.action,'append');assert.equal(submission.input.assessment.model_version,'none')
 for(const mutate of [x=>x.comparison.confidence={kind:'qualitative',label:'High',method_ref:'invented',reason:'Invented.'},
  x=>x.evidence[0].origin_group='self-attested',x=>x.release_state='public',x=>x.predecessor_id='other',
  x=>x.evidence[0].source_span.end=999,x=>x.evidence[0].material_version='other']){
  const bad=structuredClone(d);mutate(bad);assert.throws(()=>buildComposerSubmission(c,bad,uid))
 }
})
test('allegation reports cannot justify favored hypothesis and pending causes need explicit explanations',async()=>{
 const c=syntheticAuthoringContext(),s=spanFixture(c),e=await verifyComposerSpan(c,s.input,s.result,'synthetic-evidence')
 const d=fillSyntheticComposer(c,e);d.comparison.state='better_supported';d.comparison.favored_ids=[d.hypotheses[0].id];d.arguments[0].relation='reports_allegation'
 assert.throws(()=>buildComposerSubmission(c,d,uid),/supporting_argument_required/)
 c.head={revision_id:uid,revision:1,status:'available'}
 assert.throws(()=>buildComposerSubmission(c,fillSyntheticComposer(c),uid),/record_reassessment_request_first/)
 c.backlog.causes=[{cause_id:'synthetic-cause',revision_id:uid,kind:'human_reconsideration',state:'pending_explicit_reconciliation'}]
 const next=fillSyntheticComposer(c);assert.equal(buildComposerSubmission(c,next,uid).action,'complete')
 next.reassessment_causes[0].reason='';assert.throws(()=>buildComposerSubmission(c,next,uid))
})
test('saved receipt must match immutable arguments despite database JSON key ordering',()=>{
 const c=syntheticAuthoringContext(),submission=buildComposerSubmission(c,fillSyntheticComposer(c),uid),result=saved(c,submission.input)
 result.assessment=Object.fromEntries(Object.entries(result.assessment).reverse())
 assert.equal(validComposerReceipt(c,submission,result),true)
 result.assessment.comparison={...result.assessment.comparison,rationale:'Unrequested replacement.'}
 assert.equal(validComposerReceipt(c,submission,result),false)
})
test('authoring handler and store bind verified identity and fixed source scope, never caller authority',async()=>{
 const c=syntheticAuthoringContext(),calls=[],store=createHypothesisStore(async(...args)=>{calls.push(args);return{rows:[{value:c}]}})
 const handler=createHypothesisHandler({authenticate:async()=>({id:uid}),store,sourceProject:'synthetic-only',allowedOrigins:['https://example.org']})
 const client=createHypothesisAssessmentClient(async(action,input)=>{
  const r=await handler(new Request('https://example.org/hypothesis',{method:'POST',headers:{authorization:'Bearer synthetic-only','content-type':'application/json'},
   body:JSON.stringify({action,input})}));return r.json()
 })
 assert.equal((await client.authoringContext(c.investigation_id,c.workspace_version_id)).error,null)
 assert.deepEqual(calls[0][1],[uid,c.investigation_id,c.workspace_version_id,'synthetic-only'])
 const base={investigation_id:c.investigation_id,workspace_version_id:c.workspace_version_id,...spanFixture(c).input}
 assert.equal((await client.authoringSpan(base)).error,null)
 assert.deepEqual(calls[1][1],[uid,c.investigation_id,c.workspace_version_id,'synthetic-only','9007199254740993','summary',2,5])
 for(const bad of [{...base,user_id:uid},{...base,source_project:'other'},{...base,end:3000},{...base,input_position:9007199254740993}]){
  assert.equal((await client.authoringSpan(bad)).error.code,'invalid_request')
 }
 assert.equal(calls.length,2)
})
test('composer form saves explicit fields, hides uncertain content and retries identical arguments',async()=>{
 const c=syntheticAuthoringContext(),calls=[];let savedCount=0,tree
 const client={append:async input=>{calls.push(structuredClone(input));return calls.length===1?{error:{code:'request_failed'}}:{data:saved(c,input)}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Form,{client,context:c,onSaved:()=>savedCount++}))})
 assert.equal(calls.length,0);await fillForm(tree)
 await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}))
 assert.match(content(tree),/Saving is unconfirmed/);assert.doesNotMatch(content(tree),/Synthetic private reasoning/)
 await act(async()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Retry the same assessment').props.onClick({preventDefault(){}}))
 assert.deepEqual(calls[0],calls[1]);assert.equal(savedCount,1);assert.match(content(tree),/Human review and publication eligibility remain separate/)
 act(()=>tree.unmount())
})
test('composer passage response arriving after selection changes cannot reveal stale text',async()=>{
 const c=syntheticAuthoringContext();let resolve,tree
 const client={authoringSpan:()=>new Promise(r=>resolve=r)}
 await act(async()=>{tree=TestRenderer.create(createElement(Form,{client,context:c}))})
 await act(async()=>selectNamed(tree,'Retained material').props.onChange({target:{value:c.materials[0].input_position}}))
 await act(async()=>selectNamed(tree,'Retained text field').props.onChange({target:{value:'summary'}}))
 act(()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Open retained passage').props.onClick())
 await act(async()=>selectNamed(tree,'Retained material').props.onChange({target:{value:''}}))
 await act(async()=>resolve({data:spanFixture(c).result}))
 assert.doesNotMatch(content(tree),/😀 B/);act(()=>tree.unmount())
})
test('composer opens explicitly and account changes discard delayed private context',async()=>{
 const c=syntheticAuthoringContext();let resolve,calls=0,tree
 const client={authoringContext:()=>{calls++;return new Promise(r=>resolve=r)}}
 const p={client,investigationId:c.investigation_id,workspaceVersionId:c.workspace_version_id,userScopeKey:'synthetic-user'}
 await act(async()=>{tree=TestRenderer.create(createElement(Composer,p))});assert.equal(calls,0)
 await act(async()=>tree.root.findByType('button').props.onClick())
 const previous=resolve
 await act(async()=>tree.update(createElement(Composer,{...p,userScopeKey:null})))
 await act(async()=>previous({data:c}))
 assert.equal(tree.toJSON(),null);assert.equal(calls,1);act(()=>tree.unmount())
})
test('composer save resolving after unmount cannot update another workspace',async()=>{
 const c=syntheticAuthoringContext();let resolve,input,savedCount=0,tree
 const client={append:i=>{input=i;return new Promise(r=>resolve=r)}}
 await act(async()=>{tree=TestRenderer.create(createElement(Form,{client,context:c,onSaved:()=>savedCount++}))})
 await fillForm(tree);act(()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}))
 act(()=>tree.unmount());await act(async()=>resolve({data:saved(c,input)}))
 assert.equal(savedCount,0)
})
