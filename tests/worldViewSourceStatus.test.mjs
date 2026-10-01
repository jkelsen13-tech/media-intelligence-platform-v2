import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveWorldViewSourceStatus, WORLD_VIEW_SOURCE_STATUS as S } from '../src/lib/worldViewSourceStatus.js'

const globe = { stackId: 'ellipsoid-globe', rendererReady: true,
  requestedProfile: { version: 1, enabled: true, preset: 'maximum' } }

test('requested Photoreal and ready renderer do not establish an imagery load or photographic source', () => {
  const status = resolveWorldViewSourceStatus(globe)
  assert.equal(status.requested.status, S.PREFERENCE)
  assert.equal(status.requested.preset, 'maximum')
  assert.equal(status.renderer.status, S.ACTIVE)
  assert.equal(status.imagery.status, S.UNKNOWN)
  assert.equal(status.imagery.kind, 'cartographic-raster')
  assert.equal(status.imagery.photographicStatus, S.SOURCE_DEPENDENT)
  assert.equal(status.buildings.status, S.NOT_IMPLEMENTED)
  assert.match(status.requested.detail, /does not select photographic imagery/)
})

test('explicit runtime imagery success admits only the currently configured cartographic source', () => {
  for (const stackId of ['ellipsoid-globe', 'openfreemap-positron', 'osm']) {
    const status = resolveWorldViewSourceStatus({ ...globe, stackId, imageryStatus: { status: 'active', source: 'invented photogrammetry' } })
    assert.equal(status.imagery.status, S.ACTIVE)
    assert.match(status.imagery.source, /OpenStreetMap/)
    assert.match(status.imagery.detail, /no photographic layer/)
    assert.equal(status.imagery.captureDate, null)
  }
})

test('loading, unavailable and unknown imagery remain unconfirmed, with no guessed failure cause', () => {
  for (const status of ['loading', 'unavailable', 'unknown', 'malformed']) {
    const result = resolveWorldViewSourceStatus({ ...globe, imageryStatus: { status } })
    assert.equal(result.imagery.status, S.UNKNOWN)
    assert.equal(result.imagery.availability, ['loading', 'unavailable'].includes(status) ? status : 'unknown')
  }
  assert.equal(resolveWorldViewSourceStatus({ ...globe, rendererReady: false, imageryStatus: { status: 'active' } }).imagery.status, S.UNKNOWN)
})

test('ellipsoid ancestry, attempts and source rejections never qualify active elevation', () => {
  for (const terrainStatus of [null, { status: 'idle', fetchAttempts: 0, fetchSuccesses: 0 },
    { status: 'idle', fetchAttempts: 4, fetchSuccesses: 0, fetchFailures: 4, sourceRejections: 4 }]) {
    assert.equal(resolveWorldViewSourceStatus({ ...globe, terrainStatus }).elevation.status, S.INACTIVE)
  }
  for (const terrainStatus of [{ status: 'active' }, { status: 'active', fetchSuccesses: 0 },
    { status: 'active', fetchSuccesses: '1' }, { status: 'active', fetchSuccesses: 1.5 }]) {
    assert.equal(resolveWorldViewSourceStatus({ ...globe, terrainStatus }).elevation.status, S.UNKNOWN)
  }
})

test('successful approved tile qualifies the bounded provider, not all visible pixels or dated evidence', () => {
  const status = resolveWorldViewSourceStatus({ ...globe,
    terrainStatus: { status: 'active', fetchAttempts: 10, fetchSuccesses: 1, fetchFailures: 9, sourceRejections: 9 } })
  assert.equal(status.elevation.status, S.ACTIVE)
  assert.match(status.elevation.detail, /Bounded Ohio coverage, levels 8–15/)
  assert.match(status.elevation.detail, /not a per-pixel coverage claim/)
  assert.equal(status.elevation.captureDate, null)
  assert.equal(status.sourceCapture.status, S.UNKNOWN)
  assert.match(status.background.label, /not evidence/)
})

test('unavailable terrain dominates stale success, and fallback stacks never inherit active globe elevation', () => {
  const stale = { status: 'unavailable', fetchSuccesses: 3 }
  assert.equal(resolveWorldViewSourceStatus({ ...globe, terrainStatus: stale }).elevation.status, S.FALLBACK)
  for (const stackId of ['openfreemap-positron', 'osm', 'atlas-fallback']) {
    const result = resolveWorldViewSourceStatus({ ...globe, stackId, terrainStatus: { status: 'active', fetchSuccesses: 3 } })
    assert.equal(result.elevation.status, S.INACTIVE)
    assert.equal(result.renderer.status, S.FALLBACK)
    assert.equal(result.buildings.status, S.NOT_IMPLEMENTED)
  }
  const atlas = resolveWorldViewSourceStatus({ ...globe, stackId: 'atlas-fallback' })
  assert.equal(atlas.imagery.status, S.FALLBACK)
  assert.equal(atlas.imagery.source, 'Natural Earth via world-atlas 110m')
})

test('unrecognized or unready runtime remains unknown; resolver does not mutate inputs', () => {
  const input = { ...globe, terrainStatus: { status: 'active', fetchSuccesses: 1 } }
  const before = structuredClone(input)
  resolveWorldViewSourceStatus(input)
  assert.deepEqual(input, before)
  assert.equal(resolveWorldViewSourceStatus({ ...input, rendererReady: false }).elevation.status, S.UNKNOWN)
  assert.equal(resolveWorldViewSourceStatus({ ...input, stackId: 'unknown' }).renderer.status, S.UNKNOWN)
  assert.equal(resolveWorldViewSourceStatus({ ...input, stackId: 'unknown' }).imagery.source, null)
  assert.equal(resolveWorldViewSourceStatus().requested.status, S.UNKNOWN)
  assert.ok(Object.isFrozen(resolveWorldViewSourceStatus(input).elevation))
})
