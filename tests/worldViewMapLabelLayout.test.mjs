import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createMapMarkerLabelLayout, deckProjectionLayers, requestRepaint,
} from '../src/lib/worldViewRendererAdapter.js'

function feature(id, x, y, label = 'Location') {
  const position = Object.freeze([x, y])
  const row = Object.freeze({ mip_object_id: id, subject_graph_node_id: 'node-' + id,
    revision_id: 'revision-' + id, precision_class: 'city' })
  return Object.freeze({ row, positions: Object.freeze([position]), label, selected: false })
}

function harness({ width = 800, height = 400, zoom = 8, measureWidth = 60 } = {}) {
  const listeners = new Map(), removed = [], projected = [], fonts = []
  let contextCount = 0, measurements = 0, repaints = 0, offsetX = 0, cancelled = false, clock = 0
  const canvas = { clientWidth: width, clientHeight: height }
  const map = {
    getCanvas: () => canvas, getZoom: () => zoom, getCenter: () => ({ lat: 0 }),
    project(position) {
      projected.push(position)
      if (position[0] === -999) throw new Error('projection unavailable')
      return { x: position[0] + offsetX, y: position[1] }
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(listener)
    },
    off(event, listener) {
      removed.push([event, listener])
      listeners.get(event)?.delete(listener)
    },
    triggerRepaint() { repaints++ },
  }
  const layout = createMapMarkerLabelLayout(map, {
    isCancelled: () => cancelled,
    onChange: () => requestRepaint(map),
    now: () => ++clock,
    createContext() {
      contextCount++
      return {
        font: '',
        measureText(text) {
          measurements++
          fonts.push(this.font)
          return { width: typeof measureWidth === 'function' ? measureWidth(text) : measureWidth,
            actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 }
        },
      }
    },
  })
  return {
    map, canvas, layout, listeners, removed, projected, fonts,
    emit(event) { for (const listener of listeners.get(event) ?? []) listener({ type: event }) },
    setZoom(value) { zoom = value }, setOffset(value) { offsetX = value },
    cancel() { cancelled = true },
    counts: () => ({ contextCount, measurements, repaints }),
    labels: () => layout.getLayerData().labelData.map(p => p.row.mip_object_id),
  }
}

test('MapLibre dense labels prioritize selection while every point and row survives', () => {
  const h = harness()
  const features = [feature('a', 100, 100), feature('z', 101, 100), feature('b', 102, 100)]
  h.layout.setFeatures(features, new Set(['node-z']))
  assert.deepEqual(h.labels(), ['z'])
  const { pointData, labelData } = h.layout.getLayerData()
  assert.equal(pointData.length, 3)
  for (let index = 0; index < features.length; index++) {
    assert.equal(pointData[index].row, features[index].row)
    assert.equal(pointData[index].position, features[index].positions[0])
  }
  assert.equal(labelData[0], pointData[1])
  assert.equal(pointData[1].selected, true)
  h.layout.setFeatures(features, new Set(['a']))
  assert.deepEqual(h.labels(), ['a'], 'selection changes arbitrate the same positions again')
  assert.deepEqual(features.map(f => f.positions[0]), [[100, 100], [101, 100], [102, 100]])
  h.layout.destroy()
})

test('MapLibre sparse and distant zoom label behavior uses the shared camera bridge', () => {
  const h = harness()
  const features = [feature('a', 30, 50), feature('b', 240, 200), feature('c', 500, 300)]
  h.layout.setFeatures(features, new Set())
  assert.deepEqual(h.labels(), ['a', 'b', 'c'])
  h.setZoom(0)
  h.emit('move')
  assert.deepEqual(h.labels(), [])
  h.layout.setFeatures(features, new Set(['b']))
  assert.deepEqual(h.labels(), ['b'], 'selected labels retain priority at world scale')
  h.setZoom(8)
  h.emit('render')
  assert.deepEqual(h.labels(), ['a', 'b', 'c'])
  assert.equal(h.layout.getStats().points, 3)
  h.layout.destroy()
})

test('resize and subpixel movement reproject full label bounds with one correction frame', () => {
  const h = harness({ width: 300, measureWidth: 60 })
  h.layout.setFeatures([feature('a', 226, 100)], new Set())
  assert.deepEqual(h.labels(), ['a'], 'label ends exactly at the viewport boundary')
  assert.equal(h.counts().repaints, 0, 'feature caller publishes once; layout adds no idle frame')
  h.setOffset(0.01)
  h.emit('move')
  assert.deepEqual(h.labels(), [], 'even tiny camera motion can cross the measured edge')
  assert.equal(h.counts().repaints, 1)
  h.emit('render')
  h.emit('render')
  assert.equal(h.counts().repaints, 1, 'the correction and stable renders do not request more frames')
  h.canvas.clientWidth = 301
  h.emit('resize')
  assert.deepEqual(h.labels(), ['a'])
  assert.equal(h.counts().repaints, 2)
  h.emit('render')
  assert.equal(h.counts().repaints, 2)
  assert.equal(h.counts().contextCount, 1)
  assert.equal(h.counts().measurements, 1, 'stable text is measured once across actual layout passes')
  assert.deepEqual(h.fonts, ['normal 12px sans-serif'])
  assert.ok(h.projected.length >= 6, 'each event reprojects, without a rounded camera cache')
  assert.deepEqual(h.layout.getStats(), { points: 1, labels: 1, passes: 6, lastMs: 1, maxMs: 1 })
  h.layout.destroy()
})

test('full multiline and long native labels are measured with no arbitrary width cap', () => {
  const h = harness({ width: 600, measureWidth: text => text.length * 10 })
  const text = 'A'.repeat(70)
  h.layout.setFeatures([feature('a', 20, 100, text), feature('b', 250, 30, 'One\nTwo')], new Set())
  assert.deepEqual(h.labels(), ['b'], 'the 700px source-native label cannot fit the viewport')
  const data = h.layout.getLayerData()
  assert.equal(data.pointData.length, 2, 'a clipped label never removes its point')
  h.canvas.clientHeight = 30
  h.emit('resize')
  assert.deepEqual(h.labels(), [], 'multiline height must fit in full')
  h.layout.destroy()
})

test('projection failures, offscreen points and absent viewport cannot place labels', () => {
  const h = harness()
  const features = [feature('a', -999, 50), feature('b', 900, 50), feature('c', 50, NaN)]
  h.layout.setFeatures(features, new Set(['a', 'b', 'c']))
  assert.deepEqual(h.labels(), [])
  assert.equal(h.layout.getLayerData().pointData.length, 3)
  h.canvas.clientWidth = 0
  assert.equal(h.layout.update(), false)
  h.layout.destroy()
})

test('dense large passes keep a bounded measurement cache and stable accepted membership', () => {
  const h = harness({ measureWidth: 60 })
  const features = Array.from({ length: 1000 }, (_, i) => feature(String(i), 100, 100, 'Label-' + i))
  h.layout.setFeatures(features, new Set(['999']))
  assert.deepEqual(h.labels(), ['999'])
  assert.equal(h.layout.getLayerData().pointData.length, 1000)
  assert.equal(h.counts().contextCount, 1)
  assert.equal(h.counts().measurements, 1000)
  h.emit('render')
  assert.equal(h.counts().measurements, 2000, 'a FIFO cache of 512 cannot retain all 1000 unique labels')
  assert.equal(h.counts().repaints, 0, 'dense stable layouts cannot start an idle repaint loop')
  h.layout.destroy()
})

test('destroy unregisters exact listeners, releases point data, and ignores stale callbacks', () => {
  const h = harness()
  h.layout.setFeatures([feature('a', 50, 100)], new Set())
  const stale = [...h.listeners.get('render')][0]
  assert.deepEqual([...h.listeners.keys()], ['render', 'move', 'resize'])
  const before = h.counts()
  h.layout.destroy()
  h.layout.destroy()
  assert.equal(h.removed.length, 3)
  assert.equal([...h.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0)
  h.setOffset(1000)
  stale()
  h.emit('render')
  assert.equal(h.layout.update(), false)
  assert.equal(h.layout.setFeatures([feature('b', 50, 100)], new Set()), false)
  assert.deepEqual(h.layout.getLayerData(), { pointData: [], labelData: [] })
  assert.deepEqual(h.counts(), before)
  assert.equal(h.layout.getStats().points, 0)
  assert.equal(h.layout.getStats().labels, 0)
})

test('cancellation blocks layout updates and correction requests before teardown', () => {
  const h = harness()
  h.layout.setFeatures([feature('a', 50, 100)], new Set())
  const before = h.counts()
  h.cancel()
  h.setOffset(1000)
  h.emit('move')
  h.emit('render')
  assert.equal(h.layout.update(), false)
  assert.equal(h.layout.setFeatures([], new Set()), false)
  assert.deepEqual(h.counts(), before)
  h.layout.destroy()
})

test('deck label subset and exact font keep full point identity and picking', () => {
  const h = harness()
  const features = [feature('a', 50, 100), feature('b', 51, 100)]
  h.layout.setFeatures(features, new Set(['b']))
  class Layer { constructor(props) { this.props = props } }
  const picks = []
  const [points, labels] = deckProjectionLayers({ ScatterplotLayer: Layer, TextLayer: Layer },
    features, row => picks.push(row), new Set(['b']), h.layout.getLayerData())
  assert.equal(points.props.data.length, 2)
  assert.equal(labels.props.data.length, 1)
  assert.equal(labels.props.data[0], points.props.data[1])
  assert.equal(labels.props.fontFamily, 'sans-serif')
  assert.equal(labels.props.fontWeight, 'normal')
  assert.equal(labels.props.lineHeight, 1.5)
  assert.equal(labels.props.sizeUnits, 'pixels')
  assert.equal(labels.props.getSize, 12)
  assert.deepEqual(labels.props.getPixelOffset, [14, -8])
  for (const point of points.props.data) {
    points.props.onClick({ object: point })
    assert.equal(picks.at(-1), point.row)
    assert.deepEqual(points.props.getPosition(point), point.position)
  }
  h.layout.destroy()
})
