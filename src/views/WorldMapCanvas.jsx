import { useEffect, useMemo, useRef, useState } from 'react'
import { geoMercator, geoPath, geoGraticule10 } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'
import {
  plotDecision,
  collectPositions,
  sourceNativeLocationLabel,
  displayCoordinateText,
  fitExtentGeometry,
} from '../lib/spatialProjection'
import {
  DEFAULT_MAP_STACK_ID,
  FALLBACK_MAP_STACK_ID,
  mapLibreStyleForStack,
  mapStackById,
  maxZoomForPrecisionClass,
  minZoom,
  nextMapStackOnFailure,
  subjectCamera,
  worldCamera,
  worldViewRenderMode,
} from '../lib/worldViewMapStack'
import { overlayAllowed } from '../lib/worldViewPrivacyLock'

const MAP_W = 960
const MAP_H = 480

const worldObjects = worldAtlas.objects ?? {}
const LAND = worldObjects.land ? feature(worldAtlas, worldObjects.land) : null
const BORDERS = worldObjects.countries
  ? mesh(worldAtlas, worldObjects.countries, (a, b) => a !== b)
  : null

function markerRecords(rows, selectedKeys) {
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

function AtlasFallbackMap({ rows, selectedKeys, onSelectRow, emptyMessage, attribution }) {
  const features = useMemo(() => markerRecords(rows, selectedKeys), [rows, selectedKeys])
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

function DeckProjectionLayers(deck, features, onSelectRow, selectedKeys) {
  const ScatterplotLayer = deck.ScatterplotLayer
  const TextLayer = deck.TextLayer
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

export default function WorldMapCanvas({ rows, selectedKeys, onSelectRow, emptyMessage }) {
  const hostRef = useRef(null)
  const mapRef = useRef(null)
  const overlayRef = useRef(null)
  const flewRef = useRef(false)
  const [stackId, setStackId] = useState(DEFAULT_MAP_STACK_ID)
  const stack = mapStackById(stackId)
  const features = useMemo(() => markerRecords(rows, selectedKeys), [rows, selectedKeys])
  const first = features[0]
  const coordinate = first?.positions?.[0] ?? null

  useEffect(() => {
    if (stackId === FALLBACK_MAP_STACK_ID) return undefined
    const host = hostRef.current
    if (!host) return undefined
    let cancelled = false
    let map
    let overlay
    let errorCount = 0

    async function boot() {
      let maplibregl
      let MapboxOverlay
      let ScatterplotLayer
      let TextLayer
      try {
        maplibregl = (await import('maplibre-gl')).default
        await import('maplibre-gl/dist/maplibre-gl.css')
        MapboxOverlay = (await import('@deck.gl/mapbox')).MapboxOverlay
        ScatterplotLayer = (await import('@deck.gl/layers')).ScatterplotLayer
        TextLayer = (await import('@deck.gl/layers')).TextLayer
      } catch {
        if (!cancelled) setStackId(FALLBACK_MAP_STACK_ID)
        return
      }
      if (cancelled || !hostRef.current) return
      void overlayAllowed
      void worldViewRenderMode()

      const start = worldCamera()
      const precision = first?.row?.precision_class
      try {
        map = new maplibregl.Map({
          container: hostRef.current,
          style: mapLibreStyleForStack(stackId),
          center: start.center,
          zoom: start.zoom,
          pitch: start.pitch,
          bearing: start.bearing,
          minZoom: minZoom(),
          maxZoom: maxZoomForPrecisionClass(precision),
          attributionControl: false,
          cooperativeGestures: false,
        })
      } catch {
        if (!cancelled) setStackId(nextMapStackOnFailure(stackId))
        return
      }

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left')
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')
      map.addControl(
        new maplibregl.AttributionControl({ compact: false, customAttribution: stack.attribution }),
        'bottom-right',
      )

      overlay = new MapboxOverlay({
        interleaved: true,
        layers: DeckProjectionLayers({ ScatterplotLayer, TextLayer }, features, onSelectRow, selectedKeys),
      })
      map.addControl(overlay)
      mapRef.current = map
      overlayRef.current = overlay

      const fail = () => {
        errorCount += 1
        if (errorCount < 2) return
        const next = nextMapStackOnFailure(stackId)
        if (!cancelled) setStackId(next)
      }
      map.on('error', fail)

      map.on('load', () => {
        if (cancelled) return
        const cam = subjectCamera(coordinate, precision)
        if (cam && !flewRef.current) {
          flewRef.current = true
          map.flyTo({
            center: cam.center,
            zoom: cam.zoom,
            pitch: cam.pitch,
            bearing: cam.bearing,
            duration: 1600,
            essential: true,
          })
        }
      })
    }

    boot()
    return () => {
      cancelled = true
      overlayRef.current = null
      mapRef.current = null
      try {
        overlay?.finalize?.()
      } catch {
        /* overlay already removed with the map */
      }
      try {
        map?.remove()
      } catch {
        /* already torn down */
      }
    }
    // Reboot only when the stack changes. Layer updates happen in the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackId])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || stackId === FALLBACK_MAP_STACK_ID) return
    let cancelled = false
    import('@deck.gl/layers').then(({ ScatterplotLayer, TextLayer }) => {
      if (cancelled) return
      overlay.setProps({
        layers: DeckProjectionLayers({ ScatterplotLayer, TextLayer }, features, onSelectRow, selectedKeys),
      })
    })
    return () => {
      cancelled = true
    }
  }, [features, onSelectRow, selectedKeys, stackId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || stackId === FALLBACK_MAP_STACK_ID || flewRef.current) return
    const cam = subjectCamera(coordinate, first?.row?.precision_class)
    if (!cam) return
    flewRef.current = true
    map.flyTo({
      center: cam.center,
      zoom: cam.zoom,
      pitch: cam.pitch,
      bearing: cam.bearing,
      duration: 1600,
      essential: true,
    })
  }, [coordinate, first, stackId])

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
    </div>
  )
}
