import { planWorldViewRealismRequest, resolveWorldViewRealismLayer } from './worldViewRealismAdmission.js'

// Provider-neutral display lifecycle. No paid authority bridge is installed.
// Injected transport must enforce its admitted byte bound while reading and honor
// AbortSignal; retrospective observedBytes is not a download/security limit.
// No metadata URL is fetched here. Caller owns baseline rendering independently.
export function createWorldViewRealismController({sources=[],transport=null,renderer=null,localBudget=null,estimateBytes=()=>null,maxFailures=64,maxEffects=64,onChange=()=>{}}={}) {
  const freeze=(value,seen=new WeakSet())=>{if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);Object.values(value).forEach(child=>freeze(child,seen));Object.freeze(value)}return value}
  sources=freeze(structuredClone(sources))
  let rejectedSources=[]
  let generation=0, pending=null, active=null, disposed=false, lifecycle='visible-idle'
  const failed=new Set(), effects=[]
  if(!Number.isInteger(maxFailures)||maxFailures<1||!Number.isInteger(maxEffects)||maxEffects<1)throw new TypeError('Invalid retention bounds')
  const effect=value=>{effects.push(value);if(effects.length>maxEffects)effects.shift()}
  let status='fallback',reason='no-selection',requestedSourceId=null
  const once=fn=>{let done=false;return()=>{if(done)return;done=true;try{fn?.()}catch{effect({type:'cleanup-failed'})}}}
  const snapshot=()=>({localBudget:localBudget?.snapshot?structuredClone(localBudget.snapshot()):null,status,reason,lifecycle,disposed,requestedSourceId,activeSourceId:active?.descriptor.sourceId??null,
    activeDescriptor:active?.descriptor??null,observedLayer:active?.observedLayer??null,rejected:structuredClone(rejectedSources),pendingSourceId:pending?.descriptor.sourceId??null,failedSourceIds:[...failed],highCostProviderActive:false})
  const publish=()=>{try{onChange(snapshot())}catch{effect({type:'subscriber-failed'})}}
  const discard=entry=>{entry?.disposeRender?.();entry?.disposeLoaded?.();entry?.release?.()}
  const discardActive=()=>{const entry=active;active=null;discard(entry)}
  const drainBudget=()=>{for(const item of localBudget?.drainEffects?.()??[]){if(item.type==='abort-pending'&&pending&&(item.ids??[]).includes(pending.id)){cancel();fallback(item.reason??'local-abort')}}}
  const cancel=()=>{generation++;const entry=pending;pending=null;if(entry){entry.abort.abort();if(!entry.started)entry.release()}}
  const fallback=why=>{if(disposed){publish();return}status=active?(active.observedLayer?.status==='ACTIVE'?'active':'attached'):'fallback';reason=why;publish()}
  async function select(input={}) {
    if(disposed)return snapshot()
    if(lifecycle!=='visible-active'){cancel();if(disposed)return snapshot();discardActive();fallback('not-visible-active');return snapshot()}
    if(failed.size>=maxFailures){cancel();if(disposed)return snapshot();discardActive();fallback('failure-retention-cap');return snapshot()}
    const cheap=sources.filter(source=>source?.costTier!=='high')
    const plan=planWorldViewRealismRequest({...input,sources:cheap,preferHigh:false,failedSourceIds:[...failed]})
    rejectedSources=[...plan.rejected,...sources.filter(source=>source?.costTier==='high').map(source=>({sourceId:source.id,reason:'high-cost-authority-bridge-unavailable'}))]
    requestedSourceId=plan.request?.sourceId??null
    if(!plan.request){cancel();discardActive();fallback('no-qualified-cheap-candidate');return snapshot()}
    const descriptor=freeze(structuredClone(plan.request))
    if(pending&&JSON.stringify(pending.descriptor)===JSON.stringify(descriptor)){reason='already-loading-same-scope';publish();return snapshot()}
    cancel()
    if(disposed)return snapshot()
    if(active&&JSON.stringify(active.descriptor)===JSON.stringify(descriptor)){reason='already-attached-same-scope';publish();return snapshot()}
    // An attached handle covers only its loaded bounds and real LOD, even when
    // its source registry advertises a wider coverage region.
    const old=active?.descriptor,bounds=input.bounds
    const covers=old&&old.kind===input.kind&&old.requestedLevel===input.level&&old.level===descriptor.level&&Array.isArray(bounds)
      &&bounds[0]>=old.bounds[0]&&bounds[1]>=old.bounds[1]&&bounds[2]<=old.bounds[2]&&bounds[3]<=old.bounds[3]
    const selectionToken=generation
    if(!covers){discardActive()}
    if(disposed||selectionToken!==generation||lifecycle!=='visible-active')return snapshot()
    if(typeof transport?.load!=='function'||typeof renderer?.attach!=='function'){fallback('transport-unavailable');return snapshot()}
    const id=`world-realism-${generation}`
    const admissionToken=generation
    let estimatedBytes,admission,reserveAttempted=false
    try {
      estimatedBytes=estimateBytes(descriptor)
      if(disposed||admissionToken!==generation||lifecycle!=='visible-active')return snapshot()
      reserveAttempted=true
      admission=localBudget?.reserve?.({id,sourceId:descriptor.sourceId,admitted:true,estimatedBytes})
    } catch {
      // A custom reserve may throw after claiming its local slot. Release by ID
      // defensively; an estimator failure never reached reserve.
      if(reserveAttempted)once(()=>localBudget?.release?.(id,{outcome:'fail'}))()
      if(!disposed&&admissionToken===generation)fallback('local-admission-failed');return snapshot()
    }
    if(disposed||admissionToken!==generation||lifecycle!=='visible-active'){if(admission?.allowed)once(()=>localBudget?.release?.(id,{outcome:'abort'}))();return snapshot()}
    if(!admission?.allowed){fallback(admission?.reason??'local-reservation-unavailable');return snapshot()}
    const previous=active;active=null;discard(previous)
    if(disposed||admissionToken!==generation||lifecycle!=='visible-active'){once(()=>localBudget?.release?.(id,{outcome:'abort'}))();return snapshot()}
    const entry={id,descriptor,abort:new AbortController(),started:false,released:false,disposeLoaded:null,disposeRender:null},token=generation
    entry.release=once(()=>{entry.released=true;localBudget.release(id,{outcome:entry.outcome??'abort',observedBytes:entry.observedBytes??null})})
    pending=entry;status='loading';reason='qualified-cheap-loading';publish()
    try {
      if(disposed||token!==generation||entry.abort.signal.aborted){discard(entry);if(entry.observedBytes!==null)localBudget.observeLateBytes?.(id,entry.observedBytes);publish();return snapshot()}
      entry.started=true
      const loaded=await transport.load(descriptor,{signal:entry.abort.signal,maxBytes:Number.isFinite(estimatedBytes)?estimatedBytes:null})
      entry.observedBytes=Number.isFinite(loaded?.observedBytes)&&loaded.observedBytes>=0?loaded.observedBytes:null
      entry.disposeLoaded=once(()=>loaded?.dispose?.())
      if(disposed||token!==generation||entry.abort.signal.aborted){discard(entry);if(entry.observedBytes!==null)localBudget.observeLateBytes?.(id,entry.observedBytes);publish();return snapshot()}
      if(!loaded)throw Error('empty-loaded-handle')
      if(entry.observedBytes!==null&&Number.isFinite(estimatedBytes)&&entry.observedBytes>estimatedBytes)throw Error('transport-byte-bound-breached')
      const rendered=await renderer.attach(loaded,descriptor,{signal:entry.abort.signal})
      entry.disposeRender=once(()=>rendered?.dispose?.())
      if(disposed||token!==generation||entry.abort.signal.aborted){discard(entry);if(entry.observedBytes!==null)localBudget.observeLateBytes?.(id,entry.observedBytes);publish();return snapshot()}
      if(!rendered)throw Error('empty-rendered-handle')
      entry.observedLayer=freeze(resolveWorldViewRealismLayer({kind:descriptor.kind,sources,observation:rendered.observation?.sourceId===descriptor.sourceId && rendered.observation.level===descriptor.level && JSON.stringify(rendered.observation.bounds)===JSON.stringify(descriptor.bounds) ? structuredClone(rendered.observation) : null,requestedSourceId:descriptor.sourceId}))
      if(rendered.observation!=null&&entry.observedLayer.status!=='ACTIVE')throw Error('render-observation-unqualified')
      entry.outcome='success';entry.release();
      if(disposed||token!==generation||entry.abort.signal.aborted||lifecycle!=='visible-active'){discard(entry);publish();return snapshot()}
      active=entry;pending=null;status=entry.observedLayer.status==='ACTIVE'?'active':'attached';reason='qualified-cheap-attached';publish()
    } catch(error) {
      if(Number.isFinite(error?.observedBytes)&&error.observedBytes>=0)entry.observedBytes=error.observedBytes
      entry.outcome=entry.abort.signal.aborted?'abort':'fail';discard(entry)
      if(disposed||token!==generation||entry.abort.signal.aborted){if(entry.observedBytes!==null)localBudget.observeLateBytes?.(id,entry.observedBytes);publish();return snapshot()}
      pending=null;failed.add(descriptor.sourceId);effect({type:'source-failed',sourceId:descriptor.sourceId})
      fallback('source-failed')
      return select(input)
    }
    return snapshot()
  }
  return {select,snapshot,
    interact(){if(disposed)return false;localBudget?.interact?.();return this.transition('visible-active')},
    poll(){const state=localBudget?.poll?.();drainBudget();if(state?.disposed)this.dispose();else if(state?.state&&state.state!=='visible-active')this.transition(state.state);return snapshot()},
    transition(next){if(disposed||!['visible-active','visible-idle','hidden'].includes(next))return false;lifecycle=next;const token=generation;localBudget?.transition?.(next)
      if(disposed||token!==generation||lifecycle!==next)return false
      if(next!=='visible-active'){cancel();if(disposed)return false;const cleanupToken=generation;discardActive();if(disposed||cleanupToken!==generation||lifecycle!==next)return false;status='fallback';reason=next}drainBudget();publish();return true},
    dispose(){if(disposed)return;disposed=true;lifecycle='disposed';status='fallback';reason='disposed';cancel();discardActive();localBudget?.dispose?.();drainBudget();publish()},
    drainEffects(){return effects.splice(0)},
  }
}
