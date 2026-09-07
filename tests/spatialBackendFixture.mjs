import { newsBackendFixture } from './newsBackendFixture.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'

// All HTTP is intercepted by the installed-SDK fixture, including this origin.
export function spatialFixture(options = {}) {
  const f = newsBackendFixture({ url: 'https://qikvmopbtijoebdqosyq.supabase.co', ...options })
  return { ...f, backend: createPublicDataBackend(f.client).spatial }
}

export const spatialRow = {
  projection_contract_version: 'spatial_projection_v1',
  mip_object_id: 'synthetic-object', subject_graph_node_id: 'synthetic-event',
  revision_id: 'revision-one', revision_ordinal: 1, superseded_by_revision_id: null,
  object_type: 'event_spatial_relationship', spatial_role: 'event', relationship_qualifier: 'none',
  precision_class: 'city', valid_time_precision: 'range',
  source_native_time: { calendar_date: '2024-04-08', location_label: 'Synthetic recorded place' },
  valid_from_utc: '2024-04-08T17:59:00Z', valid_to_utc: '2024-04-08T20:29:00Z',
  revision_known_at_utc: '2024-04-09T00:00:00Z',
  review_state: 'operative', release_state: 'released', display_hint: 'event_location',
  display_geometry: { type: 'Point', coordinates: [-81.7, 41.4] },
  geometry_status: 'coarsened_to_precision_class', confidence: null,
  confidence_status: 'unsupported_by_governed_model',
  uncertainty_note: 'Synthetic recorded uncertainty',
  evidence_refs: [{ evidence_role: 'primary_support', evidence_snapshot_id: 'synthetic-evidence' }],
}
export function spatialTables() {
  return { spatial_projection_v1: [spatialRow], nodes: [{ id: 'synthetic-event', label: 'Synthetic recorded event', type: 'event' }], edges: [] }
}
