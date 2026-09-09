// Display preferences only. No renderer objects, storage or evidence fields.
export const VISUAL_FIDELITY_VERSION = 1
export const RESOLUTION_SCALES = Object.freeze([0.75, 1, 1.25])
export const FIDELITY_CATEGORIES = Object.freeze([
  { id: 'lighting', label: 'Lighting', leaves: ['sunLighting', 'dynamicAtmosphere', 'sunDirectedAtmosphere', 'terrainShadows'] },
  { id: 'terrain', label: 'Terrain', leaves: ['reliefShading', 'refinement'] },
  { id: 'atmosphere', label: 'Atmosphere', leaves: ['groundAtmosphere', 'distanceHaze'] },
  { id: 'imageQuality', label: 'Image Quality', leaves: ['fxaa', 'resolutionScale', 'sharpening'] },
  { id: 'depthMaterials', label: 'Depth & Materials', leaves: ['ambientOcclusion', 'contactMaterials'] },
].map(category => Object.freeze({ ...category, leaves: Object.freeze(category.leaves) })))
export const FIDELITY_EFFECTS = Object.freeze(Object.fromEntries([
  ['sunLighting', 'Sun lighting', 'Low'],
  ['dynamicAtmosphere', 'Dynamic atmosphere lighting', 'Low'],
  ['sunDirectedAtmosphere', 'Sun-directed atmosphere', 'Low'],
  ['terrainShadows', 'Terrain shadows', 'High'],
  ['reliefShading', 'Terrain relief shading', 'Low'],
  ['refinement', 'Terrain refinement', 'Moderate'],
  ['groundAtmosphere', 'Ground atmosphere', 'Low'],
  ['distanceHaze', 'Distance haze / fog', 'Moderate'],
  ['fxaa', 'FXAA', 'Low'],
  ['resolutionScale', 'Render resolution', 'Moderate'],
  ['sharpening', 'Sharpening', 'Moderate'],
  ['ambientOcclusion', 'Ambient occlusion', 'High'],
  ['contactMaterials', 'Contact/material effects', 'High'],
].map(([id, label, cost]) => [id, Object.freeze({ label, cost })])))
export const FIDELITY_PRESETS = Object.freeze(['performance', 'balanced', 'maximum', 'custom'])

function categories(relief = false) {
  return Object.fromEntries(FIDELITY_CATEGORIES.map(category => [category.id, {
    enabled: category.id === 'terrain',
    ...Object.fromEntries(category.leaves.map(leaf => [leaf,
      leaf === 'resolutionScale' ? 1 : leaf === 'refinement' ? 'neutral' : leaf === 'reliefShading' && relief])),
  }]))
}

// Preserve the existing relief-on presentation without making an unmeasured
// Balanced/Maximum preset the default. Every newly introduced effect is off.
export function defaultVisualFidelityProfile() {
  return { version: 1, enabled: true, preset: 'custom', categories: categories(true) }
}

export function normalizeVisualFidelityProfile(raw) {
  const valid = raw && typeof raw === 'object' && !Array.isArray(raw) && raw.version === 1
  const next = { version: 1, enabled: Boolean(valid && raw.enabled === true), preset: 'custom', categories: categories() }
  if (!valid) return next
  next.preset = FIDELITY_PRESETS.includes(raw.preset) ? raw.preset : 'custom'
  for (const category of FIDELITY_CATEGORIES) {
    const input = raw.categories?.[category.id]
    const output = next.categories[category.id]
    output.enabled = input?.enabled === true
    for (const leaf of category.leaves) {
      // Only qualified effects survive import; resolution has a small fixed allowlist.
      if (['reliefShading', 'fxaa', 'groundAtmosphere', 'distanceHaze', 'sunLighting'].includes(leaf)) output[leaf] = input?.[leaf] === true
      if (leaf === 'resolutionScale') output[leaf] = RESOLUTION_SCALES.includes(input?.[leaf]) ? input[leaf] : 1
    }
  }
  // A stale preset label must never describe a different configuration.
  if (next.preset !== 'custom') {
    const expected = categories(next.preset !== 'performance')
    if (JSON.stringify(next.categories) !== JSON.stringify(expected)) next.preset = 'custom'
  }
  return next
}

export function visualFidelityCapabilities({ sunLighting = false, sunLightingReason, relief = false, fxaa = false, fxaaReason, resolution = false, resolutionReason, groundAtmosphere = false, distanceHaze = false, atmosphereReason, reason = 'Map renderer is not ready.' } = {}) {
  return Object.fromEntries(Object.keys(FIDELITY_EFFECTS).map(leaf => [leaf,
    leaf === 'sunLighting'
      ? { status: sunLighting ? 'supported' : 'unavailable', reason: sunLighting ? null : sunLightingReason ?? reason }
      : leaf === 'reliefShading'
      ? { status: relief ? 'supported' : 'unavailable', reason: relief ? null : reason }
      : leaf === 'fxaa'
        ? { status: fxaa ? 'supported' : 'unavailable', reason: fxaa ? null : fxaaReason ?? reason }
        : leaf === 'resolutionScale'
          ? { status: resolution ? 'supported' : 'unavailable', reason: resolution ? null : resolutionReason ?? reason }
          : ['groundAtmosphere','distanceHaze'].includes(leaf)
            ? { status: (leaf === 'groundAtmosphere' ? groundAtmosphere : distanceHaze) ? 'supported' : 'unavailable',
              reason: (leaf === 'groundAtmosphere' ? groundAtmosphere : distanceHaze) ? null : atmosphereReason ?? reason }
          : { status: 'deferred', reason: 'Not enabled in this release; verification is pending.' },
  ]))
}

export function resolveVisualFidelityProfile(raw, capabilities) {
  const profile = normalizeVisualFidelityProfile(raw)
  return Object.fromEntries(FIDELITY_CATEGORIES.flatMap(category => category.leaves.map(leaf => [
    leaf, leaf === 'resolutionScale'
      ? (profile.enabled && profile.categories[category.id].enabled && capabilities?.[leaf]?.status === 'supported' ? profile.categories[category.id][leaf] : 1)
      : leaf === 'refinement' ? 'neutral'
      : Boolean(profile.enabled && profile.categories[category.id].enabled
        && profile.categories[category.id][leaf] === true && capabilities?.[leaf]?.status === 'supported'),
  ])))
}

export function reduceVisualFidelityProfile(raw, action, capabilities) {
  const next = normalizeVisualFidelityProfile(raw)
  if (action?.type === 'master' && typeof action.enabled === 'boolean') {
    next.enabled = action.enabled
  } else if (action?.type === 'preset' && FIDELITY_PRESETS.includes(action.preset)) {
    next.preset = action.preset
    if (action.preset !== 'custom') next.categories = categories(action.preset !== 'performance')
  } else if (action?.type === 'resolution' && RESOLUTION_SCALES.includes(action.value)
    && capabilities?.resolutionScale?.status === 'supported') {
    next.categories.imageQuality.resolutionScale = action.value
    next.preset = 'custom'
  } else {
    const category = FIDELITY_CATEGORIES.find(item => item.id === action?.category)
    if (!category || typeof action.enabled !== 'boolean') return next
    if (action.type === 'category' && category.leaves.some(leaf => capabilities?.[leaf]?.status === 'supported')) {
      next.categories[category.id].enabled = action.enabled
      next.preset = 'custom'
    } else if (action.type === 'leaf' && category.leaves.includes(action.leaf)
      && ['reliefShading', 'fxaa', 'groundAtmosphere', 'distanceHaze', 'sunLighting'].includes(action.leaf) && capabilities?.[action.leaf]?.status === 'supported') {
      next.categories[category.id][action.leaf] = action.enabled
      next.preset = 'custom'
    }
  }
  return next
}

export function visualFidelityCategoryState(profile, categoryId, capabilities) {
  const category = FIDELITY_CATEGORIES.find(item => item.id === categoryId)
  if (!category) return { checked: false, mixed: false, unavailable: true }
  const supported = category.leaves.filter(leaf => capabilities?.[leaf]?.status === 'supported')
  const effective = resolveVisualFidelityProfile(profile, capabilities)
  const active = supported.filter(leaf => leaf === 'resolutionScale' ? effective[leaf] !== 1 : effective[leaf] === true).length
  return { checked: supported.length > 0 && active === supported.length,
    mixed: active > 0 && active < supported.length, unavailable: supported.length === 0 }
}

// One effect application boundary. Failure stays unavailable for this renderer;
// successfully clearing a failed effect must not advertise it as available again.
export function createVisualFidelityEffect(apply) {
  let applied
  let failed = false
  return {
    set(enabled) {
      if (failed && enabled) return false
      if (applied === enabled) return true
      let accepted = false
      try { accepted = apply(enabled) === true } catch {}
      if (accepted) applied = enabled
      else failed = true
      return accepted
    },
    isEnabled: () => applied === true && !failed,
    hasFailed: () => failed,
  }
}
