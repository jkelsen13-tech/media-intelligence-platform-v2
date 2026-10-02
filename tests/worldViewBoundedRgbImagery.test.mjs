import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash, webcrypto} from 'node:crypto'
import {deflateSync} from 'node:zlib'
import {createWorldViewBoundedRgbTransport, estimateWorldViewBoundedRgbBytes,
  validateWorldViewBoundedRgbLoaded} from '../src/lib/worldViewBoundedRgbImagery.js'

const ORIGIN = 'https://imagery.test'
const SHA = value => createHash('sha256').update(value).digest('hex')
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return {promise, resolve} }
const crc32 = bytes => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(name, data=Buffer.alloc(0)) {
  const label = Buffer.from(name), output = Buffer.alloc(data.length+12)
  output.writeUInt32BE(data.length); label.copy(output,4); data.copy(output,8)
  output.writeUInt32BE(crc32(Buffer.concat([label,data])),data.length+8)
  return output
}
function png({width=2,height=2,bitDepth=8,colorType=2,interlace=0,before=[],after=[]}={}) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height,4)
  header[8]=bitDepth; header[9]=colorType; header[12]=interlace
  const rows = Buffer.alloc(height*(width*3+1),37)
  for(let row=0;row<height;row++) rows[row*(width*3+1)]=0
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...before,
    chunk('IDAT',deflateSync(rows)),...after,chunk('IEND')])
}
function fixture({four=false, bytes=png(), mutatePacket=()=>{}, fetchImpl, decoder, deadlineMs=1000, onEvent}={}) {
  const tiles = four ? [[0,1,1,2],[1,1,2,2],[0,0,1,1],[1,0,2,1]] : [[0,0,2,2]]
  const packet = {sourceId:'simulated-test-only',registeredAssetSha256:'a'.repeat(64),
    runtimeProvenanceSha256:'b'.repeat(64),sourceMetadataXmlSha256:'c'.repeat(64),
    capture:{precision:'day',start:'2023-03-07'},coverage:{crs:'EPSG:4326',bounds:[0,0,2,2]},
    permissionGrant:false,localResourceEstimate:4096,tiles:tiles.map((bounds,index)=>({key:`tile-${index}`,
      route:`/fixture/tile-${index}.png`,sha256:SHA(bytes),byteLength:bytes.length,width:2,height:2,bounds,crs:'EPSG:4326'}))}
  mutatePacket(packet)
  const descriptor = {sourceId:packet.sourceId,kind:'imagery',level:0,requestedLevel:0,ancestry:'direct',
    bounds:[...packet.coverage.bounds],metadata:{assetSha256:packet.registeredAssetSha256,
      capture:structuredClone(packet.capture),coverage:structuredClone(packet.coverage)}}
  const gets=[], images=[], decodes=[], events=[]
  const makeImage = (width=2,height=2) => { const image={width,height,closes:0,close(){this.closes++}}; images.push(image); return image }
  const response = (url, body=bytes, extra={}) => {
    const result = new Response(body,{status:200,headers:{'content-type':'image/png','content-length':String(body.length ?? bytes.length)}})
    Object.defineProperties(result,{url:{value:url},...Object.fromEntries(Object.entries(extra).map(([key,value])=>[key,{value}]))})
    return result
  }
  const transport=createWorldViewBoundedRgbTransport({packets:[packet],origin:ORIGIN,deadlineMs,
    digest:(algorithm, data)=>webcrypto.subtle.digest(algorithm,data),
    fetchImpl:async(url,options)=>{gets.push({url,options});return fetchImpl ? fetchImpl(url,options,{response,bytes}) : response(url)},
    decodeImageBitmap:async(blob,options)=>{decodes.push({blob,options});return decoder ? decoder(blob,options,{makeImage}) : makeImage()},
    onEvent:event=>{events.push(event);onEvent?.(event)}})
  return {packet,descriptor,transport,bytes,gets,images,decodes,events,makeImage,response,
    load:options=>transport.load(descriptor,{maxBytes:packet.localResourceEstimate,...options})}
}

test('four pinned RGB tiles verify exact bytes, decode policy, identity and resource leases',async()=>{
  const f=fixture({four:true}),loaded=await f.load()
  assert.equal(validateWorldViewBoundedRgbLoaded(loaded,f.descriptor),true)
  assert.equal(loaded.contract,'mip-bounded-rgb-imagery-v1')
  assert.equal(loaded.observedBytes,f.bytes.length*4)
  assert.equal(loaded.observedBytesComplete,true)
  assert.equal(loaded.decodedByteLength,64)
  assert.equal(loaded.runtimeProvenanceSha256,f.packet.runtimeProvenanceSha256)
  assert.equal(loaded.sourceMetadataXmlSha256,f.packet.sourceMetadataXmlSha256)
  assert.equal(f.transport.estimateBytes(f.descriptor),4096)
  assert.equal(estimateWorldViewBoundedRgbBytes(f.packet),4096)
  assert.equal(f.gets.length,4)
  for (const get of f.gets) {
    assert.equal(get.options.redirect,'error');assert.equal(get.options.mode,'same-origin')
    assert.equal(get.options.method,'GET');assert.equal(get.options.cache,'no-store')
  }
  assert.equal(loaded.nativeTextureOrientation,'cesium-imagebitmap-preflip-y-v1')
  for(const decode of f.decodes) assert.deepEqual(decode.options,{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'})
  assert.equal(Object.isFrozen(loaded),true);assert.equal(Object.isFrozen(loaded.tiles[0].bounds),true)
  const releaseA=loaded.retainDecodedImages(),releaseB=loaded.retainDecodedImages()
  assert.deepEqual(loaded.getResourceState(),{leaseCount:2,closedCount:0,retainedRgbaBytes:64,disposed:false})
  loaded.dispose();loaded.dispose();releaseA();releaseA()
  assert.deepEqual(f.images.map(image=>image.closes),[0,0,0,0])
  assert.equal(validateWorldViewBoundedRgbLoaded(loaded,f.descriptor),false)
  releaseB();releaseB();loaded.dispose()
  assert.deepEqual(f.images.map(image=>image.closes),[1,1,1,1])
  assert.deepEqual(loaded.getResourceState(),{leaseCount:0,closedCount:4,retainedRgbaBytes:0,disposed:true})
  assert.throws(()=>loaded.retainDecodedImages(),/disposed/)
})

test('brand validation rejects forged/copied handles and every mismatching descriptor identity',async()=>{
  const f=fixture(),loaded=await f.load()
  assert.equal(validateWorldViewBoundedRgbLoaded({...loaded},f.descriptor),false)
  assert.equal(validateWorldViewBoundedRgbLoaded({contract:loaded.contract,tiles:loaded.tiles},f.descriptor),false)
  for(const mutate of [d=>d.sourceId='different',d=>d.metadata.assetSha256='d'.repeat(64),d=>d.bounds[0]=0.1,
    d=>d.level=1,d=>d.requestedLevel=1,d=>d.ancestry='approved-parent',d=>d.kind='terrain',
    d=>d.metadata.capture.start='2023-03-08',d=>d.metadata.coverage.bounds[0]=0.1]) {
    const descriptor=structuredClone(f.descriptor);mutate(descriptor)
    assert.equal(validateWorldViewBoundedRgbLoaded(loaded,descriptor),false)
  }
  loaded.dispose();assert.equal(f.images[0].closes,1)
})

test('packet snapshots cannot be retimed, rerouted, enlarged or granted permission after construction',async()=>{
  const f=fixture()
  f.packet.tiles[0].route='/elsewhere.png';f.packet.tiles[0].sha256='e'.repeat(64)
  f.packet.capture.start='2026-10-02';f.packet.coverage.bounds[0]=-180;f.packet.permissionGrant=true
  const loaded=await f.load()
  assert.equal(f.gets[0].url,`${ORIGIN}/fixture/tile-0.png`)
  assert.equal(loaded.capture.start,'2023-03-07');assert.deepEqual(loaded.bounds,[0,0,2,2])
  loaded.dispose()
})

test('no fetch or allocation starts without exact descriptor and sufficient prior reservation bound',async()=>{
  const f=fixture()
  for(const maxBytes of [undefined,null,0,-1,1,4095,Infinity,16*1024*1024+1])
    await assert.rejects(f.transport.load(f.descriptor,{maxBytes}),error=>error.observedBytes===0 && /bound/.test(error.message))
  for(const mutate of [d=>d.bounds[1]=0.1,d=>d.level=1,d=>d.requestedLevel=1,d=>d.ancestry='approved-parent',
    d=>d.metadata.assetSha256='f'.repeat(64),d=>d.metadata.capture.start='2023-03-08']) {
    const descriptor=structuredClone(f.descriptor);mutate(descriptor)
    assert.equal(f.transport.estimateBytes(descriptor),null)
    await assert.rejects(f.transport.load(descriptor,{maxBytes:4096}),/pin-mismatch/)
  }
  assert.equal(f.gets.length,0);assert.equal(f.decodes.length,0)
})

test('invalid pin, permission, capture, dimensional and byte policies are refused at configuration',()=>{
  for(const mutatePacket of [p=>p.permissionGrant=true,p=>p.permissionGrant=undefined,p=>p.runtimeProvenanceSha256='bad',
    p=>p.sourceMetadataXmlSha256='bad',p=>p.registeredAssetSha256='bad',p=>p.sourceId='',
    p=>p.capture.start='2023-02-30',p=>p.capture.precision='instant',p=>p.coverage.crs='EPSG:3753',
    p=>p.tiles[0].width=513,p=>p.tiles[0].height=0,p=>p.tiles[0].byteLength=0,
    p=>p.tiles[0].crs='EPSG:3857',p=>p.localResourceEstimate=1,p=>p.localResourceEstimate=Infinity,
    p=>p.tiles=[]]) assert.throws(()=>fixture({mutatePacket}),/rgb-/)
})

test('tile rectangle grid rejects overlapping, missing, out-of-coverage or wrapping partitions exactly',()=>{
  for(const mutatePacket of [p=>p.tiles[3].bounds=[0,0,1,1],p=>p.tiles[3].bounds[0]=1.0000000000000002,
    p=>p.tiles[3].bounds[0]=0.9999999999999999,p=>p.tiles[3].bounds[1]=-0.1,
    p=>p.coverage.bounds=[170,0,-170,2],p=>p.tiles.push({...p.tiles[0],key:'fifth',route:'/fifth.png'}),
    p=>p.tiles[3].key=p.tiles[2].key,p=>p.tiles[3].route=p.tiles[2].route])
    assert.throws(()=>fixture({four:true,mutatePacket}),/rgb-/)
})

test('canonical coverage south is exact and a merely rounded descriptor is rejected',async()=>{
  const bounds=[-81.70168427944155,41.400004131028425,-81.69717870180786,41.403396541317306]
  const f=fixture({mutatePacket:p=>{p.coverage.bounds=bounds;p.tiles[0].bounds=bounds}})
  const rounded=structuredClone(f.descriptor);rounded.bounds[1]=41.40000413102843
  assert.equal(f.transport.estimateBytes(rounded),null)
  await assert.rejects(f.transport.load(rounded,{maxBytes:4096}),/pin-mismatch/)
  const loaded=await f.load();assert.equal(loaded.bounds[1],41.400004131028425);loaded.dispose()
})

test('exact local routes reject external origins, encoded traversal, queries, fragments and path aliases',()=>{
  for(const invalid of ['https://elsewhere.test/tile.png','//elsewhere.test/tile.png','/../tile.png','/a/./tile.png',
    '/a/%2e%2e/tile.png','/a%2fb.png','/tile.png?x=1','/tile.png#x','relative.png','/a//b.png'])
    assert.throws(()=>fixture({mutatePacket:p=>{p.tiles[0].route=invalid}}),/rgb-/)
  const f=fixture()
  for(const origin of ['https://imagery.test/','file:///tmp','https://u:p@imagery.test','https://imagery.test/path'])
    assert.throws(()=>createWorldViewBoundedRgbTransport({packets:[f.packet],origin,decodeImageBitmap:()=>{},digest:()=>{}}),/origin/)
  assert.throws(()=>createWorldViewBoundedRgbTransport({packets:[f.packet,f.packet],origin:ORIGIN,decodeImageBitmap:()=>{},digest:()=>{}}),/duplicate/)
})

test('redirects, response URL substitutions, non-200, wrong MIME and advertised length refuse before decode',async()=>{
  for(const extra of [{redirected:true},{url:'https://elsewhere.test/tile.png'},{url:`${ORIGIN}/other.png`},
    {status:206},{ok:false},{type:'opaque'}]) {
    const f=fixture({fetchImpl:(url,options,{response})=>response(url,undefined,extra)})
    await assert.rejects(f.load(),error=>/route/.test(error.message) && error.observedBytes===0)
    assert.equal(f.decodes.length,0)
  }
  for(const headers of [{'content-type':'image/jpeg','content-length':'1'},
    {'content-type':'image/png','content-length':'1'},{'content-type':'image/png','content-length':'invalid'}]) {
    const f=fixture({fetchImpl:(url,options,{bytes})=>({url,status:200,ok:true,redirected:false,headers:new Headers(headers),body:new ReadableStream()})})
    await assert.rejects(f.load(),error=>error.observedBytes===0)
  }
})

test('stream overrun stops before admitting the excess chunk but records every body byte observed',async()=>{
  let reads=0,cancels=0
  const f=fixture({fetchImpl:(url,options,{bytes})=>({url,status:200,ok:true,redirected:false,
    headers:new Headers({'content-type':'image/png'}),body:{getReader:()=>({
      async read(){reads++;return {done:false,value:reads===1 ? bytes.subarray(0,10) : new Uint8Array(bytes.length)}},
      cancel(){cancels++},releaseLock(){}})}})})
  await assert.rejects(f.load(),error=>/byte-bound/.test(error.message) && error.observedBytes===f.bytes.length+10)
  assert.equal(reads,2);assert.equal(cancels,1);assert.equal(f.decodes.length,0)
})

test('short/truncated PNG bodies record partial bytes and refuse decode',async()=>{
  const f=fixture({fetchImpl:(url,options,{response,bytes})=>{
    const result=response(url,bytes.subarray(0,20));result.headers.delete('content-length');return result
  }})
  await assert.rejects(f.load(),error=>/length/.test(error.message) && error.observedBytes===20)
  assert.equal(f.decodes.length,0)
})

test('a frozen injected stream error still produces an owned partial-byte accounting receipt',async()=>{
  let reads=0
  const f=fixture({fetchImpl:url=>({url,status:200,ok:true,redirected:false,
    headers:new Headers({'content-type':'image/png'}),body:{getReader:()=>({
      async read(){if(++reads===1)return {done:false,value:new Uint8Array(10)};throw Object.freeze(Error('stream failed'))},cancel(){}})}})})
  await assert.rejects(f.load(),error=>error.message==='stream failed'&&error.observedBytes===10)
})

test('equal-length encoded tampering fails SHA256 before browser decoding',async()=>{
  const f=fixture({fetchImpl:(url,options,{response,bytes})=>{const changed=Buffer.from(bytes);changed[29]^=1;return response(url,changed)}})
  await assert.rejects(f.load(),error=>/hash-mismatch/.test(error.message) && error.observedBytes===f.bytes.length)
  assert.equal(f.decodes.length,0)
})

test('RGB policy refuses alpha, palette, 16-bit, interlace, transparency and animation even when those bytes are pinned',async()=>{
  for(const bytes of [png({colorType:6}),png({colorType:3}),png({bitDepth:16}),png({interlace:1}),
    png({before:[chunk('tRNS',Buffer.alloc(6))]}),png({before:[chunk('acTL',Buffer.alloc(8))]}),
    png({after:[chunk('fdAT',Buffer.alloc(4))]})]) {
    const f=fixture({bytes});await assert.rejects(f.load(),/png-/);assert.equal(f.decodes.length,0)
  }
})

test('PNG signature, dimensions, critical chunk topology and trailing bytes fail before decode',async()=>{
  const valid=png(),badSignature=Buffer.from(valid);badSignature[0]=0
  for(const bytes of [badSignature,png({width:3}),Buffer.concat([valid,Buffer.from([0])]),
    png({before:[chunk('ABCD')]}),png({after:[chunk('IHDR',Buffer.alloc(13))]})]) {
    const f=fixture({bytes});await assert.rejects(f.load(),/png-/);assert.equal(f.decodes.length,0)
  }
})

test('decoded dimension mismatch and decode errors close earlier accepted images once',async()=>{
  for(const failure of ['dimensions','reject']) {
    let calls=0
    const f=fixture({four:true,decoder:(blob,options,{makeImage})=>{
      calls++;if(calls===2){if(failure==='reject')throw Error('decoder failed');return makeImage(3,2)}return makeImage()
    }})
    await assert.rejects(f.load())
    assert.equal(f.images.every(image=>image.closes===1),true)
    assert.equal(f.gets.length,2)
  }
})

test('a decoder cannot reuse the same bitmap as two pinned tile payloads',async()=>{
  let image
  const f=fixture({four:true,decoder:(blob,options,{makeImage})=>image ??= makeImage()})
  await assert.rejects(f.load(),/dimensions/);assert.equal(image.closes,1)
})

test('reused bitmap rejection cannot close another loaded handle with a retained native lease',async()=>{
  let image
  const f=fixture({decoder:(blob,options,{makeImage})=>image ??= makeImage()})
  const loaded=await f.load(),release=loaded.retainDecodedImages()
  await assert.rejects(f.load(),/dimensions/)
  assert.equal(image.closes,0);assert.equal(validateWorldViewBoundedRgbLoaded(loaded,f.descriptor),true)
  loaded.dispose();assert.equal(image.closes,0);release();assert.equal(image.closes,1)
})

test('pre-aborted owner does not start fetch, decode or emit a successful load',async()=>{
  const abort=new AbortController();abort.abort()
  const f=fixture();await assert.rejects(f.load({signal:abort.signal}),error=>/aborted/.test(error.message)&&error.observedBytes===0)
  assert.equal(f.gets.length,0);assert.equal(f.decodes.length,0)
})

test('owner abort between asynchronous checkpoints and operation startup prevents the fetch allocation',async()=>{
  const abort=new AbortController(),f=fixture({onEvent:event=>{
    if(event.type==='fetch-start')queueMicrotask(()=>abort.abort())
  }})
  await assert.rejects(f.load({signal:abort.signal}),/aborted/)
  assert.equal(f.gets.length,0);assert.equal(f.decodes.length,0)
})

test('owner abort during stream acknowledges partial bytes and cancels the reader once',async()=>{
  const pending=deferred(),started=deferred(),abort=new AbortController();let reads=0,cancels=0
  const f=fixture({fetchImpl:url=>({url,status:200,ok:true,redirected:false,headers:new Headers({'content-type':'image/png'}),
    body:{getReader:()=>({read(){reads++;if(reads===1)return Promise.resolve({done:false,value:new Uint8Array(10)});started.resolve();return pending.promise},
      cancel(){cancels++},releaseLock(){}})}})})
  const loaded=f.load({signal:abort.signal});await started.promise;abort.abort()
  await assert.rejects(loaded,error=>/aborted/.test(error.message)&&error.observedBytes===10&&error.observedBytesComplete===false)
  pending.resolve({done:true});await Promise.resolve()
  assert.equal(cancels,1);assert.equal(f.decodes.length,0)
})

test('late uncooperative read chunks after abort or deadline reconcile actual cumulative bytes without admission',async()=>{
  for(const trigger of ['abort','deadline']) for(const lateSize of [7,4097]) {
    const pending=deferred(),started=deferred(),abort=new AbortController(),observations=[]
    let reads=0,cancels=0
    const f=fixture({deadlineMs:trigger==='deadline'?20:1000,
      fetchImpl:url=>({url,status:200,ok:true,redirected:false,headers:new Headers({'content-type':'image/png'}),
        body:{getReader:()=>({read(){reads++;if(reads===1)return Promise.resolve({done:false,value:new Uint8Array(10)});
          started.resolve();return pending.promise},cancel(){cancels++},releaseLock(){}})}})})
    const loaded=f.load({signal:abort.signal,onLateBytes:total=>observations.push(total)})
    await started.promise;if(trigger==='abort')abort.abort()
    await assert.rejects(loaded,error=>error.observedBytes===10&&error.observedBytesComplete===false
      && (trigger==='abort'?/aborted/:/deadline/).test(error.message))
    assert.deepEqual(observations,[])
    pending.resolve({done:false,value:new Uint8Array(lateSize)})
    await new Promise(resolve=>setImmediate(resolve))
    assert.deepEqual(observations,[10+lateSize])
    assert.equal(reads,2);assert.equal(cancels,1);assert.equal(f.decodes.length,0);assert.equal(f.images.length,0)
    assert.equal(f.events.some(event=>event.type==='load-complete'),false)
    assert.deepEqual(f.events.filter(event=>event.type==='late-bytes-observed').map(event=>event.observedBytes),[10+lateSize])
  }
})

test('late byte callback failures cannot restart reads, decode, or interfere with cancellation',async()=>{
  for(const callback of [()=>{throw Error('subscriber failure')},async()=>{throw Error('async subscriber failure')}]) {
    const pending=deferred(),started=deferred(),abort=new AbortController();let reads=0,cancels=0
    const f=fixture({fetchImpl:url=>({url,status:200,ok:true,redirected:false,headers:new Headers({'content-type':'image/png'}),
      body:{getReader:()=>({read(){reads++;started.resolve();return pending.promise},cancel(){cancels++}})}})})
    const loaded=f.load({signal:abort.signal,onLateBytes:callback});await started.promise;abort.abort()
    await assert.rejects(loaded,error=>error.observedBytes===0&&error.observedBytesComplete===false)
    pending.resolve({done:false,value:new Uint8Array(8)})
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(reads,1);assert.equal(cancels,1);assert.equal(f.decodes.length,0)
    assert.equal(f.events.find(event=>event.type==='late-bytes-observed').observedBytes,8)
  }
})

test('invalid late accounting callback is rejected before source work',async()=>{
  const f=fixture();await assert.rejects(f.load({onLateBytes:1}),/callback-invalid/)
  assert.equal(f.gets.length,0)
})

test('owner abort during an uncooperative decoder rejects promptly and closes its eventual bitmap once',async()=>{
  const decode=deferred(),started=deferred(),abort=new AbortController()
  const f=fixture({decoder:()=>{started.resolve();return decode.promise}})
  const loaded=f.load({signal:abort.signal});await started.promise;abort.abort()
  await assert.rejects(loaded,error=>/aborted/.test(error.message)&&error.observedBytes===f.bytes.length&&error.observedBytesComplete===true)
  const image=f.makeImage();decode.resolve(image)
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(image.closes,1);assert.equal(f.events.some(event=>event.type==='load-complete'),false)
})

test('deadline bounds uncooperative fetch, reader, digest and decoder operations',async()=>{
  for(const phase of ['fetch','reader','digest','decoder']) {
    const pending=deferred()
    const f=fixture({deadlineMs:10,
      fetchImpl:phase==='fetch' ? ()=>pending.promise : phase==='reader' ? url=>({url,status:200,ok:true,redirected:false,
        headers:new Headers({'content-type':'image/png'}),body:{getReader:()=>({read:()=>pending.promise,cancel(){}})}}) : undefined,
      decoder:phase==='decoder' ? ()=>pending.promise : undefined})
    const transport=phase==='digest' ? createWorldViewBoundedRgbTransport({packets:[f.packet],origin:ORIGIN,deadlineMs:10,
      fetchImpl:url=>f.response(url),decodeImageBitmap:()=>f.makeImage(),digest:()=>pending.promise}) : f.transport
    await assert.rejects(transport.load(f.descriptor,{maxBytes:4096}),error=>/deadline/.test(error.message))
    if(phase==='fetch')pending.resolve(f.response(`${ORIGIN}/fixture/tile-0.png`))
    else if(phase==='reader')pending.resolve({done:true})
    else if(phase==='digest')pending.resolve(new ArrayBuffer(32))
    else pending.resolve(f.makeImage())
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(f.images.every(image=>image.closes===1),true)
  }
})

test('diagnostic witnesses are small read-only scalar records and cannot grant permission or break transport',async()=>{
  const f=fixture({onEvent:event=>{assert.equal(Object.isFrozen(event),true);throw Error('subscriber error')}})
  const loaded=await f.load()
  for(const event of f.events) for(const value of Object.values(event)) assert.ok(['string','number','boolean'].includes(typeof value))
  const encoded=f.events.find(event=>event.type==='encoded-sha-verified')
  assert.equal(encoded.encodedSha256,SHA(f.bytes));assert.equal(encoded.encodedByteLength,f.bytes.length)
  assert.deepEqual([encoded.west,encoded.south,encoded.east,encoded.north],[0,0,2,2])
  assert.equal('permissionGrant' in loaded,false)
  loaded.dispose()
})

test('reentrant witness abort after complete decode closes all images and never returns a usable handle',async()=>{
  const abort=new AbortController(),f=fixture({four:true,onEvent:event=>{if(event.type==='load-complete')abort.abort()}})
  await assert.rejects(f.load({signal:abort.signal}),/aborted/)
  assert.deepEqual(f.images.map(image=>image.closes),[1,1,1,1])
})
