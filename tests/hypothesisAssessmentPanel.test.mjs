import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import TestRenderer,{act} from 'react-test-renderer'
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/HypothesisPanel.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/HypothesisAssessmentPanel.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {default:Panel}=await import(pathToFileURL(output))
test('collapsed panel names inference, uncertainty, clocks and private review without claiming a probability',()=>{
 const html=renderToStaticMarkup(createElement(Panel,{assessment:hypothesisFixture(),dependencyChanged:true}))
 assert.match(html,/Inferred assessment, not an established finding/)
 assert.match(html,/Reassessment is pending/);assert.match(html,/Not enough basis to estimate/)
 assert.match(html,/Evidence included through/);assert.match(html,/Assessment completed/)
 assert.doesNotMatch(html,/50%|80%|Authenticated pre-meeting/)
})
test('expansion reveals saved argument limits, exact references and separate quality/relevance',()=>{
 const r=hypothesisFixture();r.arguments[0].relation='reports_allegation'
 let tree;act(()=>{tree=TestRenderer.create(createElement(Panel,{assessment:r}))})
 const details=tree.root.findByType('details')
 act(()=>{const node={open:true};details.props.onToggle({target:node,currentTarget:node})})
 const output=JSON.stringify(tree.toJSON())
 for(const phrase of ['Diagnostic relevance','Evidence quality','9007199254740993','Reporting an allegation','What would change','Saved revision record'])
  assert.ok(output.includes(phrase),phrase)
 act(()=>tree.unmount())
})
test('invalid saved records fail closed without revealing unvalidated allegations',()=>{
 const r=hypothesisFixture();r.evidence[0].acquired_at='2099-01-01T00:00:00Z'
 const html=renderToStaticMarkup(createElement(Panel,{assessment:r}))
 assert.match(html,/assessment unavailable/);assert.doesNotMatch(html,/fictional contract/)
})

test('unqualified historical display mode cannot claim committed availability',()=>{
 const html=renderToStaticMarkup(createElement(Panel,{assessment:hypothesisFixture(),historyMode:'as_known_then'}))
 assert.match(html,/commit visibility is not qualified/)
 assert.doesNotMatch(html,/available by the requested time|fictional contract/)
})

test('existing relationships have readable labels and preserve retained meanings',()=>{
 const cases=[
  ['supports','Supports','supports this explanation'],
  ['weakens','Weakens','weakens this explanation'],
  ['compatible','Ambiguous','does not clearly distinguish it from alternatives'],
  ['context','Context','does not claim support or opposition'],
  ['reports_allegation','Reports allegation','does not independently substantiate it'],
 ]
 for(const [relation,label,explanation] of cases){
  const record=hypothesisFixture();record.arguments[0].relation=relation
  const before=structuredClone(record)
  let tree;act(()=>{tree=TestRenderer.create(createElement(Panel,{assessment:record}))})
  const details=tree.root.findByType('details')
  act(()=>{const node={open:true};details.props.onToggle({target:node,currentTarget:node})})
  assert.ok(tree.root.findAllByType('h5').some(node=>node.children.join('')===label),relation)
  assert.ok(JSON.stringify(tree.toJSON()).includes(explanation),relation)
  assert.deepEqual(record,before)
  act(()=>tree.unmount())
 }
})
test('hypothesis relationship explanations do not invent a missing estimate',()=>{
 const cases=[
  ['overlapping','more than one may contribute'],
  ['mutually_exclusive','These explanations are recorded as mutually exclusive: no more than one can be true.'],
  ['not_established','has not been established'],
 ]
 for(const [relationship,copy] of cases){
  const record=hypothesisFixture();record.hypothesis_relationship=relationship
  const before=structuredClone(record)
  let tree;act(()=>{tree=TestRenderer.create(createElement(Panel,{assessment:record}))})
  const details=tree.root.findByType('details')
  act(()=>{const node={open:true};details.props.onToggle({target:node,currentTarget:node})})
  const output=JSON.stringify(tree.toJSON())
  assert.ok(output.includes(copy));assert.ok(output.includes('Not enough basis to estimate'))
  assert.doesNotMatch(output,/50%|80%/)
  assert.deepEqual(record,before)
  act(()=>tree.unmount())
 }
})
test('Why disclosure retains native summary semantics and stale is a pending saved state',()=>{
 const record=hypothesisFixture()
 const html=renderToStaticMarkup(createElement(Panel,{assessment:record,dependencyChanged:true}))
 assert.match(html,/<details[^>]*><summary>Why\? Evidence, reasoning, alternatives, and assessment history<\/summary>/)
 assert.match(html,/Stale — reassessment pending/)
 assert.match(html,/this is still the saved assessment/)
 assert.doesNotMatch(renderToStaticMarkup(createElement(Panel,{assessment:record})),/Stale — reassessment pending/)
})
