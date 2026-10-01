import { inspectionInstantMilliseconds } from './inspectionTime.js'
import { confidenceTextDimension, inspectorTitle, labeledG2Dimensions, normalizeEvidenceRefs, plotDecision, revisionCoverageAt, sourceNativeTimeRecord } from './spatialProjection.js'

// DISPLAY only. Optional records are an intake seam for already admitted,
// sourced context; this module does not discover, fetch, or infer information.
export const WORLD_VIEW_CONTEXT_FAMILIES = Object.freeze([
  ['events', 'Events'], ['people', 'People'], ['markets', 'Markets'],
  ['population', 'Population'], ['weather', 'Weather'],
  ['infrastructure', 'Infrastructure'], ['hazards', 'Hazards'], ['relationships', 'Relationships'],
].map(([key, label]) => Object.freeze({ key, label })))
export const DEFAULT_WORLD_VIEW_CONTEXT_LAYERS = Object.freeze(Object.fromEntries(WORLD_VIEW_CONTEXT_FAMILIES.map(({ key }) => [key, true])))

export function normalizeWorldViewContextLayers(value = DEFAULT_WORLD_VIEW_CONTEXT_LAYERS) {
  return Object.freeze(Object.fromEntries(WORLD_VIEW_CONTEXT_FAMILIES.map(({ key }) => [key, value?.[key] === true])))
}

const text = value => typeof value === 'string' && value.trim() ? value : null
const scalar = value => typeof value === 'number' && Number.isFinite(value) ? String(value) : text(value)
function clone(value, ancestors = new Set()) {
  if (value == null || ['string', 'boolean'].includes(typeof value)) return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'object' || ancestors.has(value)) return null
  const next = new Set(ancestors).add(value)
  if (Array.isArray(value)) return value.map(item => clone(item, next))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item, next)]))
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
const field = (label, value, unavailable = 'Not recorded') => ({ label, value: scalar(value) ?? unavailable })
function referenceTime(value) {
  if (inspectionInstantMilliseconds(value) !== null) return value
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return inspectionInstantMilliseconds(`${value}T00:00:00Z`) !== null ? value : null
}
function hasSource(source) {
  return Boolean(source && (text(source.label) || text(source.url) || text(source.referenceId)))
}

export function worldViewSpatialContextKey({ visibleRow = null, investigationContext = null } = {}) {
  return JSON.stringify([
    investigationContext?.canonical_subject_type ?? null,
    investigationContext?.canonical_subject_id ?? visibleRow?.subject_graph_node_id ?? null,
    visibleRow?.mip_object_id ?? null, visibleRow?.revision_id ?? null,
    visibleRow?.revision_ordinal ?? null, visibleRow?.subject_snapshot_hash ?? null,
    visibleRow?.place_snapshot_hash ?? null,
    investigationContext?.as_of_time ?? null,
    investigationContext?.selected_time_range?.from ?? null,
    investigationContext?.selected_time_range?.to ?? null,
  ])
}

const FAMILY_FIELDS = Object.freeze({
  events: [['description', 'Description'], ['status', 'Event status'], ['occurredAt', 'Event time']],
  people: [['name', 'Person'], ['documentedRole', 'Documented role']],
  markets: [['company', 'Company'], ['ticker', 'Ticker'], ['documentedRelevance', 'Documented relevance'], ['value', 'Market value'], ['unit', 'Unit']],
  population: [['place', 'Place'], ['population', 'Population'], ['unit', 'Unit']],
  weather: [['temperature', 'Temperature'], ['precipitation', 'Precipitation'], ['windSpeed', 'Wind speed'], ['windDirection', 'Wind direction'], ['observationType', 'Observation type'], ['resolution', 'Resolution'], ['model', 'Model']],
  infrastructure: [['name', 'Infrastructure'], ['type', 'Type'], ['documentedRelevance', 'Documented relevance'], ['description', 'Description']],
  hazards: [['name', 'Hazard'], ['type', 'Type'], ['description', 'Description'], ['status', 'Hazard status']],
  relationships: [['from', 'From'], ['to', 'To'], ['documentedRelationship', 'Documented relationship']],
})
function relevant(family, values) {
  switch (family) {
    case 'events': return Boolean(text(values.description) || text(values.status))
    case 'people': return Boolean(text(values.name) && text(values.documentedRole))
    case 'markets': return Boolean(text(values.company) && text(values.ticker) && text(values.documentedRelevance))
    case 'population': return Boolean(text(values.place) && scalar(values.population))
    case 'weather': return ['temperature', 'precipitation', 'windSpeed', 'windDirection'].some(key => scalar(values[key]) !== null)
    case 'infrastructure': return Boolean(text(values.name) && text(values.documentedRelevance))
    case 'hazards': return Boolean(text(values.name) && text(values.type))
    case 'relationships': return Boolean(text(values.from) && text(values.to) && text(values.documentedRelationship))
    default: return false
  }
}

function admittedModule(record, family, subjectId, row, asOfTime) {
  if (!record || record.admitted !== true || String(record.subjectId ?? '') !== String(subjectId)
    || !hasSource(record.source) || !referenceTime(record.referenceTime)
    || !text(record.geography?.label) || !text(record.geography?.precision)
    || !['context', 'evidence'].includes(record.classification)
    || !['available', 'unavailable'].includes(record.status)) return null
  if (family === 'weather' && !['current', 'event-time'].includes(record.temporalMode)) return null
  const values = record.fields ?? {}
  if (record.status === 'unavailable' ? !text(record.unavailableReason) : !relevant(family, values)) return null
  if (family === 'weather' && record.status === 'available' && record.temporalMode === 'event-time') {
    const time = inspectionInstantMilliseconds(record.referenceTime)
    const selectedTime = inspectionInstantMilliseconds(asOfTime)
    if (time === null || revisionCoverageAt(row, time) !== 'covers'
      || (selectedTime !== null && time !== selectedTime)
      || (/^\d{4}-\d{2}-\d{2}$/.test(asOfTime ?? '') && new Date(time).toISOString().slice(0, 10) !== asOfTime)) return null
  }
  const label = WORLD_VIEW_CONTEXT_FAMILIES.find(item => item.key === family).label
  const fields = record.status === 'unavailable'
    ? [field('Availability', record.unavailableReason)]
    : FAMILY_FIELDS[family].filter(([key]) => scalar(values[key]) !== null).map(([key, label]) => field(label, values[key]))
  fields.push(field(family === 'population' ? 'Population reference date' : 'Reference time', record.referenceTime),
    field('Geography', record.geography.label), field('Context precision', record.geography.precision),
    field('Availability', record.status), field('Source', record.source.label ?? record.source.url ?? record.source.referenceId))
  if (family === 'weather') fields.unshift(field('Temporal meaning', record.temporalMode === 'current' ? 'CURRENT weather context' : 'EVENT-TIME weather'))
  return {
    id: `${family}:${JSON.stringify([record.id ?? record.source.referenceId ?? record.source.url ?? record.source.label, record.version ?? null, record.referenceTime, ...FAMILY_FIELDS[family].map(([key]) => scalar(values[key]))])}`, family, title: text(record.title) ?? label,
    classification: record.classification, status: record.status,
    fields, references: clone([record.source, ...normalizeEvidenceRefs(record.references)]),
    provenance: clone(record.provenance ?? null),
  }
}

function evidenceModule(row, asOfTime) {
  const native = clone(sourceNativeTimeRecord(row.source_native_time))
  const confidence = confidenceTextDimension(row)
  return {
    id: 'evidence', family: null, title: 'Evidence & provenance', classification: 'evidence', status: 'available',
    fields: [field('Evidence precision', row.precision_class), field('Valid-time precision', row.valid_time_precision),
      field('Inspection time', asOfTime), field('Valid from', row.valid_from_utc), field('Valid to', row.valid_to_utc),
      field('Revision recorded', row.revision_known_at_utc), field('Review effective', row.review_effective_at_utc),
      field('Release effective', row.release_effective_at_utc),
      field('Release status', row.release_state), field('Geometry availability', row.geometry_status),
      field('Uncertainty', row.uncertainty_class), field('Uncertainty note', row.uncertainty_note),
      field('Source', native?.source_url, 'Source URL not recorded; see supplied evidence references'),
      field('Evidence references', normalizeEvidenceRefs(row.evidence_refs).length ? 'Supplied references below' : 'Not recorded'),
      ...labeledG2Dimensions(row).map(dimension => field(dimension.label, dimension.value, dimension.unavailable)),
      field(confidence.label, confidence.value, confidence.unavailable),
      field('Confidence status (recorded)', row.confidence_status)],
    references: clone(normalizeEvidenceRefs(row.evidence_refs)), provenance: native,
  }
}

function legacyEventTimeWeatherModule(weather, subjectId, row, asOfTime) {
  // eventTimeWeather.js describes event-time DISPLAY reanalysis. Its successful
  // parser result records provider and observation time, but does not record
  // geography or subject/admission. Never derive those from the spatial row.
  // A caller must explicitly supply those missing intake dimensions before the
  // successful legacy result can pass the same sourced-module admission checks.
  if (weather?.status !== 'ok' || !text(weather.provenance?.provider)
    || weather.provenance?.observationType !== 'reanalysis') return null
  return admittedModule({
    ...weather,
    status: 'available', temporalMode: 'event-time',
    source: weather.source ?? { label: weather.provenance.provider },
    referenceTime: weather.provenance.timestamp,
    fields: { ...weather.fields, observationType: weather.provenance.observationType,
      resolution: weather.provenance.resolution, model: weather.provenance.model },
  }, 'weather', subjectId, row, asOfTime)
}

/** A family can be eligible without creating an icon or an explanation. */
export function buildWorldViewSpatialContext({ visibleRow = null, selected = null, investigationContext = null,
  admittedContext = {}, weather = null, layerVisibility = DEFAULT_WORLD_VIEW_CONTEXT_LAYERS } = {}) {
  const layers = normalizeWorldViewContextLayers(layerVisibility)
  const subjectId = investigationContext?.canonical_subject_id ?? visibleRow?.subject_graph_node_id ?? null
  const asOfTime = investigationContext?.as_of_time ?? null
  const mismatched = subjectId != null && String(visibleRow?.subject_graph_node_id ?? '') !== String(subjectId)
  const time = inspectionInstantMilliseconds(asOfTime)
  const invalidTime = asOfTime != null && referenceTime(asOfTime) === null
  const outsideTime = time !== null && revisionCoverageAt(visibleRow, time) !== 'covers'
  const dateScope = typeof asOfTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOfTime)
  const dayStart = dateScope ? inspectionInstantMilliseconds(`${asOfTime}T00:00:00Z`) : null
  const from = inspectionInstantMilliseconds(visibleRow?.valid_from_utc)
  const to = inspectionInstantMilliseconds(visibleRow?.valid_to_utc)
  const outsideDate = dateScope && (from === null && to === null || from !== null && from >= dayStart + 86400000 || to !== null && to <= dayStart)
  const plot = plotDecision(visibleRow)
  const reason = !visibleRow ? 'no_visible_row' : mismatched ? 'subject_mismatch' : invalidTime ? 'inspection_time_unavailable' : outsideTime || outsideDate ? 'recorded_time_unavailable' : plot.reason
  const modules = []
  // Unplottable selected context is still inspectable. Precise private-person
  // payloads are withheld entirely rather than copied into an explanation.
  const available = Boolean(visibleRow && !mismatched && !invalidTime && !outsideTime && !outsideDate && plot.reason !== 'private_person_precise')
  const selectedMatches = selected && [selected.id, selected.slug, selected.subject_graph_node_id].some(id => id != null && String(id) === String(subjectId))
  const title = available ? inspectorTitle(visibleRow, selectedMatches ? selected : null) : 'Selected context unavailable'
  const family = ({ event: 'events', person: 'people', private_person: 'people', market: 'markets', company: 'markets', infrastructure: 'infrastructure', hazard: 'hazards' })[visibleRow?.spatial_role]
    ?? ({ event_spatial_relationship: 'events', person: 'people' })[visibleRow?.object_type] ?? null
  if (available) {
    modules.push(evidenceModule(visibleRow, asOfTime))
    if (family === 'events') modules.push({ id: 'event', family: 'events', title: 'Event', classification: 'evidence', status: 'available',
      fields: [field('Recorded subject', title), field('Spatial record valid from', visibleRow.valid_from_utc), field('Spatial record valid to', visibleRow.valid_to_utc)],
      references: clone(normalizeEvidenceRefs(visibleRow.evidence_refs)), provenance: null })
    for (const { key } of WORLD_VIEW_CONTEXT_FAMILIES) {
      const records = Array.isArray(admittedContext?.[key]) ? admittedContext[key] : []
      records.forEach(record => { const module = admittedModule(record, key, subjectId, visibleRow, asOfTime); if (module && !modules.some(existing => existing.id === module.id)) modules.push(module) })
    }
    const legacyWeather = legacyEventTimeWeatherModule(weather, subjectId, visibleRow, asOfTime)
    if (legacyWeather && !modules.some(module => module.id === legacyWeather.id)) modules.push(legacyWeather)
    // Existing legacy weather is event-time only. Unavailable state contributes
    // an honest status without inventing source/time/geography metadata.
    if (weather?.status === 'unavailable' && text(weather.reason)) modules.push({
      id: 'weather-availability', family: 'weather', title: 'Event-time weather', classification: 'context', status: 'unavailable',
      fields: [field('Availability', text(weather.copy) ?? 'Weather not sourced'), field('Source-path status', weather.reason)],
      references: [], provenance: clone(weather.provenance ?? null),
    })
  }
  const families = WORLD_VIEW_CONTEXT_FAMILIES.map(item => ({ ...item, eligible: layers[item.key],
    available: modules.some(module => module.family === item.key && module.status === 'available'),
    moduleCount: modules.filter(module => module.family === item.key).length }))
  return freeze({ key: worldViewSpatialContextKey({ visibleRow, investigationContext }), subjectId, title, available, reason,
    families, indicator: { exists: Boolean(available && plot.plot), eligible: family !== null && layers[family], family, reason }, modules })
}

/** Container-relative pixels only. Renderer supplies camera-aware projection. */
export function positionWorldViewSpatialContextCard(anchor, viewport, { width = 320, height = 320, gap = 18, padding = 12 } = {}) {
  if (anchor?.visible !== true || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)
    || !Number.isFinite(viewport?.width) || !Number.isFinite(viewport?.height) || viewport.width <= 0 || viewport.height <= 0
    || anchor.x < 0 || anchor.y < 0 || anchor.x > viewport.width || anchor.y > viewport.height) return null
  const w = Math.min(width, Math.max(0, viewport.width - padding * 2))
  const h = Math.min(height, Math.max(0, viewport.height - padding * 2))
  const right = anchor.x + gap + w <= viewport.width - padding
  const x = Math.max(padding, Math.min(right ? anchor.x + gap : anchor.x - gap - w, viewport.width - padding - w))
  const y = Math.max(padding, Math.min(anchor.y - 40, viewport.height - padding - h))
  return { x, y, width: w, maxHeight: h, leader: { x1: anchor.x, y1: anchor.y, x2: right ? x : x + w, y2: Math.max(y, Math.min(anchor.y, y + h)) } }
}
