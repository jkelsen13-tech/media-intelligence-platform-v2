import { parseCameraState, serializeCameraState } from './worldViewCameraState.js'

// One WorldView session, above transient canvases. Only serialized display data.
// A different selected location/precision must frame itself, never inherit a
// prior subject's view. Invalid/unavailable snapshots cannot erase a good one.
export function createCameraMemory() {
  let snapshot = null
  return {
    remember(serialized, targetKey, stackId) {
      const state = parseCameraState(serialized)
      if (!state) return false
      snapshot = Object.freeze({ serialized: serializeCameraState(state), targetKey, stackId })
      return true
    },
    restore(adapter, targetKey, stackId) {
      if (!snapshot || snapshot.targetKey !== targetKey || snapshot.stackId !== stackId) return false
      return adapter?.setCameraState?.(snapshot.serialized) === true
    },
    getStackId: () => snapshot?.stackId ?? null,
  }
}

// Initial operating region, not a data boundary or a canonical subject.
// Globally extensible: ordinary globe navigation still reaches every longitude.
export function northAmericaCameraState() {
  return serializeCameraState({
    lon: -100, lat: 40, heightMeters: 12000000,
    headingDegrees: 0, pitchDegrees: -90, rollDegrees: 0,
  })
}
