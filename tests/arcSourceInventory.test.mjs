import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { writeFile, unlink } from 'node:fs/promises'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createChronologyBackend } from '../src/lib/chronologyBackend.js'
import { newsBackendFixture } from './newsBackendFixture.mjs'
import { useArcArticleInventory } from '../src/lib/useArcArticleInventory.js'

test('source inventory distinguishes missing client, denied/later-page reads, empty and recovery', async () => {
  assert.deepEqual(await createChronologyBackend(null).loadArcArticleInventory('a'), {state:'unavailable',articles:[]})
  const tables = {articles:Array.from({length:1002},(_,i)=>({id:String(i).padStart(5,'0'),arc_id:'a',title:'A source',published_at:'2024-04-08'}))}
  let denied = true
  const f = newsBackendFixture({tables,errors:{articles:p=>denied && p.has('id') ? {code:'42501',message:'denied'} : null}})
  const backend = createChronologyBackend(f.client)
  assert.deepEqual(await backend.loadArcArticleInventory('a'),{state:'unavailable',articles:[]})
  denied = false
  const ready = await backend.loadArcArticleInventory('a')
  assert.equal(ready.state,'ready'); assert.equal(ready.articles.length,1002)
  assert.ok(ready.articles.every(a=>a.arc_id==='a'))
  assert.deepEqual(await backend.loadArcArticleInventory('b'),{state:'ready',articles:[]})
  assert.deepEqual(await backend.loadArcArticleInventory(null),{state:'unavailable',articles:[]})
  assert.ok(f.calls.every(c=>c.table==='articles' && c.request.method==='GET'))
})

test('selection, retries, client changes and late responses never retain another source inventory', async () => {
  const requests = []
  const backend = {loadArcArticleInventory:id=>new Promise((resolve,reject)=>requests.push({id,resolve,reject}))}
  let state, renderer
  function Harness({backend,id}) { state=useArcArticleInventory(backend,id); return null }
  const render = async (id,client=backend) => act(async()=>{const el=React.createElement(Harness,{backend:client,id});renderer ? renderer.update(el) : renderer=TestRenderer.create(el)})
  try {
    await render('a'); assert.equal(state.state,'loading')
    await act(async()=>requests[0].resolve({state:'ready',articles:[{id:'a-source'}]}))
    assert.equal(state.articles[0].id,'a-source')
    await render('b'); assert.equal(state.state,'loading');assert.deepEqual(state.articles,[])
    await render('c')
    await act(async()=>requests[1].resolve({state:'ready',articles:[{id:'late-b'}]}))
    assert.equal(state.state,'loading');assert.deepEqual(state.articles,[])
    await act(async()=>requests[2].reject(Error('offline')))
    assert.equal(state.state,'unavailable');assert.deepEqual(state.articles,[])
    await act(async()=>state.retry());assert.equal(state.state,'loading')
    await act(async()=>requests[3].resolve({state:'ready',articles:[]}))
    assert.equal(state.state,'ready');assert.deepEqual(state.articles,[])
    const other = {loadArcArticleInventory:async()=>({state:'ready',articles:[{id:'new-client'}]})}
    await render('c',other);assert.equal(state.articles[0].id,'new-client')
  } finally {await act(async()=>renderer?.unmount())}
})

test('source cards and coverage never render stale or empty assertions during loading or failure', async () => {
  const file = new URL('./.arc-source-panel-test.mjs',import.meta.url)
  const built=await build({entryPoints:['src/components/ArcEvidencePanel.jsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
  await writeFile(file,built.outputFiles[0].text)
  try {
    const {default:Panel,ArcOverviewStatus}=await import(file.href)
    for (const sourceState of ['loading','unavailable']) {
      for (const Component of [Panel,ArcOverviewStatus]) {
        const renderer=TestRenderer.create(React.createElement(Component,{sourceState,arcArticles:[{id:'stale',title:'WRONG SOURCE',published_at:'2024-04-08'}],arc:{started_at:'2024-04-08'},detail:{milestones:[]},onRetrySources:()=>{}}))
        const output=JSON.stringify(renderer.toJSON())
        assert.doesNotMatch(output,/WRONG SOURCE|NO ATTACHED ARTICLES|gap-bar-track|public source inventory/)
        assert.match(output,sourceState==='loading'?/Loading attached source records/:/does not mean the arc has no sources/)
        renderer.unmount()
      }
    }
    const empty=TestRenderer.create(React.createElement(Panel,{sourceState:'ready',arcArticles:[]}))
    assert.match(JSON.stringify(empty.toJSON()),/public source inventory/)
    empty.unmount()
  } finally {await unlink(file)}
})
