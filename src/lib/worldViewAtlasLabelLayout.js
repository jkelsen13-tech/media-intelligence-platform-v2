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

function measuredLabelBox(marker, measureBounds) {
  try {
    const box = measureBounds?.(marker)
    if (box && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key]))
      && box.width > 0 && box.height > 0) {
      // getBBox excludes the 3px paint stroke. Include its half-width plus
      // conservative rounding, so neither line's stroke can overlap or clip.
      return { left: box.x - 2, right: box.x + box.width + 2,
        top: box.y - 2, bottom: box.y + box.height + 2 }
    }
  } catch { /* SVG text measurement can be unavailable while hidden. */ }
  const text = atlasLabelText(marker)
  // CSS fonts are 11px sans and 9px mono. Without SVG metrics use full,
  // uncapped strings and deliberately wider/taller bounds for both lines.
  const width = Math.max(40, String(text.label).length * 12, String(text.detail ?? '').length * 12)
  return { left: marker.x + 9, right: marker.x + 13 + width,
    top: marker.y - 18, bottom: marker.y + (text.detail ? 18 : 4) }
}

export function visibleAtlasLabelIds(markers, { width = 960, height = 480, measureBounds } = {}) {
  const candidates = markers.map(marker => {
    const box = measuredLabelBox(marker, measureBounds)
    const labelHeight = box.bottom - box.top
    return {
      id: atlasMarkerId(marker), selected: marker.selected,
      visible: Number.isFinite(marker.x) && Number.isFinite(marker.y)
        && marker.x >= 0 && marker.x <= width && marker.y >= 0 && marker.y <= height,
      // The shared renderer-neutral helper expects left=x+14 and a box
      // centered at y-8. Translate the measured union, never the point.
      x: box.left - 14, y: box.top + 8 + labelHeight / 2,
      labelWidth: box.right - box.left, labelHeight,
    }
  })
  return visibleLabelIds(candidates, { width, height })
}
