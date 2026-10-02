import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
await mkdir(new URL('./.compiled/',import.meta.url),{recursive:true})
const output=new URL('./.compiled/world-view-500-source-access.mjs',import.meta.url)
await build({entryPoints:[new URL('../src/components/WorldViewExploreShell.jsx',import.meta.url).pathname],outfile:output.pathname,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',loader:{'.css':'empty'}})
const {default:Shell}=await import(output.href)

test('source text has one named keyboard scroll surface during Explore, with no inactive tab stop or duplicate content',()=>{
 const props={prototypeEnabled:true,contextToken:{subjectKey:'record',version:'revision-1',timeToken:'2026-01-01T12:00:00Z'},
  status:'Capture dates unknown; background context only.',attribution:'OpenStreetMap contributors; terrain source attribution retained.'}
 let renderer
 const click=label=>act(()=>renderer.root.findAllByType('button').find(n=>n.props['aria-label']===label||n.children.join('')===label).props.onClick())
 const footer=()=>renderer.root.findAllByType('footer').find(n=>n.props.className==='wv-explore-source')
 const assertActive=()=>{
  assert.equal(renderer.root.findAllByType('footer').length,1)
  assert.equal(footer().props.hidden,false);assert.equal(footer().props.role,'region');assert.equal(footer().props.tabIndex,0)
  assert.equal(footer().props['aria-label'],'Active sources and attribution')
  assert.equal(footer().findAllByType('div')[0].children.join(''),props.status)
  assert.equal(footer().findAllByType('div')[1].children.join(''),props.attribution)
 }
 try{
  act(()=>{renderer=TestRenderer.create(React.createElement(Shell,props,React.createElement('div',null,'Stable map')))})
  const original=footer()
  assert.equal(original.props.hidden,true);assert.equal(original.props.tabIndex,undefined);assert.equal(original.props.role,undefined)
  click('Explore World View');assertActive();assert.equal(footer(),original)
  for(const label of ['Interact','Done — scroll','Options','Options','B · Split dock','A · Immersive','Evidence & context','Collapse evidence']){click(label);assertActive();assert.equal(footer(),original)}
  click('Close Explore World View');assert.equal(footer().props.hidden,true);assert.equal(footer().props.tabIndex,undefined)
  click('Explore World View');assertActive()
  act(()=>renderer.update(React.createElement(Shell,{...props,prototypeEnabled:false},React.createElement('div',null,'Stable map'))))
  assert.equal(footer().props.hidden,true);assert.equal(footer().props.tabIndex,undefined);assert.equal(footer().props.role,undefined)
 }finally{if(renderer)act(()=>renderer.unmount())}
})
