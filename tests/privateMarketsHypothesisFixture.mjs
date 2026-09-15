import {syntheticComparisonHistory} from './hypothesisComparisonFixture.mjs'
import {marketsOrigin,marketScope} from './privateMarketsWorkspaceFixture.mjs'
export const hypothesisEndpoint=marketsOrigin+'/integrated-hypotheses'
export function integratedHypothesisPayload(action,label=null,investigation=marketScope.investigation){
 const f=syntheticComparisonHistory()
 f.history.investigation_id=investigation;f.backlog.investigation_id=investigation
 for(const entry of f.history.entries){entry.assessment.question_id=investigation;if(label)entry.assessment.comparison.rationale=label}
 if(action==='history')return f.history
 if(action==='backlog')return f.backlog
 if(action==='review_history')return {contract_version:'mip_hypothesis_review_history_v1',investigation_id:investigation,
  entries:[],latest_receipt_id:null,current_user_only:true,is_approval:false,resolves_reassessment:false,publication_allowed:false}
 throw Error('Unexpected synthetic hypothesis action: '+action)
}
