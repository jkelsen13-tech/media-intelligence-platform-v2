// Display metadata only. This resolver consumes detached runtime observations;
// it does not probe renderers, fetch sources, admit assets or alter evidence.
export const WORLD_VIEW_SOURCE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'AVAILABLE BUT INACTIVE',
  PREFERENCE: 'PREFERENCE ONLY',
  FALLBACK: 'FALLBACK',
  SOURCE_DEPENDENT: 'SOURCE-DEPENDENT',
  NOT_IMPLEMENTED: 'NOT IMPLEMENTED',
  UNKNOWN: 'UNKNOWN',
})

const S = WORLD_VIEW_SOURCE_STATUS
const STACKS = Object.freeze({
  'ellipsoid-globe': { renderer: 'Globe', imagery: 'OpenStreetMap cartography', source: 'OpenStreetMap', kind: 'cartographic-raster' },
  'openfreemap-positron': { renderer: 'Map', imagery: 'OpenFreeMap Positron cartography', source: 'OpenFreeMap / OpenStreetMap', kind: 'cartographic-vector' },
  osm: { renderer: 'Map', imagery: 'OpenStreetMap cartography', source: 'OpenStreetMap', kind: 'cartographic-raster' },
  'atlas-fallback': { renderer: 'Overview', imagery: 'Natural Earth overview', source: 'Natural Earth via world-atlas 110m', kind: 'overview' },
})

const TERRAIN_SOURCE = 'USGS 3DEP/SRTM/GMTED2010, NOAA ETOPO1, NRCan CDEM via Mapzen/AWS Terrain Tiles'

function sourceMetadata(status, label, detail, source, extra = {}) {
  return Object.freeze({ status, label, detail, source, captureDate: null, ...extra })
}

/**
 * rendererReady means a renderer is ready, not that its imagery succeeded.
 * imageryStatus is optional, explicit runtime evidence with status
 * active/loading/unavailable/unknown. No tile success is inferred from readiness.
 * Terrain's existing provider emits {status, fetchSuccesses, ...counters}; only
 * active plus at least one success establishes that bounded elevation loaded.
 * Even that does not establish elevation coverage at every visible pixel.
 */
export function resolveWorldViewSourceStatus({ stackId, rendererReady = false, terrainStatus = null,
  requestedProfile = null, imageryStatus = null } = {}) {
  const stack = Object.hasOwn(STACKS, stackId) ? STACKS[stackId] : null
  const ready = rendererReady === true && Boolean(stack)
  const globe = stackId === 'ellipsoid-globe'
  const overview = stackId === 'atlas-fallback'
  const renderer = Object.freeze({
    id: stackId ?? null,
    label: stack?.renderer ?? 'Renderer unknown',
    status: ready ? (globe ? S.ACTIVE : S.FALLBACK) : S.UNKNOWN,
    detail: !stack ? 'No recognized renderer snapshot.' : !ready ? 'Renderer readiness not confirmed.'
      : globe ? 'Globe renderer ready; source loading is reported separately.'
        : 'Fallback renderer selected; the reason for the transition is not established by this snapshot.',
  })
  const requested = Object.freeze({
    enabled: typeof requestedProfile?.enabled === 'boolean' ? requestedProfile.enabled : null,
    preset: typeof requestedProfile?.preset === 'string' ? requestedProfile.preset : null,
    status: requestedProfile && typeof requestedProfile.enabled === 'boolean' ? S.PREFERENCE : S.UNKNOWN,
    label: requestedProfile?.enabled === true ? 'Visual fidelity requested' : requestedProfile?.enabled === false
      ? 'Visual fidelity off' : 'Visual fidelity preference unknown',
    detail: 'The Photoreal control is a display preference. It does not select photographic imagery or photogrammetric buildings.',
  })

  const observedImagery = ready && imageryStatus?.status === 'active'
  const imagery = sourceMetadata(ready && overview ? S.FALLBACK : observedImagery ? S.ACTIVE : S.UNKNOWN,
    stack?.imagery ?? 'Imagery source unknown',
    !stack ? 'No recognized source configuration.' : ready && overview
      ? 'Static overview geography; no photographic texture or detailed terrain.'
      : !ready ? 'Configured source; renderer readiness and imagery loading are not confirmed.'
      : observedImagery ? 'At least one cartographic baseline image reported loaded; viewport coverage is not established; no photographic layer is inferred from this baseline observation.'
      : imageryStatus?.status === 'unavailable' ? 'Configured cartographic source unavailable; active imagery is not confirmed.'
      : imageryStatus?.status === 'loading' ? 'Configured cartographic source loading; active imagery is not confirmed.'
      : 'Cartographic source configured; imagery loading has not been observed.',
    stack?.source ?? null, { kind: stack?.kind ?? 'unknown',
      availability: observedImagery ? 'active' : ready && overview ? 'active'
        : ['loading', 'unavailable'].includes(imageryStatus?.status) ? imageryStatus.status : 'unknown',
      photographicStatus: S.SOURCE_DEPENDENT })

  let elevation
  if (!ready) {
    elevation = sourceMetadata(S.UNKNOWN, 'Elevation unconfirmed', 'Renderer readiness not confirmed.', globe ? TERRAIN_SOURCE : null)
  } else if (!globe) {
    elevation = sourceMetadata(S.INACTIVE, 'No elevation layer on this view',
      'Approved Ohio terrain is available only on the globe; this fallback does not render it.', null)
  } else if (terrainStatus?.status === 'unavailable') {
    elevation = sourceMetadata(S.FALLBACK, 'Reference ellipsoid',
      'Terrain reported unavailable; reference ellipsoid displayed. Failure cause is not established by this snapshot.', null)
  } else if (terrainStatus?.status === 'active' && Number.isInteger(terrainStatus.fetchSuccesses) && terrainStatus.fetchSuccesses > 0) {
    elevation = sourceMetadata(S.ACTIVE, 'Approved Ohio elevation loaded',
      'At least one approved elevation tile loaded. Bounded Ohio coverage, levels 8–15; source-datum, display-only. Outside coverage or for absent tiles, real parent data or the reference ellipsoid is used. This is not a per-pixel coverage claim.', TERRAIN_SOURCE)
  } else if (!terrainStatus || terrainStatus.status === 'idle') {
    elevation = sourceMetadata(S.INACTIVE, 'Approved Ohio elevation not yet confirmed',
      'No approved elevation tile success reported. In-memory ellipsoid ancestry is not source terrain. Coverage and detail remain bounded.', TERRAIN_SOURCE)
  } else {
    elevation = sourceMetadata(S.UNKNOWN, 'Elevation status unknown',
      'Snapshot does not establish an approved terrain tile success or an unavailable fallback.', TERRAIN_SOURCE)
  }
  return Object.freeze({ renderer, requested, imagery, elevation,
    buildings: sourceMetadata(S.NOT_IMPLEMENTED, 'No 3D building source',
      'No building mesh, photogrammetric facades or extrusion layer is implemented in these renderers. Additional detail requires an admitted source.', null),
    sourceCapture: Object.freeze({ status: S.UNKNOWN, label: 'Baseline capture dates unknown',
      detail: 'Cartographic baseline and elevation capture dates are not established. Background content is not matched to investigation or evidence time.' }),
    background: Object.freeze({ label: 'Background context, not evidence',
      detail: 'Background detail does not change canonical coordinates, object/version, recorded time or evidence precision.' }),
  })
}

export function resolveWorldViewQualifiedOverlayStatus({layer,nativeState}={}) {
  const source=layer?.activeSource
  const active=layer?.status===S.ACTIVE&&source&&nativeState?.status==='active'&&nativeState.nativeFrameObserved===true
    &&nativeState.visibilityFenced!==true&&nativeState.sourceId===source.id&&nativeState.assetSha256===source.assetSha256
    &&nativeState.ownedPhotoLayerCount>0&&nativeState.ownedPhotoLayerCount<=4&&nativeState.creditsVisible===true
  if(!active)return Object.freeze({status:S.UNKNOWN,label:'Photographic overlay unconfirmed',detail:'No current photographic payload is confirmed in this native frame.',capture:null,attribution:[],coverage:null})
  return Object.freeze({status:S.ACTIVE,label:'Rendered photographic overlay',contentKind:source.contentKind,
    detail:'Bounded reduced RGB footprint; the cartographic baseline remains outside it. Display background only; no evidence precision, terrain, height or facade is supplied.',
    capture:source.capture,attribution:source.attribution,coverage:{crs:source.coverage.crs,bounds:[...nativeState.bounds],reduced:true,fullViewportCoverage:false},
    resolutionMeters:source.resolutionMeters,sourceId:source.id,assetSha256:source.assetSha256})
}
