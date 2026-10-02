// Pure DISPLAY controller: camera distance and its admitted precision envelope
// determine density; importance and content do not. Source data stay immutable.
import { heightMetersForPrecisionClass } from './worldViewMapStack.js'
const finite=Number.isFinite
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
const validCard=c=>c&&['x','y','width','height'].every(k=>finite(c[k]))&&c.width>0&&c.height>0
const validAnchor=a=>a&&finite(a.x)&&finite(a.y)
const statesAllowed=new Set(['icon','ribbon','plaque'])

/** The closest legal camera view may show a scope plaque, not an exact point.
 * The physical 1,200m band remains unchanged. The camera's existing precision
 * floor supplies this separate density boundary; it is never lowered here.
 * Unknown precision and a live camera below its floor fail closed. Legacy
 * renderer-neutral fixtures without a precision contract retain their bands.
 */
export function worldBillboardNearDetail(item, {nearMeters=1200,cameraHeightMeters,
  scopePlaques=false,previousKind=null,hysteresisFraction=0.12}={}) {
  const precision=item?.precision ?? item?.precision_class
  const constrained=scopePlaques || Object.hasOwn(item ?? {},'precision')
    || Object.hasOwn(item ?? {},'precision_class') || Object.hasOwn(item ?? {},'precisionFloorMeters')
  if(!constrained)return {kind:'physical',physicalAllowed:true,scopeAllowed:false,precision:null,floorMeters:null}
  const known=['country','region','city','area','facility'].includes(precision)
  if(!known)return {kind:null,physicalAllowed:false,scopeAllowed:false,precision:precision ?? null,floorMeters:null,reason:'precision-unavailable'}
  const floor=heightMetersForPrecisionClass(precision)
  // A caller-supplied stricter floor is preserved; a lower one cannot waive
  // the canonical class floor. Scope never gets a fabricated uncertainty radius.
  const floorMeters=Math.max(floor,finite(item.precisionFloorMeters)&&item.precisionFloorMeters>=0?item.precisionFloorMeters:floor)
  const height=item.cameraHeightMeters ?? cameraHeightMeters
  const epsilon=Math.max(1e-6,floorMeters*1e-10)
  const supported=['city','area','facility'].includes(precision)
  const legal=finite(height)&&height>=floorMeters-epsilon
  const band=clamp(finite(hysteresisFraction)?hysteresisFraction:0.12,0,0.15)
  const scopeAllowed=scopePlaques&&supported&&legal
    && height<=floorMeters*(previousKind==='scope'?1+band:1)+epsilon
  const physicalAllowed=legal&&floorMeters<=nearMeters
  return {kind:scopeAllowed?'scope':physicalAllowed?'physical':null,physicalAllowed,scopeAllowed,
    precision,floorMeters,reason:scopeAllowed?'scope-at-admitted-floor':physicalAllowed?'physical-near-supported'
      :!legal?'camera-floor-unavailable':!supported?'coarse-scope':'physical-near-unsupported'}
}

export function resolveBillboardDistanceStates({items=[],previous=null,datasetKey=null,selectedKey=null,thresholds={},hysteresisFraction=0.12,cameraHeightMeters,scopePlaques=false}={}) {
  const near=finite(thresholds.nearMeters)&&thresholds.nearMeters>0?thresholds.nearMeters:1200
  const far=finite(thresholds.farMeters)&&thresholds.farMeters>near?thresholds.farMeters:Math.max(12000,near*2)
  const band=clamp(finite(hysteresisFraction)?hysteresisFraction:0.12,0,0.15)
  const sameDataset=previous?.datasetKey===datasetKey
  const counts=new Map()
  for(const item of items)if(typeof item?.key==='string'&&item.key)counts.set(item.key,(counts.get(item.key)??0)+1)
  const pairs=[],detailPairs=[]
  for(const item of [...items].sort((a,b)=>String(a?.key)<String(b?.key)?-1:String(a?.key)>String(b?.key)?1:0)){
    if(counts.get(item?.key)!==1||!finite(item.distanceMeters)||item.distanceMeters<0)continue
    const d=item.distanceMeters
    let state=sameDataset&&!(previous.selectedKey!==selectedKey&&item.key===selectedKey)
      && Object.hasOwn(previous.states??{},item.key)?previous.states[item.key]:null
    if(!statesAllowed.has(state))state=d>far?'icon':d>near?'ribbon':'plaque'
    else if(state==='icon')state=d<near*(1-band)?'plaque':d<far*(1-band)?'ribbon':'icon'
    else if(state==='plaque')state=d>far*(1+band)?'icon':d>near*(1+band)?'ribbon':'plaque'
    else state=d>far*(1+band)?'icon':d<near*(1-band)?'plaque':'ribbon'
    const priorDetail=sameDataset&&Object.hasOwn(previous?.nearDetails??{},item.key)?previous.nearDetails[item.key]:null
    const previousKind=priorDetail?.precision===(item.precision ?? item.precision_class ?? null)?priorDetail?.kind:null
    const detail=worldBillboardNearDetail(item,{nearMeters:near,cameraHeightMeters,scopePlaques,previousKind,hysteresisFraction:band})
    if(detail.scopeAllowed && d<=250000)state='plaque'
    else if(state==='plaque'&&!detail.physicalAllowed)state='ribbon'
    detailPairs.push([item.key,{...detail,kind:state==='plaque'?detail.kind:null}])
    pairs.push([item.key,state])
  }
  const states=Object.fromEntries(pairs)
  const nearDetails=Object.fromEntries(detailPairs)
  return {states,nearDetails,memory:{datasetKey,selectedKey,states,nearDetails,thresholds:{nearMeters:near,farMeters:far},hysteresisFraction:band}}
}

function safeBounds(viewport){
  if(!finite(viewport?.width)||!finite(viewport?.height)||viewport.width<=0||viewport.height<=0)return null
  const landscape=viewport.width>=600&&viewport.width>viewport.height&&viewport.height<480
  const inset=(k,defaultValue,size)=>clamp(finite(viewport.safeInsets?.[k])?viewport.safeInsets[k]:defaultValue,0,size*0.4)
  return {left:inset('left',16,viewport.width),right:viewport.width-inset('right',landscape?40:16,viewport.width),
    top:inset('top',landscape?8:72,viewport.height),bottom:viewport.height-inset('bottom',44,viewport.height)}
}
const fits=(c,b)=>validCard(c)&&c.x>=b.left&&c.y>=b.top&&c.x+c.width<=b.right&&c.y+c.height<=b.bottom
function boundedCard(card,b){
  const width=Math.min(validCard(card)?card.width:360,b.right-b.left)
  const height=Math.min(validCard(card)?card.height:240,(b.bottom-b.top)*0.95)
  return {x:clamp(validCard(card)?card.x:b.right-width,b.left,b.right-width),
    y:clamp(validCard(card)?card.y:b.bottom-height,b.top,b.bottom-height),width,height}
}
function overlapArea(card,obstacle){
  if(!validCard(obstacle))return 0
  return Math.max(0,Math.min(card.x+card.width,obstacle.x+obstacle.width)-Math.max(card.x,obstacle.x))
    *Math.max(0,Math.min(card.y+card.height,obstacle.y+obstacle.height)-Math.max(card.y,obstacle.y))
}
const collisionScore=(card,collisions)=>collisions.reduce((sum,c)=>sum+overlapArea(card,c),0)/(card.width*card.height)
function cameraJump(a,b){
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
  const angle=(x,y)=>Math.abs(((x-y+540)%360)-180)
  if(finite(a.headingDegrees)&&finite(b.headingDegrees)&&angle(a.headingDegrees,b.headingDegrees)>30)return true
  if(finite(a.pitchDegrees)&&finite(b.pitchDegrees)&&Math.abs(a.pitchDegrees-b.pitchDegrees)>25)return true
  if(finite(a.lon)&&finite(b.lon)&&angle(a.lon,b.lon)>5)return true
  if(finite(a.lat)&&finite(b.lat)&&Math.abs(a.lat-b.lat)>5)return true
  if(finite(a.rollDegrees)&&finite(b.rollDegrees)&&angle(a.rollDegrees,b.rollDegrees)>30)return true
  return finite(a.heightMeters)&&finite(b.heightMeters)&&a.heightMeters>0&&b.heightMeters>0
    && Math.abs(Math.log(b.heightMeters/a.heightMeters))>Math.log(1.3)
}
function tether(anchor,card){
  let x2=clamp(anchor.x,card.x,card.x+card.width),y2=clamp(anchor.y,card.y,card.y+card.height)
  if(anchor.x>=card.x&&anchor.x<=card.x+card.width&&anchor.y>=card.y&&anchor.y<=card.y+card.height){
    const nearest=[{d:anchor.x-card.x,x:card.x,y:anchor.y},{d:card.x+card.width-anchor.x,x:card.x+card.width,y:anchor.y},
      {d:anchor.y-card.y,x:anchor.x,y:card.y},{d:card.y+card.height-anchor.y,x:anchor.x,y:card.y+card.height}].sort((a,b)=>a.d-b.d)[0]
    x2=nearest.x;y2=nearest.y
  }
  return {x1:anchor.x,y1:anchor.y,x2,y2}
}

/**
 * Accept layout's selected object directly. Collision rectangles use TOP-LEFT
 * x/y (convert marker centers in caller). Pass returned memory as previous.
 * Same-viewport relocation moves at most24 CSS pixels per update; settling
 * asks the caller for another frame. Resize/orientation rebases to safe pixel
 * geometry rather than animating an old viewport's offscreen coordinates.
 * Only explicit snapRestore may restore a saved card immediately; unsafe
 * restore rectangles are rejected. Occlusion is truth, never permission to
 * move a canonical location or expose an occluded unselected world marker.
 */
export function updateSelectedBillboardEnvelope({selected=null,key=selected?.key,anchor=selected?.anchor,
  canonicalCoordinates=selected?.canonicalCoordinates,canonicalOccluded=selected?.occluded??false,
  viewport,previous=null,previousCard=null,cameraSignature=null,preferredCard=selected?.card,
  collisions=[],maxStep=24,snapRestore=false,restoreCard=null,largeCameraChange=false}={}){
  const bounds=safeBounds(viewport)
  if(!bounds||typeof key!=='string'||!key||!validAnchor(anchor))return {selected:null,memory:null,reason:'unavailable',stable:false,restored:false,settling:false}
  const step=clamp(finite(maxStep)?maxStep:24,1,24)
  const preferred=boundedCard(preferredCard,bounds)
  const sameSelection=previous?.key===key
  const prior=sameSelection?(previous.card??previousCard):null
  const orientationChanged=sameSelection&&previous.viewport
    && (previous.viewport.width!==viewport.width||previous.viewport.height!==viewport.height)
  const usablePrior=sameSelection&&!orientationChanged&&fits(prior,bounds)
  const occlusionChanged=sameSelection&&previous.canonicalOccluded!==(canonicalOccluded===true)
  const largeCamera=largeCameraChange||cameraJump(previous?.cameraSignature,cameraSignature)
  const seriousCollision=usablePrior&&collisionScore(prior,collisions)>=0.2
  const readable=usablePrior&&prior.width>=Math.min(240,bounds.right-bounds.left)
    && prior.height>=Math.min(140,bounds.bottom-bounds.top)
  let reason=!sameSelection?'selection':orientationChanged?'viewport':!usablePrior?'edge':!readable?'readability'
    :seriousCollision?'collision':occlusionChanged?'occlusion':largeCamera?'camera':previous?.settling?'settling':'stable'
  let target=preferred,card,restored=false
  if(snapRestore&&fits(restoreCard,bounds)&&collisionScore(restoreCard,collisions)<0.2){
    card={...restoreCard};reason='restore';restored=true
  }else if(reason==='stable')card={...prior}
  else{
    const candidates=[preferred,
      {...preferred,x:bounds.left,y:bounds.top}, {...preferred,x:bounds.right-preferred.width,y:bounds.top},
      {...preferred,x:bounds.left,y:bounds.bottom-preferred.height}, {...preferred,x:bounds.right-preferred.width,y:bounds.bottom-preferred.height}]
    candidates.sort((a,b)=>collisionScore(a,collisions)-collisionScore(b,collisions)
      ||Math.hypot(a.x-preferred.x,a.y-preferred.y)-Math.hypot(b.x-preferred.x,b.y-preferred.y))
    target=candidates[0]
    if(usablePrior){
      const dx=target.x-prior.x,dy=target.y-prior.y,dw=target.width-prior.width,dh=target.height-prior.height
      const length=Math.max(Math.hypot(dx,dy),Math.abs(dw),Math.abs(dh)),fraction=length>step?step/length:1
      // Linear interpolation of two safe rectangles remains safe, including
      // size changes. Independent post-step clamping would exceed maxStep.
      card={x:prior.x+dx*fraction,y:prior.y+dy*fraction,
        width:prior.width+dw*fraction,height:prior.height+dh*fraction}
    }else card={...target}
  }
  const settling=!restored&&Math.max(Math.hypot(card.x-target.x,card.y-target.y),Math.abs(card.width-target.width),Math.abs(card.height-target.height))>0.01&&reason!=='stable'
  const projectedAnchor={x:anchor.x,y:anchor.y}
  const result={key,anchor:projectedAnchor,card,tether:tether(projectedAnchor,card),occluded:canonicalOccluded===true,canonicalCoordinates,
    ...(selected?.nearDetailKind?{nearDetailKind:selected.nearDetailKind}:{}),
    ...(selected?.precision?{precision:selected.precision}:{}),
    ...(typeof selected?.displayOccluded==='boolean'?{displayOccluded:selected.displayOccluded}:{})}
  return {selected:result,memory:{key,card:{...card},viewport:{width:viewport.width,height:viewport.height},
    cameraSignature:cameraSignature&&typeof cameraSignature==='object'?{...cameraSignature}:cameraSignature,
    canonicalOccluded:canonicalOccluded===true,settling},reason,stable:reason==='stable',restored,settling}
}
