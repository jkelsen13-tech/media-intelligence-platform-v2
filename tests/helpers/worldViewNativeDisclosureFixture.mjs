import {mkdir,readFile,rm} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {createWorldViewRealismSession} from '../../src/lib/worldViewRealismController.js'
import {WORLD_VIEW_REALISM_RIGHTS} from '../../src/lib/worldViewRealismAdmission.js'
import {spatialRow} from '../spatialBackendFixture.mjs'
import {unavailableWeather} from '../../src/lib/eventTimeWeather.js'

const key='__MIP_NATIVE_DISCLOSURE_LIFECYCLE__'
const output=new URL(`../.compiled/native-disclosure-node${process.versions.node.split('.')[0]}.mjs`,import.meta.url)
await mkdir(new URL('../.compiled/',import.meta.url),{recursive:true})
await build({stdin:{contents:"export {default as WorldView} from './src/views/WorldView.jsx';export {default as Canvas} from './src/views/WorldMapCanvas.jsx'",resolveDir:fileURLToPath(new URL('../..',import.meta.url)),loader:'jsx'},
  outfile:output.pathname,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},plugins:[{name:'explicit-source-disclosure-lifecycle-inputs',setup(b){
    b.onResolve({filter:/^react$/,namespace:'disclosure-graph'},()=>({path:'react',external:true}))
    b.onLoad({filter:/\/src\/views\/WorldView\.jsx$/},async args=>{
      const source=await readFile(args.path,'utf8'),needle='<WorldMapCanvas\n'
      if(source.split(needle).length!==2)throw Error('Exact WorldView Canvas prop-injection seam changed')
      // Input-only injection into the actual production child. The production
      // WorldView, Canvas, controller, source resolver and UI remain executed.
      return {contents:source.replace(needle,needle+`                realismServices={globalThis.${key}.services}\n`),loader:'jsx'}
    })
    b.onResolve({filter:/^\.\.\/lib\/worldViewRendererAdapter$/},()=>({path:'renderer',namespace:'disclosure-probe'}))
    b.onLoad({filter:/.*/,namespace:'disclosure-probe'},()=>({contents:`export const projectionMarkerRecords=(rows,keys)=>rows.map(row=>({row,positions:[row.display_geometry.coordinates],selected:keys.has(row.mip_object_id)}));export const createWorldViewRendererAdapter=args=>globalThis.${key}.renderer(args);`,loader:'js'}))
    b.onResolve({filter:/\/GraphView$/},()=>({path:'graph',namespace:'disclosure-graph'}))
    b.onLoad({filter:/.*/,namespace:'disclosure-graph'},()=>({contents:'import React from "react";export default ()=>React.createElement("div",{"data-graph-lifecycle-probe":true});',loader:'js'}))
    b.onResolve({filter:/^world-atlas\/countries-110m.json$/},()=>({path:'atlas',namespace:'disclosure-atlas'}))
    b.onLoad({filter:/.*/,namespace:'disclosure-atlas'},()=>({contents:'{"objects":{}}',loader:'json'}))
  }}]})
export const {WorldView,Canvas}=await import(output.href)
export const removeCompiled=()=>rm(output,{force:true})
export const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {resolve,promise}}
export const sourceCredit='SIMULATED_PRIVATE_OLD_SOURCE_CREDIT'
const source={id:'SIMULATED_PRIVATE_OLD_SOURCE_ID',kind:'imagery',contentKind:'photographic',costTier:'cheap',
  admission:{approved:true,reference:'SIMULATED_TEST_AUTHORITY_ONLY'},rights:{reference:'SIMULATED_TEST_AUTHORITY_ONLY',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(name=>[name,true]))},
  attribution:[{text:sourceCredit}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'SIMULATED_TEST_AUTHORITY_ONLY',assetCrs:'EPSG:4326',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},
  coverage:{crs:'EPSG:4326',bounds:[-82,41,-81,42]},capture:{verified:true,start:'2023-03-07',precision:'day'},resolutionMeters:2,lod:{min:0,max:15}}
const request={kind:'imagery',bounds:[-81.8,41.1,-81.2,41.8],level:10}
export const jsonText=tree=>JSON.stringify(tree.toJSON())
export const disclosures=tree=>tree.root.findAll(node=>Object.hasOwn(node.props,'data-rgb-source-disclosure'))
export const click=async(tree,label)=>act(async()=>{
  const button=tree.root.findAllByType('button').find(node=>node.props['aria-label']===label||node.children.includes(label))
  if(!button)throw Error(`No current production button: ${label}`)
  button.props.onClick()
})

export async function mountedDisclosureFixture(t,{standalone=false,pendingLoads=false,statuses=[],services:servicesOverride,renderer:rendererOverride,sessionOptions,beforeMountOwner}={}){
  const names=['window','document','navigator',key],previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]))
  const listeners=new Map(),frames=new Map(),timers=new Map(),renderers=[],loads=[],hosts=[]
  let id=0,tree,requestEnabled=true,loadedCloses=0,renderCloses=0
  let access={actorId:'SIMULATED_ACTOR_A',sessionReady:true}
  const owner=createWorldViewRealismSession(sessionOptions);owner.setCurrentAccessGetter(()=>access);owner.setAccess(access)
  const view={location:{search:''},matchMedia:()=>({matches:false}),scrollTo(){},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:key=>frames.delete(key),
    setInterval:fn=>{timers.set(++id,fn);return id},clearInterval:key=>timers.delete(key),
    addEventListener(){},removeEventListener(){}}
  const doc={hidden:false,defaultView:view,body:{style:{}},documentElement:{style:{}},
    createElement:()=>({style:{},getContext:()=>({measureText:text=>({width:text.length*7})})}),
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);if(!listeners.get(name)?.size)listeners.delete(name)}}
  const createNodeMock=element=>{const host={ownerDocument:doc,style:{},isConnected:true,parentElement:null,
    getBoundingClientRect:()=>({left:0,top:0,width:960,height:480,right:960,bottom:480}),getClientRects:()=>[{}],
    querySelector:()=>null,querySelectorAll:()=>[],focus(){},scrollIntoView(){},addEventListener(){},removeEventListener(){},setAttribute(){}}
    if(element.props.className==='wv-map-host')hosts.push(host)
    return host}
  const services=servicesOverride??{sources:[source],budgetOptions:{maxRequests:10,maxConcurrent:2,maxBytes:5000,now:()=>0},estimateBytes:()=>100,
    getRequest:()=>requestEnabled?request:null,transport:{load:async(descriptor,options)=>{
      const gate=deferred(),loaded={observedBytes:80,dispose(){loadedCloses++}}
      loads.push({descriptor,options,gate,loaded});if(pendingLoads)await gate.promise;return loaded
    }}}
  const renderer=options=>{
    if(rendererOverride){const adapter=rendererOverride(options,owner);renderers.push(adapter);return adapter}
    let state={available:true,status:'idle',ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0,nativeTeardownPending:false},destroyed=false
    const publish=()=>options.onSourceImageryStateChange?.({...state})
    const fence=()=>{state={available:!destroyed,status:'clearing',visibilityFenced:true,ownedPhotoLayerCount:0,retainedRgbaBytes:0,bitmapLeaseCount:0,nativeTeardownPending:false,nativeFrameObserved:false};publish()}
    const adapter={options,mount:async()=>publish(),getCameraState:()=>null,setCameraState:()=>true,setFeatures:async()=>{},setActivityState(){},setRelationships(){},
      getVisualFidelityCapabilities:()=>({}),setRecordedTimeInstant(){},setVisualFidelityProfile(){},getSourceImageryState:()=>({...state}),
      fenceSourceImagery:fence,destroy(){destroyed=true;fence();return true},
      attachSourceImagery:async(loaded,descriptor,{signal}={})=>{
        if(destroyed||signal?.aborted)throw Error('obsolete-lifecycle-probe')
        state={available:true,status:'active',sourceId:descriptor.sourceId,assetSha256:descriptor.metadata.assetSha256,bounds:descriptor.bounds,
          level:descriptor.level,ancestry:descriptor.ancestry,ownedPhotoLayerCount:4,retainedRgbaBytes:64,bitmapLeaseCount:1,nativeTeardownPending:false,nativeFrameObserved:true,creditsVisible:true,visibilityFenced:false}
        publish()
        return {observation:{sourceId:descriptor.sourceId,status:'active',rendered:true,successes:4,attributionVisible:true,
          bounds:descriptor.bounds,level:descriptor.level,ancestry:descriptor.ancestry},dispose(){renderCloses++;fence()}}
      }}
    renderers.push(adapter);return adapter
  }
  globalThis.window=view;globalThis.document=doc;Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});globalThis[key]={services,renderer}
  const row=structuredClone(spatialRow)
  const backend={loadSpatialProjection:async()=>({status:'ok',rows:[row],reason:null}),loadWorldViewGraph:async()=>({status:'ok',nodes:[],edges:[],edgesUnavailable:null}),
    loadTemporalAssessment:async()=>null,loadEventTimeWeather:async()=>unavailableWeather('fixture-not-sourced')}
  let props={sourceSession:owner,readerActorId:access.actorId,sessionReady:true,sourceAccessKey:'scope-A',backend,
    selected:{id:row.subject_graph_node_id,label:'Synthetic disclosure subject'},investigationContext:{canonical_subject_type:'event',canonical_subject_id:row.subject_graph_node_id,as_of_time:'2024-04-08T18:00:00.000000001Z'},
    onSelectProjection(){},onSelectGraphNode(){}}
  if(standalone)props={...props,rows:[row],selectedKeys:new Set([row.mip_object_id]),recordedTimeInstant:props.investigationContext.as_of_time,realismServices:services,onSourceStatus:value=>statuses.push(value)}
  const Component=standalone?Canvas:WorldView
  beforeMountOwner?.(owner)
  await act(async()=>{tree=TestRenderer.create(React.createElement(Component,props),{createNodeMock})})
  const flush=()=>act(async()=>new Promise(resolve=>setImmediate(resolve)))
  await flush()
  t.after(async()=>{
    if(tree)await act(async()=>tree.unmount());owner.dispose()
    for(const [name,prior] of previous){if(prior)Object.defineProperty(globalThis,name,prior);else delete globalThis[name]}
  })
  return {tree,owner,services,loads,renderers,hosts,props,statuses,
    get cleanupCounts(){return {loadedCloses,renderCloses}},
    flush,
    async activate(){await click(tree,'Return to selected location');await flush()},
    async update(next){props={...props,...next};await act(async()=>tree.update(React.createElement(Component,props)));await flush()},
    async access(value,key){requestEnabled=false;access=value;owner.setAccess(value);await this.update({readerActorId:value.actorId,sessionReady:value.sessionReady,sourceAccessKey:key})},
    blockRequest(){requestEnabled=false},allowRequest(){requestEnabled=true},
    async unmount(){await act(async()=>tree.unmount());tree=null},
  }
}
