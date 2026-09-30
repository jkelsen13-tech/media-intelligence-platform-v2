import { visibleLabelIds } from './worldViewMarkerLayout.js'

// Atlas coordinates are SVG viewBox units. Labels are presentation only;
// arbitration returns IDs and never moves a point or rewrites its retained row.
export function atlasMarkerId(marker) {
  return `${marker.row.revision_id ?? marker.row.mip_object_id}-${marker.i}`
}

export function atlasLabelText(marker) {
  const label = marker.label || marker.row.precision_class || 'projected location'
  const detail = marker.coords
    ? [marker.coords, marker.row.precision_class ?? '', marker.row.geometry_status ?? ''].join(' · ')
    : null
  return { label, detail, accessibleName: [label, detail].filter(Boolean).join(' — ') }
}

export function atlasDisplayMetrics(screenScale = 1) {
  const scale = Number.isFinite(screenScale) && screenScale > 0
    ? Math.min(8, Math.max(0.125, screenScale)) : 1
  return {
    scale, sansFontSize: 11 / scale, monoFontSize: 9 / scale,
    labelOffsetX: 11 / scale, labelOffsetY: -2 / scale, detailOffsetY: 12 / scale,
    pointRadius: 7 / scale, hitRadius: 22 / scale,
    strokeWidth: 3 / scale, pointStrokeWidth: 1.5 / scale, labelPadding: 2 / scale,
  }
}

export function atlasScreenScale(matrix, previousScale = 1) {
  const x = Math.hypot(matrix?.a, matrix?.b)
  const y = Math.hypot(matrix?.c, matrix?.d)
  const determinant = matrix ? matrix.a * matrix.d - matrix.b * matrix.c : NaN
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(determinant)
    && Math.abs(determinant) > 1e-12 && x > 0 && y > 0
    ? atlasDisplayMetrics(Math.min(x, y)).scale : atlasDisplayMetrics(previousScale).scale
}

export function activateAtlasMarker(event, row, onSelectRow) {
  if (!row || typeof onSelectRow !== 'function') return false
  if (event?.type === 'keydown') {
    if (event.key !== 'Enter' && event.key !== ' ') return false
    event.preventDefault?.()
  } else if (event?.type !== 'click') return false
  onSelectRow(row)
  return true
}

function measuredLabelBox(marker, measureBounds, mode, metrics) {
  try {
    const box = measureBounds?.(marker, mode)
    if (box && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key]))
      && box.width > 0 && box.height > 0) {
      // getBBox excludes the 3px paint stroke. Include its half-width plus
      // conservative rounding, so neither line's stroke can overlap or clip.
      const padding = metrics.labelPadding
      return { left: box.x - padding, right: box.x + box.width + padding,
        top: box.y - padding, bottom: box.y + box.height + padding }
    }
  } catch { /* SVG text measurement can be unavailable while hidden. */ }
  const text = atlasLabelText(marker)
  // CSS fonts are 11px sans and 9px mono. Without SVG metrics use full,
  // uncapped strings and deliberately wider/taller bounds for both lines.
  const detail = mode === 'full' ? text.detail : null
  const width = Math.max(40, String(text.label).length * 12, String(detail ?? '').length * 12) / metrics.scale
  return { left: marker.x + metrics.labelOffsetX - metrics.labelPadding,
    right: marker.x + metrics.labelOffsetX + width + metrics.labelPadding,
    top: marker.y - 18 / metrics.scale, bottom: marker.y + (detail ? 18 : 4) / metrics.scale }
}

export function atlasLabelLayout(markers, { width = 960, height = 480, measureBounds, screenScale = 1 } = {}) {
  const metrics = atlasDisplayMetrics(screenScale)
  const detailCandidates = new Set()
  const fits = box => box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height
  const candidates = markers.map(marker => {
    const id = atlasMarkerId(marker)
    const text = atlasLabelText(marker)
    let box = measuredLabelBox(marker, measureBounds, 'full', metrics)
    if (text.detail && !fits(box)) box = measuredLabelBox(marker, measureBounds, 'main', metrics)
    else if (text.detail) detailCandidates.add(id)
    const labelHeight = box.bottom - box.top
    return {
      id, selected: marker.selected,
      visible: Number.isFinite(marker.x) && Number.isFinite(marker.y)
        && marker.x >= 0 && marker.x <= width && marker.y >= 0 && marker.y <= height,
      // The shared renderer-neutral helper expects left=x+14 and a box
      // centered at y-8. Translate the measured union, never the point.
      x: box.left - 14, y: box.top + 8 + labelHeight / 2,
      labelWidth: box.right - box.left, labelHeight,
    }
  })
  const labels = visibleLabelIds(candidates, { width, height })
  return { labels, details: new Set([...labels].filter(id => detailCandidates.has(id))) }
}

export function visibleAtlasLabelIds(markers, options) {
  return atlasLabelLayout(markers, options).labels
}
