import { readFile } from 'node:fs/promises'
import { Event, transportFixture } from './worldViewNativeRgbFixture.mjs'
import { createWorldViewRendererAdapter } from '../../src/lib/worldViewRendererAdapter.js'

// Execute the complete production outer adapter. Only the vendor import,
// vendor stylesheet and unrelated terrain-provider import are controlled.
// Every other MIP dependency, RGB transport and all attachment/destroy code
// retain the candidate's actual implementation. No native GPU or network.
const sourceUrl=new URL('../../src/lib/worldViewCesiumEllipsoidRendererAdapter.js',import.meta.url)
const key='__MIP_NATIVE_RGB_OUTER_REGRESSION__'
const moduleUrl=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64')
let serial=0
async function loadAdapter(){
  const instance=++serial
  const names=['Viewer','Math','Credit','UrlTemplateImageryProvider','ImageryLayer','SceneMode','ScreenSpaceEventHandler','ScreenSpaceEventType','ClockStep','JulianDate','Cartesian3','Cartesian2','BoundingSphere','HeadingPitchRange','Color','LabelStyle','HorizontalOrigin','VerticalOrigin','Event','Rectangle','GeographicTilingScheme','SceneTransforms']
  const vendor=moduleUrl(`const C=globalThis[${JSON.stringify(key)}];export const {${names.join(',')}}=C;// ${instance}`)
  const terrain=moduleUrl("export const TERRAIN_CREDIT_TEXT='controlled no-terrain';export const createTerrariumTerrainProvider=()=>null;export const tileXYForLongitudeLatitudeDegrees=()=>({x:0,y:0});")
  const source=(await readFile(sourceUrl,'utf8'))
    .replace(/from\s+'(\.\/[^']+)'/g,(_,path)=>'from '+JSON.stringify(path==='./worldViewCesiumTerrariumTerrainProvider.js'?terrain:new URL(path,sourceUrl).href))
    .replace("import('cesium')",'import('+JSON.stringify(vendor)+')')
    .replace("import('cesium/Build/Cesium/Widgets/widgets.css')",'import('+JSON.stringify(moduleUrl('export {};'))+')')
  return import(moduleUrl(source+`\n// isolated outer adapter ${instance}`))
}

export async function outerFixture(t,{facade=false,attach=true,deferMount=false}={}){
  const layers=[{baseline:true}], trace=[], observations=[], fallbacks=[], nodes=[]
  const controls={removalFailure:false,removalReturnsFalse:false,destroyFailure:false,removalCalls:0,destroyCalls:0,handlerDestroys:0,hostRemovals:0,requests:0}
  const events={postRender:new Event(),renderError:new Event()}
  const creditStyle={display:'block',visibility:'visible',opacity:'1'}
  const document={defaultView:{getComputedStyle:()=>creditStyle},createElement(){
    const element={style:{},ownerDocument:document,isConnected:true,remove(){element.isConnected=false;controls.hostRemovals++},
      getContext:()=>({measureText:text=>({width:text.length*7})}),querySelector:()=>creditNode}
    nodes.push(element);return element
  }}
  const creditNode={textContent:'SIMULATED QA <credit> & ownership',setAttribute(){},getClientRects:()=>[{}],ownerDocument:document}
  const host={ownerDocument:document,appendChild(){}}
  let viewer
  class Viewer{
    constructor(element){
      viewer=this;this.element=element;this.destroyed=false;this.useDefaultRenderLoop=true
      this.canvas={clientWidth:800,clientHeight:600,addEventListener(){},removeEventListener(){}}
      this.camera={positionCartographic:{longitude:-1,latitude:.5,height:10000},heading:0,pitch:-Math.PI/2,roll:0,
        moveEnd:new Event(),cancelFlight(){},setView(){},flyToBoundingSphere(){}}
      this.clock={currentTime:0,shouldAnimate:false,canAnimate:false}
      this.scene={...events,canvas:this.canvas,screenSpaceCameraController:{},requestRender(){controls.requests++},
        globe:{enableLighting:false,dynamicAtmosphereLighting:false,dynamicAtmosphereLightingFromSun:false},sun:{show:true},moon:{show:true}}
      this.imageryLayers={get length(){return layers.length},contains:layer=>layers.includes(layer),
        addImageryProvider(provider){const layer={provider};layers.push(layer);return layer},
        remove(layer){controls.removalCalls++;trace.push('remove');if(controls.removalFailure)throw Error('controlled retained native layer')
          if(controls.removalReturnsFalse)return false
          const index=layers.indexOf(layer);if(index<0)return false;layers.splice(index,1);return true}}
      this.entities={add:value=>value,remove(){}};this.cesiumWidget={}
    }
    isDestroyed(){return this.destroyed}
    resize(){}
    destroy(){controls.destroyCalls++;trace.push('destroy');if(controls.destroyFailure)throw Error('controlled surviving native Viewer')
      this.destroyed=true;layers.splice(1)}
  }
  class Options{constructor(options){Object.assign(this,options)}}
  const vendor={Viewer,Event,Credit:class{constructor(html,onScreen){this.html=html;this.onScreen=onScreen}},
    UrlTemplateImageryProvider:Options,ImageryLayer:Options,SceneMode:{SCENE3D:3},
    ScreenSpaceEventHandler:class{setInputAction(){}destroy(){controls.handlerDestroys++}},ScreenSpaceEventType:{LEFT_CLICK:0},
    Math:{toRadians:degrees=>degrees*Math.PI/180,toDegrees:radians=>radians*180/Math.PI},
    ClockStep:{TICK_DEPENDENT:0},JulianDate:{fromDate:date=>date.getTime(),equals:(a,b)=>a===b},
    Cartesian3:{fromDegrees:(lon,lat,height)=>({lon,lat,height})},Cartesian2:Options,BoundingSphere:Options,HeadingPitchRange:Options,Color:Options,
    LabelStyle:{FILL_AND_OUTLINE:0},HorizontalOrigin:{LEFT:0},VerticalOrigin:{CENTER:0},
    Rectangle:{fromDegrees:(...bounds)=>({bounds})},GeographicTilingScheme:Options,
    SceneTransforms:{worldToWindowCoordinates:(_scene,{lon,lat})=>({x:lon*100,y:lat*100})}}
  const keys=['document',key,'CESIUM_BASE_URL'], prior=keys.map(name=>Object.getOwnPropertyDescriptor(globalThis,name))
  globalThis.document=document;globalThis[key]=vendor
  const {createCesiumEllipsoidRendererAdapter}=await loadAdapter()
  const args={stackId:'ellipsoid-globe',getHostEl:()=>host,precisionClass:'city',initialFeatures:[],shouldFlyTo:()=>false,
    onSourceImageryStateChange:value=>observations.push(value),onStackIdChange:stack=>fallbacks.push(stack)}
  const adapter=facade?createWorldViewRendererAdapter(args,{loadGlobeAdapter:async()=>({createCesiumEllipsoidRendererAdapter})}):createCesiumEllipsoidRendererAdapter(args)
  adapter.setReliefShadingEnabled(false)
  if(!deferMount)await adapter.mount()
  t.after(()=>{
    controls.removalFailure=false;controls.removalReturnsFalse=false;controls.destroyFailure=false;adapter.destroy();viewer?.destroy()
    keys.forEach((name,index)=>{if(prior[index])Object.defineProperty(globalThis,name,prior[index]);else delete globalThis[name]})
  })
  const transport=transportFixture({four:true})
  let loaded=null,renderHandle=null
  if(attach){
    loaded=await transport.load()
    const attaching=adapter.attachSourceImagery(loaded,transport.descriptor)
    const providers=layers.slice(1).map(layer=>layer.provider)
    await Promise.all(providers.map(provider=>provider.requestImage(0,0,0)))
    events.postRender.raise();events.postRender.raise()
    renderHandle=await attaching
  }
  return {adapter,get viewer(){return viewer},layers,controls,trace,observations,fallbacks,transport,loaded,renderHandle,
    frame:()=>events.postRender.raise(),fatal:()=>events.renderError.raise(viewer.scene,Error('controlled fatal draw')),
    flush:async()=>{await Promise.resolve();await Promise.resolve()},
    snapshot:()=>({nativeViewerDestroyed:viewer.isDestroyed(),nativePhotoLayers:layers.length-1,
      publicState:adapter.getSourceImageryState(),lastManagerState:observations.at(-1),
      bitmapCloses:transport.images.map(image=>image.closed),nativeDestroyAttempts:controls.destroyCalls,
      nativeRemovalAttempts:controls.removalCalls,hostConnected:viewer.element.isConnected,hostVisibility:viewer.element.style.visibility})}
}
