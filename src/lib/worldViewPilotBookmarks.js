import { makeCameraState, minCameraHeightMetersForPrecisionClass, serializeCameraState } from './worldViewCameraState.js'
import { EARTH_SEMI_MAJOR_METERS } from './worldViewMapStack.js'

// Requested display poses, not source coverage or promised building detail.
// The exact point of interest comes from the selected canonical projection row.
// Oblique camera positions are display-only offsets around that point.
const PILOT_POSES = Object.freeze([
  Object.freeze({ id: 'globe', label: 'Globe', heightMeters: 20000000, headingDegrees: 0, pitchDegrees: -90 }),
  Object.freeze({ id: 'regional', label: 'Regional', heightMeters: 750000, headingDegrees: 0, pitchDegrees: -90 }),
  Object.freeze({ id: 'city', label: 'City', heightMeters: 60000, headingDegrees: 0, pitchDegrees: -90 }),
  Object.freeze({ id: 'close-oblique', label: 'Close oblique', heightMeters: 12000, headingDegrees: 25, pitchDegrees: -45 }),
])

function obliqueCameraPosition(coordinate, state) {
  const radians = Math.PI / 180
  const depression = -state.pitchDegrees * radians
  const radius = EARTH_SEMI_MAJOR_METERS
  // Spherical ray/surface intersection gives the surface arc required at the
  // ACCEPTED altitude and pitch. Earth uses the existing public camera radius.
  // This is approximate framing, not a surveyed ellipsoid/terrain solution.
  const angle = Math.asin(Math.min(1, (1 + state.heightMeters / radius) * Math.cos(depression)))
    - (Math.PI / 2 - depression)
  const bearing = (state.headingDegrees + 180) * radians
  const lat = coordinate[1] * radians
  const nextLat = Math.asin(Math.max(-1, Math.min(1,
    Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(bearing))))
  const nextLon = coordinate[0] * radians + Math.atan2(
    Math.sin(bearing) * Math.sin(angle) * Math.cos(lat),
    Math.cos(angle) - Math.sin(lat) * Math.sin(nextLat))
  return { lon: nextLon / radians, lat: nextLat / radians, groundOffsetMeters: angle * radius }
}

/**
 * Four stable, reversible camera bookmarks for Cleveland's current row (or a
 * separately approved regression location). No row, identity or time is held
 * here. Consumers apply cameraState through the existing setCameraState seam;
 * keep an existing getCameraState snapshot for return, and use existing cancel
 * and reset actions. The renderer rechecks the current precision on application.
 * pointOfInterest preserves the exact input coordinate. The close-oblique
 * camera is displaced opposite its heading using spherical framing only;
 * browser checks must verify the point is visible on the actual ellipsoid.
 */
export function createWorldViewPilotBookmarks({ coordinate, precisionClass = null } = {}) {
  if (!Array.isArray(coordinate) || coordinate.length < 2
    || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])
    || coordinate[0] < -180 || coordinate[0] > 180 || coordinate[1] < -90 || coordinate[1] > 90) return Object.freeze([])
  const minHeightMeters = minCameraHeightMetersForPrecisionClass(precisionClass)
  const pointOfInterest = Object.freeze([coordinate[0], coordinate[1]])
  return Object.freeze(PILOT_POSES.map(pose => {
    let state = makeCameraState({ lon: coordinate[0], lat: coordinate[1],
      heightMeters: pose.heightMeters, headingDegrees: pose.headingDegrees,
      pitchDegrees: pose.pitchDegrees, rollDegrees: 0 }, precisionClass)
    const offset = pose.id === 'close-oblique' ? obliqueCameraPosition(coordinate, state) : null
    if (offset) state = makeCameraState({ ...state, lon: offset.lon, lat: offset.lat }, precisionClass)
    const heightConstrained = state.heightMeters > pose.heightMeters
    const precisionDisclosure = heightConstrained
      ? `Requested ${pose.heightMeters.toLocaleString('en-US')} m; accepted ${Math.round(state.heightMeters).toLocaleString('en-US')} m at the existing ${precisionClass} precision floor. No finer evidence precision or building detail is implied.`
      : `Display camera only; evidence precision remains ${precisionClass ?? 'unknown'}. Source detail and capture time are independent.`
    return Object.freeze({ id: pose.id, label: pose.label,
      cameraState: serializeCameraState(state, precisionClass),
      pointOfInterest, cameraGroundOffsetMeters: offset?.groundOffsetMeters ?? 0,
      requestedHeightMeters: pose.heightMeters, acceptedHeightMeters: state.heightMeters,
      precisionClass, minHeightMeters, heightConstrained,
      disclosure: precisionDisclosure + (offset
        ? ' Spherical approximation for camera framing only; the point of interest retains the exact source coordinate.' : ''),
    })
  }))
}
