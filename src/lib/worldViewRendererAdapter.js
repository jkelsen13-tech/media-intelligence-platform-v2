import { normalizeVisualFidelityProfile, visualFidelityCapabilities } from './worldViewVisualFidelity.js'
// R4 World View — renderer adapter seam (MapLibre + deck.gl 2D/2.5D).
//
// This module is DISPLAY-only: it never rewrites Investigation Context,
// canonical identity, or projection coordinates. It only owns the
// renderer lifecycle for a given map canvas host element.
//
// Renderer governance:
// - This module provides the renderer adapter seam only.
// - Cesium ellipsoid rendering is permitted behind this seam (owner authorized).

import { plotDecision, collectPositions, sourceNativeLocationLabel, displayCoordinateText } from './spatialProjection.js'
import {
  FALLBACK_MAP_STACK_ID,
  ELLIPSOID_GLOBE_STACK_ID,
  mapStackById,
  mapLibreStyleForStack,
  heightMetersFromMapZoom,
  heightMetersForPrecisionClass,
  mapZoomForHeightMeters,
  maxZoomForPrecisionClass,
  minZoom,
  nextMapStackOnFailure,
  subjectCamera,
  worldCamera,
  worldViewRenderMode,
} from './worldViewMapStack.js'
import {
  makeCameraState,
  parseCameraState,
  serializeCameraState,
} from './worldViewCameraState.js'
import { overlayAllowed } from './worldViewPrivacyLock.js'
import { createMarkerLabelMeasurer, visibleLabelIds } from './worldViewMarkerLayout.js'

// ---- Stage C: renderer-neutral camera-state contract (2D/2.5D side) ----
//
// Same serializable camera contract as the globe adapter, expressed through
// the zoom<->height bridge in worldViewMapStack.js. Heading/pitch use the
// contract convention (heading 346 === bearing -14; pitch negative looks
// down). Restore is clamped to the precision-class zoom cap so it can never
// reach finer-than-recorded precision.

// The existing bridge is calibrated at 800 CSS pixels. Smaller viewports need
// a tighter cap; wider viewports retain that approved bound. This remains an
// approximate display-scale contract, not a physical MapLibre camera altitude.
const NOMINAL_MAP_WIDTH = 800
const MERCATOR_MAX_LATITUDE = 85.05112878

function mapBridgeWidth(width) {
  return Number.isFinite(width) && width > 0 ? Math.min(width, NOMINAL_MAP_WIDTH) : NOMINAL_MAP_WIDTH
}

export function maxMapZoomForPrecisionClassAtLatitude(precisionClass, lat, viewportWidthPx = NOMINAL_MAP_WIDTH) {
  if (!Number.isFinite(lat)) return null
  const latitude = Math.min(MERCATOR_MAX_LATITUDE, Math.max(-MERCATOR_MAX_LATITUDE, lat))
  const floorZoom = mapZoomForHeightMeters(heightMetersForPrecisionClass(precisionClass), latitude, mapBridgeWidth(viewportWidthPx))
  return floorZoom === null ? null : Math.min(maxZoomForPrecisionClass(precisionClass), floorZoom)
}

function applyMapPrecisionLimit(map, cap) {
  if (!map || !Number.isFinite(cap) || cap < -2) return false
  const lower = Math.min(minZoom(), cap)
  const currentMin = map.getMinZoom?.() ?? minZoom()
  // MapLibre requires min <= max. Lower min first; raise max before min.
  if (lower < currentMin) map.setMinZoom?.(lower)
  if (Math.abs((map.getMaxZoom?.() ?? Infinity) - cap) > 1e-9) map.setMaxZoom?.(cap)
  if (lower > currentMin) map.setMinZoom?.(lower)
  return true
}

export function createMapPrecisionGovernor(map, { getPrecisionClass, onUnavailable } = {}) {
  let updating = false
  let refreshPending = false
  let lastWidth = NOMINAL_MAP_WIDTH
  function width() {
    const measured = map?.getCanvas?.()?.clientWidth
    if (Number.isFinite(measured) && measured > 0) lastWidth = mapBridgeWidth(measured)
    return lastWidth
  }
  function update(lat) {
    if (updating) { refreshPending = true; return true }
    updating = true
    let applied = true
    let passes = 0
    try {
      do {
        refreshPending = false
        const currentLat = lat ?? map?.getCenter?.()?.lat
        const cap = maxMapZoomForPrecisionClassAtLatitude(getPrecisionClass?.(), currentLat, width())
        applied = applyMapPrecisionLimit(map, cap)
        passes += 1
        // A zoom clamp can also constrain center latitude. Re-read that live
        // center after synchronous move events, without recursive callbacks.
      } while (applied && refreshPending && lat === undefined && passes < 4)
      if (!applied || (refreshPending && lat === undefined)) {
        onUnavailable?.()
        return false
      }
      return true
    } finally { updating = false; refreshPending = false }
  }
  // Zoom setters can emit move synchronously; the guard prevents recursion.
  // Event callbacks receive an event object, not a latitude.
  const refresh = () => update()
  map?.on?.('move', refresh)
  map?.on?.('resize', refresh)
  return {
    width, update,
    destroy() { map?.off?.('move', refresh); map?.off?.('resize', refresh) },
  }
}

// Scalars only for display/runtime qualification. The raw bridge height is
// intentionally not precision-clamped, so a broken live cap cannot be hidden.
export function mapCameraRenderState(map, precisionClass, viewportWidthPx = NOMINAL_MAP_WIDTH) {
  if (!map) return null
  try {
    const center = map.getCenter?.()
    const zoom = map.getZoom?.()
    if (!center || !Number.isFinite(center.lng) || !Number.isFinite(center.lat) || !Number.isFinite(zoom)) return null
    const viewportWidth = mapBridgeWidth(viewportWidthPx)
    const nominalHeight = heightMetersFromMapZoom(zoom, center.lat)
    if (nominalHeight === null) return null
    const finiteOrNull = value => Number.isFinite(value) ? value : null
    return {
      rendererKind: 'maplibre-deck.gl',
      mapCamera: {
        lon: center.lng, lat: center.lat, zoom,
        bearing: finiteOrNull(map.getBearing?.()),
        pitch: finiteOrNull(map.getPitch?.()),
        bridgeHeightMeters: nominalHeight * viewportWidth / NOMINAL_MAP_WIDTH,
        viewportWidthPx: viewportWidth,
        minZoom: finiteOrNull(map.getMinZoom?.()),
        maxZoom: finiteOrNull(map.getMaxZoom?.()),
        precisionClass: typeof precisionClass === 'string' ? precisionClass : null,
      },
    }
  } catch { return null }
}

/** Build a normalized camera state from a 2D/2.5D map camera snapshot. */
export function cameraStateFromMapCamera({ lng, lat, zoom, bearing = 0, pitch = 0 }, precisionClass, viewportWidthPx = NOMINAL_MAP_WIDTH) {
  const nominalHeight = heightMetersFromMapZoom(zoom, lat)
  const heightMeters = nominalHeight === null ? null : nominalHeight * mapBridgeWidth(viewportWidthPx) / NOMINAL_MAP_WIDTH
  if (heightMeters === null) return null
  return makeCameraState(
    {
      lon: lng,
      lat,
      heightMeters,
      headingDegrees: bearing,
      pitchDegrees: Math.min(85, Math.max(0, pitch)) - 90,
      rollDegrees: 0,
    },
    precisionClass,
  )
}

/** Convert a normalized camera state into 2D/2.5D map camera parameters. */
export function mapCameraForCameraState(cameraState, precisionClass, viewportWidthPx = NOMINAL_MAP_WIDTH) {
  if (!cameraState) return null
  const cap = maxMapZoomForPrecisionClassAtLatitude(precisionClass, cameraState.lat, viewportWidthPx)
  if (cap === null || cap < -2) return null
  // Mercator cannot represent the poles; constrain only the fallback camera.
  const lat = Math.min(MERCATOR_MAX_LATITUDE, Math.max(-MERCATOR_MAX_LATITUDE, cameraState.lat))
  const zoomRaw = mapZoomForHeightMeters(cameraState.heightMeters, lat, mapBridgeWidth(viewportWidthPx))
  const zoom = Math.max(Math.min(minZoom(), cap), Math.min(zoomRaw ?? cap, cap))
  const heading = cameraState.headingDegrees
  return Object.freeze({
    center: Object.freeze([cameraState.lon, lat]),
    zoom,
    bearing: heading > 180 ? heading - 360 : heading,
    pitch: Math.min(85, Math.max(0, 90 + cameraState.pitchDegrees)),
  })
}

/**
 * Convert projection rows into a stable, pickable feature record list.
 *
 * Contract: pickable identity is the original `row` object reference; no
 * new coordinates, no new subject id, no invented display geometry.
 */
export function projectionMarkerRecords(rows, selectedKeys) {
  return (rows ?? []).flatMap((row) => {
    const decision = plotDecision(row)
    if (!decision.plot) return []
    const positions = collectPositions(decision.geometry)
    const selected =
      selectedKeys.has(String(row.mip_object_id)) || selectedKeys.has(String(row.subject_graph_node_id))
    return [
      {
        row,
        geometry: decision.geometry,
        positions,
        selected,
        label: sourceNativeLocationLabel(row),
        coords: displayCoordinateText(decision.geometry),
      },
    ]
  })
}

// The drawn deck font and measurement font must stay identical. These are
// renderer-local display records; each point retains its row and position.
const MAP_LABEL_FONT_FAMILY = 'sans-serif'
const MAP_LABEL_FONT = 'normal 12px ' + MAP_LABEL_FONT_FAMILY
const MAP_LABEL_ATLAS_SIZE = 64
const mapProjectionLabelText = d => String(d.label || d.row.precision_class || 'projected location').replace(/\r\n?|\n/g, '\n')

function mapProjectionPointRecords(features, selectedKeys) {
  return (features ?? []).flatMap((feature, featureIndex) =>
    feature.positions.map((position, positionIndex) => ({
      ...feature,
      position,
      selected: selectedKeys
        ? selectedKeys.has(String(feature.row.mip_object_id)) || selectedKeys.has(String(feature.row.subject_graph_node_id))
        : Boolean(feature.selected),
      // Never exposed as a canonical identity or written back to a row.
      labelLayoutId: JSON.stringify([feature.row.revision_id ?? null,
        feature.row.mip_object_id ?? null, feature.row.subject_graph_node_id ?? null,
        featureIndex, positionIndex]),
    })),
  )
}

/**
 * Renderer-owned MapLibre screen-space label pass. Reproject on every real
 * render/camera/resize event, even subpixel movement; unchanged membership
 * never requests another frame. No timers or continuous animation loop.
 */
export function createMapMarkerLabelLayout(map, {
  onChange, isCancelled = () => false,
  createContext = () => map?.getCanvas?.()?.ownerDocument?.createElement('canvas').getContext('2d'),
  now = () => globalThis.performance?.now?.() ?? Date.now(),
} = {}) {
  // TextLayer 9.4 lays out individual glyph advances at the atlas font size,
  // then scales them to CSS pixels. Whole-string measureText at 12px would
  // introduce kerning/ligatures that deck does not draw. Feed those actual
  // advances to the shared bounded full-label measurer instead.
  const measurer = createMarkerLabelMeasurer(() => {
    const context = createContext?.()
    if (!context) return null
    const glyphs = new Map()
    const scale = 12 / MAP_LABEL_ATLAS_SIZE
    return {
      set font(_font) { context.font = 'normal ' + MAP_LABEL_ATLAS_SIZE + 'px ' + MAP_LABEL_FONT_FAMILY },
      measureText(text) {
        let advance = 0, right = 0, ascent = 0, descent = 0
        for (const character of Array.from(text)) {
          let metrics = glyphs.get(character)
          if (!metrics) {
            const measured = context.measureText(character)
            const hasBounds = Boolean(measured.actualBoundingBoxAscent)
            metrics = {
              advance: measured.width,
              width: hasBounds && Number.isFinite(measured.actualBoundingBoxRight - measured.actualBoundingBoxLeft)
                ? Math.ceil(measured.actualBoundingBoxRight - measured.actualBoundingBoxLeft) : measured.width,
              ascent: hasBounds ? Math.ceil(measured.actualBoundingBoxAscent) : MAP_LABEL_ATLAS_SIZE * 0.9,
              descent: hasBounds ? Math.ceil(measured.actualBoundingBoxDescent || 0) : MAP_LABEL_ATLAS_SIZE * 0.3,
            }
            if (glyphs.size >= 512) glyphs.delete(glyphs.keys().next().value)
            glyphs.set(character, metrics)
          }
          right = Math.max(right, advance + metrics.width)
          advance += metrics.advance
          ascent = Math.max(ascent, metrics.ascent)
          descent = Math.max(descent, metrics.descent)
        }
        return { width: Math.max(advance, right) * scale,
          actualBoundingBoxAscent: ascent * scale, actualBoundingBoxDescent: descent * scale }
      },
    }
  })
  let points = [], labels = [], accepted = new Set()
  let destroyed = false, updating = false
  const stats = { points: 0, labels: 0, passes: 0, lastMs: 0, maxMs: 0 }

  function update(notify = true) {
    if (destroyed || updating || isCancelled()) return false
    updating = true
    const started = now()
    try {
      const canvas = map?.getCanvas?.()
      const width = canvas?.clientWidth, height = canvas?.clientHeight
      const zoom = map?.getZoom?.(), lat = map?.getCenter?.()?.lat
      const nominalHeight = heightMetersFromMapZoom(zoom, lat)
      // Use the same display-scale bridge as the camera contract, without
      // precision clamping or rounding away actual small camera movements.
      const cameraHeightMeters = nominalHeight === null
        ? Infinity : nominalHeight * mapBridgeWidth(width) / NOMINAL_MAP_WIDTH
      const candidates = points.map(point => {
        let screen
        try { screen = map?.project?.([Number(point.position[0]), Number(point.position[1])]) }
        catch { /* unavailable projection cannot place a label */ }
        const label = mapProjectionLabelText(point)
        return {
          id: point.labelLayoutId, selected: point.selected, label,
          ...measurer.measure(label, MAP_LABEL_FONT),
          x: screen?.x, y: screen?.y,
          visible: Number.isFinite(screen?.x) && Number.isFinite(screen?.y)
            && screen.x >= 0 && screen.x <= width && screen.y >= 0 && screen.y <= height,
        }
      })
      const next = visibleLabelIds(candidates, { width, height, cameraHeightMeters })
      const changed = next.size !== accepted.size || [...next].some(id => !accepted.has(id))
      accepted = next
      // Retain the exact point objects for deck accessors and row picking.
      labels = points.filter(point => accepted.has(point.labelLayoutId))
      stats.points = points.length
      stats.labels = labels.length
      stats.passes += 1
      stats.lastMs = Math.max(0, now() - started)
      stats.maxMs = Math.max(stats.maxMs, stats.lastMs)
      if (changed && notify && !destroyed && !isCancelled()) onChange?.()
      return changed
    } finally { updating = false }
  }

  const refresh = () => update()
  for (const event of ['render', 'move', 'resize']) map?.on?.(event, refresh)
  return {
    update,
    setFeatures(features, selectedKeys) {
      if (destroyed || isCancelled()) return false
      points = mapProjectionPointRecords(features, selectedKeys)
      return update(false)
    },
    getLayerData: () => ({ pointData: points, labelData: labels }),
    getStats: () => ({ ...stats }),
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const event of ['render', 'move', 'resize']) map?.off?.(event, refresh)
      points = []
      labels = []
      accepted.clear()
      measurer.clear()
      stats.points = 0
      stats.labels = 0
    },
  }
}

export function deckProjectionLayers({ ScatterplotLayer, TextLayer }, features, onSelectRow, selectedKeys, {
  pointData = mapProjectionPointRecords(features, selectedKeys), labelData = pointData,
} = {}) {
  const data = pointData

  return [
    new ScatterplotLayer({
      id: 'mip-projection-points',
      data,
      pickable: true,
      opacity: 0.85,
      stroked: true,
      filled: true,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      getPosition: (d) => [Number(d.position[0]), Number(d.position[1])],
      getRadius: (d) => (d.selected ? 9 : 7),
      getFillColor: (d) => (d.selected ? [21, 110, 191, 220] : [21, 110, 191, 150]),
      getLineColor: [21, 110, 191, 255],
      getLineWidth: 1.5,
      radiusMinPixels: 6,
      radiusMaxPixels: 12,
      onClick: (info) => {
        if (info?.object?.row) onSelectRow(info.object.row)
      },
      updateTriggers: { getRadius: selectedKeys, getFillColor: selectedKeys },
    }),
    new TextLayer({
      id: 'mip-projection-labels',
      data: labelData,
      getPosition: (d) => [Number(d.position[0]), Number(d.position[1])],
      getText: mapProjectionLabelText,
      getSize: 12,
      sizeUnits: 'pixels',
      fontFamily: MAP_LABEL_FONT_FAMILY,
      fontWeight: 'normal',
      fontSettings: { fontSize: MAP_LABEL_ATLAS_SIZE },
      lineHeight: 1.5,
      characterSet: 'auto',
      getColor: [26, 26, 23, 230],
      getPixelOffset: [14, -8],
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      pickable: false,
    }),
  ]
}

/**
 * When the renderer has already seen N errors (1-based), determine whether
 * it should switch map stack.
 */
export function nextStackAfterRendererError(currentStackId, rendererErrorCount) {
  if (!Number.isFinite(rendererErrorCount)) return null
  if (rendererErrorCount < 2) return null
  return nextMapStackOnFailure(currentStackId)
}

export function stackAttribution(stackId) {
  const stack = mapStackById(stackId)
  return stack?.attribution ?? ''
}

export function cancelMapCameraFlight(map) {
  if (typeof map?.stop !== 'function') return false
  map.stop()
  return true
}

export function flyToSubject(map, coordinate, precisionClass) {
  if (!map) return false
  const cam = subjectCamera(coordinate, precisionClass)
  if (!cam) return false
  const width = mapBridgeWidth(map.getCanvas?.()?.clientWidth)
  const lat = Math.min(MERCATOR_MAX_LATITUDE, Math.max(-MERCATOR_MAX_LATITUDE, cam.center[1]))
  const cap = maxMapZoomForPrecisionClassAtLatitude(precisionClass, lat, width)
  if (!applyMapPrecisionLimit(map, cap)) return false
  map.flyTo({
    center: [cam.center[0], lat],
    zoom: Math.min(cam.zoom, cap),
    pitch: cam.pitch,
    bearing: cam.bearing,
    duration: 1600,
    essential: true,
  })
  return true
}

export function requestRepaint(map) {
  if (!map) return
  // MapLibre GL names vary a bit; prefer triggerRepaint.
  if (typeof map.triggerRepaint === 'function') return map.triggerRepaint()
  if (typeof map.repaint === 'function') return map.repaint()
  // Else: MapLibre will still repaint on its own; this is a best-effort.
}

export function destroyRendererResources({ overlay, map }) {
  if (overlay) {
    try {
      overlay.finalize?.()
    } catch {
      /* ignore */
    }
  }
  if (map) {
    try {
      map.remove?.()
    } catch {
      /* ignore */
    }
  }
}

export function rendererKindForStackId(stackId) {
  return stackId === ELLIPSOID_GLOBE_STACK_ID ? 'ellipsoid-globe' : 'maplibre-deck.gl'
}

/**
 * Pure renderer selection plan for adapter contract tests.
 * This does not attempt to import any renderer vendors.
 */
export function rendererPlanForStackId({ stackId, webglAvailable }) {
  if (stackId === ELLIPSOID_GLOBE_STACK_ID) {
    if (webglAvailable) return { rendererKind: 'ellipsoid-globe', mountStackId: stackId }
    return { rendererKind: 'maplibre-deck.gl', mountStackId: nextMapStackOnFailure(stackId) }
  }
  return { rendererKind: 'maplibre-deck.gl', mountStackId: stackId }
}

/**
 * MapLibre+deck.gl renderer adapter.
 *
 * Interface goals:
 * - mount(): boot renderer on the provided host element
 * - setFeatures(): update deck overlay layers (same pickable row identity)
 * - flyToSubject(): camera fly while preserving projection contract
 * - requestRender(): idle/request rendering hook (no continuous loop)
 * - destroy(): cleanup overlay + map
 * - fallback selection: handled internally via onStackIdChange requests
 */
// MapLibre 6 can return a partially initialized Map when context creation
// fails instead of throwing. Check the interleaved renderer prerequisite first.
export function mapLibreWebGL2Available(ownerDocument) {
  let gl
  try { gl = ownerDocument?.createElement('canvas').getContext('webgl2') }
  catch { return false }
  if (!gl) return false
  // Release this temporary capability probe; the real renderer owns its context.
  try { gl.getExtension?.('WEBGL_lose_context')?.loseContext() } catch { /* best effort */ }
  return true
}

function createMapLibreWorldViewRendererAdapter({
  stackId,
  getHostEl,
  coordinate,
  precisionClass,
  getPrecisionClass,
  getSelectedKeys,
  onSelectRow,
  onStackIdChange,
  onSourceStatusChange,
  onSelectedAnchorChange,
  shouldFlyTo,
  markFlew,
  initialFeatures,
  isCancelled,
}) {
  let map = null
  let overlay = null
  let deckLayerCtors = null
  let mounted = false
  let currentOnSelectRow = onSelectRow
  let localCancelled = false
  let precisionGovernor = null
  let labelLayout = null
  let activityState = 'visible-idle'
  let imageryStatus = { status: 'loading' }
  let anchorFeatures = initialFeatures ?? []
  let lastAnchor = null
  const lifecycleListeners = []

  const cancelledNow = () => localCancelled || Boolean(isCancelled?.())

  // Stage C: resolve the recorded precision class live at call time — it can
  // arrive after mount when rows load asynchronously.
  const activePrecisionClass = () => getPrecisionClass?.() ?? precisionClass

  async function mount() {
    if (mounted || cancelledNow()) return
    mounted = true

    // Atlas fallback is handled by the React UI layer.
    if (stackId === FALLBACK_MAP_STACK_ID) return

    const hostEl = getHostEl?.()
    if (!hostEl) return
    if (!mapLibreWebGL2Available(hostEl.ownerDocument)) {
      if (!cancelledNow()) onStackIdChange?.(FALLBACK_MAP_STACK_ID)
      return
    }

    let maplibregl
    let MapLibreOverlay
    let ScatterplotLayer
    let TextLayer
    try {
      maplibregl = await import('maplibre-gl')
      // MapLibre 6 is ESM-only. Vite bundles the worker's shared imports into
      // a same-origin asset under the deployment base path.
      const { default: workerUrl } = await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')
      maplibregl.setWorkerUrl(workerUrl)
      await import('maplibre-gl/dist/maplibre-gl.css')
      MapLibreOverlay = (await import('@deck.gl/maplibre')).MapLibreOverlay
      ;({ ScatterplotLayer, TextLayer } = await import('@deck.gl/layers'))
    } catch {
      if (!cancelledNow()) onStackIdChange?.(FALLBACK_MAP_STACK_ID)
      return
    }

    if (cancelledNow()) return

    // Renderer governance: no continuous animation loops.
    // (pattern contract only; MapLibre GL itself renders on camera / tile changes)
    void overlayAllowed
    void worldViewRenderMode()

    let localMap
    let localOverlay
    let errorCount = 0
    try {
      const start = worldCamera()
      const cap = maxMapZoomForPrecisionClassAtLatitude(activePrecisionClass(), start.center[1], hostEl.clientWidth)
      if (cap === null || cap < -2) {
        if (!cancelledNow()) onStackIdChange?.(FALLBACK_MAP_STACK_ID)
        return
      }
      localMap = new maplibregl.Map({
        container: hostEl,
        style: mapLibreStyleForStack(stackId),
        center: start.center,
        zoom: start.zoom,
        pitch: start.pitch,
        bearing: start.bearing,
        minZoom: Math.min(minZoom(), cap),
        maxZoom: cap,
        attributionControl: false,
        cooperativeGestures: false,
      })
    } catch {
      if (!cancelledNow()) onStackIdChange?.(nextMapStackOnFailure(stackId))
      return
    }

    if (cancelledNow()) {
      try {
        localMap?.remove?.()
      } catch {
        /* ignore */
      }
      return
    }

    localMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left')
    // Keep the scale away from expanded multi-line copyright on phones.
    localMap.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'top-right')
    localMap.addControl(
      new maplibregl.AttributionControl({ compact: false, customAttribution: stackAttribution(stackId) }),
      'bottom-right',
    )

    localOverlay = new MapLibreOverlay({
      interleaved: true,
      layers: deckProjectionLayers(
        { ScatterplotLayer, TextLayer },
        initialFeatures,
        currentOnSelectRow,
        getSelectedKeys?.() ?? new Set(),
        { labelData: [] },
      ),
    })
    localMap.addControl(localOverlay)

    if (cancelledNow()) {
      try {
        localOverlay?.finalize?.()
      } catch {
        /* ignore */
      }
      try {
        localMap?.remove?.()
      } catch {
        /* ignore */
      }
      return
    }

    // Attach lifecycle ownership to the adapter instance.
    map = localMap
    overlay = localOverlay
    deckLayerCtors = { ScatterplotLayer, TextLayer }
    precisionGovernor = createMapPrecisionGovernor(map, {
      getPrecisionClass: activePrecisionClass,
      onUnavailable: () => { if (!cancelledNow()) onStackIdChange?.(FALLBACK_MAP_STACK_ID) },
    })
    precisionGovernor.update()
    if (cancelledNow()) return
    const publishLayers = () => {
      if (cancelledNow() || !overlay || !deckLayerCtors || !labelLayout) return
      overlay.setProps({
        layers: deckProjectionLayers(deckLayerCtors, [], currentOnSelectRow,
          getSelectedKeys?.() ?? new Set(), labelLayout.getLayerData()),
      })
    }
    labelLayout = createMapMarkerLabelLayout(map, {
      isCancelled: cancelledNow,
      onChange: () => { publishLayers(); requestRepaint(map) },
    })
    labelLayout.setFeatures(initialFeatures, getSelectedKeys?.() ?? new Set())
    publishLayers()

    const handleError = () => {
      if (cancelledNow()) return
      errorCount += 1
      const next = nextStackAfterRendererError(stackId, errorCount)
      if (next) onStackIdChange?.(next)
    }
    const handleLoad = () => {
      if (cancelledNow() || !shouldFlyTo?.()) return
      const ok = flyToSubject(map, coordinate, precisionClass)
      if (ok) markFlew?.()
    }
    const handleRender = () => {
      if (cancelledNow() || activityState === 'hidden') return
      // Style/tile settling can also follow failed requests. It is not proof
      // that photographic or cartographic content successfully loaded.
      const feature = anchorFeatures.find(item => item.selected)
      const coordinate = feature?.positions?.[0]
      const width = map.getCanvas?.()?.clientWidth, height = map.getCanvas?.()?.clientHeight
      const screen = coordinate ? map.project(coordinate) : null
      const visible = Boolean(screen && screen.x >= 0 && screen.y >= 0 && screen.x <= width && screen.y <= height)
      const next = { visible, x: visible ? screen.x : null, y: visible ? screen.y : null, width, height }
      if (!lastAnchor || lastAnchor.visible !== visible || lastAnchor.width !== width || lastAnchor.height !== height
        || visible && (Math.abs(lastAnchor.x - next.x) >= 0.5 || Math.abs(lastAnchor.y - next.y) >= 0.5)) {
        lastAnchor = next; onSelectedAnchorChange?.(next)
      }
    }
    for (const [event, listener] of [['error', handleError], ['load', handleLoad], ['render', handleRender]]) {
      map.on(event, listener)
      lifecycleListeners.push([event, listener])
    }
  }

  async function setFeatures(nextFeatures, nextSelectedKeys = getSelectedKeys?.()) {
    if (cancelledNow()) return
    anchorFeatures = nextFeatures ?? []
    precisionGovernor?.update()
    if (!overlay || !deckLayerCtors || !labelLayout || stackId === FALLBACK_MAP_STACK_ID) return
    labelLayout.setFeatures(nextFeatures, nextSelectedKeys ?? new Set())
    overlay.setProps({
      layers: deckProjectionLayers(deckLayerCtors, nextFeatures, currentOnSelectRow,
        nextSelectedKeys ?? new Set(), labelLayout.getLayerData()),
    })
    requestRepaint(map)
  }

  function setOnSelectRow(nextOnSelectRow) {
    currentOnSelectRow = nextOnSelectRow
  }

  function flyToSubjectCamera({ nextCoordinate = coordinate, nextPrecisionClass = precisionClass } = {}) {
    if (!shouldFlyTo?.() && shouldFlyTo !== undefined) {
      return false
    }
    // Note: flyTo does not rewrite geometry/precision; it uses map camera only.
    const ok = flyToSubject(map, nextCoordinate, nextPrecisionClass)
    return ok
  }

  function requestRender() {
    requestRepaint(map)
  }

  // Stage C: serialize the live map camera into the renderer-neutral
  // contract. Returns a JSON string (or null when no map is available).
  function getCameraState() {
    if (!map) return null
    try {
      const center = map.getCenter?.()
      const zoom = map.getZoom?.()
      if (!center || !Number.isFinite(zoom)) return null
      return serializeCameraState(
        cameraStateFromMapCamera(
          {
            lng: center.lng,
            lat: center.lat,
            zoom,
            bearing: map.getBearing?.() ?? 0,
            pitch: map.getPitch?.() ?? 0,
          },
          activePrecisionClass(),
          precisionGovernor?.width(),
        ),
        activePrecisionClass(),
      )
    } catch {
      return null
    }
  }

  // Stage C: restore a serialized camera state. FAIL-SAFE: invalid or
  // unsupported state returns false and leaves the camera, the
  // Investigation Context, and the route untouched. The precision-class
  // zoom cap keeps restored views at or above the recorded ceiling.
  function setCameraState(serialized) {
    if (!map) return false
    const parsed = parseCameraState(serialized, { precisionClass: activePrecisionClass() })
    if (!parsed) return false
    const cam = mapCameraForCameraState(parsed, activePrecisionClass(), precisionGovernor?.width())
    if (!cam) return false
    cancelMapCameraFlight(map)
    if (!precisionGovernor?.update(cam.center[1])) return false
    map.jumpTo({ center: cam.center, zoom: cam.zoom, bearing: cam.bearing, pitch: cam.pitch })
    requestRepaint(map)
    return true
  }

  function destroy() {
    localCancelled = true
    labelLayout?.destroy()
    labelLayout = null
    for (const [event, listener] of lifecycleListeners.splice(0)) map?.off?.(event, listener)
    precisionGovernor?.destroy()
    precisionGovernor = null
    destroyRendererResources({ overlay, map })
    overlay = null
    map = null
    deckLayerCtors = null
    mounted = false
  }

  return {
    getAttribution: () => stackAttribution(stackId),
    mount,
    setFeatures,
    setOnSelectRow,
    flyToSubjectCamera: flyToSubjectCamera,
    cancelCameraFlight: () => cancelMapCameraFlight(map),
    getCameraState,
    getSourceStatus: () => ({ ...imageryStatus }),
    setActivityState: next => {
      if (!['visible-active', 'visible-idle', 'hidden'].includes(next)) return false
      activityState = next
      if (next === 'hidden') { lastAnchor = null; map?.stop?.(); onSelectedAnchorChange?.({ visible: false }) }
      else { map?.resize?.(); requestRepaint(map) }
      return Boolean(map)
    },
    setCameraState,
    getVisualFidelityRenderState: () => {
      const state = mapCameraRenderState(map, activePrecisionClass(), precisionGovernor?.width())
      return state ? { ...state, labelLayout: labelLayout?.getStats() ?? null } : null
    },
    requestRender,
    destroy,
  }
}

/**
 * World View renderer adapter seam dispatcher.
 *
 * Fallback chain:
 *   ellipsoid-globe (Cesium) fails -> openfreemap-positron (MapLibre)
 *   MapLibre fails -> osm -> atlas-fallback (SVG atlas)
 */
export function createWorldViewRendererAdapter(args, {
  loadGlobeAdapter = () => import('./worldViewCesiumEllipsoidRendererAdapter.js'),
  createMapAdapter = createMapLibreWorldViewRendererAdapter,
} = {}) {
  let impl = null
  let rendererKind = null
  let mountPromise = null
  let destroyed = false
  let ready = false
  let features = args?.initialFeatures ?? []
  let selectedKeys = args?.getSelectedKeys?.() ?? new Set()
  let onSelectRow = args?.onSelectRow
  let reliefShadingEnabled
  let visualFidelityProfile
  let recordedTimeInstant = args?.recordedTimeInstant ?? null
  let activityState = 'visible-idle'
  const cancelled = () => destroyed || Boolean(args?.isCancelled?.())

  async function start() {
    if (cancelled()) return
    const { stackId } = args ?? {}
    const currentArgs = () => ({
      ...args,
      initialFeatures: features,
      recordedTimeInstant,
      initialActivityState: activityState,
      getSelectedKeys: () => selectedKeys,
      onSelectRow,
      isCancelled: cancelled,
    })

    if (stackId === ELLIPSOID_GLOBE_STACK_ID) {
      try {
        const mod = await loadGlobeAdapter()
        if (cancelled()) return
        rendererKind = 'ellipsoid-globe'
        impl = mod.createCesiumEllipsoidRendererAdapter(currentArgs())
      } catch {
        if (cancelled()) return
        rendererKind = 'maplibre-deck.gl'
        args?.onStackIdChange?.(nextMapStackOnFailure(stackId))
        return
      }
    } else {
      rendererKind = 'maplibre-deck.gl'
      impl = createMapAdapter(currentArgs())
    }

    await impl?.mount?.()
    if (cancelled()) return
    // Updates can arrive during either dynamic import or renderer startup.
    // Replay the latest snapshot only once the renderer can accept layers.
    ready = true
    impl?.setActivityState?.(activityState)
    impl?.setOnSelectRow?.(onSelectRow)
    if (reliefShadingEnabled !== undefined) impl?.setReliefShadingEnabled?.(reliefShadingEnabled)
    impl?.setRecordedTimeInstant?.(recordedTimeInstant)
    if (visualFidelityProfile) impl?.setVisualFidelityProfile?.(visualFidelityProfile)
    await impl?.setFeatures?.(features, selectedKeys)
  }

  function mount() {
    if (!mountPromise) mountPromise = start()
    return mountPromise
  }

  return {
    getRendererKind: () => rendererKind ?? rendererKindForStackId(args?.stackId),
    getAttribution: () => impl?.getAttribution?.() ?? stackAttribution(args?.stackId),
    mount,
    setFeatures: (nextFeatures, nextSelectedKeys = args?.getSelectedKeys?.()) => {
      if (cancelled()) return
      features = nextFeatures
      selectedKeys = nextSelectedKeys ?? new Set()
      if (ready) return impl?.setFeatures?.(features, selectedKeys)
    },
    setOnSelectRow: (nextOnSelectRow) => {
      if (cancelled()) return
      onSelectRow = nextOnSelectRow
      if (ready) impl?.setOnSelectRow?.(onSelectRow)
    },
    flyToSubjectCamera: (opts) => ready && !cancelled() ? impl?.flyToSubjectCamera?.(opts) ?? false : false,
    cancelCameraFlight: () => ready && !cancelled() ? impl?.cancelCameraFlight?.() ?? false : false,
    getCameraState: () => impl?.getCameraState?.() ?? null,
    getSourceStatus: () => impl?.getSourceStatus?.() ?? null,
    setActivityState: next => {
      if (cancelled() || !['visible-active', 'visible-idle', 'hidden'].includes(next)) return false
      activityState = next
      return impl?.setActivityState?.(next) ?? false
    },
    setCameraState: (serialized) => impl?.setCameraState?.(serialized) ?? false,
    getTerrainStatus: () => impl?.getTerrainStatus?.() ?? null,
    sampleTerrainHeights: (pairs, level) => impl?.sampleTerrainHeights?.(pairs, level) ?? null,
    // Stage D visual-continuity repair: relief shading is a globe-only
    // treatment; the MapLibre fallback adapter has no globe material, so it
    // no-ops through the optional call.
    setReliefShadingEnabled: (enabled) => {
      if (cancelled()) return false
      reliefShadingEnabled = enabled
      return ready ? impl?.setReliefShadingEnabled?.(enabled) ?? false : false
    },
    getReliefShadingEnabled: () => impl?.getReliefShadingEnabled?.() ?? false,
    setVisualFidelityProfile: (profile) => {
      if (cancelled()) return false
      visualFidelityProfile = normalizeVisualFidelityProfile(profile)
      return ready ? impl?.setVisualFidelityProfile?.(visualFidelityProfile) ?? false : false
    },
    setRecordedTimeInstant: (value) => {
      if (cancelled()) return false
      recordedTimeInstant = typeof value === 'string' ? value : null
      return ready ? impl?.setRecordedTimeInstant?.(recordedTimeInstant) ?? false : false
    },
    getVisualFidelityCapabilities: () => ready && !cancelled()
      ? impl?.getVisualFidelityCapabilities?.() ?? visualFidelityCapabilities({ reason: 'Effects unavailable on this fallback renderer.' })
      : visualFidelityCapabilities(),
    getVisualFidelityRenderState: () => impl?.getVisualFidelityRenderState?.() ?? null,
    requestRender: () => activityState !== 'hidden' && impl?.requestRender?.(),
    destroy: () => {
      if (destroyed) return
      destroyed = true
      ready = false
      impl?.destroy?.()
      impl = null
    },
  }
}
