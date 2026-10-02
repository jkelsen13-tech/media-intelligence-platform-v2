// Mounted reader and real WorldView callback qualification. Renderer doubles
// supply projected pixels, never synthetic evidence precision or provider data.
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {buildWorldBillboardModel} from '../src/lib/worldViewBillboardModules.js'
import {layoutWorldBillboards} from '../src/lib/worldViewBillboardLayout.js'
import {updateSelectedBillboardEnvelope} from '../src/lib/worldViewBillboardPresentation.js'
import {spatialFixture,spatialTables} from './spatialBackendFixture.mjs'

await mkdir(new URL('./.compiled/',import.meta.url),{recursive:true})
const output=new URL('./.compiled/world-view-plaque-owner-lane.mjs',import.meta.url)
await build({stdin:{contents:`export {default as Overlay} from './src/components/WorldViewBillboardOverlay.jsx';export {default as WorldView} from './src/views/WorldView.jsx'`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},
 outfile:fileURLToPath(output),bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},
 plugins:[{name:'scene-only-double',setup(b){
  b.onResolve({filter:/^react$/,namespace:'scene'},()=>({path:'react',external:true}))
  b.onResolve({filter:/(?:WorldMapCanvas|\/GraphView)$/},args=>({path:args.path,namespace:'scene'}))
  b.onLoad({filter:/.*/,namespace:'scene'},args=>({loader:'js',contents:args.path.includes('WorldMapCanvas')
   ? `import React from 'react';export default function Canvas(p){globalThis.__plaqueCanvasProps=p;return React.createElement('div',{'data-scene-double':true},p.contextOverlay?.(globalThis.__plaqueCanvasAnchor))}`
   : `import React from 'react';export default p=>React.createElement('div',null,p.emptyMessage)`}))
 }}]})
const {Overlay,WorldView}=await import(output.href)
const coordinates=Object.freeze([-81.7,41.4])
const record={key:'admitted',revisionKey:'r1',label:'Recorded city',precision:'city',canonicalCoordinates:coordinates,
 suppliedModules:[{id:'context',label:'Context',content:['Supplied context only']}],sourceRefs:[{label:'Recorded source',href:'https://example.test/source'}]}
const model=(extra={},time='2024-04-08T18:00:00Z')=>buildWorldBillboardModel({...record,...extra},{inspectionTime:time})
const viewport={width:1280,height:900}
const layoutFor=(view=viewport,anchor={x:210,y:200},extra={})=>layoutWorldBillboards({items:[{key:'admitted',anchor,canonicalCoordinates:coordinates,
 distanceMeters:60000,precision:'city',nearDetailKind:'scope',...extra}],selectedKey:'admitted',viewport:view})
const button=(tree,label)=>tree.root.findAllByType('button').find(n=>n.props['aria-label']===label||n.children.some(child=>typeof child==='string'&&child===label))
const click=(tree,label)=>act(()=>button(tree,label).props.onClick())
const selectedTab=tree=>tree.root.findAllByProps({role:'tab'}).find(n=>n.props['aria-selected']).children.at(-1)

function dom({reduced=true}={}){
 const old=new Map(['window','document','requestAnimationFrame','cancelAnimationFrame','__plaqueCanvasProps','__plaqueCanvasAnchor'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 const listeners=new Map(),frames=new Map(),nodes=[];let id=0
 const opener={isConnected:true,focusCalls:[],focus(options){this.focusCalls.push(options);document.activeElement=this}}
 const doc={hidden:false,activeElement:opener,body:{style:{overflow:''}},documentElement:{style:{overflow:''}},
  addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
  removeEventListener:(type,fn)=>{listeners.get(type)?.delete(fn);if(!listeners.get(type)?.size)listeners.delete(type)}}
 globalThis.document=doc;globalThis.window={location:{search:'?worldViewPrototype=1'},matchMedia:()=>({matches:reduced}),scrollTo(){},scrollX:0,scrollY:0}
 globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id};globalThis.cancelAnimationFrame=key=>frames.delete(key)
 return {doc,opener,listeners,frames,nodes,
  emit(type){for(const fn of [...listeners.get(type)??[]])fn()},
  createNodeMock(element){
   const events=new Map(),attrs={};const props=element.props
   const node={isConnected:true,attrs,events,parentElement:null,style:{},
    focus(options){doc.activeElement=node;node.focusOptions=options},scrollIntoView(){},
    getBoundingClientRect:()=>({left:props.style?.left??0,top:props.style?.top??0,width:props.style?.width??1280,height:props.style?.maxHeight??900,right:1280,bottom:900}),
    setAttribute:(key,value)=>attrs[key]=value,
    addEventListener:(type,fn)=>{if(!events.has(type))events.set(type,new Set());events.get(type).add(fn)},
    removeEventListener:(type,fn)=>{events.get(type)?.delete(fn);if(!events.get(type)?.size)events.delete(type)},
    querySelector:()=>null,querySelectorAll:()=>[],getClientRects:()=>[{}],contains:target=>nodes.includes(target)}
   nodes.push(node);return node
  },
  restore(){for(const [key,value] of old){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}}
 }
}

test('scope plaque selection opens one tethered reader, keeps scope disclosure and routes Inspector deliberately while world gestures pause',()=>{
 const fake=dom(),calls=[];let tree
 const selected=layoutFor(),supplied=model()
 function Harness(){const [open,setOpen]=React.useState(false);return React.createElement('div',null,
  React.createElement('button',{onClick:()=>setOpen(true)},'Tap compact scope plaque'),
  open&&React.createElement(Overlay,{layout:selected,selectedKey:'admitted',model:supplied,interactionEnabled:false,
   onClose:()=>{calls.push('close');setOpen(false)},onInspect:value=>{calls.push(value);setOpen(false)}}))}
 try{
  act(()=>{tree=TestRenderer.create(React.createElement(Harness),{createNodeMock:fake.createNodeMock})})
  click(tree,'Tap compact scope plaque')
  assert.equal(tree.root.findAllByProps({className:'wv-billboard-card'}).length,1)
  assert.match(JSON.stringify(tree.toJSON()),/city scope · not exact position/)
  assert.equal(fake.doc.activeElement.focusOptions.preventScroll,true)
  const tether=tree.root.findByType('line');assert.equal(tether.props.x1,210);assert.equal(tether.props.y1,200)
  assert.deepEqual(supplied.canonicalCoordinates,coordinates)
  click(tree,'Close selected card')
  assert.equal(tree.root.findAllByProps({className:'wv-billboard-card'}).length,0)
  assert.equal(fake.doc.activeElement,fake.opener)
  click(tree,'Tap compact scope plaque');click(tree,'Open inspector')
  assert.equal(calls[1],supplied)
  assert.deepEqual(supplied.canonicalCoordinates,coordinates)
  assert.equal(fake.listeners.size,0)
 }finally{if(tree)act(()=>tree.unmount());fake.restore()}
})

test('orbit updates only the geographic tether; version/time changes reset tabs and stale model identity cannot render',()=>{
 const fake=dom();let tree
 const props={selectedKey:'admitted',layout:layoutFor(),model:model()}
 try{
  act(()=>{tree=TestRenderer.create(React.createElement(Overlay,props),{createNodeMock:fake.createNodeMock})})
  click(tree,'Context');assert.equal(selectedTab(tree),'Context')
  const card=tree.root.findByProps({className:'wv-billboard-card'}).props.style
  const next=layoutFor(viewport,{x:275,y:216})
  act(()=>tree.update(React.createElement(Overlay,{...props,layout:next})))
  assert.equal(selectedTab(tree),'Context')
  assert.deepEqual(tree.root.findByProps({className:'wv-billboard-card'}).props.style,card)
  assert.equal(tree.root.findByType('line').props.x1,275)
  const changed=model({revisionKey:'r2'})
  act(()=>tree.update(React.createElement(Overlay,{...props,model:changed})))
  assert.equal(selectedTab(tree),'Evidence')
  click(tree,'Sources');assert.equal(selectedTab(tree),'Sources')
  act(()=>tree.update(React.createElement(Overlay,{...props,model:model({revisionKey:'r2'},'2024-04-08T19:00:00Z')})))
  assert.equal(selectedTab(tree),'Evidence')
  act(()=>tree.update(React.createElement(Overlay,{...props,model:model({key:'other'})})))
  assert.equal(tree.toJSON(),null)
 }finally{if(tree)act(()=>tree.unmount());fake.restore()}
})

test('portrait/landscape readers remain bounded and report occlusion without relocating the canonical anchor',()=>{
 const fake=dom();let tree
 try{
  for(const view of [{width:390,height:844},{width:844,height:390},{width:320,height:240}]){
   const base=layoutFor(view,{x:-400,y:1800},{canonicalOccluded:true,occluded:true,displayOccluded:true})
   const updated=updateSelectedBillboardEnvelope({selected:base.selected,viewport:view})
   act(()=>{if(tree)tree.update(React.createElement(Overlay,{layout:{markers:[],selected:updated.selected},selectedKey:'admitted',model:model()}));
    else tree=TestRenderer.create(React.createElement(Overlay,{layout:{markers:[],selected:updated.selected},selectedKey:'admitted',model:model()}),{createNodeMock:fake.createNodeMock})})
   const box=tree.root.findByProps({className:'wv-billboard-card'}).props.style
   assert.ok(box.left>=16&&box.left+box.width<=view.width-16)
   assert.ok(box.top>=8&&box.top+box.maxHeight<=view.height-44)
   assert.equal(tree.root.findByType('line').props.x1,-400)
   assert.match(JSON.stringify(tree.toJSON()),/Canonical anchor occluded/)
   assert.deepEqual(updated.selected.canonicalCoordinates,coordinates)
  }
 }finally{if(tree)act(()=>tree.unmount());fake.restore()}
})

test('group inspection requires explicit current member choice and Escape closes without picking an arbitrary record',()=>{
 const fake=dom(),calls=[];let tree
 const items=[{key:'a',label:'City A',precision:'city'},{key:'b',label:'City B',precision:'city'}]
 const key='cluster:["a","b"]',layout={markers:[{key,state:'cluster',x:220,y:180,memberKeys:['a','b']}],selected:null}
 try{
  act(()=>{tree=TestRenderer.create(React.createElement(Overlay,{layout,items,selectedKey:key,onSelect:k=>calls.push(k),onClose:()=>calls.push('close')}),{createNodeMock:fake.createNodeMock})})
  assert.deepEqual(calls,[])
  assert.equal(tree.root.findAllByProps({className:'wv-billboard-card'}).length,0)
  const choose=tree.root.findAllByType('button').find(n=>n.findAllByType('span').some(s=>s.children.join('')==='City B'))
  act(()=>choose.props.onClick());assert.deepEqual(calls,['b'])
  act(()=>tree.root.findByProps({className:'wv-billboard-overlay'}).props.onKeyDown({key:'Escape',stopPropagation(){calls.push('stop')}}))
  assert.deepEqual(calls,['b','stop','close'])
 }finally{if(tree)act(()=>tree.unmount());fake.restore()}
})

test('selection close, invalidation and unmount release every attachment frame and document/motion listener',()=>{
 const fake=dom({reduced:false});let tree
 try{
  act(()=>{tree=TestRenderer.create(React.createElement(Overlay,{layout:layoutFor(),selectedKey:'admitted',model:model()}),{createNodeMock:fake.createNodeMock})})
  assert.equal(fake.frames.size,1)
  assert.equal(fake.listeners.get('visibilitychange').size,1)
  fake.doc.hidden=true;act(()=>fake.emit('visibilitychange'))
  assert.equal(fake.frames.size,0)
  fake.doc.hidden=false;act(()=>fake.emit('visibilitychange'))
  assert.equal(fake.frames.size,1)
  act(()=>tree.update(React.createElement(Overlay,{layout:layoutFor(),selectedKey:'admitted',model:model({key:'other'})})))
  assert.equal(fake.frames.size,0);assert.equal(fake.listeners.size,0,'a stale reading model owns no attachment loop')
  act(()=>tree.update(React.createElement(Overlay,{layout:{markers:[],selected:null},selectedKey:null,model:null})))
  assert.equal(fake.frames.size,0);assert.equal(fake.listeners.size,0)
  assert.ok(fake.nodes.every(node=>node.events.size===0))
  act(()=>tree.unmount());tree=null
  assert.equal(fake.frames.size,0);assert.equal(fake.listeners.size,0)
 }finally{if(tree)act(()=>tree.unmount());fake.restore()}
})

test('actual WorldView native tap, close/reopen, Inspector and Atlas binding retain canonical selection and recorded time',async()=>{
 const fake=dom(),tables=spatialTables(),selections=[];let tree
 const row=tables.spatial_projection_v1[0],canonical=JSON.stringify(row)
 const selected=layoutFor().selected
 globalThis.__plaqueCanvasAnchor={visible:true,x:210,y:200,width:1280,height:900,billboardSelected:selected,billboardMarkerVisible:true}
 const props={selected:{id:'synthetic-event',label:'Recorded event'},backend:spatialFixture({tables}).backend,
  investigationContext:{canonical_subject_id:'synthetic-event',canonical_subject_type:'event',as_of_time:'2024-04-08T18:00:00Z'},
  onSelectProjection:(node,value)=>selections.push({node,value}),onSelectGraphNode(){},onInvestigationAsOfTime:()=>assert.fail('reader never changes recorded time')}
 try{
  await act(async()=>{tree=TestRenderer.create(React.createElement(WorldView,props),{createNodeMock:fake.createNodeMock})})
  assert.equal(button(tree,'Open selected spatial context'),undefined,'a visible native scope plaque owns the default affordance')
  act(()=>globalThis.__plaqueCanvasProps.onSelectRow(row))
  assert.equal(selections.at(-1).value,row)
  assert.equal(tree.root.findAllByProps({className:'wv-billboard-card'}).length,1)
  assert.match(JSON.stringify(tree.toJSON()),/city scope · not exact position/)
  click(tree,'Close selected card')
  assert.equal(tree.root.findAllByProps({className:'wv-billboard-card'}).length,0)
  act(()=>globalThis.__plaqueCanvasProps.onSelectRow(row));click(tree,'Open inspector')
  assert.equal(tree.root.findAllByProps({className:'wv-billboard-card'}).length,0)
  globalThis.__plaqueCanvasAnchor={visible:true,x:210,y:200,width:390,height:844,billboardSelected:null}
  await act(async()=>tree.update(React.createElement(WorldView,{...props})))
  click(tree,'Open selected spatial context')
  assert.equal(tree.root.findAllByProps({className:'wv-billboard-card'}).length,0,'Atlas remains on the existing context card')
  assert.equal(JSON.stringify(row),canonical)
  assert.equal(props.investigationContext.as_of_time,'2024-04-08T18:00:00Z')
 }finally{if(tree)act(()=>tree.unmount());fake.restore()}
})
