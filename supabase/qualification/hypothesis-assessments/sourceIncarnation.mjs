// Configured by the trusted recorder outside source database restores; never discover/pin from a source response.
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const deny=()=>{throw Error('mip_source_registration_required')}
export function createIncarnationBoundTransport({incarnationId,call}={}){
 if(typeof incarnationId!=='string'||!uid.test(incarnationId)||typeof call!=='function')deny()
 const expected=incarnationId
 const fields=(p,keys)=>{
  if(!p||Object.getPrototypeOf(p)!==Object.prototype||Object.keys(p).sort().join('|')!==keys.slice().sort().join('|'))deny()
 }
 return Object.freeze({
  capture:async p=>{
   fields(p,['session','bindingId','before','request'])
   return call('capture_incarnation',[p.session,p.bindingId,expected,p.before,p.request])
  },
  prepare:async p=>{
   fields(p,['session','bindingId','source','stream','request','end','hash','capture','bootstrap','frames'])
   return call('prepare_incarnation',[p.session,p.capture,expected,p.request,p.source,p.stream,p.end,p.bootstrap,p.frames,p.hash])
  },
  advance:async p=>{
   fields(p,['session','request'])
   return call('advance_incarnation',[p.session,p.request,expected])
  }
 })
}
