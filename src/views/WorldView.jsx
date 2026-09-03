import { useEffect, useMemo, useRef, useState } from 'react'
import { geoMercator, geoPath, geoGraticule10 } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'
import GraphView from '../graph/GraphView'
import TrustFooter from '../components/TrustFooter'
import {
  loadSpatialProjection,
  loadWorldViewGraph,
  liveGraphNodes,
  plotDecision,
  collectPositions,
  recordedTimestampsForRows,
  revisionAtTime,
  revisionCoverageAt,
  rowsMatchingSelection,
  graphNodeMatchingProjection,
  selectionStubFromProjection,
  labeledG2Dimensions,
  confidenceTextDimension,
  normalizeEvidenceRefs,
  inspectorAvailability,
  weatherPanelState,
  mayShowLocation,
  defaultStampIndex,
  autoSelectRow,
  graphSelectionId,
  sourceNativeTimeFields,
  sourceNativeLocationLabel,
  displayCoordinateText,
  inspectorTitle,
  fitExtentGeometry,
  spatialProjectionUnavailableCopy,
} from '../lib/spatialProjection'
import './worldview.css'

const MODES = [
  { key: 'map', label: 'Map' },
  { key: 'graph', label: 'Graph' },
  { key: 'split', label: 'Split' },
]

const MAP_W = 960
const MAP_H = 480

const worldObjects = worldAtlas.objects ?? {}
const LAND = worldObjects.land ? feature(worldAtlas, worldObjects.land) : null
const BORDERS = worldObjects.countries
  ? mesh(worldAtlas, worldObjects.countries, (a, b) => a !== b)
  : null

function formatWhen(iso) {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return String(iso)
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

function Field({ label, value, empty = 'Unavailable' }) {
  const present = value != null && String(value).trim() !== ''
  return (
    <div className="wv-field">
      <dt>{label}</dt>
      <dd className={present ? undefined : 'wv-empty'}>{present ? String(value) : empty}</dd>
    </div>
  )
}

function WorldMapCanvas({ rows, selectedKeys, onSelectRow, emptyMessage }) {
  const features = useMemo(() => {
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
  }, [rows, selectedKeys])

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
      markers: features.flatMap((f) =>
        f.positions.map((coordinate, i) => {
          const point = projection(coordinate)
          if (!point) return null
          return { ...f, i, x: point[0], y: point[1] }
        }),
      ).filter(Boolean),
    }
  }, [features])

  return (
    <div className="wv-map" role="img" aria-label="Spatial projection map. Only display_geometry from the live view is drawn.">
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
    </div>
  )
}

function WeatherPanel() {
  const weather = weatherPanelState()
  return (
    <section className="wv-weather" aria-label="Weather">
      <header className="wv-section-head">
        <h3>Weather</h3>
        <span className="wv-pill wv-pill-empty">Unavailable</span>
      </header>
      <p className="wv-weather-copy">{weather.copy}</p>
      <dl className="wv-weather-grid">
        <Field label="Temperature" value={null} />
        <Field label="Precipitation" value={null} />
        <Field label="Wind speed" value={null} />
        <Field label="Wind direction" value={null} />
        <Field label="Provider" value={weather.provenance.provider} />
        <Field label="Timestamp" value={weather.provenance.timestamp} />
        <Field label="Resolution" value={weather.provenance.resolution} />
        <Field
          label="Observation type"
          value={weather.provenance.observationType}
          empty="Unavailable (observed / estimated / forecast / reanalysis not sourced)"
        />
      </dl>
    </section>
  )
}

function EventInspector({ loadStatus, selected, visibleRow, atMs }) {
  const coverage = visibleRow && Number.isFinite(atMs) ? revisionCoverageAt(visibleRow, atMs) : null
  const plot = visibleRow ? plotDecision(visibleRow) : { plot: false, reason: 'no_row', geometry: null }
  const availability = inspectorAvailability(visibleRow, { plot: plot.plot })
  const g2 = visibleRow ? labeledG2Dimensions(visibleRow) : []
  const confidence = visibleRow ? confidenceTextDimension(visibleRow) : null
  const refs = visibleRow ? normalizeEvidenceRefs(visibleRow.evidence_refs) : []
  const locationHidden = visibleRow && !mayShowLocation(visibleRow)

  let body
  if (loadStatus.status === 'unavailable') {
    body = (
      <p className="wv-empty-state">
        {spatialProjectionUnavailableCopy(loadStatus.reason, loadStatus.error)}
      </p>
    )
  } else if (loadStatus.status === 'empty') {
    body = (
      <p className="wv-empty-state">
        public.spatial_projection_v1 currently has no rows. World View stays empty until Spatial publishes a projection.
      </p>
    )
  } else if (!selected) {
    body = (
      <p className="wv-empty-state">No event selected. Choose a graph node or a projected location when one exists.</p>
    )
  } else if (!visibleRow) {
    body = (
      <p className="wv-empty-state">
        No spatial projection row matches this selection at the current recorded time. Historical state is not invented.
      </p>
    )
  } else if (coverage === 'time_not_recorded' && Number.isFinite(atMs)) {
    body = (
      <p className="wv-empty-state">
        This revision has no recorded valid-time bounds, so it is not attributed to the scrubbed instant.
      </p>
    )
  } else if (coverage === 'outside') {
    body = (
      <p className="wv-empty-state">No spatial state recorded at this time for the selected object.</p>
    )
  } else {
    const nativeFields = sourceNativeTimeFields(visibleRow.source_native_time)
    body = (
      <>
        {availability.state !== 'present' && (
          <p className={`wv-callout wv-callout-${availability.state}`}>{availability.label}</p>
        )}
        <h3 className="wv-inspector-title">{inspectorTitle(visibleRow, selected)}</h3>
        <dl className="wv-fields">
          <Field label="Display hint" value={visibleRow.display_hint} />
          <Field label="Object id" value={visibleRow.mip_object_id} />
          <Field label="Graph node" value={visibleRow.subject_graph_node_id} />
          <Field label="Object type" value={visibleRow.object_type} />
          <Field label="Spatial role" value={visibleRow.spatial_role} />
          <Field label="Relationship qualifier" value={visibleRow.relationship_qualifier} empty="No source relationship recorded" />
          <Field label="Valid from (UTC)" value={formatWhen(visibleRow.valid_from_utc)} />
          <Field label="Valid to (UTC)" value={formatWhen(visibleRow.valid_to_utc)} />
          <Field label="Valid-time precision" value={visibleRow.valid_time_precision} />
          <Field label="Precision class" value={visibleRow.precision_class} />
          <Field
            label="Location (display_geometry only)"
            value={
              locationHidden
                ? null
                : plot.plot
                  ? `${visibleRow.precision_class || 'unspecified'} · ${displayCoordinateText(plot.geometry)}`
                  : null
            }
            empty={locationHidden ? 'Precise location withheld (private person)' : 'Location unavailable'}
          />
          <Field label="Canonical place id" value={visibleRow.canonical_place_id} />
          <Field label="Geometry status" value={visibleRow.geometry_status} />
          <Field label="Review state" value={visibleRow.review_state} />
          <Field label="Release state" value={visibleRow.release_state} />
          <Field label="Review effective (UTC)" value={formatWhen(visibleRow.review_effective_at_utc)} />
          <Field label="Release effective (UTC)" value={formatWhen(visibleRow.release_effective_at_utc)} />
          <Field label="Uncertainty class" value={visibleRow.uncertainty_class} />
          <Field label="Uncertainty note" value={visibleRow.uncertainty_note} />
          <Field label="Confidence status" value={visibleRow.confidence_status} />
        </dl>

        {confidence && (
          <section className="wv-g2">
            <h4>Confidence (not a truth or bias score)</h4>
            <Field label={confidence.label} value={confidence.value} empty={confidence.unavailable} />
          </section>
        )}

        <section className="wv-g2">
          <h4>G2 dimensions (separate; never combined)</h4>
          <dl className="wv-fields">
            {g2.map((dim) => (
              <Field key={dim.key} label={dim.label} value={dim.value} empty={dim.unavailable} />
            ))}
          </dl>
        </section>

        <section className="wv-evidence">
          <h4>Source-native time (as recorded)</h4>
          {nativeFields.length === 0 ? (
            <p className="wv-empty">No source_native_time on this row.</p>
          ) : (
            <dl className="wv-fields">
              {nativeFields.map((f) =>
                f.key === 'source_url' && f.value ? (
                  <div className="wv-field" key={f.key}>
                    <dt>{f.key}</dt>
                    <dd>
                      <a href={f.value} target="_blank" rel="noreferrer">
                        {f.value}
                      </a>
                    </dd>
                  </div>
                ) : (
                  <Field key={f.key} label={f.key} value={f.value} />
                ),
              )}
            </dl>
          )}
        </section>

        <section className="wv-evidence">
          <h4>Evidence refs</h4>
          {refs.length === 0 ? (
            <p className="wv-empty">No evidence_refs on this row.</p>
          ) : (
            <ul>
              {refs.map((ref, i) => (
                <li key={i} className="num">
                  {typeof ref === 'string' ? ref : JSON.stringify(ref)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="wv-context">
          <h4>Tags / context</h4>
          <p className="wv-meta">
            Only fields present on the projection row are shown. No topical tags are inferred.
          </p>
          <ul className="wv-tags">
            {[visibleRow.object_type, visibleRow.spatial_role, visibleRow.precision_class, sourceNativeLocationLabel(visibleRow)]
              .filter((t) => t && String(t).trim())
              .map((t) => (
                <li key={t}>{t}</li>
              ))}
          </ul>
        </section>
      </>
    )
  }

  return (
    <aside className="wv-inspector" aria-label="Selected-event inspector">
      <header className="wv-section-head">
        <h2>Inspector</h2>
      </header>
      {body}
    </aside>
  )
}

function TimelineScrubber({ stamps, index, onChange, disabledReason }) {
  if (!stamps.length) {
    return (
      <section className="wv-scrubber" aria-label="Projection time">
        <header className="wv-section-head">
          <h3>Recorded time</h3>
        </header>
        <p className="wv-empty">{disabledReason}</p>
      </section>
    )
  }
  const current = stamps[index] ?? stamps[stamps.length - 1]
  return (
    <section className="wv-scrubber" aria-label="Projection time">
      <header className="wv-section-head">
        <h3>Recorded time</h3>
        <span className="wv-meta num">{current?.iso}</span>
      </header>
      <p className="wv-meta">
        Scrubber snaps to timestamps recorded on the projection. Intermediate history is not interpolated.
      </p>
      <input
        type="range"
        min={0}
        max={stamps.length - 1}
        step={1}
        value={Math.min(index, stamps.length - 1)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={current?.iso}
      />
      <p className="wv-meta">Source field: {current?.key}</p>
    </section>
  )
}

export default function WorldView({
  graph,
  graphError,
  selected,
  onSelectProjection,
  onSelectGraphNode,
}) {
  const [mode, setMode] = useState('map')
  const [loadStatus, setLoadStatus] = useState({
    status: 'loading',
    reason: null,
    rows: [],
    error: null,
    loadedAt: null,
  })
  const [worldGraph, setWorldGraph] = useState({
    status: 'loading',
    nodes: [],
    edges: [],
    edgesUnavailable: null,
    error: null,
    reason: null,
  })
  const [stampIndex, setStampIndex] = useState(0)
  const didAutoSelect = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadSpatialProjection().then((result) => {
      if (!cancelled) setLoadStatus(result)
    })
    loadWorldViewGraph().then((result) => {
      if (!cancelled) setWorldGraph(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const graphNodes = useMemo(() => {
    const live = liveGraphNodes(graph)
    return worldGraph.nodes.length > 0 ? worldGraph.nodes : live
  }, [graph, worldGraph.nodes])

  const selectedRows = useMemo(
    () => rowsMatchingSelection(loadStatus.rows, selected),
    [loadStatus.rows, selected],
  )
  const stamps = useMemo(() => recordedTimestampsForRows(selectedRows), [selectedRows])

  useEffect(() => {
    setStampIndex(defaultStampIndex(stamps, selectedRows))
  }, [stamps, selectedRows])

  useEffect(() => {
    if (loadStatus.status !== 'ok' || loadStatus.rows.length === 0) return
    const row = autoSelectRow(loadStatus.rows)
    if (!row) return
    const node = graphNodeMatchingProjection(graphNodes, row)
    if (!didAutoSelect.current) {
      didAutoSelect.current = true
      if (!selected) onSelectProjection(node ?? selectionStubFromProjection(row))
      return
    }
    if (selected?.fromSpatialProjection && node) {
      onSelectProjection(node)
    }
  }, [loadStatus, graphNodes, selected, onSelectProjection])

  const atMs = stamps[stampIndex]?.ms ?? null
  const visibleRow = Number.isFinite(atMs)
    ? revisionAtTime(selectedRows, atMs)
    : selectedRows.length
      ? [...selectedRows].sort((a, b) => (a.revision_ordinal ?? 0) - (b.revision_ordinal ?? 0)).at(-1)
      : null

  const mapRows = useMemo(() => {
    if (loadStatus.status !== 'ok') return []
    if (selected && selectedRows.length > 0) {
      return visibleRow ? [visibleRow] : []
    }
    return loadStatus.rows.filter((row) => plotDecision(row).plot)
  }, [loadStatus, selected, selectedRows, visibleRow])

  const selectedKeys = useMemo(() => {
    const keys = new Set()
    if (selected?.id) keys.add(String(selected.id))
    if (selected?.slug) keys.add(String(selected.slug))
    if (selected?.mip_object_id) keys.add(String(selected.mip_object_id))
    if (selected?.subject_graph_node_id) keys.add(String(selected.subject_graph_node_id))
    if (visibleRow?.mip_object_id) keys.add(String(visibleRow.mip_object_id))
    if (visibleRow?.subject_graph_node_id) keys.add(String(visibleRow.subject_graph_node_id))
    return keys
  }, [selected, visibleRow])

  const emptyMessage =
    loadStatus.status === 'unavailable'
      ? spatialProjectionUnavailableCopy(loadStatus.reason, loadStatus.error)
      : loadStatus.status === 'empty'
        ? 'No spatial projection rows. The map stays empty.'
        : selected && selectedRows.length === 0
          ? 'This selection has no spatial projection row.'
          : selected && !visibleRow
            ? 'No spatial state recorded at this time.'
            : 'No display_geometry available to plot.'

  const handleMapSelect = (row) => {
    const node = graphNodeMatchingProjection(graphNodes, row)
    onSelectProjection(node ?? selectionStubFromProjection(row), row)
  }

  const showMap = mode === 'map' || mode === 'split'
  const showGraph = mode === 'graph' || mode === 'split'
  const demoGraphBlocked = graph?.source === 'demo'
  const graphUnavailable =
    worldGraph.status === 'unavailable' ||
    (demoGraphBlocked && worldGraph.status !== 'ok')

  return (
    <div className="wv-view">
      <header className="wv-banner">
        <div>
          <h2>World View</h2>
          <p>
            Launch-minimum map of <code>public.spatial_projection_v1</code>. Geometry is drawn only from
            {' '}<code>display_geometry</code>. Graph, Map, and Split share one selected object id.
          </p>
        </div>
        <div className="wv-mode" role="tablist" aria-label="World View mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={mode === m.key}
              className={`wv-mode-btn${mode === m.key ? ' active' : ''}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </header>

      {loadStatus.status === 'loading' && <p className="wv-meta">Loading spatial projection…</p>}

      <div className={`wv-stage wv-stage-${mode}`}>
        {showMap && (
          <WorldMapCanvas
            rows={mapRows}
            selectedKeys={selectedKeys}
            onSelectRow={handleMapSelect}
            emptyMessage={emptyMessage}
          />
        )}
        {showGraph && (
          <div className="wv-graph">
            {graphError && graph?.source !== 'supabase' && (
              <p className="wv-empty-state">Knowledge Graph load failed: {graphError}</p>
            )}
            {graphUnavailable && (
              <p className="wv-empty-state">
                {spatialProjectionUnavailableCopy(worldGraph.reason, worldGraph.error)}
                {' '}No demo relationships are drawn.
              </p>
            )}
            {worldGraph.edgesUnavailable && (
              <p className="wv-empty-state">
                public.edges is unavailable ({worldGraph.edgesUnavailable}). Nodes may still render; no relationships are invented.
              </p>
            )}
            {!graphUnavailable && worldGraph.status === 'ok' && (
              <GraphView
                nodes={worldGraph.nodes}
                edges={worldGraph.edges}
                onSelect={onSelectGraphNode}
                panelOpen={false}
                selectedId={graphSelectionId(selected)}
                focusNodeId={graphSelectionId(selected)}
              />
            )}
          </div>
        )}
        <EventInspector
          loadStatus={loadStatus}
          selected={selected}
          visibleRow={visibleRow}
          atMs={atMs}
        />
      </div>

      <TimelineScrubber
        stamps={stamps}
        index={stampIndex}
        onChange={setStampIndex}
        disabledReason={
          loadStatus.status === 'empty'
            ? 'No projection rows, so there is no recorded time to scrub.'
            : selected
              ? 'No recorded timestamps on the matching projection rows.'
              : 'Select an object that has a spatial projection to scrub recorded time.'
        }
      />

      <WeatherPanel />

      <TrustFooter
        left={
          loadStatus.loadedAt
            ? `Projection read at ${loadStatus.loadedAt} · ${loadStatus.rows.length} row(s)`
            : 'Projection not loaded'
        }
        reviewedAt={visibleRow?.review_effective_at_utc ?? null}
      />
    </div>
  )
}
