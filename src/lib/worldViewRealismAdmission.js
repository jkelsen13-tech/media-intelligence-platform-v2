// Detached display admission/planning only. No fetching, activation, credentials,
// billing authority, geometry synthesis or investigation-context writes.
import { WORLD_VIEW_SOURCE_STATUS as STATUS } from './worldViewSourceStatus.js'
import { suppliedWorldBillboardModules } from './worldViewBillboardModules.js'

export const WORLD_VIEW_REALISM_KINDS = Object.freeze(['imagery','terrain','building','3d-tiles'])
export const WORLD_VIEW_REALISM_RIGHTS = Object.freeze(['commercial','publicWeb','cache','redistribution','derivatives','analyticalUse','attribution'])
const text = value => typeof value === 'string' && value.trim() ? value : null
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0
const box = value => Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)
  && value[0] >= -180 && value[2] <= 180 && value[1] >= -90 && value[3] <= 90
  && value[0] < value[2] && value[1] < value[3]
const contained = (inner, outer) => box(inner) && box(outer)
  && inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
const photographic = source => ['photographic','photogrammetric'].includes(source?.contentKind)
const credits = source => Array.isArray(source?.attribution) && source.attribution.length > 0
  && source.attribution.every(credit => text(credit?.text))
const validLod = source => Number.isInteger(source?.lod?.min) && Number.isInteger(source?.lod?.max)
  && source.lod.min >= 0 && source.lod.max >= source.lod.min
const rejected = reason => ({ approved:false, reason, metadata:null })
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(`${value.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10) === value.slice(0,10)
const capture = source => source.capture?.verified === true && date(source.capture?.start)
  && (source.capture.precision === 'day' ? source.capture.start.length === 10 && (source.capture.end == null || source.capture.end.length === 10) : source.capture.precision === 'instant' && source.capture.start.includes('T') && (source.capture.end == null || source.capture.end.includes('T')))
  && (source.capture.end == null || date(source.capture.end) && Date.parse(source.capture.end) >= Date.parse(source.capture.start))
  ? { start:source.capture.start, end:text(source.capture.end), precision:text(source.capture.precision) } : null
const metadata = source => ({
  id:source.id, kind:source.kind, contentKind:source.contentKind, costTier:source.costTier,
  attribution:source.attribution.map(credit=>({text:credit.text,reference:text(credit.reference)})),
  capture:capture(source), assetCrs:source.qualification.assetCrs,
  coverage:{bounds:[...source.coverage.bounds],crs:source.coverage.crs},
  resolutionMeters:positive(source.resolutionMeters)?source.resolutionMeters:null,
  accuracy:source.accuracy == null ? null : {
    horizontalMeters:typeof source.accuracy.horizontalMeters === 'number' && Number.isFinite(source.accuracy.horizontalMeters) && source.accuracy.horizontalMeters >= 0 ? source.accuracy.horizontalMeters : null,
    verticalMeters:typeof source.accuracy.verticalMeters === 'number' && Number.isFinite(source.accuracy.verticalMeters) && source.accuracy.verticalMeters >= 0 ? source.accuracy.verticalMeters : null,
    method:text(source.accuracy.method),
  },
  verticalDatum:text(source.verticalDatum), horizontalUnits:text(source.horizontalUnits), verticalUnits:text(source.verticalUnits),
  rendererTransform:source.rendererTransform ? {...source.rendererTransform} : null,
  heightSource:text(source.heightSource), heightProvenance:source.heightProvenance ? {...source.heightProvenance} : null, lod:{min:source.lod.min,max:source.lod.max},
  qualificationReference:source.qualification.reference, assetSha256:source.qualification.sha256,
  admissionReference:source.admission.reference, rightsReference:source.rights.reference,
  displayOnly:true, increasesEvidencePrecision:false, suppliesBuildingHeights:source.kind === 'building' && source.heightSource === 'supplied-building-geometry',
})

/** Inputs are externally verified receipts, not catalogue promises. This is a
 * pure consumer of that authority, not a browser-side rights/security boundary.
 * Coverage is explicitly qualified geographic bounds, independent of asset CRS.
 */
export function evaluateWorldViewRealismAdmission(source, {kind, bounds, level} = {}) {
  if (!source || !text(source.id) || !WORLD_VIEW_REALISM_KINDS.includes(source.kind)) return rejected('invalid-source')
  if (kind != null && source.kind !== kind) return rejected('wrong-kind')
  if (source.synthetic === true || !text(source.contentKind)) return rejected('not-qualified-realism')
  if (source.admission?.approved !== true || !text(source.admission.reference)) return rejected('source-not-admitted')
  if (!text(source.rights?.reference) || WORLD_VIEW_REALISM_RIGHTS.some(right=>source.rights[right] !== true)) return rejected('rights-unqualified')
  if (!credits(source)) return rejected('attribution-missing')
  const q = source.qualification
  if (q?.bytesVerified !== true || !/^[a-f0-9]{64}$/i.test(q.sha256 ?? '') || !text(q.reference)) return rejected('asset-bytes-unverified')
  if (q.assetCrsVerified !== true || !text(q.assetCrs)) return rejected('asset-crs-unverified')
  if (q.decodedVerified !== true) return rejected('asset-decode-unverified')
  if ((source.kind === 'imagery' || photographic(source)) && q.pixelsVerified !== true) return rejected('asset-pixels-unverified')
  if (['building','3d-tiles'].includes(source.kind) && q.geometryVerified !== true) return rejected('asset-geometry-unverified')
  if (source.coverage?.crs !== 'EPSG:4326' || !box(source.coverage.bounds) || q.coverageVerified !== true) return rejected('coverage-unqualified')
  if (bounds != null && !contained(bounds,source.coverage.bounds)) return rejected('outside-qualified-coverage')
  if (!validLod(source)) return rejected('lod-unqualified')
  if (level != null && (!Number.isInteger(level) || level < source.lod.min || level > source.lod.max)) return rejected('outside-qualified-lod')
  if (!['cheap','high'].includes(source.costTier)) return rejected('cost-tier-unqualified')
  if (['imagery','terrain'].includes(source.kind) && !positive(source.resolutionMeters)) return rejected('resolution-unqualified')
  if (source.kind === 'terrain' && !text(source.verticalDatum)) return rejected('vertical-datum-unqualified')
  if (source.kind === 'terrain' && (!text(source.horizontalUnits) || !text(source.verticalUnits))) return rejected('terrain-units-unqualified')
  if (source.kind === 'terrain' && (source.rendererTransform?.approved !== true || !text(source.rendererTransform.reference)
    || source.rendererTransform.fromDatum !== source.verticalDatum || source.rendererTransform.fromUnits !== source.verticalUnits
    || source.rendererTransform.toDatum !== 'WGS84-ellipsoid' || source.rendererTransform.toUnits !== 'metre'
    || !text(source.rendererTransform.method) || !text(source.rendererTransform.ancestry))) return rejected('terrain-transform-unqualified')
  if (photographic(source) && !capture(source)) return rejected('capture-unqualified')
  if (['building','3d-tiles'].includes(source.kind) && (source.contentKind === 'bare-earth-dem' || source.heightSource === 'bare-earth-dem' || source.derivation?.heightFromBareEarthDem === true)) return rejected('dem-is-not-building-height')
  return {approved:true,reason:'qualified-detached-receipts',metadata:metadata(source)}
}

/** Return a candidate descriptor only; caller owns provider creation and the
 * authoritative access checks. High-cost planning additionally requires an
 * explicit activation receipt. Failed sources are not silently retried.
 * An over-LOD request needs a caller-qualified real ancestor with its own bounds.
 */
export function planWorldViewRealismRequest({kind,sources = [],bounds,level,preferHigh = false,
  highCostAccess = null,failedSourceIds = [],ancestor = null} = {}) {
  if (!WORLD_VIEW_REALISM_KINDS.includes(kind) || !box(bounds) || !Number.isInteger(level) || level < 0)
    return {request:null,reason:'invalid-request',rejected:[]}
  const ids=new Map();for(const source of sources)if(text(source?.id))ids.set(source.id,(ids.get(source.id)??0)+1)
  const rejectedSources=[],allowed=[]
  for(const source of sources){
    if(source?.kind !== kind)continue
    let reason=null,actualBounds=bounds,actualLevel=level,ancestry='direct'
    if(ids.get(source.id)!==1)reason='ambiguous-source-id'
    else if(failedSourceIds.includes(source.id))reason='source-failed'
    else if(validLod(source)&&level>source.lod.max){
      if(ancestor?.sourceId===source.id&&ancestor.verified===true&&ancestor.loaded===true
        &&Number.isInteger(ancestor.level)&&ancestor.level>=source.lod.min&&ancestor.level<=source.lod.max
        &&ancestor.level<level&&box(ancestor.bounds)&&contained(bounds,ancestor.bounds)){
        actualLevel=ancestor.level;actualBounds=ancestor.bounds;ancestry='approved-parent'
      }else reason='real-ancestor-unconfirmed'
    }
    const admission=reason?null:evaluateWorldViewRealismAdmission(source,{kind,bounds:actualBounds,level:actualLevel})
    if(!reason&&!admission.approved)reason=admission.reason
    if(!reason&&source.costTier==='high'){
      if(preferHigh!==true)reason='high-cost-not-requested'
      else if(highCostAccess?.allowed!==true)reason='authoritative-high-cost-access-unavailable'
      else if(source.activation?.approved!==true||!text(source.activation.reference))reason='activation-not-approved'
    }
    if(reason)rejectedSources.push({sourceId:source.id??null,reason})
    else allowed.push({source,metadata:admission.metadata,level:actualLevel,bounds:actualBounds,ancestry})
  }
  allowed.sort((a,b)=>Number(b.source.costTier===(preferHigh?'high':'cheap'))-Number(a.source.costTier===(preferHigh?'high':'cheap'))
    || String(a.source.id).localeCompare(String(b.source.id)))
  const chosen=allowed[0]
  return {request:chosen?{sourceId:chosen.source.id,kind,level:chosen.level,requestedLevel:level,
    bounds:[...chosen.bounds],ancestry:chosen.ancestry,costTier:chosen.source.costTier,metadata:chosen.metadata}:null,
    reason:chosen?chosen.source.costTier==='cheap'&&preferHigh?'cheap-fallback':'qualified-candidate':'no-qualified-candidate',rejected:rejectedSources}
}

/** Report the actual rendered source, not a preference, renderer readiness or
 * planned request. A success does not establish every visible pixel. No event
 * timestamp is substituted for a missing capture date. Parent terrain data is
 * described at its real level; ellipsoid ancestry is not dataset elevation.
 */
export function resolveWorldViewRealismLayer({kind,sources = [],observation = null,requestedSourceId = null} = {}) {
  const base={kind,requestedSourceId,observedSourceId:text(observation?.sourceId),activeSource:null,capture:null,
    viewportCoverageQualified:false,displayOnly:true,increasesEvidencePrecision:false}
  if(!WORLD_VIEW_REALISM_KINDS.includes(kind))return {...base,status:STATUS.UNKNOWN,reason:'invalid-kind'}
  if(observation?.rendered===true&&['ellipsoid','atlas','cartographic'].includes(observation.fallbackKind))
    return {...base,status:STATUS.FALLBACK,reason:'observed-fallback',fallbackKind:observation.fallbackKind}
  const matches=sources.filter(source=>source?.id===observation?.sourceId&&source.kind===kind)
  const source=matches.length===1?matches[0]:null
  if(!source)return {...base,status:['building','3d-tiles'].includes(kind)&&!sources.some(source=>source?.kind===kind)?STATUS.NOT_IMPLEMENTED:STATUS.UNKNOWN,reason:'source-observation-unmatched'}
  const admission=evaluateWorldViewRealismAdmission(source,{kind,bounds:observation.bounds,level:observation.level})
  if(!admission.approved)return {...base,status:STATUS.UNKNOWN,reason:admission.reason}
  const active=observation.status==='active'&&observation.rendered===true&&Number.isInteger(observation.successes)&&observation.successes>0
    &&observation.attributionVisible===true&&box(observation.bounds)&&Number.isInteger(observation.level)
    &&['direct','approved-parent'].includes(observation.ancestry)
  if(!active)return {...base,status:observation.status==='unavailable'?STATUS.UNKNOWN:STATUS.INACTIVE,
    reason:observation.status==='unavailable'?'source-unavailable':'rendered-source-unconfirmed',availability:observation.status??'unknown'}
  return {...base,status:STATUS.ACTIVE,reason:observation.ancestry==='approved-parent'?'real-parent-data-rendered':'qualified-source-rendered',
    activeSource:{...admission.metadata,level:observation.level,ancestry:observation.ancestry},capture:admission.metadata.capture}
}

/** Adapter over the existing module allowlist, preserving exact supplied facts.
 * Only externally admitted source IDs and explicit payload/scope qualify a
 * contextual tab. Population is a scoped place module, not an imagery inference.
 */
export function admitWorldViewContextModules(record,{admittedSourceIds = []} = {}) {
  if(!Array.isArray(record?.suppliedModules))return []
  const admitted=record.suppliedModules.filter(module=>{
    if(module?.eligible!==true||module.admission?.approved!==true||!text(module.admission.reference))return false
    if(!Array.isArray(module.sourceRefs)||!module.sourceRefs.length
      ||module.sourceRefs.some(reference=>!text(reference?.sourceId)||!admittedSourceIds.includes(reference.sourceId)))return false
    if(!['evidence','context','sources'].includes(module.id)){
      if(!text(module.temporalScope?.reference)||!date(module.temporalScope?.asOf)&&!date(module.temporalScope?.start))return false
      if(module.temporalScope.end != null&&(!date(module.temporalScope.end)||!date(module.temporalScope.start)
        ||Date.parse(module.temporalScope.end)<Date.parse(module.temporalScope.start)))return false
      if(!text(module.spatialScope?.geographyId)||!text(module.spatialScope?.precision))return false
    }
    if(module.domain==='population'&&(module.id!=='place'||!text(module.temporalScope?.period)||!text(module.populationBasis)))return false
    return true
  })
  // Duplicate IDs must remain ambiguous even when one duplicate lacks rights.
  const counts=new Map();for(const module of record.suppliedModules)if(text(module?.id))counts.set(module.id,(counts.get(module.id)??0)+1)
  return suppliedWorldBillboardModules(admitted.filter(module=>counts.get(module.id)===1)).map(module=>{
    const qualified=admitted.find(candidate=>candidate.id===module.id)
    return {...module,admissionReference:qualified.admission.reference,sourceRefs:qualified.sourceRefs,
      temporalScope:qualified.temporalScope??null,spatialScope:qualified.spatialScope??null,populationBasis:qualified.populationBasis??null}
  })
}
