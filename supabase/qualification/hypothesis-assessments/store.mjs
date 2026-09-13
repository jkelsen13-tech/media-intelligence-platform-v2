// Trusted-gateway adapter for the isolated store. Not exported through the live API.
// authorize/authenticate must precede this adapter. A client/worker cannot supply verifiedUserId.
import {validateHypothesisAssessment} from '../../../src/lib/hypothesisAssessment.js'
export function createHypothesisStore(query) {
 if(typeof query!=='function') throw new TypeError('query required')
 return Object.freeze({
  async append({verifiedUserId,investigationId,requestId,predecessorId,assessment}) {
   const validation=validateHypothesisAssessment(assessment)
   if(!validation.valid) throw new Error(validation.reason)
   if(assessment.question_id!==investigationId || assessment.predecessor_id!==predecessorId)
    throw new Error('assessment_scope_mismatch')
   const result=await query('select mip_hypothesis.append_revision($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb) as value',
    [verifiedUserId,investigationId,requestId,predecessorId,JSON.stringify(assessment)])
   return result.rows[0].value
  },
  async history({verifiedUserId,investigationId}) {
   const result=await query('select mip_hypothesis.read_history($1::uuid,$2::uuid) as value',[verifiedUserId,investigationId])
   return result.rows[0].value
  },
 })
}
