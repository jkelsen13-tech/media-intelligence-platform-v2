// Renderer-neutral DISPLAY layout. Screen anchors are projections of immutable
// world locations; grouping and the selected envelope never rewrite those data.
import { worldBillboardNearDetail } from './worldViewBillboardPresentation.js'
export const BILLBOARD_IMPORTANCE_THRESHOLD = 0.7
export const BILLBOARD_DISPLAY_CAPS = Object.freeze({ plaque:4, ribbon:10, targets:24, broadGroups:8 })
const finite = Number.isFinite
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const compareKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0
const overlaps = (a, b, gap = 6) => a.x - a.width / 2 < b.x + b.width / 2 + gap
  && a.x + a.width / 2 + gap > b.x - b.width / 2
  && a.y - a.height / 2 < b.y + b.height / 2 + gap
  && a.y + a.height / 2 + gap > b.y - b.height / 2
const fitsRect = (marker, rect) => marker.x-marker.width/2 >= rect.left
  && marker.x+marker.width/2 <= rect.right
  && marker.y-marker.height/2 >= rect.top
  && marker.y+marker.height/2 <= rect.bottom

function safeRect(viewport) {
  if (!finite(viewport?.width) || !finite(viewport?.height)
    || viewport.width <= 0 || viewport.height <= 0) return null
  const inset = (name, fallback, dimension) => clamp(
    finite(viewport.safeInsets?.[name]) ? viewport.safeInsets[name] : fallback,
    0, dimension * 0.4)
  const left = inset('left', 16, viewport.width), right = inset('right', 16, viewport.width)
  const top = inset('top', 72, viewport.height), bottom = inset('bottom', 44, viewport.height)
  return {left, top, right:viewport.width-right, bottom:viewport.height-bottom}
}

function selectedEnvelope(item, rect, viewport) {
  if (!item) return null
  const narrowLandscape = viewport.width >= 480 && viewport.width > viewport.height && viewport.height < 480
  // A selected reader may use the free right column above the left gesture
  // controls; reserve the reviewed Page strip and native attribution.
  if (narrowLandscape) rect = {...rect,top:clamp(finite(viewport.safeInsets?.top)?viewport.safeInsets.top:8,0,viewport.height*0.4),right:Math.min(rect.right,viewport.width-40)}
  if (narrowLandscape) {
    const insets=viewport.selectedCardInsets
    if(finite(insets?.left))rect.left=Math.max(rect.left,clamp(insets.left,0,viewport.width))
    if(finite(insets?.right))rect.right=Math.min(rect.right,viewport.width-clamp(insets.right,0,viewport.width))
  }
  const availableWidth = rect.right - rect.left, availableHeight = rect.bottom - rect.top
  if(availableWidth<=0||availableHeight<=0)return null
  const width = Math.min(360, availableWidth), height = Math.min(240, availableHeight * (narrowLandscape ? 1 : 0.75))
  // A viewer-relative comfortable envelope is reserved for one explicit
  // selection. Every other marker remains attached to its projected anchor.
  const card = {x:rect.right-width, y:rect.bottom-height, width, height}
  const anchor = {x:item.anchor.x, y:item.anchor.y}
  let x2 = clamp(anchor.x, card.x, card.x+width), y2 = clamp(anchor.y, card.y, card.y+height)
  if (anchor.x >= card.x && anchor.x <= card.x+width
    && anchor.y >= card.y && anchor.y <= card.y+height) {
    // Keep the tether on a real card edge, including an anchor beneath the
    // selected card. An offscreen anchor stays the original projected pixel.
    const edges = [
      {distance:anchor.x-card.x, x:card.x, y:anchor.y},
      {distance:card.x+width-anchor.x, x:card.x+width, y:anchor.y},
      {distance:anchor.y-card.y, x:anchor.x, y:card.y},
      {distance:card.y+height-anchor.y, x:anchor.x, y:card.y+height},
    ].sort((a,b)=>a.distance-b.distance)
    x2=edges[0].x; y2=edges[0].y
  }
  return {key:item.key, anchor, card,
    tether:{x1:anchor.x,y1:anchor.y,x2,y2},
    occluded:Object.hasOwn(item, 'canonicalOccluded') ? item.canonicalOccluded === true : item.occluded === true,
    canonicalCoordinates:item.canonicalCoordinates,
    ...(item.precision?{precision:item.precision}:{}),
    ...(item.nearDetailKind?{nearDetailKind:item.nearDetailKind}:{}),
    ...(typeof item.displayOccluded==='boolean'?{displayOccluded:item.displayOccluded}:{})}
}

function markerFor(item) {
  const distance = item.distanceMeters
  const supplied = ['icon','ribbon','plaque'].includes(item.presentationState) ? item.presentationState : null
  let state = distance > 250000 ? 'cluster' : supplied ?? (distance <= 1200 ? 'plaque' : distance <= 12000 ? 'ribbon' : 'icon')
  const detail=worldBillboardNearDetail(item,{cameraHeightMeters:item.cameraHeightMeters,scopePlaques:item.scopePlaques===true,
    previousKind:item.nearDetailKind==='scope'?'scope':null})
  if(state==='plaque'&&!detail.physicalAllowed&&!detail.scopeAllowed)state='ribbon'
  const width = state === 'plaque' ? Math.min(200, Math.max(112, String(item.label ?? '').length*7+36))
    : state === 'ribbon' ? Math.min(152, Math.max(72, String(item.label ?? '').length*6+24))
      : state === 'cluster' ? 44 : 24
  const markerAnchor=item.markerAnchor ?? item.anchor
  return {key:item.key, x:markerAnchor.x, y:markerAnchor.y, width,
    height:state === 'plaque' ? 56 : state === 'ribbon' ? 32 : state === 'cluster' ? 44 : 24,
    state, occluded:false, family:item.family, label:item.label,
    canonicalCoordinates:item.canonicalCoordinates,precision:item.precision,
    ...(state==='plaque'?{nearDetailKind:detail.scopeAllowed?'scope':'physical'}:{}),
    ...(state === 'cluster' ? {memberKeys:[item.key],count:1} : {})}
}

const priority = (item, selectedKey) => item.key === selectedKey ? 3 : item.focused === true ? 2
  : item.relevant === true && finite(item.importance) && item.importance >= BILLBOARD_IMPORTANCE_THRESHOLD ? 1 : 0
const nearest = (markers, candidate) => markers.reduce((best, marker) => !best
  || Math.hypot(marker.x-candidate.x,marker.y-candidate.y) < Math.hypot(best.x-candidate.x,best.y-candidate.y) ? marker : best,null)

/**
 * Marker x/y are markerAnchor centers (native display stem projection),
 * falling back to canonical anchor; selected.card x/y are top-left.
 * Safe insets reserve native attribution/credits and top controls. Caller
 * supplies released, family-filtered records; this function adds no evidence.
 * Occluded records do not become visible markers. An explicit selected card
 * still truthfully reports occlusion and keeps a tether to the original pixel.
 */
export function layoutWorldBillboards({items = [], viewport, selectedKey = null} = {}) {
  const rect = safeRect(viewport)
  if (!rect) return {markers:[], selected:null}
  // Duplicate keys are ambiguous identities: omit all copies rather than
  // choosing a row by input order. Distinct identities sharing a pixel group.
  const counts = new Map()
  for (const item of items) if (typeof item?.key === 'string' && item.key) counts.set(item.key,(counts.get(item.key) ?? 0)+1)
  const valid = items.filter(item=>counts.get(item?.key) === 1
    && finite(item.anchor?.x) && finite(item.anchor?.y))
  const selected = selectedEnvelope(valid.find(item=>item.key === selectedKey),rect,viewport)
  const ordered = valid.filter(item=>!item.occluded && finite(item.distanceMeters) && item.distanceMeters >= 0
    && finite((item.markerAnchor ?? item.anchor)?.x) && finite((item.markerAnchor ?? item.anchor)?.y))
    .sort((a,b)=>priority(b,selectedKey)-priority(a,selectedKey)
      || (finite(b.importance)?b.importance:0)-(finite(a.importance)?a.importance:0) || compareKey(a,b))
  const markers = []
  for (const item of ordered) {
    const candidate = markerFor(item)
    // Rich near plaques and medium ribbons have independent display budgets.
    // Overflow becomes a small icon, never a second expanded inspector/card.
    if ((candidate.state === 'plaque' || candidate.state === 'ribbon')
      && markers.filter(marker=>marker.state === candidate.state).length >= BILLBOARD_DISPLAY_CAPS[candidate.state]) {
      candidate.state='icon'; candidate.width=24; candidate.height=24
    }
    if (!fitsRect(candidate,rect)) continue
    // Distant clusters collect nearby records without making world-space
    // proximity or shared coordinates a factual relationship.
    let existing = markers.find(marker=>overlaps(marker,candidate)
      || (marker.state === 'cluster' && candidate.state === 'cluster'
        && Math.hypot(marker.x-candidate.x,marker.y-candidate.y) <= 64))
    // Broad-distance aggregation and a hard target budget avoid a wall of
    // labels. Membership describes this display operation only. The existing
    // selected/focused/relevant-priority world anchor is never averaged/moved.
    if (!existing && candidate.state === 'cluster') {
      const broad = markers.filter(marker=>marker.state === 'cluster')
      if (broad.length >= BILLBOARD_DISPLAY_CAPS.broadGroups) existing=nearest(broad,candidate)
    }
    if (!existing && markers.length >= BILLBOARD_DISPLAY_CAPS.targets) existing=nearest(markers,candidate)
    if (existing) {
      existing.memberKeys = [...(existing.memberKeys ?? [existing.key]),item.key].sort()
      existing.count = existing.memberKeys.length
      existing.state = 'cluster'; existing.width = 44; existing.height = 44
    } else markers.push(candidate)
  }
  // Promoting a 24px icon to a 44px group can create a new collision with
  // an earlier target. Reconcile to a fixed point, always retaining the
  // earlier selection/focus/relevance-priority anchor and every original key.
  let merged = true
  while (merged) {
    merged = false
    for (let i=0;i<markers.length && !merged;i++) for(let j=i+1;j<markers.length;j++) {
      if (!overlaps(markers[i],markers[j])) continue
      const first=markers[i], second=markers[j]
      first.memberKeys=[...(first.memberKeys ?? [first.key]),...(second.memberKeys ?? [second.key])].sort()
      first.count=first.memberKeys.length; first.state='cluster'; first.width=44; first.height=44
      markers.splice(j,1); merged=true; break
    }
  }
  // Admission must use final painted dimensions: either direct promotion or
  // fixed-point merging can enlarge a safe 24px icon into an unsafe 44px group.
  // Omit that display target instead of moving its immutable projected anchor.
  const finalized = markers.filter(marker=>fitsRect(marker,rect))
  // Group targets have DISPLAY identities separate from original row keys.
  // Inspecting a group must never be mistaken for selecting its anchor row.
  // JSON encoding avoids collisions from delimiters within original keys.
  for (const marker of finalized) if (marker.state === 'cluster') {
    marker.anchorKey=marker.key
    marker.key='cluster:'+JSON.stringify(marker.memberKeys)
  }
  // One expanded selection takes visual priority. Hide markers underneath
  // that card rather than detaching them from their world anchors.
  const visible = selected ? finalized.filter(marker=>!overlaps(marker,{
    x:selected.card.x+selected.card.width/2,y:selected.card.y+selected.card.height/2,
    width:selected.card.width,height:selected.card.height},0)) : finalized
  return {markers:visible, selected}
}
