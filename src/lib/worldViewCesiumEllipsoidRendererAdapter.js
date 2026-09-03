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
  mapStackById,
  minCameraDistanceFromCenterMetersForPrecisionClass,
  subjectEllipsoidCamera,
} from './worldViewMapStack.js'

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
  getSelectedKeys,
  onSelectRow,
  onStackIdChange,
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

  const cancelledNow = () => localCancelled || Boolean(isCancelled?.())

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

    try {
      Cesium = await import('cesium')
      // Cesium's widgets.css is required for credits and cursor styling.
      await import('cesium/Build/Cesium/Widgets/widgets.css')
    } catch {
      if (!cancelledNow()) onStackIdChange?.('openfreemap-positron')
      return
    }

    if (cancelledNow()) return

    const baseUrl = (import.meta?.env?.BASE_URL ?? '/') + 'cesium/'
    // Cesium uses this global to resolve workers/assets under the GH Pages base path.
    globalThis.CESIUM_BASE_URL = baseUrl

    // Clear host to avoid duplicate canvases if the adapter is rebooted.
    try {
      hostEl.innerHTML = ''
    } catch {
      /* ignore */
    }

    const stack = mapStackById(stackId)
    const attributionText = stack?.attribution ?? '© OpenStreetMap contributors'

    // Keyless open imagery.
    const imageryProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: new Cesium.Credit(attributionText),
      maximumLevel: 19,
    })

    // Minimal Viewer UI: no terrain, no 3D tiles.
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
      imageryProvider,
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
    viewer.scene.screenSpaceCameraController.minimumZoomDistance =
      minCameraDistanceFromCenterMetersForPrecisionClass(precisionClass)

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
      duration: 1600,
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

  function destroy() {
    localCancelled = true
    destroyCesiumResources({ eventHandler, viewer })
    viewer = null
    eventHandler = null
    entities = []
    mounted = false
  }

  // Adapter interface.
  return {
    getAttribution: () => mapStackById(stackId)?.attribution ?? '',
    mount,
    setFeatures,
    setOnSelectRow,
    flyToSubjectCamera,
    requestRender,
    destroy,
  }
}

