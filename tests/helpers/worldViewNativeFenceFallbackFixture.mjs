import {readFile} from 'node:fs/promises'
import {outerFixture} from './worldViewNativeRgbOuterFixture.mjs'
import {WORLD_VIEW_REALISM_RIGHTS} from '../../src/lib/worldViewRealismAdmission.js'

// Reuse the mounted production disclosure fixture with an isolated bundle and
// input key. The ordinary disclosure suite may compile in another test worker.
const sourceUrl=new URL('./worldViewNativeDisclosureFixture.mjs',import.meta.url)
const shared=await readFile(sourceUrl,'utf8')
const source=shared
  .replaceAll('__MIP_NATIVE_DISCLOSURE_LIFECYCLE__','__MIP_NATIVE_FENCE_ATLAS_FALLBACK__')
  .replace('native-disclosure-node${process.versions.node.split(\'.\')[0]}.mjs',
    'native-fence-atlas-fallback-node${process.versions.node.split(\'.\')[0]}-${process.pid}.mjs')
  .replaceAll('import.meta.url',JSON.stringify(sourceUrl.href))
  .replace(/^import (.+?) from '([^']+)'/gm,(_match,imports,path)=>`import ${imports} from ${JSON.stringify(import.meta.resolve(path))}`)
if(source===shared||!source.includes('native-fence-atlas-fallback-node'))throw Error('Mounted fixture isolation seam changed')
const mounted=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
export const {disclosures,jsonText,click,removeCompiled}=mounted

export async function mountedNativeFenceFallbackFixture(t){
  let clock=0,next=0,reservations=0
  const timers=new Map()
  const retirementScheduler={now:()=>clock,setTimeout:(fn,delay)=>{timers.set(++next,{fn,at:clock+delay});return next},clearTimeout:id=>timers.delete(id)}
  const native=await outerFixture(t,{facade:true,attach:false,deferMount:true})
  const payload=native.transport
  const source={id:payload.packet.sourceId,kind:'imagery',contentKind:'photographic',costTier:'cheap',
    admission:{approved:true,reference:'SIMULATED_TEST_AUTHORITY_ONLY'},
    rights:{reference:'SIMULATED_TEST_AUTHORITY_ONLY',...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(name=>[name,true]))},
    attribution:payload.descriptor.metadata.attribution,
    qualification:{bytesVerified:true,sha256:payload.packet.registeredAssetSha256,reference:'SIMULATED_TEST_AUTHORITY_ONLY',assetCrs:'EPSG:4326',assetCrsVerified:true,decodedVerified:true,pixelsVerified:true,coverageVerified:true},
    coverage:payload.packet.coverage,capture:{verified:true,...payload.packet.capture},resolutionMeters:2,lod:{min:0,max:0}}
  const services={sources:[source],estimateBytes:()=>{reservations++;return 4096},
    budgetOptions:{maxRequests:4,maxBytes:32768,now:()=>0},getRequest:()=>({kind:'imagery',bounds:[0,0,2,2],level:0}),transport:payload.transport}
  const allocated=mounted.deferred()
  const f=await mounted.mountedDisclosureFixture(t,{services,sessionOptions:{retirementScheduler},renderer:options=>({
    // Only unrelated projection markers are omitted. Mounted source ownership,
    // native attach/fence/destroy and the complete facade/outer adapter are real.
    ...native.adapter,options,setFeatures:async()=>{},attachSourceImagery:(...args)=>{
      const attaching=native.adapter.attachSourceImagery(...args);allocated.resolve();return attaching
    },
  })})
  return {...f,native,payload,timers,allocated,
    get reservations(){return reservations},
    advance(ms){clock+=ms;for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn()}},
  }
}
