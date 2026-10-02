// Provider-neutral LOCAL guard only: no entitlement, payment or global ledger.
// Caller drives lifecycle/poll and honors abort effects before releasing work.
const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const positive = value => nonnegative(value) && value > 0
export function createWorldViewLocalResourceBudget({now=()=>performance.now(),maxRequests=32,maxConcurrent=2,maxBytes=16777216,idleSuspendMs=30000,idleDisposeMs=300000}={}) {
  if (![maxRequests,maxConcurrent].every(value=>Number.isInteger(value)&&value>0) || !(maxBytes===null||nonnegative(maxBytes)) || !positive(idleSuspendMs)||!positive(idleDisposeMs)||idleDisposeMs<idleSuspendMs) throw new TypeError('Invalid local resource bounds')
  let last=now();if(!nonnegative(last))throw new TypeError('Invalid clock')
  let lastInteraction=last,state='visible-idle',disposed=false,requests=0,observedBytes=0,unknownByteReceipts=0,allowanceConsumedBytes=0,pendingMs=0
  const pending=new Map(),completed=new Map(),abortNotified=new Set(),effects=[]
  const clock=()=>{const value=now();if(!nonnegative(value)||value<last)throw new TypeError('Clock must be monotonic');if(pending.size)pendingMs+=value-last;last=value;return value}
  const pendingBytes=()=>[...pending.values()].reduce((sum,r)=>sum+(r.estimatedBytes??0),0)
  const abortPending=reason=>{const ids=[...pending.keys()].filter(id=>!abortNotified.has(id));for(const id of ids)abortNotified.add(id);if(ids.length)effects.push({type:'abort-pending',reason,ids})}
  const release=(id,{outcome='unknown',observedBytes:bytes=null}={})=>{
    const reservation=pending.get(id);if(!reservation)return false
    pending.delete(id);abortNotified.delete(id)
    // Retain conservative upper-bound usage, including unknown partial aborts.
    const chargedBytes=Math.max(reservation.estimatedBytes??0,nonnegative(bytes)?bytes:0)
    allowanceConsumedBytes+=chargedBytes
    completed.set(id,{chargedBytes,observedBytes:nonnegative(bytes)?bytes:null})
    if(nonnegative(bytes))observedBytes+=bytes;else unknownByteReceipts++
    effects.push({type:'released',id,outcome,observedBytes:nonnegative(bytes)?bytes:null})
    return true
  }
  const dispose=reason=>{if(disposed)return false;abortPending(reason);for(const id of [...pending.keys()])release(id,{outcome:'disposed'});disposed=true;state='disposed';return true}
  const snapshot=()=>({scope:'local-only',authoritativeBudgetEnforcement:false,spendingAuthorization:false,state,disposed,requests,maxRequests,maxConcurrent,maxBytes,pendingRequests:pending.size,pendingEstimatedBytes:pendingBytes(),allowanceConsumedBytes,observedBytes,unknownByteReceipts,pendingMs,knownRemainingBytes:maxBytes===null?null:Math.max(0,maxBytes-allowanceConsumedBytes-pendingBytes()),fallback:'cheap'})
  const poll=()=>{if(disposed)return;const idle=last-lastInteraction;if(idle>=idleDisposeMs)dispose('prolonged-idle');else if(idle>=idleSuspendMs){if(state!=='hidden')state='visible-idle';abortPending('idle')}}
  return {
    reserve({id,sourceId=null,admitted=false,estimatedBytes=null}={}) {
      clock();poll();let reason=null
      if(disposed)reason='disposed'
      else if(state!=='visible-active')reason='not-visible-active'
      else if(admitted!==true)reason='source-not-admitted'
      else if(typeof id!=='string'||!id||pending.has(id)||completed.has(id))reason='duplicate-or-invalid-request'
      else if(estimatedBytes!==null&&!nonnegative(estimatedBytes))reason='invalid-byte-estimate'
      else if(maxBytes!==null&&!nonnegative(estimatedBytes))reason='byte-estimate-required'
      else if(requests>=maxRequests)reason='request-allowance-exhausted'
      else if(pending.size>=maxConcurrent)reason='concurrency-allowance-exhausted'
      else if(maxBytes!==null&&allowanceConsumedBytes+pendingBytes()+estimatedBytes>maxBytes)reason='byte-allowance-exhausted'
      if(reason)return {allowed:false,reason,fallback:'cheap'}
      pending.set(id,{sourceId,estimatedBytes});requests++;return {allowed:true,reason:'local-reservation',authoritativeBudgetEnforcement:false}
    },
    release(id,receipt) {clock();return release(id,receipt)},
    // A disposal can release all slots before an uncooperative transport settles.
    // Preserve its eventual byte evidence without reopening admission or billing.
    observeLateBytes(id,bytes) {
      clock();const receipt=completed.get(id)
      if(!receipt||!nonnegative(bytes))return false
      const previous=receipt.observedBytes
      if(previous!==null&&bytes<=previous)return false
      observedBytes+=bytes-(previous??0)
      if(previous===null)unknownByteReceipts--
      const charged=Math.max(receipt.chargedBytes,bytes)
      allowanceConsumedBytes+=charged-receipt.chargedBytes
      completed.set(id,{chargedBytes:charged,observedBytes:bytes})
      return true
    },
    interact() {clock();if(disposed||state==='hidden')return false;lastInteraction=last;state='visible-active';return true},
    transition(next) {clock();if(disposed||!['visible-active','visible-idle','hidden'].includes(next))return false;state=next;if(next!=='visible-active')abortPending(next);poll();return !disposed},
    poll() {clock();poll();return snapshot()},
    dispose() {clock();return dispose('disposed')},
    drainEffects() {return effects.splice(0).map(effect=>({...effect,...(effect.ids?{ids:[...effect.ids]}:{})}))},
    snapshot() {clock();return snapshot()},
  }
}
