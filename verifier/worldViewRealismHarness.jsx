// Isolated display qualification only. No backend request is intercepted and no
// fixture is written to a database. This is not a production app entrypoint.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import WorldView from '../src/views/WorldView.jsx'
import { unavailableWeather } from '../src/lib/eventTimeWeather.js'
import '../src/index.css'

const subject = '00000000-0000-4000-8000-000000000101'
const row = Object.freeze({
  projection_contract_version: 'spatial_projection_v1',
  mip_object_id: '00000000-0000-4000-8000-000000000102', object_type: 'event_spatial_relationship',
  subject_graph_node_id: subject, revision_id: '00000000-0000-4000-8000-000000000103', revision_ordinal: 1,
  subject_snapshot_hash: 'display-qualification-only', place_snapshot_hash: 'city-precision-fixture',
  spatial_role: 'event', precision_class: 'city', valid_time_precision: 'instant',
  valid_from_utc: '2024-01-02T12:00:00Z', valid_to_utc: '2024-01-03T12:00:00Z',
  revision_known_at_utc: '2024-01-02T13:00:00Z', review_effective_at_utc: '2024-01-02T14:00:00Z', release_effective_at_utc: '2024-01-02T15:00:00Z',
  review_state: 'approved', release_state: 'released', geometry_status: 'coarsened_to_precision_class',
  display_geometry: { type: 'Point', coordinates: [-81.7, 41.4] },
  source_native_time: { location_label: 'Cleveland, Ohio · display fixture' },
  evidence_refs: ['qualification fixture; no news claim'], confidence_status: 'not_scored',
})
const backend = Object.freeze({
  loadSpatialProjection: async () => ({ status: 'ok', rows: [row], loadedAt: 'fixture-read', reason: null }),
  loadWorldViewGraph: async () => ({ status: 'ok', nodes: [], edges: [], edgesUnavailable: null }),
  loadTemporalAssessment: async () => null,
  loadEventTimeWeather: async () => unavailableWeather('not_sourced'),
})
function Harness() {
  const [selected, setSelected] = useState({ id: subject, label: 'Cleveland context qualification fixture', fromSpatialProjection: true })
  const [time, setTime] = useState(row.valid_from_utc)
  const investigationContext = { canonical_subject_type: 'event', canonical_subject_id: subject,
    parent_event_id: subject, as_of_time: time, selected_time_range: null, active_view: 'world', temporal_assessment_reference: null }
  return <main style={{ minHeight: '100dvh', padding: '8px' }}>
    <p className="wv-meta" data-evidence-layer="isolated-display-fixture">Isolated display fixture · source coverage and live data unqualified · no backend writes</p>
    <WorldView selected={selected} investigationContext={investigationContext} backend={backend}
      graph={{ source: 'qualification-fixture', nodes: [], edges: [] }} onSelectProjection={node => setSelected(node)}
      onSelectGraphNode={node => setSelected(node)} onInvestigationAsOfTime={setTime} />
  </main>
}
createRoot(document.getElementById('root')).render(<Harness />)
