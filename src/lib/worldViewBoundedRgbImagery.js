// Pure, injected transport for already-governed RGB display derivatives. A
// packet pins bytes and display geometry; it never grants source permission.
// The caller must reserve the conservative estimate before calling load.
const CONTRACT = 'mip-bounded-rgb-imagery-v1'
const MAX_BYTES = 16 * 1024 * 1024
const loadedRecords = new WeakMap()
const bitmapOwners = new WeakMap()
const closedBitmaps = new WeakSet()
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const integer = value => Number.isSafeInteger(value) && value > 0
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 128
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const rectangle = value => Array.isArray(value) && value.length === 4
  && value.every(Number.isFinite) && value[0] >= -180 && value[2] <= 180
  && value[1] >= -90 && value[3] <= 90 && value[0] < value[2] && value[1] < value[3]
const route = value => typeof value === 'string' && value.length <= 512
  && /^\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('//')
  && !value.split('/').some(part => part === '.' || part === '..')
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const captureOf = value => {
  if (value?.precision !== 'day' || !date(value.start)
    || (value.end != null && (!date(value.end) || value.end < value.start))) throw Error('rgb-capture-invalid')
  return {precision:'day', start:value.start, end:value.end ?? null}
}
const fail = reason => { throw Error(reason) }

function packetOf(input) {
  if (!text(input?.sourceId) || !hash(input.registeredAssetSha256)
    || !hash(input.runtimeProvenanceSha256) || !hash(input.sourceMetadataXmlSha256)
    || input.permissionGrant !== false) fail('rgb-packet-identity-invalid')
  if (input.coverage?.crs !== 'EPSG:4326' || !rectangle(input.coverage.bounds)) fail('rgb-packet-coverage-invalid')
  if (!Array.isArray(input.tiles) || input.tiles.length < 1 || input.tiles.length > 4) fail('rgb-tile-count-invalid')
  const bounds = [...input.coverage.bounds]
  const capture = captureOf(input.capture)
  const keys = new Set(), routes = new Set()
  const tiles = input.tiles.map(tile => {
    const key = tile?.key ?? tile?.name
    if (!text(key) || keys.has(key) || !route(tile.route) || routes.has(tile.route)
      || !hash(tile.sha256) || !integer(tile.byteLength) || tile.byteLength > MAX_BYTES
      || !integer(tile.width) || tile.width > 512 || !integer(tile.height) || tile.height > 512
      || tile.crs !== 'EPSG:4326' || !rectangle(tile.bounds)
      || tile.bounds[0] < bounds[0] || tile.bounds[1] < bounds[1]
      || tile.bounds[2] > bounds[2] || tile.bounds[3] > bounds[3]
      || (tile.rgbSha256 != null && !hash(tile.rgbSha256))) fail('rgb-tile-pin-invalid')
    keys.add(key); routes.add(tile.route)
    return {key, route:tile.route, sha256:tile.sha256, byteLength:tile.byteLength,
      width:tile.width, height:tile.height, bounds:[...tile.bounds], crs:'EPSG:4326', rgbSha256:tile.rgbSha256 ?? null}
  })
  // Exact coordinate cells avoid area-rounding tolerances, overlapping tiles,
  // missing strips, and accidental expansion to a similar outer rectangle.
  const xs = [...new Set([bounds[0], bounds[2], ...tiles.flatMap(tile => [tile.bounds[0], tile.bounds[2]])])].sort((a,b) => a-b)
  const ys = [...new Set([bounds[1], bounds[3], ...tiles.flatMap(tile => [tile.bounds[1], tile.bounds[3]])])].sort((a,b) => a-b)
  for (let x=1; x<xs.length; x++) for (let y=1; y<ys.length; y++) {
    const count = tiles.filter(tile => tile.bounds[0] <= xs[x-1] && tile.bounds[2] >= xs[x]
      && tile.bounds[1] <= ys[y-1] && tile.bounds[3] >= ys[y]).length
    if (count !== 1) fail('rgb-tile-partition-invalid')
  }
  const encodedBytes = tiles.reduce((sum,tile) => sum + tile.byteLength, 0)
  const decodedByteLength = tiles.reduce((sum,tile) => sum + tile.width * tile.height * 4, 0)
  // Include the largest tile's encoded buffer and Blob staging as well as all
  // retained RGBA. No process RSS, GPU physical memory, or ZIP verification claim.
  const minimumEstimate = decodedByteLength + Math.max(encodedBytes, 2 * Math.max(...tiles.map(tile => tile.byteLength)))
  if (!integer(input.localResourceEstimate) || input.localResourceEstimate < minimumEstimate
    || input.localResourceEstimate > MAX_BYTES) fail('rgb-resource-estimate-invalid')
  return freeze({sourceId:input.sourceId, registeredAssetSha256:input.registeredAssetSha256,
    runtimeProvenanceSha256:input.runtimeProvenanceSha256, sourceMetadataXmlSha256:input.sourceMetadataXmlSha256,
    capture, coverage:{crs:'EPSG:4326', bounds}, tiles, encodedBytes, decodedByteLength,
    localResourceEstimate:input.localResourceEstimate, permissionGrant:false})
}

function matchesDescriptor(packet, descriptor) {
  try {
    return descriptor?.kind === 'imagery' && descriptor.sourceId === packet.sourceId
      && descriptor.metadata?.assetSha256 === packet.registeredAssetSha256
      && descriptor.level === 0 && descriptor.requestedLevel === 0 && descriptor.ancestry === 'direct'
      && same(descriptor.bounds, packet.coverage.bounds)
      && descriptor.metadata?.coverage?.crs === 'EPSG:4326'
      && same(descriptor.metadata.coverage.bounds, packet.coverage.bounds)
      && same(captureOf(descriptor.metadata.capture), packet.capture)
  } catch { return false }
}

/** Conservative source-artifact plus decoded-RGBA reservation, never billing. */
export function estimateWorldViewBoundedRgbBytes(packet) {
  return packetOf(packet).localResourceEstimate
}

/** A copied or fabricated handle cannot substitute self-reported hash fields. */
export function validateWorldViewBoundedRgbLoaded(loaded, descriptor) {
  const record = loadedRecords.get(loaded)
  return !!record && !record.disposed && !record.closed && matchesDescriptor(record.packet, descriptor)
    && record.images.every((image,index) => image.width === record.packet.tiles[index].width
      && image.height === record.packet.tiles[index].height && !closedBitmaps.has(image))
}

function closeBitmap(image) {
  if (!image || (typeof image !== 'object' && typeof image !== 'function') || closedBitmaps.has(image)) return
  closedBitmaps.add(image)
  try { image.close?.() } catch { /* Once-only resource cleanup remains terminal. */ }
}

function checkPng(bytes, tile) {
  const signature = [137,80,78,71,13,10,26,10]
  if (bytes.length < 45 || !signature.every((value,index) => bytes[index] === value)) fail('rgb-png-signature-invalid')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunkName = offset => String.fromCharCode(...bytes.subarray(offset+4, offset+8))
  if (view.getUint32(8) !== 13 || chunkName(8) !== 'IHDR'
    || view.getUint32(16) !== tile.width || view.getUint32(20) !== tile.height
    || bytes[24] !== 8 || bytes[25] !== 2 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) fail('rgb-png-header-invalid')
  let offset = 8, idat = false, endedIdat = false, end = false
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('rgb-png-chunk-invalid')
    const length = view.getUint32(offset), name = chunkName(offset)
    if (offset + length + 12 > bytes.length || !/^[A-Za-z]{4}$/.test(name)) fail('rgb-png-chunk-invalid')
    if (offset !== 8 && name === 'IHDR') fail('rgb-png-header-invalid')
    if (name === 'tRNS' || name === 'acTL' || name === 'fcTL' || name === 'fdAT') fail('rgb-png-alpha-or-animation-invalid')
    if (name === 'IDAT') {
      if (endedIdat) fail('rgb-png-chunk-invalid')
      idat = true
    } else if (idat) endedIdat = true
    // Only the standard critical chunks are meaningful for a strict RGB PNG.
    if (name[0] === name[0].toUpperCase() && !['IHDR','PLTE','IDAT','IEND'].includes(name)) fail('rgb-png-chunk-invalid')
    offset += length + 12
    if (name === 'IEND') {
      if (length !== 0 || !idat || offset !== bytes.length) fail('rgb-png-chunk-invalid')
      end = true; break
    }
  }
  if (!end) fail('rgb-png-chunk-invalid')
}

export function createWorldViewBoundedRgbTransport({packets=[], origin,
  fetchImpl=globalThis.fetch, decodeImageBitmap=globalThis.createImageBitmap,
  digest=globalThis.crypto?.subtle?.digest.bind(globalThis.crypto.subtle), deadlineMs=15000, onEvent=()=>{}}={}) {
  if (typeof fetchImpl !== 'function' || typeof decodeImageBitmap !== 'function' || typeof digest !== 'function'
    || !integer(deadlineMs) || deadlineMs > 15000 || typeof onEvent !== 'function') fail('rgb-transport-options-invalid')
  let originUrl
  try { originUrl = new URL(origin) } catch { fail('rgb-origin-invalid') }
  if (!['http:','https:'].includes(originUrl.protocol) || originUrl.origin !== origin
    || originUrl.username || originUrl.password) fail('rgb-origin-invalid')
  if (!Array.isArray(packets) || packets.length > 32) fail('rgb-packet-count-invalid')
  const registry = new Map()
  for (const value of packets) {
    const packet = packetOf(value), key = `${packet.sourceId}:${packet.registeredAssetSha256}`
    if (registry.has(key)) fail('rgb-packet-duplicate')
    for (const tile of packet.tiles) {
      const url = new URL(tile.route, origin)
      if (url.origin !== origin || url.pathname !== tile.route || url.search || url.hash) fail('rgb-route-invalid')
    }
    registry.set(key, packet)
  }
  const find = descriptor => {
    const packet = registry.get(`${descriptor?.sourceId}:${descriptor?.metadata?.assetSha256}`)
    if (!packet || !matchesDescriptor(packet, descriptor)) fail('rgb-descriptor-pin-mismatch')
    return packet
  }
  const emit = (type, packet, extra={}) => {
    const event = Object.freeze({type, sourceId:packet.sourceId, ...extra})
    try { onEvent(event) } catch { /* Diagnostics cannot change byte/resource authority. */ }
  }
  return Object.freeze({
    estimateBytes(descriptor) { try { return find(descriptor).localResourceEstimate } catch { return null } },
    async load(descriptor, {signal, maxBytes, onLateBytes=()=>{}}={}) {
      let observedBytes = 0, packet, timer, reader = null, responseBody = null, stopped = false, readPending = false
      const images = [], abort = new AbortController()
      const canceled = new WeakSet()
      const cancelStream = value => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || canceled.has(value)) return
        canceled.add(value)
        try { Promise.resolve(value.cancel?.()).catch(() => {}) } catch { /* Already canceled. */ }
      }
      const errorOf = reason => Object.assign(Error(reason), {observedBytes, observedBytesComplete:!readPending})
      const observeLateRead = ownedReader => {
        cancelStream(ownedReader)
        // This callback belongs to the existing reservation owner. It reports
        // actual read bytes; it cannot authorize another read or decode.
        try { Promise.resolve(onLateBytes(observedBytes)).catch(() => {}) } catch { /* Accounting subscriber failure. */ }
        emit('late-bytes-observed', packet, {observedBytes, observedBytesComplete:!readPending})
      }
      try {
        packet = find(descriptor)
        if (!integer(maxBytes) || maxBytes < packet.localResourceEstimate || maxBytes > MAX_BYTES) throw errorOf('rgb-reservation-bound-invalid')
        if (typeof onLateBytes !== 'function') throw errorOf('rgb-late-byte-callback-invalid')
        if (signal?.aborted) throw errorOf('rgb-owner-aborted')
        if (signal != null && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) throw errorOf('rgb-abort-signal-invalid')
        let rejectAbort
        const aborted = new Promise((resolve,reject) => { rejectAbort = reject })
        // The race below installs its rejection handler before any work begins.
        aborted.catch(() => {})
        const ownerAbort = () => abort.abort('rgb-owner-aborted')
        const stop = () => {
          stopped = true
          rejectAbort(errorOf(typeof abort.signal.reason === 'string' ? abort.signal.reason : 'rgb-load-aborted'))
          cancelStream(reader ?? responseBody)
        }
        abort.signal.addEventListener('abort', stop, {once:true})
        signal?.addEventListener('abort', ownerAbort, {once:true})
        timer = setTimeout(() => abort.abort('rgb-deadline-exceeded'), deadlineMs)
        const checkpoint = () => { if (stopped || signal?.aborted) throw errorOf('rgb-owner-aborted') }
        const step = async (operation, late) => {
          checkpoint()
          const work = Promise.resolve().then(() => { checkpoint(); return operation() }).then(value => {
            if (stopped) { late?.(value); throw errorOf('rgb-load-aborted') }
            return value
          })
          return Promise.race([work, aborted])
        }
        try {
          emit('load-start', packet, {reservedBytes:packet.localResourceEstimate, tileCount:packet.tiles.length})
          for (const tile of packet.tiles) {
            checkpoint()
            const url = new URL(tile.route, origin).href
            emit('fetch-start', packet, {tileKey:tile.key, encodedByteLength:tile.byteLength})
            const response = await step(() => fetchImpl(url, {method:'GET', signal:abort.signal, redirect:'error',
              mode:'same-origin', credentials:'same-origin', cache:'no-store', headers:{Accept:'image/png'}}), late => {
              cancelStream(late?.body)
            })
            responseBody = response?.body
            if (!response || response.status !== 200 || response.ok !== true || response.redirected !== false
              || response.url !== url || ['opaque','opaqueredirect','error'].includes(response.type)) throw errorOf('rgb-response-route-invalid')
            const contentType = response.headers?.get?.('content-type')
            if (typeof contentType !== 'string' || contentType.split(';')[0].trim().toLowerCase() !== 'image/png') throw errorOf('rgb-response-content-type-invalid')
            const contentLength = response.headers?.get?.('content-length')
            if (contentLength != null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== tile.byteLength)) throw errorOf('rgb-response-length-invalid')
            if (typeof response.body?.getReader !== 'function') throw errorOf('rgb-stream-unavailable')
            reader = response.body.getReader()
            checkpoint()
            const bytes = new Uint8Array(tile.byteLength)
            let tileBytes = 0
            for (;;) {
              const ownedReader = reader
              const chunk = await step(() => {
                readPending = true
                let request
                try { request = ownedReader.read() } catch (error) { readPending = false; throw error }
                return Promise.resolve(request).then(value => {
                  readPending = false
                  // Count the body chunk when read settles, including a chunk
                  // delivered after an early abort/deadline rejection. Never
                  // allocate/copy an excess chunk merely to account for it.
                  if (value?.value instanceof Uint8Array) observedBytes += value.value.byteLength
                  return value
                }, error => { readPending = false; throw error })
              }, () => observeLateRead(ownedReader))
              checkpoint()
              if (chunk.done) break
              if (!(chunk.value instanceof Uint8Array)) throw errorOf('rgb-stream-chunk-invalid')
              if (!Number.isSafeInteger(observedBytes) || observedBytes > packet.encodedBytes || observedBytes > maxBytes
                || tileBytes + chunk.value.byteLength > tile.byteLength) throw errorOf('rgb-stream-byte-bound-exceeded')
              bytes.set(chunk.value, tileBytes); tileBytes += chunk.value.byteLength
            }
            try { reader.releaseLock?.() } catch { /* Stream is already complete. */ }
            reader = null; responseBody = null
            if (tileBytes !== tile.byteLength) throw errorOf('rgb-response-length-invalid')
            checkPng(bytes, tile)
            const digestBytes = new Uint8Array(await step(() => digest('SHA-256', bytes)))
            const encodedSha256 = [...digestBytes].map(value => value.toString(16).padStart(2,'0')).join('')
            if (encodedSha256 !== tile.sha256) throw errorOf('rgb-encoded-hash-mismatch')
            const rectangleScalars = {west:tile.bounds[0], south:tile.bounds[1], east:tile.bounds[2], north:tile.bounds[3]}
            emit('encoded-sha-verified', packet, {tileKey:tile.key, encodedSha256, encodedByteLength:tile.byteLength, observedBytes, ...rectangleScalars})
            // Cesium's public Texture upload requests flipY through WebGL.
            // ImageBitmap ignores UNPACK_FLIP_Y_WEBGL, so preflip at decode to
            // preserve the received north-up tile in the geographic rectangle.
            const image = await step(() => decodeImageBitmap(new Blob([bytes], {type:'image/png'}),
              {imageOrientation:'flipY', premultiplyAlpha:'none', colorSpaceConversion:'none'}), late => {
              if (!bitmapOwners.has(late)) closeBitmap(late)
            })
            if (!image || typeof image.close !== 'function' || bitmapOwners.has(image) || closedBitmaps.has(image)
              || image.width !== tile.width || image.height !== tile.height) {
              // An injected decoder returning a bitmap owned by another load
              // cannot close that load's live native lease on this failure.
              if (!bitmapOwners.has(image)) closeBitmap(image)
              throw errorOf('rgb-decoded-dimensions-invalid')
            }
            bitmapOwners.set(image, packet); images.push(image)
            emit('decode-verified', packet, {tileKey:tile.key, width:tile.width, height:tile.height, decodedByteLength:tile.width*tile.height*4, ...rectangleScalars})
          }
          checkpoint()
          if (observedBytes !== packet.encodedBytes) throw errorOf('rgb-response-length-invalid')
          const record = {packet, images, leases:0, disposed:false, closed:false}
          const resourceState = () => Object.freeze({leaseCount:record.leases, closedCount:record.closed ? images.length : 0,
            retainedRgbaBytes:record.closed ? 0 : packet.decodedByteLength, disposed:record.disposed})
          const closeWhenUnused = () => {
            if (!record.disposed || record.leases !== 0 || record.closed) return
            record.closed = true; images.forEach(closeBitmap)
            emit('decoded-images-closed', packet, {closedCount:images.length, retainedRgbaBytes:0})
          }
          const loaded = Object.freeze({contract:CONTRACT, sourceId:packet.sourceId, assetSha256:packet.registeredAssetSha256,
            runtimeProvenanceSha256:packet.runtimeProvenanceSha256, sourceMetadataXmlSha256:packet.sourceMetadataXmlSha256,
            capture:packet.capture, coverage:packet.coverage, bounds:packet.coverage.bounds, level:0, requestedLevel:0, ancestry:'direct',
            observedBytes, observedBytesComplete:true, decodedByteLength:packet.decodedByteLength,
            nativeTextureOrientation:'cesium-imagebitmap-preflip-y-v1',
            tiles:Object.freeze(packet.tiles.map((tile,index) => Object.freeze({key:tile.key, encodedSha256:tile.sha256,
              encodedByteLength:tile.byteLength, width:tile.width, height:tile.height, bounds:tile.bounds, crs:tile.crs, imageBitmap:images[index]}))),
            getResourceState:resourceState,
            retainDecodedImages() {
              if (record.disposed || record.closed) throw Error('rgb-loaded-disposed')
              record.leases++
              let released = false
              return () => { if (released) return; released = true; record.leases--; closeWhenUnused() }
            },
            dispose() { if (record.disposed) return; record.disposed = true; closeWhenUnused() },
          })
          loadedRecords.set(loaded, record)
          emit('load-complete', packet, {observedBytes, decodedByteLength:packet.decodedByteLength, tileCount:images.length})
          // A reentrant diagnostics callback may invalidate the request.
          if (stopped || signal?.aborted) { loaded.dispose(); throw errorOf('rgb-owner-aborted') }
          return loaded
        } finally {
          signal?.removeEventListener('abort', ownerAbort)
          abort.signal.removeEventListener('abort', stop)
        }
      } catch (error) {
        stopped = true
        abort.abort('rgb-load-failed')
        cancelStream(reader ?? responseBody)
        images.forEach(closeBitmap)
        // Injected operations may reject a frozen Error. Always own the thrown
        // receipt so partial observed bytes remain available to accounting.
        const result = Object.assign(Error(error instanceof Error ? error.message : 'rgb-load-failed'),
          {observedBytes, observedBytesComplete:!readPending})
        if (packet) emit('load-failed', packet, {observedBytes, observedBytesComplete:!readPending, decodedByteLength:0})
        throw result
      } finally { clearTimeout(timer) }
    },
  })
}
