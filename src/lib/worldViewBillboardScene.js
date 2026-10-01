// Isolated appearance prototype. All city/terrain geometry is synthetic display
// fixture; canonical item coordinates never move and no provider is contacted.
import { makeCameraState, parseCameraState } from './worldViewCameraState.js'

export async function createWorldBillboardScene(host, { items = [], onFrame, onSelect, onError } = {}) {
  globalThis.CESIUM_BASE_URL = `${import.meta.env?.BASE_URL || '/'}cesium/`
  const C = await import('cesium')
  const [icons, { renderToStaticMarkup }, { createElement }] = await Promise.all([import('@phosphor-icons/react'), import('react-dom/server'), import('react')])
  const familyIcons = { events: icons.CalendarBlank, people: icons.Users, markets: icons.ChartLineUp, infrastructure: icons.Buildings, environment: icons.Tree, places: icons.MapPin, relationships: icons.Graph, hazards: icons.Warning, weather: icons.CloudSun, population: icons.UsersThree }
  await import('cesium/Build/Cesium/Widgets/widgets.css')
  if (!host?.isConnected) throw new Error('Scene host detached before renderer startup')
  const viewer = new C.Viewer(host, { baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(),
    animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, baseLayerPicker: false, fullscreenButton: false, selectionIndicator: false,
    infoBox: false, skyBox: false, skyAtmosphere: false, requestRenderMode: true, maximumRenderTimeChange: Infinity })
  const ownedCleanups=[]
  let disposed=false
  const cleanup=()=>{disposed=true;for(const release of ownedCleanups.splice(0).reverse()){try{release()}catch{/* continue releasing remaining owned resources */}}if(!viewer.isDestroyed())viewer.destroy()}
  try {
  const scene = viewer.scene
  scene.globe.baseColor = C.Color.fromCssColorString('#536451')
  scene.globe.depthTestAgainstTerrain = true
  scene.backgroundColor = C.Color.fromCssColorString('#aec5d0')
  scene.fog.enabled = false
  scene.screenSpaceCameraController.minimumZoomDistance = 25
  const collection = scene.primitives.add(new C.BillboardCollection({ scene }))
  const fixturePrimitives = []
  const fixtureBounds = []
  let current = [], selected = null, enabled = true, presentation = null
  let target = C.Cartesian3.fromDegrees(-81.7, 41.4, 0)
  const telemetry = { recordedTime:null, visibilityPauses:0, frames: 0, orbit: 0, pan: 0, zoom: 0, picks: 0, blockedPicks: 0, pose: 'close', fixture: true }
  function box(lon, lat, width, depth, height, color, name) {
    const transform = C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(lon, lat, height / 2))
    const primitive = scene.primitives.add(new C.Primitive({ geometryInstances: new C.GeometryInstance({
      id: { fixture: true, name }, geometry: C.BoxGeometry.fromDimensions({ dimensions: new C.Cartesian3(width, depth, height), vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT }),
      modelMatrix: transform, attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(color)) } }),
      appearance: new C.PerInstanceColorAppearance({ translucent: false, closed: true }), asynchronous: false }))
    fixturePrimitives.push(primitive)
    fixtureBounds.push({ inverse: C.Matrix4.inverseTransformation(transform, new C.Matrix4()), half: [width / 2, depth / 2, height / 2], name })
  }
  // Cleveland-like blocks, river-colored strip and a reproducible blocking tower.
  for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) {
    if (x === 0 || (x === -1 && y === 0)) continue
    box(-81.7 + x * .0014, 41.4 + y * .0012, 80, 85, 22 + ((x * x + y * y) % 5) * 13, '#8d918b', `city-${x}-${y}`)
  }
  box(-81.7000, 41.3990, 145, 65, 125, '#747d80', 'occlusion-tower')
  box(-81.706, 41.404, 300, 180, 95, '#76856a', 'procedural-terrain-ridge')
  box(-81.708, 41.4, 180, 2200, 1, '#547d8d', 'synthetic-river')
  function texture(label, state, family, count, precision) {
    const wide = state === 'ribbon' || state === 'label' || state === 'plaque'
    const component = state === 'cluster' ? icons.Stack : familyIcons[family] || icons.MapPin
    const icon = renderToStaticMarkup(createElement(component, { size: 26, color: '#fff4dd', weight: 'regular' }))
      .replace('<svg ', '<svg x="8" y="17" ')
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]))
    const text = wide ? escape(String(label).slice(0, 25)) : state === 'cluster' ? escape(count) : ''
    const width = wide ? 320 : state === 'cluster' ? 90 : 60
    const detail=state==='plaque'?`<text x="44" y="51" font-family="sans-serif" font-size="12" fill="#b6cec4">${escape(precision ?? 'Supplied precision')}</text>`:''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="60"><rect x="2" y="2" width="${width-4}" height="56" rx="10" fill="#243b39" stroke="#efe6cc" stroke-width="2"/>${icon}<text x="${wide ? 44 : 43}" y="36" font-family="sans-serif" font-size="20" fill="#fff4dd">${text}</text>${detail}</svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
  function rebuild() {
    collection.removeAll()
    const markers = presentation?.markers ?? current.map(item => ({ key:item.key, state:'icon', width:24, height:24 }))
    for (const marker of markers) {
      const original = current.find(item => item.key === (marker.anchorKey ?? marker.key)) || current.find(item => marker.memberKeys?.includes(item.key))
      if (!original || marker.hidden || marker.visible === false || marker.occluded) continue
      const coords = original.coordinates
      const billboard = collection.add({ position:C.Cartesian3.fromDegrees(coords[0],coords[1],(coords[2] ?? 0)+18),
        image:texture(original.label, marker.state, original.family, marker.memberKeys?.length, original.precision),
        width:marker.width, height:marker.height, verticalOrigin:C.VerticalOrigin.CENTER, disableDepthTestDistance:0,
        id:{ key:marker.key, members:marker.memberKeys || null, billboard:true } })
      billboard.prototypeRecord = { ...original, ...marker, coordinates:[...coords] }
    }
    scene.requestRender()
  }
  function setItems(next) { current = next.map(x => ({ ...x, coordinates: [...x.coordinates] })); rebuild() }
  function setRecordedTime(value) {
    viewer.clock.shouldAnimate=false
    if(typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {telemetry.recordedTime=null;return false}
    try {viewer.clock.currentTime=C.JulianDate.fromIso8601(value);telemetry.recordedTime=value;scene.requestRender();return true} catch {telemetry.recordedTime=null;return false}
  }
  function getCameraState() { const c = viewer.camera, p = c.positionCartographic;return makeCameraState({ lon: C.Math.toDegrees(p.longitude), lat: C.Math.toDegrees(p.latitude), heightMeters: p.height,
    headingDegrees: C.Math.toDegrees(c.heading), pitchDegrees: C.Math.toDegrees(c.pitch), rollDegrees: ((C.Math.toDegrees(c.roll) + 180) % 360) - 180 }) }
  function setCameraState(raw) { const s = parseCameraState(raw); if (!s) return false; if (s.position && s.direction && s.up) viewer.camera.setView({ destination: s.position, orientation: { direction: s.direction, up: s.up } });
    else viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(s.lon ?? -81.7, s.lat ?? 41.4, s.heightMeters ?? 550), orientation: { heading: C.Math.toRadians(s.headingDegrees ?? 0), pitch: C.Math.toRadians(s.pitchDegrees ?? -35), roll: C.Math.toRadians(s.rollDegrees ?? 0) } });scene.requestRender();return true }
  function setPose(name = 'close') { telemetry.pose = name
    const range = name === 'continent' ? 1500000 : name === 'regional' ? 60000 : name === 'city' || name === 'far' ? 12000 : name === 'medium' ? 2200 : name === 'occlusion' ? 450 : 900
    viewer.camera.lookAt(target, new C.HeadingPitchRange(0, C.Math.toRadians(name === 'occlusion' ? -14 : -35), range));viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);scene.requestRender() }
  function occluded(anchor) {
    const origin = viewer.camera.positionWC, delta = C.Cartesian3.subtract(anchor, origin, new C.Cartesian3()), distance = C.Cartesian3.magnitude(delta)
    const ray = new C.Ray(origin, C.Cartesian3.normalize(delta, delta))
    const hit = scene.globe.pick(ray, scene)
    if (hit && C.Cartesian3.distance(origin, hit) < distance - 2) return true
    // Exact analytic ray/box check also works when GPU depth ray picking is
    // unavailable. It uses the same local matrices/dimensions as rendered boxes.
    for (const bounds of fixtureBounds) {
      const o = C.Matrix4.multiplyByPoint(bounds.inverse, origin, new C.Cartesian3())
      const d = C.Matrix4.multiplyByPointAsVector(bounds.inverse, ray.direction, new C.Cartesian3())
      const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z]
      let near = 0, far = distance - 2
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(ds[axis]) < 1e-10) { if (Math.abs(os[axis]) > bounds.half[axis]) {far = -1;break} }
        else { const a = (-bounds.half[axis] - os[axis]) / ds[axis], b = (bounds.half[axis] - os[axis]) / ds[axis];near = Math.max(near, Math.min(a, b));far = Math.min(far, Math.max(a, b)) }
      }
      if (near <= far && far > 0) return true
    }
    return !new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, origin).isPointVisible(anchor)
  }
  const handler = new C.ScreenSpaceEventHandler(scene.canvas)
  ownedCleanups.push(()=>handler.destroy())
  handler.setInputAction(event => { const pick = scene.pick(event.position), id = pick?.id
    if (!id?.billboard) return
    const b = [...Array(collection.length)].map((_, i) => collection.get(i)).find(x => x.id === id)
    if (!enabled || !b?.show) {telemetry.blockedPicks++;return}
    telemetry.picks++;onSelect?.(id.key)
  }, C.ScreenSpaceEventType.LEFT_CLICK)
  const removeFrame = scene.postRender.addEventListener(() => {
    if (disposed) return
    telemetry.frames++
    const projected = current.map(item => { const anchor = C.Cartesian3.fromDegrees(...item.coordinates.slice(0, 2), item.coordinates[2] ?? 0)
      const screen = C.SceneTransforms.worldToWindowCoordinates(scene, anchor)
      const markerWorld=C.Cartesian3.fromDegrees(item.coordinates[0],item.coordinates[1],(item.coordinates[2] ?? 0)+18)
      const markerScreen=C.SceneTransforms.worldToWindowCoordinates(scene,markerWorld)
      const distanceMeters=C.Cartesian3.distance(viewer.camera.positionWC,anchor)
      // Sample a stable distance-band footprint before decluttering. Sampling
      // the admitted marker feeds admission back into visibility and can
      // alternate forever between a hidden icon and a larger fallback label.
      // Native GPU depth still masks the actual admitted glyph.
      const width=distanceMeters<=1200?180:distanceMeters<=12000?132:24
      const height=distanceMeters<=1200?56:distanceMeters<=12000?32:24
      const direction=C.Cartesian3.subtract(markerWorld,viewer.camera.positionWC,new C.Cartesian3())
      const depth=C.Cartesian3.dot(direction,viewer.camera.directionWC)
      const units=2*Math.max(1,depth)*Math.tan(viewer.camera.frustum.fovy/2)/Math.max(1,host.clientHeight)
      const samples=[[0,0],[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]].map(([x,y])=>{
        const offset=C.Cartesian3.add(C.Cartesian3.multiplyByScalar(viewer.camera.rightWC,x*width*units,new C.Cartesian3()),C.Cartesian3.multiplyByScalar(viewer.camera.upWC,y*height*units,new C.Cartesian3()),new C.Cartesian3())
        return occluded(C.Cartesian3.add(markerWorld,offset,new C.Cartesian3()))
      })
      const hidden=samples.filter(Boolean).length
      return { ...item, canonicalCoordinates: [...item.coordinates], anchor: screen ? { x: screen.x, y: screen.y } : null,
        markerAnchor:markerScreen?{x:markerScreen.x,y:markerScreen.y}:null,
        distanceMeters, occluded:hidden===samples.length,centerOccluded:samples[0],displayVisibility:hidden===0?'visible':hidden===samples.length?'behind':'partial',occlusionSamples:hidden,
        canonicalOccluded:occluded(anchor) }
    })
    try {onFrame?.({ items: projected, viewport: { width: host.clientWidth, height: host.clientHeight }, camera: getCameraState(), telemetry: { ...telemetry }, sceneType: 'synthetic-fixture', terrainSource: 'ellipsoid + procedural fixture' })} catch (e) {onError?.(e)}
  })
  ownedCleanups.push(removeFrame)
  const handleVisibility = () => {if(disposed)return;viewer.useDefaultRenderLoop = !document.hidden;if(document.hidden)telemetry.visibilityPauses++;else scene.requestRender()}
  document.addEventListener('visibilitychange',handleVisibility);ownedCleanups.push(()=>document.removeEventListener('visibilitychange',handleVisibility));handleVisibility()
  viewer.clock.shouldAnimate=false;setItems(items);setPose('close')
  return { setItems, setRecordedTime, requestFrame:()=>{if(!disposed&&!document.hidden)scene.requestRender()}, setSelected(key) {if (selected !== key) {selected = key;scene.requestRender()}}, setInteractionEnabled(value) {enabled = !!value;scene.screenSpaceCameraController.enableInputs = enabled},
    setPresentation(layout) {const signature = JSON.stringify((layout?.markers ?? []).map(({key,anchorKey,state,memberKeys,width,height})=>({key,anchorKey,state,memberKeys,width,height}))); if (signature === presentation?._signature) return; presentation = { ...layout, _signature: signature };rebuild()}, getCameraState, setCameraState, setPose,
    orbit(degrees = 15) {telemetry.orbit++; const inverse = C.Matrix4.inverseTransformation(C.Transforms.eastNorthUpToFixedFrame(target),new C.Matrix4());const local = C.Matrix4.multiplyByPoint(inverse,viewer.camera.positionWC,new C.Cartesian3());const range=C.Cartesian3.magnitude(local);const heading=Math.atan2(-local.x,-local.y)+C.Math.toRadians(degrees);const pitch=-Math.asin(local.z/range);viewer.camera.lookAt(target,new C.HeadingPitchRange(heading,pitch,range));viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);scene.requestRender()},
    pitch(degrees=5) {const inv=C.Matrix4.inverseTransformation(C.Transforms.eastNorthUpToFixedFrame(target),new C.Matrix4());const local=C.Matrix4.multiplyByPoint(inv,viewer.camera.positionWC,new C.Cartesian3());const range=C.Cartesian3.magnitude(local);const heading=Math.atan2(-local.x,-local.y);const pitch=C.Math.clamp(-Math.asin(local.z/range)+C.Math.toRadians(degrees),C.Math.toRadians(-85),C.Math.toRadians(-10));viewer.camera.lookAt(target,new C.HeadingPitchRange(heading,pitch,range));viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);scene.requestRender()},
    pan(x = 30, y = 0) {telemetry.pan++;viewer.camera.moveRight(x);viewer.camera.moveUp(y);scene.requestRender()},
    zoom(factor = .85) {telemetry.zoom++; const amount = viewer.camera.positionCartographic.height * (1 - factor); amount >= 0 ? viewer.camera.zoomIn(amount) : viewer.camera.zoomOut(-amount);scene.requestRender()},
    getProbe() {return { ...telemetry, camera: getCameraState(), itemCount: current.length, nativeBillboards: collection.length,
      billboardRecords:Array.from({length:collection.length},(_,i)=>{const b=collection.get(i),s=b.computeScreenSpacePosition(scene);return{key:b.id.key,memberKeys:b.id.members,screen:s?{x:s.x,y:s.y}:null,width:b.width,height:b.height,disableDepthTestDistance:b.disableDepthTestDistance,rotation:b.rotation,show:b.show,worldPosition:{x:b.position.x,y:b.position.y,z:b.position.z}}}),
      interactionEnabled: enabled, selected, selectedCanonicalCoordinates: current.find(x => x.key === selected) ? [...current.find(x => x.key === selected).coordinates] : null, selectedDisplayCoordinates: current.find(x => x.key === selected) ? [...current.find(x => x.key === selected).coordinates.slice(0, 2), (current.find(x => x.key === selected).coordinates[2] ?? 0) + 18] : null, fixtureGeometryCount: fixturePrimitives.length, namedOccluder: 'occlusion-tower' }},
    dispose() {if(!disposed)cleanup()} }
  } catch(error) {cleanup();throw error}
}
