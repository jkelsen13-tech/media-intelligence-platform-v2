// Display arbitration only: no coordinate displacement, clustering identity,
// terrain sampling or evidence mutation. World-space positions stay untouched.
export function pointVisibleAboveEllipsoid(camera, point, radii) {
  const keys=['x','y','z']
  if (!keys.every(k=>Number.isFinite(camera?.[k])&&Number.isFinite(point?.[k])
    && Number.isFinite(radii?.[k])&&radii[k]>0)) return false
  const c=keys.map(k=>camera[k]/radii[k]), p=keys.map(k=>point[k]/radii[k])
  const v=p.map((value,i)=>value-c[i])
  const a=v.reduce((sum,value)=>sum+value*value,0)
  const b=c.reduce((sum,value,i)=>sum+value*v[i],0)
  const outside=c.reduce((sum,value)=>sum+value*value,0)-1
  if(outside<=0||a===0) return false
  const discriminant=b*b-a*outside
  if(discriminant<=0) return true
  const first=(-b-Math.sqrt(discriminant))/a
  return !(first>0&&first<1-1e-7)
}

export function visibleLabelIds(markers,{width,height,cameraHeightMeters}={}) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return new Set()
  const cells=new Map(), ids=new Set()
  const cellSize=64
  const keysFor=box=>{
    const keys=[]
    for(let x=Math.floor((box.left-6)/cellSize);x<=Math.floor((box.right+6)/cellSize);x++)
      for(let y=Math.floor((box.top-4)/cellSize);y<=Math.floor((box.bottom+4)/cellSize);y++)keys.push(x+','+y)
    return keys
  }
  const ordered=[...markers].sort((a,b)=>Number(Boolean(b.selected))-Number(Boolean(a.selected))
    || String(a.id).localeCompare(String(b.id),'en'))
  for(const m of ordered){
    if(!m.visible||!Number.isFinite(m.x)||!Number.isFinite(m.y))continue
    if(!m.selected&&cameraHeightMeters>2500000)continue
    const w=Number.isFinite(m.labelWidth)?m.labelWidth:Math.max(40,String(m.label??'').length*12)
    const h=Number.isFinite(m.labelHeight)?m.labelHeight:16
    if(w<0||h<=0)continue
    const box={left:m.x+14,right:m.x+14+w,top:m.y-8-h/2,bottom:m.y-8+h/2}
    if(box.left<0||box.right>width||box.top<0||box.bottom>height)continue
    const keys=keysFor(box), nearby=new Set(keys.flatMap(key=>cells.get(key)??[]))
    if([...nearby].some(a=>box.left<a.right+6&&box.right+6>a.left
      &&box.top<a.bottom+4&&box.bottom+4>a.top))continue
    for(const key of keys){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(box)}
    ids.add(m.id)
  }
  return ids
}

export function updateGlobeMarkerLayout(C,viewer,entities,measureLabel) {
  if(!viewer||viewer.isDestroyed?.()||!C?.SceneTransforms)return false
  const scene=viewer.scene, camera=viewer.camera, time=viewer.clock.currentTime
  const items=entities.map(entity=>{
    const point=entity.position.getValue(time)
    const screen=point&&C.SceneTransforms.worldToWindowCoordinates(scene,point)
    return {id:entity.id,entity,selected:entity.__mipSelected,
      label:entity.label.text.getValue(time),...measureLabel?.(entity.label.text.getValue(time),entity.label.font?.getValue(time) ?? '12px sans-serif'),x:screen?.x,y:screen?.y,
      visible:Boolean(point&&screen&&pointVisibleAboveEllipsoid(camera.positionWC,point,scene.globe.ellipsoid.radii))}
  })
  const labels=visibleLabelIds(items,{width:scene.canvas.clientWidth,height:scene.canvas.clientHeight,
    cameraHeightMeters:camera.positionCartographic.height})
  let changed=false
  for(const m of items){
    const visible=m.visible&&m.x>=0&&m.x<=scene.canvas.clientWidth&&m.y>=0&&m.y<=scene.canvas.clientHeight
    const labelVisible=visible&&labels.has(m.id)
    if(m.entity.show!==visible){m.entity.show=visible;changed=true}
    if(m.entity.label.show.getValue(time)!==labelVisible){m.entity.label.show=labelVisible;changed=true}
  }
  return changed
}

// A single renderer-owned 2D context and bounded cache measure the exact drawn
// text. Keeping full label bounds prevents source-native labels from colliding
// merely because they exceed an arbitrary display-width cap.
export function createMarkerLabelMeasurer(createContext) {
  let context = null, contextAttempted = false
  const cache = new Map()
  return {
    measure(text, font = '12px sans-serif') {
      text = String(text ?? '')
      const key = font + '\n' + text
      if (cache.has(key)) return cache.get(key)
      if (!contextAttempted) {
        contextAttempted = true
        try { context = createContext?.() ?? null } catch { context = null }
      }
      if (!context) return {}
      try {
        context.font = font
        const lines = text.split(/\r\n|\r|\n/)
        const metrics = lines.map(line => context.measureText(line))
        const labelWidth = Math.ceil(Math.max(...metrics.map(m => m.width)))
        // Globe labels can span multiple lines. Font size also protects against
        // unusually small actual glyph bounds such as a line of punctuation.
        const fontHeight = Number.parseFloat(font.match(/([\d.]+)px/)?.[1]) || 12
        const lineHeight = Math.max(16, fontHeight * 1.5,
          ...metrics.map(m => (m.actualBoundingBoxAscent || 9) + (m.actualBoundingBoxDescent || 3)))
        const labelHeight = Math.ceil(lineHeight * lines.length)
        if (!Number.isFinite(labelWidth) || !Number.isFinite(labelHeight)) return {}
        const size = Object.freeze({ labelWidth, labelHeight })
        if (cache.size >= 512) cache.delete(cache.keys().next().value)
        cache.set(key, size)
        return size
      } catch { return {} }
    },
    clear() { cache.clear(); context = null; contextAttempted = false },
  }
}

// A rendered primitive may lag the latest camera pose by one correction frame.
// Recheck visibility at pick time so such a primitive can never select a
// far-side or obsolete marker. Successful picks return the retained row object.
export function dispatchGlobeMarkerPick(viewer, screenPosition, onSelectRow, isCancelled = () => false) {
  if (!viewer || viewer.isDestroyed?.() || isCancelled() || typeof onSelectRow !== 'function') return false
  const entity = viewer.scene.pick(screenPosition)?.id
  if (isCancelled() || viewer.isDestroyed?.() || !entity?.show || !entity.__mipRow) return false
  const position = entity.position?.getValue?.(viewer.clock.currentTime)
  if (!pointVisibleAboveEllipsoid(viewer.camera.positionWC, position, viewer.scene.globe.ellipsoid.radii)) return false
  onSelectRow(entity.__mipRow)
  return true
}
