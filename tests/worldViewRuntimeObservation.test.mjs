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
  const failed = provider.requestImage(12)
  assert.equal(failed, value, 'rejected Promise identity is unchanged')
  await assert.rejects(failed, e => e === error)
  assert.equal(observation.snapshot().status, 'unavailable')
  const image = {}
  value = Promise.resolve(image)
  const loaded = provider.requestImage(12)
  assert.equal(loaded, value, 'fulfilled Promise identity is unchanged')
  assert.equal(await loaded, image)
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
  assert.equal(p.requestImage(), image, 'synchronous image stays synchronous')
  assert.equal(observeWorldViewImagery({}).snapshot().status, 'loading')
})

test('original custom thenable, receiver, arguments and caller handlers remain intact', () => {
  const registrations = [], token = Symbol('observer chain'), image = {}
  const result = { then(resolve, reject) { assert.equal(this, result); registrations.push({ resolve, reject }); return token } }
  const request = { state: 2, cancelled: false }
  const provider = { requestImage(...args) {
    assert.equal(this, provider)
    assert.deepEqual(args, [3, 4, 5, request])
    return result
  } }
  const observation = observeWorldViewImagery(provider)
  const returned = provider.requestImage(3, 4, 5, request)
  assert.equal(returned, result)
  let callerImage
  assert.equal(returned.then(value => { callerImage = value }), token)
  assert.equal(registrations.length, 2)
  registrations[0].resolve(image)
  registrations[1].resolve(image)
  assert.equal(callerImage, image)
  assert.equal(observation.snapshot().status, 'active')
})

test('async custom thenable rejection is observed without replacing caller failure or error identity', () => {
  const callbacks = [], error = new Error('tile failure')
  const originalThenable = { then(resolve, reject) { callbacks.push({ resolve, reject }); return {} } }
  const provider = { requestImage: () => originalThenable }
  const observation = observeWorldViewImagery(provider)
  const returned = provider.requestImage()
  assert.equal(returned, originalThenable)
  let callerError
  returned.then(() => assert.fail('unexpected success'), value => { callerError = value })
  callbacks[0].reject(error)
  callbacks[1].reject(error)
  assert.equal(callerError, error)
  assert.equal(observation.snapshot().status, 'unavailable')
})

test('sync source errors keep their identity and timing; genuine failures report unavailable', () => {
  const error = new Error('synchronous image error')
  const provider = { requestImage() { throw error } }
  const observation = observeWorldViewImagery(provider)
  assert.throws(() => provider.requestImage(), value => value === error)
  assert.equal(observation.snapshot().status, 'unavailable')
})

test('scheduler deferrals and empty/primitive results never qualify active imagery or change result semantics', async () => {
  for (const value of [undefined, null, false, 0, true, 'not an image']) {
    const provider = { requestImage: () => value }
    const observation = observeWorldViewImagery(provider)
    assert.equal(provider.requestImage(), value)
    assert.equal(observation.snapshot().status, 'loading')
    const promise = Promise.resolve(value)
    provider.requestImage = () => promise
    const asyncObservation = observeWorldViewImagery(provider)
    assert.equal(provider.requestImage(), promise)
    assert.equal(await promise, value)
    assert.equal(asyncObservation.snapshot().status, 'loading')
    observation.dispose(); asyncObservation.dispose()
  }
})

test('AbortError and known Cesium request cancellations before success remain loading while caller rejection is preserved', async () => {
  const cases = [
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), undefined],
    [Object.assign(new Error('Request cancelled: "https://example.test/tile.png"'), { name: 'RuntimeError' }), undefined],
    [new Error('request failed'), { state: 4, cancelled: false }],
    [new Error('request failed'), { state: 2, cancelled: true }],
  ]
  for (const [error, request] of cases) {
    const original = Promise.reject(error), events = []
    const provider = { requestImage: () => original }
    const observation = observeWorldViewImagery(provider, { onStatus: status => events.push(status) })
    const returned = provider.requestImage(0, 0, 0, request)
    assert.equal(returned, original)
    await assert.rejects(returned, value => value === error)
    assert.equal(observation.snapshot().status, 'loading')
    assert.deepEqual(events, [])
  }
})

test('sync cancellation and late success of a cancelled request never mark source unavailable or active', async () => {
  const error = Object.assign(new Error('abort'), { name: 'AbortError' })
  const sync = { requestImage() { throw error } }
  const observation = observeWorldViewImagery(sync)
  assert.throws(() => sync.requestImage(), value => value === error)
  assert.equal(observation.snapshot().status, 'loading')
  let resolve
  const request = { state: 2, cancelled: false }
  const original = new Promise(done => { resolve = done })
  const provider = { requestImage: () => original }
  const pendingObservation = observeWorldViewImagery(provider)
  assert.equal(provider.requestImage(0, 0, 0, request), original)
  request.state = 4
  resolve({})
  await original
  assert.equal(pendingObservation.snapshot().status, 'loading')
})

test('ordinary errors with cancellation-like text are not silently classified as cancellation', async () => {
  for (const error of [new Error('Request cancelled: "url"'), new Error('cancel failed'),
    Object.assign(new Error('network cancelled unexpectedly'), { name: 'RuntimeError' })]) {
    const original = Promise.reject(error)
    const provider = { requestImage: () => original }
    const observation = observeWorldViewImagery(provider)
    await assert.rejects(provider.requestImage(), value => value === error)
    assert.equal(observation.snapshot().status, 'unavailable')
  }
})

test('cancelled or failed tiles after genuine image success do not erase active source status', async () => {
  let result = Promise.resolve({})
  const events = [], provider = { requestImage: () => result }
  const observation = observeWorldViewImagery(provider, { onStatus: value => events.push(value) })
  assert.equal(provider.requestImage(), result)
  await result
  for (const error of [Object.assign(new Error('abort'), { name: 'AbortError' }), new Error('network error')]) {
    result = Promise.reject(error)
    assert.equal(provider.requestImage(), result)
    await assert.rejects(result, value => value === error)
    assert.equal(observation.snapshot().status, 'active')
  }
  assert.deepEqual(events, [{ status: 'active' }])
})

test('cancelled lifetime and disposal silence late rejection without swallowing caller failure', async () => {
  for (const stop of ['cancel', 'dispose']) {
    let reject, cancelled = false
    const error = new Error('late failure'), events = []
    const original = new Promise((resolve, fail) => { reject = fail })
    const provider = { requestImage: () => original }
    const observation = observeWorldViewImagery(provider, { onStatus: value => events.push(value), isCancelled: () => cancelled })
    const returned = provider.requestImage()
    if (stop === 'cancel') cancelled = true
    else observation.dispose()
    reject(error)
    await assert.rejects(returned, value => value === error)
    assert.deepEqual(events, [])
    assert.equal(observation.snapshot().status, 'loading')
  }
})

test('throwing metadata callbacks, lifetime probes and request probes cannot change source success or failure', async () => {
  for (const configuration of [{ onStatus() { throw new Error('callback') } },
    { isCancelled() { throw new Error('lifetime probe') } }]) {
    const image = {}, error = new Error('source failure')
    let result = Promise.reject(error)
    const provider = { requestImage: () => result }
    observeWorldViewImagery(provider, configuration)
    assert.equal(provider.requestImage(), result)
    await assert.rejects(result, value => value === error)
    result = Promise.resolve(image)
    assert.equal(provider.requestImage(), result)
    assert.equal(await result, image)
  }
  const request = { get cancelled() { throw new Error('request probe') } }
  const image = {}, provider = { requestImage: () => image }
  const observation = observeWorldViewImagery(provider)
  assert.equal(provider.requestImage(0, 0, 0, request), image)
  assert.equal(observation.snapshot().status, 'loading')
})

test('thenable probing failures, readonly provider and dispose ownership do not alter source objects', () => {
  const image = {}, probeError = new Error('then getter')
  const result = { get then() { throw probeError } }
  const provider = { requestImage: () => result }
  const observation = observeWorldViewImagery(provider)
  assert.equal(provider.requestImage(), result)
  assert.equal(observation.snapshot().status, 'loading')
  const throwingThenable = { then() { throw new Error('then observation failed') } }
  const nextProvider = { requestImage: () => throwingThenable }
  const nextObservation = observeWorldViewImagery(nextProvider)
  assert.equal(nextProvider.requestImage(), throwingThenable)
  assert.equal(nextObservation.snapshot().status, 'loading')
  const readonly = Object.freeze({ requestImage: () => image })
  const readonlyObservation = observeWorldViewImagery(readonly)
  assert.equal(readonly.requestImage(), image)
  assert.doesNotThrow(() => readonlyObservation.dispose())
  const replacement = () => image
  provider.requestImage = replacement
  observation.dispose()
  assert.equal(provider.requestImage, replacement, 'dispose does not overwrite another owner')
})
