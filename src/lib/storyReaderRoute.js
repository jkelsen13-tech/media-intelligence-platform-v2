// Public Story is a reader collection, not a graph event or an investigation.
// Only the reviewed registry can resolve its subject and membership.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const empty = () => ({ storyId: null, publicVersionId: null })
export function parseStoryReaderRoute(raw) {
  if (typeof raw !== 'string' || raw.length > 512) return empty()
  const match = /^#?\/story\/([^/?#]+)(?:\?([^#]*))?$/.exec(raw)
  if (!match || !UUID.test(match[1])) return empty()
  const params = new URLSearchParams(match[2] ?? '')
  if ([...params.keys()].some(key => key !== 'version') || params.getAll('version').length > 1) return empty()
  const version = params.get('version')
  if (version !== null && !UUID.test(version)) return empty()
  return { storyId: match[1].toLowerCase(), publicVersionId: version?.toLowerCase() ?? null }
}
export function serializeStoryReaderRoute(route) {
  if (!UUID.test(route?.storyId ?? '') || (route.publicVersionId !== null && route.publicVersionId !== undefined && !UUID.test(route.publicVersionId))) return null
  return `#/story/${route.storyId.toLowerCase()}${route.publicVersionId ? '?version=' + route.publicVersionId.toLowerCase() : ''}`
}
