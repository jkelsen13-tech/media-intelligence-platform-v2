import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { geoMercator, geoPath, geoGraticule10 } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'
import {
  fitExtentGeometry,
} from '../lib/spatialProjection'
import {
  DEFAULT_MAP_STACK_ID,
  ELLIPSOID_GLOBE_STACK_ID,
  FALLBACK_MAP_STACK_ID,
  TERRAIN_DISCLOSURE_TEXT,
  TERRAIN_RELIEF_LEGEND_TEXT,
  TERRAIN_UNAVAILABLE_TEXT,
  mapStackById,
} from '../lib/worldViewMapStack'
import { createWorldViewRendererAdapter, projectionMarkerRecords } from '../lib/worldViewRendererAdapter'
import { visualFidelityCapabilities, resolveVisualFidelityProfile } from '../lib/worldViewVisualFidelity.js'
import { createCameraFraming } from '../lib/worldViewCameraFraming'
import { createCameraMemory, northAmericaCameraState } from '../lib/worldViewCameraMemory.js'
import { activateAtlasMarker, atlasDisplayMetrics, atlasLabelLayout, atlasLabelText, atlasMarkerId, atlasScreenScale } from '../lib/worldViewAtlasLabelLayout.js'
import { resolveWorldViewSourceStatus } from '../lib/worldViewSourceStatus.js'
import { createWorldViewPilotBookmarks } from '../lib/worldViewPilotBookmarks.js'
import { createWorldViewUsage, worldViewResourceObservation } from '../lib/worldViewResourcePolicy.js'

import WorldViewSpatialGroupPanel, { WorldViewDisplayOverlay } from '../components/WorldViewSpatialGroupPanel'
import { createDisplayPresentation, displayPresentationSignature, displayPresentationProbe } from '../lib/worldViewDisplayPresentation.js'
import { isCurrentSingletonRow, projectionRowDisplayKey, resolveCurrentClusterMember } from '../lib/worldViewDisplayClusters.js'

const MAP_W = 960
const MAP_H = 480
const EMPTY_RELATIONSHIPS = Object.freeze([])

const worldObjects = worldAtlas.objects ?? {}
const LAND = worldObjects.land ? feature(worldAtlas, worldObjects.land) : null
const BORDERS = worldObjects.countries
  ? mesh(worldAtlas, worldObjects.countries, (a, b) => a !== b)
  : null

function AtlasFallbackMap({ rows, selectedKeys, onSelectRow, emptyMessage, attribution, contextOverlay, relationships, onDisplayLayout, onInspectCluster }) {
  const features = useMemo(() => projectionMarkerRecords(rows, selectedKeys), [rows, selectedKeys])
  const svgRef = useRef(null)
  const labelRefs = useRef(new Map())
  const mainLabelRefs = useRef(new Map())
  const [screenScale, setScreenScale] = useState(1)
  const [contextAnchor, setContextAnchor] = useState({ visible: false })
  const [presentation, setPresentation] = useState(null)
  const atlasTiming = useRef({ passes: 0, lastMs: 0, maxMs: 0 })
  const metrics = atlasDisplayMetrics(screenScale)
  const [labelLayout, setLabelLayout] = useState(() => ({ labels: new Set(), details: new Set() }))
  const geometry = useMemo(() => {
    const projection = geoMercator()
    const positions = features.flatMap((f) => f.positions)
    const extent = fitExtentGeometry(positions, features[0]?.row?.precision_class)
    if (extent) {
      projection.fitExtent(
        [
          [16, 16],
          [MAP_W - 16, MAP_H - 16],
        ],
        { type: 'Feature', geometry: extent },
      )
    } else {
      projection.translate([MAP_W / 2, MAP_H / 2]).scale(MAP_W / (2 * Math.PI))
    }
    const path = geoPath(projection)
    return {
      projection,
      spherePath: path({ type: 'Sphere' }),
      landPath: LAND ? path(LAND) : null,
      bordersPath: BORDERS ? path(BORDERS) : null,
      graticulePath: path(geoGraticule10()),
      markers: features
        .flatMap((f) =>
          f.positions.map((coordinate, i) => {
            const point = projection(coordinate)
            if (!point) return null
            return { ...f, i, positionIndex: i, position: coordinate, id: atlasMarkerId({ ...f, i }), x: point[0], y: point[1] }
          }),
        )
        .filter(Boolean),
    }
  }, [features])

  useLayoutEffect(() => {
    let disposed = false
    const svg = svgRef.current
    const checkScale = () => {
      if (disposed) return false
      const next = atlasScreenScale(svg?.getScreenCTM?.(), screenScale)
      if (Math.abs(next - screenScale) <= 1e-6) return false
      setScreenScale(next)
      return true
    }
    const update = () => {
      if (disposed || checkScale()) return
      const selected = geometry.markers.find(marker => marker.selected)
      const contextMatrix = svg?.getScreenCTM?.(), bounds = svg?.parentElement?.getBoundingClientRect?.()
      if (selected && contextMatrix && bounds) {
        const x = contextMatrix.a * selected.x + contextMatrix.c * selected.y + contextMatrix.e - bounds.x
        const y = contextMatrix.b * selected.x + contextMatrix.d * selected.y + contextMatrix.f - bounds.y
        setContextAnchor({ visible: x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height,
          x, y, width: bounds.width, height: bounds.height })
      } else setContextAnchor({ visible: false })
      const started = performance.now()
      // Inline fonts/offsets have reached the SVG before this layout effect.
      const matrix = svg?.getScreenCTM?.(), rect = svg?.getBoundingClientRect?.()
      const width = rect?.width || MAP_W * screenScale, height = rect?.height || MAP_H * screenScale
      const projected = geometry.markers.map(marker => {
        let box
        try { box = labelRefs.current.get(marker.id)?.getBBox() } catch { /* fallback bounds */ }
        return {
          ...marker, svgX: marker.x, svgY: marker.y,
          x: matrix && rect ? matrix.a * marker.x + matrix.c * marker.y + matrix.e - rect.left : marker.x * screenScale,
          y: matrix && rect ? matrix.b * marker.x + matrix.d * marker.y + matrix.f - rect.top : marker.y * screenScale,
          labelWidth: box ? (box.width + 4) * screenScale : undefined,
          labelHeight: box ? (box.height + 4) * screenScale : undefined,
          visible: true,
        }
      })
      const display = createDisplayPresentation(projected, { width, height, relationships, selectedKeys, radiusPx: 64 })
      const admitted = new Set(display.layout.singles.map(marker => marker.id))
      const next = atlasLabelLayout(geometry.markers.filter(marker => admitted.has(marker.id)), {
        width: MAP_W, height: MAP_H, screenScale,
        reservedBoxes: display.layout.clusters.map(group => ({
          left: group.anchor.svgX - 22 / screenScale, right: group.anchor.svgX + 22 / screenScale,
          top: group.anchor.svgY - 22 / screenScale, bottom: group.anchor.svgY + 22 / screenScale,
        })),
        measureBounds: (marker, mode) => (mode === 'main' ? mainLabelRefs : labelRefs)
          .current.get(atlasMarkerId(marker))?.getBBox(),
      })
      display.labels = next.labels
      // Atlas uses separately measured two-line SVG labels. Relationship types
      // remain inspectable in the exact-edge panel rather than overlap them.
      display.relationshipLabels = new Set()
      const elapsed = Math.max(0, performance.now() - started)
      atlasTiming.current.passes += 1
      atlasTiming.current.lastMs = elapsed
      atlasTiming.current.maxMs = Math.max(atlasTiming.current.maxMs, elapsed)
      display.timing = { ...atlasTiming.current }
      setPresentation(current => displayPresentationSignature(current) === displayPresentationSignature(display) ? current : display)
      onDisplayLayout?.(display)
      const same = (a, b) => a.size === b.size && [...a].every(id => b.has(id))
      setLabelLayout(current => same(current.labels, next.labels) && same(current.details, next.details) ? current : next)
    }
    update()
    const view = svg?.ownerDocument?.defaultView
    const fonts = svg?.ownerDocument?.fonts
    const observer = view?.ResizeObserver ? new view.ResizeObserver(update) : null
    if (svg) observer?.observe(svg)
    if (!observer) view?.addEventListener('resize', update)
    fonts?.addEventListener?.('loadingdone', update)
    void fonts?.ready?.then(() => { if (!disposed) update() }).catch(() => {})
    return () => {
      disposed = true
      observer?.disconnect()
      if (!observer) view?.removeEventListener('resize', update)
      fonts?.removeEventListener?.('loadingdone', update)
    }
  }, [geometry.markers, screenScale, relationships, selectedKeys, onDisplayLayout])

  return (
    <div
      className="wv-map wv-map-fallback"
      role="group"
      aria-label="Spatial projection map. Only display_geometry from the live view is drawn."
      data-map-stack={FALLBACK_MAP_STACK_ID}
    >
      <div className="wv-atlas-stage">
      <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="wv-map-svg">
        {geometry.spherePath && <path className="wv-map-sea" d={geometry.spherePath} />}
        {geometry.graticulePath && <path className="wv-graticule" d={geometry.graticulePath} />}
        {geometry.landPath && <path className="wv-map-land" d={geometry.landPath} />}
        {geometry.bordersPath && <path className="wv-map-borders" d={geometry.bordersPath} />}
        {geometry.markers.map((marker) => {
          const id = atlasMarkerId(marker)
          const text = atlasLabelText(marker)
          const drawn = presentation?.layout.singles.some(single => single.id === id) === true
          return (
            <g
              key={id}
              className={`wv-feature${marker.selected ? ' is-selected' : ''}`}
              role="button"
              aria-label={text.accessibleName}
              tabIndex={drawn ? 0 : -1}
              aria-hidden={!drawn}
              style={{ visibility: drawn ? 'visible' : 'hidden', pointerEvents: drawn ? 'auto' : 'none' }}
              onClick={drawn ? event => activateAtlasMarker(event, marker.row, onSelectRow) : undefined}
              onKeyDown={drawn ? event => activateAtlasMarker(event, marker.row, onSelectRow) : undefined}
            >
              <circle className="wv-atlas-hit-target" cx={marker.x} cy={marker.y} r={metrics.hitRadius}
                fill="transparent" stroke="none" pointerEvents={drawn ? 'all' : 'none'} aria-hidden="true" />
              <circle className="wv-atlas-point" cx={marker.x} cy={marker.y} r={metrics.pointRadius}
                style={{ strokeWidth: metrics.pointStrokeWidth }} aria-hidden="true" />
              <g
                ref={element => {
                  if (element) labelRefs.current.set(id, element)
                  else labelRefs.current.delete(id)
                }}
                className="wv-atlas-labels"
                visibility={labelLayout.labels.has(id) ? 'visible' : 'hidden'}
                aria-hidden="true"
              >
                <text
                  ref={element => {
                    if (element) mainLabelRefs.current.set(id, element)
                    else mainLabelRefs.current.delete(id)
                  }}
                  className="wv-map-label" x={marker.x + metrics.labelOffsetX} y={marker.y + metrics.labelOffsetY}
                  style={{ fontSize: metrics.sansFontSize, strokeWidth: metrics.strokeWidth }}
                >
                  {text.label}
                </text>
                {text.detail && (
                  <text className="wv-map-coords num"
                    x={marker.x + metrics.labelOffsetX} y={marker.y + metrics.detailOffsetY}
                    visibility={labelLayout.details.has(id) ? 'inherit' : 'hidden'}
                    style={{ fontSize: metrics.monoFontSize, strokeWidth: metrics.strokeWidth }}
                  >
                    {text.detail}
                  </text>
                )}
              </g>
            </g>
          )
        })}
      </svg>
      {contextOverlay?.(contextAnchor)}
      <WorldViewDisplayOverlay presentation={presentation} onInspectCluster={onInspectCluster} />
      </div>
      {features.length === 0 && (
        <div className="wv-map-empty">
          <p>{emptyMessage}</p>
          <p className="wv-map-empty-sub">No map pins are fabricated.</p>
        </div>
      )}
      <p className="wv-map-attrib">{attribution}</p>
    </div>
  )
}

export default function WorldMapCanvas({ cameraMemory, rows, selectedKeys, onSelectRow, emptyMessage, recordedTimeInstant, visualFidelity,
  onVisualFidelityCapabilities, cameraControlsRef, onSourceStatus, contextOverlay, explorationActive = false, relationships = EMPTY_RELATIONSHIPS, onRelationshipDisplay, billboardEnabled = false }) {
  const [presentation, setPresentation] = useState(null)
  const [inspectedClusterId, setInspectedClusterId] = useState(null)
  const [inspectionRevision, setInspectionRevision] = useState(0)
  const presentationRef = useRef(null)
  const currentRows = useRef(rows)
  currentRows.current = rows
  const pickRef = useRef(onSelectRow)
  pickRef.current = onSelectRow
  const relationshipCallback = useRef(onRelationshipDisplay)
  relationshipCallback.current = onRelationshipDisplay
  const displayPublication = useRef(null)
  const cancelDisplayPublication = useCallback(() => {
    const pending = displayPublication.current
    displayPublication.current = null
    if (pending) pending.view.cancelAnimationFrame?.(pending.frame)
  }, [])
  const receiveDisplayLayout = useCallback(next => {
    // Picks and probes must always read the current canonical presentation.
    presentationRef.current = next
    if (!next) {
      cancelDisplayPublication()
      setPresentation(null)
      relationshipCallback.current?.(null)
      return
    }
    const view = hostRef.current?.ownerDocument?.defaultView
      ?? (typeof window === 'undefined' ? null : window)
    if (!view?.requestAnimationFrame) {
      setPresentation(next)
      relationshipCallback.current?.(next.relationshipSummary ?? null)
      return
    }
    if (displayPublication.current) return
    const pending = { view, frame: null }
    displayPublication.current = pending
    // MapLibre can notify synchronously from its native ResizeObserver. Commit
    // document-flow UI after that delivery, once for the latest presentation.
    pending.frame = view.requestAnimationFrame(() => {
      if (displayPublication.current !== pending) return
      displayPublication.current = null
      const current = presentationRef.current
      setPresentation(current)
      relationshipCallback.current?.(current?.relationshipSummary ?? null)
    })
  }, [cancelDisplayPublication])
  useEffect(() => cancelDisplayPublication, [cancelDisplayPublication])
  const selectCurrentRow = useCallback(row => {
    const current = adapterRef.current?.getDisplayLayout?.() ?? presentationRef.current
    if (isCurrentSingletonRow(current?.layout, row, currentRows.current)) pickRef.current?.(row)
  }, [])
  const localMemoryRef = useRef(null)
  if (!localMemoryRef.current) localMemoryRef.current = createCameraMemory()
  const memory = cameraMemory ?? localMemoryRef.current
  const hostRef = useRef(null)
  const fidelityRef = useRef(visualFidelity)
  fidelityRef.current = visualFidelity
  const fidelityCapabilitiesCallback = useRef(onVisualFidelityCapabilities)
  fidelityCapabilitiesCallback.current = onVisualFidelityCapabilities

  const framingRef = useRef(null)
  if (!framingRef.current) framingRef.current = createCameraFraming()
  const adapterRef = useRef(null)
  const [stackId, setStackId] = useState(() => memory.getStackId() ?? DEFAULT_MAP_STACK_ID)
  const [terrainStatus, setTerrainStatus] = useState(null)
  const [rendererReady, setRendererReady] = useState(false)
  const [imageryStatus, setImageryStatus] = useState(null)
  const [contextAnchor, setContextAnchor] = useState({ visible: false })
  const [bookmarkDisclosure, setBookmarkDisclosure] = useState(null)
  const usageRef = useRef(null)
  if (!usageRef.current) usageRef.current = createWorldViewUsage()
  const stack = mapStackById(stackId)
  const features = useMemo(() => projectionMarkerRecords(rows, selectedKeys), [rows, selectedKeys])
  const first = features.find((feature) => feature.selected)
  const coordinate = first?.positions?.[0] ?? null
  // Rows load asynchronously: the adapter effect below runs once per stack,
  // so live getters must read through a ref that follows the latest render.
  // A plain closure over `first` is frozen at mount time (undefined before
  // rows arrive) and silently drops the ~5 km ceiling floor on camera-state
  // restores — found in the Stage C live walk (50 m restore accepted).
  const firstRef = useRef(first)
  firstRef.current = first

  useEffect(() => {
    if (stackId === FALLBACK_MAP_STACK_ID) return undefined
    let cancelled = false
    setRendererReady(false)
    setTerrainStatus(null)
    setImageryStatus(null)
    setContextAnchor({ visible: false })
    receiveDisplayLayout(null)
    setInspectedClusterId(null)
    adapterRef.current?.destroy?.()
    framingRef.current.resetRenderer()
    const adapter = createWorldViewRendererAdapter({
      stackId,
      getHostEl: () => hostRef.current,
      coordinate,
      precisionClass: first?.row?.precision_class,
      getPrecisionClass: () => firstRef.current?.row?.precision_class,
      getSelectedKeys: () => selectedKeys,
      onSelectRow: selectCurrentRow, billboardEnabled,
      relationships, onDisplayLayout: next => {
        if (!cancelled && adapterRef.current === adapter) receiveDisplayLayout(next)
      },
      onStackIdChange: (next) => {
        if (cancelled) return
        memory.remember(adapter.getCameraState?.(), framingRef.current.getFramedKey(), stackId)
        setStackId(next)
      },
      onTerrainStatusChange: (next) => {
        if (cancelled) return
        setTerrainStatus(next)
      },
      onSourceStatusChange: next => { if (!cancelled) setImageryStatus(next) },
      onSelectedAnchorChange: next => { if (!cancelled) setContextAnchor(next) },
      initialFeatures: features,
      recordedTimeInstant,
      isCancelled: () => cancelled,
    })
    adapterRef.current = adapter
    adapter.setActivityState?.(document.hidden ? 'hidden' : 'visible-idle')
    void adapter.mount().then(() => {
      if (cancelled || adapterRef.current !== adapter) return
      // Startup restores retained effects before resolving. Publish their current
      // capability metadata and readiness in one committed UI update, so the
      // controls cannot lag an already enabled renderer until a passive effect.
      flushSync(() => {
        fidelityCapabilitiesCallback.current?.(
          adapter.getVisualFidelityCapabilities?.() ?? visualFidelityCapabilities(),
        )
        if (!cancelled && adapterRef.current === adapter) setRendererReady(true)
      })
      if (cancelled || adapterRef.current !== adapter) return
      const framing = framingRef.current
      if (memory.restore(adapter, framing.getTargetKey(), stackId)) framing.acceptRestoredView()
      else if (!framing.apply(adapter) && framing.getTargetKey() === null) adapter.setCameraState?.(northAmericaCameraState())
    })
    return () => {
      memory.remember(adapter.getCameraState?.(), framingRef.current.getFramedKey(), stackId)
      cancelled = true
      adapter.destroy()
      adapterRef.current = null
      cancelDisplayPublication()
      presentationRef.current = null
    }
    // Reboot only when the stack changes. Layer updates happen in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackId])

  // Application-owned camera seam, separate from the acceptance-only probes.
  useEffect(() => {
    if (!cameraControlsRef) return undefined
    const controls = {
      getCameraState: () => adapterRef.current?.getCameraState?.() ?? null,
      setCameraState: value => adapterRef.current?.setCameraState?.(value) ?? false,
      cancelCameraFlight: () => adapterRef.current?.cancelCameraFlight?.() ?? false,
    }
    cameraControlsRef.current = controls
    return () => { if (cameraControlsRef.current === controls) cameraControlsRef.current = null }
  }, [cameraControlsRef])

  useEffect(() => {
    if (usageRef.current.snapshot().state === 'disposed') usageRef.current = createWorldViewUsage()
    const usage = usageRef.current
    const doc = hostRef.current?.ownerDocument ?? (typeof document === 'undefined' ? null : document)
    if (!doc) return
    const update = () => {
      const state = doc.hidden ? 'hidden' : explorationActive ? 'visible-active' : 'visible-idle'
      usage.transition(state)
      adapterRef.current?.setActivityState?.(state)
    }
    update()
    doc.addEventListener?.('visibilitychange', update)
    return () => doc.removeEventListener?.('visibilitychange', update)
  }, [explorationActive, stackId, rendererReady])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let observer
    try {
      observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const observation = worldViewResourceObservation(entry)
          if (observation) usageRef.current.observeRequest(observation)
        }
      })
      observer.observe({ type: 'resource' })
    } catch { /* unavailable timing remains unobserved */ }
    const probe = { snapshot: () => usageRef.current.snapshot(),
      device: () => ({ deviceMemoryGb: navigator.deviceMemory ?? null,
        networkClass: navigator.connection?.effectiveType ?? null,
        javascriptHeapBytes: performance.memory?.usedJSHeapSize ?? null,
        evidenceLayer: 'browser-observation', highCostProviderActive: false }) }
    window.__MIP_WORLD_VIEW_USAGE_PROBE__ = probe
    return () => {
      observer?.disconnect()
      usageRef.current.transition('disposed')
      if (window.__MIP_WORLD_VIEW_USAGE_PROBE__ === probe) delete window.__MIP_WORLD_VIEW_USAGE_PROBE__
    }
  }, [])

  const sourceStatus = useMemo(() => resolveWorldViewSourceStatus({ stackId,
    rendererReady: stackId === FALLBACK_MAP_STACK_ID || rendererReady, terrainStatus,
    requestedProfile: visualFidelity, imageryStatus }), [stackId, rendererReady, terrainStatus, visualFidelity, imageryStatus])
  useEffect(() => { onSourceStatus?.(sourceStatus) }, [sourceStatus, onSourceStatus])
  const pilotBookmarks = createWorldViewPilotBookmarks({ coordinate, precisionClass: first?.row?.precision_class })

  useEffect(() => {
    const adapter = adapterRef.current
    if (!adapter || stackId === FALLBACK_MAP_STACK_ID) return undefined
    adapter.setOnSelectRow?.(selectCurrentRow)
    void adapter.setFeatures(features, selectedKeys)
  }, [features, selectCurrentRow, selectedKeys, stackId])

  useEffect(() => {
    const adapter = adapterRef.current
    framingRef.current.select(features)
    if (!adapter || stackId === FALLBACK_MAP_STACK_ID) return
    framingRef.current.apply(adapter)
  }, [features, stackId])

  useEffect(() => {
    adapterRef.current?.setRelationships?.(relationships)
  }, [relationships, stackId, rendererReady])

  const currentPresentation = () => adapterRef.current?.getDisplayLayout?.() ?? presentationRef.current
  const inspectCluster = id => {
    const current = currentPresentation()
    if (!current?.layout.clusters.some(cluster => cluster.id === id)) return
    setInspectedClusterId(id)
    setInspectionRevision(current => current + 1)
  }
  const chooseClusterMember = (id, rowKey) => {
    const current = currentPresentation()
    const row = resolveCurrentClusterMember(current?.layout, id, rowKey)
    // An explicit member choice is allowed after group inspection; direct
    // marker activation is restricted to the currently visible singletons.
    if (row && currentRows.current?.includes(row)) pickRef.current?.(row)
  }
  const chooseSingle = rowKey => {
    const current = currentPresentation()
    const marker = current?.layout.singles.find(item => projectionRowDisplayKey(item.row) === rowKey)
    selectCurrentRow(marker?.row)
  }

  // Reapply current preferences after startup/remount and after terrain degradation.
  // Capability updates contain metadata only, never renderer objects.
  useEffect(() => {
    const adapter = adapterRef.current
    adapter?.setRecordedTimeInstant?.(recordedTimeInstant)
    adapter?.setVisualFidelityProfile?.(visualFidelity)
    onVisualFidelityCapabilities?.(
      stackId === FALLBACK_MAP_STACK_ID ? visualFidelityCapabilities({ reason: 'Effects unavailable on the overview map.' })
        : adapter?.getVisualFidelityCapabilities?.() ?? visualFidelityCapabilities(),
    )
  }, [recordedTimeInstant, visualFidelity, stackId, rendererReady, terrainStatus, onVisualFidelityCapabilities])

  const reliefShadingOn = resolveVisualFidelityProfile(visualFidelity,
    rendererReady ? adapterRef.current?.getVisualFidelityCapabilities?.() : visualFidelityCapabilities()).reliefShading

  // Stage C acceptance probe (DISPLAY-only): exposes the renderer-neutral
  // camera-state contract of the active adapter so the live acceptance walk
  // can serialize/restore the camera. Application code never reads this
  // handle; camera state is never written to Investigation Context or the
  // hash/deep-link route.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const clusterProbe = {
      getState: () => displayPresentationProbe(presentationRef.current,
        stackId === FALLBACK_MAP_STACK_ID ? 'atlas-fallback' : adapterRef.current?.getRendererKind?.() ?? 'unavailable',
        adapterRef.current?.getDisplayTiming?.() ?? presentationRef.current?.timing ?? {}),
    }
    window.__MIP_WORLD_VIEW_CLUSTER_PROBE__ = clusterProbe
    const probe = {
      getCameraState: () => adapterRef.current?.getCameraState?.() ?? null,
      setCameraState: (serialized) => adapterRef.current?.setCameraState?.(serialized) ?? false,
    }
    window.__MIP_WORLD_VIEW_CAMERA_PROBE__ = probe
    // Stage D acceptance probe (DISPLAY-only): terrain status + sampled
    // display heights for the live walk. Never read by application code;
    // sampled terrain values are never written to canonical state.
    const terrainProbe = {
      getTerrainStatus: () => adapterRef.current?.getTerrainStatus?.() ?? null,
      sampleTerrainHeights: (pairs, level) =>
        adapterRef.current?.sampleTerrainHeights?.(pairs, level) ?? null,
      setReliefShadingEnabled: (enabled) =>
        adapterRef.current?.setReliefShadingEnabled?.(enabled) ?? false,
      getReliefShadingEnabled: () => adapterRef.current?.getReliefShadingEnabled?.() ?? false,
    }
    window.__MIP_WORLD_VIEW_TERRAIN_PROBE__ = terrainProbe
    const fidelityProbe = {
      getRenderState: () => adapterRef.current?.getVisualFidelityRenderState?.() ?? null,
      getProfile: () => JSON.parse(JSON.stringify(fidelityRef.current)),
      getCapabilities: () => adapterRef.current?.getVisualFidelityCapabilities?.() ?? visualFidelityCapabilities(),
    }
    window.__MIP_WORLD_VIEW_FIDELITY_PROBE__ = fidelityProbe
    return () => {
      if (window.__MIP_WORLD_VIEW_CLUSTER_PROBE__ === clusterProbe) delete window.__MIP_WORLD_VIEW_CLUSTER_PROBE__
      if (window.__MIP_WORLD_VIEW_FIDELITY_PROBE__ === fidelityProbe) delete window.__MIP_WORLD_VIEW_FIDELITY_PROBE__
      if (window.__MIP_WORLD_VIEW_CAMERA_PROBE__ === probe) {
        delete window.__MIP_WORLD_VIEW_CAMERA_PROBE__
      }
      if (window.__MIP_WORLD_VIEW_TERRAIN_PROBE__ === terrainProbe) {
        delete window.__MIP_WORLD_VIEW_TERRAIN_PROBE__
      }
    }
  }, [stackId])

  if (stackId === FALLBACK_MAP_STACK_ID) {
    return (
      <div className="wv-map-panel">
      <AtlasFallbackMap
        rows={rows}
        selectedKeys={selectedKeys}
        onSelectRow={selectCurrentRow}
        emptyMessage={emptyMessage}
        attribution={stack.attribution}
        contextOverlay={contextOverlay}
        relationships={relationships}
        onDisplayLayout={receiveDisplayLayout}
        onInspectCluster={inspectCluster}
      />
      <WorldViewSpatialGroupPanel presentation={presentation} inspectedClusterId={inspectedClusterId} inspectionRevision={inspectionRevision}
        onInspectCluster={inspectCluster} onSelectMember={chooseClusterMember} onSelectSingle={chooseSingle} />
      </div>
    )
  }

  return (
    <div className="wv-map-panel">
      <div className="wv-camera-controls" role="group" aria-label="Map navigation">
        <button type="button" disabled={!rendererReady}
          onClick={() => adapterRef.current?.setCameraState?.(northAmericaCameraState())}>
          North America overview
        </button>
        <details className="wv-pilot-bookmarks">
          <summary>Pilot camera bookmarks</summary>
          <div role="group" aria-label="Pilot camera bookmarks">
            {pilotBookmarks.map(bookmark => <button type="button" key={bookmark.id} disabled={!rendererReady}
              onClick={() => {
                if (adapterRef.current?.setCameraState?.(bookmark.cameraState)) {
                  usageRef.current.explore(); setBookmarkDisclosure(bookmark.disclosure)
                }
              }}>{bookmark.label}</button>)}
          </div>
          {bookmarkDisclosure && <p className="wv-meta" role="status">{bookmarkDisclosure}</p>}
        </details>
        <button type="button" disabled={!rendererReady}
          onClick={() => adapterRef.current?.cancelCameraFlight?.()}>
          Stop camera flight
        </button>
        <button
          type="button"
          disabled={!first || !rendererReady}
          onClick={() => framingRef.current.apply(adapterRef.current, { force: true })}
        >
          Return to selected location
        </button>
      </div>
    <div className="wv-map wv-map-gl" data-map-stack={stackId}>
      <div ref={hostRef} className="wv-map-host" />
      {contextOverlay?.(contextAnchor)}
      <WorldViewDisplayOverlay presentation={presentation} onInspectCluster={inspectCluster} />
      {features.length === 0 && (
        <div className="wv-map-empty">
          <p>{emptyMessage}</p>
          <p className="wv-map-empty-sub">No map pins are fabricated.</p>
        </div>
      )}
      {stackId === ELLIPSOID_GLOBE_STACK_ID && (
        <p className="wv-map-attrib wv-map-relief-toggle">
          {reliefShadingOn ? TERRAIN_RELIEF_LEGEND_TEXT : 'Terrain relief shading off'}
        </p>
      )}
    </div>
      <WorldViewSpatialGroupPanel presentation={presentation} inspectedClusterId={inspectedClusterId} inspectionRevision={inspectionRevision}
        onInspectCluster={inspectCluster} onSelectMember={chooseClusterMember} onSelectSingle={chooseSingle} />
      {stackId === ELLIPSOID_GLOBE_STACK_ID && (
        <p className="wv-terrain-disclosure" data-terrain-status={terrainStatus?.status ?? 'idle'}>
          {TERRAIN_DISCLOSURE_TEXT}
          {terrainStatus?.status === 'unavailable' ? ` — ${TERRAIN_UNAVAILABLE_TEXT}` : ''}
        </p>
      )}
    </div>
  )
}
