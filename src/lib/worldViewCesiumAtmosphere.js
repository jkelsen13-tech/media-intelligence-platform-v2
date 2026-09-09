// Locked Cesium 1.145 public display properties. Fog culling, density, terrain
// refinement and the renderer clock are intentionally outside this boundary.
const EFFECTS = ['groundAtmosphere', 'distanceHaze']
export function atmosphereAvailable(viewer, effect) {
  try {
    if (!EFFECTS.includes(effect) || !viewer || viewer.isDestroyed?.()
      || viewer.scene?.globe?.enableLighting !== false) return false
    return effect === 'groundAtmosphere'
      ? typeof viewer.scene.globe.showGroundAtmosphere === 'boolean'
      : viewer.scene.fog?.enabled === true && typeof viewer.scene.fog.renderable === 'boolean'
  } catch { return false }
}
export function setAtmosphereEffect(viewer, effect, enabled) {
  if (typeof enabled !== 'boolean' || !atmosphereAvailable(viewer,effect)) return false
  const target = effect === 'groundAtmosphere' ? viewer.scene.globe : viewer.scene.fog
  const key = effect === 'groundAtmosphere' ? 'showGroundAtmosphere' : 'renderable'
  try {
    if (target[key] !== enabled) {
      target[key] = enabled
      if (target[key] !== enabled) return false
      viewer.scene.requestRender?.()
    }
    return true
  } catch { return false }
}
export function atmosphereState(viewer) {
  const globe=viewer?.scene?.globe, fog=viewer?.scene?.fog
  return {
    groundAtmosphere: atmosphereAvailable(viewer,'groundAtmosphere') && globe.showGroundAtmosphere,
    distanceHaze: atmosphereAvailable(viewer,'distanceHaze') && fog.renderable,
    lightingEnabled: globe?.enableLighting === true,
    fogPolicy: fog ? {enabled:fog.enabled,density:fog.density,heightScalar:fog.heightScalar,
      heightFalloff:fog.heightFalloff,maxHeight:fog.maxHeight,
      screenSpaceErrorFactor:fog.screenSpaceErrorFactor,visualDensityScalar:fog.visualDensityScalar} : null,
  }
}
