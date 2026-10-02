// DISPLAY reading model only. A family, nearby company or scene fixture is not
// authority for a module. Only the record's explicit module payload supplies it.
export const WORLD_BILLBOARD_MODULE_IDS = Object.freeze([
  'evidence', 'context', 'sources', 'event', 'people', 'place', 'market',
  'environment', 'infrastructure', 'timelineRelationships',
])
export const WORLD_BILLBOARD_CORE_TABS = Object.freeze([
  Object.freeze({ id: 'evidence', label: 'Evidence' }),
  Object.freeze({ id: 'context', label: 'Context' }),
  Object.freeze({ id: 'sources', label: 'Sources' }),
])
const text = value => typeof value === 'string' && value.trim() ? value : null
const scalar = value => typeof value === 'string' || typeof value === 'number' ? value : null

/** Preserve exact supplied payloads. Duplicate IDs are ambiguous and omitted.
 * No relation, eligibility, dates, facts or sources are derived from membership.
 */
export function suppliedWorldBillboardModules(value) {
  if (!Array.isArray(value)) return []
  const counts = new Map()
  for (const entry of value) if (entry && typeof entry.id === 'string') counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1)
  return value.filter(entry => entry && WORLD_BILLBOARD_MODULE_IDS.includes(entry.id)
    && counts.get(entry.id) === 1 && text(entry.label)
    && Object.hasOwn(entry, 'content') && entry.content != null && entry.eligible !== false)
    .map(({ id, label, content }) => ({ id, label, content }))
}

/** Optional authoritative tabs; the old three-tab module shape stays supported. */
export function worldBillboardModuleTabs(model) {
  if (!Array.isArray(model?.moduleTabs)) return WORLD_BILLBOARD_CORE_TABS.map(tab => ({ ...tab,
    content: Array.isArray(model?.modules)
      ? model.modules.filter(entry => (entry.kind ?? entry.classification ?? entry.id) === tab.id)
      : model?.modules?.[tab.id] }))
  const supplied = suppliedWorldBillboardModules(model.moduleTabs)
  return [...WORLD_BILLBOARD_CORE_TABS.map(tab => supplied.find(entry => entry.id === tab.id) ?? { ...tab, content: [] }),
    ...supplied.filter(entry => !WORLD_BILLBOARD_CORE_TABS.some(tab => tab.id === entry.id))]
}

/** Explicitly separate clocks. Never substitute imagery/current/inspection time
 * for event evidence time; missing values remain unavailable.
 */
export function buildWorldBillboardModel(record, {
  inspectionTime = null, backgroundCaptureTime = null, currentContextTime = null,
} = {}) {
  if (!record || typeof record !== 'object') return null
  const suppliedCoordinates = record.canonicalCoordinates ?? record.coordinates
  const coordinates = Array.isArray(suppliedCoordinates) && [2,3].includes(suppliedCoordinates.length) && suppliedCoordinates.every(Number.isFinite)
    ? [...suppliedCoordinates] : null
  const metadata = [
    { label: 'Canonical location', value: coordinates ? coordinates.join(', ') : 'Unavailable' },
    { label: 'Evidence precision', value: scalar(record.precision) ?? 'Unavailable' },
    { label: 'Event evidence time', value: scalar(record.eventTime) ?? 'Unavailable' },
    { label: 'Recorded inspection time', value: scalar(inspectionTime) ?? 'Unavailable' },
    { label: 'Background imagery capture', value: scalar(backgroundCaptureTime) ?? 'Unavailable — no capture supplied' },
    { label: 'Current context reference time', value: scalar(currentContextTime) ?? 'Unavailable — no current context supplied' },
  ]
  if (Array.isArray(record.eventTimeRange) && record.eventTimeRange.length === 2
    && record.eventTimeRange.every(value => scalar(value) != null)) {
    metadata.push({ label: 'Event evidence range', value: record.eventTimeRange.join(' → ') })
  }
  if (Array.isArray(record.validityTimeRange) && record.validityTimeRange.length === 2
    && record.validityTimeRange.every(value=>scalar(value)!=null)) metadata.push({label:'Recorded validity range',value:record.validityTimeRange.join(' → ')})
  if (record.sourceNativeTime != null) metadata.push({label:'Source native time provenance',
    value:typeof record.sourceNativeTime==='object' ? JSON.stringify(record.sourceNativeTime) : scalar(record.sourceNativeTime) ?? 'Unavailable'})
  const supplied = suppliedWorldBillboardModules(record.suppliedModules)
  return { key: record.key ?? record.id, title: text(record.label) ?? text(record.title) ?? 'Untitled supplied record',
    chip: text(record.precision) ? `${record.precision} evidence precision` : 'Evidence precision unavailable',
    canonicalCoordinates: coordinates, precision: scalar(record.precision), metadata,
    moduleTabs: worldBillboardModuleTabs({ moduleTabs: supplied }),
    sourceRefs: record.sourceRefs ?? record.references ?? [],
  }
}
