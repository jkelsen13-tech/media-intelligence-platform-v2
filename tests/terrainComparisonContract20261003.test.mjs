import test from 'node:test'
import assert from 'node:assert/strict'
import {coordinateOperationErrors,newComparisonRecord,sha256,validateComparison} from '../scripts/terrain-comparison/contract.mjs'

function localReady() {
  const value=newComparisonRecord()
  value.mode='LOCAL_COORDINATE_RELATIVE_HEIGHT_RESEARCH'
  value.sources.dem.binding.status='BOUND_LOCAL_BYTES'
  value.sources.dem.binding.path='/already-verified/native512.tif'
  const pipeline='+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad +step +proj=utm +zone=17 +ellps=GRS80'
  value.registration.status='RESEARCH_UNQUALIFIED'
  value.registration.operation={pipeline,sha256:sha256(pipeline),axisConvention:'recorded explicit source/target axes; research unqualified',sourceCrs:'EPSG:4326',targetCrs:'EPSG:26917',gridRequirementBasis:'explicit fixture operation has no grid steps',grids:[],networkEnabled:false}
  return value
}

function executed() {
  const value=localReady()
  value.status='EXECUTED'
  value.execution={recordedAt:'2026-10-03T08:00:00Z',harnessSha256:'1'.repeat(64),contractSha256:'2'.repeat(64),sourceVersion:{commit:'3'.repeat(40),tree:'4'.repeat(40),dirty:false},
    variants:['A','B'].map(id=>({id,path:`/retained/${id}.png`,bytes:1024,sha256:'5'.repeat(64),shared:structuredClone(value.shared)})),
    metrics:{effectiveMeshSpacingMetres:[4,4],effectiveOrthoColourCellMetres:[4,4],demValidCount:262144,demMissingCount:0,orthoMissingCount:0,orthoTotalCount:262144,commonWindowPixels:[0,0,512,512],commonValidCount:262144,commonMissingCount:0,commonFootprint:value.shared.footprint}}
  return value
}

test('retained real manifest is valid preparation, unready and never executed',()=>{
  const value=newComparisonRecord(),result=validateComparison(value)
  assert.equal(result.valid,true);assert.equal(result.ready,false)
  assert.equal(value.status,'NOT_EXECUTED');assert.equal(value.sources.dem.binding.path,null)
  assert.equal(value.sources.ortho.receivedNativeDerivative.pixelStepMetres[0],1.220703125*1200/3937)
  assert.ok(result.gates.some(s=>s.includes('dem local bytes unbound')))
  assert.equal(validateComparison(value,{requireReady:true}).valid,false)
})

test('explicit local source-relative research can be ready while registration remains unqualified',()=>{
  const value=localReady(),result=validateComparison(value,{requireReady:true})
  assert.equal(result.valid,true);assert.equal(result.ready,true)
  assert.equal(value.registration.globalRegistrationClaim,false)
  assert.equal(value.height.qualification,'UNRESOLVED')
})

test('arbitrary visual alignment offsets are rejected',()=>{
  const value=localReady();value.registration.arbitraryAlignmentOffsetMetres=[1,0]
  assert.match(validateComparison(value).errors.join(';'),/arbitrary alignment/)
})

test('operation pipeline hash, axes, offline setting and exact input CRS are bound',()=>{
  for(const change of [v=>v.registration.operation.pipeline+=' +step +proj=noop',v=>v.registration.operation.axisConvention='',v=>v.registration.operation.networkEnabled=true,v=>v.registration.operation.sourceCrs='EPSG:3753']){
    const value=localReady();change(value);assert.equal(validateComparison(value,{requireReady:true}).valid,false)
  }
})

test('unavailable grid cannot silently fall back to ballpark transform',()=>{
  const value=localReady();value.registration.operation.grids=[{name:'missing-grid.tif',available:false,sha256:'6'.repeat(64)}]
  assert.equal(validateComparison(value,{requireReady:true}).valid,false)
})

test('literal pipeline cannot conceal nonzero presentation offsets or unqualified affine scale',()=>{
  for(const pipeline of ['+proj=affine +xoff=3','proj=pipeline step proj=affine yoff=-0.01','+proj=affine +zoff=12','+proj=affine +xoff=NaN','+proj=affine +s11=1.01','+proj=affine +xoff=0 +xoff=5']){
    const value=localReady();value.registration.operation.pipeline=pipeline;value.registration.operation.sha256=sha256(pipeline)
    assert.equal(validateComparison(value,{requireReady:true}).valid,false,pipeline)
  }
  assert.deepEqual(coordinateOperationErrors({pipeline:'+proj=affine +xoff=0 +yoff=0 +zoff=0 +s11=1 +s22=1 +s33=1'}),[])
})

test('authoritative datum parameters require reviewed method evidence but are not cosmetic offsets',()=>{
  const pipeline='+proj=pipeline +step +proj=cart +ellps=GRS80 +step +proj=helmert +x=-0.991 +y=1.9072 +z=0.5129 +convention=coordinate_frame +step +inv +proj=cart +ellps=WGS84'
  assert.ok(coordinateOperationErrors({pipeline}).some(s=>s.includes('reviewed authoritative')))
  const reviewedMethod={name:'exact reviewed CRS datum transformation',authority:'authoritative CRS operation reference',evidence:[{reference:'hash-bound official operation record',sha256:'8'.repeat(64)}]}
  assert.deepEqual(coordinateOperationErrors({pipeline,reviewedMethod}),[])
  assert.deepEqual(coordinateOperationErrors({pipeline:'+proj=utm +zone=17 +ellps=GRS80 +x_0=500000 +y_0=0'}),[])
})

test('source hash and native footprint are immutable for this actual DEM candidate',()=>{
  for(const change of [v=>v.sources.dem.binding.sha256='7'.repeat(64),v=>v.sources.dem.binding.bytes=1024,v=>v.sources.dem.footprint[0]+=1,v=>v.shared.requestedNativeFootprint[0]+=1]){
    const value=localReady();change(value);assert.equal(validateComparison(value).valid,false)
  }
})

test('geographic composition cannot borrow detached imagery operation or catalogue-only height basis',()=>{
  const value=localReady();value.mode='GEOGRAPHIC_RESEARCH';value.registration.globalRegistrationClaim=true
  const result=validateComparison(value,{requireReady:true})
  assert.equal(result.valid,false);assert.ok(result.gates.some(s=>s.includes('measured registration')));assert.ok(result.gates.some(s=>s.includes('qualified source height basis')))
})

test('local research and synthetic fixture cannot claim global registration',()=>{
  const value=localReady();value.registration.globalRegistrationClaim=true
  assert.equal(validateComparison(value).valid,false)
  value.evidenceClass='SYNTHETIC_TEST_FIXTURE_ONLY';value.mode='GEOGRAPHIC_RESEARCH'
  assert.equal(validateComparison(value,{requireReady:true}).valid,false)
})

test('no guessed constant geoid correction, vertical exaggeration or ellipsoidal relabeling',()=>{
  for(const change of [v=>v.height.verticalTransform={offset:32},v=>v.height.verticalExaggeration=2,v=>v.height.mode='ELLIPSOIDAL_METRES']){
    const value=localReady();change(value);assert.equal(validateComparison(value).valid,false)
  }
})

test('C remains unavailable without verified geometry and height bodies',()=>{
  const value=localReady();value.buildings.status='EXECUTED';value.buildings.heightAvailable=true
  assert.equal(validateComparison(value).valid,false)
  const fake=executed();fake.execution.variants.push({...fake.execution.variants[0],id:'C'})
  assert.equal(validateComparison(fake).valid,false)
})

test('recorded A/B require identical camera, footprint, lighting and source sampling',()=>{
  assert.equal(validateComparison(executed()).valid,true)
  for(const change of [s=>s.camera.azimuthDegrees+=1,s=>s.light.altitudeDegrees+=1,s=>s.footprint[0]+=1,s=>s.render.meshMaximumEdge=65]){
    const value=executed();change(value.execution.variants[1].shared)
    assert.match(validateComparison(value).errors.join(';'),/must be identical/)
  }
})

test('actual overlap and missingness must be recorded without extrapolation',()=>{
  for(const change of [v=>v.execution.metrics.commonMissingCount=1,v=>v.execution.metrics.orthoMissingCount=null,v=>v.shared.render.nodataPolicy='zero-fill missing pixels',v=>v.execution.metrics.commonFootprint=[0,0,1,1]]){
    const value=executed();change(value);assert.equal(validateComparison(value).valid,false)
  }
})

test('rendered effective resolution cannot claim original 7.6cm imagery or finer than DEM',()=>{
  const value=executed();value.execution.metrics.effectiveOrthoColourCellMetres=[0.0762,0.0762]
  assert.match(validateComparison(value).errors.join(';'),/7.6cm/)
  value.execution.metrics.effectiveMeshSpacingMetres=[0.5,0.5]
  assert.match(validateComparison(value).errors.join(';'),/finer resolution than DEM/)
})

test('residual observations require measured control coordinates, units and uncertainty',()=>{
  const value=localReady();value.observations=[{featureType:'bridge',residual:1.2,units:'metres',controlCoordinates:[441400,4583600],coordinateBasis:'EPSG26917 pixel-centre control',uncertainty:0.5,evidence:['actual control measurement receipt']}]
  assert.equal(validateComparison(value).valid,true)
  value.observations[0].uncertainty=null
  assert.equal(validateComparison(value).valid,false)
})

test('research cannot promote source admission, canonical anchor, precision floor or physical performance',()=>{
  for(const change of [v=>v.invariants.applicationAdmitted=true,v=>v.invariants.canonicalAnchorUnchanged=false,v=>v.invariants.precisionFloorUnchanged=false,v=>v.invariants.noPhysicalPerformanceClaim=false,v=>v.sources.ortho.authority='ADMITTED']){
    const value=localReady();change(value);assert.equal(validateComparison(value).valid,false)
  }
})

test('execution needs actual time and exact harness/artifact hashes; preparation cannot fabricate receipts',()=>{
  const value=executed();value.execution.harnessSha256=null
  assert.equal(validateComparison(value).valid,false)
  const preparation=localReady();preparation.execution.variants=value.execution.variants
  assert.equal(validateComparison(preparation).valid,false)
})
