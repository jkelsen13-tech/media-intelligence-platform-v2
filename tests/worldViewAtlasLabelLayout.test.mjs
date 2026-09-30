import test from 'node:test'
import assert from 'node:assert/strict'
import { activateAtlasMarker, atlasDisplayMetrics, atlasLabelLayout, atlasLabelText, atlasMarkerId, atlasScreenScale, visibleAtlasLabelIds } from '../src/lib/worldViewAtlasLabelLayout.js'

function marker(id, x, y, options = {}) {
  const coordinate = Object.freeze([-81.7, 41.4])
  const row = Object.freeze({
    mip_object_id: id, revision_id: 'revision-' + id, precision_class: 'city',
    geometry_status: 'coarsened_to_precision_class',
    display_geometry: Object.freeze({ type: 'Point', coordinates: coordinate }),
  })
  return Object.freeze({
    row, positions: Object.freeze([coordinate]), i: 0, x, y,
    label: 'Source place ' + id, coords: '[-81.7, 41.4]', selected: false, ...options,
  })
}
const measured = point => ({ x: point.x + 11, y: point.y - 12, width: 110, height: 27 })

test('dense atlas labels prefer the selected version and remain deterministic without moving any point', () => {
  const a = marker('a', 70, 100), b = marker('b', 70, 100, { selected: true }), c = marker('c', 75, 103)
  const markers = Object.freeze([a, b, c])
  const before = JSON.stringify(markers)
  const ids = visibleAtlasLabelIds(markers, { measureBounds: measured })
  assert.deepEqual([...ids], [atlasMarkerId(b)])
  assert.deepEqual([...visibleAtlasLabelIds([...markers].reverse(), { measureBounds: measured })], [...ids])
  assert.equal(JSON.stringify(markers), before)
  assert.equal(markers[1].row, b.row)
  assert.equal(markers[1].positions[0], b.row.display_geometry.coordinates)
  assert.equal(markers[1].x, 70)
  assert.equal(markers[1].y, 100)
})

test('sparse atlas scenes retain both complete label blocks; selection can change the overlap winner', () => {
  const a = marker('a', 70, 100), b = marker('b', 600, 300)
  assert.deepEqual([...visibleAtlasLabelIds([a, b], { measureBounds: measured })], [atlasMarkerId(a), atlasMarkerId(b)])
  const crowded = marker('b', 70, 100)
  assert.deepEqual([...visibleAtlasLabelIds([a, crowded], { measureBounds: measured })], [atlasMarkerId(a)])
  const selectedB = { ...crowded, selected: true }
  assert.deepEqual([...visibleAtlasLabelIds([a, selectedB], { measureBounds: measured })], [atlasMarkerId(selectedB)])
})

test('main label and the full coordinate/status line occupy one measured union', () => {
  const short = marker('a', 70, 100, { label: 'A' })
  const selected = marker('b', 250, 100, { selected: true })
  const union = point => ({ x: point.x + 11, y: point.y - 12, width: point === short ? 300 : 100, height: 27 })
  assert.deepEqual([...visibleAtlasLabelIds([short, selected], { measureBounds: union })], [atlasMarkerId(selected)])
  const mainOnly = point => ({ x: point.x + 11, y: point.y - 12, width: point === short ? 11 : 100, height: 11 })
  assert.equal(visibleAtlasLabelIds([short, selected], { measureBounds: mainOnly }).size, 2,
    'fixture must expose the collision that would be missed by measuring only the main label')
})

test('measured viewport arbitration uses actual SVG anchors and includes the 3px stroke', () => {
  const point = marker('a', 800, 100, { selected: true })
  assert.equal(visibleAtlasLabelIds([point], { measureBounds: () => ({ x: 811, y: 88, width: 146, height: 27 }) }).size, 1)
  assert.equal(visibleAtlasLabelIds([point], { measureBounds: () => ({ x: 811, y: 88, width: 148, height: 27 }) }).size, 0,
    'fill ends at959 but its paint stroke would clip at961')
  assert.equal(visibleAtlasLabelIds([marker('offscreen', -5, 100)], { measureBounds: () => ({ x: 6, y: 88, width: 100, height: 27 }) }).size, 0)
  assert.equal(visibleAtlasLabelIds([point], { width: NaN, height: 480, measureBounds: measured }).size, 0)
})

test('long labels and coordinate lines are never truncated to fit; unavailable metrics use conservative full text', () => {
  const source = marker('source', 70, 100, { label: 'Source-native place '.repeat(100), selected: true })
  assert.equal(visibleAtlasLabelIds([source]).size, 0)
  const coords = marker('coords', 70, 100, { coords: '[-81.7, 41.4]; '.repeat(100), selected: true })
  const layout = atlasLabelLayout([coords])
  assert.deepEqual([...layout.labels], [atlasMarkerId(coords)], 'main source label can fit when full detail cannot')
  assert.equal(layout.details.size, 0, 'full coordinate/status line is hidden, never truncated')
  assert.ok(atlasLabelText(coords).accessibleName.includes(coords.coords))
  const normal = marker('normal', 70, 100)
  const fallback = [...visibleAtlasLabelIds([normal])]
  assert.deepEqual([...visibleAtlasLabelIds([normal], { measureBounds: () => { throw Error('SVG unavailable') } })], fallback)
  assert.deepEqual([...visibleAtlasLabelIds([normal], { measureBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }) })], fallback)
})

test('every retained point has meaningful source text even when its visual label is hidden', () => {
  const point = marker('a', 950, 100)
  assert.equal(visibleAtlasLabelIds([point]).size, 0)
  const text = atlasLabelText(point)
  assert.equal(text.label, 'Source place a')
  assert.equal(text.detail, '[-81.7, 41.4] · city · coarsened_to_precision_class')
  assert.equal(text.accessibleName, text.label + ' — ' + text.detail)
  assert.equal(atlasMarkerId(point), 'revision-a-0')
  const withoutDetail = marker('b', 70, 100, { coords: null, label: null })
  assert.deepEqual(atlasLabelText(withoutDetail), { label: 'city', detail: null, accessibleName: 'city' })
})

test('screen scale compensation retains the existing font, symbol, stroke and touch sizes across desktop/phone', () => {
  for (const scale of [1, 1280 / 960, 334 / 960, 264 / 960]) {
    const matrix = { a: scale, b: 0, c: 0, d: scale }
    const detected = atlasScreenScale(matrix)
    const metrics = atlasDisplayMetrics(detected)
    assert.ok(Math.abs(metrics.sansFontSize * scale - 11) < 1e-9)
    assert.ok(Math.abs(metrics.monoFontSize * scale - 9) < 1e-9)
    assert.ok(Math.abs(metrics.labelOffsetX * scale - 11) < 1e-9)
    assert.ok(Math.abs(metrics.detailOffsetY * scale - 12) < 1e-9)
    assert.ok(Math.abs(metrics.pointRadius * scale - 7) < 1e-9)
    assert.ok(Math.abs(metrics.hitRadius * 2 * scale - 44) < 1e-9)
    assert.ok(Math.abs(metrics.strokeWidth * scale - 3) < 1e-9)
    assert.ok(Math.abs(metrics.labelPadding * scale - 2) < 1e-9)
  }
  assert.equal(atlasScreenScale(null, 0.35), 0.35)
  assert.equal(atlasScreenScale({ a: 0, b: 0, c: 0, d: 0 }, 0.35), 0.35)
  assert.equal(atlasScreenScale({ a: 1, b: 0, c: 1, d: 0 }, 0.35), 0.35)
  assert.equal(atlasDisplayMetrics(NaN).scale, 1)
  assert.equal(atlasDisplayMetrics(0.001).scale, 0.125)
  assert.equal(atlasDisplayMetrics(100).scale, 8)
})

test('phone prefers readable main text when full detail cannot fit, desktop restores the complete block', () => {
  const point = marker('selected', 480, 240, { selected: true, label: 'Cleveland, Ohio' })
  const layoutAt = scale => atlasLabelLayout([point], {
    screenScale: scale,
    measureBounds: (m, mode) => ({
      x: m.x + 11 / scale, y: m.y - 12 / scale,
      width: (mode === 'full' ? 300 : 90) / scale,
      height: (mode === 'full' ? 27 : 11) / scale,
    }),
  })
  const desktop = layoutAt(1)
  assert.deepEqual([...desktop.labels], [atlasMarkerId(point)])
  assert.deepEqual([...desktop.details], [atlasMarkerId(point)])
  for (const scale of [334 / 960, 264 / 960]) {
    const phone = layoutAt(scale)
    assert.deepEqual([...phone.labels], [atlasMarkerId(point)])
    assert.equal(phone.details.size, 0)
    assert.deepEqual([...layoutAt(1).details], [...desktop.details], 'resize restoration is deterministic')
  }
  assert.equal(point.x, 480)
  assert.equal(point.y, 240)
  assert.equal(point.row.display_geometry.coordinates, point.positions[0])
  assert.ok(atlasLabelText(point).accessibleName.includes('coarsened_to_precision_class'))
})

test('actual activation helper delivers Enter, Space and click to the exact retained row, rejecting other keys', () => {
  const point = marker('selected', 480, 240)
  const calls = []
  let prevented = 0
  const onSelectRow = row => calls.push(row)
  for (const key of ['Enter', ' ']) {
    assert.equal(activateAtlasMarker({ type: 'keydown', key, preventDefault: () => prevented++ }, point.row, onSelectRow), true)
  }
  assert.equal(activateAtlasMarker({ type: 'click' }, point.row, onSelectRow), true)
  assert.equal(calls.length, 3)
  assert.ok(calls.every(row => row === point.row))
  assert.equal(prevented, 2)
  for (const key of ['Tab', 'ArrowDown', 'Escape']) {
    assert.equal(activateAtlasMarker({ type: 'keydown', key, preventDefault: () => prevented++ }, point.row, onSelectRow), false)
  }
  assert.equal(activateAtlasMarker({ type: 'keyup', key: 'Enter' }, point.row, onSelectRow), false)
  assert.equal(activateAtlasMarker({ type: 'click' }, null, onSelectRow), false)
  assert.equal(calls.length, 3)
  assert.equal(prevented, 2)
})
