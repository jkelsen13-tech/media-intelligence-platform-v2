import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync,readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import TestRenderer,{act} from 'react-test-renderer'
import {replayPrivateInput} from '../scripts/nativeOfflineReplay.mjs'
import {replaySearchHint,loadPrivateReplay} from '../scripts/privateReplayClient.mjs'
import {syntheticReplayInput} from './fixtures/nativeReplaySynthetic.mjs'
const require=createRequire(import.meta.url)
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild')
const root=fileURLToPath(new URL('../',import.meta.url)),output=fileURLToPath(new URL('./.compiled/NativeReplayPresentation.mjs',import.meta.url))
mkdirSync(new URL('./.compiled',import.meta.url),{recursive:true})
await build({absWorkingDir:root,entryPoints:['scripts/nativeReplayWorkspace.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'skip-css',setup(b){b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}))}}]})
const ui=await import(pathToFileURL(output))
const input=syntheticReplayInput(3),replay=replayPrivateInput(input,{expectedCount:3})
replay.candidates[0].source_date='2026-09';replay.candidates[0].publication_precision='month';replay.candidates[0].origin_id='synthetic-origin';replay.candidates[0].dependency_id='synthetic-dependency'
const sources=replay.candidates.map(c=>({...c,preview_id:c.capture_id})),investigation={sources,topic:'all'}
const render=(Component,props)=>renderToStaticMarkup(createElement(Component,props))
test('replay evidence restores bounded source provenance and truthful hash qualification',()=>{
 const c=replay.candidates[0],html=render(ui.ReplayEvidence,{candidate:c})
 for(const text of [c.url,c.article_id,c.capture_id,c.candidate_id,'synthetic-origin','synthetic-dependency','2026-09','month','not recomputed or cryptographically verified','unverified receipt declaration'])assert.ok(html.includes(text),text)
 assert.ok(html.includes(`href="${c.url}"`))
 const unsafe=render(ui.ReplaySourceLink,{candidate:{...c,url:'javascript:alert(1)'}});assert.doesNotMatch(unsafe,/href="javascript:/)
})
test('source links stay visible with zero dependency matches and respect selected scope',()=>{
 const r={...replay,dependencies:[]}
 const all=render(ui.ReplayWorkspace,{replay:r,investigation,initialTab:'source-links'})
 for(const c of replay.candidates)assert.ok(all.includes(`href="${c.url}"`))
 const selected=render(ui.ReplayWorkspace,{replay:r,investigation,selected:sources[0],initialTab:'source-links'})
 assert.ok(selected.includes(`href="${sources[0].url}"`));assert.ok(!selected.includes(`href="${sources[1].url}"`))
})
test('unselected replay evidence ledger reports actual checks instead of blocked receipt fallback',()=>{
 const html=render(ui.ReplayEvidenceLedger,{replay,investigation})
 assert.match(html,/3 candidates in scope/);assert.match(html,/exact bounded spans verified/);assert.match(html,/capture_payload_hash: retained_unverified/)
 assert.doesNotMatch(html,/93 exact-field checks blocked|exact text unavailable/)
 const entry=readFileSync(new URL('../scripts/demo-corpus-preview.jsx',import.meta.url),'utf8')
 assert.match(entry,/route.surface === 'evidence'\) content = privateReplay \? <ReplayEvidenceLedger/)
 assert.match(entry,/searchHint=\{replaySearchHint\(privateReplay\)\}/)
})
test('search hint states metadata-only coverage and loader restores receipt precision',async()=>{
 assert.match(replaySearchHint(replay),/metadata search only/);assert.match(replaySearchHint(replay),/not searched here/);assert.doesNotMatch(replaySearchHint(replay),/text is unavailable/)
 assert.match(replaySearchHint(null),/text is unavailable/)
 const loaded=await loadPrivateReplay(sources,async()=>({ok:true,json:async()=>({...replay,candidates:replay.candidates.map(({publication_precision,...c})=>c)})}))
 assert.equal(loaded.candidates[0].publication_precision,'month')
})
test('keyboard cluster list selects pending membership and exposes member source evidence',()=>{
 let selectedCluster=null,selectedSource=null,tree
 const props={replay,clusters:replay.clusters,sources,onSelectCluster:id=>selectedCluster=id,onSelectSource:s=>selectedSource=s}
 act(()=>{tree=TestRenderer.create(createElement(ui.ReplayClusterDetails,props))})
 const button=tree.root.findAllByType('button').find(b=>String(b.props.children).includes(replay.clusters[0].id))
 act(()=>button.props.onClick());assert.equal(selectedCluster,replay.clusters[0].id)
 act(()=>tree.update(createElement(ui.ReplayClusterDetails,{...props,selectedId:selectedCluster})))
 const member=tree.root.findAllByType('button').find(b=>String(b.props.children).includes('Select member source'))
 act(()=>member.props.onClick());assert.ok(selectedSource.capture_id)
 const html=render(ui.ReplayClusterDetails,{...props,selectedId:selectedCluster});assert.match(html,/not an accepted event or relationship/);assert.match(html,/Source URL/);assert.match(html,/aria-pressed="true"/)
})
