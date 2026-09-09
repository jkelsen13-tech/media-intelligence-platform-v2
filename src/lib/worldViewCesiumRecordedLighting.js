import { recordedDisplayTime } from './worldViewRecordedDisplayTime.js'

// Internal neutral clock value only. Never exposed as an inspection/event time.
// The sun and moon sprites are hidden; unavailable time always disables lighting.
const NEUTRAL_MS = 0
export function createRecordedLightingController(getCesium, getViewer) {
  let input = recordedDisplayTime(null)
  let clockApplied = false
  let failed = false
  let dynamicApplied = false
  function currentMatches() {
    try {
      const C = getCesium(), v = getViewer()
      return Boolean(C && v && !v.isDestroyed?.() && v.clock
        && v.clock.shouldAnimate === false && v.clock.canAnimate === false
        && v.clock.clockStep === C.ClockStep.TICK_DEPENDENT
        && C.JulianDate.equals(v.clock.currentTime,
          C.JulianDate.fromDate(new Date(input.atMs ?? NEUTRAL_MS))))
    } catch { return false }
  }
  function available() {
    try { return input.available && clockApplied && !failed && currentMatches()
      && typeof getViewer()?.scene?.globe?.enableLighting === 'boolean'
      && getViewer().scene.globe.dynamicAtmosphereLighting === dynamicApplied
      && getViewer().scene.globe.dynamicAtmosphereLightingFromSun === false
      && getViewer().scene.sun?.show !== true && getViewer().scene.moon?.show !== true }
    catch { return false }
  }
  function setLighting(enabled) {
    const v = getViewer()
    if (typeof enabled !== 'boolean' || !v || v.isDestroyed?.()) return false
    try {
      const desired = enabled && available()
      const globe = v.scene?.globe
      if (typeof globe?.enableLighting !== 'boolean') return false
      if (globe.enableLighting !== desired) {
        globe.enableLighting = desired
        v.scene.requestRender?.()
      }
      if (globe.enableLighting !== desired) { failed = true; return false }
      return !enabled || desired
    } catch { failed = true; return false }
  }
  function setDynamicAtmosphere(enabled) {
    if (typeof enabled !== 'boolean') return false
    const v = getViewer(), globe = v?.scene?.globe
    if (!v || v.isDestroyed?.() || typeof globe?.dynamicAtmosphereLighting !== 'boolean') return false
    const desired = enabled && available() && globe.enableLighting === true
      && (globe.showGroundAtmosphere === true || (v.scene.fog?.enabled === true && v.scene.fog.renderable === true))
    try {
      if (globe.dynamicAtmosphereLighting !== desired) {
        globe.dynamicAtmosphereLighting = desired
        v.scene.requestRender?.()
      }
      if (globe.dynamicAtmosphereLighting !== desired) {
        failed = true
        setLighting(false)
        return false
      }
      dynamicApplied = desired
      return !enabled || desired
    } catch { failed = true; setLighting(false); return false }
  }
  return {
    setTime(raw) {
      input = recordedDisplayTime(raw)
      clockApplied = false
      const C = getCesium(), v = getViewer()
      if (!C || !v || v.isDestroyed?.() || !v.clock) return false
      try {
        const clock = v.clock
        clock.clockStep = C.ClockStep.TICK_DEPENDENT
        clock.shouldAnimate = false
        clock.canAnimate = false
        const time = C.JulianDate.fromDate(new Date(input.atMs ?? NEUTRAL_MS))
        const changed = !C.JulianDate.equals(clock.currentTime, time)
        clock.currentTime = time
        // Reset owned display effects when applying a clock; the profile replays next.
        if (v.scene.sun) v.scene.sun.show = false
        if (v.scene.moon) v.scene.moon.show = false
        const hadDynamic = v.scene.globe.dynamicAtmosphereLighting === true
        v.scene.globe.dynamicAtmosphereLighting = false
        dynamicApplied = false
        if (hadDynamic) v.scene.requestRender?.()
        v.scene.globe.dynamicAtmosphereLightingFromSun = false
        clockApplied = currentMatches()
        if (changed) v.scene.requestRender?.()
      } catch { failed = true }
      if (!available()) setLighting(false)
      return clockApplied
    },
    setLighting,
    setDynamicAtmosphere,
    available,
    state() {
      const v = getViewer()
      return { ...input, applied: clockApplied && currentMatches(),
        available: available(), frozen: currentMatches(),
        lightingEnabled: v?.scene?.globe?.enableLighting === true,
        dynamicAtmosphere: v?.scene?.globe?.dynamicAtmosphereLighting === true,
        sunDirectedAtmosphere: v?.scene?.globe?.dynamicAtmosphereLightingFromSun === true }
    },
  }
}
