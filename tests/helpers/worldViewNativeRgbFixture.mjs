import { createHash, webcrypto } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { createWorldViewBoundedRgbTransport } from '../../src/lib/worldViewBoundedRgbImagery.js'
import { createWorldViewNativeRgbAttachment } from '../../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'
import { createWorldViewRendererAdapter } from '../../src/lib/worldViewRendererAdapter.js'
import { ELLIPSOID_GLOBE_STACK_ID } from '../../src/lib/worldViewMapStack.js'

export const deferred = () => { let resolve; const promise = new Promise(done => { resolve=done }); return { promise,resolve } }
export class Event {
  listeners = new Set()
  history = []
  addEventListener(fn) { this.listeners.add(fn); this.history.push(fn); return () => this.listeners.delete(fn) }
  raise(...args) { for (const fn of [...this.listeners]) if (this.listeners.has(fn)) fn(...args) }
}
const sha = value => createHash('sha256').update(value).digest('hex')
function chunk(name, bytes = Buffer.alloc(0)) {
  const label=Buffer.from(name), output=Buffer.alloc(bytes.length+12)
  output.writeUInt32BE(bytes.length); label.copy(output,4); bytes.copy(output,8)
  let crc=0xffffffff
  for(const byte of Buffer.concat([label,bytes])) { crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^(crc&1?0xedb88320:0) }
  output.writeUInt32BE((crc^0xffffffff)>>>0,bytes.length+8)
  return output
}
export function png() {
  const header=Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2,4); header[8]=8; header[9]=2
  const rows=Buffer.from([0,20,40,60,80,100,120,0,140,160,180,200,220,240])
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND')])
}
export function transportFixture({four=false,decode,fetchImpl,deadlineMs=1000}={}) {
  const bytes=png(), origin='https://bounded-native-failure.test'
  const cells=four?[[0,1,1,2],[1,1,2,2],[0,0,1,1],[1,0,2,1]]:[[0,0,2,2]]
  const packet={sourceId:'SIMULATED_NATIVE_FAILURE_QA_ONLY',registeredAssetSha256:'a'.repeat(64),runtimeProvenanceSha256:'b'.repeat(64),sourceMetadataXmlSha256:'c'.repeat(64),
    permissionGrant:false,capture:{precision:'day',start:'2023-03-07'},coverage:{crs:'EPSG:4326',bounds:[0,0,2,2]},localResourceEstimate:4096,
    tiles:cells.map((bounds,index)=>({key:`cell-${index}`,route:`/fixture/${index}.png`,sha256:sha(bytes),byteLength:bytes.length,width:2,height:2,bounds,crs:'EPSG:4326'}))}
  const descriptor={sourceId:packet.sourceId,kind:'imagery',level:0,requestedLevel:0,ancestry:'direct',bounds:[0,0,2,2],
    metadata:{assetSha256:packet.registeredAssetSha256,capture:packet.capture,coverage:packet.coverage,attribution:[{text:'SIMULATED QA <credit> & ownership'}]}}
  const images=[], fetches=[]
  const makeImage=()=>{const image={width:2,height:2,closed:0,close(){this.closed++}};images.push(image);return image}
  const transport=createWorldViewBoundedRgbTransport({packets:[packet],origin,deadlineMs,
    digest:(algorithm,data)=>webcrypto.subtle.digest(algorithm,data),
    fetchImpl:async(url,options)=>{fetches.push({url,options});if(fetchImpl)return fetchImpl(url,options)
      const response=new Response(bytes,{status:200,headers:{'content-type':'image/png','content-length':String(bytes.length)}})
      Object.defineProperty(response,'url',{value:url});return response},
    decodeImageBitmap:decode??(async()=>makeImage()),
  })
  return {bytes,packet,descriptor,transport,images,fetches,makeImage,load:options=>transport.load(descriptor,{maxBytes:4096,...options})}
}

// These doubles qualify public API state/failure ownership only. They do not
// render pixels and cannot establish actual Cesium/App materialization.
export async function nativeFixture({failAllocationAt=0,deadlineMs=1000,onChange=()=>{},mountGate}={}) {
  const events={postRender:new Event(),renderError:new Event()}, layers=[{baseline:true}], removed=[], trace=[], credits=[]
  let allocated=0, cancelled=false, destroyed=false, removeFailure=false, removeReturnsFalse=false
  const style={display:'block',visibility:'visible',opacity:'1'}
  const creditNode={textContent:'SIMULATED QA <credit> & ownership',getClientRects:()=>[{}],ownerDocument:{defaultView:{getComputedStyle:()=>style}}}
  const host={style:{visibility:''},querySelector:()=>creditNode}
  const viewer={canvas:{clientWidth:800,clientHeight:600},useDefaultRenderLoop:true,isDestroyed:()=>destroyed,
    scene:{...events,requestRender(){trace.push('requestRender')}},
    imageryLayers:{get length(){return layers.length},contains:layer=>layers.includes(layer),
      addImageryProvider(provider){allocated++;if(allocated===failAllocationAt)throw Error('simulated allocation failure');const layer={provider,destroyed:false};layers.push(layer);return layer},
      remove(layer,destroy){if(removeFailure)throw Error('simulated native layer teardown failure');if(removeReturnsFalse)return false;const index=layers.indexOf(layer);if(index<0)return false;layers.splice(index,1);layer.destroyed=destroy;removed.push(layer);trace.push('layerRemoved');return true}},
    destroy(){destroyed=true;for(const layer of layers.slice(1)){layer.destroyed=true;removed.push(layer)}layers.splice(1);trace.push('viewerDestroyed')},
  }
  class Credit { constructor(html,onScreen){this.html=html;this.onScreen=onScreen;credits.push(this)} }
  const Cesium={Event,Credit,Rectangle:{fromDegrees:(...bounds)=>({bounds})},GeographicTilingScheme:class{constructor(options){Object.assign(this,options)}},
    Cartesian3:{fromDegrees:(lon,lat)=>({lon,lat})},SceneTransforms:{worldToWindowCoordinates:(_scene,{lon,lat})=>({x:lon*100,y:lat*100})}}
  let nativeViewer=viewer
  const native=createWorldViewNativeRgbAttachment({Cesium,getViewer:()=>nativeViewer,getHost:()=>host,isCancelled:()=>cancelled,onChange,deadlineMs})
  const facade=createWorldViewRendererAdapter({stackId:ELLIPSOID_GLOBE_STACK_ID,isCancelled:()=>cancelled},
    {loadGlobeAdapter:async()=>({createCesiumEllipsoidRendererAdapter:()=>({mount:()=>mountGate?.promise,
      attachSourceImagery:native.attach,getSourceImageryState:native.state,fenceSourceImagery:native.fence,destroy:native.destroy})})})
  return {native,facade,host,viewer,events,layers,removed,trace,credits,style,
    mount:()=>facade.mount(),frame:()=>events.postRender.raise(),cancel(){cancelled=true},failRemoval(value=true){removeFailure=value},failRemovalResult(value=true){removeReturnsFalse=value},
    loseViewerAccessor(){nativeViewer=null},provider:index=>layers[index+1]?.provider,owned:()=>layers.filter(layer=>!layer.baseline)}
}
export async function confirm(f, loaded, descriptor) {
  const pending=f.facade.attachSourceImagery(loaded,descriptor)
  const providers=f.owned().map(layer=>layer.provider)
  await Promise.all(providers.map(provider=>provider.requestImage(0,0,0)))
  f.frame();f.frame()
  return { handle:await pending, providers }
}
