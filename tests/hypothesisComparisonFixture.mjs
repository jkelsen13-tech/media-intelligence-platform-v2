// Synthetic saved-version display fixture, not an accepted native reassessment or policy qualification.
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs'
export function syntheticComparisonHistory(){
 const a=hypothesisFixture()
 a.comparison.rationale='Earlier synthetic reasoning: the meeting alone does not distinguish the explanations.'
 a.evidence.push({...structuredClone(a.evidence[0]),id:'omitted-record',material_version:'synthetic-omitted-version',
  documented_claim:'Synthetic retained record not used in the later revision.'})
 const b=structuredClone(a)
 Object.assign(b,{id:'synthetic-assessment-2',revision:2,predecessor_id:a.id,
  completed_at:'2026-09-14T12:00:00.123456Z',knowledge_cutoff:'2026-09-14T11:00:00.123456Z',
  revision_trigger:'methodology',revision_effect:'unchanged',revision_reason:'Synthetic method revision; no new conclusion is claimed.',
  method_version:'synthetic-contract-only-v2'})
 b.comparison.rationale='Later synthetic reasoning: the alternatives still remain difficult to distinguish.'
 b.arguments[0].inference='The revised synthetic argument preserves both competing explanations.'
 b.evidence=b.evidence.filter(e=>e.id!=='omitted-record')
 b.evidence[0].material_version='synthetic-version-2'
 b.evidence[0].quality.reason='Synthetic quality rationale changed; no new rating was assigned.'
 const history={contract_version:'mip_hypothesis_history_v1',investigation_id:a.question_id,
  publication_allowed:false,temporal_scope:'retained_versions_only',historical_commit_visibility_qualified:false,
  entries:[a,b].map(assessment=>({revision_id:assessment.id,revision:assessment.revision,
   completed_at:assessment.completed_at,status:'available',assessment,current_context:true,reassessment_pending:false}))}
 const backlog={contract_version:'mip_hypothesis_reassessment_backlog_v1',investigation_id:a.question_id,
  publication_allowed:false,completed_reassessment:false,coverage:'retained_causes_only',causes:[]}
 return{history,backlog}
}
