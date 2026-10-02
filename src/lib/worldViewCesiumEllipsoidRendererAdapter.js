import {selectedCardInsetsForControls} from './worldViewSelectedCardViewport.js'
import { BILLBOARD_DISPLAY_CAPS, layoutWorldBillboards } from './worldViewBillboardLayout.js'
import { resolveBillboardDistanceStates, updateSelectedBillboardEnvelope } from './worldViewBillboardPresentation.js'
import { worldBillboardScopeLabel } from './worldViewBillboardModules.js'
import { createDisplayPresentation, displayPresentationSignature, globeDisplayMarkers, applyGlobeDisplayPresentation } from './worldViewDisplayPresentation.js'
import { displayMarkerKey } from './worldViewDisplayClusters.js'
import { createMarkerLabelMeasurer, dispatchGlobeMarkerPick, updateGlobeMarkerLayout } from './worldViewMarkerLayout.js'
import { createCesiumRefinementController } from './worldViewCesiumRefinement.js'
import { createRecordedLightingController } from './worldViewCesiumRecordedLighting.js'
import { atmosphereAvailable, setAtmosphereEffect, atmosphereState } from './worldViewCesiumAtmosphere.js'
import { createCesiumResolutionController, cesiumResolutionState } from './worldViewCesiumResolution.js'
import { resolveVisualFidelityProfile, visualFidelityCapabilities, createVisualFidelityEffect } from './worldViewVisualFidelity.js'
import { observeWorldViewImagery } from './worldViewRuntimeObservation.js'
// R4 World View — ellipsoid globe renderer adapter (CesiumJS).
//
// DISPLAY-only: this module never rewrites Investigation Context,
// canonical identity, or projection coordinates. It only owns the
// renderer lifecycle for a given map canvas host element.
//
// Governance:
// - No ion credentials.
// - No terrain / 3D buildings / 3D tiles.
// - Keyless open imagery only.
// - Picking returns the original projection `row` reference.

import {
  ELLIPSOID_GLOBE_STACK_ID,
  FALLBACK_MAP_STACK_ID,
  heightMetersForPrecisionClass,
  mapStackById,
  subjectEllipsoidCamera,
} from './worldViewMapStack.js'
import {
  makeCameraState,
  normalizeLongitudeDegrees,
  parseCameraState,
  serializeCameraState,
} from './worldViewCameraState.js'
import {
  createTerrariumTerrainProvider,
  TERRAIN_CREDIT_TEXT,
  tileXYForLongitudeLatitudeDegrees,
} from './worldViewCesiumTerrariumTerrainProvider.js'
import {
  setGlobeReliefShading,
} from './worldViewCesiumTerrainReliefShading.js'

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

// ---- Stage D: bounded display-only terrain ----
//
// Terrain is attached through the MIP-owned Terrarium provider
// (coverage- and source-bounded; see worldViewCesiumTerrariumTerrainProvider.js).
// Terrain failure degrades the globe to the reference ellipsoid WITHOUT
// tearing down the viewer, and is reported honestly through
// onTerrainStatusChange. Fatal render failures still advance to the
// MapLibre fallback exactly as in Stage B.

/**
 * Degrade terrain to the reference ellipsoid without touching the camera,
 * entities, selection, or any canonical state. Returns true when the swap
 * was applied. Exported for GPU-free contract tests.
 */
export function degradeGlobeToEllipsoid(Cesium, viewer) {
  if (!Cesium || !viewer || viewer.isDestroyed?.()) return false
  try {
    viewer.scene.globe.terrainProvider = new Cesium.EllipsoidTerrainProvider({})
    viewer.scene?.requestRender?.()
    return true
  } catch {
    return false
  }
}

// ---- Stage C: renderer-neutral camera-state contract (globe side) ----

// A subject coordinate is the look-at target, not the camera's ground
// position. Placing an oblique camera directly above it looks beyond it.
// Preserve the precision floor by converting vertical height to slant range.
export function frameGlobeOnSubject(Cesium, viewer, cam, duration = 0) {
  if (!Cesium || !viewer || !cam) return false
  const pitch = Cesium.Math.toRadians(cam.pitchDegrees)
  const range = cam.heightMeters / Math.max(Math.abs(Math.sin(pitch)), 0.01)
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = cam.minZoomDistanceMeters
  viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 0), 0),
    {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(cam.headingDegrees), pitch, range),
      duration,
    },
  )
  return true
}
//
// Camera state is serializable and renderer-neutral (degrees + meters, see
// worldViewCameraState.js). It is DISPLAY-only: it never enters
// Investigation Context, canonical identity, or the route, and restoring it
// never changes the subject, time range, or precision class. The precision
// floor keeps the ~5 km city ceiling in meters on restore.

/** Build a normalized camera state from a live globe camera. */
export function cameraStateFromGlobeCamera(math, camera, precisionClass) {
  const carto = camera?.positionCartographic
  if (!math || !carto) return null
  // Cesium reports roll in [0, 2π); near-zero roundoff can be near 2π.
  // Wrap that physical angle before the external-input clamp, otherwise
  // an upright camera would be serialized as a 180-degree reversal.
  const rollDegrees = normalizeLongitudeDegrees(math.toDegrees(camera.roll))
  if (rollDegrees === null) return null
  return makeCameraState(
    {
      lon: math.toDegrees(carto.longitude),
      lat: math.toDegrees(carto.latitude),
      heightMeters: carto.height,
      headingDegrees: math.toDegrees(camera.heading),
      pitchDegrees: math.toDegrees(camera.pitch),
      rollDegrees,
    },
    precisionClass,
  )
}

export function cancelGlobeCameraFlight(viewer) {
  if (!viewer || viewer.isDestroyed?.() || typeof viewer.camera?.cancelFlight !== 'function') return false
  viewer.camera.cancelFlight()
  return true
}

/** Apply an already-normalized camera state to a live globe viewer. */
export function applyCameraStateToGlobeViewer(Cesium, viewer, cameraState) {
  if (!Cesium || !viewer || !cameraState) return false
  cancelGlobeCameraFlight(viewer)
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      cameraState.lon,
      cameraState.lat,
      cameraState.heightMeters,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(cameraState.headingDegrees),
      pitch: Cesium.Math.toRadians(cameraState.pitchDegrees),
      roll: Cesium.Math.toRadians(cameraState.rollDegrees),
    },
  })
  viewer.scene?.requestRender?.()
  return true
}

export function cesiumMarkerEntityDescriptors(features = []) {
  // Convert projection features into pickable entity descriptors.
  // Contract: descriptor.row retains the original row object reference.
  return features.flatMap((f) => {
    const row = f?.row
    if (!row) return []
    const positions = f.positions ?? []
    return positions.map((position, i) => ({
      id: `${row.revision_id ?? row.mip_object_id}-${i}`,
      row,
      position, positionIndex: i,
      selected: Boolean(f.selected),
      label: f.label ?? null,
      coords: f.coords ?? null,
      precisionClass: row.precision_class ?? null,
      geometryStatus: row.geometry_status ?? null,
    }))
  })
}

export function destroyCesiumResources({ eventHandler, viewer }) {
  try {
    eventHandler?.destroy?.()
  } catch {
    /* ignore */
  }
  try {
    viewer?.destroy?.()
  } catch {
    /* ignore */
  }
}

// Renderer-owned failure lifetime. Cesium raises renderError from inside draw;
// destroying its Scene there can resume the draw against destroyed resources.
// Capture synchronously, stop new frames, then tear down after this stack exits.
export function createGlobeFailureLifecycle({
  viewer,
  isCancelled = () => false,
  onFatalFailure,
  destroyResources,
  enqueue = callback => queueMicrotask(callback),
}) {
  let failed = false
  let disposed = false
  let queued = false
  let finalizing = false
  const removers = []
  function removeListeners() {
    for (const remove of removers.splice(0)) {
      try { remove?.() } catch { /* keep native finalization reachable */ }
    }
  }
  function dispose() {
    queued = false
    if (disposed || finalizing) return disposed
    finalizing = true
    removeListeners()
    // false is an explicit surviving native owner. Legacy void cleanup remains
    // complete; a failed owner can be retried without restoring draw authority.
    try { disposed = destroyResources?.() !== false }
    catch { disposed = false }
    finally { finalizing = false }
    return disposed
  }
  function deferDispose() {
    if (queued || disposed) return
    queued = true
    enqueue(dispose)
  }
  function fail(kind, error) {
    if (failed || disposed || isCancelled() || viewer?.isDestroyed?.()) return false
    failed = true
    // Public Viewer governance; native loss can otherwise leave an alive loop
    // which issues draws against the lost context.
    viewer.useDefaultRenderLoop = false
    removeListeners()
    deferDispose()
    // The owner reads the still-live camera before any destruction. Even a
    // synchronous owner cleanup must respect the deferred failure boundary.
    onFatalFailure?.(kind, error)
    return true
  }
  const canvas = viewer?.canvas
  const onContextLost = () => fail('context-lost')
  if (canvas?.addEventListener) {
    canvas.addEventListener('webglcontextlost', onContextLost)
    removers.push(() => canvas.removeEventListener('webglcontextlost', onContextLost))
  }
  const renderError = viewer?.scene?.renderError
  const removeRenderError = typeof renderError?.addEventListener === 'function'
    ? renderError.addEventListener((scene, error) => fail('render-error', error))
    : null
  if (typeof removeRenderError === 'function') removers.push(removeRenderError)
  return {
    destroy() {
      if (disposed) return true
      if (failed) { deferDispose(); return false }
      return dispose()
    },
  }
}

// Normalize the Vite deployment base into the URL Cesium uses to resolve
// its static Workers/Assets/Widgets directories.
//
// Examples:
//   '/some-deploy-subpath/' -> '/some-deploy-subpath/cesium/'
//   '/some-deploy-subpath'  -> '/some-deploy-subpath/cesium/'
//   '/'                     -> '/cesium/' (root/local deployment)
//   undefined / ''          -> '/cesium/' (root/local deployment)
export function resolveCesiumBaseUrl(deploymentBase) {
  const raw = typeof deploymentBase === 'string' && deploymentBase.length > 0 ? deploymentBase : '/'
  const normalized = raw.endsWith('/') ? raw : `${raw}/`
  return `${normalized}cesium/`
}

function viteDeploymentBase() {
  // IMPORTANT: plain member access only. Vite statically replaces
  // `import.meta.env.BASE_URL` in production builds; an optional-chained
  // member expression is not replaced and silently evaluates to undefined
  // in the built bundle, which previously caused CESIUM_BASE_URL to fall
  // back to domain-root '/cesium/' on GitHub Pages.
  // In non-Vite runtimes (node --test) import.meta.env is undefined, so the
  // guard keeps this safe there as well.
  const env = import.meta.env
  if (env && typeof env.BASE_URL === 'string' && env.BASE_URL.length > 0) return env.BASE_URL
  return '/'
}

function isWebGLAvailable() {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl') || canvas.getContext('webgl2')
    return Boolean(gl)
  } catch {
    return false
  }
}

// A constructor may append DOM and then throw before returning a viewer.
// Keep a removable owned subtree; late cleanup must never erase a successor.
export function createCesiumOwnedHost(parent) {
  const element = parent.ownerDocument.createElement('div')
  element.className = 'wv-cesium-host'
  element.style.width = '100%'
  element.style.height = '100%'
  parent.appendChild(element)
  return { element, destroy: () => element.remove() }
}

export function createCesiumEllipsoidRendererAdapter({
  stackId,
  getHostEl,
  coordinate,
  precisionClass,
  getPrecisionClass,
  getSelectedKeys,
  onSelectRow,
  onStackIdChange,
  onTerrainStatusChange,
  onSourceStatusChange,
  onSourceImageryStateChange,
  onSelectedAnchorChange,
  onCameraChange,
  initialActivityState = 'visible-idle',
  shouldFlyTo,
  markFlew,
  initialFeatures,
  recordedTimeInstant,
  isCancelled,
  relationships = [], onDisplayLayout, billboardEnabled = false,
}) {
  // Ensure this adapter is only used for the ellipsoid globe stack id.
  if (stackId !== ELLIPSOID_GLOBE_STACK_ID && stackId !== undefined) {
    // eslint-disable-next-line no-console
    console.warn('createCesiumEllipsoidRendererAdapter called with non-ellipsoid stack id', stackId)
  }

  let cameraSnapshot = null
  let viewer = null
  let sourceImagery = null
  let failureLifecycle = null
  let ownedHost = null
  let eventHandler = null
  let entities = []
  let nativeBillboards = null, billboardSignature = null, distanceMemory = null, envelopeMemory = null, selectedBillboard = null
  let mounted = false
  const labelMeasurements = createMarkerLabelMeasurer(() => document.createElement('canvas').getContext('2d'))
  const measureLabel = labelMeasurements.measure
  let renderedFrames = 0
  // CPU time for display arbitration only, not GPU or full-frame timing.
  const layoutTiming = { lastMs: 0, maxMs: 0, passes: 0, entityCount: 0 }
  const removeLayoutListeners = []
  let currentOnSelectRow = onSelectRow
  let currentRelationships = relationships, currentSelectedKeys = getSelectedKeys?.() ?? new Set()
  let displayPresentation = null, displaySignature = ''
  let localCancelled = false
  let activityState = initialActivityState
  let imageryObservation = null
  let lastAnchor = null
  let Cesium = null
  // Stage D: bounded terrain state. `terrainPlan` holds the MIP-owned
  // provider; `terrainDegraded` records the honest ellipsoid fallback.
  let terrainPlan = null
  let terrainDegraded = false
  // Stage D visual-continuity repair: labeled relief shading derived only
  // from the actual approved terrain heights (see
  // worldViewCesiumTerrainReliefShading.js). Default ON — the repair exists
  // because unshaded terrain is not visually legible at the enforced city
  // camera floor. User-toggleable; never touches geometry or camera.
  let reliefShadingEnabled = true
  const reliefApplication = createVisualFidelityEffect(enabled => setGlobeReliefShading(Cesium, viewer, enabled))

  const refinementApplication = createCesiumRefinementController(() => viewer, () => !terrainDegraded && Boolean(terrainPlan))
  const recordedLighting = createRecordedLightingController(() => Cesium, () => viewer)
  const groundAtmosphereApplication = createVisualFidelityEffect(enabled => setAtmosphereEffect(viewer, 'groundAtmosphere', enabled))
  const distanceHazeApplication = createVisualFidelityEffect(enabled => setAtmosphereEffect(viewer, 'distanceHaze', enabled))
  const resolutionApplication = createCesiumResolutionController(() => viewer)
  const fxaaApplication = createVisualFidelityEffect(enabled => setCesiumFxaa(viewer, enabled))

  const cancelledNow = () => localCancelled || Boolean(isCancelled?.())

  // Stage C: the recorded precision class can arrive AFTER mount (rows load
  // asynchronously), so camera-state get/set must resolve it live at call
  // time. Using the mount-time value here would drop the ~5 km city ceiling
  // floor whenever the class was not yet available at mount.
  const activePrecisionClass = () => getPrecisionClass?.() ?? precisionClass

  async function mount() {
    if (mounted || cancelledNow()) return
    mounted = true

    if (stackId === FALLBACK_MAP_STACK_ID) return

    const hostEl = getHostEl?.()
    if (!hostEl) return

    if (!isWebGLAvailable()) {
      onStackIdChange?.('openfreemap-positron')
      return
    }

    // Set CESIUM_BASE_URL from the Vite deployment base BEFORE the lazy
    // Cesium import/initialization so Workers/Assets/Widgets resolve under
    // the deployment base (e.g. the GitHub Pages subpath). Root and local
    // deployments still resolve to '/cesium/'.
    globalThis.CESIUM_BASE_URL = resolveCesiumBaseUrl(viteDeploymentBase())

    try {
      Cesium = await import('cesium')
      // Cesium's widgets.css is required for credits and cursor styling.
      await import('cesium/Build/Cesium/Widgets/widgets.css')
    } catch (importError) {
      // eslint-disable-next-line no-console
      console.error('Cesium failed to load; falling back to MapLibre:', importError?.message ?? importError)
      if (!cancelledNow()) onStackIdChange?.('openfreemap-positron')
      return
    }

    if (cancelledNow()) return


    // Stage D: bounded display-only terrain. The provider enforces the
    // approved Cleveland/Ohio coverage and approved-source policy itself;
    // every failure mode renders real parent data or the ellipsoid — never
    // fabricated terrain. If the provider cannot even be constructed, the
    // globe still mounts on the reference ellipsoid and reports terrain as
    // unavailable.
    const handleTerrainStatus = (status) => {
      if (cancelledNow()) return
      if (status?.status === 'unavailable' && !terrainDegraded) {
        terrainDegraded = degradeGlobeToEllipsoid(Cesium, viewer) || terrainDegraded
      }
      try {
        onTerrainStatusChange?.(status)
      } catch {
        /* status reporting must never break rendering */
      }
    }
    try {
      terrainPlan = createTerrariumTerrainProvider(Cesium, {
        credit: new Cesium.Credit(TERRAIN_CREDIT_TEXT),
        onStatusChange: handleTerrainStatus,
      })
    } catch (terrainError) {
      // eslint-disable-next-line no-console
      console.error('Terrain provider unavailable; mounting on reference ellipsoid:', terrainError?.message ?? terrainError)
      terrainPlan = null
      terrainDegraded = true
      handleTerrainStatus({ status: 'unavailable' })
    }

    // Keyless open imagery.
    // Cesium >= 1.107 removed the Viewer `imageryProvider` option: passing it
    // only suppresses the default base layer and the provider is never added,
    // which leaves a black (imageless) ellipsoid. The supported path is an
    // explicit ImageryLayer passed as `baseLayer`.
    const imageryProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: new Cesium.Credit(
        '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
        true,
      ),
      maximumLevel: 19,
    })
    // Observe actual image completion through the provider's public seam.
    // Renderer readiness alone is not proof that imagery loaded.
    imageryObservation = observeWorldViewImagery(imageryProvider, { onStatus: onSourceStatusChange, isCancelled: cancelledNow })

    // Minimal Viewer UI: bounded display-only terrain, no 3D tiles.
    try {
      ownedHost = createCesiumOwnedHost(hostEl)
      viewer = new Cesium.Viewer(ownedHost.element, {
        animation: false,
        shouldAnimate: false,
        automaticallyTrackDataSourceClocks: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        sceneMode: Cesium.SceneMode.SCENE3D,
        infoBox: false,
        selectionIndicator: false,
        useDefaultRenderLoop: activityState !== 'hidden',
        baseLayer: new Cesium.ImageryLayer(imageryProvider),
        ...(terrainPlan ? { terrainProvider: terrainPlan.provider } : {}),
      })
    } catch (bootError) {
      // eslint-disable-next-line no-console
      console.error('Cesium failed to boot; falling back to MapLibre:', bootError?.message ?? bootError)
      viewer = null
      terrainPlan?.destroy?.()
      terrainPlan = null
      ownedHost?.destroy()
      ownedHost = null
      if (!cancelledNow()) onStackIdChange?.('openfreemap-positron')
      return
    }

    if (billboardEnabled) {
      nativeBillboards = viewer.scene.primitives.add(new Cesium.BillboardCollection({ scene: viewer.scene }))
      viewer.scene.globe.depthTestAgainstTerrain = true
    }

    ownedHost.element.querySelector?.('.cesium-widget-credits')?.setAttribute('data-world-credits', 'true')
    // Fatal render/boot failure handling: never leave a black canvas with
    // Cesium's raw error modal. Log the real diagnostic, tear the viewer
    // down, and advance honestly to the MapLibre fallback stack. No pins or
    // geometry are fabricated in the fallback; it re-renders from the same
    // projection rows.
    try {
      if (viewer.cesiumWidget) {
        // Suppress Cesium's default "Rendering has stopped" modal; the
        // fallback below is the user-visible outcome instead.
        viewer.cesiumWidget.showRenderLoopError = () => {}
      }
    } catch {
      /* ignore */
    }

    failureLifecycle = createGlobeFailureLifecycle({
      viewer,
      isCancelled: cancelledNow,
      onFatalFailure: (kind, error) => {
        localCancelled = true
        sourceImagery?.fence()
        for (const remove of removeLayoutListeners.splice(0)) remove?.()
        // Native loss is a distinct actual browser failure, not a synthesized
        // Scene.renderError. Report it honestly and transition only once.
        // eslint-disable-next-line no-console
        if (kind === 'context-lost') console.error('Cesium WebGL context lost; falling back to MapLibre.')
        // eslint-disable-next-line no-console
        else console.error('Cesium render failure; falling back to MapLibre:', error?.message ?? error)
        // WorldMapCanvas captures the camera here before deferred teardown.
        onStackIdChange?.('openfreemap-positron')
      },
      destroyResources: destroyRendererResources,
    })
    sourceImagery=createWorldViewNativeRgbAttachment({Cesium,getViewer:()=>viewer,getHost:()=>ownedHost?.element,
      isCancelled:cancelledNow,onChange:onSourceImageryStateChange,onTeardownFailure:()=>{
        // An owned native layer which cannot be removed must never reveal old
        // pixels. Teardown after the current draw and retain its image lease.
        queueMicrotask(()=>{if(localCancelled)return;localCancelled=true
          onStackIdChange?.('openfreemap-positron');failureLifecycle?.destroy()})
      }})

    // The widget otherwise rewrites canAnimate on every data-source tick.
    viewer.allowDataSourcesToSuspendAnimation = false
    recordedLighting.setTime(recordedTimeInstant ?? null)

    // Request-only rendering governance: only redraw on camera/props changes.
    viewer.scene.requestRenderMode = true
    setActivityState(activityState)
    if (onCameraChange) removeLayoutListeners.push(viewer.camera.moveEnd.addEventListener(() => {
      if (!cancelledNow()) onCameraChange()
    }))
    removeLayoutListeners.push(viewer.scene.postRender.addEventListener(() => {
      renderedFrames += 1
      if (!viewer || cancelledNow()) return
      // Every actual frame includes small camera moves and responsive resizes.
      // Only a changed visibility result requests one correction frame.
      const started = performance.now()
      const changed = refreshDisplayLayout()
      const elapsed = Math.max(0, performance.now() - started)
      layoutTiming.lastMs = elapsed
      layoutTiming.maxMs = Math.max(layoutTiming.maxMs, elapsed)
      layoutTiming.passes += 1
      layoutTiming.entityCount = entities.length
      publishSelectedAnchor()
      if (changed) viewer.scene.requestRender?.()
    }))

    // Stage D visual-continuity repair: apply the labeled relief shading
    // (default ON). Derived only from actual approved terrain heights; the
    // reference ellipsoid (height 0) stays untinted, so degraded or
    // out-of-coverage areas honestly show plain imagery.
    if (reliefShadingEnabled) {
      reliefApplication.set(true)
    }

    // Enable orbit / free rotation / tilt / continuous zoom.
    viewer.scene.screenSpaceCameraController.enableRotate = true
    viewer.scene.screenSpaceCameraController.enableTilt = true
    viewer.scene.screenSpaceCameraController.enableTranslate = true
    viewer.scene.screenSpaceCameraController.enableZoom = true
    viewer.scene.screenSpaceCameraController.enableLook = true

    // Constrain "zoom in" so the camera can't reach fake finer precision.
    // minimumZoomDistance is a height in meters above the ellipsoid surface.
    viewer.scene.screenSpaceCameraController.minimumZoomDistance =
      heightMetersForPrecisionClass(activePrecisionClass())

    // Picking: clicking a marker returns the original projection row reference.
    eventHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
    eventHandler.setInputAction((click) => {
      dispatchGlobeMarkerPick(viewer, click.position, currentOnSelectRow, cancelledNow)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    // Attach features.
    const descriptors = cesiumMarkerEntityDescriptors(initialFeatures ?? [])
    for (const d of descriptors) {
      const lon = Number(d.position?.[0])
      const lat = Number(d.position?.[1])
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue

      const isSelected = d.selected
      const alpha = isSelected ? 220 / 255 : 150 / 255

      const color = new Cesium.Color(21 / 255, 110 / 255, 191 / 255, alpha)

      const point = {
        pixelSize: isSelected ? 9 : 7,
        color,
        outlineColor: new Cesium.Color(21 / 255, 110 / 255, 191 / 255, 1),
        outlineWidth: 1.5,
        // Screen symbol at the retained lon/lat; explicit horizon arbitration
        // prevents far-side picking without inventing an evidence altitude.
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }

      const label = d.label || d.precisionClass || 'projected location'

      const entity = viewer.entities.add({
        // The first layout pass must approve a symbol before it can be drawn.
        show: false,
        id: d.id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        point,
        label: {
          show: true,
          text: label,
          font: '12px sans-serif',
          fillColor: new Cesium.Color(26 / 255, 26 / 255, 23 / 255, 0.9),
          outlineWidth: 0,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(14, -8),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      // Custom field used by pick handler.
      entity.__mipRow = d.row
      entity.__mipSelected = isSelected
      entity.__mipMarker = { id: displayMarkerKey(d.row, d.positionIndex), row: d.row,
        position: d.position, positionIndex: d.positionIndex, label, selected: isSelected }
      entities.push(entity)
    }

    if (cancelledNow()) return

    // Initial camera framing: local camera only.
    if (shouldFlyTo?.()) {
      const cam = subjectEllipsoidCamera(coordinate, activePrecisionClass())
      if (cam) {
        frameGlobeOnSubject(Cesium, viewer, cam)
        viewer.scene.requestRender?.()
        markFlew?.()
      }
    }
  }

  function refreshDisplayLayout() {
    if (!viewer || !Cesium || cancelledNow()) return false
    const scene = viewer.scene
    const entityByKey=new Map(entities.map(entity=>[entity.__mipMarker.id,entity]))
    const canonicalMarkers = globeDisplayMarkers(Cesium, viewer, entities, measureLabel)
    const ground = billboardEnabled ? new Map(canonicalMarkers.map(marker=>[marker.id,worldViewBillboardDisplayGround(Cesium,viewer,marker)])) : null
    const markers = billboardEnabled ? canonicalMarkers.map(marker=>{
      const display=ground.get(marker.id)
      const screen=Cesium.SceneTransforms.worldToWindowCoordinates(scene,display.worldPosition)
      const displayOccluded=worldViewBillboardTerrainOccluded(Cesium,viewer,display.worldPosition)
      const canonicalPosition=entityByKey.get(marker.id)?.position.getValue(viewer.clock.currentTime)
      return {...marker,canonicalAnchor:{x:marker.x,y:marker.y},x:screen?.x,y:screen?.y,
        visible:marker.visible&&!displayOccluded,displayOccluded,
        canonicalOccluded:!marker.visible||worldViewBillboardTerrainOccluded(Cesium,viewer,canonicalPosition),
        displayHeightMeters:display.displayHeightMeters}
    }) : canonicalMarkers
    displayPresentation = createDisplayPresentation(markers, {
      width: scene.canvas.clientWidth, height: scene.canvas.clientHeight,
      cameraHeightMeters: viewer.camera.positionCartographic.height,
      relationships: currentRelationships, selectedKeys: currentSelectedKeys,
      radiusPx: billboardEnabled ? 192 : 64,
    })
    if (billboardEnabled) displayPresentation.labels = new Set()
    let changed = applyGlobeDisplayPresentation(viewer, entities, displayPresentation)
    if (billboardEnabled) {
      const cameraHeightMeters=viewer.camera.positionCartographic.height
      const items = markers.map(marker => ({ key: marker.id, anchor: marker.canonicalAnchor,
        markerAnchor:{x:marker.x,y:marker.y},canonicalOccluded:marker.canonicalOccluded,displayOccluded:marker.displayOccluded,
        distanceMeters: Cesium.Cartesian3.distance(viewer.camera.positionWC, entityByKey.get(marker.id)?.position.getValue(viewer.clock.currentTime)),
        occluded: !marker.visible, canonicalCoordinates: marker.position, label:marker.label,
        precision:marker.row?.precision_class ?? null,precisionFloorMeters:heightMetersForPrecisionClass(marker.row?.precision_class),
        cameraHeightMeters,scopePlaques:true }))
      const selectedKey = markers.find(marker=>marker.selected)?.id ?? null
      const distance = resolveBillboardDistanceStates({items,previous:distanceMemory,
        datasetKey:JSON.stringify(markers.map(m=>[m.id,m.row?.revision_id,m.row?.precision_class,m.position])),
        selectedKey,cameraHeightMeters,scopePlaques:true})
      distanceMemory = distance.memory
      for(const item of items){item.presentationState=distance.states[item.key];item.nearDetailKind=distance.nearDetails[item.key]?.kind}
      const viewport={width:scene.canvas.clientWidth,height:scene.canvas.clientHeight}
      if(selectedKey && viewport.width>=400 && viewport.width>viewport.height && viewport.height<480){
        const surface=scene.canvas.closest?.('.wv-explore-surface')
        if(surface){
          const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}}
          const controls=[...surface.querySelectorAll('.wv-explore-actions button,.wv-explore-page-strip')].filter(node=>node.getClientRects().length>0)
          viewport.selectedCardInsets=selectedCardInsetsForControls({viewport,canvasBounds:rect(scene.canvas),controlBounds:controls.map(rect)})
        }
      }
      const layout = layoutWorldBillboards({items,viewport,selectedKey})
      const envelope = updateSelectedBillboardEnvelope({selected:layout.selected,previous:envelopeMemory,
        viewport,cameraSignature:JSON.parse(getCameraState() ?? 'null')})
      envelopeMemory=envelope.memory;selectedBillboard=envelope.selected ? {...envelope.selected,occlusionBasis:'ellipsoid-and-observed-terrain-center'} : null
      const admittedSingles = new Set(displayPresentation.layout.singles.map(marker=>marker.id))
      // Reuse observed source terrain at the admitted lon/lat without adding
      // a guessed 18m stem or evidence altitude. Canonical coordinates/tether
      // remain unchanged; the sampled background surface is display-only.
      const {singles,states:nativeStates}=worldViewBillboardNativeTargets(markers,admittedSingles,distance.states,
        {width:scene.canvas.clientWidth,height:scene.canvas.clientHeight})
      const signature = worldViewNativeBillboardSignature(markers,singles,nativeStates,ground)
      for(const entity of entities) entity.point.show=false
      if(nativeBillboards && signature!==billboardSignature){
        billboardSignature=signature;nativeBillboards.removeAll()
        for(const entity of entities){
          const marker=entity.__mipMarker
          if(!singles.has(marker.id))continue
          const state=nativeStates[marker.id] ?? 'icon'
          const width=state==='plaque'?180:state==='ribbon'?132:24,height=state==='plaque'?56:state==='ribbon'?32:24
          nativeBillboards.add({position:ground.get(marker.id).worldPosition,
            image:worldViewNativeBillboardTexture(marker.label,state,entity.__mipRow.precision_class),width,height,
            // Separate surface-coincident quad paint from globe depth by the
            // existing 0.5m ray tolerance, toward the eye only. World position,
            // canonical anchor/tether and GPU depth testing remain unchanged.
            eyeOffset:new Cesium.Cartesian3(0,0,-0.5),
            verticalOrigin:Cesium.VerticalOrigin.CENTER,disableDepthTestDistance:0,id:entity})
        }
        changed=true
      }
      if(envelope.settling)changed=true
    }
    const signature = displayPresentationSignature(displayPresentation)
    if (signature !== displaySignature) {
      displaySignature = signature
      onDisplayLayout?.(displayPresentation)
    }
    return changed
  }

  async function setFeatures(nextFeatures, nextSelectedKeys = getSelectedKeys?.()) {
    if (!viewer || !Cesium) return
    currentSelectedKeys = nextSelectedKeys ?? new Set()
    displaySignature = ''
    displayPresentation = null
    billboardSignature=null
    const descriptors = cesiumMarkerEntityDescriptors(nextFeatures ?? [])

    // Update selection visuals without rewriting row identity.
    const nextSet = nextSelectedKeys instanceof Set ? nextSelectedKeys : new Set(nextSelectedKeys ?? [])

    // Clear existing entities.
    for (const e of entities) {
      try {
        viewer.entities.remove(e)
      } catch {
        /* ignore */
      }
    }
    entities = []

    for (const d of descriptors) {
      const lon = Number(d.position?.[0])
      const lat = Number(d.position?.[1])
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue

      const isSelected = nextSet.has(String(d.row.mip_object_id)) || nextSet.has(String(d.row.subject_graph_node_id))

      const alpha = isSelected ? 220 / 255 : 150 / 255
      const color = new Cesium.Color(21 / 255, 110 / 255, 191 / 255, alpha)

      const point = {
        pixelSize: isSelected ? 9 : 7,
        color,
        outlineColor: new Cesium.Color(21 / 255, 110 / 255, 191 / 255, 1),
        outlineWidth: 1.5,
        // Screen symbol at the retained lon/lat; explicit horizon arbitration
        // prevents far-side picking without inventing an evidence altitude.
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      }

      const label = d.label || d.precisionClass || 'projected location'

      const entity = viewer.entities.add({
        // The first layout pass must approve a symbol before it can be drawn.
        show: false,
        id: d.id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        point,
        label: {
          show: true,
          text: label,
          font: '12px sans-serif',
          fillColor: new Cesium.Color(26 / 255, 26 / 255, 23 / 255, 0.9),
          outlineWidth: 0,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(14, -8),
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      entity.__mipRow = d.row
      entity.__mipSelected = isSelected
      entity.__mipMarker = { id: displayMarkerKey(d.row, d.positionIndex), row: d.row,
        position: d.position, positionIndex: d.positionIndex, label, selected: isSelected }
      entities.push(entity)
    }

    // Arbitration runs only after actual camera/feature renders, never an idle loop.
    viewer.scene.requestRender?.()
  }

  function setOnSelectRow(nextOnSelectRow) {
    currentOnSelectRow = nextOnSelectRow
  }

  function flyToSubjectCamera({ nextCoordinate = coordinate, nextPrecisionClass = precisionClass } = {}) {
    if (!shouldFlyTo?.() && shouldFlyTo !== undefined) return false
    if (!viewer || !Cesium) return false

    const cam = subjectEllipsoidCamera(nextCoordinate, nextPrecisionClass)
    if (!cam) return false

    // Flight duration is in seconds. Saved free-camera restoration remains
    // separate; only explicit subject framing uses this look-at target.
    return frameGlobeOnSubject(Cesium, viewer, cam, 1.6)
  }

  function requestRender() {
    if (!cancelledNow() && activityState !== 'hidden') viewer?.scene?.requestRender?.()
  }

  function setActivityState(next) {
    if (!['visible-active', 'visible-idle', 'hidden'].includes(next)) return false
    activityState = next
    if (!viewer || cancelledNow()) return false
    // Stop deliberate globe updates while hidden. In-flight network completion
    // may still arrive; no provider billing or high-cost resource is activated.
    viewer.useDefaultRenderLoop = next !== 'hidden'
    if (next !== 'hidden') { viewer.resize?.(); viewer.scene.requestRender?.() }
    else { lastAnchor = null; onSelectedAnchorChange?.({ visible: false }) }
    return true
  }

  function publishSelectedAnchor() {
    if (!onSelectedAnchorChange || !viewer || !Cesium) return
    const entity = entities.find(item => item.__mipSelected)
    const width = viewer.canvas.clientWidth, height = viewer.canvas.clientHeight
    const position = entity?.position?.getValue?.(viewer.clock.currentTime)
    const screen = position ? viewer.scene.cartesianToCanvasCoordinates(position) : null
    const visible = Boolean(screen && screen.x >= 0 && screen.y >= 0 && screen.x <= width && screen.y <= height)
    const billboardMarkerVisible=Boolean(nativeBillboards&&entity&&Array.from({length:nativeBillboards.length},(_,i)=>nativeBillboards.get(i)).some(b=>b.id===entity&&b.show!==false))
    const next = { visible, x: screen?.x ?? null, y: screen?.y ?? null, width, height, billboardSelected: selectedBillboard,billboardMarkerVisible }
    if (!billboardEnabled && lastAnchor && lastAnchor.visible === visible && lastAnchor.width === width && lastAnchor.height === height
      && (!visible || Math.abs(lastAnchor.x - next.x) < 0.5 && Math.abs(lastAnchor.y - next.y) < 0.5)) return
    lastAnchor = next
    onSelectedAnchorChange(next)
  }

  // Stage D visual-continuity repair: user-facing relief shading toggle.
  // DISPLAY-only — swaps the globe material only; the terrain provider,
  // geometry, camera, entities, and canonical state are untouched. Safe to
  // call before mount: the preference applies when the viewer is created.
  function setReliefShadingEnabled(enabled) {
    reliefShadingEnabled = Boolean(enabled)
    if (!viewer || !Cesium) return true
    return reliefApplication.set(reliefShadingEnabled)
  }

  function getReliefShadingEnabled() {
    return Boolean(viewer && !viewer.isDestroyed?.() && reliefApplication.isEnabled())
  }

  function getVisualFidelityCapabilities() {
    const relief = Boolean(viewer?.scene?.globe && !viewer.isDestroyed?.()
      && Cesium?.Material && !terrainDegraded && terrainPlan && !reliefApplication.hasFailed())
    return visualFidelityCapabilities({ relief,
      refinement: refinementApplication.available(),
      refinementReason: refinementApplication.hasFailed() ? 'Terrain refinement could not be applied.' : 'Terrain refinement needs a ready globe and approved terrain.',
      dynamicAtmosphere: recordedLighting.available(),
      dynamicAtmosphereReason: 'Dynamic atmosphere needs an exact inspection timestamp and a ready, frozen globe clock.',
      sunLighting: recordedLighting.available(),
      sunLightingReason: 'Sun lighting needs an exact inspection timestamp and a ready, frozen globe clock. Date-only scopes do not supply an instant.',
      groundAtmosphere: atmosphereAvailable(viewer,'groundAtmosphere') && !groundAtmosphereApplication.hasFailed(),
      distanceHaze: atmosphereAvailable(viewer,'distanceHaze') && !distanceHazeApplication.hasFailed(),
      atmosphereReason: 'Atmosphere display is unavailable on this renderer or could not be applied.',
      resolution: resolutionApplication.available(),
      resolutionReason: resolutionApplication.hasFailed() ? 'Render resolution could not be applied.' : 'Render resolution unavailable on this renderer.',
      fxaa: cesiumFxaaAvailable(viewer) && !fxaaApplication.hasFailed(),
      fxaaReason: fxaaApplication.hasFailed() ? 'FXAA could not be applied.' : 'FXAA unavailable on this renderer.',
      reason: reliefApplication.hasFailed() ? 'Relief could not be applied.'
        : terrainDegraded || !terrainPlan ? 'Approved terrain is unavailable.'
        : 'Globe renderer is not ready.' })
  }

  function setVisualFidelityProfile(profile) {
    const effective = resolveVisualFidelityProfile(profile, getVisualFidelityCapabilities())
    const sunlightApplied = recordedLighting.setLighting(effective.sunLighting)
    if (!sunlightApplied && recordedLighting.state().lightingEnabled) onStackIdChange?.('openfreemap-positron')
    const reliefApplied = setReliefShadingEnabled(effective.reliefShading)
    const fxaaApplied = fxaaApplication.set(effective.fxaa)
    const refinementApplied = refinementApplication.set(effective.refinement)
    const resolutionApplied = resolutionApplication.set(effective.resolutionScale)
    const groundApplied = groundAtmosphereApplication.set(effective.groundAtmosphere)
    const hazeApplied = distanceHazeApplication.set(effective.distanceHaze)
    const dynamicApplied = recordedLighting.setDynamicAtmosphere(effective.dynamicAtmosphere)
    if (!dynamicApplied && recordedLighting.state().dynamicAtmosphere) onStackIdChange?.('openfreemap-positron')
    return dynamicApplied && refinementApplied && sunlightApplied && reliefApplied && fxaaApplied && resolutionApplied && groundApplied && hazeApplied
  }

  // Stage D: terrain status snapshot for the honest-availability UI.
  // { status: 'idle' | 'active' | 'unavailable', fetchAttempts, ... }
  // 'idle' means no approved tile has been requested yet (e.g. planetary
  // view) — the globe is correctly showing the reference ellipsoid outside
  // the approved coverage.
  function getTerrainStatus() {
    if (terrainDegraded) return { status: 'unavailable', fetchAttempts: 0, fetchSuccesses: 0, fetchFailures: 0, sourceRejections: 0 }
    return terrainPlan?.getStatus?.() ?? { status: 'unavailable', fetchAttempts: 0, fetchSuccesses: 0, fetchFailures: 0, sourceRejections: 0 }
  }

  // Stage D acceptance probe (DISPLAY-only): sample the ACTIVE terrain
  // provider at a fixed level so the live walk can prove terrain is real
  // inside the approved coverage and honestly absent outside it. Sampled
  // heights are source-datum display values; they are never written to any
  // canonical state.
  async function sampleTerrainHeights(lonLatPairs, level = 11) {
    if (!viewer || !Cesium || !Array.isArray(lonLatPairs)) return null
    try {
      const providerRef = viewer.terrainProvider
      const results = new Array(lonLatPairs.length).fill(0)
      const servedIdx = []
      const positions = []
      lonLatPairs.forEach(([lon, lat], i) => {
        // The bounded provider defers (synchronous undefined) every tile it
        // does not serve, and the engine's sampling helper retries deferred
        // tiles indefinitely — so only forward positions the provider
        // definitively serves at this level. Every other position honestly
        // samples the displayed surface there: the reference ellipsoid (0).
        const tile = tileXYForLongitudeLatitudeDegrees(lon, lat, level)
        if (providerRef?.getTileDataAvailable?.(tile.x, tile.y, level) === true) {
          servedIdx.push(i)
          positions.push(Cesium.Cartographic.fromDegrees(lon, lat))
        }
      })
      if (positions.length > 0) {
        const updated = await Cesium.sampleTerrain(providerRef, level, positions)
        servedIdx.forEach((i, k) => {
          const h = updated[k]?.height
          results[i] = Number.isFinite(h) ? h : 0
        })
      }
      return results
    } catch {
      return null
    }
  }

  // Stage C: serialize the live camera into the renderer-neutral contract.
  // Returns a JSON string (or null when no viewer/camera is available).
  function getCameraState() {
    if (!viewer || !Cesium) return null
    try {
      return serializeCameraState(
        cameraStateFromGlobeCamera(Cesium.Math, Cesium.Camera?.clone ? (cameraSnapshot = Cesium.Camera.clone(viewer.camera,cameraSnapshot ?? undefined)) : viewer.camera, activePrecisionClass()),
        activePrecisionClass(),
      )
    } catch {
      return null
    }
  }

  // Stage C: restore a serialized camera state. FAIL-SAFE: invalid or
  // unsupported state returns false and leaves the camera, the Investigation
  // Context, and the route untouched. The precision-class floor clamps the
  // restored height to the ~5 km city ceiling in meters — never finer.
  function setCameraState(serialized) {
    if (!viewer || !Cesium) return false
    const parsed = parseCameraState(serialized, { precisionClass: activePrecisionClass() })
    if (!parsed) return false
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = heightMetersForPrecisionClass(activePrecisionClass())
    return applyCameraStateToGlobeViewer(Cesium, viewer, parsed)
  }

  function destroyRendererResources() {
    // Host visibility and publication authority stay revoked while the actual
    // pinned native lifetime survives. Disposal retries only finalization.
    for (const remove of removeLayoutListeners.splice(0)) {
      try { remove?.() } catch { /* continue native teardown */ }
    }
    try { eventHandler?.destroy?.() } catch { /* Viewer teardown still runs */ }
    eventHandler = null
    try {
      if (sourceImagery) sourceImagery.destroy({destroyNative:()=>destroyCesiumResources({viewer})})
      else destroyCesiumResources({viewer})
    } catch { destroyCesiumResources({viewer}) }
    labelMeasurements.clear()
    displayPresentation = null
    displaySignature = ''
    try { terrainPlan?.destroy?.() } catch { /* ancillary failure cannot lose native ownership */ }
    try { imageryObservation?.dispose() } catch { /* retain the native retry path */ }
    imageryObservation = null
    ownedHost?.destroy()
    ownedHost = null
    entities = []
    nativeBillboards=null;selectedBillboard=null;envelopeMemory=null;distanceMemory=null
    terrainPlan = null
    terrainDegraded = false
    let nativeEnded = !viewer
    try { nativeEnded ||= viewer.isDestroyed?.() === true } catch { /* absence is not destruction proof */ }
    const retained = sourceImagery?.state()
    const released = !retained || (retained.ownedPhotoLayerCount === 0
      && retained.retainedRgbaBytes === 0 && retained.bitmapLeaseCount === 0)
    if (nativeEnded && released) { sourceImagery = null; viewer = null; return true }
    return false
  }

  function destroy() {
    localCancelled = true
    // Stop even the ordinary render loop immediately. DOM detachment is safe
    // inside a draw; native destruction still obeys the deferred fatal boundary.
    if (viewer) viewer.useDefaultRenderLoop = false
    if (ownedHost) { ownedHost.element.style.visibility = 'hidden'; ownedHost.destroy() }
    mounted = false
    return failureLifecycle ? failureLifecycle.destroy() : destroyRendererResources()
  }

  function getSourceImageryState() {
    const state = sourceImagery?.state()
    if (state && !cancelledNow()) return { ...state, nativeTeardownPending: false }
    let nativeTeardownPending = Boolean(viewer)
    try { if (viewer?.isDestroyed?.() === true) nativeTeardownPending = false } catch { /* fail closed */ }
    // A detached failed owner exposes accounting scalars only, never its old
    // source ID, capture, bounds, pixel footprint, credit or active observation.
    return { available: false, status: nativeTeardownPending ? 'teardown-pending' : 'unavailable',
      ownedPhotoLayerCount: state?.ownedPhotoLayerCount ?? 0,
      retainedRgbaBytes: state?.retainedRgbaBytes ?? 0, bitmapLeaseCount: state?.bitmapLeaseCount ?? 0,
      visibilityFenced: true, nativeTeardownPending }
  }

  // Detached display scalars: expose the actual controller floor and raw
  // camera height so qualification cannot be masked by serialization clamps.
  function cameraGovernanceState() {
    const precision = activePrecisionClass()
    const floor = viewer?.scene?.screenSpaceCameraController?.minimumZoomDistance
    const height = viewer?.camera?.positionCartographic?.height
    return {
      precisionClass: typeof precision === 'string' ? precision : null,
      minimumZoomDistanceMeters: Number.isFinite(floor) ? floor : null,
      rawHeightMeters: Number.isFinite(height) ? height : null,
    }
  }

  // Adapter interface.
  return {
    getAttribution: () => mapStackById(stackId)?.attribution ?? '',
    mount,
    setFeatures,
    setOnSelectRow,
    setRelationships: edges => {
      if (cancelledNow()) return
      currentRelationships = edges ?? []
      displaySignature = ''
      if (refreshDisplayLayout()) viewer?.scene?.requestRender?.()
    },
    getDisplayLayout: () => { if (refreshDisplayLayout()) viewer?.scene?.requestRender?.(); return displayPresentation },
    getBillboardState: () => ({enabled:billboardEnabled,selected:selectedBillboard ? JSON.parse(JSON.stringify(selectedBillboard)) : null,
      markers:nativeBillboards ? Array.from({length:nativeBillboards.length},(_,i)=>{const b=nativeBillboards.get(i),screen=b.computeScreenSpacePosition(viewer.scene);return {key:b.id.__mipMarker.id,declaredWorldPosition:{x:b.position.x,y:b.position.y,z:b.position.z},eyeOffset:{x:b.eyeOffset?.x ?? 0,y:b.eyeOffset?.y ?? 0,z:b.eyeOffset?.z ?? 0},screen:screen?{x:screen.x,y:screen.y}:null,width:b.width,height:b.height,heightReference:b.heightReference,disableDepthTestDistance:b.disableDepthTestDistance}}):[]}),
    getDisplayTiming: () => ({ ...layoutTiming }),
    flyToSubjectCamera,
    cancelCameraFlight: () => cancelGlobeCameraFlight(viewer),
    getCameraState,
    setCameraState,
    getTerrainStatus,
    sampleTerrainHeights,
    setReliefShadingEnabled,
    getReliefShadingEnabled,
    setVisualFidelityProfile,
    setRecordedTimeInstant: value => recordedLighting.setTime(value),
    getVisualFidelityCapabilities,
    getSourceStatus: () => imageryObservation?.snapshot() ?? null,
    setActivityState,
    getVisualFidelityRenderState: () => ({ cameraGovernance: cameraGovernanceState(), renderedFrames, layoutTiming: { ...layoutTiming }, markers: entities.map(e => ({ id: e.id, visible: e.show, labelVisible: e.label?.show?.getValue(viewer.clock.currentTime) === true, selected: e.__mipSelected })), refinement: refinementApplication.state(), recordedLighting: recordedLighting.state(), cameraPose: viewer?.camera ? ['position','direction','up','right'].map(key => ({ x: viewer.camera[key].x, y: viewer.camera[key].y, z: viewer.camera[key].z })) : null, atmosphere: atmosphereState(viewer), globeTilesLoaded: viewer?.scene?.globe?.tilesLoaded === true, fxaa: cesiumFxaaState(viewer), resolution: cesiumResolutionState(viewer), requestRenderMode: viewer?.scene?.requestRenderMode === true }),
    requestRender,
    attachSourceImagery: (loaded,descriptor,options)=>sourceImagery?.attach(loaded,descriptor,options) ?? Promise.reject(Error('native-source-not-ready')),
    getSourceImageryState,
    fenceSourceImagery: ()=>cancelledNow() ? destroy() : sourceImagery?.fence(),
    destroy,
  }
}

/** Display texture only: supplied label/precision, no inferred facts. */
export function worldViewNativeBillboardTexture(label,state,precision) {
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
  const wide=state!=='icon',width=wide?360:48,height=state==='plaque'?112:64
  const title=wide?`<text x="42" y="39" font-size="23" fill="#fff4dd">${escape(String(label??'').slice(0,24))}</text>`:''
  const detail=state==='plaque'?`<text x="12" y="86" font-size="17" fill="#b6cec4">${escape(worldBillboardScopeLabel(precision))}</text>`:''
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="10" fill="#243b39" stroke="#efe6cc" stroke-width="2"/><circle cx="22" cy="30" r="8" fill="#fff4dd"/>${title}${detail}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function worldViewNativeBillboardSignature(markers,singles,states,ground=null) {
  return JSON.stringify(markers.map(marker=>[marker.id,singles.has(marker.id),states[marker.id],marker.label,marker.position,marker.row?.revision_id,marker.row?.precision_class,ground?.get(marker.id)?.displayHeightMeters ?? null]))
}

/** Existing source terrain samples affect DISPLAY altitude only. No request,
 * geometry rewrite, uncertainty radius or evidence elevation is supplied. */
export function worldViewBillboardDisplayGround(C,viewer,marker) {
  const coordinates=marker.position
  let displayHeightMeters=0
  try {
    const height=viewer.scene.globe.getHeight?.(C.Cartographic.fromDegrees(coordinates[0],coordinates[1]))
    if(Number.isFinite(height))displayHeightMeters=height
  } catch { /* unavailable background terrain retains the reference ellipsoid */ }
  return {worldPosition:C.Cartesian3.fromDegrees(coordinates[0],coordinates[1],displayHeightMeters),
    displayHeightMeters,canonicalCoordinates:coordinates}
}

// Terrain intersection only, using the renderer's already-owned source data.
// GPU depth still masks the full painted glyph; no through-geometry override.
export function worldViewBillboardTerrainOccluded(C,viewer,point) {
  if(!point||!viewer?.scene?.globe?.pick||!C?.Ray)return false
  try {
    const origin=viewer.camera.positionWC
    const direction=C.Cartesian3.subtract(point,origin,new C.Cartesian3())
    const distance=C.Cartesian3.magnitude(direction)
    if(!Number.isFinite(distance)||distance<=0)return false
    const hit=viewer.scene.globe.pick(new C.Ray(origin,C.Cartesian3.normalize(direction,direction)),viewer.scene)
    return Boolean(hit&&C.Cartesian3.distance(origin,hit)<distance-0.5)
  } catch { return true }
}

/** Native singleton glyphs share the existing explicit display-group chooser.
 * Bounds and density suppress/downgrade display targets, never relocate them.
 * The current visible row list remains the accessible route to omitted targets.
 */
export function worldViewBillboardNativeTargets(markers,admittedSingles,states,viewport) {
  const singles=new Set(),nativeStates={...states},counts={plaque:0,ribbon:0}
  if(!Number.isFinite(viewport?.width)||!Number.isFinite(viewport?.height))return {singles,states:nativeStates}
  const ordered=[...markers].sort((a,b)=>Number(b.selected)-Number(a.selected)||(String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0))
  for(const marker of ordered){
    if(!admittedSingles.has(marker.id)||singles.size>=BILLBOARD_DISPLAY_CAPS.targets)continue
    let state=nativeStates[marker.id] ?? 'icon'
    if((state==='plaque'||state==='ribbon')&&counts[state]>=BILLBOARD_DISPLAY_CAPS[state])state='icon'
    const width=state==='plaque'?180:state==='ribbon'?132:24,height=state==='plaque'?56:state==='ribbon'?32:24
    if(!Number.isFinite(marker.x)||!Number.isFinite(marker.y)||marker.x-width/2<16||marker.x+width/2>viewport.width-16
      ||marker.y-height/2<72||marker.y+height/2>viewport.height-44)continue
    nativeStates[marker.id]=state
    if(state==='plaque'||state==='ribbon')counts[state]++
    singles.add(marker.id)
  }
  return {singles,states:nativeStates}
}
import { validateWorldViewBoundedRgbLoaded } from './worldViewBoundedRgbImagery.js'

let sourceAdapterSerial = 0

// Public Cesium ImageryProvider API over already hash-verified decoded images.
// No URL provider, second download, private vendor image field or native handle
// crosses this interface. The render lease outlives safe native teardown.
export function createWorldViewNativeRgbAttachment({Cesium,getViewer,getHost,isCancelled=()=>false,onChange=()=>{},onTeardownFailure=()=>{},deadlineMs=15000}={}) {
  const adapterGeneration=++sourceAdapterSerial, entries=new Set()
  let generation=0, active=null, destroyed=false, frame=0, clearing=false, teardownFailed=false, removeBaseline=null, baselineTimer=null
  const live=()=>!destroyed&&!isCancelled()&&getViewer()&&!getViewer().isDestroyed?.()
  const owns=entry=>getViewer()===entry.viewer&&entry.viewer.imageryLayers===entry.collection&&entry.layers.every(layer=>entry.collection.contains(layer))
  const creditsVisible=entry=>{
    const node=getHost()?.querySelector?.('.cesium-widget-credits')
    const style=node?.ownerDocument?.defaultView?.getComputedStyle?.(node)
    return Boolean(node&&node.getClientRects?.().length&&style?.display!=='none'&&style?.visibility!=='hidden'&&style?.opacity!=='0'
      &&entry.credits.every(text=>node.textContent.includes(text)))
  }
  const footprint=entry=>{
    try {
      const viewer=getViewer(), [w,s,e,n]=entry.descriptor.bounds
      const points=[[w,s],[w,n],[e,s],[e,n]].map(([lon,lat])=>Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene,Cesium.Cartesian3.fromDegrees(lon,lat)))
      if(points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null
      return {left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y)),width:viewer.canvas.clientWidth,height:viewer.canvas.clientHeight}
    }catch{return null}
  }
  const state=()=>({available:Boolean(live()&&!clearing&&!teardownFailed),adapterGeneration,attachmentGeneration:generation,
    status:teardownFailed?'teardown-failed':active?.confirmed?'active':active?'loading':clearing?'clearing':'idle',sourceId:active?.descriptor.sourceId??null,
    assetSha256:active?.loaded.assetSha256??null,bounds:active?.descriptor.bounds??null,level:active?.descriptor.level??null,
    ancestry:active?.descriptor.ancestry??null,baselineLayerCount:live()?getViewer().imageryLayers.length-[...entries].reduce((sum,entry)=>sum+entry.layers.length,0):0,
    ownedPhotoLayerCount:[...entries].reduce((sum,entry)=>sum+entry.layers.length,0),successfulTileKeys:active?[...active.successful]:[],providerSuccesses:active?.successes??0,
    nativeFrameObserved:active?.confirmed??false,creditsVisible:active?creditsVisible(active):false,baselineFrameObserved:!clearing,
    retainedRgbaBytes:[...entries].reduce((sum,entry)=>sum+entry.loaded.decodedByteLength,0),bitmapLeaseCount:entries.size,
    screenFootprint:active?footprint(active):null,renderedFrames:frame,visibilityFenced:clearing})
  const publish=()=>{try{onChange(structuredClone(state()))}catch{/* display observation cannot grant authority */}}
  const hide=()=>{const host=getHost();if(host)host.style.visibility='hidden'}
  const cleanup=entry=>{
    if(entry.cleaned)return true
    // The getter can disappear during outer renderer cleanup. Only the actual
    // Viewer which owns these layers can prove their native lifetime ended.
    const viewer=entry.viewer
    const retained=[]
    for(const layer of entry.layers){
      try{if(viewer&&!viewer.isDestroyed?.()&&entry.collection.contains(layer)){
        entry.collection.remove(layer,true)
        if(entry.collection.contains(layer)){retained.push(layer);continue}
      }}catch{retained.push(layer)}
    }
    entry.layers=retained
    if(retained.length&&viewer&&!viewer.isDestroyed?.()){
      if(!teardownFailed){teardownFailed=true;hide();try{onTeardownFailure()}catch{/* failure notification cannot release live images */}}
      publish();return false
    }
    entry.cleaned=true;entry.layers=[]
    try{entry.releaseLease()}finally{entries.delete(entry);publish()}
    return true
  }
  const disposeEntry=entry=>{
    if(entry.disposed)return;entry.disposed=true;entry.removeFrame?.();entry.removeFrame=null
    clearTimeout(entry.timer);entry.signal?.removeEventListener('abort',entry.abort)
    if(active===entry)active=null
    // A renderError/context-loss callback can be inside Cesium's draw. Keep
    // bitmap ownership until the draw exits, even if controller cleanup reenters.
    if(isCancelled()&&!destroyed)queueMicrotask(()=>cleanup(entry));else cleanup(entry)
  }
  const stopBaseline=()=>{removeBaseline?.();removeBaseline=null;clearTimeout(baselineTimer);baselineTimer=null}
  function fence() {
    generation++;hide();clearing=true;stopBaseline()
    for(const entry of [...entries]){entry.reject?.(Error('source-attachment-invalidated'));disposeEntry(entry)}
    if(!live()){publish();return}
    const token=generation, before=frame, viewer=getViewer()
    removeBaseline=viewer.scene.postRender.addEventListener(()=>{
      if(!live()||teardownFailed||entries.size||token!==generation||active)return
      if(frame<=before+1){viewer.scene.requestRender?.();return}
      stopBaseline();clearing=false;const host=getHost();if(host)host.style.visibility='';publish()
    })
    baselineTimer=setTimeout(()=>{if(token!==generation)return;stopBaseline();publish()},deadlineMs)
    viewer.scene.requestRender?.();publish()
  }
  // This listener is independent from attachment observers and witnesses the
  // actual native frame sequence, including cleanup baseline frames.
  let frameViewer=null, removeFrames=null
  function ensureFrames(){const viewer=getViewer();if(viewer===frameViewer)return;removeFrames?.();frameViewer=viewer;removeFrames=viewer?.scene?.postRender?.addEventListener(()=>{frame++})}
  async function attach(loaded,descriptor,{signal}={}) {
    ensureFrames()
    if(!live()||clearing||teardownFailed||signal?.aborted||!validateWorldViewBoundedRgbLoaded(loaded,descriptor))throw Error('bounded-source-binding-unavailable')
    const viewer=getViewer()
    if(active||entries.size||viewer.imageryLayers.length!==1||loaded.tiles.length>4)throw Error('source-baseline-or-layer-bound')
    const credits=(descriptor.metadata?.attribution??[]).map(item=>item.text)
    if(!credits.length||credits.some(text=>typeof text!=='string'||!text.trim()))throw Error('source-credit-unavailable')
    const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
    const entry={viewer,collection:viewer.imageryLayers,loaded,descriptor,layers:[],credits,successful:new Set(),successes:0,successFrame:0,confirmed:false,
      releaseLease:loaded.retainDecodedImages(),signal,disposed:false,cleaned:false,removeFrame:null,timer:null}
    const token=++generation;entries.add(entry);active=entry
    return new Promise((resolve,reject)=>{
      let settled=false
      entry.reject=error=>{if(settled)return;settled=true;reject(error)}
      const fail=reason=>{entry.reject(Error(reason));hide();clearing=true;disposeEntry(entry);fence()}
      entry.abort=()=>fail('source-attachment-aborted')
      signal?.addEventListener('abort',entry.abort,{once:true})
      try {
        for(const tile of loaded.tiles){
          const rectangle=Cesium.Rectangle.fromDegrees(...tile.bounds), errorEvent=new Cesium.Event()
          const provider={rectangle,tileWidth:tile.width,tileHeight:tile.height,minimumLevel:0,maximumLevel:0,
            tilingScheme:new Cesium.GeographicTilingScheme({rectangle,numberOfLevelZeroTilesX:1,numberOfLevelZeroTilesY:1}),
            tileDiscardPolicy:undefined,errorEvent,credit:new Cesium.Credit(credits.map(escape).join(' · '),true),proxy:undefined,hasAlphaChannel:false,
            getTileCredits:()=>undefined,pickFeatures:()=>undefined,
            requestImage(x,y,level){
              if(entry.disposed||!live()||token!==generation||signal?.aborted||x!==0||y!==0||level!==0)return Promise.reject(Error('source-tile-unavailable'))
              return Promise.resolve(tile.imageBitmap).then(image=>{
                if(entry.disposed||!live()||token!==generation||signal?.aborted)throw Error('source-tile-cancelled')
                entry.successful.add(tile.key);entry.successes++;entry.successFrame=frame;viewer.scene.requestRender?.();publish();return image
              })
            }}
          entry.layers.push(viewer.imageryLayers.addImageryProvider(provider))
        }
        entry.removeFrame=viewer.scene.postRender.addEventListener(()=>{
          if(entry.disposed||!live()||token!==generation||signal?.aborted)return
          if(entry.successful.size!==loaded.tiles.length||!owns(entry)||!creditsVisible(entry)||frame<=entry.successFrame+1){viewer.scene.requestRender?.();return}
          entry.confirmed=true;clearTimeout(entry.timer);entry.removeFrame?.();entry.removeFrame=null
          settled=true;publish();resolve({observation:{sourceId:descriptor.sourceId,status:'active',rendered:true,successes:entry.successes,
            attributionVisible:true,bounds:[...descriptor.bounds],level:descriptor.level,ancestry:descriptor.ancestry,
            assetSha256:loaded.assetSha256,adapterGeneration,attachmentGeneration:token,nativeFrameObserved:true,
            successfulTileKeys:[...entry.successful],viewportCoverageQualified:false},dispose(){if(entry.disposed)return;fence()}})
        })
        entry.timer=setTimeout(()=>fail('source-native-frame-deadline'),deadlineMs)
        viewer.scene.requestRender?.();publish()
      }catch{fail('source-native-allocation-failed')}
    })
  }
  return {attach,state,fence(){ensureFrames();fence()},destroy({destroyNative}={}){
    if(!destroyed){destroyed=true;generation++;hide();stopBaseline();removeFrames?.();removeFrames=null}
    for(const entry of [...entries]){entry.reject?.(Error('source-native-destroyed'));disposeEntry(entry);cleanup(entry)}
    // If removal failed, destruction of the actual native Viewer is the next
    // safe lifetime boundary. A failed Viewer destroy retains the lease and
    // permits a later destroy attempt; it cannot close an image still in use.
    try{destroyNative?.()}catch{/* retain unremoved live resources */}
    for(const viewer of new Set([...entries].map(entry=>entry.viewer))){
      try{if(!viewer.isDestroyed?.())viewer.destroy?.()}catch{/* retained lease stays fenced */}
    }
    for(const entry of [...entries])cleanup(entry)
    active=null;publish()
  }}
}
