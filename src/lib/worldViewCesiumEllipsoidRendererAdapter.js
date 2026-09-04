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
  parseCameraState,
  serializeCameraState,
} from './worldViewCameraState.js'
import {
  createTerrariumTerrainProvider,
  TERRAIN_CREDIT_TEXT,
} from './worldViewCesiumTerrariumTerrainProvider.js'

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
  return makeCameraState(
    {
      lon: math.toDegrees(carto.longitude),
      lat: math.toDegrees(carto.latitude),
      heightMeters: carto.height,
      headingDegrees: math.toDegrees(camera.heading),
      pitchDegrees: math.toDegrees(camera.pitch),
      rollDegrees: math.toDegrees(camera.roll),
    },
    precisionClass,
  )
}

/** Apply an already-normalized camera state to a live globe viewer. */
export function applyCameraStateToGlobeViewer(Cesium, viewer, cameraState) {
  if (!Cesium || !viewer || !cameraState) return false
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
      position,
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

// Normalize the Vite deployment base into the URL Cesium uses to resolve
// its static Workers/Assets/Widgets directories.
//
// Examples:
//   '/some-deploy-subpath/' -> '/some-deploy-subpath/cesium/'
//   '/some-deploy-subpath'  -> '/some-deploy-subpath/cesium/'
//   '/'                     -> '/cesium/'
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
  shouldFlyTo,
  markFlew,
  initialFeatures,
  isCancelled,
}) {
  // Ensure this adapter is only used for the ellipsoid globe stack id.
  if (stackId !== ELLIPSOID_GLOBE_STACK_ID && stackId !== undefined) {
    // eslint-disable-next-line no-console
    console.warn('createCesiumEllipsoidRendererAdapter called with non-ellipsoid stack id', stackId)
  }

  let viewer = null
  let eventHandler = null
  let entities = []
  let mounted = false
  let currentOnSelectRow = onSelectRow
  let localCancelled = false
  let Cesium = null
  // Stage D: bounded terrain state. `terrainPlan` holds the MIP-owned
  // provider; `terrainDegraded` records the honest ellipsoid fallback.
  let terrainPlan = null
  let terrainDegraded = false

  const cancelledNow = () => localCancelled || Boolean(isCancelled?.())

  // Stage C: the recorded precision class can arrive AFTER mount (rows load
  // asynchronously), so camera-state get/set must resolve it live at call
  // time. Using the mount-time value here would drop the ~5 km city ceiling
  // floor whenever the class was not yet available at mount.
  const activePrecisionClass = () => getPrecisionClass?.() ?? precisionClass

  async function mount() {
    if (mounted) return
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

    // Clear host to avoid duplicate canvases if the adapter is rebooted.
    try {
      hostEl.innerHTML = ''
    } catch {
      /* ignore */
    }

    const stack = mapStackById(stackId)
    const attributionText = stack?.attribution ?? '© OpenStreetMap contributors'

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
      credit: new Cesium.Credit(attributionText),
      maximumLevel: 19,
    })

    // Minimal Viewer UI: bounded display-only terrain, no 3D tiles.
    try {
      viewer = new Cesium.Viewer(hostEl, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        sceneMode: Cesium.SceneMode.SCENE3D,
        infoBox: false,
        selectionIndicator: false,
        baseLayer: new Cesium.ImageryLayer(imageryProvider),
        ...(terrainPlan ? { terrainProvider: terrainPlan.provider } : {}),
      })
    } catch (bootError) {
      // eslint-disable-next-line no-console
      console.error('Cesium failed to boot; falling back to MapLibre:', bootError?.message ?? bootError)
      viewer = null
      if (!cancelledNow()) onStackIdChange?.('openfreemap-positron')
      return
    }

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

    viewer.scene.renderError.addEventListener((scene, renderError) => {
      // eslint-disable-next-line no-console
      console.error('Cesium render failure; falling back to MapLibre:', renderError?.message ?? renderError)
      if (cancelledNow() || !viewer) return
      destroyCesiumResources({ eventHandler, viewer })
      viewer = null
      eventHandler = null
      entities = []
      onStackIdChange?.('openfreemap-positron')
    })

    // Request-only rendering governance: only redraw on camera/props changes.
    viewer.scene.requestRenderMode = true

    // Enable orbit / free rotation / tilt / continuous zoom.
    viewer.scene.screenSpaceCameraController.enableRotate = true
    viewer.scene.screenSpaceCameraController.enableTilt = true
    viewer.scene.screenSpaceCameraController.enableTranslate = true
    viewer.scene.screenSpaceCameraController.enableZoom = true
    viewer.scene.screenSpaceCameraController.enableLook = true

    // Constrain "zoom in" so the camera can't reach fake finer precision.
    // minimumZoomDistance is a height in meters above the ellipsoid surface.
    viewer.scene.screenSpaceCameraController.minimumZoomDistance =
      heightMetersForPrecisionClass(precisionClass)

    // Picking: clicking a marker returns the original projection row reference.
    eventHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas)
    eventHandler.setInputAction((click) => {
      if (cancelledNow()) return
      const picked = viewer.scene.pick(click.position)
      const entity = picked?.id
      const row = entity?.__mipRow
      if (row) currentOnSelectRow?.(row)
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
      }

      const label = d.label || d.precisionClass || 'projected location'

      const entity = viewer.entities.add({
        id: d.id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        point,
        label: {
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
      entities.push(entity)
    }

    if (cancelledNow()) return

    // Initial camera framing: local camera only.
    if (shouldFlyTo?.()) {
      const cam = subjectEllipsoidCamera(coordinate, precisionClass)
      if (cam) {
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = cam.minZoomDistanceMeters
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, cam.heightMeters),
          orientation: {
            heading: Cesium.Math.toRadians(cam.headingDegrees),
            pitch: Cesium.Math.toRadians(cam.pitchDegrees),
            roll: Cesium.Math.toRadians(cam.rollDegrees),
          },
        })
        viewer.scene.requestRender?.()
        markFlew?.()
      }
    }
  }

  async function setFeatures(nextFeatures, nextSelectedKeys = getSelectedKeys?.()) {
    if (!viewer || !Cesium) return
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
      }

      const label = d.label || d.precisionClass || 'projected location'

      const entity = viewer.entities.add({
        id: d.id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        point,
        label: {
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
      entities.push(entity)
    }

    // Trigger a render in requestRenderMode.
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

    viewer.scene.screenSpaceCameraController.minimumZoomDistance = cam.minZoomDistanceMeters

    viewer.camera.flyTo({
      // Cesium flyTo duration is SECONDS (not milliseconds). A value of 1600
      // animated the subject fly-to over ~27 minutes, so a deep-link load
      // never reached the city-class ceiling within a session.
      duration: 1.6,
      destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, cam.heightMeters),
      orientation: {
        heading: Cesium.Math.toRadians(cam.headingDegrees),
        pitch: Cesium.Math.toRadians(cam.pitchDegrees),
        roll: Cesium.Math.toRadians(cam.rollDegrees),
      },
      essential: true,
    })

    return true
  }

  function requestRender() {
    viewer?.scene?.requestRender?.()
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
      const positions = lonLatPairs.map(([lon, lat]) => Cesium.Cartographic.fromDegrees(lon, lat))
      const updated = await Cesium.sampleTerrain(viewer.terrainProvider, level, positions)
      return updated.map((p) => (Number.isFinite(p.height) ? p.height : 0))
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
        cameraStateFromGlobeCamera(Cesium.Math, viewer.camera, activePrecisionClass()),
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
    return applyCameraStateToGlobeViewer(Cesium, viewer, parsed)
  }

  function destroy() {
    localCancelled = true
    destroyCesiumResources({ eventHandler, viewer })
    viewer = null
    eventHandler = null
    entities = []
    terrainPlan = null
    terrainDegraded = false
    mounted = false
  }

  // Adapter interface.
  return {
    getAttribution: () => mapStackById(stackId)?.attribution ?? '',
    mount,
    setFeatures,
    setOnSelectRow,
    flyToSubjectCamera,
    getCameraState,
    setCameraState,
    getTerrainStatus,
    sampleTerrainHeights,
    requestRender,
    destroy,
  }
}
