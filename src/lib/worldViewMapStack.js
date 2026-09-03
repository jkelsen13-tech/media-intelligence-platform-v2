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

export const DEFAULT_MAP_STACK_ID = 'openfreemap-positron'
export const FALLBACK_MAP_STACK_ID = 'atlas-fallback'

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
