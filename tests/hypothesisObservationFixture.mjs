// Synthetic UI contract fixture only; not material permission or historical qualification.
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
export const observationId=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
export function syntheticObservation(hash,id=observationId(3)){
 const assessment={...hypothesisFixture(),id:observationId(2),question_id:observationId(1)}
 const refs=[{revision_id:assessment.id,revision:1,observed_status:'available'}]
 const reference_text=JSON.stringify(refs)
 const receipt={contract_version:'mip_hypothesis_observation_receipt_v1',investigation_id:assessment.question_id,
  observation_id:id,epoch:observationId(4),reference_hash:hash(reference_text),revision_count:1,
  observation_started_at:'2026-09-14T12:00:00.123456Z',observation_finished_at:'2026-09-14T12:00:00.223456Z',
  temporal_scope:'committed_revisions_observed',arbitrary_time_qualified:false,requires_committed_readback:true,publication_allowed:false}
 const view={contract_version:'mip_hypothesis_observed_history_v2',receipt,reference_text,
  entries:[{...refs[0],status:'available',assessment,completed_at:assessment.completed_at,current_context:true,reassessment_pending:false}],
  committed_readback:true,observation_membership_qualified:true,arbitrary_time_qualified:false,current_user_only:true,publication_allowed:false}
 const list={contract_version:'mip_hypothesis_observation_list_v1',investigation_id:assessment.question_id,epoch:receipt.epoch,
  receipts:[receipt],current_user_only:true,arbitrary_time_qualified:false,publication_allowed:false}
 return{receipt,view,list}
}
