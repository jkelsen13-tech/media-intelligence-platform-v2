import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { spatialFixture, spatialTables } from './spatialBackendFixture.mjs'

await mkdir(new URL('./.compiled/', import.meta.url), { recursive: true })
const output = new URL('./.compiled/a11y-WorldView.mjs', import.meta.url)
await build({ entryPoints: [fileURLToPath(new URL('../src/views/WorldView.jsx', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' }, plugins: [{ name: 'renderer-only-stubs', setup(b) {
  b.onResolve({ filter: /^react$/, namespace: 'renderer' }, () => ({ path: 'react', external: true }))
  b.onResolve({ filter: /(?:WorldMapCanvas|\/GraphView)$/ }, args => ({ path: args.path, namespace: 'renderer' }))
  b.onLoad({ filter: /.*/, namespace: 'renderer' }, () => ({ contents: 'import React from "react"; export default p => React.createElement("div", null, p.emptyMessage)', loader: 'js' }))
} }] })
const WorldView = (await import(output.href)).default
const baseProps = {selected:{id:'synthetic-event',label:'Synthetic event'},onSelectProjection(){},onSelectGraphNode(){}}

test('World View modes offer one tab stop, panel associations and keyboard wrap/home/end',async()=>{
  const {backend}=spatialFixture({tables:spatialTables()}),focused=[],changes=[]
  let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(WorldView,{...baseProps,backend,onInvestigationAsOfTime:value=>changes.push(value)}))})
  try {
    const tablist=()=>tree.root.findByProps({'aria-label':'World View mode'}),tabs=()=>tablist().findAllByType('button')
    assert.deepEqual(tabs().map(t=>t.props.tabIndex),[0,-1,-1])
    const targets=[0,1,2].map(i=>({focus:()=>focused.push(i)}))
    for(const [index,key,mode] of [[0,'ArrowLeft','split'],[2,'Home','map'],[0,'ArrowRight','graph'],[1,'End','split']]){
      act(()=>tabs()[index].props.onKeyDown({key,preventDefault(){},currentTarget:{parentElement:{querySelectorAll:()=>targets}}}))
      assert.equal(tree.root.findByProps({'data-wv-mode':mode}).props['data-wv-mode'],mode)
      const panel=tree.root.findByProps({role:'tabpanel'})
      assert.equal(panel.props.id,'wv-mode-panel');assert.equal(panel.props['aria-labelledby'],`wv-mode-${mode}`)
      assert.equal(tabs().filter(t=>t.props.tabIndex===0).length,1)
    }
    assert.deepEqual(focused,[2,0,1,2]);assert.deepEqual(changes,[])
  }finally{act(()=>tree.unmount())}
})

test('explicit selected-event inspector is programmatically focusable without a tab stop',async()=>{
  let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(WorldView,{...baseProps,backend:spatialFixture({tables:spatialTables()}).backend}))})
  assert.equal(tree.root.findByProps({'aria-label':'Selected-event inspector'}).props.tabIndex,-1)
  act(()=>tree.unmount())
})

test('World View preserves unsafe source locator as text and keeps a safe HTTP source link',async()=>{
  for(const [url,clickable] of [['javascript:alert(1)',false],['https://example.com/source',true]]){
    const tables=spatialTables();tables.spatial_projection_v1[0].source_native_time.source_url=url
    let tree;await act(async()=>{tree=TestRenderer.create(React.createElement(WorldView,{...baseProps,backend:spatialFixture({tables}).backend}))})
    assert.equal(tree.root.findAllByType('a').some(a=>a.props.href===url),clickable)
    assert.ok(JSON.stringify(tree.toJSON()).includes(url))
    act(()=>tree.unmount())
  }
})
