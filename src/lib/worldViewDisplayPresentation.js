import { displayMarkerKey, layoutDisplayClusters, projectionRowDisplayKey } from './worldViewDisplayClusters.js'
import { projectRelationshipDisplay } from './worldViewRelationshipLayout.js'
import { visibleLabelIds, pointVisibleAboveEllipsoid } from './worldViewMarkerLayout.js'

// Renderer-owned, display-only records. Never persist anchors or grouping in
// Investigation Context, geometry, evidence, or camera state.
export function createDisplayPresentation(markers, {
  width, height, cameraHeightMeters, relationships = [], selectedKeys = new Set(),
  radiusPx = 64,
} = {}) {
  const layout = layoutDisplayClusters(markers, { width, height, radiusPx })
  // The badges have 44 CSS-pixel hit boxes. Reserve those bounds so text
  // cannot cover a group. At the 64px default seed separation, even diagonally
  // neighboring square hit targets cannot overlap.
  const reservedBoxes = layout.clusters.map(c => ({ left: c.x - 22, right: c.x + 22,
    top: c.y - 22, bottom: c.y + 22 }))
  const labels = visibleLabelIds(layout.singles, { width, height, cameraHeightMeters, reservedBoxes })
  const admitted = new Set([...layout.singles, ...layout.clusters.flatMap(c => c.members)])
  // A wrapped screen copy is not a second original endpoint. Retain one
  // canonical location, preferring the copy admitted to the display layout;
  // hidden originals still explain a hidden-endpoint disposition.
  // Membership belongs to this admitted layout only. Canonical geometry keys
  // make wrapped copies agree without carrying a previous pose's group ID.
  const displayGroups = new Map()
  for (const group of layout.clusters) {
    for (const member of group.members) {
      const key = displayMarkerKey(member.row, member.positionIndex ?? member.i ?? 0)
      if (key !== null) displayGroups.set(key, group.id)
    }
  }
  const endpointMarkers = new Map()
  for (const marker of markers) {
    const key = displayMarkerKey(marker.row, marker.positionIndex ?? marker.i ?? 0)
    if (key === null) continue
    if (!endpointMarkers.has(key) || admitted.has(marker)) endpointMarkers.set(key, marker)
  }
  const relationshipMarkers = [...endpointMarkers].map(([key, marker]) => {
    const displayGroupId = displayGroups.get(key)
    if (displayGroupId) return Object.freeze({ ...marker, displayGroupId })
    // Reused endpoint DTOs must not retain an obsolete group after regrouping,
    // viewport admission changes, or renderer fallback.
    if ('displayGroupId' in marker) {
      const current = { ...marker }
      delete current.displayGroupId
      return Object.freeze(current)
    }
    return marker
  })
  const relationshipSummary = projectRelationshipDisplay(relationships, relationshipMarkers, {
    width, height, selectedKeys,
  })
  // Relationship labels share the marker label arbitration so a busy line
  // cannot cover a selected location. Exact original edges remain inspectable.
  const edgeLabels = relationshipSummary.lines.map(line => {
    const label = String(line.type || line.label || 'relationship')
    const labelWidth = Math.max(40, label.length * 12), labelHeight = 18
    // The SVG draws centered text at midpoint y-5. Translate its conservative
    // stroked bounds into the existing label helper's left=x+14, center=y-8
    // convention; this never changes a relationship endpoint.
    return { id: 'relationship:' + line.edgeIndex, selected: line.selected, visible: true,
      label, labelWidth, labelHeight,
      x: (line.x1 + line.x2) / 2 - labelWidth / 2 - 14,
      y: (line.y1 + line.y2) / 2 + 3 }
  })
  const markerLabelBounds = layout.singles.filter(marker => labels.has(marker.id)).map(marker => {
    const w = Number.isFinite(marker.labelWidth) ? marker.labelWidth : Math.max(40, String(marker.label ?? '').length * 12)
    const h = Number.isFinite(marker.labelHeight) ? marker.labelHeight : 16
    return { left: marker.x + 14, right: marker.x + 14 + w,
      top: marker.y - 8 - h / 2, bottom: marker.y - 8 + h / 2 }
  })
  const edgeOnlyLabels = visibleLabelIds(edgeLabels, { width, height, cameraHeightMeters,
    reservedBoxes: [...reservedBoxes, ...markerLabelBounds] })
  const relationshipLabels = new Set(edgeLabels.filter(marker => edgeOnlyLabels.has(marker.id))
    .map(marker => Number(marker.id.slice('relationship:'.length))))
  return { width, height, markers, layout, labels, relationshipSummary, relationshipLabels }
}

export function displayPresentationSignature(state) {
  if (!state) return ''
  return JSON.stringify([
    state.width, state.height,
    state.markers.map(m => [m.id, m.x, m.y, m.visible, m.selected]),
    state.layout.clusters.map(c => [c.id, c.members.map(m => m.id), c.rowCount, c.locationCount]),
    [...state.labels], state.relationshipSummary.dispositions.map(d => [d.edgeIndex, d.reason]),
    state.relationshipSummary.lines.map(l => [l.edgeIndex, l.edge.id, l.type, l.label, l.x1, l.y1, l.x2, l.y2]),
    [...state.relationshipLabels],
  ])
}

export function displayPresentationProbe(state, rendererKind, timing = {}) {
  if (!state) return { rendererKind, layout: { singles: [], clusters: [],
    stats: { inputCount: 0, visibleCount: 0, targetCount: 0, labelCount: 0, passes: 0, lastMs: 0, maxMs: 0, ...timing } },
    markers: [], relationshipSummary: null, selectedRowKey: null }
  const drawn = new Set(state.layout.singles)
  const admitted = new Set([...state.layout.singles, ...state.layout.clusters.flatMap(c => c.members)])
  const rowKey = marker => projectionRowDisplayKey(marker.row)
  return {
    rendererKind,
    layout: {
      singles: state.layout.singles.map(m => ({ id: m.id, rowKey: rowKey(m),
        x: m.x, y: m.y, selected: Boolean(m.selected) })),
      clusters: state.layout.clusters.map(c => ({ id: c.id, x: c.x, y: c.y,
        memberIds: c.members.map(m => m.id), rowKeys: c.rowMembers.map(projectionRowDisplayKey),
        locationCount: c.locationCount, rowCount: c.rowCount, selected: Boolean(c.selected) })),
      stats: { ...state.layout.stats, inputCount: state.markers.length,
        visibleCount: state.layout.stats.admittedLocations, targetCount: state.layout.items.length,
        labelCount: state.labels.size, passes: 0, lastMs: 0, maxMs: 0, ...timing },
    },
    markers: state.markers.map(m => ({ id: m.id, rowKey: rowKey(m), x: m.x, y: m.y,
      eligible: Boolean(admitted.has(m) && m.visible && Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.x <= state.width && m.y >= 0 && m.y <= state.height),
      visible: drawn.has(m), displayed: drawn.has(m), selected: Boolean(m.selected) })),
    relationshipSummary: { total: state.relationshipSummary.total,
      displayed: state.relationshipSummary.displayed, hidden: state.relationshipSummary.hidden,
      counts: { ...state.relationshipSummary.counts },
      temporalValidity: state.relationshipSummary.temporalValidity },
    selectedRowKey: rowKey(state.markers.find(m => m.selected) ?? {}),
  }
}

export function globeDisplayMarkers(C, viewer, entities, measureLabel) {
  if (!viewer || viewer.isDestroyed?.() || !C?.SceneTransforms) return []
  const { scene, camera } = viewer, time = viewer.clock.currentTime
  return entities.map(entity => {
    const point = entity.position.getValue(time)
    const screen = point && C.SceneTransforms.worldToWindowCoordinates(scene, point)
    const label = entity.label.text.getValue(time)
    return { ...entity.__mipMarker, id: entity.__mipMarker?.id ?? entity.id, row: entity.__mipRow,
      selected: Boolean(entity.__mipSelected), label,
      ...measureLabel?.(label, entity.label.font?.getValue(time) ?? '12px sans-serif'),
      x: screen?.x, y: screen?.y,
      visible: Boolean(point && screen &&
        pointVisibleAboveEllipsoid(camera.positionWC, point, scene.globe.ellipsoid.radii)) }
  })
}

export function applyGlobeDisplayPresentation(viewer, entities, state) {
  if (!viewer || viewer.isDestroyed?.() || !state) return false
  const time = viewer.clock.currentTime, drawn = new Set(state.layout.singles.map(m => m.id))
  let changed = false
  for (const entity of entities) {
    const id = entity.__mipMarker?.id ?? entity.id
    const visible = drawn.has(id), labelVisible = visible && state.labels.has(id)
    if (entity.show !== visible) { entity.show = visible; changed = true }
    if (entity.label.show.getValue(time) !== labelVisible) {
      entity.label.show = labelVisible; changed = true
    }
  }
  return changed
}
