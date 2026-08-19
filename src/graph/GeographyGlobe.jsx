import { useMemo, useRef, useState } from 'react'
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'

const DEFAULT_ROTATION = Object.freeze([98, -39])
const PANEL_SIZE = 350
const OVERLAY_SIZE = 190

const worldObjects = worldAtlas.objects ?? {}
const LAND = worldObjects.land ? feature(worldAtlas, worldObjects.land) : null
const BORDERS = worldObjects.countries
  ? mesh(worldAtlas, worldObjects.countries, (a, b) => a !== b)
  : null

function clampLatitude(value) {
  return Math.max(-72, Math.min(72, value))
}

function placeKey(row) {
  return row.placeId ?? `${row.place ?? 'location'}:${row.longitude}:${row.latitude}`
}

function groupedLocations(locations) {
  const byPlace = new Map()
  for (const row of locations ?? []) {
    if (!Number.isFinite(Number(row.longitude)) || !Number.isFinite(Number(row.latitude))) continue
    const key = placeKey(row)
    if (!byPlace.has(key)) {
      byPlace.set(key, {
        ...row,
        nodeKeys: new Set(),
        mentionCount: 0,
      })
    }
    const current = byPlace.get(key)
    current.mentionCount += 1
    if (row.key) current.nodeKeys.add(row.key)
  }
  return [...byPlace.values()].map((row) => ({
    ...row,
    nodeKeys: [...row.nodeKeys],
  }))
}

function markerSize(mentionCount) {
  // Marker size represents only the number of confirmed location mentions
  // collapsed at the same displayed city—not event size, importance, or
  // reliability. The minimum keeps single records reachable by touch.
  return 4.6 + Math.min(4.5, Math.sqrt(Math.max(1, mentionCount)) * 1.6)
}

export default function GeographyGlobe({ locations, onSelectNode, variant = 'panel' }) {
  const size = variant === 'overlay' ? OVERLAY_SIZE : PANEL_SIZE
  const [rotation, setRotation] = useState(DEFAULT_ROTATION)
  const [activePlace, setActivePlace] = useState(null)
  const dragRef = useRef(null)
  const movedRef = useRef(false)
  const markerGroups = useMemo(() => groupedLocations(locations), [locations])

  const geometry = useMemo(() => {
    const projection = geoOrthographic()
      .translate([size / 2, size / 2])
      .scale(size * 0.45)
      .rotate(rotation)
      .clipAngle(90)
      .precision(0.25)
    const path = geoPath(projection)
    const center = projection.invert([size / 2, size / 2])
    const markers = markerGroups
      .map((row) => {
        const coordinate = [Number(row.longitude), Number(row.latitude)]
        const point = projection(coordinate)
        const visible = center && geoDistance(center, coordinate) < Math.PI / 2 - 0.012
        if (!point || !visible) return null
        return { ...row, x: point[0], y: point[1], radius: markerSize(row.mentionCount) }
      })
      .filter(Boolean)
    return {
      spherePath: path({ type: 'Sphere' }),
      landPath: LAND ? path(LAND) : null,
      bordersPath: BORDERS ? path(BORDERS) : null,
      graticulePath: path(geoGraticule10()),
      markers,
    }
  }, [markerGroups, rotation, size])

  const rotateBy = (longitudeDelta, latitudeDelta) => {
    setRotation(([longitude, latitude]) => [longitude + longitudeDelta, clampLatitude(latitude + latitudeDelta)])
  }

  const selectMarker = (marker) => {
    setActivePlace(placeKey(marker))
    const [firstNode] = marker.nodeKeys
    if (firstNode) onSelectNode?.(firstNode)
  }

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    movedRef.current = false
    dragRef.current = { x: event.clientX, y: event.clientY, rotation }
  }

  const onPointerMove = (event) => {
    const start = dragRef.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true
    setRotation([start.rotation[0] + dx * 0.48, clampLatitude(start.rotation[1] - dy * 0.34)])
  }

  const endPointer = (event) => {
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const onKeyDown = (event) => {
    const step = event.shiftKey ? 22 : 10
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      rotateBy(-step, 0)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      rotateBy(step, 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      rotateBy(0, step)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      rotateBy(0, -step)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setRotation(DEFAULT_ROTATION)
    }
  }

  const active = activePlace ? markerGroups.find((row) => placeKey(row) === activePlace) : null
  const visibleCount = geometry.markers.length
  const title = variant === 'overlay' ? 'Confirmed locations in this graph focus' : 'Confirmed city-level location representatives'
  const description = 'Interactive orthographic globe with public-domain Natural Earth land and country boundaries. Drag to rotate, use arrow keys to rotate when focused, and select a city marker to open its source-backed graph node.'

  return (
    <figure className={`geography-globe geography-globe-${variant}`} aria-labelledby={`geography-globe-caption-${variant}`}>
      <div className="geography-globe-head">
        <span className="geography-globe-kicker">{variant === 'overlay' ? 'Graph location overlay' : 'Confirmed location context'}</span>
        <button type="button" className="geography-globe-reset" onClick={() => setRotation(DEFAULT_ROTATION)}>
          Reset view
        </button>
      </div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="application"
        tabIndex={0}
        aria-label={title}
        aria-describedby={`geography-globe-caption-${variant}`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <title>{title}</title>
        <desc>{description}</desc>
        <path className="geography-globe-sphere" d={geometry.spherePath ?? undefined} />
        {geometry.landPath && <path className="geography-globe-land" d={geometry.landPath} />}
        {geometry.bordersPath && <path className="geography-globe-borders" d={geometry.bordersPath} />}
        <path className="geography-globe-graticule" d={geometry.graticulePath ?? undefined} />
        {geometry.markers.map((marker) => {
          const key = placeKey(marker)
          const isActive = key === activePlace
          const noun = marker.mentionCount === 1 ? 'confirmed mention' : 'confirmed mentions'
          return (
            <g
              key={key}
              className={`geography-globe-marker${isActive ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Open ${marker.label}, at ${marker.place}; ${marker.mentionCount} ${noun}; city-level representative point`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                if (!movedRef.current) selectMarker(marker)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  selectMarker(marker)
                }
              }}
            >
              <circle className="geography-globe-marker-halo" cx={marker.x} cy={marker.y} r={marker.radius + 5} />
              <circle className="geography-globe-marker-dot" cx={marker.x} cy={marker.y} r={marker.radius} />
              {variant !== 'overlay' && (
                <text className="geography-globe-marker-label" x={marker.x + marker.radius + 4} y={marker.y - marker.radius - 3}>
                  {marker.place.split(',')[0]}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption id={`geography-globe-caption-${variant}`}>
        {visibleCount} visible of {markerGroups.length} confirmed city-level representative {markerGroups.length === 1 ? 'point' : 'points'}. Drag or use arrow keys to rotate; markers open their documented graph node.
        {active && ` Selected: ${active.place} (${active.mentionCount} confirmed ${active.mentionCount === 1 ? 'mention' : 'mentions'}).`}
      </figcaption>
    </figure>
  )
}

export function confirmedLocationGroups(locations) {
  return groupedLocations(locations)
}
