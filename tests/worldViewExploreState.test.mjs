import test from 'node:test'
import assert from 'node:assert/strict'
import { createExploreSession } from '../src/lib/worldViewExploreState.js'
import { serializeCameraState } from '../src/lib/worldViewCameraState.js'

const cameraState = serializeCameraState({ lon: -81.7, lat: 41.4, heightMeters: 5000, headingDegrees: 27, pitchDegrees: -62, rollDegrees: 0 })
const contextToken = { subjectKey: 'cleveland', version: 'revision-1', timeToken: JSON.stringify({ as_of_time: '2026-09-03T16:00:00Z', selected_time_range: null }) }

test('Explore captures normalized display camera, clock and scroll; exit restores that exact view once', () => {
  const session = createExploreSession(), calls = []
  const raw = { ...JSON.parse(cameraState), lon: 278.3, headingDegrees: 387 }
  const snapshot = session.enter({ cameraState: raw, contextToken, capturedAt: 1234, scrollPosition: { x: 7, y: 440 } })
  assert.equal(snapshot.cameraState, cameraState)
  assert.equal(snapshot.capturedAt, 1234)
  assert.equal(Object.isFrozen(snapshot), true)
  const result = session.exit({ contextToken: { ...contextToken }, restoreCamera: state => { calls.push(state); return true } })
  assert.equal(result.reason, 'restored')
  assert.equal(result.restored, true)
  assert.deepEqual(result.scrollPosition, { x: 7, y: 440 })
  assert.deepEqual(calls, [cameraState])
  assert.equal(session.exit({ contextToken, restoreCamera: () => assert.fail('must not restore twice') }).reason, 'inactive')
})

for (const [field, value] of [['subjectKey', 'another-place'], ['version', 'revision-2'], ['timeToken', '2026-10-01T12:00:00Z'], ['investigationKey', 'another-investigation']]) {
  test(`Explore ${field} drift preserves the new canonical state and never restores the old camera`, () => {
    const session = createExploreSession()
    session.enter({ cameraState, contextToken })
    const current = Object.freeze({ ...contextToken, [field]: value })
    assert.equal(session.observe(current), true)
    const result = session.exit({ contextToken: current, restoreCamera: () => assert.fail('stale restore') })
    assert.equal(result.reason, 'context-changed')
    assert.equal(result.restored, false)
    assert.equal(current[field], value)
  })
}

test('a subject/time excursion invalidates restoration even if canonical fields later return', () => {
  const session = createExploreSession()
  session.enter({ cameraState, contextToken })
  session.observe({ ...contextToken, timeToken: 'another time' })
  session.observe(contextToken)
  assert.equal(session.exit({ contextToken, restoreCamera: () => assert.fail('excursion must stay invalidated') }).reason, 'context-changed')
})

test('exit independently detects time drift when no observe effect has run yet', () => {
  const session = createExploreSession()
  session.enter({ cameraState, contextToken })
  assert.equal(session.exit({ contextToken: { ...contextToken, timeToken: 'changed' }, restoreCamera: () => assert.fail('stale') }).reason, 'context-changed')
})

for (const invalid of [null, '{bad', { version: 999 }, { ...JSON.parse(cameraState), lat: NaN }]) {
  test(`invalid camera fails safely: ${JSON.stringify(invalid)}`, () => {
    const session = createExploreSession()
    session.enter({ cameraState: invalid, contextToken })
    assert.equal(session.exit({ contextToken, restoreCamera: () => assert.fail('invalid') }).reason, 'invalid-camera')
  })
}

test('missing canonical time/version token cannot qualify a camera restore', () => {
  for (const token of [null, {}, { subjectKey: 'a', version: 'v' }, { ...contextToken, version: {} }]) {
    const session = createExploreSession()
    session.enter({ cameraState, contextToken: token, scrollPosition: { x: NaN, y: Infinity } })
    const result = session.exit({ contextToken: token, restoreCamera: () => assert.fail('invalid context') })
    assert.equal(result.reason, 'invalid-context')
    assert.deepEqual(result.scrollPosition, { x: 0, y: 0 })
  }
})

test('re-enter while active retains the original snapshot; clear is local and reusable', () => {
  const session = createExploreSession()
  const first = session.enter({ cameraState, contextToken })
  assert.equal(session.enter({ cameraState: null, contextToken: null }), first)
  session.clear()
  assert.equal(session.getSnapshot(), null)
  assert.notEqual(session.enter({ cameraState, contextToken }), first)
})

test('adapter unavailable, rejection and exceptions release the session without partial canonical edits', () => {
  for (const [restoreCamera, reason] of [[undefined, 'restore-unavailable'], [() => false, 'restore-rejected'], [() => { throw new Error('disposed renderer') }, 'restore-failed']]) {
    const session = createExploreSession()
    session.enter({ cameraState, contextToken })
    assert.equal(session.exit({ contextToken, restoreCamera }).reason, reason)
    assert.equal(session.getSnapshot(), null)
  }
})
