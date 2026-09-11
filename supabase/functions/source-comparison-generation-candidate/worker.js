// Non-deployed candidate worker. The host supplies a least-privilege RPC capability;
// no service-role client, table interface, environment credential or mutable rebuild.
import {runEventProjection} from '../../runtime-snapshots/source-comparison-run-v16/lib.js'
import {comparisonProjectionConfig} from '../../runtime-snapshots/source-comparison-run-v16/projectionConfig.js'

export async function runGenerationWorker({rpc,requestId,session,runtime,implementation,sha256}){
  const context={p_session:session,p_runtime:runtime}
  const claim=await rpc('worker_claim',{...context,p_request:requestId('claim')})
  if(claim===null)return {state:'idle'}
  if(!claim.lease_token)return {state:'claim_receipt_only',generation:claim.generation_id}
  const binding={...context,p_generation:claim.generation_id,p_token:claim.lease_token,
    p_input_hash:claim.input_hash,p_implementation:claim.implementation_ref}
  let output
  try{
    if(claim.implementation_ref!==implementation)throw new Error('mip_implementation_mismatch')
    if(typeof claim.input_text!=='string'||await sha256(claim.input_text)!==claim.input_hash)
      throw new Error('mip_retained_input_hash_mismatch')
    const retained=JSON.parse(claim.input_text)
    if(retained.implementation_ref!==implementation||!Array.isArray(retained.eventInputs)||
      !Array.isArray(retained.configRows)||!retained.lexicon||typeof retained.lexicon!=='object')
      throw new Error('mip_retained_input_shape')
    const projection=runEventProjection(retained.eventInputs,comparisonProjectionConfig(retained.configRows),retained.lexicon)
    output={projection,generation_id:claim.generation_id,input_hash:claim.input_hash,
      implementation_ref:implementation,source_observed_at:claim.source_observed_at,
      snapshot_metadata:retained.snapshot_metadata}
  }catch{
    // Existing isolated policy: explicit failure is terminal. Never reset a lease.
    const state=await rpc('worker_fail',{...binding,p_request:requestId('failure')})
    return {state,generation:claim.generation_id}
  }
  // Do not convert an ambiguous completion response into a conflicting failure.
  // The host must retain this exact request and arguments for identical retry.
  const completion={...binding,p_request:requestId('complete'),p_output:output}
  try{
    const state=await rpc('worker_complete',completion)
    return {state,generation:claim.generation_id}
  }catch(error){
    return {state:'completion_unconfirmed',generation:claim.generation_id,
      retry:()=>rpc('worker_complete',completion)}
  }
}
