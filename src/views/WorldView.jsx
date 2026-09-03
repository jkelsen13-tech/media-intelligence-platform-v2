// R4 World View launch spine (DISPLAY / client UI).
// Spec: MIP_WORLD_VIEW_LAUNCH_v0.1_2026-09-03.
//
// Pattern pin: commit 880a672 (2026-08-26). TAKE pattern-level only,
// reimplement here: cinematic pan-zoom/camera; feature picking returns the
// MIP object then commitNewSubject; layered rendering + visible attribution;
// render-governance / map-stack fallback; recorded vs delayed vs reconstructed
// vs unavailable labels; person-identity overlays stay locked; MapLibre +
// deck.gl 2D/2.5D. Do not clone the source globe. Do not ship 3D-tile
// vendors, live vehicle/camera overlays, cockpit/HUD, or present-day weather
// on a historical event.

import { useEffect, useMemo, useRef, useState } from 'react'
import GraphView from '../graph/GraphView'
import TrustFooter from '../components/TrustFooter'
import WorldMapCanvas from './WorldMapCanvas'
import {
  loadSpatialProjection,
  loadWorldViewGraph,
  liveGraphNodes,
  plotDecision,
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
  mayShowLocation,
  defaultStampIndex,
  autoSelectRow,
  graphSelectionId,
  sourceNativeTimeFields,
  sourceNativeLocationLabel,
  displayCoordinateText,
  inspectorTitle,
  spatialProjectionUnavailableCopy,
} from '../lib/spatialProjection'
import {
  canonicalEventIdFromWorldView,
  loadTemporalAssessment,
} from '../lib/temporalAssessment'
import {
  investigationContextDomProps,
  selectionStubFromInvestigation,
} from '../lib/investigationContext'
import { freshnessFromExistingMarkers } from '../lib/investigationJoinState'
import { loadEventTimeWeather, unavailableWeather } from '../lib/eventTimeWeather'
import {
  freshnessCopy,
  spatialFreshnessLabel,
  temporalFreshnessLabel,
  weatherFreshnessLabel,
} from '../lib/worldViewFreshness'
import { launchOverlayCatalog } from '../lib/worldViewPrivacyLock'
import './worldview.css'

const MODES = [
  { key: 'map', label: 'Map' },
  { key: 'graph', label: 'Graph' },
  { key: 'split', label: 'Split' },
]

void launchOverlayCatalog()

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

function FreshnessPill({ state }) {
  return (
    <span className={`wv-pill wv-pill-${state}`} data-freshness-state={state}>
      {freshnessCopy(state)}
    </span>
  )
}

function WeatherPanel({ weather }) {
  const state = weather ?? unavailableWeather('not_loaded')
  const freshness = weatherFreshnessLabel(state)
  return (
    <section className="wv-weather" aria-label="Weather" data-weather-status={state.status}>
      <header className="wv-section-head">
        <h3>Weather at event time</h3>
        <FreshnessPill state={freshness} />
      </header>
      <p className="wv-weather-copy">{state.copy}</p>
      <dl className="wv-weather-grid">
        <Field label="Temperature" value={state.fields.temperature} empty="Not sourced" />
        <Field label="Precipitation" value={state.fields.precipitation} empty="Not sourced" />
        <Field label="Wind speed" value={state.fields.windSpeed} empty="Not sourced" />
        <Field label="Wind direction" value={state.fields.windDirection} empty="Not sourced" />
        <Field label="Provider" value={state.provenance.provider} />
        <Field label="Timestamp" value={state.provenance.timestamp} />
        <Field label="Resolution" value={state.provenance.resolution} />
        <Field
          label="Observation type"
          value={state.provenance.observationType}
          empty="Unavailable (observed / reanalysis / forecast not sourced)"
        />
        <Field label="Model" value={state.provenance.model} empty="Not sourced" />
      </dl>
    </section>
  )
}

function TemporalIntelligenceBlock({ assessment }) {
  if (!assessment) return null
  const freshness = temporalFreshnessLabel(assessment)
  return (
    <section className="wv-temporal" aria-label="Temporal Intelligence">
      <header className="wv-section-head">
        <h3>Temporal Intelligence</h3>
        <FreshnessPill state={freshness} />
      </header>
      <p className="wv-temporal-copy">{assessment.copy}</p>
      {assessment.status === 'ok' && assessment.copy !== assessment.panel && (
        <p className="wv-meta">{assessment.panel}</p>
      )}
    </section>
  )
}

function EventInspector({
  loadStatus,
  selected,
  visibleRow,
  atMs,
  temporalAssessment,
  investigationContext,
  weather,
}) {
  const coverage = visibleRow && Number.isFinite(atMs) ? revisionCoverageAt(visibleRow, atMs) : null
  const plot = visibleRow ? plotDecision(visibleRow) : { plot: false, reason: 'no_row', geometry: null }
  const availability = inspectorAvailability(visibleRow, { plot: plot.plot })
  const g2 = visibleRow ? labeledG2Dimensions(visibleRow) : []
  const confidence = visibleRow ? confidenceTextDimension(visibleRow) : null
  const refs = visibleRow ? normalizeEvidenceRefs(visibleRow.evidence_refs) : []
  const locationHidden = visibleRow && !mayShowLocation(visibleRow)
  const spatialFreshness = spatialFreshnessLabel(visibleRow, { plot: plot.plot })
  const freshness = freshnessFromExistingMarkers({
    asOfTime: investigationContext?.as_of_time,
    revisionRow: visibleRow,
    atMs,
  })

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
    const whenFrom = formatWhen(visibleRow.valid_from_utc)
    const whenTo = formatWhen(visibleRow.valid_to_utc)
    const locationValue = locationHidden
      ? null
      : plot.plot
        ? `${sourceNativeLocationLabel(visibleRow) || 'Recorded place'} · ${visibleRow.precision_class || 'unspecified'} · ${displayCoordinateText(plot.geometry)}`
        : null
    body = (
      <>
        {availability.state !== 'present' && (
          <p className={`wv-callout wv-callout-${availability.state}`}>{availability.label}</p>
        )}
        <header className="wv-inspector-heading">
          <h3 className="wv-inspector-title">{inspectorTitle(visibleRow, selected)}</h3>
          <FreshnessPill state={spatialFreshness} />
        </header>
        <dl className="wv-fields">
          <Field
            label="When"
            value={whenFrom && whenTo ? `${whenFrom} → ${whenTo}` : whenFrom || whenTo}
            empty="Time not recorded"
          />
          <Field label="Valid-time precision" value={visibleRow.valid_time_precision} />
          <Field
            label="Location"
            value={locationValue}
            empty={locationHidden ? 'Precise location withheld (private person)' : 'Location unavailable'}
          />
          <Field label="Precision class" value={visibleRow.precision_class} />
          <Field label="Geometry status" value={visibleRow.geometry_status} />
          <Field label="Uncertainty" value={visibleRow.uncertainty_class} empty="Not recorded" />
          <Field label="Uncertainty note" value={visibleRow.uncertainty_note} empty="Not recorded" />
          <Field label="Review" value={visibleRow.review_state} />
          <Field label="Release" value={visibleRow.release_state} />
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
          <h4>Provenance</h4>
          {nativeFields.length === 0 && refs.length === 0 ? (
            <p className="wv-empty">No source-native time or evidence_refs on this row.</p>
          ) : (
            <>
              {nativeFields.length > 0 && (
                <dl className="wv-fields">
                  {nativeFields.map((f) =>
                    f.key === 'source_url' && f.value ? (
                      <div className="wv-field" key={f.key}>
                        <dt>Source</dt>
                        <dd>
                          <a href={f.value} target="_blank" rel="noreferrer">
                            {f.value}
                          </a>
                        </dd>
                      </div>
                    ) : (
                      <Field key={f.key} label={f.key.replace(/_/g, ' ')} value={f.value} />
                    ),
                  )}
                </dl>
              )}
              {refs.length > 0 && (
                <ul>
                  {refs.map((ref, i) => (
                    <li key={i} className="num">
                      {typeof ref === 'string' ? ref : JSON.stringify(ref)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </>
    )
  }

  return (
    <aside className="wv-inspector" aria-label="Selected-event inspector">
      <header className="wv-section-head">
        <h2>Event inspector</h2>
      </header>
      <section className="wv-ic" aria-label="Investigation context">
        <h4>Investigation context</h4>
        <dl className="wv-fields">
          <Field label="canonical_subject_type" value={investigationContext?.canonical_subject_type} empty="not recorded" />
          <Field label="canonical_subject_id" value={investigationContext?.canonical_subject_id} empty="none" />
          <Field label="parent_event_id" value={investigationContext?.parent_event_id} empty="none" />
          <Field label="as_of_time" value={investigationContext?.as_of_time} empty="not recorded" />
          <Field
            label="selected_time_range"
            value={
              investigationContext?.selected_time_range
                ? `${investigationContext.selected_time_range.from ?? 'not recorded'} → ${investigationContext.selected_time_range.to ?? 'not recorded'}`
                : null
            }
            empty="none"
          />
          <Field label="active_view" value={investigationContext?.active_view} empty="none" />
          <Field
            label="temporal_assessment_reference"
            value={investigationContext?.temporal_assessment_reference}
            empty="none"
          />
        </dl>
        {freshness.summary && (
          <p className="wv-freshness" data-freshness-kind={freshness.kind}>
            {freshness.summary}
          </p>
        )}
      </section>
      <TemporalIntelligenceBlock assessment={temporalAssessment} />
      {body}
      <WeatherPanel weather={weather} />
    </aside>
  )
}

function TimelineScrubber({ stamps, index, onChange, disabledReason }) {
  if (!stamps.length) {
    return (
      <section className="wv-scrubber" data-filter-family="investigation" aria-label="Investigation filters">
        <header className="wv-section-head">
          <h3>Recorded time</h3>
        </header>
        <p className="filter-family-label">Investigation filters</p>
        <p className="wv-empty">{disabledReason}</p>
      </section>
    )
  }
  const current = stamps[index] ?? stamps[stamps.length - 1]
  return (
    <section className="wv-scrubber" data-filter-family="investigation" aria-label="Investigation filters">
      <header className="wv-section-head">
        <h3>Recorded time</h3>
        <span className="wv-meta num">{current?.iso}</span>
      </header>
      <p className="filter-family-label">Investigation filters</p>
      <p className="wv-meta">
        Recorded time inspects the current subject and writes as_of_time only. The canonical subject does not change.
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
  investigationContext,
  onInvestigationAsOfTime,
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
  const [temporalAssessment, setTemporalAssessment] = useState(null)
  const [weather, setWeather] = useState(() => unavailableWeather('not_loaded'))
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

  const selectedForMatch = selected ?? selectionStubFromInvestigation(investigationContext)
  const selectedRows = useMemo(
    () => rowsMatchingSelection(loadStatus.rows, selectedForMatch),
    [loadStatus.rows, selectedForMatch],
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
      if (!selected) onSelectProjection(node ?? selectionStubFromProjection(row), row)
      return
    }
    if (selected?.fromSpatialProjection && node) {
      onSelectProjection(node, row)
    }
  }, [loadStatus, graphNodes, selected, onSelectProjection])

  const atMs = stamps[stampIndex]?.ms ?? null
  const atIso = stamps[stampIndex]?.iso ?? null
  useEffect(() => {
    if (!onInvestigationAsOfTime) return
    if (!investigationContext?.canonical_subject_id) return
    onInvestigationAsOfTime(atIso)
  }, [atIso, investigationContext?.canonical_subject_id, onInvestigationAsOfTime])
  const visibleRow = Number.isFinite(atMs)
    ? revisionAtTime(selectedRows, atMs)
    : selectedRows.length
      ? [...selectedRows].sort((a, b) => (a.revision_ordinal ?? 0) - (b.revision_ordinal ?? 0)).at(-1)
      : null

  const canonicalEventId = useMemo(
    () => canonicalEventIdFromWorldView(selected, visibleRow),
    [selected, visibleRow],
  )

  useEffect(() => {
    if (!canonicalEventId) {
      setTemporalAssessment(null)
      return
    }
    let cancelled = false
    loadTemporalAssessment(canonicalEventId).then((view) => {
      if (!cancelled) setTemporalAssessment(view)
    })
    return () => {
      cancelled = true
    }
  }, [canonicalEventId])

  useEffect(() => {
    let cancelled = false
    loadEventTimeWeather({ row: visibleRow, atMs }).then((result) => {
      if (!cancelled) setWeather(result)
    })
    return () => {
      cancelled = true
    }
  }, [visibleRow, atMs])

  const mapRows = useMemo(() => {
    if (loadStatus.status !== 'ok') return []
    if (selectedForMatch && selectedRows.length > 0) {
      return visibleRow ? [visibleRow] : []
    }
    return loadStatus.rows.filter((row) => plotDecision(row).plot)
  }, [loadStatus, selectedForMatch, selectedRows, visibleRow])

  const selectedKeys = useMemo(() => {
    const keys = new Set()
    if (selectedForMatch?.id) keys.add(String(selectedForMatch.id))
    if (selectedForMatch?.slug) keys.add(String(selectedForMatch.slug))
    if (selectedForMatch?.mip_object_id) keys.add(String(selectedForMatch.mip_object_id))
    if (selectedForMatch?.subject_graph_node_id) keys.add(String(selectedForMatch.subject_graph_node_id))
    if (visibleRow?.mip_object_id) keys.add(String(visibleRow.mip_object_id))
    if (visibleRow?.subject_graph_node_id) keys.add(String(visibleRow.subject_graph_node_id))
    return keys
  }, [selectedForMatch, visibleRow])

  const emptyMessage =
    loadStatus.status === 'unavailable'
      ? spatialProjectionUnavailableCopy(loadStatus.reason, loadStatus.error)
      : loadStatus.status === 'empty'
        ? 'No spatial projection rows. The map stays empty.'
        : selectedForMatch && selectedRows.length === 0
          ? 'This selection has no spatial projection row.'
          : selectedForMatch && !visibleRow
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
  const activeTitle = inspectorTitle(visibleRow, selectedForMatch)

  return (
    <div className="wv-view" data-wv-mode={mode} {...investigationContextDomProps(investigationContext)}>
      <header className="wv-banner">
        <div>
          <h2>World View</h2>
          <p>
            World-scale spatial lens. Graph, Map, and Split share one selected subject.
            Locations are drawn only from published <code>display_geometry</code>.
            Zoom does not invent a finer precision class.
          </p>
          {visibleRow && (
            <p className="wv-active-event">
              Active event · {activeTitle}
              {visibleRow.precision_class ? ` · ${visibleRow.precision_class}` : ''}
              {visibleRow.geometry_status ? ` · ${visibleRow.geometry_status}` : ''}
            </p>
          )}
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

      <div className={`wv-layout wv-layout-${mode}`}>
        <div className="wv-main">
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
                    selectedId={graphSelectionId(selectedForMatch)}
                    focusNodeId={graphSelectionId(selectedForMatch)}
                  />
                )}
              </div>
            )}
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
        </div>
        <EventInspector
          loadStatus={loadStatus}
          selected={selectedForMatch}
          visibleRow={visibleRow}
          atMs={atMs}
          temporalAssessment={temporalAssessment}
          investigationContext={investigationContext}
          weather={weather}
        />
      </div>

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
