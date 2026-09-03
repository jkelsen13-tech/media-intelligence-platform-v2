// R4 World View launch spine — privacy / overlay lock.
//
// Pattern pin: commit 880a672 (2026-08-26). Reimplement here, do not clone
// the source globe. Person-search, face, and tracking are an enforceable
// lock. Live OSINT overlays (aircraft, vessels, CCTV, satellites) are not
// launch surfaces. Spec §8 H / §9.

export const FORBIDDEN_WORLD_VIEW_OVERLAYS = Object.freeze([
  'person-search',
  'face',
  'tracking',
  'private-person-point',
  'cctv',
  'aircraft',
  'vessel',
  'satellite',
  'nearby-installation',
  'radio',
  'earthquakes-as-feeds',
])

// Spec §8 K — mockup chrome only. These widgets must not ship at launch.
export const FORBIDDEN_LAUNCH_WIDGETS = Object.freeze([
  'port-meridian',
  'evacuation-rings',
  'aqi-monitors',
  'shipping-alerts',
  'humidity',
  'cloud-cover',
  'flood',
  'wildfire',
  'marine',
])

export function overlayAllowed(name) {
  const key = String(name ?? '')
    .trim()
    .toLowerCase()
  if (!key) return false
  if (FORBIDDEN_WORLD_VIEW_OVERLAYS.includes(key)) return false
  if (FORBIDDEN_LAUNCH_WIDGETS.includes(key)) return false
  return false
}

/** Launch World View draws projection points only. No extra overlay catalog. */
export function launchOverlayCatalog() {
  return Object.freeze([])
}

export function privatePersonTrackingLocked() {
  return true
}
