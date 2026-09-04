// R4.9 Stage D — bounded Terrarium terrain provider (MIP-owned).
//
// DISPLAY-only: terrain rendered through this module is environmental
// context. It is never evidence, never enters Investigation Context, never
// changes precision_class, never supplies an asserted event altitude, and
// never snaps evidence to the surface. Source-datum heights (NAVD88 for
// US 3DEP/NED coverage) are displayed raw during development under the
// owner-accepted display-only rule (approx. +34.1 m Cleveland offset vs
// WGS84 ellipsoid; GEOID18 N = -34.111 m at 41.4 N, 81.7 W).
//
// Governance:
// - No ion or commercial-provider credentials, ever.
// - Keyless public endpoint only (AWS Open Data registry: Mapzen Terrain
//   Tiles, frozen v1.1, 2017).
// - Coverage is technically bounded: dataset tiles are fetched ONLY when
//   they are fully inside APPROVED_TERRAIN_COVERAGE at levels
//   [TERRAIN_MIN_ZOOM, TERRAIN_MAX_ZOOM]. Root/parent tiles outside the
//   approved boundary are never requested from the dataset; outside
//   coverage the globe honestly remains the reference ellipsoid. Below the
//   approved band the quadtree still needs renderable ancestry to descend
//   through, so levels 0..(MIN-1) are served from memory as all-zero
//   heightmaps — height zero IS the WGS84 reference ellipsoid, the exact
//   surface the engine's own ellipsoid provider renders; no network
//   request and no dataset bytes are involved. Unapproved tiles inside the
//   band (callback returns undefined) and known-absent tiles
//   (getTileDataAvailable === false) render their nearest real ancestor —
//   the ellipsoid below/beside the boundary, real level-15 data beyond the
//   zoom cap. Missing, failed, malformed, over-zoom, or unapproved dataset
//   tiles are never zero-filled or fabricated.
// - Per-tile source provenance is enforced: the bucket exposes
//   x-amz-meta-x-imagery-sources; only approved sources (US federal
//   public-domain: NED/3DEP, SRTM, GMTED2010, ETOPO1; plus NRCan CDEM under
//   the Open Government Licence - Canada 2.0, approved 2026-09-05 after
//   primary-source licence verification) are accepted. Any other or missing
//   source header fails closed.

// ---- Approved coverage and source policy (normative) ----

/** Approved development coverage: Ohio bounding box (Cleveland well inside). */
export const APPROVED_TERRAIN_COVERAGE = Object.freeze({
  id: 'cleveland-ohio-dev-v1',
  west: -85.0,
  south: 38.3,
  east: -80.4,
  north: 42.1,
})

/**
 * Approved zoom band. Tiles at levels 0-7 are larger than the approved
 * boundary and would necessarily contain non-approved territory/sources, so
 * they are never requested. Level 15 is the finest level the frozen dataset
 * serves; deeper requests render the real level-15 parent, never invented
 * detail.
 */
export const TERRAIN_MIN_ZOOM = 8
export const TERRAIN_MAX_ZOOM = 15

/**
 * Sources approved for the development coverage. US federal public-domain
 * sources plus Natural Resources Canada CDEM, approved 2026-09-05 under the
 * Stage D visual-continuity repair after verifying every condition against
 * the primary licence text (Open Government Licence - Canada 2.0,
 * open.canada.ca/en/open-government-licence-canada): worldwide, royalty-free,
 * perpetual use INCLUDING commercial purposes and redistribution; no payment,
 * account, secret, token, or provider agreement required; the required
 * attribution sentence is carried in TERRAIN_DISCLOSURE_TEXT
 * (worldViewMapStack.js). CDEM heights stay source-datum (CGVD28/CGVD2013),
 * display-only, and never evidentiary — identical rules to the US sources.
 */
export const APPROVED_TERRAIN_SOURCE_PREFIXES = Object.freeze([
  'ned/', // USGS 3DEP / NED (1 arc-second and 1/9 arc-second products)
  'ned13/', // USGS 3DEP / NED 1/3 arc-second (observed on live Ohio tiles)
  'ned_topobathy/', // USGS NED Topobathy
  'srtm/', // NASA/NGA SRTM via USGS
  'gmted/', // USGS GMTED2010
  'etopo1/', // NOAA ETOPO1 bathymetry
  'nrcan_cdem/', // NRCan CDEM, Open Government Licence - Canada 2.0 (verified 2026-09-05)
])

export const TERRARIUM_TILE_BASE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
export const TERRARIUM_TILE_SIZE = 256
export const TERRAIN_HEIGHTMAP_SIZE = 65

/** Required credit text shown on the renderer's credit surface. */
export const TERRAIN_CREDIT_TEXT =
  'Terrain: USGS 3DEP/SRTM/GMTED2010 · NOAA ETOPO1 · NRCan CDEM · via Mapzen/AWS Terrain Tiles'

// UI-facing disclosure strings live in worldViewMapStack.js
// (TERRAIN_DISCLOSURE_TEXT / TERRAIN_UNAVAILABLE_TEXT) so renderer-neutral
// surfaces can show them without importing this vendor-specific module.

// ---- Pure geodesy / decode helpers (GPU-free, unit-tested) ----

/** Terrarium decode: (R × 256 + G + B ÷ 256) − 32768 -> meters (source datum). */
export function decodeTerrariumPixel(r, g, b) {
  return r * 256 + g + b / 256 - 32768
}

/** Latitude (degrees) of a fractional slippy tile row (0 = north edge of the world). */
export function slippyFractionToLatitudeDegrees(ty) {
  const v = Math.PI * (1 - 2 * ty)
  return (Math.atan(Math.sinh(v)) * 180) / Math.PI
}

/**
 * Geographic rectangle (degrees) of slippy tile x/y at the given level,
 * assuming the 1x1 level-zero web-mercator tile tree. Row 0 is the northern
 * edge, matching the Terrarium PNG's first pixel row and the heightmap
 * row-major north-to-south convention.
 */
export function tileRectangleDegrees(x, y, level) {
  const n = 2 ** level
  const west = (x / n) * 360 - 180
  const east = ((x + 1) / n) * 360 - 180
  const north = slippyFractionToLatitudeDegrees(y / n)
  const south = slippyFractionToLatitudeDegrees((y + 1) / n)
  return { west, south, east, north }
}

/**
 * Slippy tile x/y containing (lonDeg, latDeg) at the given level — the exact
 * inverse of tileRectangleDegrees' containment rule. Latitude clamps to the
 * web-mercator limit. Used to consult the bounded availability policy for an
 * arbitrary position without issuing a request.
 */
export function tileXYForLongitudeLatitudeDegrees(lonDeg, latDeg, level) {
  const n = 2 ** level
  const x = Math.min(n - 1, Math.max(0, Math.floor(((lonDeg + 180) / 360) * n)))
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, latDeg))
  const latRad = (clampedLat * Math.PI) / 180
  const y = Math.min(
    n - 1,
    Math.max(0, Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)),
  )
  return { x, y }
}

/** True only when the tile is FULLY inside the approved coverage boundary. */
export function tileFullyInsideCoverage(rect, coverage = APPROVED_TERRAIN_COVERAGE) {
  return (
    rect.west >= coverage.west &&
    rect.east <= coverage.east &&
    rect.south >= coverage.south &&
    rect.north <= coverage.north
  )
}

/**
 * Coverage/level approval for a tile request. An unapproved tile must be
 * answered with a synchronous undefined (no network request), so the globe
 * renders its real parent tile or the reference ellipsoid — never fabricated
 * terrain.
 */
export function tileApproval(
  x,
  y,
  level,
  coverage = APPROVED_TERRAIN_COVERAGE,
  minLevel = TERRAIN_MIN_ZOOM,
  maxLevel = TERRAIN_MAX_ZOOM,
) {
  if (!Number.isInteger(level) || level < 0) return { approved: false, reason: 'invalid-level' }
  if (level < minLevel) return { approved: false, reason: 'below-min-level' }
  if (level > maxLevel) return { approved: false, reason: 'above-max-level' }
  const rect = tileRectangleDegrees(x, y, level)
  if (!tileFullyInsideCoverage(rect, coverage)) {
    return { approved: false, reason: 'outside-coverage', rect }
  }
  return { approved: true, rect }
}

/**
 * Enforce the approved-source policy from the bucket's per-tile provenance
 * header. Missing or empty headers fail closed.
 */
export function approvedSourcesFromHeader(header) {
  if (typeof header !== 'string' || header.trim() === '') {
    return { approved: false, sources: [], reason: 'missing-source-header' }
  }
  const sources = header
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const rejected = sources.filter(
    (s) => !APPROVED_TERRAIN_SOURCE_PREFIXES.some((p) => s.startsWith(p)),
  )
  if (rejected.length > 0) {
    return { approved: false, sources, rejected, reason: 'unapproved-source' }
  }
  return { approved: true, sources }
}

/**
 * Bilinear resample of a square row-major height grid (row 0 = north) from
 * srcSize x srcSize to outSize x outSize. Grid edges map exactly onto source
 * edges so tile borders stay consistent with neighbors.
 */
export function resampleHeightmapBilinear(heights, srcSize, outSize) {
  const out = new Float32Array(outSize * outSize)
  const scale = (srcSize - 1) / (outSize - 1)
  for (let j = 0; j < outSize; j += 1) {
    const sy = j * scale
    const y0 = Math.min(srcSize - 1, Math.floor(sy))
    const y1 = Math.min(srcSize - 1, y0 + 1)
    const fy = sy - y0
    for (let i = 0; i < outSize; i += 1) {
      const sx = i * scale
      const x0 = Math.min(srcSize - 1, Math.floor(sx))
      const x1 = Math.min(srcSize - 1, x0 + 1)
      const fx = sx - x0
      const h00 = heights[y0 * srcSize + x0]
      const h10 = heights[y0 * srcSize + x1]
      const h01 = heights[y1 * srcSize + x0]
      const h11 = heights[y1 * srcSize + x1]
      out[j * outSize + i] =
        h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy
    }
  }
  return out
}

export function terrariumTileUrl(baseUrl, z, x, y) {
  return `${baseUrl}/${z}/${x}/${y}.png`
}

// ---- Browser PNG decode (default; injectable for tests) ----

async function defaultDecodeImage(arrayBuffer) {
  // The tile bytes arrive via CORS-checked fetch, so the decoded image is
  // origin-clean and pixel reads are permitted.
  const blob = new Blob([arrayBuffer], { type: 'image/png' })
  const bitmap = await createImageBitmap(blob)
  const width = bitmap.width
  const height = bitmap.height
  let canvas
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height)
  } else {
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return ctx.getImageData(0, 0, width, height)
}

/**
 * Fetch + decode one Terrarium tile into a 256x256 Float32 height grid.
 * Throws on any failure (HTTP error, non-PNG, malformed decode, unapproved
 * or missing source header). Callers turn failures into honest parent-tile
 * rendering by rejecting the provider callback — never by inventing data.
 */
export async function fetchTerrariumTileHeights({
  z,
  x,
  y,
  baseUrl = TERRARIUM_TILE_BASE_URL,
  fetchImpl,
  decodeImageImpl = defaultDecodeImage,
}) {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis)
  if (!doFetch) throw new Error('no fetch implementation available')
  const url = terrariumTileUrl(baseUrl, z, x, y)
  const res = await doFetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res || !res.ok) {
    throw new Error(`terrain tile fetch failed (HTTP ${res?.status ?? 'no response'})`)
  }
  const contentType = res.headers?.get?.('content-type') ?? ''
  if (contentType && !contentType.includes('image/png')) {
    throw new Error(`terrain tile is not a PNG (${contentType})`)
  }
  const sourceApproval = approvedSourcesFromHeader(
    res.headers?.get?.('x-amz-meta-x-imagery-sources'),
  )
  if (!sourceApproval.approved) {
    const err = new Error(`terrain tile sources not approved (${sourceApproval.reason})`)
    err.code = 'unapproved-source'
    err.sources = sourceApproval.sources
    err.rejected = sourceApproval.rejected ?? []
    throw err
  }
  const buffer = await res.arrayBuffer()
  const image = await decodeImageImpl(buffer)
  if (
    !image ||
    image.width !== TERRARIUM_TILE_SIZE ||
    image.height !== TERRARIUM_TILE_SIZE ||
    !image.data ||
    image.data.length < TERRARIUM_TILE_SIZE * TERRARIUM_TILE_SIZE * 4
  ) {
    throw new Error('terrain tile decode malformed')
  }
  const heights = new Float32Array(TERRARIUM_TILE_SIZE * TERRARIUM_TILE_SIZE)
  const { data } = image
  for (let i = 0, o = 0; i < heights.length; i += 1, o += 4) {
    heights[i] = decodeTerrariumPixel(data[o], data[o + 1], data[o + 2])
  }
  return { heights, sources: sourceApproval.sources }
}

// ---- Provider factory ----

/**
 * Build the bounded terrain provider. The injected renderer library object
 * must supply CustomHeightmapTerrainProvider and WebMercatorTilingScheme.
 *
 * Callback contract (matches the engine's documented behavior):
 * - Float32Array (levels below the approved band) -> the reference
 *   ellipsoid itself, generated in memory so the quadtree has renderable
 *   ancestry to descend through; no request is made.
 * - synchronous undefined  -> the globe renders the parent tile (or the
 *   reference ellipsoid when no ancestor has data). Used for in-band tiles
 *   outside the approved coverage boundary; no request is made.
 * - Promise<Float32Array>  -> approved tile data (65x65, row-major).
 * - rejected promise       -> tile request failed; the engine upsamples the
 *   real parent tile. Used for fetch/decode/source-policy failures.
 *
 * Availability contract: getTileDataAvailable is overridden to publish the
 * bounded policy as definitive true/false answers (never undefined), which
 * the quadtree's refinement gate requires in order to descend past tiles
 * that have not loaded data.
 *
 * Status reporting: onStatusChange receives
 * { status: 'idle' | 'active' | 'unavailable', fetchAttempts, fetchSuccesses,
 *   fetchFailures, sourceRejections } snapshots. 'unavailable' fires once,
 * when the approved source appears unreachable (genuine fetch/decode
 * failures reach maxFailuresBeforeUnavailable with no successes).
 * Source-policy rejections fail closed per tile but never count toward
 * that threshold — they are the boundary working as designed. On
 * 'unavailable' the adapter degrades the globe to the reference ellipsoid
 * and reports it honestly.
 */
export function createTerrariumTerrainProvider(Cesium, options = {}) {
  const {
    fetchImpl,
    decodeImageImpl,
    onStatusChange,
    credit = TERRAIN_CREDIT_TEXT,
    coverage = APPROVED_TERRAIN_COVERAGE,
    minLevel = TERRAIN_MIN_ZOOM,
    maxLevel = TERRAIN_MAX_ZOOM,
    baseUrl = TERRARIUM_TILE_BASE_URL,
    maxFailuresBeforeUnavailable = 6,
  } = options

  let status = 'idle'
  let unavailableNotified = false
  // Genuine fetch/decode failures only. Source-policy rejections are counted
  // in counters.sourceRejections but excluded here: they are the boundary
  // working as designed, not evidence that the approved source is down.
  let genuineFailures = 0
  const counters = {
    fetchAttempts: 0,
    fetchSuccesses: 0,
    fetchFailures: 0,
    sourceRejections: 0,
  }

  const snapshot = () => ({ status, ...counters })

  function notify() {
    try {
      onStatusChange?.(snapshot())
    } catch {
      /* status reporting must never break rendering */
    }
  }

  function noteFailure(err) {
    counters.fetchFailures += 1
    if (err?.code === 'unapproved-source') {
      counters.sourceRejections += 1
      // Fail-closed policy rejection (e.g. an unapproved national dataset
      // mixed into a boundary tile): the affected tile honestly upsamples
      // its real parent. Never count it toward source unavailability —
      // observed live, the first tiles on the Cleveland descent are exactly
      // these boundary tiles, and tearing terrain down on them buried the
      // approved core.
      return
    }
    genuineFailures += 1
    if (
      !unavailableNotified &&
      genuineFailures >= maxFailuresBeforeUnavailable &&
      counters.fetchSuccesses === 0
    ) {
      unavailableNotified = true
      status = 'unavailable'
      notify()
    }
  }

  function callback(x, y, level) {
    // Below the approved band the quadtree still needs renderable ancestry
    // to descend through: the engine can only refine a tile that has loaded
    // terrain data or a definitive availability answer. Serve the reference
    // ellipsoid itself — an all-zero heightmap built in memory, identical to
    // the surface the engine's ellipsoid provider renders. No network
    // request, no dataset bytes, no fabricated terrain. A fresh buffer per
    // call keeps ownership unambiguous across worker handoffs.
    if (Number.isInteger(level) && level >= 0 && level < minLevel) {
      return new Float32Array(TERRAIN_HEIGHTMAP_SIZE * TERRAIN_HEIGHTMAP_SIZE)
    }
    const approval = tileApproval(x, y, level, coverage, minLevel, maxLevel)
    if (!approval.approved) {
      // Synchronous undefined: render the real parent tile / ellipsoid.
      // No request leaves the approved coverage or level band.
      return undefined
    }
    counters.fetchAttempts += 1
    const promise = fetchTerrariumTileHeights({
      z: level,
      x,
      y,
      baseUrl,
      fetchImpl,
      decodeImageImpl,
    }).then(({ heights }) => {
      counters.fetchSuccesses += 1
      if (status === 'idle') {
        status = 'active'
        notify()
      }
      return resampleHeightmapBilinear(heights, TERRARIUM_TILE_SIZE, TERRAIN_HEIGHTMAP_SIZE)
    })
    promise.catch((err) => noteFailure(err))
    return promise
  }

  const provider = new Cesium.CustomHeightmapTerrainProvider({
    callback,
    width: TERRAIN_HEIGHTMAP_SIZE,
    height: TERRAIN_HEIGHTMAP_SIZE,
    // 1x1 level-zero tree matches the slippy z/x/y addressing exactly, so
    // engine level === tile zoom and x/y map one-to-one.
    tilingScheme: new Cesium.WebMercatorTilingScheme({
      numberOfLevelZeroTilesX: 1,
      numberOfLevelZeroTilesY: 1,
    }),
    credit,
  })

  // The stock provider answers getTileDataAvailable with undefined
  // ("unknown"). The quadtree's refinement gate treats an unknown answer
  // for a dataless tile as "cannot safely refine", which stalls traversal
  // at the root forever: no tile is ever requested and the surface never
  // renders. Publish the exact bounded policy instead: true where this
  // provider serves data (below-band ellipsoid ancestry and approved
  // in-coverage tiles), false everywhere else. Tiles answered false are
  // marked absent by the engine and upsample their nearest real ancestor —
  // the ellipsoid below/beside the boundary, real level-15 data beyond the
  // zoom cap — so every pixel still shows real geometry, never fabrication.
  provider.getTileDataAvailable = (x, y, level) => {
    if (!Number.isInteger(level) || level < 0) return false
    if (level < minLevel) return true
    if (level > maxLevel) return false
    return tileFullyInsideCoverage(tileRectangleDegrees(x, y, level), coverage)
  }

  return {
    provider,
    getStatus: snapshot,
    isUnavailable: () => status === 'unavailable',
  }
}
