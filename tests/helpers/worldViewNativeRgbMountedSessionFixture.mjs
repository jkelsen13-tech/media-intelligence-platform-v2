import {createWorldViewRealismSession} from '/workspace/mip-native-imagery-attachment/src/lib/worldViewRealismController.js'
import {WORLD_VIEW_REALISM_RIGHTS} from '/workspace/mip-native-imagery-attachment/src/lib/worldViewRealismAdmission.js'
export const request={kind:'imagery',bounds:[-81.8,41.1,-81.2,41.8],level:10}
export const scope={subjectType:'article',subjectId:'qualification-subject',revision:'qualification-revision',at:'2026-10-02T00:00:00.000000001Z'}
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
export const admittedSource=(id='PRIVATE_OLD_SOURCE_ID')=>({id,kind:'imagery',contentKind:'cartographic',costTier:'cheap',
 admission:{approved:true,reference:'SIMULATED_TEST_AUTHORITY_ONLY'},rights:{reference:'SIMULATED_TEST_AUTHORITY_ONLY',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(k=>[k,true]))},
 attribution:[{text:'Independent simulated source'}],qualification:{bytesVerified:true,sha256:'a'.repeat(64),reference:'SIMULATED_TEST_AUTHORITY_ONLY',assetCrs:'TEST',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},
 coverage:{crs:'EPSG:4326',bounds:[-82,41,-81,42]},resolutionMeters:1,lod:{min:1,max:15}})
// These are provider-neutral lifecycle probes, never bitmap/pixel/native proof.
export function fixture({maxRequests=4,load,attach,enqueue}={}) {
 let clock=0,clockHook=null,access={actorId:'A',sessionReady:true},loadedDisposals=0,renderDisposals=0
 const loads=[],attaches=[],fences=[],publications=[]
 const owner=createWorldViewRealismSession(enqueue?{enqueue}:undefined)
 owner.setCurrentAccessGetter(()=>access)
 const services={sources:[admittedSource()],estimateBytes:()=>100,getRequest:()=>request,budgetOptions:{maxRequests,maxConcurrent:2,maxBytes:1000,idleSuspendMs:10,idleDisposeMs:20,
   now:()=>{const hook=clockHook;clockHook=null;hook?.();return clock}},
  transport:{load:(descriptor,options)=>{loads.push({descriptor,options});return load?load(descriptor,options):Promise.resolve({observedBytes:40,dispose(){loadedDisposals++}})}}}
 owner.configure(services);owner.setAccess(access);owner.setScope(scope)
 const binding={state:()=>({available:true}),fence:()=>fences.push('fence'),attach:(value,descriptor,options)=>{
   attaches.push({value,descriptor,options});return attach?attach(value,descriptor,options):Promise.resolve({dispose(){renderDisposals++}})}}
 const unbind=owner.bindAttachment(binding,value=>publications.push(value));owner.interact()
 return {owner,services,binding,unbind,loads,attaches,fences,publications,
   setAccess(value){access=value;owner.setAccess(value)},setGetterOnly(value){access=value},
   advance(value){clock=value},onNextClock(hook){clockHook=hook},
   loaded(){return {observedBytes:40,dispose(){loadedDisposals++}}},rendered(){return {dispose(){renderDisposals++}}},
   get disposals(){return {loaded:loadedDisposals,render:renderDisposals}}}
}
