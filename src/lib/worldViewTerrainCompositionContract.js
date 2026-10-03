// Detached declaration validator only: no fetch/decode/transform, admission,
// provider hook, rendering, geometry synthesis or canonical-coordinate write.
// Receipt truth and production authority remain the caller's responsibility.
export const WORLD_VIEW_TERRAIN_COMPOSITION_CONTRACT = 'mip-terrain-composition-v2'

const text = value => typeof value === 'string' && value.trim().length > 0
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const integer = value => Number.isSafeInteger(value) && value > 0
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0
const sourceUrl = value => {
  try { return typeof value === 'string' && new URL(value).protocol === 'https:' } catch { return false }
}
const units = ['metre', 'US-survey-foot']
const box = value => Array.isArray(value) && value.length === 4
  && value.every(Number.isFinite) && value[0] < value[2] && value[1] < value[3]
const contains = (outer, inner) => box(outer) && box(inner)
  && inner[0] >= outer[0] && inner[1] >= outer[1]
  && inner[2] <= outer[2] && inner[3] <= outer[3]
const same = (a, b) => {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object'
    || Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]))
}
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value))
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const instant = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
  && day(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
const captureValid = value => value?.status === 'verified' && text(value.reference)
  && value.scope === 'asset-footprint' && ['day', 'instant'].includes(value.precision)
  && (value.precision === 'day' ? day(value.start) : instant(value.start))
  && (value.end == null || (value.precision === 'day' ? day(value.end) : instant(value.end))
    && Date.parse(value.end) >= Date.parse(value.start))
const horizontalBasis = value => ({ crs:value?.crs, datum:value?.datum,
  realization:value?.realization ?? null, epoch:value?.epoch ?? null,
  units:value?.units, axes:value?.axes })
const heightBasis = value => ({ basis:value?.basis, datum:value?.datum, units:value?.units })
const horizontalValid = value => text(value?.crs) && text(value.datum)
  && (value.realization == null || text(value.realization))
  && (value.epoch == null || Number.isFinite(value.epoch))
  && ['projected', 'geographic'].includes(value.kind)
  && (value.kind === 'projected' ? units.includes(value.units)
    && same(value.axes, ['easting', 'northing']) : value.units === 'degree'
      && same(value.axes, ['longitude', 'latitude']))
  && ['asset-header', 'qualified'].includes(value.evidence?.basis) && text(value.evidence?.reference)
const heightValid = value => ['orthometric', 'ellipsoidal'].includes(value?.basis)
  && text(value.datum) && units.includes(value.units)
  && ['catalogue-only', 'qualified'].includes(value.evidence?.basis) && text(value.evidence?.reference)

function operationAndGridsValid(transform, coverage) {
  const operation = transform.operation, accuracy = operation?.accuracy
  if (!text(operation?.id) || !text(operation.reference) || accuracy?.status !== 'qualified'
    || Object.keys(operation).some(key => !['id', 'reference', 'accuracy'].includes(key))
    || accuracy.basis !== 'operation-error' || !Number.isFinite(accuracy.value) || accuracy.value < 0
    || accuracy.units !== 'metre' || !text(accuracy.reference)
    || Object.keys(accuracy).some(key => !['status', 'basis', 'value', 'units', 'reference'].includes(key))) return false
  const grids = transform.gridRequirement
  if (grids?.qualified !== true || !text(grids.reference) || !Array.isArray(grids.inventory)) return false
  if (grids.kind === 'none') return grids.inventory.length === 0
  if (grids.kind !== 'required' || grids.inventory.length === 0) return false
  const ids = new Set()
  return grids.inventory.every(grid => {
    if (!text(grid?.id) || ids.has(grid.id) || !text(grid.version) || !hash(grid.sha256)
      || grid.availability?.status !== 'available' || grid.availability.verified !== true
      || !text(grid.availability.reference) || grid.coverage?.crs !== coverage.crs
      || !contains(grid.coverage.bounds, coverage.bounds)) return false
    ids.add(grid.id)
    return true
  })
}

function transformValid(transform, from, to, coverage) {
  if (transform?.approved !== true || !text(transform.reference)
    || !text(transform.model) || !text(transform.version)
    || !['identity', 'model-operation'].includes(transform.kind)
    // A point offset is never a substitute for a qualified geoid operation.
    || Object.hasOwn(transform, 'constantOffset') || Object.hasOwn(transform, 'constantGeoidOffset')
    || Object.keys(transform).some(key => !['approved', 'reference', 'model', 'version', 'kind',
      'from', 'to', 'coverage', 'operation', 'gridRequirement'].includes(key))
    || !same(transform.from, from) || !same(transform.to, to)
    || transform.coverage?.crs !== coverage.crs
    || !contains(transform.coverage.bounds, coverage.bounds)
    || !operationAndGridsValid(transform, coverage)) return false
  // This describes operation error only. No datum/source measurement accuracy
  // is manufactured from a zero-error, exactly same-basis identity operation.
  return transform.kind !== 'identity' || same(from, to)
    && transform.gridRequirement.kind === 'none' && transform.operation.accuracy.value === 0
}

/**
 * Validate explicit source and composition declarations. Research inspection
 * can retain unknowns and parent-reported custody. Production planning requires
 * exact consumer custody and independently supplied admission/registration/model
 * receipts. SIMULATED authority can qualify only a fixture plan. No returned
 * result is a security boundary, source admission, transform execution or ACTIVE.
 * All bounds are in the declared native source CRS; this helper never reprojects.
 */
export function evaluateWorldViewTerrainComposition({ source, composition } = {}) {
  const inspectionReasons = [], compositionReasons = []
  const invalid = reason => inspectionReasons.push(reason)
  const hold = reason => compositionReasons.push(reason)
  if (!text(source?.id) || source?.contentKind !== 'bare-earth-dem') invalid('bare-earth-source-required')
  if (!text(source?.provenance?.provider) || !sourceUrl(source?.provenance?.sourceUrl)
    || !text(source?.provenance?.sourceVersion) || !text(source?.provenance?.reference)
    || !Array.isArray(source?.provenance?.conflicts)
    || !source.provenance.conflicts.every(text)) invalid('source-provenance-incomplete')
  const bytes = source?.bytes, receipt = bytes?.verification
  if (!hash(bytes?.sha256) || !integer(bytes?.byteLength) || !text(bytes?.retainedReference)
    || !['parent-reported', 'consumer-verified'].includes(receipt?.kind) || !text(receipt?.reference)
    || receipt.sha256 !== bytes.sha256 || receipt.byteLength !== bytes.byteLength) invalid('byte-custody-unbound')
  if (!horizontalValid(source?.horizontal)) invalid('horizontal-crs-or-units-unqualified')
  if (!heightValid(source?.height)) invalid('height-basis-or-units-unqualified')
  const coverage = source?.coverage
  if (!box(coverage?.bounds) || coverage?.crs !== source?.horizontal?.crs) invalid('native-bounds-invalid')
  if (source?.horizontal?.kind === 'geographic' && box(coverage?.bounds)
    && (coverage.bounds[0] < -180 || coverage.bounds[2] > 180
      || coverage.bounds[1] < -90 || coverage.bounds[3] > 90)) invalid('geographic-bounds-invalid')
  const raster = source?.raster
  if (!integer(raster?.width) || !integer(raster?.height) || raster?.bandCount !== 1
    || raster?.sampleType !== 'Float32' || !Array.isArray(raster?.resolution)
    || raster.resolution.length !== 2 || !raster.resolution.every(positive)
    || raster.resolutionUnits !== source?.horizontal?.units) invalid('native-raster-description-invalid')
  if (!['sentinel', 'none'].includes(raster?.nodata?.kind)
    || raster?.nodata?.policy !== 'preserve-as-missing'
    || raster?.nodata?.kind === 'sentinel' && !Number.isFinite(raster.nodata.value)
    || raster?.nodata?.kind === 'none' && raster.nodata.value !== null) invalid('nodata-policy-invalid')
  if (!captureValid(source?.capture) && source?.capture?.status !== 'unknown') invalid('capture-clock-invalid')

  if (receipt?.kind !== 'consumer-verified') hold('consumer-byte-verification-missing')
  if (source?.provenance?.conflicts?.length !== 0) hold('source-lineage-unresolved')
  if (!text(source?.horizontal?.realization) || !Number.isFinite(source?.horizontal?.epoch)) hold('horizontal-realization-or-epoch-unresolved')
  if (source?.height?.evidence?.basis !== 'qualified') hold('vertical-datum-catalogue-only')
  if (source?.height?.basis === 'orthometric' && (!text(source.height.geoid?.model)
    || !text(source.height.geoid?.version) || !text(source.height.geoid?.reference))) hold('source-geoid-unresolved')
  if (!captureValid(source?.capture)) hold('asset-capture-unresolved')
  const admission = source?.admission
  if (admission?.approved !== true || !text(admission.reference) || !text(admission.rightsReference)
    || admission.assetSha256 !== bytes?.sha256 || admission.scope !== 'production-composition'
    || !['REAL', 'SIMULATED'].includes(admission.authorityKind)) hold('composition-admission-unbound')
  const requested = composition?.coverage
  if (requested?.crs !== coverage?.crs || !contains(coverage?.bounds, requested?.bounds)) hold('composition-outside-native-footprint')
  const target = composition?.target
  if (!horizontalValid(target?.horizontal) || !text(target?.horizontal?.realization)
    || !Number.isFinite(target?.horizontal?.epoch) || !heightValid(target?.height)
    || target.height.evidence.basis !== 'qualified' || target.height.basis !== 'ellipsoidal'
    || target.height.datum !== 'WGS84-ellipsoid' || target.height.units !== 'metre') hold('target-reference-unqualified')
  if (!transformValid(composition?.horizontalTransform, horizontalBasis(source?.horizontal),
    horizontalBasis(target?.horizontal), requested ?? {})) hold('horizontal-transform-unqualified')
  if (!transformValid(composition?.verticalTransform, heightBasis(source?.height),
    heightBasis(target?.height), requested ?? {})) hold('vertical-transform-unqualified')
  const registration = composition?.orthoRegistration
  if (registration?.approved !== true || !text(registration.reference) || !hash(registration.orthoAssetSha256)
    || registration.terrainAssetSha256 !== bytes?.sha256 || registration.coverage?.crs !== requested?.crs
    || !contains(registration.coverage?.bounds, requested?.bounds)
    || !same(registration.terrainHorizontal, horizontalBasis(source?.horizontal))
    || !horizontalValid(registration.orthoHorizontal) || !text(registration.orthoHorizontal?.realization)
    || !Number.isFinite(registration.orthoHorizontal?.epoch)) hold('ortho-registration-unqualified')
  if (composition?.anchorPolicy !== 'preserve') hold('canonical-anchor-operation-forbidden')
  if (!composition?.claims || typeof composition.claims !== 'object' || Array.isArray(composition.claims)
    || Object.values(composition.claims).some(value => value !== false)) hold('dem-geometry-or-evidence-precision-claim-forbidden')

  const inspectionAllowed = inspectionReasons.length === 0
  const qualified = inspectionAllowed && compositionReasons.length === 0
  const simulated = admission?.authorityKind === 'SIMULATED'
  return freeze({ contractVersion:WORLD_VIEW_TERRAIN_COMPOSITION_CONTRACT,
    status:!inspectionAllowed ? 'INVALID' : !qualified ? 'HOLD'
      : simulated ? 'SIMULATED_PLAN_QUALIFIED' : 'DECLARED_PLAN_QUALIFIED',
    researchInspection:{allowed:inspectionAllowed, custodyKind:receipt?.kind ?? null,
      reasons:inspectionReasons, pixelsInspectedByThisValidator:false},
    productionComposition:{qualified:qualified && !simulated, simulatedPlanQualified:qualified && simulated,
      authorityKind:admission?.authorityKind ?? null, reasons:[...inspectionReasons, ...compositionReasons]},
    sourceFacts:inspectionAllowed ? copy({id:source.id, bytes, provenance:source.provenance,
      horizontal:source.horizontal, height:source.height, coverage, raster, capture:source.capture}) : null,
    plan:qualified ? copy({sourceId:source.id, sourceSha256:bytes.sha256, coverage:requested,
      target, horizontalTransform:composition.horizontalTransform, verticalTransform:composition.verticalTransform,
      orthoRegistration:registration, admissionReference:admission.reference}) : null,
    displayOnly:true, permissionGrant:false, sourceAdmittedByThisValidator:false,
    providerActivated:false, transformExecuted:false, increasesEvidencePrecision:false,
    modifiesCanonicalAnchors:false, suppliesBuildingHeights:false, suppliesRoofGeometry:false, suppliesFacades:false })
}
