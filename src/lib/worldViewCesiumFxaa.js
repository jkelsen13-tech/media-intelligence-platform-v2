// Public Cesium 1.145 API only. The viewer owns this built-in stage and disposes
// it; MIP never allocates a duplicate pass, touches the camera or writes evidence.
export function cesiumFxaaAvailable(viewer) {
  return Boolean(viewer && !viewer.isDestroyed?.()
    && typeof viewer.scene?.postProcessStages?.fxaa?.enabled === 'boolean')
}
export function setCesiumFxaa(viewer, enabled) {
  if (typeof enabled !== 'boolean' || !cesiumFxaaAvailable(viewer)) return false
  try {
    const stage = viewer.scene.postProcessStages.fxaa
    if (stage.enabled !== enabled) {
      stage.enabled = enabled
      if (stage.enabled !== enabled) return false
      viewer.scene.requestRender?.()
    }
    return true
  } catch { return false }
}
export function cesiumFxaaState(viewer) {
  if (!cesiumFxaaAvailable(viewer)) return { enabled: false, ready: false }
  const stage = viewer.scene.postProcessStages.fxaa
  return { enabled: stage.enabled, ready: stage.ready === true }
}
