import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWorldViewRendererAdapter } from '../src/lib/worldViewRendererAdapter.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

for (const stackId of ['ellipsoid-globe', 'openfreemap-positron']) {
  test(`${stackId}: startup replays latest exact rows, selection, callback and shading`, async () => {
    const startup = deferred()
    const moduleLoad = deferred()
    const calls = []
    let mounts = 0
    let factoryArgs
    const initial = [{ row: { revision_id: 'old' } }]
    const latest = [{ row: { revision_id: 'corrected', evidence_refs: ['retained-v2'] } }]
    const selected = new Set(['corrected'])
    const selectedRows = []
    const callback = (row) => selectedRows.push(row)
    const factory = (args) => {
      factoryArgs = args
      return {
        mount: () => { mounts++; return startup.promise },
        setFeatures: (...args) => calls.push(['features', ...args]),
        setOnSelectRow: (fn) => calls.push(['callback', fn]),
        setReliefShadingEnabled: (enabled) => calls.push(['shading', enabled]),
      }
    }
    const adapter = createWorldViewRendererAdapter({ stackId, initialFeatures: initial }, {
      loadGlobeAdapter: () => moduleLoad.promise,
      createMapAdapter: factory,
    })
    const firstMount = adapter.mount()
    assert.equal(adapter.mount(), firstMount, 'concurrent startup shares one renderer')
    adapter.setFeatures([{ row: { revision_id: 'intermediate' } }], new Set(['intermediate']))
    moduleLoad.resolve({ createCesiumEllipsoidRendererAdapter: factory })
    await Promise.resolve()
    adapter.setFeatures(latest, selected)
    adapter.setOnSelectRow(callback)
    adapter.setReliefShadingEnabled(false)
    assert.deepEqual(calls, [], 'no updates are sent to an unready renderer')
    startup.resolve()
    await firstMount
    assert.equal(mounts, 1)
    assert.equal(factoryArgs.getSelectedKeys(), selected)
    assert.deepEqual(calls.map(call => call[0]), ['callback', 'shading', 'features'])
    assert.equal(calls[1][1], false)
    assert.equal(calls[2][1], latest, 'no copied or stale row snapshot')
    assert.equal(calls[2][2], selected)
    calls[0][1](latest[0].row)
    assert.equal(selectedRows[0], latest[0].row, 'picking retains exact corrected evidence row')
    adapter.setFeatures([], new Set())
    assert.deepEqual(calls.at(-1)[1], [], 'withdrawn geometry is removed after startup')
  })
}

test('leaving before the globe module loads cannot create a renderer', async () => {
  const moduleLoad = deferred()
  let creations = 0
  const adapter = createWorldViewRendererAdapter({ stackId: 'ellipsoid-globe' }, {
    loadGlobeAdapter: () => moduleLoad.promise,
  })
  const loading = adapter.mount()
  adapter.destroy()
  moduleLoad.resolve({ createCesiumEllipsoidRendererAdapter: () => { creations++; return {} } })
  await loading
  await adapter.mount()
  assert.equal(creations, 0)
})

test('leaving during renderer startup cancels it and never replays queued state', async () => {
  const startup = deferred()
  let factoryArgs, destroyed = 0, updates = 0
  const adapter = createWorldViewRendererAdapter({ stackId: 'openfreemap-positron' }, {
    createMapAdapter: (args) => {
      factoryArgs = args
      return { mount: () => startup.promise, destroy: () => destroyed++, setFeatures: () => updates++ }
    },
  })
  const loading = adapter.mount()
  adapter.destroy()
  adapter.destroy()
  assert.equal(factoryArgs.isCancelled(), true)
  startup.resolve()
  await loading
  adapter.setFeatures([], new Set())
  assert.equal(destroyed, 1)
  assert.equal(updates, 0)
})

test('failed globe import requests the supported fallback only while active', async () => {
  for (const leave of [false, true]) {
    const moduleLoad = deferred()
    const fallbacks = []
    const adapter = createWorldViewRendererAdapter({ stackId: 'ellipsoid-globe', onStackIdChange: (id) => fallbacks.push(id) }, {
      loadGlobeAdapter: () => moduleLoad.promise,
    })
    const loading = adapter.mount()
    if (leave) adapter.destroy()
    moduleLoad.reject(new Error('module unavailable'))
    await assert.doesNotReject(loading)
    assert.deepEqual(fallbacks, leave ? [] : ['openfreemap-positron'])
  }
})
