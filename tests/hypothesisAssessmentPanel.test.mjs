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
