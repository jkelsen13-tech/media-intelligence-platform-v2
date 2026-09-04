import { useEffect, useMemo, useRef, useState } from 'react'
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
  TERRAIN_RELIEF_TOGGLE_LABEL,
  TERRAIN_UNAVAILABLE_TEXT,
  mapStackById,
} from '../lib/worldViewMapStack'
import { createWorldViewRendererAdapter, projectionMarkerRecords } from '../lib/worldViewRendererAdapter'

const MAP_W = 960
const MAP_H = 480

const worldObjects = worldAtlas.objects ?? {}
const LAND = worldObjects.land ? feature(worldAtlas, worldObjects.land) : null
const BORDERS = worldObjects.countries
  ? mesh(worldAtlas, worldObjects.countries, (a, b) => a !== b)
  : null

function AtlasFallbackMap({ rows, selectedKeys, onSelectRow, emptyMessage, attribution }) {
  const features = useMemo(() => projectionMarkerRecords(rows, selectedKeys), [rows, selectedKeys])
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
            return { ...f, i, x: point[0], y: point[1] }
          }),
        )
        .filter(Boolean),
    }
  }, [features])

  return (
    <div
      className="wv-map wv-map-fallback"
      role="img"
      aria-label="Spatial projection map. Only display_geometry from the live view is drawn."
      data-map-stack={FALLBACK_MAP_STACK_ID}
    >
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="wv-map-svg">
        {geometry.spherePath && <path className="wv-map-sea" d={geometry.spherePath} />}
        {geometry.graticulePath && <path className="wv-graticule" d={geometry.graticulePath} />}
        {geometry.landPath && <path className="wv-map-land" d={geometry.landPath} />}
        {geometry.bordersPath && <path className="wv-map-borders" d={geometry.bordersPath} />}
        {geometry.markers.map((marker) => {
          const id = `${marker.row.revision_id ?? marker.row.mip_object_id}-${marker.i}`
          return (
            <g
              key={id}
              className={`wv-feature${marker.selected ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectRow(marker.row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectRow(marker.row)
                }
              }}
            >
              <circle cx={marker.x} cy={marker.y} r={7} />
              <text className="wv-map-label" x={marker.x + 11} y={marker.y - 2}>
                {marker.label || marker.row.precision_class || 'projected location'}
              </text>
              {marker.coords && (
                <text className="wv-map-coords num" x={marker.x + 11} y={marker.y + 12}>
                  {marker.coords} · {marker.row.precision_class} · {marker.row.geometry_status}
                </text>
              )}
            </g>
          )
        })}
      </svg>
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

export default function WorldMapCanvas({ rows, selectedKeys, onSelectRow, emptyMessage }) {
  const hostRef = useRef(null)
  const flewRef = useRef(false)
  const adapterRef = useRef(null)
  const [stackId, setStackId] = useState(DEFAULT_MAP_STACK_ID)
  const [terrainStatus, setTerrainStatus] = useState(null)
  // Stage D visual-continuity repair: labeled relief shading toggle
  // (default ON — the repair exists because unshaded terrain is not
  // visually legible at the enforced city camera floor). DISPLAY-only.
  const [reliefShadingOn, setReliefShadingOn] = useState(true)
  const stack = mapStackById(stackId)
  const features = useMemo(() => projectionMarkerRecords(rows, selectedKeys), [rows, selectedKeys])
  const first = features[0]
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
    setTerrainStatus(null)
    adapterRef.current?.destroy?.()
    adapterRef.current = createWorldViewRendererAdapter({
      stackId,
      getHostEl: () => hostRef.current,
      coordinate,
      precisionClass: first?.row?.precision_class,
      getPrecisionClass: () => firstRef.current?.row?.precision_class,
      getSelectedKeys: () => selectedKeys,
      onSelectRow,
      onStackIdChange: (next) => {
        if (cancelled) return
        setStackId(next)
      },
      onTerrainStatusChange: (next) => {
        if (cancelled) return
        setTerrainStatus(next)
      },
      shouldFlyTo: () => !flewRef.current,
      markFlew: () => {
        flewRef.current = true
      },
      initialFeatures: features,
      isCancelled: () => cancelled,
    })
    void adapterRef.current.mount()
    return () => {
      cancelled = true
      adapterRef.current?.destroy?.()
      adapterRef.current = null
    }
    // Reboot only when the stack changes. Layer updates happen in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackId])

  useEffect(() => {
    const adapter = adapterRef.current
    if (!adapter || stackId === FALLBACK_MAP_STACK_ID) return undefined
    adapter.setOnSelectRow?.(onSelectRow)
    void adapter.setFeatures(features, selectedKeys)
  }, [features, onSelectRow, selectedKeys, stackId])

  useEffect(() => {
    const adapter = adapterRef.current
    if (!adapter || stackId === FALLBACK_MAP_STACK_ID || flewRef.current) return
    const ok = adapter.flyToSubjectCamera({
      nextCoordinate: coordinate,
      nextPrecisionClass: first?.row?.precision_class,
    })
    if (ok) flewRef.current = true
  }, [coordinate, first, stackId])

  // Stage D visual-continuity repair: forward the relief-shading preference
  // to the active adapter. The globe adapter applies it to the globe
  // material only; the MapLibre fallback no-ops.
  useEffect(() => {
    if (stackId === FALLBACK_MAP_STACK_ID) return
    adapterRef.current?.setReliefShadingEnabled?.(reliefShadingOn)
  }, [reliefShadingOn, stackId])

  // Stage C acceptance probe (DISPLAY-only): exposes the renderer-neutral
  // camera-state contract of the active adapter so the live acceptance walk
  // can serialize/restore the camera. Application code never reads this
  // handle; camera state is never written to Investigation Context or the
  // hash/deep-link route.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
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
    return () => {
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
      <AtlasFallbackMap
        rows={rows}
        selectedKeys={selectedKeys}
        onSelectRow={onSelectRow}
        emptyMessage={emptyMessage}
        attribution={stack.attribution}
      />
    )
  }

  return (
    <div className="wv-map wv-map-gl" data-map-stack={stackId}>
      <div ref={hostRef} className="wv-map-host" />
      {features.length === 0 && (
        <div className="wv-map-empty">
          <p>{emptyMessage}</p>
          <p className="wv-map-empty-sub">No map pins are fabricated.</p>
        </div>
      )}
      {stackId === ELLIPSOID_GLOBE_STACK_ID && (
        <p className="wv-map-attrib" data-terrain-status={terrainStatus?.status ?? 'idle'}>
          {TERRAIN_DISCLOSURE_TEXT}
          {terrainStatus?.status === 'unavailable' ? ` — ${TERRAIN_UNAVAILABLE_TEXT}` : ''}
        </p>
      )}
      {stackId === ELLIPSOID_GLOBE_STACK_ID && (
        <p className="wv-map-attrib wv-map-relief-toggle">
          <label>
            <input
              type="checkbox"
              checked={reliefShadingOn}
              onChange={(e) => setReliefShadingOn(e.target.checked)}
            />
            {TERRAIN_RELIEF_TOGGLE_LABEL}
          </label>
          {reliefShadingOn ? ` — ${TERRAIN_RELIEF_LEGEND_TEXT}` : ''}
        </p>
      )}
    </div>
  )
}
