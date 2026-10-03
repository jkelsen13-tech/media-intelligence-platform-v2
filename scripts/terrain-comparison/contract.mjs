import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'

export const sha256 = value => createHash('sha256').update(value).digest('hex')
export const newComparisonRecord = () => JSON.parse(readFileSync(new URL('../../docs/qualification/terrain-comparison-20261003.template.json', import.meta.url), 'utf8'))
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const finite = value => typeof value === 'number' && Number.isFinite(value)
const text = value => typeof value === 'string' && value.trim().length > 0
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(finite)
const bounds = value => vector(value, 4) && value[0] < value[2] && value[1] < value[3]

export function coordinateOperationErrors(operation) {
  if (!text(operation?.pipeline)) return ['literal PROJ coordinate operation required']
  const errors=[], tokens=operation.pipeline.trim().split(/\s+/).map(s=>s.replace(/^\+/,'').toLowerCase())
  const steps=[{}]
  for(const token of tokens){
    if(token==='step'){steps.push({});continue}
    if(['inv','omit_fwd','omit_inv'].includes(token)){if(Object.hasOwn(steps.at(-1),token))errors.push('duplicate coordinate-operation flag '+token);steps.at(-1)[token]=true;continue}
    const split=token.indexOf('=');if(split<1){errors.push('unsupported coordinate-operation token');continue}
    const key=token.slice(0,split),value=token.slice(split+1)
    if(Object.hasOwn(steps.at(-1),key))errors.push('duplicate coordinate-operation parameter '+key)
    steps.at(-1)[key]=value
    // False eastings (x_0/y_0) and authoritative Helmert x/y/z are separate
    // CRS parameters. xoff/yoff/zoff are presentation translations here.
    if(['xoff','yoff','zoff'].includes(key)&&(!Number.isFinite(Number(value))||Number(value)!==0))errors.push('nonzero pipeline presentation offset forbidden: '+key)
  }
  const authoritative=operation.reviewedMethod
  const reviewed=authoritative&&text(authoritative.name)&&text(authoritative.authority)&&Array.isArray(authoritative.evidence)&&authoritative.evidence.length>0&&authoritative.evidence.every(e=>text(e.reference)&&hash(e.sha256))
  for(const step of steps){
    if(!step.proj)errors.push('each coordinate-operation step requires explicit proj')
    if(step.proj==='affine'){
      const matrix=Object.entries(step).filter(([key])=>/^s[123][123]$/.test(key))
      if(matrix.some(([key,value])=>!Number.isFinite(Number(value))||Number(value)!==(key[1]===key[2]?1:0))&&!reviewed)errors.push('nonidentity affine step requires reviewed authoritative CRS method/evidence')
      if(Object.keys(step).some(key=>!['proj','xoff','yoff','zoff','inv','omit_fwd','omit_inv'].includes(key)&&!/^s[123][123]$/.test(key)))errors.push('unsupported affine parameter; no hidden presentation offset')
    }
    if(['helmert','hgridshift','vgridshift','xyzgridshift','deformation'].includes(step.proj)&&!reviewed)errors.push('datum/grid step requires exact reviewed authoritative method/evidence')
  }
  return errors
}

// Research records can be valid while explicitly unready. Execution is a separate
// gate, so an unbound manifest never becomes a completed comparison by omission.
export function validateComparison(record, {requireReady = false} = {}) {
  const errors = [], gates = []
  const fail = message => errors.push(message)
  const gate = message => gates.push(message)
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {valid:false, ready:false, errors:['record must be an object'], gates:[]}
  if (record.schema !== 'mip.terrain-comparison.v1') fail('unsupported schema')
  if (!['ACTUAL_SOURCE_RESEARCH','SYNTHETIC_TEST_FIXTURE_ONLY'].includes(record.evidenceClass)) fail('explicit evidence class required')
  if (!['UNBOUND','LOCAL_COORDINATE_RELATIVE_HEIGHT_RESEARCH','GEOGRAPHIC_RESEARCH'].includes(record.mode)) fail('unsupported comparison mode')
  if (!['NOT_EXECUTED','EXECUTED'].includes(record.status)) fail('execution status required')
  const inv = record.invariants ?? {}
  for (const name of ['canonicalAnchorUnchanged','precisionFloorUnchanged','noRoofHeightInference','noPhysicalPerformanceClaim']) if (inv[name] !== true) fail(name+' must remain true')
  for (const name of ['applicationAdmitted','providerActivated','deployed']) if (inv[name] !== false) fail(name+' must remain false in this research harness')
  const buildings = record.buildings ?? {}
  if (buildings.status !== 'UNAVAILABLE' || buildings.geometryAvailable !== false || buildings.heightAvailable !== false || !text(buildings.reason)) fail('C requires explicit unavailable geometry/heights; provenance is not render input')
  const dem = record.sources?.dem, ortho = record.sources?.ortho
  for (const [name, source] of Object.entries({dem,ortho})) {
    if (!source || typeof source !== 'object') {fail(name+' source required'); continue}
    const binding = source.binding ?? {}
    if (!['UNBOUND','BOUND_LOCAL_BYTES'].includes(binding.status)) fail(name+' binding status required')
    if (binding.sha256 !== null && !hash(binding.sha256)) fail(name+' invalid SHA256')
    if (binding.bytes !== null && (!Number.isInteger(binding.bytes) || binding.bytes <= 0)) fail(name+' invalid byte length')
    if (binding.status === 'BOUND_LOCAL_BYTES' && (!text(binding.path) || !hash(binding.sha256) || !Number.isInteger(binding.bytes))) fail(name+' bound source needs path, hash and bytes')
    if (binding.status !== 'BOUND_LOCAL_BYTES') gate(name+' local bytes unbound')
    if (!bounds(source.footprint) || !vector(source.size,2) || source.size.some(n=>!Number.isInteger(n)||n<2)) fail(name+' source footprint and dimensions required')
    if (!text(source.horizontalCrs) || !text(source.horizontalUnits) || !text(source.pixelOrigin)) fail(name+' CRS, units and pixel origin required')
    if (!source.capture || !text(source.capture.basis)) fail(name+' capture provenance required even when exact day unknown')
    if (!['UNAPPROVED_SOURCE_RESEARCH','SYNTHETIC_TEST_FIXTURE_ONLY'].includes(source.authority)) fail(name+' cannot infer source admission')
    if (record.evidenceClass === 'ACTUAL_SOURCE_RESEARCH' && (source.authority !== 'UNAPPROVED_SOURCE_RESEARCH' || String(source.id).startsWith('SYNTHETIC'))) fail('synthetic source cannot be promoted to actual evidence')
    if (record.evidenceClass === 'SYNTHETIC_TEST_FIXTURE_ONLY' && source.authority !== 'SYNTHETIC_TEST_FIXTURE_ONLY') fail('fixture must mark every source synthetic')
  }
  if (dem) {
    if (!vector(dem.geotransform,6) || dem.geotransform[2] !== 0 || dem.geotransform[4] !== 0 || dem.geotransform[1] <= 0 || dem.geotransform[5] >= 0 || dem.horizontalUnits !== 'metres') fail('renderer supports north-up metre DEM only')
    if (dem.geotransform && dem.size && !equal(dem.footprint,[dem.geotransform[0],dem.geotransform[3]+dem.geotransform[5]*dem.size[1],dem.geotransform[0]+dem.geotransform[1]*dem.size[0],dem.geotransform[3]])) fail('DEM affine corners must exactly describe source footprint')
    if (dem.samples?.type !== 'Float32' || !hash(dem.samples?.rowMajorLittleEndianSha256)) fail('DEM requires canonical Float32 pixel hash')
    if (record.evidenceClass === 'ACTUAL_SOURCE_RESEARCH' && (dem.binding?.sha256 !== 'cd684d9d5311092ef90d4e8c34a1b5de8b842ccf03633b6858424dbf8b652f3a' || dem.binding?.bytes !== 591155 || dem.horizontalCrs!=='EPSG:26917' || !equal(dem.size,[512,512]) || !equal(dem.geotransform,[441017.99997115403,1,0,4583862.000010459,0,-1]) || dem.samples?.nodata!==-999999 || dem.samples?.rowMajorLittleEndianSha256!=='4fe0e9051b735037549842cbf1e5540d62d96949550855c827932157711a59f0')) fail('actual DEM must bind exact qualified native512 artifact, grid and pixel values')
  }
  const registration = record.registration ?? {}, op = registration.operation
  if (dem && ortho && (registration.sourceCrs!==ortho.horizontalCrs || registration.targetCrs!==dem.horizontalCrs)) fail('registration source/target CRS must match exact inputs')
  if (!equal(registration.arbitraryAlignmentOffsetMetres,[0,0])) fail('arbitrary alignment offsets forbidden')
  if (!['UNRESOLVED','RESEARCH_UNQUALIFIED','QUALIFIED'].includes(registration.status)) fail('registration status required')
  if (op !== null && (!text(op?.pipeline) || !hash(op?.sha256) || op.sha256 !== sha256(op.pipeline) || !text(op?.axisConvention) || !text(op?.gridRequirementBasis) || op?.sourceCrs!==registration.sourceCrs || op?.targetCrs!==registration.targetCrs)) fail('coordinate operation needs exact pipeline hash, input CRSs, grid basis and axis convention')
  if(op)errors.push(...coordinateOperationErrors(op))
  if (!op) gate('explicit ortho-to-DEM operation unbound; no implicit best/ballpark selection')
  if (op && (!Array.isArray(op.grids) || op.grids.some(g=>!text(g.name)||g.available!==true||!hash(g.sha256)||!text(g.path)||!Number.isInteger(g.bytes)||g.bytes<=0))) gate('every required operation grid must be locally available with path, bytes and hash')
  if (op && op.networkEnabled !== false) fail('coordinate operation must be offline')
  for (const name of ['reportedAccuracyMetres','measuredResidualRmseMetres']) if (registration[name] !== null && (!finite(registration[name]) || registration[name] < 0)) fail(name+' must be null or measured nonnegative metres')
  const height = record.height ?? {}
  if (height.mode !== 'SOURCE_RELATIVE_METRES' || height.originRule !== 'minimum finite non-nodata DEM value' || height.verticalExaggeration !== 1 || height.verticalTransform !== null) fail('render height must preserve source-relative metres with no guessed geoid offset')
  if (!text(height.sourceBasis) || !['UNRESOLVED','QUALIFIED'].includes(height.qualification)) fail('source height basis/qualification required')
  if (record.mode === 'UNBOUND') gate('comparison mode unbound')
  if (record.mode === 'LOCAL_COORDINATE_RELATIVE_HEIGHT_RESEARCH' && registration.globalRegistrationClaim !== false) fail('local research cannot claim global registration')
  if (record.mode === 'GEOGRAPHIC_RESEARCH') {
    if (record.evidenceClass !== 'ACTUAL_SOURCE_RESEARCH') fail('synthetic fixture cannot qualify geographic composition')
    if (registration.status !== 'QUALIFIED' || registration.globalRegistrationClaim !== true || !finite(registration.measuredResidualRmseMetres) || !(registration.evidence?.length) || !text(registration.exactSourceHorizontalBasis) || !text(registration.exactTargetHorizontalBasis)) gate('geographic composition requires measured registration, exact horizontal bases and evidence')
    if (height.qualification !== 'QUALIFIED' || !text(height.exactGeoidOrHeightBasis) || !(height.evidence?.length)) gate('geographic composition requires exact qualified source height basis')
  }
  const shared = record.shared ?? {}, camera = shared.camera ?? {}, light = shared.light ?? {}, render = shared.render ?? {}
  if (!bounds(shared.footprint) || (dem && (!equal(shared.requestedNativeFootprint,dem.footprint) || shared.footprint[0]<dem.footprint[0] || shared.footprint[1]<dem.footprint[1] || shared.footprint[2]>dem.footprint[2] || shared.footprint[3]>dem.footprint[3]))) fail('shared footprint must remain inside immutable requested DEM bounds')
  if (![camera.azimuthDegrees,camera.elevationDegrees].every(finite) || camera.projection !== 'orthographic' || !vector(camera.boxAspect,3) || camera.boxAspect.some(n=>n<=0)) fail('explicit scientific camera required')
  if (![light.azimuthDegrees,light.altitudeDegrees].every(finite)) fail('identical explicit light required')
  if (!vector(render.canvasPixels,2) || render.canvasPixels.some(n=>!Number.isInteger(n)||n<100||n>4096) || !Number.isInteger(render.meshMaximumEdge) || render.meshMaximumEdge<3 || render.meshMaximumEdge>513 || !finite(render.dpi) || render.dpi<=0) fail('bounded render dimensions/mesh/dpi required')
  if (render.textureSampling !== 'face mean of bilinear-warped RGB' || render.nodataPolicy !== 'crop largest fully valid common rectangle; never fill/extrapolate') fail('explicit resampling and missingness policy required')
  for (const observation of record.observations ?? []) {
    if (!['bank','road','grade','bridge'].includes(observation.featureType)) fail('unknown alignment observation type')
    if (observation.residual !== null && (!finite(observation.residual) || !text(observation.units) || !vector(observation.controlCoordinates,2) || !text(observation.coordinateBasis) || !finite(observation.uncertainty) || observation.uncertainty<0 || !(observation.evidence?.length))) fail('residual needs control coordinates, units, uncertainty and evidence')
  }
  const execution = record.execution ?? {}
  if (record.status === 'NOT_EXECUTED' && (execution.variants?.length || execution.recordedAt !== null)) fail('not-executed record cannot contain completed variants/time')
  if (record.status === 'EXECUTED') {
    if (!text(execution.recordedAt) || !hash(execution.harnessSha256) || !hash(execution.contractSha256)) fail('execution requires time and exact source hashes')
    if (!Array.isArray(execution.variants) || execution.variants.length !== 2 || !equal(execution.variants.map(v=>v.id),['A','B'])) fail('execution requires exactly A and B, never fabricated C')
    for (const v of execution.variants ?? []) {
      if (!equal(v.shared,shared)) fail('A/B footprint, camera, light and render settings must be identical')
      if (!hash(v.sha256) || !Number.isInteger(v.bytes) || v.bytes<=0 || !text(v.path)) fail('output PNG exact byte/hash evidence required')
    }
    const metrics = execution.metrics ?? {}
    for (const name of ['effectiveMeshSpacingMetres','effectiveOrthoColourCellMetres']) if (!vector(metrics[name],2) || metrics[name].some(n=>n<=0)) fail('actual effective rendered resolution required')
    if (dem && metrics.effectiveMeshSpacingMetres?.some((n,i)=>n<Math.abs(dem.geotransform[i===0?1:5]))) fail('mesh cannot claim finer resolution than DEM pixels')
    if (!Number.isInteger(metrics.demValidCount) || !Number.isInteger(metrics.demMissingCount) || !Number.isInteger(metrics.orthoMissingCount) || !Number.isInteger(metrics.orthoTotalCount) || metrics.demValidCount<=0 || metrics.demMissingCount<0 || metrics.orthoMissingCount<0 || metrics.orthoMissingCount>metrics.orthoTotalCount) fail('actual missingness counts required')
    if (!vector(metrics.commonWindowPixels,4) || metrics.commonWindowPixels.some(n=>!Number.isInteger(n)) || !Number.isInteger(metrics.commonValidCount) || metrics.commonValidCount<9 || metrics.commonMissingCount!==0 || !equal(metrics.commonFootprint,shared.footprint)) fail('actual fully valid overlap window/footprint required; no extrapolation')
    else if (dem) {
      const [x,y,w,h]=metrics.commonWindowPixels,gt=dem.geotransform
      if(x<0||y<0||w<3||h<3||x+w>dem.size[0]||y+h>dem.size[1]||metrics.commonValidCount!==w*h||metrics.commonValidCount>metrics.demValidCount||metrics.commonValidCount>metrics.orthoTotalCount-metrics.orthoMissingCount||!equal(metrics.commonFootprint,[gt[0]+x*gt[1],gt[3]+(y+h)*gt[5],gt[0]+(x+w)*gt[1],gt[3]+y*gt[5]])) fail('common overlap counts/window must match exact source-grid footprint')
      if(!equal(camera.boxAspect,[w*gt[1],h*Math.abs(gt[5]),Math.max(w*gt[1],h*Math.abs(gt[5]))]))fail('camera box aspect must retain equal metre scaling without vertical exaggeration')
    }
    if (record.evidenceClass === 'ACTUAL_SOURCE_RESEARCH' && metrics.effectiveOrthoColourCellMetres?.some(n=>n<0.3)) fail('received coarser derivative cannot claim original 7.6cm rendered detail')
  }
  if ((requireReady || record.status === 'EXECUTED') && gates.length) errors.push(...gates)
  return {valid:errors.length===0,ready:errors.length===0&&gates.length===0,errors,gates}
}
