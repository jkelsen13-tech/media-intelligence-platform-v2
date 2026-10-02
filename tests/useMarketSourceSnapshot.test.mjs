import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { useMarketSourceSnapshot } from '../src/lib/useMarketSourceSnapshot.js'
import { marketsSourceFixture } from './fixtures/marketsSourceFixture.mjs'
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
const available = snapshot => ({ status: 'available', snapshot })
const probe = props => createElement('source-probe', useMarketSourceSnapshot(props))
test('late actor/clock/client reads cannot restore an old snapshot, and construction has no read', async () => {
  const pending = [], reader = { loadDirectory: args => new Promise(resolve => pending.push({ args, resolve })) }
  const snapshot = marketsSourceFixture(); let props = { reader, active: false, actorId: 'actor-a', at: snapshot.validAt }, renderer
  await act(async () => { renderer = TestRenderer.create(createElement(probe, props)); await flush() })
  assert.equal(pending.length, 0)
  const read = () => renderer.root.findByType('source-probe').props
  const update = async delta => act(async () => { props = { ...props, ...delta }; renderer.update(createElement(probe, props)); await flush() })
  await update({ active: true }); assert.equal(read().status, 'loading'); assert.equal(pending.length, 1)
  await update({ actorId: 'actor-b' }); assert.equal(read().snapshot, null); assert.equal(pending.length, 2)
  await act(async () => { pending[0].resolve(available(snapshot)); await flush() })
  assert.equal(read().snapshot, null)
  await act(async () => { pending[1].resolve(available(snapshot)); await flush() })
  assert.equal(read().status, 'available')
  await update({ at: '2024-04-08T18:00:00.000002Z' }); assert.equal(read().snapshot, null)
  await act(async () => { pending[2].resolve(available(snapshot)); await flush() })
  assert.equal(read().status, 'unavailable')
  await update({ at: snapshot.validAt }); assert.equal(pending.length, 4)
  await update({ reader: { loadDirectory: async () => ({ status: 'unavailable', snapshot: null }) } })
  await act(async () => { pending[3].resolve(available(snapshot)); await flush() })
  assert.equal(read().snapshot, null)
  await act(async () => renderer.unmount())
})
test('existing supplied source stays explicit; session readiness and navigation cancel pending reads', async () => {
  const snapshot = marketsSourceFixture(), pending = [], reader = { loadDirectory: () => new Promise(resolve => pending.push(resolve)) }
  let props = { reader, active: true, sessionReady: false }, renderer
  await act(async () => { renderer = TestRenderer.create(createElement(probe, props)); await flush() })
  const read = () => renderer.root.findByType('source-probe').props
  const update = async delta => act(async () => { props = { ...props, ...delta }; renderer.update(createElement(probe, props)); await flush() })
  assert.equal(pending.length, 0)
  await update({ supplied: snapshot }); assert.equal(read().snapshot, snapshot); assert.equal(pending.length, 0)
  await update({ supplied: null, sessionReady: true }); assert.equal(pending.length, 1)
  await update({ active: false }); await act(async () => { pending[0](available(snapshot)); await flush() })
  assert.equal(read().snapshot, null)
  await update({ active: true }); await act(async () => { pending[1](available(snapshot)); await flush() })
  assert.equal(read().status, 'available')
  await update({ active: false }); assert.equal(read().snapshot, snapshot)
  await update({ actorId: 'another-actor' }); assert.equal(read().snapshot, null)
  await update({ actorId: null }); assert.equal(read().snapshot, null)
  await update({ sessionReady: false }); assert.equal(read().snapshot, null)
  await act(async () => renderer.unmount())
})
