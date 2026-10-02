// Detached research render of a received derivative. This does not install an
// MIP source, assert event registration, or grant the application admission.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const require = createRequire((process.env.MIP_BROWSER_PACKAGE ?? '/opt/codex/cua_node/lib/node_modules') + '/package.json')
const { chromium } = require('playwright')
const evidence = resolve(process.env.MIP_IMAGERY_EVIDENCE ?? '/workspace/mip-real-imagery-evidence')
const output = resolve(process.env.MIP_RESEARCH_GLOBE_OUTPUT ?? '/workspace/mip-launch-receipts/ohio-research-globe')
const origin = new URL(process.env.MIP_RESEARCH_VITE ?? 'http://127.0.0.1:4178/media-intelligence-platform-v2/')
assert.equal(origin.hostname, '127.0.0.1')
const receipt = JSON.parse(await readFile(resolve(evidence, 'runtime-consumer-receipt.json'), 'utf8'))
assert.equal(receipt.originalTiffBytesVerifiedLocally, false)
assert.equal(receipt.admission?.applicationAdmitted ?? receipt.manifest.admission?.applicationAdmitted ?? false, false)
assert.equal(receipt.increasesEvidencePrecision, false)
assert.equal(receipt.derivativePixelsVerifiedLocally, true)
const tiles = receipt.manifest.tiles
assert.equal(tiles.length, 4)
const payloads = new Map()
for (const tile of tiles) {
  assert.match(tile.name, /^tile-[01]-[01]\.png$/)
  assert.equal(tile.crs, 'EPSG:4326')
  assert.equal(tile.width, 512); assert.equal(tile.height, 512)
  assert.ok(tile.bounds.length === 4 && tile.bounds.every(Number.isFinite))
  const bytes = await readFile(resolve(evidence, 'planar-inspection', tile.name))
  assert.equal(bytes.length, tile.byteLength)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), tile.sha256)
  payloads.set('/mip-research/' + tile.name, bytes)
}
assert.ok(receipt.packageBytes + receipt.decodedRgbaBytes + 16 <= 16 * 1024 * 1024)
const caption = 'Research only · Ohio OSIP / Cuyahoga County · acquired 2023-03-07 (day only) · transformed coarser RGB derivative · reference ellipsoid, no terrain/facades · source NOT admitted to MIP'
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${origin.pathname}cesium/Widgets/widgets.css"><style>body{margin:0;background:#17211e;color:white;font:14px sans-serif}#label{padding:10px}#globe{height:650px;width:100%}</style></head><body><div id="label">${caption}</div><div id="globe"></div><script type="module">
window.CESIUM_BASE_URL=${JSON.stringify(origin.pathname + 'cesium/')};
const C=await import(${JSON.stringify(origin.pathname + 'node_modules/.vite/deps/cesium.js')});
const tiles=${JSON.stringify(tiles.map(t => ({ name:t.name,bounds:t.bounds })))};
const bounds=[Math.min(...tiles.map(t=>t.bounds[0])),Math.min(...tiles.map(t=>t.bounds[1])),Math.max(...tiles.map(t=>t.bounds[2])),Math.max(...tiles.map(t=>t.bounds[3]))];
let widget;
async function mount(){
 widget=new C.CesiumWidget('globe',{baseLayer:false,terrainProvider:new C.EllipsoidTerrainProvider(),skyAtmosphere:false,skyBox:false,scene3DOnly:true,requestRenderMode:true,contextOptions:{webgl:{preserveDrawingBuffer:true}}});
 widget.scene.globe.baseColor=C.Color.DARKBLUE;
 // Cesium stretches its first imagery layer to the globe. A generated neutral
 // background keeps actual photography bounded by each derivative rectangle.
 const neutral=document.createElement('canvas');neutral.width=neutral.height=2;
 const paint=neutral.getContext('2d');paint.fillStyle='#00008b';paint.fillRect(0,0,2,2);
 widget.imageryLayers.addImageryProvider(await C.SingleTileImageryProvider.fromUrl(neutral.toDataURL(),{rectangle:C.Rectangle.MAX_VALUE}));
 for(const t of tiles){const provider=await C.SingleTileImageryProvider.fromUrl('/mip-research/'+t.name,{rectangle:C.Rectangle.fromDegrees(...t.bounds),credit:'Cuyahoga County / OSIP research derivative'});widget.imageryLayers.addImageryProvider(provider);}
 widget.camera.setView({destination:C.Rectangle.fromDegrees(...bounds)});widget.scene.requestRender();
 return {layers:widget.imageryLayers.length-1,neutralBackgroundLayers:1,bounds,canvas:[widget.canvas.width,widget.canvas.height],referenceEllipsoid:true,admitted:false};
}
window.__MIP_RESEARCH__={mount,inspect:()=>({layers:widget.imageryLayers.length-1,neutralBackgroundLayers:1,bounds,imageryReady:widget.scene.globe.tilesLoaded,canvas:[widget.canvas.width,widget.canvas.height],canonicalEvidenceMarkers:0}),destroy:()=>{widget.destroy();return document.querySelectorAll('#globe canvas').length}};
window.__MIP_RESEARCH_READY__=await mount();
</script></body></html>`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless:true, executablePath:'/usr/bin/chromium', args:['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport:{ width:1040,height:720 } })
const requests=[],errors=[]
page.on('pageerror', error=>errors.push(error.message))
await page.route('**/*', async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.hostname!=='127.0.0.1' || request.method()!=='GET') { requests.push({method:request.method(),path:url.pathname,blocked:true});return route.abort() }
  if(url.pathname==='/mip-research/globe')return route.fulfill({status:200,contentType:'text/html',body:html})
  if(payloads.has(url.pathname)){requests.push({method:'GET',path:url.pathname,localDerivative:true});return route.fulfill({status:200,contentType:'image/png',body:payloads.get(url.pathname)})}
  return route.continue()
})
try {
  await page.goto(new URL('/mip-research/globe', origin).href)
  await page.waitForFunction(()=>window.__MIP_RESEARCH_READY__?.layers===4)
  await page.waitForFunction(()=>window.__MIP_RESEARCH__?.inspect().imageryReady)
  await page.waitForTimeout(1000)
  const first=await page.evaluate(()=>window.__MIP_RESEARCH__.inspect())
  await page.screenshot({path:resolve(output,'received-derivative-globe.png')})
  assert.equal(await page.evaluate(()=>window.__MIP_RESEARCH__.destroy()),0)
  const second=await page.evaluate(()=>window.__MIP_RESEARCH__.mount())
  await page.waitForFunction(()=>window.__MIP_RESEARCH__.inspect().imageryReady)
  assert.deepEqual(second.bounds,first.bounds)
  assert.equal(await page.evaluate(()=>window.__MIP_RESEARCH__.destroy()),0)
  assert.deepEqual(errors,[])
  assert.equal(requests.filter(r=>r.blocked).length,0)
  const result={schema:'mip-ohio-detached-research-globe-v1',status:'PASS',classification:'actual received derivative / local Chromium SwiftShader research',
    applicationAdmitted:false,originalTiffDecodedLocally:false,eventPointRegistrationQualified:false,physicalDeviceQualified:false,
    canonicalEvidenceMarkers:0,captureDay:'2023-03-07',packageSha256:receipt.packageSha256,
    resource:{packageBytes:receipt.packageBytes,decodedRgbaBytes:receipt.decodedRgbaBytes,generatedNeutralRgbaBytes:16,combinedCeilingBytes:16*1024*1024},
    imageryRequests:requests,firstMount:first,secondMount:second,cleanupCanvasCount:0,pageErrors:errors,
    consumerReceiptSha256:createHash('sha256').update(await readFile(resolve(evidence,'runtime-consumer-receipt.json'))).digest('hex'),
    verifierSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    limits:['Not an MIP source admission or production layer','Only received coarser derivative decoded here','Transform operation accuracy is separate from measured ground registration','No event pin, terrain, height, facade or physical-device evidence']}
  await writeFile(resolve(output,'receipt.json'),JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify({status:result.status,layers:first.layers,resource:result.resource,originalTiffDecodedLocally:false}))
} catch(error) {
  await page.screenshot({path:resolve(output,'failure.png')})
  await writeFile(resolve(output,'failure.json'),JSON.stringify({error:error.message,pageErrors:errors,requests},null,2)+'\n')
  throw error
} finally { await browser.close() }
