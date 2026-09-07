// Select only recorded public joins. Titles, dates and geography are never joins.
export function comparisonInvestigationScope(events = [], context, focusEventId) {
  const id = context?.canonical_subject_id
  const type = context?.canonical_subject_type
  const parent = context?.parent_event_id
  const selected = id != null && String(id).length > 0
  let matches = events
  if (selected) {
    if (type === 'event') matches = events.filter(event => event.id === id)
    else if (type === 'arc') matches = events.filter(event => event.arcLinks?.some(link => link.arcId === id))
    else if (parent) matches = events.filter(event => event.id === parent)
    else matches = []
  } else if (focusEventId) matches = events.filter(event => event.id === focusEventId)
  return {
    events: matches,
    scoped: selected || Boolean(focusEventId),
    key: JSON.stringify(selected ? [type, id, parent ?? null] : ['browse', focusEventId ?? null]),
  }
}
