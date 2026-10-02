import { planWorldViewRealismRequest, resolveWorldViewRealismLayer } from './worldViewRealismAdmission.js'
import { createWorldViewLocalResourceBudget } from './worldViewLocalResourceBudget.js'

// Provider-neutral display lifecycle. No paid authority bridge is installed.
// Injected transport must enforce its admitted byte bound while reading and honor
// AbortSignal; retrospective observedBytes is not a download/security limit.
// No metadata URL is fetched here. Caller owns baseline rendering independently.
export function createWorldViewRealismController({sources=[],transport=null,renderer=null,localBudget=null,estimateBytes=()=>null,maxFailures=64,maxEffects=64,onChange=()=>{},requestId=null,isCurrent=()=>true,initialFailedSourceIds=[]}={}) {
  const freeze=(value,seen=new WeakSet())=>{if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);Object.values(value).forEach(child=>freeze(child,seen));Object.freeze(value)}return value}
  sources=freeze(structuredClone(sources))
  let rejectedSources=[]
  let generation=0, pending=null, active=null, disposed=false, lifecycle='visible-idle'
  const failed=new Set(initialFailedSourceIds), effects=[]
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
    if(!isCurrent()){cancel();discardActive();fallback('access-context-unavailable');return snapshot()}
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
    if(disposed||!isCurrent()||selectionToken!==generation||lifecycle!=='visible-active')return snapshot()
    if(typeof transport?.load!=='function'||typeof renderer?.attach!=='function'){fallback('transport-unavailable');return snapshot()}
    const id=requestId ? requestId() : `world-realism-${generation}`
    const admissionToken=generation
    let estimatedBytes,admission,reserveAttempted=false
    try {
      estimatedBytes=estimateBytes(descriptor)
      if(disposed||!isCurrent()||admissionToken!==generation||lifecycle!=='visible-active')return snapshot()
      reserveAttempted=true
      admission=localBudget?.reserve?.({id,sourceId:descriptor.sourceId,admitted:true,estimatedBytes})
    } catch {
      // A custom reserve may throw after claiming its local slot. Release by ID
      // defensively; an estimator failure never reached reserve.
      if(reserveAttempted)once(()=>localBudget?.release?.(id,{outcome:'fail'}))()
      if(!disposed&&admissionToken===generation)fallback('local-admission-failed');return snapshot()
    }
    if(disposed||!isCurrent()||admissionToken!==generation||lifecycle!=='visible-active'){if(admission?.allowed)once(()=>localBudget?.release?.(id,{outcome:'abort'}))();return snapshot()}
    if(!admission?.allowed){fallback(admission?.reason??'local-reservation-unavailable');return snapshot()}
    const previous=active;active=null;discard(previous)
    if(disposed||!isCurrent()||admissionToken!==generation||lifecycle!=='visible-active'){once(()=>localBudget?.release?.(id,{outcome:'abort'}))();return snapshot()}
    const entry={id,descriptor,abort:new AbortController(),started:false,released:false,disposeLoaded:null,disposeRender:null},token=generation
    entry.release=once(()=>{entry.released=true;localBudget.release(id,{outcome:entry.outcome??'abort',observedBytes:entry.observedBytesComplete===false?null:entry.observedBytes??null})})
    pending=entry;status='loading';reason='qualified-cheap-loading';publish()
    try {
      if(disposed||!isCurrent()||token!==generation||entry.abort.signal.aborted){discard(entry);if(entry.observedBytesComplete!==false&&entry.observedBytes!==null)localBudget.observeLateBytes?.(id,entry.observedBytes);publish();return snapshot()}
      entry.started=true
      const loaded=await transport.load(descriptor,{signal:entry.abort.signal,maxBytes:Number.isFinite(estimatedBytes)?estimatedBytes:null,onLateBytes(bytes){if(!Number.isFinite(bytes)||bytes<0)return;entry.observedBytes=Math.max(entry.observedBytes??0,bytes);entry.observedBytesComplete=true;if(entry.released)localBudget.observeLateBytes?.(id,entry.observedBytes);publish()}})
      entry.observedBytesComplete=loaded?.observedBytesComplete!==false
      entry.observedBytes=Number.isFinite(loaded?.observedBytes)&&loaded.observedBytes>=0?loaded.observedBytes:null
      entry.disposeLoaded=once(()=>loaded?.dispose?.())
      if(disposed||!isCurrent()||token!==generation||entry.abort.signal.aborted){discard(entry);if(entry.observedBytesComplete!==false&&entry.observedBytes!==null)localBudget.observeLateBytes?.(id,entry.observedBytes);publish();return snapshot()}
      if(!loaded)throw Error('empty-loaded-handle')
      if(entry.observedBytes!==null&&Number.isFinite(estimatedBytes)&&entry.observedBytes>estimatedBytes)throw Error('transport-byte-bound-breached')
      const rendered=await renderer.attach(loaded,descriptor,{signal:entry.abort.signal})
      entry.disposeRender=once(()=>rendered?.dispose?.())
      if(disposed||!isCurrent()||token!==generation||entry.abort.signal.aborted){discard(entry);if(entry.observedBytesComplete!==false&&entry.observedBytes!==null)localBudget.observeLateBytes?.(id,entry.observedBytes);publish();return snapshot()}
      if(!rendered)throw Error('empty-rendered-handle')
      entry.observedLayer=freeze(resolveWorldViewRealismLayer({kind:descriptor.kind,sources,observation:rendered.observation?.sourceId===descriptor.sourceId && rendered.observation.level===descriptor.level && JSON.stringify(rendered.observation.bounds)===JSON.stringify(descriptor.bounds) ? structuredClone(rendered.observation) : null,requestedSourceId:descriptor.sourceId}))
      if(rendered.observation!=null&&entry.observedLayer.status!=='ACTIVE')throw Error('render-observation-unqualified')
      entry.outcome='success';entry.release();
      if(disposed||!isCurrent()||token!==generation||entry.abort.signal.aborted||lifecycle!=='visible-active'){discard(entry);publish();return snapshot()}
      active=entry;pending=null;status=entry.observedLayer.status==='ACTIVE'?'active':'attached';reason='qualified-cheap-attached';publish()
    } catch(error) {
      entry.observedBytesComplete=error?.observedBytesComplete!==false
      if(Number.isFinite(error?.observedBytes)&&error.observedBytes>=0)entry.observedBytes=Math.max(entry.observedBytes??0,error.observedBytes)
      entry.outcome=entry.abort.signal.aborted?'abort':'fail';discard(entry)
      if(disposed||!isCurrent()||token!==generation||entry.abort.signal.aborted){if(entry.observedBytesComplete!==false&&entry.observedBytes!==null)localBudget.observeLateBytes?.(id,entry.observedBytes);publish();return snapshot()}
      pending=null;failed.add(descriptor.sourceId);effect({type:'source-failed',sourceId:descriptor.sourceId})
      fallback('source-failed')
      return select(input)
    }
    return snapshot()
  }
  return {select,snapshot,
    invalidateAttachment(why='attachment-invalidated'){if(disposed)return snapshot();cancel();if(disposed)return snapshot();const token=generation;discardActive();if(disposed||!isCurrent()||token!==generation)return snapshot();requestedSourceId=null;rejectedSources=[];status='fallback';reason=why;publish();return snapshot()},
    interact(){if(disposed)return false;localBudget?.interact?.();return this.transition('visible-active')},
    poll(){const state=localBudget?.poll?.();drainBudget();if(state?.disposed)this.dispose();else if(state?.state&&state.state!=='visible-active')this.transition(state.state);return snapshot()},
    transition(next){if(disposed||!['visible-active','visible-idle','hidden'].includes(next))return false;lifecycle=next;const token=generation;localBudget?.transition?.(next)
      if(disposed||!isCurrent()||token!==generation||lifecycle!==next)return false
      if(next!=='visible-active'){cancel();if(disposed)return false;const cleanupToken=generation;discardActive();if(disposed||cleanupToken!==generation||lifecycle!==next)return false;status='fallback';reason=next}drainBudget();publish();return true},
    dispose(){if(disposed)return;disposed=true;lifecycle='disposed';status='fallback';reason='disposed';cancel();discardActive();localBudget?.dispose?.();drainBudget();publish()},
    drainEffects(){return effects.splice(0)},
  }
}

// One App-instance local owner. Native/subscriber bindings are disposable; the
// private accounting and failure history are not a renderer-mount counter.
export function createWorldViewRealismSession({enqueue=callback=>queueMicrotask(callback),
  retirementScheduler={now:()=>Date.now(),setTimeout:(callback,delay)=>setTimeout(callback,delay),clearTimeout:timer=>clearTimeout(timer)} }={}) {
  let controller=null, services=null, attachment=null, subscriber=null, access=null, scope=null, configurationFailure=null, sessionSerial=0
  const priorControllers=[]
  let getCurrentAccess=()=>access, serial=0, epoch=0, terminal=false, mountLease=0, finalizer=0, attachmentLease=0
  // Register before native mount. The finite owner set includes retired native
  // lifetimes; no pending handle can be evicted to admit another allocation.
  const nativeOwnerCapacity=32, nativeOwners=new Set(), retiredOwners=new Set()
  let retirementTimer=null, retirementTimerToken=0, retirementDelay=1000, nextRetirementAt=null, retirementDraining=false
  const retirementNow=()=>retirementScheduler.now?.()??Date.now()
  const retirementState=()=>{
    const counters={retiredNativeOwnerCount:retiredOwners.size,retiredOwnedPhotoLayerCount:0,
      retiredRetainedRgbaBytes:0,retiredBitmapLeaseCount:0,retiredNativeCountersComplete:true}
    for(const adapter of retiredOwners){
      let state
      try{state=adapter.getSourceImageryState()}catch{counters.retiredNativeCountersComplete=false;continue}
      for(const [target,field] of [['retiredOwnedPhotoLayerCount','ownedPhotoLayerCount'],['retiredRetainedRgbaBytes','retainedRgbaBytes'],['retiredBitmapLeaseCount','bitmapLeaseCount']]){
        if(Number.isSafeInteger(state?.[field])&&state[field]>=0)counters[target]+=state[field]
        else counters.retiredNativeCountersComplete=false
      }
    }
    return counters
  }
  const stopRetirementTimer=()=>{
    retirementTimerToken++
    if(retirementTimer!==null)retirementScheduler.clearTimeout(retirementTimer)
    retirementTimer=null
  }
  const completeNativeOwner=adapter=>{
    try{
      if(adapter.destroy()!==true)return false
      const state=adapter.getSourceImageryState()
      if(state?.nativeTeardownPending!==false||state?.ownedPhotoLayerCount!==0
        ||state?.retainedRgbaBytes!==0||state?.bitmapLeaseCount!==0)return false
    }catch{return false}
    retiredOwners.delete(adapter);nativeOwners.delete(adapter);return true
  }
  const scheduleRetirement=()=>{
    if(retirementDraining||retirementTimer!==null||!retiredOwners.size)return
    const token=++retirementTimerToken
    retirementTimer=retirementScheduler.setTimeout(()=>{
      if(token!==retirementTimerToken)return
      retirementTimer=null;drainRetirements()
    },Math.max(0,nextRetirementAt-retirementNow()))
    retirementTimer?.unref?.()
  }
  function drainRetirements(){
    if(retirementDraining||!retiredOwners.size)return
    if(retirementNow()<nextRetirementAt){scheduleRetirement();return}
    stopRetirementTimer()
    retirementDraining=true
    try{for(const adapter of [...retiredOwners])completeNativeOwner(adapter)}
    finally{retirementDraining=false}
    if(!retiredOwners.size){stopRetirementTimer();nextRetirementAt=null;retirementDelay=1000}
    else{retirementDelay=Math.min(30000,retirementDelay*2);nextRetirementAt=retirementNow()+retirementDelay;scheduleRetirement()}
    notify()
  }
  const key=value=>JSON.stringify(value ?? null)
  const accessCurrent=()=>!terminal && !configurationFailure && access?.sessionReady===true && key(access)===key(getCurrentAccess())
  const notify=()=>{try{subscriber?.(snapshot())}catch{/* subscriber is not authority */}}
  const snapshot=()=>{
    const state=controller?.snapshot() ?? {status:'fallback',reason:'no-source-services',localBudget:null,disposed:false,lifecycle:'visible-idle'}
    const visible=accessCurrent() && attachment && scope!==null
    return {...state,sessionEpoch:epoch,requestSerial:serial,localSessionSerial:sessionSerial,localOnly:true,bridgeFailure:configurationFailure,
      ...retirementState(),nativeOwnerCount:nativeOwners.size,nativeOwnerCapacity,
      aggregateAllowanceConsumedBytes:(state.localBudget?.allowanceConsumedBytes??0)+priorControllers.reduce((sum,item)=>sum+(item.snapshot().localBudget?.allowanceConsumedBytes??0),0),
      ...(visible ? {failedSourceIds:[],rejected:(state.rejected??[]).map(item=>({reason:item.reason}))} : {status:'fallback',reason:terminal?'disposed':'scope-unbound',requestedSourceId:null,activeSourceId:null,activeDescriptor:null,observedLayer:null,rejected:[],pendingSourceId:null,failedSourceIds:[]})}
  }
  const invalidate=reason=>{epoch++;attachment?.fence?.();controller?.invalidateAttachment(reason);notify()}
  const start=initialFailedSourceIds=>{
    const value=services
    let budget
    try{
      budget=createWorldViewLocalResourceBudget(value?.budgetOptions)
      controller=createWorldViewRealismController({sources:value?.sources??[],transport:value?.transport??null,
        estimateBytes:value?.estimateBytes??(descriptor=>value?.transport?.estimateBytes?.(descriptor)??null),
        localBudget:budget,requestId:()=>`world-source-${++serial}`,isCurrent:accessCurrent,initialFailedSourceIds,
        renderer:{attach(loaded,descriptor,options){
          if(!accessCurrent()||!attachment?.state?.().available)throw Error('native-source-attachment-unavailable')
          return attachment.attach(loaded,descriptor,options)
        }},onChange:notify})
      sessionSerial++;notify();return true
    }catch{budget?.dispose?.();configurationFailure='source-service-setup-unavailable';invalidate(configurationFailure);return false}
  }
  const configure=value=>{
    if(terminal||configurationFailure)return false
    if(controller){if(services===value)return true;configurationFailure='source-service-configuration-changed';invalidate(configurationFailure);return false}
    services=value;return start([])
  }
  const owner={snapshot,configure,invalidateAttachment:invalidate,
    canAllocateNative(){return !terminal&&!retirementDraining&&!retiredOwners.size&&nativeOwners.size<nativeOwnerCapacity},
    registerNativeAttachment(adapter){
      if(terminal||retiredOwners.has(adapter))return false
      if(nativeOwners.has(adapter))return true
      if(!owner.canAllocateNative()||typeof adapter?.destroy!=='function'||typeof adapter?.getSourceImageryState!=='function')return false
      nativeOwners.add(adapter);return true
    },
    retireAttachment(adapter){
      // Rejected unregistered callers retain their own handle. Production
      // Canvas registration happens before mount, so overflow never allocates.
      if(!nativeOwners.has(adapter))return false
      if(retiredOwners.has(adapter))return false
      // Fence allocation before invoking native cleanup: teardown observation
      // callbacks may reenter registration or retire this same handle.
      retiredOwners.add(adapter)
      if(!retirementDraining){
        retirementDraining=true
        try{completeNativeOwner(adapter)}finally{retirementDraining=false}
      }
      if(!retiredOwners.size){stopRetirementTimer();nextRetirementAt=null;retirementDelay=1000;notify();return true}
      if(nextRetirementAt===null){retirementDelay=1000;nextRetirementAt=retirementNow()+retirementDelay}
      scheduleRetirement();notify();return !nativeOwners.has(adapter)
    },
    setCurrentAccessGetter(getter){getCurrentAccess=typeof getter==='function'?getter:()=>access},
    setAccess(value){if(key(value)===key(access))return;access=structuredClone(value);invalidate('access-context-changed')},
    setScope(value){const next=value==null?null:key(value);if(scope===next)return;scope=next;invalidate('selected-version-time-changed')},
    bindAttachment(value,listener){const lease=++attachmentLease;invalidate('native-binding-changed');attachment=value;subscriber=listener;notify();return()=>{if(attachment!==value||lease!==attachmentLease)return;invalidate('native-unbound');attachment=null;if(subscriber===listener)subscriber=null;controller?.transition('visible-idle')}},
    select(input){if(retiredOwners.size){controller?.invalidateAttachment('native-retirement-pending');return Promise.resolve(snapshot())}if(!controller||!accessCurrent()||scope===null||!attachment?.state?.().available){controller?.invalidateAttachment('native-or-access-unavailable');return Promise.resolve(snapshot())}return controller.select(input)},
    interact(){if(!accessCurrent())return false
      // An absent WorldView owns no polling loop. A remount transition may
      // already have terminally idled the budget; propagate that terminal state
      // before deciding whether this fresh input may start the next session.
      controller?.poll()
      if(controller?.snapshot().disposed){
        if(priorControllers.length>=32)return false
        const old=controller,failed=old.snapshot().failedSourceIds;priorControllers.push(old);controller=null
        if(!start(failed))return false
      }
      return controller?.interact()??false
    },
    transition(value){return controller?.transition(value) ?? false},
    poll(){controller?.poll();drainRetirements();notify();return snapshot()},
    failRequest(){configurationFailure='source-request-service-unavailable';invalidate(configurationFailure)},
    retain(){if(terminal)return()=>{};mountLease++;finalizer++;let done=false;return()=>{if(done)return;done=true;mountLease--;invalidate('app-owner-unbound');const token=++finalizer;enqueue(()=>{if(mountLease===0&&token===finalizer)owner.dispose()})}},
    dispose(){if(terminal)return;terminal=true;epoch++;attachment?.fence?.();controller?.dispose();attachment=null;subscriber=null;scope=null;access=null
      // A terminal App owns no publication or requests. Native-only retirement
      // remains reachable until destruction is verified, with one backoff timer.
      for(const adapter of [...nativeOwners])owner.retireAttachment(adapter)
    },
  }
  return owner
}
