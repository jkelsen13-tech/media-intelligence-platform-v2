import { TERRAIN_REFINEMENT } from './worldViewVisualFidelity.js'

// Cesium 1.145 public Globe.maximumScreenSpaceError. The provider retains its
// own coverage, maximum zoom, provenance and failure policy; this changes only
// which approved level of detail the globe requests for the current camera.
function globeFor(viewer) {
  try {
    const globe = viewer?.scene?.globe
    return viewer && !viewer.isDestroyed?.() && globe &&
      Number.isFinite(globe.maximumScreenSpaceError) && globe.maximumScreenSpaceError > 0 ? globe : null
  } catch { return null }
}
export function createCesiumRefinementController(getViewer, hasApprovedTerrain) {
  let failed = false
  const available = () => {
    try { return !failed && Boolean(globeFor(getViewer())) && hasApprovedTerrain() === true }
    catch { return false }
  }
  function write(value) {
    const viewer = getViewer(), globe = globeFor(viewer)
    if (!globe) return false
    try {
      if (globe.maximumScreenSpaceError !== value) {
        globe.maximumScreenSpaceError = value
        if (globe.maximumScreenSpaceError !== value) return false
        viewer.scene.requestRender?.()
      }
      return true
    } catch { return false }
  }
  return {
    available,
    set(mode) {
      if (typeof mode !== 'string' || !Object.hasOwn(TERRAIN_REFINEMENT, mode)) return false
      if (mode !== 'neutral' && !available()) return false
      const accepted = write(TERRAIN_REFINEMENT[mode])
      if (!accepted) {
        failed = true
        write(TERRAIN_REFINEMENT.neutral)
      }
      return accepted
    },
    hasFailed: () => failed,
    state() {
      const value = globeFor(getViewer())?.maximumScreenSpaceError
      return { available: available(), screenSpaceError: value ?? null,
        mode: Object.keys(TERRAIN_REFINEMENT).find(mode => TERRAIN_REFINEMENT[mode] === value) ?? null }
    },
  }
}
