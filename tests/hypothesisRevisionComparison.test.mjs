import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {syntheticComparisonHistory} from './hypothesisComparisonFixture.mjs'
import {hypothesisHistoryView} from '../src/lib/hypothesisAssessmentClient.js'
import {compareHypothesisRevisions as compare} from '../src/lib/hypothesisRevisionComparison.js'
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/HypothesisComparison.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/HypothesisRevisionComparison.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {default:Panel}=await import(pathToFileURL(output))
const fixture=()=>{const f=syntheticComparisonHistory();return hypothesisHistoryView(f.history,f.backlog,f.history.investigation_id)}
const target='synthetic-assessment-2'
const changes=diff=>diff.groups.flatMap(g=>g.changes)
const content=tree=>JSON.stringify(tree.toJSON())
const expand=tree=>act(()=>{const node={open:true};tree.root.findByType('details').props.onToggle({target:node,currentTarget:node})})
test('comparison retains exact before/after reasoning and method separately without mutating records',()=>{
 const view=fixture(),before=structuredClone(view),d=compare(view,target)
 assert.equal(d.status,'available');assert.equal(d.effect,'unchanged')
 assert.equal(changes(d).find(c=>c.key==='method_version').after,'synthetic-contract-only-v2')
 assert.match(changes(d).find(c=>c.key==='rationale').before,/Earlier synthetic reasoning/)
 assert.match(changes(d).find(c=>c.key==='rationale').after,/Later synthetic reasoning/)
 assert.deepEqual(view,before);assert.equal(d.isReassessment,false);assert.equal(d.publicationAllowed,false)
})
test('omitted evidence remains a reference difference and does not imply source deletion or changed content',()=>{
 const d=compare(fixture(),target),omitted=d.groups.find(g=>g.title.endsWith('omitted-record'))
 assert.equal(omitted.status,'omitted')
 assert.equal(omitted.changes.find(c=>c.key==='material_version').afterPresent,false)
 const material=d.groups.find(g=>g.title==='Retained evidence · meeting')
 assert.deepEqual(material.changes.map(c=>c.key),['material_version','quality'])
})
test('likelihood and confidence remain distinct even when only a recorded reason changes',()=>{
 const view=fixture(),b=view.entries[1].assessment
 b.hypotheses[0].likelihood.reason='Synthetic likelihood basis changed.'
 b.hypotheses[0].confidence.reason='Synthetic confidence basis changed.'
 const d=compare(view,target),group=d.groups.find(g=>g.title==='Explanation · influence')
 assert.deepEqual(group.changes.map(c=>c.key),['likelihood','confidence'])
 assert.ok(group.changes.every(c=>c.after.kind==='not_estimated'))
})
test('different identities, missing predecessor, invalid records and duplicate revisions fail closed',()=>{
 for(const mutate of [v=>v.entries[0].assessment.question_id='other',
  v=>v.entries[1].assessment.predecessor_id='unknown',v=>v.entries.shift(),
  v=>v.entries[0].assessment.release_state='public',v=>v.entries.push(structuredClone(v.entries[0])),
  v=>v.entries.push(structuredClone(v.entries[1]))]){
  const v=fixture();mutate(v);const d=compare(v,target)
  assert.equal(d.status,'unavailable');assert.equal(Object.hasOwn(d,'groups'),false)
 }
})
test('withheld target or predecessor and permission-change races reveal neither side',()=>{
 for(const index of [0,1])for(const mode of ['withheld','pending']){
  const view=fixture()
  if(mode==='withheld'){view.entries[index].status='withheld';delete view.entries[index].assessment}
  else view.causes.push({revision_id:view.entries[index].revision_id,kind:'permission_changed',state:'pending_explicit_reconciliation'})
  assert.equal(compare(view,target).status,'unavailable')
 }
})
test('pending non-permission changes are not mistaken for a completed reassessment',()=>{
 const view=fixture();view.causes.push({revision_id:target,kind:'method_changed',state:'pending_explicit_reconciliation'})
 const d=compare(view,target);assert.equal(d.pending,1);assert.equal(d.isReassessment,false);assert.equal(d.effect,'unchanged')
})
test('reordering object keys is not a substantive difference; explicit entity order changes are recorded',()=>{
 const v=fixture(),a=v.entries[0].assessment,b=v.entries[1].assessment
 const next={...structuredClone(a),id:b.id,revision:2,predecessor_id:a.id,revision_trigger:'methodology',revision_effect:'unchanged'}
 next.comparison=Object.fromEntries(Object.entries(next.comparison).reverse())
 v.entries[1].assessment=next;v.entries[1].completed_at=next.completed_at
 assert.equal(compare(v,target).groups.length,0)
 next.hypotheses.reverse()
 const diff=compare(v,target);assert.deepEqual(diff.groups.map(g=>g.title),['Explanation order'])
})
test('initial revision has no invented predecessor comparison',()=>{
 assert.deepEqual(compare(fixture(),'synthetic-assessment-1'),{status:'initial'})
})
test('collapsed comparison excludes prior private reasoning until explicitly expanded',()=>{
 let tree;act(()=>{tree=TestRenderer.create(createElement(Panel,{view:fixture(),revisionId:target}))})
 assert.doesNotMatch(content(tree),/Earlier synthetic reasoning|Later synthetic reasoning|synthetic-omitted-version/)
 expand(tree)
 assert.match(content(tree),/Earlier synthetic reasoning/);assert.match(content(tree),/Later synthetic reasoning/)
 assert.match(content(tree),/does not mean deleted/);assert.match(content(tree),/verified historical-time view remains unavailable/)
 assert.doesNotMatch(content(tree),/50%|not_estimated/)
 act(()=>tree.unmount())
})
test('permission change while expanded clears prior comparison values immediately',()=>{
 const view=fixture();let tree
 act(()=>{tree=TestRenderer.create(createElement(Panel,{view,revisionId:target}))});expand(tree)
 const denied=structuredClone(view);denied.entries[0].status='withheld';delete denied.entries[0].assessment
 act(()=>tree.update(createElement(Panel,{view:denied,revisionId:target})))
 assert.doesNotMatch(content(tree),/Earlier synthetic reasoning|Later synthetic reasoning/)
 assert.match(content(tree),/Comparison unavailable/);act(()=>tree.unmount())
})
test('saved markup is rendered as text without activating links or HTML',()=>{
 const view=fixture();view.entries[1].assessment.comparison.rationale='<img src="https://example.invalid/private" onerror="bad()">'
 let tree;act(()=>{tree=TestRenderer.create(createElement(Panel,{view,revisionId:target}))});expand(tree)
 assert.equal(tree.root.findAllByType('img').length,0);assert.equal(tree.root.findAllByType('a').length,0)
 assert.match(content(tree),/onerror/);act(()=>tree.unmount())
})
