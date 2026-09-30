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
  if(!Number.isFinite(width)||!Number.isFinite(height))return new Set()
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
      label:entity.label.text.getValue(time),...measureLabel?.(entity.label.text.getValue(time),entity.label.font.getValue(time)),x:screen?.x,y:screen?.y,
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
