// R4 World View launch-minimum — read path for public.spatial_projection_v1.
//
// Spatial is a projection of MIP knowledge, not a source of truth. This
// module never fabricates coordinates, weather, events, or historical state.
// Empty / missing / unreadable / non-V2 origin all resolve to an explicit
// unavailable or empty result. Demo datasets are intentionally not consulted.
// Spatial fetch runs only after VITE_SUPABASE_URL allowlists V2
// (https://qikvmopbtijoebdqosyq.supabase.co).
//
// Column contract: only the view columns listed below. Do not invent fields.

import { keysetAll, readGraphEdgesOrUnavailable, supabase } from './supabase.js'
import {
  readViteSupabaseUrl,
  rejectNonV2Client,
  resolveV2ClientOrigin,
} from './supabaseOrigin.js'

export const SPATIAL_PROJECTION_TABLE = 'spatial_projection_v1'

// Exact view columns (verified live 2026-09-03 on V2 qikvmopbtijoebdqosyq).
export const SPATIAL_PROJECTION_COLUMNS = Object.freeze([
  'projection_contract_version',
  'mip_object_id',
  'object_type',
  'subject_graph_node_id',
  'subject_snapshot_hash',
  'revision_id',
  'revision_ordinal',
  'superseded_by_revision_id',
  'spatial_role',
  'relationship_qualifier',
  'canonical_place_id',
  'place_snapshot_hash',
  'precision_class',
  'valid_time_precision',
  'source_native_time',
  'valid_from_utc',
  'valid_to_utc',
  'revision_known_at_utc',
  'review_effective_at_utc',
  'release_effective_at_utc',
  'review_state',
  'release_state',
  'uncertainty_class',
  'uncertainty_note',
  'confidence',
  'confidence_status',
  'display_hint',
  'display_geometry',
  'geometry_status',
  'evidence_refs',
])

export const PRECISION_CLASS_ORDER = Object.freeze([
  'country',
  'region',
  'city',
  'area',
  'facility',
])

// Geometry statuses that mean "do not draw", even if a leftover payload exists.
export const GEOMETRY_WITHHELD_STATUSES = Object.freeze([
  'missing',
  'unavailable',
  'withheld',
  'redacted',
  'private',
  'insufficient',
  'insufficient_evidence',
  'none',
])

const PRIVATE_PERSON_TYPES = Object.freeze([
  'person',
  'private_person',
  'individual',
  'natural_person',
  'private person',
])

export const G2_DIMENSIONS = Object.freeze([
  {
    key: 'source_reliability',
    label: 'Source reliability',
    fromView: null,
    absent: 'Not present on spatial_projection_v1',
  },
  {
    key: 'evidence_strength',
    label: 'Evidence strength',
    fromView: null,
    absent: 'Not present as a strength field; see evidence_refs',
  },
  {
    key: 'authentication',
    label: 'Authentication',
    fromView: null,
    absent: 'Not present on spatial_projection_v1',
  },
  {
    key: 'relationship_type',
    label: 'Relationship type',
    fromView: 'relationship_qualifier',
    absent: 'Not recorded',
  },
  {
    key: 'review_status',
    label: 'Review status',
    fromView: 'review_state',
    absent: 'Not recorded',
  },
  {
    key: 'remaining_uncertainty',
    label: 'Remaining uncertainty',
    fromView: 'uncertainty_class',
    absent: 'Not recorded',
  },
])

// confidence is a labeled TEXT dimension on the view, never a composite score.
export const CONFIDENCE_TEXT_DIMENSION = Object.freeze({
  key: 'confidence',
  label: 'Confidence (view text; not a composite score)',
})

export function isPrivatePersonObject(objectType) {
  if (typeof objectType !== 'string') return false
  return PRIVATE_PERSON_TYPES.includes(objectType.trim().toLowerCase())
}

export function precisionRank(precisionClass) {
  if (typeof precisionClass !== 'string') return -1
  return PRECISION_CLASS_ORDER.indexOf(precisionClass.trim().toLowerCase())
}

export function isFinerThanCity(precisionClass) {
  const rank = precisionRank(precisionClass)
  const city = PRECISION_CLASS_ORDER.indexOf('city')
  return rank > city
}

/**
 * Never show a private-person precise location. City / region / country may
 * still render when the view itself recorded that coarser class. Missing
 * precision on a person is treated as too-precise-to-show (withhold).
 */
export function mayShowLocation(row) {
  if (!row) return false
  if (!isPrivatePersonObject(row.object_type)) return true
  const rank = precisionRank(row.precision_class)
  if (rank < 0) return false
  return rank <= PRECISION_CLASS_ORDER.indexOf('city')
}

export function geometryStatusWithheld(status) {
  if (status == null || status === '') return false
  return GEOMETRY_WITHHELD_STATUSES.includes(String(status).trim().toLowerCase())
}

/**
 * Parse only display_geometry. Never synthesize a Point from place ids,
 * names, or other columns.
 */
export function parseDisplayGeometry(value) {
  if (value == null || value === '') return null
  let geom = value
  if (typeof value === 'string') {
    try {
      geom = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof geom !== 'object') return null
  if (geom.type === 'Feature' && geom.geometry) geom = geom.geometry
  if (geom.type === 'FeatureCollection') {
    const geometries = (geom.features ?? [])
      .map((f) => f?.geometry)
      .filter((g) => g && g.type)
    if (geometries.length === 0) return null
    return { type: 'GeometryCollection', geometries }
  }
  if (typeof geom.type !== 'string') return null
  if (geom.type === 'GeometryCollection') {
    return Array.isArray(geom.geometries) ? geom : null
  }
  if (geom.coordinates == null) return null
  return geom
}

export function collectPositions(geom, out = []) {
  if (!geom) return out
  const t = geom.type
  if (t === 'Point') {
    if (Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) out.push(geom.coordinates)
  } else if (t === 'MultiPoint' || t === 'LineString') {
    for (const c of geom.coordinates ?? []) collectPositions({ type: 'Point', coordinates: c }, out)
  } else if (t === 'MultiLineString' || t === 'Polygon') {
    for (const ring of geom.coordinates ?? []) {
      collectPositions({ type: 'LineString', coordinates: ring }, out)
    }
  } else if (t === 'MultiPolygon') {
    for (const poly of geom.coordinates ?? []) {
      collectPositions({ type: 'Polygon', coordinates: poly }, out)
    }
  } else if (t === 'GeometryCollection') {
    for (const g of geom.geometries ?? []) collectPositions(g, out)
  }
  return out
}

export function plotDecision(row) {
  if (!row) return { plot: false, reason: 'no_row', geometry: null }
  if (!mayShowLocation(row)) {
    return { plot: false, reason: 'private_person_precise', geometry: null }
  }
  if (geometryStatusWithheld(row.geometry_status)) {
    return { plot: false, reason: 'geometry_status_withheld', geometry: null }
  }
  const geometry = parseDisplayGeometry(row.display_geometry)
  if (!geometry) return { plot: false, reason: 'no_display_geometry', geometry: null }
  const positions = collectPositions(geometry)
  if (positions.length === 0) return { plot: false, reason: 'empty_coordinates', geometry: null }
  return { plot: true, reason: null, geometry }
}

export function markerRadiusForPrecision(precisionClass) {
  switch (String(precisionClass ?? '').toLowerCase()) {
    case 'country':
      return 28
    case 'region':
      return 18
    case 'city':
      return 10
    case 'area':
      return 7
    case 'facility':
      return 5
    default:
      return 8
  }
}

function parseUtcMs(value) {
  if (value == null || value === '') return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Whether a revision covers instant `atMs`.
 *   - valid_from <= t < valid_to  when both bounds exist
 *   - open end (valid_to null) is recorded, not invented
 *   - both bounds missing → not attributed to a scrubbed instant
 * Returns 'covers' | 'outside' | 'time_not_recorded'.
 */
export function revisionCoverageAt(row, atMs) {
  if (!row || !Number.isFinite(atMs)) return 'time_not_recorded'
  const from = parseUtcMs(row.valid_from_utc)
  const to = parseUtcMs(row.valid_to_utc)
  if (from == null && to == null) return 'time_not_recorded'
  if (from != null && atMs < from) return 'outside'
  if (to != null && atMs >= to) return 'outside'
  return 'covers'
}

export function recordedTimestamps(row) {
  if (!row) return []
  // Only the view's UTC instant columns. source_native_time is a provenance
  // payload (clock labels, calendar_date, source_url) — not a UTC timeline.
  const keys = [
    'valid_from_utc',
    'valid_to_utc',
    'revision_known_at_utc',
    'review_effective_at_utc',
    'release_effective_at_utc',
  ]
  const out = []
  for (const key of keys) {
    const ms = parseUtcMs(row[key])
    if (ms != null) out.push({ key, ms, iso: new Date(ms).toISOString() })
  }
  return out
}

/** Latest covering stamp; does not snap to valid_to (exclusive) or later audit times. */
export function defaultStampIndex(stamps, rows) {
  if (!stamps?.length) return 0
  for (let i = stamps.length - 1; i >= 0; i--) {
    if (revisionAtTime(rows, stamps[i].ms)) return i
  }
  const fromIdx = stamps.findIndex((s) => s.key === 'valid_from_utc')
  return fromIdx >= 0 ? fromIdx : 0
}

export function latestProjectionRow(rows) {
  if (!rows?.length) return null
  return [...rows].sort((a, b) => (a.revision_ordinal ?? 0) - (b.revision_ordinal ?? 0)).at(-1)
}

/** Auto-focus when the view has exactly one object; never invent a pick among many. */
export function autoSelectRow(rows) {
  if (!rows?.length) return null
  const ids = new Set((rows ?? []).map((r) => r.mip_object_id).filter(Boolean))
  if (ids.size !== 1) return null
  return latestProjectionRow(rows)
}

export function graphSelectionId(selected) {
  if (!selected) return null
  return selected.subject_graph_node_id ?? selected.id ?? selected.slug ?? selected.mip_object_id ?? null
}

export function sourceNativeTimeRecord(value) {
  if (value == null || value === '') return null
  let rec = value
  if (typeof value === 'string') {
    try {
      rec = JSON.parse(value)
    } catch {
      return { raw: value }
    }
  }
  if (typeof rec !== 'object') return { raw: String(rec) }
  return rec
}

export function sourceNativeTimeFields(value) {
  const rec = sourceNativeTimeRecord(value)
  if (!rec) return []
  return Object.entries(rec).map(([key, v]) => ({
    key,
    value: v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v),
  }))
}

export function sourceNativeLocationLabel(row) {
  const rec = sourceNativeTimeRecord(row?.source_native_time)
  const label = rec?.location_label
  return typeof label === 'string' && label.trim() ? label.trim() : null
}

export function displayCoordinateText(geometry) {
  const positions = collectPositions(geometry)
  if (!positions.length) return null
  return positions.map((c) => `[${c[0]}, ${c[1]}]`).join('; ')
}

export function inspectorTitle(row, selected) {
  const graphLabel =
    selected && !selected.fromSpatialProjection && typeof selected.label === 'string' && selected.label.trim()
      ? selected.label.trim()
      : null
  return graphLabel || sourceNativeLocationLabel(row) || (typeof row?.display_hint === 'string' && row.display_hint.trim()) || row?.mip_object_id || 'Spatial object'
}

/** Geographic padding (degrees) so city-class zoom does not impersonate facility precision. */
export function precisionPadDegrees(precisionClass) {
  switch (String(precisionClass ?? '').toLowerCase()) {
    case 'country':
      return 25
    case 'region':
      return 8
    case 'city':
      return 2.5
    case 'area':
      return 0.8
    case 'facility':
      return 0.25
    default:
      return 2.5
  }
}

export function fitExtentGeometry(positions, precisionClass) {
  if (!positions?.length) return null
  const pad = precisionPadDegrees(precisionClass)
  let lonMin = Infinity
  let lonMax = -Infinity
  let latMin = Infinity
  let latMax = -Infinity
  for (const [lon, lat] of positions) {
    const x = Number(lon)
    const y = Number(lat)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < lonMin) lonMin = x
    if (x > lonMax) lonMax = x
    if (y < latMin) latMin = y
    if (y > latMax) latMax = y
  }
  if (!Number.isFinite(lonMin)) return null
  return {
    type: 'Polygon',
    coordinates: [[
      [lonMin - pad, latMin - pad],
      [lonMax + pad, latMin - pad],
      [lonMax + pad, latMax + pad],
      [lonMin - pad, latMax + pad],
      [lonMin - pad, latMin - pad],
    ]],
  }
}

export function recordedTimestampsForRows(rows) {
  const seen = new Set()
  const stamps = []
  for (const row of rows ?? []) {
    for (const t of recordedTimestamps(row)) {
      if (seen.has(t.ms)) continue
      seen.add(t.ms)
      stamps.push(t)
    }
  }
  stamps.sort((a, b) => a.ms - b.ms)
  return stamps
}

/**
 * Pick the revision covering `atMs` for one object. Does not fall back to
 * "nearest" — that would invent historical state. If several cover the
 * instant, the highest revision_ordinal wins (later recorded revision).
 */
export function revisionAtTime(rows, atMs) {
  const covering = (rows ?? []).filter((r) => revisionCoverageAt(r, atMs) === 'covers')
  if (covering.length === 0) return null
  return [...covering].sort((a, b) => (a.revision_ordinal ?? 0) - (b.revision_ordinal ?? 0)).at(-1)
}

export function selectionKeys(selected) {
  if (!selected) return []
  return [
    selected.id,
    selected.slug,
    selected.mip_object_id,
    selected.subject_graph_node_id,
  ]
    .filter(Boolean)
    .map(String)
}

export function rowsMatchingSelection(rows, selected) {
  const keys = new Set(selectionKeys(selected))
  if (keys.size === 0) return []
  return (rows ?? []).filter(
    (r) =>
      (r.mip_object_id && keys.has(String(r.mip_object_id))) ||
      (r.subject_graph_node_id && keys.has(String(r.subject_graph_node_id))),
  )
}

export function graphNodeMatchingProjection(nodes, row) {
  if (!row || !nodes) return null
  const keys = new Set(
    [row.subject_graph_node_id, row.mip_object_id].filter(Boolean).map(String),
  )
  if (keys.size === 0) return null
  return nodes.find((n) => keys.has(String(n.id ?? n.slug))) ?? null
}

export function selectionStubFromProjection(row) {
  if (!row) return null
  const hint = typeof row.display_hint === 'string' && row.display_hint.trim() ? row.display_hint.trim() : null
  return {
    id: row.mip_object_id,
    slug: null,
    label: sourceNativeLocationLabel(row) || hint || String(row.mip_object_id ?? 'spatial object'),
    type: row.object_type ?? null,
    mip_object_id: row.mip_object_id,
    subject_graph_node_id: row.subject_graph_node_id,
    fromSpatialProjection: true,
  }
}

export function labeledG2Dimensions(row) {
  return G2_DIMENSIONS.map((dim) => {
    const raw = dim.fromView && row ? row[dim.fromView] : null
    const present = raw != null && String(raw).trim() !== ''
    return {
      key: dim.key,
      label: dim.label,
      value: present ? String(raw) : null,
      unavailable: present ? null : dim.absent,
    }
  })
}

export function confidenceTextDimension(row) {
  const raw = row?.confidence
  const present = raw != null && String(raw).trim() !== ''
  return {
    key: CONFIDENCE_TEXT_DIMENSION.key,
    label: CONFIDENCE_TEXT_DIMENSION.label,
    value: present ? String(raw) : null,
    unavailable: present ? null : 'Not recorded',
  }
}

export function normalizeEvidenceRefs(value) {
  if (value == null) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : [value]
    } catch {
      return [value]
    }
  }
  if (typeof value === 'object') return [value]
  return [value]
}

export function inspectorAvailability(row, { plot } = {}) {
  if (!row) return { state: 'empty', label: 'No spatial object selected' }
  const refs = normalizeEvidenceRefs(row.evidence_refs)
  const geom = plotDecision(row)
  const withheld = geometryStatusWithheld(row.geometry_status)
  if (withheld || geom.reason === 'no_display_geometry' || geom.reason === 'empty_coordinates') {
    return { state: 'insufficient_evidence', label: 'Insufficient evidence to display a location' }
  }
  if (geom.reason === 'private_person_precise') {
    return { state: 'withheld', label: 'Precise location withheld (private person)' }
  }
  if (plot === false && geom.reason) {
    return { state: 'unavailable', label: 'Location unavailable' }
  }
  if (refs.length === 0 && !row.review_state && !row.release_state) {
    return { state: 'insufficient_evidence', label: 'Provenance not yet recorded on this projection row' }
  }
  return { state: 'present', label: null }
}

/**
 * Weather is not a column on spatial_projection_v1. This repo has no
 * authorized provenance-bearing weather read path (no vendor, no API key,
 * no NOAA/ingest table wired for World View). Always honest unavailable.
 */
export function weatherPanelState() {
  return Object.freeze({
    status: 'unavailable',
    reason: 'no_authorized_weather_path',
    copy:
      'Weather is unavailable. public.spatial_projection_v1 has no weather columns, and this client has no authorized provenance-bearing weather source.',
    fields: Object.freeze({
      temperature: null,
      precipitation: null,
      windSpeed: null,
      windDirection: null,
    }),
    provenance: Object.freeze({
      provider: null,
      timestamp: null,
      resolution: null,
      observationType: null,
    }),
  })
}

export function spatialProjectionUnavailableCopy(reason, error) {
  if (reason === 'missing' || reason === 'empty') {
    return 'World View is unavailable: VITE_SUPABASE_URL is missing or empty. This client talks only to V2 (https://qikvmopbtijoebdqosyq.supabase.co). No spatial fetch ran and no demo pins are drawn.'
  }
  if (reason === 'origin_not_v2') {
    return 'World View is unavailable: the client origin is not V2 (https://qikvmopbtijoebdqosyq.supabase.co) or the confirmed Pages client (https://jkelsen13-tech.github.io/media-intelligence-platform-v2/). Leftover Manus, the paused original, and any other supabase.co project are rejected. No spatial fetch ran and no demo pins are drawn.'
  }
  if (error) return `Spatial projection unavailable: ${error} No location is inferred.`
  return `Spatial projection unavailable (${reason ?? 'client_not_configured'}). No location is inferred.`
}

function unavailableResult(reason, error = null) {
  return {
    status: 'unavailable',
    reason,
    rows: [],
    error,
    loadedAt: null,
  }
}

export function resolveWorldViewClient(options = {}) {
  const injected = Object.hasOwn(options, 'supabaseClient')
  if (!injected) {
    const origin = resolveV2ClientOrigin(options.envUrl ?? readViteSupabaseUrl())
    if (!origin.ok) return { client: null, reason: origin.reason }
  }
  const client = injected ? options.supabaseClient : supabase
  if (!client) return { client: null, reason: 'client_not_configured' }
  const badClient = rejectNonV2Client(client)
  if (badClient) return { client: null, reason: badClient }
  return { client, reason: null }
}

/**
 * Read public.spatial_projection_v1 from V2 only.
 *
 * Default path (no injected client): if VITE_SUPABASE_URL is missing, empty,
 * or not V2, return honest unavailable and do not call .from().
 * Injected clients used by unit tests may omit a URL; a client that does
 * carry a URL is still origin-checked and rejected when it is not V2.
 */
export async function loadSpatialProjection(options = {}) {
  const resolved = resolveWorldViewClient(options)
  if (!resolved.client) return unavailableResult(resolved.reason)

  const cols = SPATIAL_PROJECTION_COLUMNS.join(', ')
  const out = []
  let last = null
  try {
    for (;;) {
      let q = resolved.client
        .from(SPATIAL_PROJECTION_TABLE)
        .select(cols)
        .order('revision_id', { ascending: true })
      if (last !== null) q = q.gt('revision_id', last)
      const { data, error } = await q.limit(1000)
      if (error) {
        return {
          status: 'unavailable',
          reason: 'read_error',
          rows: [],
          error: error.message ?? String(error),
          loadedAt: null,
        }
      }
      const page = data ?? []
      out.push(...page)
      if (page.length < 1000) break
      const next = page[page.length - 1]?.revision_id
      if (next == null || next === last) break
      last = next
    }
  } catch (err) {
    return {
      status: 'unavailable',
      reason: 'read_error',
      rows: [],
      error: err?.message ?? String(err),
      loadedAt: null,
    }
  }
  return {
    status: out.length === 0 ? 'empty' : 'ok',
    reason: out.length === 0 ? 'zero_rows' : null,
    rows: out,
    error: null,
    loadedAt: new Date().toISOString(),
  }
}

function mapGraphEdges(rows) {
  return (rows ?? []).map((e) => ({
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    type: e.type,
    weight: e.weight,
    label: e.label,
    similarity: e.similarity,
    signal_source: e.signal_source,
    doc_strength: e.doc_strength,
    claimed_by: e.claimed_by,
    stance: e.stance,
    disputed_by: e.disputed_by,
    alternative_causes: e.alternative_causes,
    counterfactual_test: e.counterfactual_test,
    reliability: e.reliability,
    metadata: e.metadata,
  }))
}

/**
 * World View graph read. Never falls back to demo Fort Campbell edges.
 * Missing `public.edges` is an honest edges-unavailable state: nodes may
 * still render; no relationship is invented.
 */
export async function loadWorldViewGraph(options = {}) {
  const resolved = resolveWorldViewClient(options)
  if (!resolved.client) {
    return {
      status: 'unavailable',
      reason: resolved.reason,
      nodes: [],
      edges: [],
      edgesUnavailable: null,
      error: null,
    }
  }

  let nodesRes
  try {
    nodesRes = await keysetAll(
      resolved.client,
      'nodes',
      'id, slug, label, type, description, confidence, summary, occurred_at, arc_id, metadata',
    )
  } catch (err) {
    return {
      status: 'unavailable',
      reason: 'read_error',
      nodes: [],
      edges: [],
      edgesUnavailable: null,
      error: err?.message ?? String(err),
    }
  }
  if (nodesRes.error) {
    return {
      status: 'unavailable',
      reason: 'read_error',
      nodes: [],
      edges: [],
      edgesUnavailable: null,
      error: nodesRes.error.message ?? String(nodesRes.error),
    }
  }

  // Same missing-edges contract as loadGraph: empty edges + unavailable flag.
  const edgesRead = await readGraphEdgesOrUnavailable(resolved.client)
  if (edgesRead.edgesUnavailable) {
    return {
      status: 'ok',
      reason: null,
      nodes: nodesRes.data ?? [],
      edges: [],
      edgesUnavailable: edgesRead.edgesUnavailable,
      error: null,
    }
  }

  return {
    status: 'ok',
    reason: null,
    nodes: nodesRes.data ?? [],
    edges: mapGraphEdges(edgesRead.data),
    edgesUnavailable: null,
    error: null,
  }
}

export function liveGraphNodes(graph) {
  if (!graph || graph.source === 'demo') return []
  return Array.isArray(graph.nodes) ? graph.nodes : []
}
