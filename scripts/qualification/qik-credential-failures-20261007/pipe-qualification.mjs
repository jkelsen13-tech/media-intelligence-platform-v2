// Closed stream models exercise the existing pipe/controller. No process,
// socket, installed native library, secret route, or production adapter is used.
import { EventEmitter } from 'node:events'
import { FixedPrivatePipe, MAX_PRIVATE_FRAME } from '../backend-private-host/private-pipe.mjs'
import { runClosedHostQualification } from '../backend-private-host/controller.mjs'
import { inspectPrivateBridgeGate, createFixedProductionPort } from '../backend-private-host/bridge.mjs'

export const DUMMY_PASSWORD = 'SYNTHETIC_ONLY_PASSWORD_20261007'
export const DUMMY_URI = `postgresql://SYNTHETIC_ONLY_USER_20261007:${DUMMY_PASSWORD}@credential-test.invalid:5432/SYNTHETIC_ONLY_DB_20261007?sslmode=verify-full`
const markers = [DUMMY_PASSWORD, DUMMY_URI, 'TEST_ONLY_PRIVATE_ROW_MARKER_7d6b', 'TEST_ONLY_PRIVATE_CONFIG_MARKER_4219']
const check = (ok, code) => { if (!ok) throw new Error(code) }
const noMarker = text => markers.every(marker => !text.includes(marker))

class ClosedChild extends EventEmitter {
  constructor(onWrite = () => {}) {
    super()
    this.stdout = new EventEmitter()
    this.stdin = new EventEmitter()
    this.stdout.destroy = () => { this.stdoutDestroyed = true }
    this.stdin.destroy = () => { this.stdinDestroyed = true }
    this.stdin.write = (bytes, callback) => {
      this.privateFrame = bytes
      this.writeCount = (this.writeCount ?? 0) + 1
      onWrite(this, callback)
      return true
    }
    this.kill = () => { this.killed = true }
  }
}

async function refusal(work, expected) {
  let error
  try { await work() } catch (caught) { error = caught }
  check(error instanceof Error, 'PIPE_REFUSAL_MISSING')
  check(error.message === expected, 'PIPE_CODE_MISMATCH')
  check(noMarker(error.message) && noMarker(error.stack ?? ''), 'PIPE_ERROR_EXPOSED')
  check(noMarker(JSON.stringify(error)), 'PIPE_ERROR_OBJECT_EXPOSED')
}

function reply(child, result, ok = false, sequence = 1) {
  child.stdout.emit('data', Buffer.from(`${JSON.stringify({ sequence, ok, result })}\n`))
}

export async function runPipeMatrix() {
  const cases = []
  const run = async (name, boundary, probe) => {
    try { await probe(); cases.push({ case: name, boundary, passed: true }) }
    catch { cases.push({ case: name, boundary, passed: false, code: 'CLOSED_PROBE_FAILED' }) }
  }
  const payload = { password: DUMMY_PASSWORD, uri: DUMMY_URI }
  for (const where of ['child', 'stdin', 'stdout']) {
    await run(`credential-bearing-${where}-error`, 'FixedPrivatePipe/event-errors', async () => {
      const child = new ClosedChild()
      const pipe = new FixedPrivatePipe(child)
      const pending = pipe.request('connect_primary', payload)
      ;(where === 'child' ? child : child[where]).emit('error', new Error(DUMMY_URI + DUMMY_PASSWORD))
      await refusal(() => pending, 'PRIVATE_PIPE_UNAVAILABLE')
      check(pipe.closed && child.killed, 'PIPE_NOT_TERMINATED')
      check(child.privateFrame.every(byte => byte === 0), 'PRIVATE_FRAME_NOT_WIPED')
    })
  }
  for (const mode of ['callback', 'throw']) {
    await run(`credential-bearing-write-${mode}`, 'FixedPrivatePipe/write-errors', async () => {
      const child = new ClosedChild((_, callback) => {
        if (mode === 'callback') callback(new Error(DUMMY_URI))
        else throw new Error(DUMMY_PASSWORD)
      })
      const pipe = new FixedPrivatePipe(child)
      await refusal(() => pipe.request('connect_primary', payload), 'PRIVATE_PIPE_UNAVAILABLE')
      check(child.privateFrame.every(byte => byte === 0), 'PRIVATE_FRAME_NOT_WIPED')
    })
  }
  for (const mode of ['malformed-json', 'wrong-sequence', 'extra-frame', 'wrong-type', 'error-reply']) {
    await run(`credential-bearing-${mode}`, 'FixedPrivatePipe/reply-validation', async () => {
      const child = new ClosedChild()
      const pipe = new FixedPrivatePipe(child)
      const pending = pipe.request('connect_primary', payload)
      if (mode === 'malformed-json') child.stdout.emit('data', Buffer.from(`${DUMMY_URI}\n`))
      if (mode === 'wrong-sequence') reply(child, { message: DUMMY_URI }, true, 9)
      if (mode === 'extra-frame') child.stdout.emit('data', Buffer.from(`${DUMMY_URI}\n${DUMMY_PASSWORD}\n`))
      if (mode === 'wrong-type') child.stdout.emit('data', DUMMY_URI)
      if (mode === 'error-reply') reply(child, { code: DUMMY_URI, password: DUMMY_PASSWORD })
      await refusal(() => pending, mode === 'error-reply' ? 'PRIVATE_PIPE_COMMAND_REFUSED' : 'PRIVATE_PIPE_PROTOCOL_REFUSED')
      check(child.privateFrame.every(byte => byte === 0), 'PRIVATE_FRAME_NOT_WIPED')
      pipe.finish()
    })
  }
  await run('operation-contains-credential', 'FixedPrivatePipe/input-validation', async () => {
    const child = new ClosedChild(), pipe = new FixedPrivatePipe(child)
    await refusal(() => pipe.request(DUMMY_URI, payload), 'PRIVATE_PIPE_INPUT_REFUSED')
    check(child.writeCount === undefined, 'INVALID_OPERATION_WRITTEN')
    pipe.finish()
  })
  await run('throwing-accessor-payload', 'FixedPrivatePipe/inert-input-binding', async () => {
    let invoked = false
    const hostile = Object.defineProperty({ password: DUMMY_PASSWORD }, 'uri', {
      enumerable: true, get() { invoked = true; throw new Error(DUMMY_URI) },
    })
    const child = new ClosedChild(), pipe = new FixedPrivatePipe(child)
    await refusal(() => pipe.request('connect_primary', hostile), 'PRIVATE_PIPE_INPUT_REFUSED')
    check(!invoked && child.writeCount === undefined, 'ACCESSOR_EXECUTED')
    pipe.finish()
  })
  await run('throwing-proxy-payload', 'FixedPrivatePipe/inert-input-binding', async () => {
    let invoked = false
    const hostile = new Proxy(payload, { ownKeys() { invoked = true; throw new Error(DUMMY_URI) } })
    const child = new ClosedChild(), pipe = new FixedPrivatePipe(child)
    await refusal(() => pipe.request('connect_primary', hostile), 'PRIVATE_PIPE_INPUT_REFUSED')
    check(!invoked && child.writeCount === undefined, 'PROXY_EXECUTED')
    pipe.finish()
  })
  await run('oversize-private-payload', 'FixedPrivatePipe/frame-budget', async () => {
    const child = new ClosedChild(), pipe = new FixedPrivatePipe(child)
    await refusal(() => pipe.request('connect_primary', { ...payload, filler: 'x'.repeat(MAX_PRIVATE_FRAME) }), 'PRIVATE_PIPE_FRAME_REFUSED')
    check(child.writeCount === undefined, 'OVERSIZE_FRAME_WRITTEN')
    pipe.finish()
  })
  await run('pending-request-and-throwing-termination', 'FixedPrivatePipe/lifecycle', async () => {
    const child = new ClosedChild(), pipe = new FixedPrivatePipe(child)
    const first = pipe.request('connect_primary', payload)
    await refusal(() => pipe.request('execute', payload), 'PRIVATE_PIPE_PENDING')
    child.kill = () => { throw new Error(DUMMY_URI) }
    child.stdin.destroy = () => { throw new Error(DUMMY_PASSWORD) }
    pipe.finish()
    await refusal(() => first, 'PRIVATE_PIPE_UNAVAILABLE')
    await refusal(() => pipe.request('finish'), 'PRIVATE_PIPE_UNAVAILABLE')
  })
  for (const id of ['begin', 'guarded_operation', 'cancel_and_drain', 'rollback', 'verify_security_rollback']) {
    await run(`private-error-at-${id}`, 'closed-controller/public-structured-outcome', async () => {
      const faults = { [id]: { type: 'error' } }
      if (id === 'cancel_and_drain') faults.guarded_operation = { type: 'error' }
      const result = await runClosedHostQualification({ faults })
      check(noMarker(JSON.stringify(result)), 'PUBLIC_OUTCOME_EXPOSED')
      check(!result.productionAuthorized && !result.nativePg17Qualified && !result.libpqQualified, 'SCOPE_PROMOTED')
      check(result.outcome !== 'REHEARSAL_ROLLED_BACK', 'FAILURE_REPORTED_SUCCESS')
    })
  }
  await run('production-port-refuses-credential-options', 'bridge/existing-public-gate', async () => {
    await refusal(() => createFixedProductionPort(payload), 'PRIVATE_BRIDGE_INPUT_REFUSED')
    const result = await inspectPrivateBridgeGate({ claims: payload })
    check(noMarker(JSON.stringify(result)), 'BRIDGE_PUBLIC_OUTCOME_EXPOSED')
    check(result.childSpawned === false && result.liveAuthorized === false, 'BRIDGE_GATE_PROMOTED')
  })
  return { scope: 'CLOSED STREAMS AND CLOSED CONTROLLER ONLY', networkMode: 'none',
    nativeServerQualified: false, qikExecuted: false, realCredentialsUsed: false,
    providerInternalTelemetryObserved: false, tests: cases.length,
    failures: cases.filter(item => !item.passed).length, skipped: 0, cases }
}
