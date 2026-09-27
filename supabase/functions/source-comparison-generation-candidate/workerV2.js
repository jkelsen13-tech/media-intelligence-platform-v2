// Non-deployed candidate worker. The host supplies a least-privilege RPC capability;
// no service-role client, table interface, environment credential or mutable rebuild.
import {runEventProjection} from '../../runtime-snapshots/source-comparison-run-v16/lib.js'
import {comparisonProjectionConfig} from '../../runtime-snapshots/source-comparison-run-v16/projectionConfig.js'

import {dedupeArticleClaims,dedupeProjectionExplanations} from './projectionDedupe.js'


// New native lineage is explicit; projection retains historical article inputs.
function nativeLineageForOutput(capture){
  if(capture==null)return null
  if(capture.contract_version!=='native-capture-lineage-v2' ||
    Object.keys(capture).some(key=>!['contract_version','capture_id','article_id','content_hash','review_state','source_metadata','candidates'].includes(key)) ||
    !capture.source_metadata || Object.keys(capture.source_metadata).some(key=>!['url','outlet','source_key','source_feed','published_at'].includes(key)) ||
    !Array.isArray(capture.candidates))throw new Error('mip_native_lineage_contract')
  const textOrNull=value=>value===null||typeof value==='string'
  if(Object.keys(capture).length!==7 || Object.keys(capture.source_metadata).length!==5 ||
    !Object.values(capture.source_metadata).every(textOrNull) ||
    !['contract_version','capture_id','article_id','content_hash','review_state'].every(key=>typeof capture[key]==='string'))
    throw new Error('mip_native_lineage_contract')
  const {url,outlet,source_key,source_feed,published_at}=capture.source_metadata
  return {contract_version:capture.contract_version,capture_id:capture.capture_id,
    article_id:capture.article_id,content_hash:capture.content_hash,review_state:capture.review_state,
    source_metadata:{url,outlet,source_key,source_feed,published_at},
    candidates:capture.candidates.map(candidate=>{
      if(Object.keys(candidate).some(key=>!['candidate_id','capture_id','candidate_kind','source_field','span_start','span_end','excerpt','field_hash','predecessor_candidate_id','extractor_version','review_state'].includes(key)))
        throw new Error('mip_native_candidate_contract')
      if(Object.keys(candidate).length!==11 ||
        !['candidate_id','capture_id','candidate_kind','source_field','excerpt','field_hash','extractor_version','review_state'].every(key=>typeof candidate[key]==='string') ||
        !textOrNull(candidate.predecessor_candidate_id) ||
        !Number.isSafeInteger(candidate.span_start)||candidate.span_start<0 ||
        !Number.isSafeInteger(candidate.span_end)||candidate.span_end<=candidate.span_start ||
        !/^[0-9a-f]{64}$/.test(candidate.field_hash))
        throw new Error('mip_native_candidate_contract')
      const {candidate_id,capture_id,candidate_kind,source_field,span_start,span_end,
        excerpt,field_hash,predecessor_candidate_id,extractor_version,review_state}=candidate
      return {candidate_id,capture_id,candidate_kind,source_field,span_start,span_end,
        excerpt,field_hash,predecessor_candidate_id,extractor_version,review_state}
    })}
}

export async function runGenerationWorker({rpc,requestId,session,runtime,implementation,sha256}){
  const context={p_session:session,p_runtime:runtime}
  const claim=await rpc('worker_claim',{...context,p_request:requestId('claim')})
  return processGenerationClaim({rpc,requestId,session,runtime,implementation,sha256},claim)
}
export async function processGenerationClaim({rpc,requestId,session,runtime,implementation,sha256},claim){
  const context={p_session:session,p_runtime:runtime}
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
    // Existing v1 inputs preserve their exact completion/retry bytes.
    if('native_lineage_version' in retained && retained.native_lineage_version!=='native-capture-lineage-v2')
      throw new Error('mip_native_lineage_version')
    if(retained.native_lineage_version==='native-capture-lineage-v2'){
      const metadata=retained.snapshot_metadata
      if(!metadata||Object.keys(metadata).length!==3||
        !['database_snapshot','statement_started_at','scope'].every(key=>typeof metadata[key]==='string'))
        throw new Error('mip_native_snapshot_metadata')
    }
    const projection=runEventProjection(retained.eventInputs,comparisonProjectionConfig(retained.configRows),retained.lexicon)
    const deduped=dedupeArticleClaims(projection.article_claims)
    projection.article_claims=deduped.rows
    projection.explanations=dedupeProjectionExplanations(projection.explanations,deduped.winners)
    output={projection,generation_id:claim.generation_id,input_hash:claim.input_hash,
      implementation_ref:implementation,source_observed_at:claim.source_observed_at,
      snapshot_metadata:retained.snapshot_metadata,
      // Pending source candidates are lineage only, never inputs to public claims.
      lineage_review_state:'pending',
      retained_lineage:retained.eventInputs.flatMap(({event,members})=>members.map(member=>({
        event_id:event.id,article_id:member.article.id,retained_capture:retained.native_lineage_version==='native-capture-lineage-v2'
          ?nativeLineageForOutput(member.retained_capture):member.retained_capture??null}))) }
  }catch{
    // Existing isolated policy: explicit failure is terminal. Never reset a lease.
    const failure={...binding,p_request:requestId('failure')}
    try{
      const state=await rpc('worker_fail',failure)
      return {state,generation:claim.generation_id}
    }catch{
      // The failure may already be committed. Preserve this exact request;
      // retry must recheck current authority and must never claim new work.
      return {state:'failure_unconfirmed',generation:claim.generation_id,
        retry:()=>rpc('worker_fail',failure)}
    }
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
