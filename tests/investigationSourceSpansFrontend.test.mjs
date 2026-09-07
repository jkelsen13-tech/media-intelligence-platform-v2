import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { retainedSourceSpans } from '../supabase/functions/investigation-source-spans/spans.mjs'
import { FIXTURE_BUNDLES, deferred } from '../src/lib/investigationWorkspaceFixtures.js'

const root=fileURLToPath(new URL('../',import.meta.url)), output=join(root,'tests/.compiled/SourceSpans.mjs')
mkdirSync(join(root,'tests/.compiled'),{recursive:true})
const require=createRequire(import.meta.url), esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/InvestigationSourceSpans.jsx'],outfile:output,bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {default:Spans,SourceSpanInspector}=await import(pathToFileURL(output))
const plain=tree=>JSON.stringify(tree.toJSON()), button=tree=>tree.root.findAllByType('button')[0]
function fixture(){
 const bundle=structuredClone(FIXTURE_BUNDLES.comparable)
 bundle.observation.snapshot.inputs.find(i=>i.position==='1').capture.payload.summary='💡 Up to 17%.'
 bundle.observation.snapshot.inputs.find(i=>i.position==='2').capture.payload.summary='💡 17%.'
 return bundle
}
const toggle=(details,open=true)=>{const target={open};act(()=>details.props.onToggle({target,currentTarget:target}))}
test('explicit comparison lazily opens exact changed spans, including empty insertion boundaries',async()=>{
 const bundle=fixture(), calls=[],opened=[]
 const client={read:async(...args)=>{calls.push(args);return {data:retainedSourceSpans(bundle,'1','2')}}}
 let tree; act(()=>{tree=TestRenderer.create(createElement(Spans,{bundle,leftPosition:'1',rightPosition:'2',client,onOpenSpan:(...args)=>opened.push(args)}))})
 assert.equal(calls.length,0)
 await act(async()=>{await button(tree).props.onClick()})
 assert.deepEqual(calls,[[bundle.investigation_id,bundle.version.id,'1','2']])
 assert.equal(tree.root.findAllByType('mark').length,0)
 toggle(tree.root.findAllByType('details')[1])
 assert.equal(tree.root.findByType('mark').props.children,'Up to ')
 assert.match(plain(tree),/No text at this boundary/)
 const open=tree.root.findAllByType('button').filter(b=>b.props.children==='Open this text in inspector')
 act(()=>open[1].props.onClick())
 assert.deepEqual(opened[0][0],{position:'2',field:'summary',span:{start:2,end:2},versionId:bundle.version.id,observationId:bundle.observation.id})
 assert.equal(opened[0][1],bundle)
 act(()=>tree.unmount())
})
test('changed pairs and closed disclosures ignore delayed results and access failures',async()=>{
 const bundle=fixture(),pending=deferred(),denials=[]
 const client={read:()=>pending.promise}
 let tree; const props={bundle,leftPosition:'1',rightPosition:'2',client,onAccessFailure:(...args)=>denials.push(args)}
 act(()=>{tree=TestRenderer.create(createElement(Spans,props));})
 act(()=>{button(tree).props.onClick()})
 assert.equal(button(tree).props.disabled,true)
 act(()=>tree.update(createElement(Spans,{...props,leftPosition:'2',rightPosition:'1'})))
 await act(async()=>{pending.resolve({error:{code:'access_denied'}});await pending.promise})
 assert.deepEqual(denials,[]);assert.equal(tree.root.findAllByProps({'data-source-spans':'ready'}).length,0)
 const closed=deferred()
 act(()=>tree.update(createElement(Spans,{...props,client:{read:()=>closed.promise}})))
 act(()=>{button(tree).props.onClick();tree.unmount()})
 await act(async()=>{closed.resolve({data:retainedSourceSpans(bundle,'1','2')});await closed.promise})
 assert.deepEqual(denials,[])
})
test('active denied reads delegate full workspace clearing, while failed/mismatched reads can be retried',async()=>{
 const bundle=fixture(),denials=[];let attempt=0,tree
 const client={read:async()=>++attempt===1?{error:{code:'access_denied'}}:attempt===2?{data:{...retainedSourceSpans(bundle,'1','2'),version_id:'wrong'}}:{data:retainedSourceSpans(bundle,'1','2')}}
 act(()=>{tree=TestRenderer.create(createElement(Spans,{bundle,leftPosition:'1',rightPosition:'2',client,onAccessFailure:(...args)=>denials.push(args)}))})
 await act(async()=>{await button(tree).props.onClick()});assert.deepEqual(denials,[['access_denied',bundle]])
 await act(async()=>{await button(tree).props.onClick()});assert.match(plain(tree),/No highlights are shown/)
 await act(async()=>{await button(tree).props.onClick()});assert.equal(tree.root.findAllByProps({'data-source-spans':'ready'}).length,1)
 act(()=>tree.unmount())
})
test('source-span inspector binds the saved identity and does not invent an evidence judgment for an empty span',()=>{
 const bundle=fixture(), selection={versionId:bundle.version.id,observationId:bundle.observation.id,position:'2',field:'summary',span:{start:2,end:2}}
 let tree;act(()=>{tree=TestRenderer.create(createElement(SourceSpanInspector,{bundle,selection}))})
 assert.match(plain(tree),/No text at this boundary/);assert.match(plain(tree),/not a saved evidence judgment/)
 assert.doesNotMatch(plain(tree),/Recorded as context/)
 act(()=>tree.update(createElement(SourceSpanInspector,{bundle,selection:{...selection,versionId:'different'}})))
 assert.match(plain(tree),/different saved version/);assert.equal(tree.root.findAllByType('blockquote').length,0)
 act(()=>tree.unmount())
})
test('missing and over-limit fields stay explicit without eagerly rendering long retained text',async()=>{
 const bundle=fixture(),left=bundle.observation.snapshot.inputs.find(i=>i.position==='1').capture.payload
 left.title=null;left.body_text='bounded-preview-marker'.repeat(10000)
 let tree;const client={read:async()=>({data:retainedSourceSpans(bundle,'1','2')})}
 act(()=>{tree=TestRenderer.create(createElement(Spans,{bundle,leftPosition:'1',rightPosition:'2',client}))})
 await act(async()=>{await button(tree).props.onClick()})
 const fields=tree.root.findAllByType('details');toggle(fields[0]);toggle(fields[2])
 assert.match(plain(tree),/Missing text is not a deletion/)
 assert.match(plain(tree),/exceeds the bounded span-comparison limit/)
 assert.doesNotMatch(plain(tree),/bounded-preview-marker/)
 act(()=>tree.unmount())
})
