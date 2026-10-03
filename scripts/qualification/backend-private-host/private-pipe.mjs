// Framing component, not an authority or production adapter factory. Production
// code constructs it only from its fixed internally spawned worker. Closed tests
// can exercise bytes/lifecycle with EventEmitter streams; these confer no trust.
import { exactKeys } from '../backend-live-rehearsal/inert.mjs'
import { bindHostInert } from './inert.mjs'

export const MAX_PRIVATE_FRAME = 16 * 1024 * 1024
const OPERATIONS = new Set(['connect_primary', 'connect_verifier', 'execute', 'cancel_and_drain', 'finish'])

export class FixedPrivatePipe {
  #child; #buffer = Buffer.alloc(0); #pending = null; #sequence = 0; #closed = false
  constructor(child) {
    this.#child = child
    child.stdout.on('data', bytes => this.#receive(bytes))
    child.stdout.on('error', () => this.#fail())
    child.stdin.on('error', () => this.#fail())
    child.on('error', () => this.#fail())
    child.on('exit', () => this.#fail())
  }
  get hasPending() { return this.#pending !== null }
  get closed() { return this.#closed }
  #fail(code = 'PRIVATE_PIPE_UNAVAILABLE') {
    if (this.#closed) return
    this.#closed = true; this.#buffer.fill(0); this.#buffer = Buffer.alloc(0)
    const pending = this.#pending; this.#pending = null
    pending?.reject(new Error(code))
    // Native socket closure is never a rollback or command acknowledgment.
    for (const stream of [this.#child.stdin, this.#child.stdout]) {
      try { stream.destroy() } catch { /* No raw diagnostics. */ }
    }
    try { this.#child.kill() } catch { /* No raw diagnostics. */ }
  }
  #receive(bytes) {
    if (this.#closed) return
    if (!Buffer.isBuffer(bytes) || this.#buffer.length + bytes.length > MAX_PRIVATE_FRAME) { this.#fail('PRIVATE_PIPE_PROTOCOL_REFUSED'); return }
    this.#buffer = Buffer.concat([this.#buffer, bytes])
    const end = this.#buffer.indexOf(10)
    if (end < 0) return
    // Unsolicited, extra or out-of-sequence output terminates the worker. A
    // matching typed error reply permits an explicit native drain request.
    if (!this.#pending || end !== this.#buffer.length - 1) { this.#fail('PRIVATE_PIPE_PROTOCOL_REFUSED'); return }
    let frame
    try { frame = JSON.parse(this.#buffer.subarray(0, end).toString('utf8')) }
    catch { this.#fail('PRIVATE_PIPE_PROTOCOL_REFUSED'); return }
    this.#buffer.fill(0); this.#buffer = Buffer.alloc(0)
    if (!exactKeys(frame, ['sequence', 'ok', 'result']) || frame.sequence !== this.#pending.sequence || typeof frame.ok !== 'boolean') {
      this.#fail('PRIVATE_PIPE_PROTOCOL_REFUSED'); return
    }
    const pending = this.#pending; this.#pending = null
    if (!frame.ok) { pending.reject(new Error('PRIVATE_PIPE_COMMAND_REFUSED')); return }
    pending.resolve(frame.result)
  }
  async request(operation, privatePayload = {}) {
    if (this.#closed) throw new Error('PRIVATE_PIPE_UNAVAILABLE')
    if (this.#pending) throw new Error('PRIVATE_PIPE_PENDING')
    if (!OPERATIONS.has(operation)) throw new Error('PRIVATE_PIPE_INPUT_REFUSED')
    const bound = bindHostInert(privatePayload, 'PRIVATE_PIPE_INPUT_REFUSED')
    const sequence = ++this.#sequence
    const frame = Buffer.from(`${JSON.stringify({ sequence, operation, privatePayload: bound })}\n`, 'utf8')
    if (frame.length > MAX_PRIVATE_FRAME) { frame.fill(0); throw new Error('PRIVATE_PIPE_FRAME_REFUSED') }
    try {
      return await new Promise((resolve, reject) => {
        this.#pending = { sequence, resolve, reject }
        try { this.#child.stdin.write(frame, error => { if (error) this.#fail() }) }
        catch { this.#fail() }
      })
    } finally { frame.fill(0) }
  }
  finish() { this.#fail() }
}
