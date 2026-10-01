import test from 'node:test'
import assert from 'node:assert/strict'
import { observeWorldViewImagery } from '../src/lib/worldViewRuntimeObservation.js'

test('imagery observations preserve scheduler deferrals, original results and failure identity', async () => {
  const events = [], error = new Error('source unavailable')
  let value
  const provider = { requestImage(a) { assert.equal(this, provider); assert.equal(a, 12); return value } }
  const original = provider.requestImage
  const observation = observeWorldViewImagery(provider, { onStatus: next => events.push(next) })
  assert.equal(provider.requestImage(12), undefined)
  assert.equal(observation.snapshot().status, 'loading')
  value = Promise.reject(error)
  await assert.rejects(provider.requestImage(12), e => e === error)
  assert.equal(observation.snapshot().status, 'unavailable')
  const image = {}
  value = Promise.resolve(image)
  assert.equal(await provider.requestImage(12), image)
  assert.equal(await provider.requestImage(12), image)
  assert.deepEqual(events, [{ status: 'unavailable' }, { status: 'active' }])
  value = Promise.reject(error)
  await assert.rejects(provider.requestImage(12), e => e === error)
  assert.equal(observation.snapshot().status, 'active', 'one failed tile does not erase earlier source success')
  observation.dispose(); assert.equal(provider.requestImage, original)
})

test('late completion after disposal/cancellation is silent; metadata exceptions cannot break image loading', async () => {
  let resolve, cancelled = false
  const events = [], provider = { requestImage: () => new Promise(done => { resolve = done }) }
  const observation = observeWorldViewImagery(provider, { onStatus: next => events.push(next), isCancelled: () => cancelled })
  const pending = provider.requestImage()
  cancelled = true; resolve({}); await pending
  assert.deepEqual(events, [])
  const next = provider.requestImage()
  observation.dispose(); resolve({}); await next
  assert.deepEqual(events, [])
  const image = {}, p = { requestImage: () => image }
  observeWorldViewImagery(p, { onStatus: () => { throw new Error('metadata callback') } })
  assert.equal(await p.requestImage(), image)
  assert.equal(observeWorldViewImagery({}).snapshot().status, 'loading')
})
