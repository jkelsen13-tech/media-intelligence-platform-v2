// R4.9 Stage C — renderer-neutral, serializable camera-state contract.
//
// Governing spec: MIP_WORLD_VIEW_TRUE_GLOBE_AND_PROGRESSIVE_3D_v0.1_2026-09-03.md
// §5.7 (adapter seam), §16 Stage C, §17 tests 2–7.
//
// This module is the single, renderer-neutral definition of a World View
// camera state. It is DISPLAY-only:
// - Camera state is never written into Investigation Context, canonical
//   identity, the hash, or deep-link routes.
// - Restoring a camera never changes the canonical subject, selected time
//   range, precision class, or any projection row.
// - The height floor per precision class keeps the measured ~5 km city
//   ceiling in meters: a parsed/restored camera can never sit lower (finer)
//   than the recorded precision class allows. Camera movement must not
//   invent finer geographic precision.
//
// State shape (all numbers, degrees for angles, meters for height):
//   {
//     version: 1,
//     lon: number,            // [-180, 180)  — wraps; multi-revolution east/west is representable
//     lat: number,            // [-90, 90]    — both poles are valid, navigable states
//     heightMeters: number,   // >= precision-class floor when a class is known
//     headingDegrees: number, // [0, 360)
//     pitchDegrees: number,   // [-90, 90], negative looks down
//     rollDegrees: number,
//   }

import { heightMetersForPrecisionClass } from './worldViewMapStack.js'

export const CAMERA_STATE_VERSION = 1

const CAMERA_STATE_KEYS = Object.freeze([
  'version',
  'lon',
  'lat',
  'heightMeters',
  'headingDegrees',
  'pitchDegrees',
  'rollDegrees',
])

/** Wrap any longitude (including multi-revolution values) into [-180, 180). */
export function normalizeLongitudeDegrees(lon) {
  const value = typeof lon === 'number' ? lon : Number.NaN
  if (!Number.isFinite(value)) return null
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180
  return Object.is(wrapped, -0) ? 0 : wrapped
}

/** Clamp latitude into [-90, 90]. Both poles remain reachable. */
export function clampLatitudeDegrees(lat) {
  const value = typeof lat === 'number' ? lat : Number.NaN
  if (!Number.isFinite(value)) return null
  return Math.min(90, Math.max(-90, value))
}

/** Wrap heading into [0, 360). */
export function normalizeHeadingDegrees(heading) {
  const value = typeof heading === 'number' ? heading : Number.NaN
  if (!Number.isFinite(value)) return null
  const wrapped = ((value % 360) + 360) % 360
  return Object.is(wrapped, -0) ? 0 : wrapped
}

/** Clamp pitch into [-90, 90]. */
export function clampPitchDegrees(pitch) {
  const value = typeof pitch === 'number' ? pitch : Number.NaN
  if (!Number.isFinite(value)) return null
  return Math.min(90, Math.max(-90, value))
}

/** Clamp roll into [-180, 180]. */
export function clampRollDegrees(roll) {
  const value = typeof roll === 'number' ? roll : Number.NaN
  if (!Number.isFinite(value)) return null
  return Math.min(180, Math.max(-180, value))
}

/**
 * Lowest (finest) camera height allowed for a recorded precision class, in
 * meters above the ellipsoid. When no class is known there is no floor —
 * the camera itself never invents a finer class.
 */
export function minCameraHeightMetersForPrecisionClass(precisionClass) {
  if (precisionClass === null || precisionClass === undefined || precisionClass === '') return 0
  return heightMetersForPrecisionClass(precisionClass)
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Normalize and validate raw fields into a camera state. Returns null when
 * any component is non-numeric/non-finite. When a precision class is given,
 * the height is clamped UP to the class floor so a restored camera can
 * never inspect finer than the recorded class ceiling (the ~5 km city
 * ceiling, expressed in meters).
 */
export function makeCameraState(fields, precisionClass = null) {
  if (!fields || typeof fields !== 'object') return null

  const lon = normalizeLongitudeDegrees(fields.lon)
  const lat = clampLatitudeDegrees(fields.lat)
  const headingDegrees = normalizeHeadingDegrees(fields.headingDegrees ?? 0)
  const pitchDegrees = clampPitchDegrees(fields.pitchDegrees ?? 0)
  const rollDegrees = clampRollDegrees(fields.rollDegrees ?? 0)
  let heightMeters = finiteNumber(fields.heightMeters)

  if (lon === null || lat === null || heightMeters === null) return null
  if (headingDegrees === null || pitchDegrees === null || rollDegrees === null) return null
  if (heightMeters < 0) heightMeters = 0

  const floor = minCameraHeightMetersForPrecisionClass(precisionClass)
  if (heightMeters < floor) heightMeters = floor

  return Object.freeze({
    version: CAMERA_STATE_VERSION,
    lon,
    lat,
    heightMeters,
    headingDegrees,
    pitchDegrees,
    rollDegrees,
  })
}

/**
 * Serialize a camera state to a stable JSON string (fixed key order).
 * Returns null for invalid input — callers must treat null as "no state".
 */
export function serializeCameraState(state, precisionClass = null) {
  const normalized = makeCameraState(state, precisionClass)
  if (!normalized) return null
  const ordered = {}
  for (const key of CAMERA_STATE_KEYS) ordered[key] = normalized[key]
  return JSON.stringify(ordered)
}

/**
 * Parse a serialized camera state (string) or a plain object into a
 * normalized camera state. FAIL-SAFE: unsupported versions, malformed
 * JSON, non-finite numbers, and any other garbage return null — never
 * throw, never partially apply. A null result must leave the renderer,
 * the Investigation Context, and the route untouched.
 */
export function parseCameraState(serialized, { precisionClass = null } = {}) {
  let raw = serialized
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (raw.version !== CAMERA_STATE_VERSION) return null
  return makeCameraState(raw, precisionClass)
}

/** Structural equality within a small epsilon (degrees/meters). */
export function cameraStatesEqual(a, b, epsilon = 1e-6) {
  if (!a || !b) return false
  return (
    a.version === b.version &&
    Math.abs(a.lon - b.lon) <= epsilon &&
    Math.abs(a.lat - b.lat) <= epsilon &&
    Math.abs(a.heightMeters - b.heightMeters) <= Math.max(epsilon, Math.abs(a.heightMeters) * 1e-9) &&
    Math.abs(a.headingDegrees - b.headingDegrees) <= epsilon &&
    Math.abs(a.pitchDegrees - b.pitchDegrees) <= epsilon &&
    Math.abs(a.rollDegrees - b.rollDegrees) <= epsilon
  )
}
