// R4 World View — renderer adapter contract (unit/pure; no GPU).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  projectionMarkerRecords,
  deckProjectionLayers,
  nextStackAfterRendererError,
  stackAttribution,
  flyToSubject,
  requestRepaint,
  destroyRendererResources,
} from '../src/lib/worldViewRendererAdapter.js'

import { DEFAULT_MAP_STACK_ID, FALLBACK_MAP_STACK_ID } from '../src/lib/worldViewMapStack.js'
import { zoomForPrecisionClass } from '../src/lib/worldViewMapStack.js'

test('projectionMarkerRecords returns stable pickable records (row identity preserved)', () => {
  const row = {
    projection_contract_version: 'spatial_projection_v1',
    mip_object_id: 'mip-1',
    subject_graph_node_id: 'node-1',
    object_type: 'event_spatial_relationship',
    precision_class: 'city',
    geometry_status: 'coarsened_to_precision_class',
    display_geometry: { type: 'Point', coordinates: [-81.7, 41.4] },
    source_native_time: { location_label: 'Cleveland, Ohio' },
  }

  const markers = projectionMarkerRecords([row], new Set())
  assert.equal(markers.length, 1)
  assert.equal(markers[0].row, row, 'marker must retain the original row reference')
  assert.equal(markers[0].positions.length, 1)
  assert.deepEqual(markers[0].positions[0], [-81.7, 41.4])
})

test('deckProjectionLayers pick handler commits the original row (no new identity)', () => {
  const row = {
    mip_object_id: 'mip-1',
    subject_graph_node_id: 'node-1',
    precision_class: 'city',
    display_geometry: { type: 'Point', coordinates: [-81.7, 41.4] },
    object_type: 'event_spatial_relationship',
    geometry_status: 'coarsened_to_precision_class',
    source_native_time: { location_label: 'Cleveland, Ohio' },
  }

  const features = projectionMarkerRecords([row], new Set())
  const calls = []
  const onSelectRow = (pickedRow) => calls.push(pickedRow)

  class StubScatterplotLayer {
    constructor(props) {
      this.props = props
    }
  }
  class StubTextLayer {
    constructor(props) {
      this.props = props
    }
  }

  const layers = deckProjectionLayers(
    { ScatterplotLayer: StubScatterplotLayer, TextLayer: StubTextLayer },
    features,
    onSelectRow,
    new Set(),
  )

  assert.equal(layers.length, 2)
  assert.equal(typeof layers[0].props.onClick, 'function')

  layers[0].props.onClick({ object: { row } })
  assert.equal(calls.length, 1)
  assert.equal(calls[0], row)

  layers[0].props.onClick({ object: {} })
  assert.equal(calls.length, 1, 'missing object.row must fail close (no pick)')
})

test('nextStackAfterRendererError switches stacks only at the 2nd renderer error', () => {
  assert.equal(nextStackAfterRendererError(DEFAULT_MAP_STACK_ID, 1), null)
  assert.equal(nextStackAfterRendererError(DEFAULT_MAP_STACK_ID, 2), 'osm')
  assert.equal(nextStackAfterRendererError(DEFAULT_MAP_STACK_ID, 3), 'osm')

  assert.equal(nextStackAfterRendererError('osm', 1), null)
  assert.equal(nextStackAfterRendererError('osm', 2), FALLBACK_MAP_STACK_ID)
})

test('stackAttribution returns renderer attribution strings for both stacks', () => {
  const defaultAttrib = stackAttribution(DEFAULT_MAP_STACK_ID)
  assert.match(defaultAttrib, /OpenStreetMap/i)

  const fallbackAttrib = stackAttribution(FALLBACK_MAP_STACK_ID)
  assert.match(fallbackAttrib, /world-atlas|Natural Earth/i)
})

test('flyToSubject preserves coordinate values and uses precisionClass for zoom', () => {
  const coordinate = [-81.7, 41.4]
  const precisionClass = 'city'

  let flyArgs = null
  const map = {
    flyTo(args) {
      flyArgs = args
    },
  }

  const ok = flyToSubject(map, coordinate, precisionClass)
  assert.equal(ok, true)
  assert.deepEqual(flyArgs.center, coordinate)
  assert.equal(flyArgs.zoom, zoomForPrecisionClass(precisionClass))

  assert.equal(flyToSubject(map, [NaN, 1], precisionClass), false)
})

test('requestRepaint and destroyRendererResources are safe without a real renderer', () => {
  let repaints = 0
  const map = { triggerRepaint: () => repaints++ }
  requestRepaint(map)
  assert.equal(repaints, 1)

  let finalized = 0
  let removed = 0
  destroyRendererResources({
    overlay: { finalize: () => finalized++ },
    map: { remove: () => removed++ },
  })
  assert.equal(finalized, 1)
  assert.equal(removed, 1)

  // Should not throw when methods are absent.
  assert.doesNotThrow(() => destroyRendererResources({ overlay: {}, map: {} }))
})

