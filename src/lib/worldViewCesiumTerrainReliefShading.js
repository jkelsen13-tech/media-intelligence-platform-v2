// Stage D visual-continuity repair — truthful terrain-relief shading.
//
// Owner-visible defect (2026-09-05): on the deployed Cleveland World View the
// bounded terrain was technically active but visually indistinguishable from
// the reference ellipsoid at the enforced city camera floor
// (34,641.016151377546 m). Regional relief (~150-450 m source-datum) is far
// below the perceptual threshold of unshaded geometry at that height, and
// same-camera pixel comparisons showed no meaningful difference.
//
// Repair approach (authorized): a restrained, truthful, LABELED relief
// treatment derived ONLY from the actual approved elevation values the
// bounded provider already serves. A hypsometric tint is applied as a globe
// material; the engine alpha-blends the material color OVER the composited
// imagery (GlobeFS), so the open imagery stays visible underneath.
//
// Truthfulness contract:
// - The tint is a pure function of the displayed terrain height. No heights
//   are invented, exaggerated, or smoothed; geometry is untouched.
// - Where the globe shows the reference ellipsoid (height 0 — outside
//   approved coverage or terrain degraded/unavailable), the tint alpha is 0:
//   untinted imagery honestly reads as "no approved terrain here".
// - The display range is fixed, documented, and labeled in the UI
//   (0..RELIEF_SHADING_MAX_METERS, clamped); no vertical exaggeration of any
//   kind is applied to the geometry.
// - DISPLAY-only: this module never feeds evidence, precision_class,
//   asserted altitude, canonical state, Investigation Context, or routes.

/** Lowest height (meters, source datum) mapped onto the relief tint ramp. */
export const RELIEF_SHADING_MIN_METERS = 0

/**
 * Highest height mapped onto the ramp. Chosen against the actual approved
 * coverage relief: the Cleveland lakefront plain sits near ~174-200 m
 * source-datum and the Allegheny Plateau edge south of the city reaches
 * ~400-460 m, so a 0-600 m clamped ramp keeps the escarpment well inside
 * the contrast band. Values above the max clamp honestly to the top color;
 * the ramp range is labeled in the UI.
 */
export const RELIEF_SHADING_MAX_METERS = 600

/** Peak tint opacity. Restrained so the underlying imagery stays legible. */
export const RELIEF_SHADING_STRENGTH = 0.45

/** Heights fade in over this band so the water/shore line is not tinted. */
export const RELIEF_SHADING_FADE_METERS = 25

/**
 * Build the relief-shading globe material. The fabric is a custom
 * hypsometric ramp keyed on materialInput.height — the actual terrain
 * height of the rendered fragment (0 on the reference ellipsoid). The
 * engine blends the material color over the composited imagery using the
 * material alpha, so tinted relief and open imagery coexist.
 *
 * GPU-free: this only constructs the material descriptor; tests verify the
 * fabric contract with a mocked Cesium.
 */
export function createTerrainReliefShadingMaterial(Cesium, options = {}) {
  const {
    minMeters = RELIEF_SHADING_MIN_METERS,
    maxMeters = RELIEF_SHADING_MAX_METERS,
    strength = RELIEF_SHADING_STRENGTH,
    fadeMeters = RELIEF_SHADING_FADE_METERS,
  } = options
  if (!Cesium?.Material) return null
  return new Cesium.Material({
    fabric: {
      type: 'MIP_APPROVED_TERRAIN_RELIEF',
      uniforms: {
        u_minMeters: minMeters,
        u_maxMeters: Math.max(maxMeters, minMeters + 1),
        u_strength: strength,
        u_fadeMeters: Math.max(fadeMeters, 1),
      },
      // The tint is a pure function of the displayed height. Alpha is 0 at
      // or below the fade band, so the reference ellipsoid (no approved
      // terrain) renders as plain imagery — never implied terrain.
      source: [
        'czm_material czm_getMaterial(czm_materialInput materialInput)',
        '{',
        '    czm_material material = czm_getDefaultMaterial(materialInput);',
        '    float h = materialInput.height;',
        '    float t = clamp((h - u_minMeters) / (u_maxMeters - u_minMeters), 0.0, 1.0);',
        '    vec3 low = vec3(0.13, 0.42, 0.20);',
        '    vec3 mid = vec3(0.55, 0.44, 0.27);',
        '    vec3 high = vec3(0.85, 0.83, 0.80);',
        '    vec3 tint = t < 0.5 ? mix(low, mid, t * 2.0) : mix(mid, high, (t - 0.5) * 2.0);',
        '    float a = u_strength * smoothstep(0.0, u_fadeMeters, h - u_minMeters);',
        '    material.diffuse = tint;',
        '    material.alpha = a;',
        '    return material;',
        '}',
      ].join('\n'),
    },
    translucent: true,
  })
}

/**
 * Enable/disable the relief shading on a live globe viewer without touching
 * the camera, entities, terrain provider, or any canonical state. Returns
 * true when the change was applied. Exported for GPU-free contract tests.
 *
 * Disabling restores the material-free globe (imagery over terrain geometry)
 * — the pre-repair presentation.
 */
export function setGlobeReliefShading(Cesium, viewer, enabled, options = {}) {
  if (!Cesium || !viewer || viewer.isDestroyed?.()) return false
  try {
    if (enabled) {
      viewer.scene.globe.material = createTerrainReliefShadingMaterial(Cesium, options)
    } else {
      viewer.scene.globe.material = undefined
    }
    viewer.scene?.requestRender?.()
    return true
  } catch {
    return false
  }
}
