import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createEvidenceBackend } from '../src/lib/evidenceBackend.js'
import { evidenceBackendFixture, evidenceTables, evidenceEdge } from './evidenceBackendFixture.mjs'

await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
const output = new URL('./.compiled/convergence-a11y.mjs', import.meta.url)
await build({ stdin: { contents: `export {default as Workspace, WorkspaceSearch as Search} from './src/components/InvestigationWorkspace.jsx'; export {default as Controls} from './src/graph/GraphViewControls.jsx'; export {default as Article} from './src/panels/ArticlePanel.jsx'; export {default as Tabs} from './src/components/EvidenceTabs.jsx'; export {default as Policy} from './src/panels/PolicyPanel.jsx'; export {default as Relationship} from './src/panels/RelationshipPanel.jsx'`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx' }, outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } })
const {Workspace, Search, Controls, Article, Tabs, Policy, Relationship} = await import(output.href)
const render = component => { let tree; act(() => { tree = TestRenderer.create(component) }); return tree }

test('global search Enter opens discovery with current input and preserves composition', () => {
  let opens = 0, value = 'retained query', prevented = 0
  const tree = render(React.createElement(Search, { query: value, onQueryChange: next => value = next, onOpenExplore: () => opens++ }))
  const input = tree.root.findByType('input')
  act(() => input.props.onChange({target: {value:'updated query'}}))
  act(() => input.props.onKeyDown({key:'Enter', nativeEvent:{isComposing:true}, preventDefault:()=>prevented++}))
  assert.equal(opens, 0)
  act(() => input.props.onKeyDown({key:'Enter', preventDefault:()=>prevented++}))
  assert.equal(opens, 1); assert.equal(value, 'updated query'); assert.equal(prevented, 1)
  act(() => tree.unmount())
})

test('dimmed graph controls use native disabling and cannot execute graph actions', () => {
  let resets = 0, animations = 0
  const cyRef = {current:{destroyed:()=>false, container:()=>({getBoundingClientRect:()=>({width:300,height:200})}), maxZoom:()=>10,minZoom:()=>0.1,zoom:()=>1,elements:()=>[],animate:()=>animations++}}
  const props = {cyRef,onReset:()=>resets++}
  const tree = render(React.createElement(Controls,{...props,dimmed:true}))
  for (const button of tree.root.findAllByType('button')) { assert.equal(button.props.disabled,true); act(()=>button.props.onClick()) }
  assert.equal(resets,0); assert.equal(animations,0)
  act(()=>tree.update(React.createElement(Controls,{...props,dimmed:false})))
  for (const button of tree.root.findAllByType('button')) { assert.equal(button.props.disabled,false); act(()=>button.props.onClick()) }
  assert.equal(resets,1); assert.equal(animations,3)
  act(()=>tree.unmount())
})

test('mobile panel resize offers keyboard expansion, touch toggle, drag snap and cancellation', async () => {
  const backend = createEvidenceBackend(null), props={node:{id:'fixture',type:'event',label:'Fixture'},nodes:[],edges:[],isMobile:true,onClose:()=>assert.fail('unexpected close'),backend}
  let tree; await act(async()=>{tree=TestRenderer.create(React.createElement(Article,props))})
  const handle=()=>tree.root.findByProps({className:'ap-sheet-handle'}), panel=()=>tree.root.findByType('aside')
  assert.equal(handle().type,'button'); assert.equal(handle().props['aria-expanded'],false)
  act(()=>handle().props.onClick({detail:0})); assert.equal(panel().props.style.height,'100vh'); assert.equal(handle().props['aria-expanded'],true)
  const pointer={clientY:200,pointerId:1,preventDefault(){},currentTarget:{setPointerCapture(){}}}
  act(()=>handle().props.onPointerDown(pointer)); act(()=>handle().props.onPointerUp())
  assert.equal(panel().props.style.height,'60vh')
  const previous=global.window; global.window={innerHeight:1000}
  try {
    act(()=>handle().props.onPointerDown(pointer)); act(()=>handle().props.onPointerMove({clientY:-100})); act(()=>handle().props.onPointerUp())
    assert.equal(panel().props.style.height,'100vh')
    act(()=>handle().props.onPointerDown(pointer)); act(()=>handle().props.onPointerMove({clientY:700})); act(()=>handle().props.onPointerCancel())
    assert.equal(panel().props.style.height,'100vh')
  } finally { global.window=previous; act(()=>tree.unmount()) }
})

test('evidence tabs support one tab stop and arrow/home/end selection with focus', () => {
  const tabs=['sources','timeline','connections'].map(id=>({id,label:id,panelId:`${id}-panel`})), selected=[], focused=[]
  const tree=render(React.createElement(Tabs,{label:'Evidence',tabs,activeId:'timeline',onSelect:id=>selected.push(id)}))
  const buttons=tree.root.findAllByType('button')
  assert.deepEqual(buttons.map(b=>b.props.tabIndex),[-1,0,-1])
  const targets=tabs.map((_,i)=>({focus:()=>focused.push(i)}))
  for (const [index,key] of [[1,'ArrowRight'],[0,'ArrowLeft'],[2,'Home'],[0,'End']]) {
    act(()=>buttons[index].props.onKeyDown({key,preventDefault(){},currentTarget:{parentElement:{querySelectorAll:()=>targets}}}))
  }
  assert.deepEqual(selected,['connections','connections','sources','connections']); assert.deepEqual(focused,[2,2,0,2])
  act(()=>tree.unmount())
})

test('workspace evidence views use navigation semantics with current page', () => {
  const tree=render(React.createElement(Workspace,{view:'graph',header:{title:'Fixture'},hasNativeInspector:true}))
  const nav=tree.root.findByProps({'aria-label':'Evidence views'})
  assert.equal(nav.type,'nav'); assert.equal(nav.props.role,undefined)
  assert.equal(nav.findAllByProps({'aria-current':'page'}).length,1)
  assert.equal(nav.findAllByType('button').every(b=>b.props.role===undefined),true)
  act(()=>tree.unmount())
})

test('article source locators cannot expose unsafe clickable URLs and preserve titles', async () => {
  const unsafe=['javascript:alert(1)','data:text/html,unsafe','https://user:secret@example.com/','//example.com/path']
  const backend={...createEvidenceBackend(null),loadSources:async()=>unsafe.map((url,i)=>({id:`s${i}`,url,headline:`Retained source ${i}`})).concat({id:'safe',url:'https://example.com/evidence',headline:'Safe source'}),loadNodeArticles:async()=>[{id:'a',url:'javascript:alert(2)',title:'Retained article'}]}
  let tree; await act(async()=>{tree=TestRenderer.create(React.createElement(Article,{node:{id:'fixture-uuid',type:'event',label:'Fixture'},nodes:[],edges:[],backend}))})
  assert.deepEqual(tree.root.findAllByType('a').map(a=>a.props.href),['https://example.com/evidence'])
  const text=JSON.stringify(tree.toJSON()); for(let i=0;i<unsafe.length;i++) assert.match(text,new RegExp(`Retained source ${i}`))
  assert.match(text,/Retained article/)
  act(()=>tree.unmount())
})


test('policy and relationship unsafe locators remain non-clickable without hiding evidence', async () => {
  const tables = evidenceTables()
  tables.policies[0].source_url = 'javascript:alert(1)'
  tables.policies[0].full_text_url = 'data:text/html,unsafe'
  tables.news_reviewed_articles_public[0].url = 'javascript:alert(2)'
  tables.policy_documents[0].url = 'https://user:secret@example.com/'
  const {backend} = evidenceBackendFixture({tables})
  for (const [component,props] of [[Policy,{node:{id:'policy-one',type:'policy',label:'Retained policy'},nodes:[],edges:[]}],[Relationship,{edge:evidenceEdge,sourceLabel:'Recorded policy',targetLabel:'Recorded event'}]]) {
    let tree; await act(async()=>{tree=TestRenderer.create(React.createElement(component,{...props,backend}))})
    assert.equal(tree.root.findAllByType('a').length,0)
    const text=JSON.stringify(tree.toJSON())
    if(component===Policy) {assert.match(text,/Source link unavailable/);assert.match(text,/Full text link unavailable/);assert.match(text,/Recorded policy name/)}
    else {assert.match(text,/Recorded policy document/);assert.match(text,/Backing article title/);assert.match(text,/Recorded grounding passage/)}
    act(()=>tree.unmount())
  }
})
