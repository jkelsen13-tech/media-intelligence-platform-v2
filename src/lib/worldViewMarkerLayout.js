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
  const accepted=[], ids=new Set()
  const ordered=[...markers].sort((a,b)=>Number(b.selected)-Number(a.selected)
    || String(a.id).localeCompare(String(b.id),'en'))
  for(const m of ordered){
    if(!m.visible||!Number.isFinite(m.x)||!Number.isFinite(m.y))continue
    if(!m.selected&&cameraHeightMeters>2500000)continue
    const w=Math.min(320,Math.max(40,String(m.label??'').length*7))
    const box={left:m.x+12,right:m.x+12+w,top:m.y-18,bottom:m.y+2}
    if(box.left<0||box.right>width||box.top<0||box.bottom>height)continue
    if(accepted.some(a=>box.left<a.right+6&&box.right+6>a.left
      &&box.top<a.bottom+4&&box.bottom+4>a.top))continue
    accepted.push(box);ids.add(m.id)
  }
  return ids
}

export function updateGlobeMarkerLayout(C,viewer,entities) {
  if(!viewer||viewer.isDestroyed?.()||!C?.SceneTransforms)return false
  const scene=viewer.scene, camera=viewer.camera, time=viewer.clock.currentTime
  const items=entities.map(entity=>{
    const point=entity.position.getValue(time)
    const screen=point&&C.SceneTransforms.worldToWindowCoordinates(scene,point)
    return {id:entity.id,entity,selected:entity.__mipSelected,
      label:entity.label.text.getValue(time),x:screen?.x,y:screen?.y,
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
