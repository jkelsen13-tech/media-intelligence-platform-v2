import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateWorldViewTerrainComposition } from '../src/lib/worldViewTerrainCompositionContract.js'

const bounds = [441017.99997115403, 4583350.000010459, 441529.99997115403, 4583862.000010459]
const horizontalBasis = value => ({crs:value.crs, datum:value.datum, realization:value.realization,
  epoch:value.epoch, units:value.units, axes:[...value.axes]})
const heightBasis = value => ({basis:value.basis, datum:value.datum, units:value.units})
const freeze = value => { if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value)}; return value }
const fixture = () => {
  const source = {id:'SIMULATED-terrain', contentKind:'bare-earth-dem',
    provenance:{provider:'SIMULATED provider', sourceUrl:'https://example.invalid/SIMULATED.tif',
      sourceVersion:'SIMULATED-v1', reference:'SIMULATED provenance', conflicts:[]},
    bytes:{sha256:'a'.repeat(64), byteLength:591155, retainedReference:'SIMULATED custody',
      verification:{kind:'consumer-verified', reference:'SIMULATED fixture byte receipt', sha256:'a'.repeat(64), byteLength:591155}},
    horizontal:{kind:'projected', crs:'EPSG:26917', datum:'NAD83', realization:'SIMULATED-qualified-NAD83-realization',
      epoch:2010, units:'metre', axes:['easting','northing'], evidence:{basis:'qualified', reference:'SIMULATED horizontal receipt'}},
    height:{basis:'orthometric', datum:'NAVD88', units:'metre', evidence:{basis:'qualified', reference:'SIMULATED vertical receipt'},
      geoid:{model:'SIMULATED source geoid', version:'v1', reference:'SIMULATED source geoid lineage'}},
    coverage:{crs:'EPSG:26917', bounds:[...bounds]},
    raster:{width:512, height:512, bandCount:1, sampleType:'Float32', resolution:[1,1], resolutionUnits:'metre',
      nodata:{kind:'sentinel', value:-999999, policy:'preserve-as-missing'}},
    capture:{status:'verified', scope:'asset-footprint', precision:'day', start:'2020-01-02', end:null, reference:'SIMULATED exact-footprint capture'},
    admission:{approved:true, scope:'production-composition', authorityKind:'SIMULATED', reference:'SIMULATED admission only',
      rightsReference:'SIMULATED rights receipt', assetSha256:'a'.repeat(64)}}
  const target = {horizontal:{kind:'geographic', crs:'EPSG:4326', datum:'WGS84', realization:'SIMULATED-WGS84-realization',
    epoch:2020, units:'degree', axes:['longitude','latitude'], evidence:{basis:'qualified', reference:'SIMULATED target receipt'}},
    height:{basis:'ellipsoidal', datum:'WGS84-ellipsoid', units:'metre', evidence:{basis:'qualified', reference:'SIMULATED target vertical receipt'}}}
  const coverage = {crs:source.coverage.crs, bounds:[...bounds]}
  const transform = (from, to, model) => ({approved:true, reference:'SIMULATED transform qualification',
    kind:'model-operation', model, version:'SIMULATED-v1', from, to, coverage:structuredClone(coverage)})
  const composition = {coverage, target, anchorPolicy:'preserve',
    claims:{buildingHeights:false, roofGeometry:false, facades:false, evidencePrecisionPromotion:false},
    horizontalTransform:transform(horizontalBasis(source.horizontal), horizontalBasis(target.horizontal), 'SIMULATED horizontal operation'),
    verticalTransform:transform(heightBasis(source.height), heightBasis(target.height), 'SIMULATED geoid operation'),
    orthoRegistration:{approved:true, reference:'SIMULATED co-registration QA', orthoAssetSha256:'b'.repeat(64),
      terrainAssetSha256:source.bytes.sha256, terrainHorizontal:horizontalBasis(source.horizontal),
      orthoHorizontal:structuredClone(target.horizontal), coverage:structuredClone(coverage)}}
  return {source, composition}
}
const resultAfter = change => {const input = fixture(); change(input); return evaluateWorldViewTerrainComposition(input)}
const hasHold = (result, reason) => {assert.equal(result.plan, null); assert.ok(result.productionComposition.reasons.includes(reason), result.productionComposition.reasons.join(', '))}

test('fully pinned fixture qualifies only a SIMULATED detached plan, never real composition or activation', () => {
  const input = freeze(fixture()), before = JSON.stringify(input), result = evaluateWorldViewTerrainComposition(input)
  assert.equal(result.status, 'SIMULATED_PLAN_QUALIFIED')
  assert.equal(result.productionComposition.simulatedPlanQualified, true)
  assert.equal(result.productionComposition.qualified, false)
  assert.equal(result.productionComposition.authorityKind, 'SIMULATED')
  assert.equal(result.researchInspection.allowed, true)
  for (const key of ['permissionGrant','sourceAdmittedByThisValidator','providerActivated','transformExecuted',
    'increasesEvidencePrecision','modifiesCanonicalAnchors','suppliesBuildingHeights','suppliesRoofGeometry','suppliesFacades']) assert.equal(result[key], false)
  assert.equal(result.displayOnly, true)
  assert.equal(result.plan.verticalTransform.model, 'SIMULATED geoid operation')
  assert.equal(JSON.stringify(input), before)
  assert.notEqual(result.sourceFacts.coverage.bounds, input.source.coverage.bounds)
  assert.ok(Object.isFrozen(result.plan.verticalTransform.coverage.bounds))
})

test('current real USGS descriptor permits research inspection but stays HOLD with parent-reported custody and exact unknowns', () => {
  const input = fixture(), source = input.source
  source.id = 'USGS-standard1m-native512-research'; source.bytes.sha256 = 'cd684d9d5311092ef90d4e8c34a1b5de8b842ccf03633b6858424dbf8b652f3a'
  source.bytes.retainedReference = 'Library libfile_3c089027ec9c81918d0bdea00df4880d; worker TIFF bytes unavailable'
  source.bytes.verification = {kind:'parent-reported', reference:'Current complete Library source manifest libfile_a5e615e386fc8191919c274a5429b71f', sha256:source.bytes.sha256, byteLength:591155}
  source.provenance = {provider:'USGS 3DEP', sourceUrl:'https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/OH_Statewide_Phase1_2019_B19/TIFF/USGS_1M_17_x44y459_OH_Statewide_Phase1_2019_B19.tif',
    sourceVersion:'standard1m-research-native512.tif; parent-reported derivative', reference:'Current Library terrain source manifest',
    conflicts:['vendorMetaUrl Phase1_8/Lorain versus Cuyahoga Phase1_1/Block1 lineage unresolved']}
  source.horizontal.realization = null; source.horizontal.epoch = null
  source.horizontal.evidence = {basis:'asset-header', reference:'Parent-reported actual TIFF EPSG:26917 header; generic NAD83 only'}
  source.height.evidence = {basis:'catalogue-only', reference:'Exact standard1m catalog NAVD88/metres, absent acquired vertical GeoKeys'}
  source.height.geoid = null
  source.capture = {status:'unknown', start:null, end:null, precision:null,
    projectWindow:{start:'2019-11-09', end:'2020-05-02', boundToExactAsset:false}, reference:'Prior NOAA Block1 project window, not exact local pixel capture'}
  source.admission = {approved:false, authorityKind:'REAL', reference:'Research only; not admitted'}
  const result = evaluateWorldViewTerrainComposition({source})
  assert.equal(result.status, 'HOLD'); assert.equal(result.researchInspection.allowed, true)
  for (const reason of ['consumer-byte-verification-missing','source-lineage-unresolved','horizontal-realization-or-epoch-unresolved',
    'vertical-datum-catalogue-only','source-geoid-unresolved','asset-capture-unresolved','composition-admission-unbound',
    'horizontal-transform-unqualified','vertical-transform-unqualified','ortho-registration-unqualified']) hasHold(result, reason)
  assert.equal(result.sourceFacts.horizontal.crs, 'EPSG:26917')
  assert.equal(result.sourceFacts.horizontal.realization, null)
  assert.equal(result.sourceFacts.height.basis, 'orthometric')
  assert.deepEqual(result.sourceFacts.coverage.bounds, bounds)
  assert.equal(result.sourceFacts.raster.nodata.value, -999999)
  assert.equal(result.researchInspection.pixelsInspectedByThisValidator, false)
})

test('missing, malformed and mismatched byte receipts cannot substitute metadata for custody or admission', () => {
  for (const change of [input => input.source.bytes.verification = null,
    input => input.source.bytes.sha256 = 'catalog-etag', input => input.source.bytes.byteLength = 0,
    input => input.source.bytes.verification.sha256 = 'b'.repeat(64), input => input.source.bytes.verification.byteLength += 1]) {
    const result = resultAfter(change); assert.equal(result.researchInspection.allowed, false); hasHold(result, 'byte-custody-unbound')
  }
  hasHold(resultAfter(input => input.source.admission.assetSha256 = 'b'.repeat(64)), 'composition-admission-unbound')
  hasHold(resultAfter(input => input.source.bytes.verification.kind = 'parent-reported'), 'consumer-byte-verification-missing')
})

test('native CRS, units, finite bounds, source footprint and raster band semantics fail closed', () => {
  for (const change of [input => input.source.horizontal.units = 'degree', input => input.source.coverage.crs = 'EPSG:6346',
    input => input.source.coverage.bounds[0] = NaN, input => input.source.coverage.bounds[1] = Infinity,
    input => input.source.coverage.bounds[2] = input.source.coverage.bounds[0], input => input.source.raster.resolution[0] = 0,
    input => input.source.raster.resolutionUnits = 'US-survey-foot', input => input.source.raster.bandCount = 4,
    input => input.source.horizontal.axes.reverse(), input => input.source.horizontal.epoch = NaN]) assert.equal(resultAfter(change).researchInspection.allowed, false)
  hasHold(resultAfter(input => input.composition.coverage.bounds[2] += 1), 'composition-outside-native-footprint')
  hasHold(resultAfter(input => input.composition.coverage.crs = 'EPSG:4326'), 'composition-outside-native-footprint')
})

test('nodata remains missing; zero fill, interpolation policy, nonfinite sentinel and ambiguous none are rejected', () => {
  for (const nodata of [{kind:'sentinel', value:-999999, policy:'zero-fill'}, {kind:'sentinel', value:-999999, policy:'interpolate'},
    {kind:'sentinel', value:NaN, policy:'preserve-as-missing'}, {kind:'none', value:0, policy:'preserve-as-missing'}, null]) {
    const result = resultAfter(input => input.source.raster.nodata = nodata)
    assert.equal(result.researchInspection.allowed, false); hasHold(result, 'nodata-policy-invalid')
  }
})

test('no datum/model/units/version or constant-geoid shortcut can stand in for a qualified vertical operation', () => {
  for (const change of [input => input.composition.verticalTransform = null,
    input => input.composition.verticalTransform.from.datum = 'other datum', input => input.composition.verticalTransform.from.units = 'US-survey-foot',
    input => input.composition.verticalTransform.to.units = 'US-survey-foot', input => input.composition.verticalTransform.model = null,
    input => input.composition.verticalTransform.version = null, input => input.composition.verticalTransform.reference = null,
    input => input.composition.verticalTransform.kind = 'identity', input => input.composition.verticalTransform.kind = 'constant-offset',
    input => input.composition.verticalTransform.constantOffset = -34.111, input => input.composition.verticalTransform.constantGeoidOffset = 0,
    input => input.composition.verticalTransform.offsetMeters = -34.111, input => input.composition.verticalTransform.coverage.bounds[0] += 1]) {
    hasHold(resultAfter(change), 'vertical-transform-unqualified')
  }
  hasHold(resultAfter(input => input.source.height.evidence.basis = 'catalogue-only'), 'vertical-datum-catalogue-only')
  hasHold(resultAfter(input => input.composition.target.height.basis = 'orthometric'), 'target-reference-unqualified')
})

test('a horizontal operation must pin the exact generic source realization, epoch, axis order and target units', () => {
  for (const change of [input => input.composition.horizontalTransform.from.crs = 'EPSG:6346',
    input => input.composition.horizontalTransform.from.realization = 'NAD83(2011)', input => input.composition.horizontalTransform.from.epoch = 2020,
    input => input.composition.horizontalTransform.from.axes.reverse(), input => input.composition.horizontalTransform.to.units = 'metre',
    input => input.composition.horizontalTransform.version = null, input => input.composition.horizontalTransform.coverage.crs = 'EPSG:4326']) {
    hasHold(resultAfter(change), 'horizontal-transform-unqualified')
  }
})

test('terrain/ortho registration must bind both exact assets, horizontal bases, QA reference and requested footprint', () => {
  for (const change of [input => input.composition.orthoRegistration = null,
    input => input.composition.orthoRegistration.approved = false, input => input.composition.orthoRegistration.terrainAssetSha256 = 'c'.repeat(64),
    input => input.composition.orthoRegistration.orthoAssetSha256 = 'unknown', input => input.composition.orthoRegistration.reference = '',
    input => input.composition.orthoRegistration.terrainHorizontal.crs = 'EPSG:6346',
    input => input.composition.orthoRegistration.orthoHorizontal = null,
    input => input.composition.orthoRegistration.orthoHorizontal.realization = null,
    input => input.composition.orthoRegistration.orthoHorizontal.epoch = null,
    input => input.composition.orthoRegistration.coverage.bounds[3] -= 1]) {
    hasHold(resultAfter(change), 'ortho-registration-unqualified')
  }
})

test('capture clocks preserve day or recorded-offset precision; project/publication/retrieval clocks cannot replace asset capture', () => {
  for (const capture of [{status:'unknown', projectWindow:{start:'2019-11-09',end:'2020-05-02'}},
    {status:'verified',scope:'project',precision:'day',start:'2020-01-02',reference:'project only'},
    {status:'verified',scope:'asset-footprint',precision:'day',start:'2020-02-30',reference:'invalid day'},
    {status:'verified',scope:'asset-footprint',precision:'instant',start:'2020-01-02T12:00:00',reference:'offset missing'},
    {status:'verified',scope:'asset-footprint',precision:'day',start:'2020-01-02',end:'2020-01-01',reference:'reversed'}]) {
    hasHold(resultAfter(input => input.source.capture = capture), 'asset-capture-unresolved')
  }
  const offset = {status:'verified',scope:'asset-footprint',precision:'instant',start:'2020-01-02T12:34:56-05:00',end:null,reference:'SIMULATED recorded offset'}
  assert.equal(resultAfter(input => input.source.capture = offset).sourceFacts.capture.start, offset.start)
  assert.equal(evaluateWorldViewTerrainComposition(fixture()).sourceFacts.capture.start, '2020-01-02')
})

test('DEM cannot supply roof/facade/building geometry, evidence precision or canonical anchor movements', () => {
  for (const claim of ['buildingHeights','roofGeometry','facades','evidencePrecisionPromotion','eventAltitude']) {
    hasHold(resultAfter(input => input.composition.claims[claim] = true), 'dem-geometry-or-evidence-precision-claim-forbidden')
  }
  hasHold(resultAfter(input => input.composition.claims = []), 'dem-geometry-or-evidence-precision-claim-forbidden')
  for (const policy of ['snap-to-terrain','move-to-building','constant-height-offset',null]) {
    hasHold(resultAfter(input => input.composition.anchorPolicy = policy), 'canonical-anchor-operation-forbidden')
  }
  assert.equal(resultAfter(input => input.source.contentKind = 'building-mesh').researchInspection.allowed, false)
})

test('same-basis identity still needs a pinned model/version/coverage receipt, and object key order is immaterial', () => {
  const input = fixture()
  input.source.height = structuredClone(input.composition.target.height)
  input.composition.verticalTransform.from = heightBasis(input.source.height)
  input.composition.verticalTransform.kind = 'identity'
  input.composition.verticalTransform.model = 'SIMULATED explicit identity operation'
  input.composition.horizontalTransform.from = Object.fromEntries(Object.entries(input.composition.horizontalTransform.from).reverse())
  assert.equal(evaluateWorldViewTerrainComposition(input).status, 'SIMULATED_PLAN_QUALIFIED')
  input.composition.verticalTransform.version = null
  hasHold(evaluateWorldViewTerrainComposition(input), 'vertical-transform-unqualified')
})

test('unknown or absent top-level inputs return truthful INVALID rather than throwing or inheriting authority', () => {
  for (const input of [undefined, {}, {source:null}, {source:{},composition:{}}]) {
    const result = evaluateWorldViewTerrainComposition(input)
    assert.equal(result.status, 'INVALID'); assert.equal(result.plan, null)
    assert.equal(result.productionComposition.qualified, false)
  }
})
