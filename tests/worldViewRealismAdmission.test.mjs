import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateWorldViewRealismAdmission, planWorldViewRealismRequest, resolveWorldViewRealismLayer, admitWorldViewContextModules, WORLD_VIEW_REALISM_RIGHTS } from '../src/lib/worldViewRealismAdmission.js'
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const bounds=[-81.75,41.44,-81.69,41.49]
const source=(overrides={})=>({id:'qualified-cheap',kind:'imagery',contentKind:'cartographic',costTier:'cheap',
 admission:{approved:true,reference:'SYNTHETIC TEST admission receipt'},rights:{reference:'SYNTHETIC TEST rights receipt',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(key=>[key,true]))},
 attribution:[{text:'Synthetic test source attribution'}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'SYNTHETIC TEST bytes receipt',assetCrs:'TEST:asset-crs',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,geometryVerified:true,coverageVerified:true},
 horizontalUnits:'metre',verticalUnits:'US-survey-foot',rendererTransform:{approved:true,reference:'SYNTHETIC transform receipt',fromDatum:'Supplied source datum',fromUnits:'US-survey-foot',toDatum:'WGS84-ellipsoid',toUnits:'metre',method:'Synthetic qualified transformation',ancestry:'Synthetic pinned transformation source'},
 coverage:{crs:'EPSG:4326',bounds:[-82,41,-81,42]},resolutionMeters:0.6,lod:{min:8,max:15},...overrides})
const request=(sources,extra={})=>planWorldViewRealismRequest({kind:'imagery',sources,bounds,level:12,...extra})
const active=(sourceId,extra={})=>({sourceId,status:'active',rendered:true,successes:1,attributionVisible:true,bounds,level:12,ancestry:'direct',...extra})

test('catalogue metadata never substitutes for actual asset bytes, CRS, decoded pixels or geographic coverage qualification',()=>{
 const original=source(),metadataOnly={...original,qualification:{reference:'catalogue only',assetCrs:'EPSG:26917'}}
 assert.equal(evaluateWorldViewRealismAdmission(metadataOnly).approved,false)
 for(const [field,value,reason] of [['bytesVerified',false,'asset-bytes-unverified'],['sha256','metadata-hash','asset-bytes-unverified'],['assetCrsVerified',false,'asset-crs-unverified'],['assetCrs',null,'asset-crs-unverified'],['decodedVerified',false,'asset-decode-unverified'],['pixelsVerified',false,'asset-pixels-unverified'],['coverageVerified',false,'coverage-unqualified']]){
  const result=evaluateWorldViewRealismAdmission({...original,qualification:{...original.qualification,[field]:value}})
  assert.equal(result.approved,false);assert.equal(result.reason,reason)
 }
 const actual=evaluateWorldViewRealismAdmission(source({qualification:{...original.qualification,assetCrs:'EPSG:6346'}}))
 assert.equal(actual.metadata.assetCrs,'EPSG:6346','adapter does not hardcode catalogue CRS as asset truth')
})

test('missing rights, admission, attribution or geometry fails closed including facade/3D Tiles rights',()=>{
 for(const kind of ['imagery','terrain','building','3d-tiles']){
  const base=source({kind,contentKind:kind==='terrain'?'bare-earth-dem':kind==='imagery'?'cartographic':'building-mesh',verticalDatum:'Supplied source datum'})
  assert.equal(evaluateWorldViewRealismAdmission(base).approved,true)
  for(const right of WORLD_VIEW_REALISM_RIGHTS){assert.equal(evaluateWorldViewRealismAdmission({...base,rights:{...base.rights,[right]:false}}).reason,'rights-unqualified')}
  assert.equal(evaluateWorldViewRealismAdmission({...base,admission:{approved:true}}).approved,false)
  assert.equal(evaluateWorldViewRealismAdmission({...base,attribution:[]}).reason,'attribution-missing')
  if(['building','3d-tiles'].includes(kind))assert.equal(evaluateWorldViewRealismAdmission({...base,qualification:{...base.qualification,geometryVerified:false}}).reason,'asset-geometry-unverified')
 }
})

test('terrain has an explicit datum and cannot fabricate building heights; photographic sources need verified real capture scope',()=>{
 assert.equal(evaluateWorldViewRealismAdmission(source({kind:'terrain',contentKind:'bare-earth-dem'})).reason,'vertical-datum-unqualified')
 for(const kind of ['building','3d-tiles'])assert.equal(evaluateWorldViewRealismAdmission(source({kind,heightSource:'bare-earth-dem'})).reason,'dem-is-not-building-height')
 for(const capture of [null,{verified:false,start:'2019-10-12'},{verified:true,start:'today'},{verified:true,start:'2024-02-30'},{verified:true,start:'2019-10-12',end:'2019-10-11'}]){
  assert.equal(evaluateWorldViewRealismAdmission(source({contentKind:'photographic',capture})).reason,'capture-unqualified')
 }
 const admitted=evaluateWorldViewRealismAdmission(source({contentKind:'photographic',capture:{verified:true,start:'2019-10-12',precision:'day'}}))
 assert.deepEqual(admitted.metadata.capture,{start:'2019-10-12',end:null,precision:'day'})
 assert.equal(evaluateWorldViewRealismAdmission(source()).metadata.capture,null,'cartographic unknown capture remains unknown')
})

test('cheap/high transitions require explicit preference, existing authority and activation; failures fall back without retry',()=>{
 const cheap=source(),high=source({id:'qualified-high',costTier:'high',activation:{approved:true,reference:'Synthetic owner activation receipt'}})
 const all=freeze([high,cheap]),before=JSON.stringify(all)
 assert.equal(request(all).request.sourceId,cheap.id)
 assert.equal(request([high],{highCostAccess:{allowed:true}}).request,null,'allowance alone is not a request for paid activation')
 assert.equal(request(all,{preferHigh:true}).reason,'cheap-fallback')
 assert.equal(request(all,{preferHigh:true,highCostAccess:{allowed:true}}).request.sourceId,high.id)
 assert.equal(request([{...high,activation:null},cheap],{preferHigh:true,highCostAccess:{allowed:true}}).request.sourceId,cheap.id)
 const failed=request(all,{preferHigh:true,highCostAccess:{allowed:true},failedSourceIds:[high.id]})
 assert.equal(failed.request.sourceId,cheap.id);assert.ok(failed.rejected.some(entry=>entry.reason==='source-failed'))
 assert.equal(request(all,{failedSourceIds:[cheap.id,high.id]}).request,null)
 assert.equal(JSON.stringify(all),before)
 assert.equal(request([cheap,{...cheap}]).request,null,'ambiguous duplicate source identity cannot admit')
})

test('bounded LOD uses only a supplied loaded real ancestor whose actual parent bounds remain inside approved coverage',()=>{
 const s=source()
 assert.equal(request([s],{level:16}).request,null)
 const ancestor={sourceId:s.id,verified:true,loaded:true,level:15,bounds:[-81.9,41.2,-81.5,41.7]}
 const planned=request([s],{level:18,ancestor})
 assert.equal(planned.request.level,15);assert.equal(planned.request.requestedLevel,18);assert.equal(planned.request.ancestry,'approved-parent')
 for(const changed of [{...ancestor,loaded:false},{...ancestor,sourceId:'other'},{...ancestor,level:7},{...ancestor,bounds:[-83,40,-80,43]},{...ancestor,bounds:[-81.72,41.45,-81.70,41.46]}]){
  assert.equal(request([s],{level:18,ancestor:changed}).request,null)
 }
 assert.equal(request([s],{level:7}).request,null,'ellipsoid root ancestry must not become dataset requests')
 assert.equal(request([s],{bounds:[-83,41,-81,42]}).request,null)
})

test('active reports actual source separately from preference; readiness, loading, success counters and unadmitted bytes alone never suffice',()=>{
 const s=source(),sources=freeze([s]),before=JSON.stringify(sources)
 for(const observation of [{sourceId:s.id,rendererReady:true},active(s.id,{rendered:false}),active(s.id,{attributionVisible:false}),active(s.id,{successes:0}),active(s.id,{status:'loading'}),active(s.id,{bounds:null}),active(s.id,{level:null}),active(s.id,{ancestry:'ellipsoid'})]){
  assert.notEqual(resolveWorldViewRealismLayer({kind:'imagery',sources,observation}).status,'ACTIVE')
 }
 const state=resolveWorldViewRealismLayer({kind:'imagery',sources,observation:active(s.id),requestedSourceId:'other-high'})
 assert.equal(state.status,'ACTIVE');assert.equal(state.activeSource.id,s.id);assert.equal(state.requestedSourceId,'other-high')
 assert.equal(state.capture,null);assert.equal(state.viewportCoverageQualified,false);assert.equal(state.increasesEvidencePrecision,false)
 assert.equal(JSON.stringify(sources),before)
 assert.equal(resolveWorldViewRealismLayer({kind:'imagery',sources:[source({qualification:{reference:'catalogue'}})],observation:active(s.id)}).activeSource,null)
 const parent=resolveWorldViewRealismLayer({kind:'imagery',sources,observation:active(s.id,{ancestry:'approved-parent',level:15})})
 assert.equal(parent.reason,'real-parent-data-rendered');assert.equal(parent.activeSource.level,15)
 assert.equal(resolveWorldViewRealismLayer({kind:'terrain',observation:{rendered:true,fallbackKind:'ellipsoid'}}).status,'FALLBACK')
 assert.equal(resolveWorldViewRealismLayer({kind:'building'}).status,'NOT IMPLEMENTED')
})

test('contextual modules use only admitted supplied facts and retain population geography and period; imagery/evidence dates are not population scope',()=>{
 const population=freeze({id:'place',domain:'population',label:'Supplied population',eligible:true,admission:{approved:true,reference:'Synthetic scope admission'},
  sourceRefs:[{sourceId:'population-register',label:'Synthetic register'}],temporalScope:{asOf:'2020-04-01',period:'2020 census reference',reference:'Synthetic period receipt'},
  spatialScope:{geographyId:'synthetic-city-id',precision:'city'},populationBasis:'Synthetic census count',content:[{label:'Population',value:12345}]})
 const record=freeze({coordinates:[-81.7,41.4],precision:'city',eventTime:'2024-05-03T12:00:00Z',suppliedModules:[population]})
 const before=JSON.stringify(record),context=admitWorldViewContextModules(record,{admittedSourceIds:['population-register']})
 assert.equal(context.length,1);assert.equal(context[0].content,population.content);assert.equal(context[0].temporalScope,population.temporalScope)
 assert.equal(context[0].spatialScope,population.spatialScope);assert.equal(context[0].sourceRefs,population.sourceRefs)
 assert.deepEqual(admitWorldViewContextModules(record),[])
 for(const changed of [{...population,eligible:undefined},{...population,admission:null},{...population,temporalScope:null},{...population,populationBasis:null},{...population,temporalScope:{...population.temporalScope,period:null}},{...population,temporalScope:{reference:'date not real',asOf:'today',period:'current'}},{...population,spatialScope:{precision:'city'}}]){
  assert.deepEqual(admitWorldViewContextModules({...record,suppliedModules:[changed]},{admittedSourceIds:['population-register']}),[])
 }
 assert.deepEqual(admitWorldViewContextModules({...record,suppliedModules:[population,{...population,eligible:false}]},{admittedSourceIds:['population-register']}),[])
 assert.equal(JSON.stringify(record),before)
})

 test('terrain units and datum-to-renderer transformation ancestry must be qualified; model height provenance remains exact',()=>{
 const terrain=source({kind:'terrain',contentKind:'bare-earth-dem',verticalDatum:'Supplied source datum'})
 for(const changed of [{...terrain,verticalUnits:null},{...terrain,horizontalUnits:null},{...terrain,rendererTransform:null},{...terrain,rendererTransform:{...terrain.rendererTransform,fromDatum:'other'}},{...terrain,rendererTransform:{...terrain.rendererTransform,toUnits:'foot'}},{...terrain,rendererTransform:{...terrain.rendererTransform,ancestry:null}}])assert.equal(evaluateWorldViewRealismAdmission(changed).approved,false)
 const admitted=evaluateWorldViewRealismAdmission(terrain);assert.equal(admitted.metadata.verticalUnits,'US-survey-foot');assert.deepEqual(admitted.metadata.rendererTransform,terrain.rendererTransform)
 const building=source({kind:'building',heightSource:'supplied-building-geometry',heightProvenance:{basis:'modelled',unknownSentinel:-1,reference:'Synthetic building model receipt'}})
 assert.deepEqual(evaluateWorldViewRealismAdmission(building).metadata.heightProvenance,building.heightProvenance)
 for(const capture of [{verified:true,start:'2019-10-12',precision:'instant'},{verified:true,start:'2019-10-12',precision:'unknown'},{verified:true,start:'2019-10-12T12:00:00Z',precision:'day'}])assert.equal(evaluateWorldViewRealismAdmission(source({contentKind:'photographic',capture})).approved,false)
 assert.equal(evaluateWorldViewRealismAdmission(source({contentKind:'photographic',capture:{verified:true,start:'2019-10-12T12:00:00-04:00',precision:'instant'}})).metadata.capture.start,'2019-10-12T12:00:00-04:00')
 })
