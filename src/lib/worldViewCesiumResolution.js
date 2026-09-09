import { RESOLUTION_SCALES } from './worldViewVisualFidelity.js'

// Cesium 1.145 Viewer public properties. Preserve CSS layout and its existing
// browser-recommended resolution policy; never multiply by devicePixelRatio.
export function cesiumResolutionAvailable(viewer) {
  try {
    return Boolean(viewer && !viewer.isDestroyed?.() && viewer.scene
      && viewer.useBrowserRecommendedResolution === true
      && Number.isFinite(viewer.resolutionScale) && viewer.resolutionScale > 0
      && typeof viewer.resize === 'function')
  } catch { return false }
}
export function setCesiumResolutionScale(viewer, scale) {
  if (!RESOLUTION_SCALES.includes(scale) || !cesiumResolutionAvailable(viewer)) return false
  try {
    if (viewer.resolutionScale !== scale) {
      viewer.resolutionScale = scale
      if (viewer.resolutionScale !== scale) return false
      viewer.resize()
      viewer.scene.requestRender?.()
    }
    return true
  } catch { return false }
}
export function cesiumResolutionState(viewer) {
  if (!cesiumResolutionAvailable(viewer)) return { scale: 1, available: false }
  const canvas = viewer.canvas
  return { scale: viewer.resolutionScale, available: true,
    width: canvas?.width ?? 0, height: canvas?.height ?? 0,
    cssWidth: canvas?.clientWidth ?? 0, cssHeight: canvas?.clientHeight ?? 0,
    browserRecommended: viewer.useBrowserRecommendedResolution }
}
// A rejected write stays unavailable for this viewer; neutral cleanup never
// erases the failure. No retry loop or fallback silently expands the bounds.
export function createCesiumResolutionController(getViewer) {
  let failed = false
  return {
    available: () => !failed && cesiumResolutionAvailable(getViewer()),
    set(scale) {
      if (failed && scale !== 1) return false
      const accepted = setCesiumResolutionScale(getViewer(), scale)
      if (!accepted) {
        failed = true
        setCesiumResolutionScale(getViewer(), 1)
      }
      return accepted
    },
    hasFailed: () => failed,
  }
}
