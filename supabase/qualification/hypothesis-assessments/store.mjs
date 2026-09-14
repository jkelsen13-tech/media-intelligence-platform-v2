// Trusted-gateway adapter for the isolated store. Not exported through the live API.
// authorize/authenticate must precede this adapter. A client/worker cannot supply verifiedUserId.
import {validateHypothesisAssessment} from '../../../src/lib/hypothesisAssessment.js'
export function createHypothesisStore(query) {
 if(typeof query!=='function') throw new TypeError('query required')
 return Object.freeze({
  async authoringContext({verifiedUserId,investigationId,workspaceVersionId,sourceProject}) {
   const result=await query('select mip_hypothesis.authoring_context($1::uuid,$2::uuid,$3::uuid,$4::text) as value',
    [verifiedUserId,investigationId,workspaceVersionId,sourceProject]);return result.rows[0].value
  },
  async authoringSpan({verifiedUserId,investigationId,workspaceVersionId,sourceProject,inputPosition,sourceField,start,end}) {
   const result=await query('select mip_hypothesis.authoring_span($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::integer,$8::integer) as value',
    [verifiedUserId,investigationId,workspaceVersionId,sourceProject,inputPosition,sourceField,start,end]);return result.rows[0].value
  },
  async requestReassessment({verifiedUserId,investigationId,requestId,revisionId,trigger,reason}) {
   const result=await query('select mip_hypothesis.request_reassessment($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text) as value',
    [verifiedUserId,investigationId,requestId,revisionId,trigger,reason])
   return result.rows[0].value
  },
  async requestDetail({verifiedUserId,investigationId,requestId}) {
   const result=await query('select mip_hypothesis.read_reassessment_request($1::uuid,$2::uuid,$3::uuid) as value',
    [verifiedUserId,investigationId,requestId])
   return result.rows[0].value
  },
  async append({verifiedUserId,investigationId,requestId,predecessorId,assessment}) {
   const validation=validateHypothesisAssessment(assessment)
   if(!validation.valid) throw new Error(validation.reason)
   if(assessment.question_id!==investigationId || assessment.predecessor_id!==predecessorId)
    throw new Error('assessment_scope_mismatch')
   const result=await query('select mip_hypothesis.append_revision($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb) as value',
    [verifiedUserId,investigationId,requestId,predecessorId,JSON.stringify(assessment)])
   return result.rows[0].value
  },
  async appendBound({verifiedUserId,investigationId,workspaceVersionId,sourceProject,requestId,predecessorId,assessment}) {
   const validation=validateHypothesisAssessment(assessment)
   if(!validation.valid) throw new Error(validation.reason)
   if(assessment.question_id!==investigationId||assessment.predecessor_id!==predecessorId)
    throw new Error('assessment_scope_mismatch')
   const result=await query('select mip_hypothesis.append_bound_revision($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::jsonb) as value',
    [verifiedUserId,investigationId,workspaceVersionId,sourceProject,requestId,predecessorId,JSON.stringify(assessment)])
   return result.rows[0].value
  },
  async complete({verifiedUserId,investigationId,workspaceVersionId,sourceProject,requestId,predecessorId,assessment}) {
   const validation=validateHypothesisAssessment(assessment)
   if(!validation.valid)throw new Error(validation.reason)
   if(!assessment.reassessment_causes?.length)throw new Error('reassessment_causes_required')
   if(assessment.question_id!==investigationId||assessment.predecessor_id!==predecessorId)throw new Error('assessment_scope_mismatch')
   const result=await query('select mip_hypothesis.complete_reassessment($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::uuid,$7::jsonb) as value',
    [verifiedUserId,investigationId,workspaceVersionId,sourceProject,requestId,predecessorId,JSON.stringify(assessment)])
   return result.rows[0].value
  },
  async boundHistory({verifiedUserId,investigationId}) {
   const result=await query('select mip_hypothesis.read_bound_history($1::uuid,$2::uuid) as value',[verifiedUserId,investigationId])
   return result.rows[0].value
  },
  async backlog({verifiedUserId,investigationId}) {
   const result=await query('select mip_hypothesis.reassessment_backlog($1::uuid,$2::uuid) as value',[verifiedUserId,investigationId])
   return result.rows[0].value
  },
  async reconcile({verifiedUserId,investigationId}) {
   const result=await query('select mip_hypothesis.reconcile_reassessment_causes($1::uuid,$2::uuid) as value',[verifiedUserId,investigationId])
   return result.rows[0].value
  },
  async history({verifiedUserId,investigationId}) {
   const result=await query('select mip_hypothesis.read_history($1::uuid,$2::uuid) as value',[verifiedUserId,investigationId])
   return result.rows[0].value
  },
 })
}
