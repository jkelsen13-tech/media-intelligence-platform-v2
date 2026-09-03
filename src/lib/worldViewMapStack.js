// R4 World View launch spine — MapLibre + deck.gl 2D/2.5D map stack.
//
// Pattern pin: commit 880a672 (2026-08-26). TAKE pattern-level only:
// cinematic pan-zoom/camera; layered rendering + visible attribution;
// render-governance / map-stack fallback. Reimplemented with MapLibre +
// deck.gl 2D/2.5D. Do not vendor a 3D-tile globe, paid imagery keys, or
// live OSINT overlays.
//
// Zoom / pitch never change precision_class or invent denser geometry than
// the projection row. n=1 stays one city Point.

export const WORLD_VIEW_RENDERER = 'maplibre-deck.gl'

export const MAP_STACKS = Object.freeze([
  {
    id: 'ellipsoid-globe',
    label: 'Ellipsoid globe',
    kind: 'ellipsoid-globe',
    attribution: '© OpenStreetMap contributors © OpenFreeMap | OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  },
  {
    id: 'openfreemap-positron',
    label: 'OpenFreeMap Positron',
    kind: 'vector',
    attribution: '© OpenStreetMap contributors © OpenFreeMap',
  },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    kind: 'raster',
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'atlas-fallback',
    label: 'Atlas fallback',
    kind: 'svg-atlas',
    attribution: 'Natural Earth via world-atlas 110m',
  },
])

export const DEFAULT_MAP_STACK_ID = 'ellipsoid-globe'
export const FALLBACK_MAP_STACK_ID = 'atlas-fallback'

export const ELLIPSOID_GLOBE_STACK_ID = 'ellipsoid-globe'

export function mapStackById(id) {
  return MAP_STACKS.find((s) => s.id === id) ?? MAP_STACKS.find((s) => s.id === FALLBACK_MAP_STACK_ID)
}

export function mapLibreStyleForStack(id) {
  if (id === 'osm') {
    return {
      version: 8,
      name: 'MIP OSM raster',
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
          maxzoom: 19,
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    }
  }
  // Keyless vector style. Do not use paid basemap APIs.
  return 'https://tiles.openfreemap.org/styles/positron'
}

/** World-scale default — not a single-facility framing. */
export function worldCamera() {
  return Object.freeze({
    center: Object.freeze([0, 20]),
    zoom: 1.35,
    pitch: 0,
    bearing: 0,
  })
}

// ---- Ellipsoid globe camera / inspect-range contract ----

// Shared maximum inspection range contract (ground distance) by precision class.
// Used by the ellipsoid globe renderer to constrain "zoom in" so it cannot
// impersonate a finer recorded precision class.
export function maxInspectRangeInMetersForPrecisionClass(precisionClass) {
  switch (String(precisionClass ?? '').toLowerCase()) {
    case 'country':
      return 40000
    case 'region':
      return 20000
    case 'city':
      return 5000
    case 'area':
      return 2500
    case 'facility':
      return 1250
    default:
      return 20000
  }
}

// Convert the inspection-range ceiling (ground distance, in meters) into a camera
// altitude above the ellipsoid (meters). Calibrated to the live-measured
// ~5km scale bar around Cleveland at the city precision ceiling.
export function heightMetersForPrecisionClass(precisionClass) {
  const range = maxInspectRangeInMetersForPrecisionClass(precisionClass)

  // Approximate perspective model for a fixed vertical field-of-view.
  const FOVY_DEG = 60
  const tanHalfFov = Math.tan((FOVY_DEG / 2) * (Math.PI / 180))

  // Empirical mapping: the scale line represents ~25% of the visible ground
  // extent at the precision ceiling.
  const SCALEBAR_FRACTION = 0.25

  return range / (tanHalfFov * SCALEBAR_FRACTION)
}

// Heading/pitch/roll orientation contract derived from the MapLibre subject camera.
// This updates only renderer-local camera framing; it does not rewrite projection
// coordinates or precision_class.
export function subjectOrientationDegrees() {
  // MapLibre contract: pitch=32deg, bearing=-14deg.
  return Object.freeze({
    headingDegrees: 346, // (-14 + 360) % 360
    pitchDegrees: -32, // opposite sign for "look down" convention
    rollDegrees: 0,
  })
}

export const EARTH_SEMI_MAJOR_METERS = 6378137

export function minCameraDistanceFromCenterMetersForPrecisionClass(precisionClass) {
  const height = heightMetersForPrecisionClass(precisionClass)
  return EARTH_SEMI_MAJOR_METERS + height
}

export function subjectEllipsoidCamera(coordinate, precisionClass) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null
  const lon = Number(coordinate[0])
  const lat = Number(coordinate[1])
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null

  const orient = subjectOrientationDegrees()
  return Object.freeze({
    lon,
    lat,
    heightMeters: heightMetersForPrecisionClass(precisionClass),
    headingDegrees: orient.headingDegrees,
    pitchDegrees: orient.pitchDegrees,
    rollDegrees: orient.rollDegrees,
    minZoomDistanceMeters: minCameraDistanceFromCenterMetersForPrecisionClass(precisionClass),
  })
}

/**
 * Camera framing by recorded precision_class. City stays metro-scale.
 * Facility zoom is never used to impersonate a finer class than the row.
 */
export function zoomForPrecisionClass(precisionClass) {
  switch (String(precisionClass ?? '').toLowerCase()) {
    case 'country':
      return 3.2
    case 'region':
      return 5.2
    case 'city':
      return 7.1
    case 'area':
      return 8.4
    case 'facility':
      return 9.2
    default:
      return 4.5
  }
}

/** User zoom may inspect, but must not reach building-level fake precision. */
export function maxZoomForPrecisionClass(precisionClass) {
  switch (String(precisionClass ?? '').toLowerCase()) {
    case 'country':
      return 6
    case 'region':
      return 8
    case 'city':
      return 10
    case 'area':
      return 11
    case 'facility':
      return 12
    default:
      return 10
  }
}

export function minZoom() {
  return 0.8
}

export function subjectCamera(coordinate, precisionClass) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null
  const lon = Number(coordinate[0])
  const lat = Number(coordinate[1])
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  return Object.freeze({
    center: Object.freeze([lon, lat]),
    zoom: zoomForPrecisionClass(precisionClass),
    pitch: 32,
    bearing: -14,
    maxZoom: maxZoomForPrecisionClass(precisionClass),
  })
}

/**
 * Pan/zoom/scale-adaptive camera must not rewrite the projection row.
 * Returns the same precision_class and coordinates the row already had.
 */
export function geometryAfterCamera(row, _camera = null) {
  void _camera
  if (!row) {
    return Object.freeze({
      precisionClass: null,
      coordinates: null,
      geometryStatus: null,
      invented: false,
    })
  }
  return Object.freeze({
    precisionClass: row.precision_class ?? null,
    coordinates: row.display_geometry?.coordinates ?? null,
    geometryStatus: row.geometry_status ?? null,
    invented: false,
  })
}

export function nextMapStackOnFailure(currentId) {
  if (currentId === ELLIPSOID_GLOBE_STACK_ID) return 'openfreemap-positron'
  if (currentId === 'openfreemap-positron') return 'osm'
  return FALLBACK_MAP_STACK_ID
}

/**
 * Idle render governance (pattern-level): no continuous animation loop.
 * MapLibre already renders on camera / tile events. This flag records that
 * World View must not invent per-frame OSINT motion.
 */
export function worldViewRenderMode() {
  return Object.freeze({
    mode: 'idle',
    continuousOverlays: false,
    requestRenderOnCamera: true,
  })
}
