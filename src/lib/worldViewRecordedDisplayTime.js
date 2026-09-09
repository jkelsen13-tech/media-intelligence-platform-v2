import { inspectionInstantMilliseconds } from './inspectionTime.js'

// Renderer-neutral display input. Preserve canonical text, including its offset
// and sub-millisecond precision; the renderer receives a millisecond derivative.
export function recordedDisplayTime(raw) {
  const atMs = inspectionInstantMilliseconds(raw)
  return Object.freeze({ sourceText: Number.isFinite(atMs) ? raw : null,
    atMs: Number.isFinite(atMs) ? atMs : null,
    available: Number.isFinite(atMs) })
}
