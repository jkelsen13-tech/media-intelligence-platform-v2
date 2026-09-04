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

// ---- Stage C: renderer-neutral camera-state contract (2D/2.5D side) ----
//
// Same serializable camera contract as the globe adapter, expressed through
// the zoom<->height bridge in worldViewMapStack.js. Heading/pitch use the
// contract convention (heading 346 === bearing -14; pitch negative looks
// down). Restore is clamped to the precision-class zoom cap so it can never
// reach finer-than-recorded precision.

/** Build a normalized camera state from a 2D/2.5D map camera snapshot. */
export function cameraStateFromMapCamera({ lng, lat, zoom, bearing = 0, pitch = 0 }, precisionClass) {
  const heightMeters = heightMetersFromMapZoom(zoom, lat)
  if (heightMeters === null) return null
  return makeCameraState(
    {
      lon: lng,
      lat,
      heightMeters,
      headingDegrees: bearing,
      pitchDegrees: -pitch,
      rollDegrees: 0,
    },
    precisionClass,
  )
}

/** Convert a normalized camera state into 2D/2.5D map camera parameters. */
export function mapCameraForCameraState(cameraState, precisionClass) {
  if (!cameraState) return null
  const cap = maxZoomForPrecisionClass(precisionClass)
  const zoomRaw = mapZoomForHeightMeters(cameraState.heightMeters, cameraState.lat)
  const zoom = Math.min(zoomRaw ?? cap, cap)
  const heading = cameraState.headingDegrees
  return Object.freeze({
    center: Object.freeze([cameraState.lon, cameraState.lat]),
    zoom,
    bearing: heading > 180 ? heading - 360 : heading,
    pitch: -cameraState.pitchDegrees,
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

export function deckProjectionLayers({ ScatterplotLayer, TextLayer }, features, onSelectRow, selectedKeys) {
  const data = features.flatMap((f) =>
    f.positions.map((position) => ({
      ...f,
      position,
    })),
  )

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
      data,
      getPosition: (d) => [Number(d.position[0]), Number(d.position[1])],
      getText: (d) => d.label || d.row.precision_class || 'projected location',
      getSize: 12,
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

export function flyToSubject(map, coordinate, precisionClass) {
  if (!map) return false
  const cam = subjectCamera(coordinate, precisionClass)
  if (!cam) return false
  map.flyTo({
    center: cam.center,
    zoom: cam.zoom,
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
function createMapLibreWorldViewRendererAdapter({
  stackId,
  getHostEl,
  coordinate,
  precisionClass,
  getPrecisionClass,
  getSelectedKeys,
  onSelectRow,
  onStackIdChange,
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

  const cancelledNow = () => localCancelled || Boolean(isCancelled?.())

  // Stage C: resolve the recorded precision class live at call time — it can
  // arrive after mount when rows load asynchronously.
  const activePrecisionClass = () => getPrecisionClass?.() ?? precisionClass

  async function mount() {
    if (mounted) return
    mounted = true

    // Atlas fallback is handled by the React UI layer.
    if (stackId === FALLBACK_MAP_STACK_ID) return

    const hostEl = getHostEl?.()
    if (!hostEl) return

    let maplibregl
    let MapboxOverlay
    let ScatterplotLayer
    let TextLayer
    try {
      maplibregl = (await import('maplibre-gl')).default
      await import('maplibre-gl/dist/maplibre-gl.css')
      MapboxOverlay = (await import('@deck.gl/mapbox')).MapboxOverlay
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
      localMap = new maplibregl.Map({
        container: hostEl,
        style: mapLibreStyleForStack(stackId),
        center: start.center,
        zoom: start.zoom,
        pitch: start.pitch,
        bearing: start.bearing,
        minZoom: minZoom(),
        maxZoom: maxZoomForPrecisionClass(precisionClass),
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
    localMap.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')
    localMap.addControl(
      new maplibregl.AttributionControl({ compact: false, customAttribution: stackAttribution(stackId) }),
      'bottom-right',
    )

    localOverlay = new MapboxOverlay({
      interleaved: true,
      layers: deckProjectionLayers(
        { ScatterplotLayer, TextLayer },
        initialFeatures,
        currentOnSelectRow,
        getSelectedKeys?.() ?? new Set(),
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

    const handleError = () => {
      errorCount += 1
      const next = nextStackAfterRendererError(stackId, errorCount)
      if (next) onStackIdChange?.(next)
    }
    map.on('error', handleError)

    map.on('load', () => {
      if (!shouldFlyTo?.()) return
      const ok = flyToSubject(map, coordinate, precisionClass)
      if (ok) markFlew?.()
    })
  }

  async function setFeatures(nextFeatures, nextSelectedKeys = getSelectedKeys?.()) {
    if (!overlay || !deckLayerCtors || stackId === FALLBACK_MAP_STACK_ID) return
    overlay.setProps({
      layers: deckProjectionLayers(deckLayerCtors, nextFeatures, currentOnSelectRow, nextSelectedKeys ?? new Set()),
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
    const cam = mapCameraForCameraState(parsed, activePrecisionClass())
    if (!cam) return false
    map.jumpTo({ center: cam.center, zoom: cam.zoom, bearing: cam.bearing, pitch: cam.pitch })
    requestRepaint(map)
    return true
  }

  function destroy() {
    localCancelled = true
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
    getCameraState,
    setCameraState,
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
export function createWorldViewRendererAdapter(args) {
  let impl = null
  let rendererKind = null

  async function mount() {
    if (impl) return
    const { stackId } = args ?? {}

    if (stackId === ELLIPSOID_GLOBE_STACK_ID) {
      try {
        const mod = await import('./worldViewCesiumEllipsoidRendererAdapter.js')
        rendererKind = 'ellipsoid-globe'
        impl = mod.createCesiumEllipsoidRendererAdapter(args)
      } catch {
        rendererKind = 'maplibre-deck.gl'
        onStackIdChange?.(nextMapStackOnFailure(stackId))
        return
      }
    } else {
      rendererKind = 'maplibre-deck.gl'
      impl = createMapLibreWorldViewRendererAdapter(args)
    }

    await impl?.mount?.()
  }

  return {
    getRendererKind: () => rendererKind ?? rendererKindForStackId(args?.stackId),
    getAttribution: () => impl?.getAttribution?.() ?? stackAttribution(args?.stackId),
    mount,
    setFeatures: (nextFeatures, nextSelectedKeys) => impl?.setFeatures?.(nextFeatures, nextSelectedKeys),
    setOnSelectRow: (nextOnSelectRow) => impl?.setOnSelectRow?.(nextOnSelectRow),
    flyToSubjectCamera: (opts) => impl?.flyToSubjectCamera?.(opts) ?? false,
    getCameraState: () => impl?.getCameraState?.() ?? null,
    setCameraState: (serialized) => impl?.setCameraState?.(serialized) ?? false,
    getTerrainStatus: () => impl?.getTerrainStatus?.() ?? null,
    sampleTerrainHeights: (pairs, level) => impl?.sampleTerrainHeights?.(pairs, level) ?? null,
    // Stage D visual-continuity repair: relief shading is a globe-only
    // treatment; the MapLibre fallback adapter has no globe material, so it
    // no-ops through the optional call.
    setReliefShadingEnabled: (enabled) => impl?.setReliefShadingEnabled?.(enabled) ?? false,
    getReliefShadingEnabled: () => impl?.getReliefShadingEnabled?.() ?? false,
    requestRender: () => impl?.requestRender?.(),
    destroy: () => impl?.destroy?.(),
  }
}
