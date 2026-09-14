import {createAssessmentDraft,newArgument} from '../src/lib/hypothesisAssessmentComposer.js'
export function fillSyntheticComposer(context,evidence=null) {
 const d=createAssessmentDraft(context)
 d.hypotheses[0].definition='Synthetic explanation A.'
 d.hypotheses[1].definition='Synthetic explanation B.'
 Object.assign(d.comparison,{state:'difficult_to_distinguish',rationale:'Synthetic reviewed evidence does not distinguish the explanations.',main_limitation:'Synthetic missing record.'})
 d.revision_reason='Synthetic human argument entry, not semantic qualification.'
 if(context.head){d.revision_trigger='methodology';d.revision_effect='unchanged';d.reassessment_causes.forEach(c=>c.reason='Synthetic explicit consideration.')}
 if(evidence){
  d.evidence=[{...evidence,documented_claim:'Synthetic passage records a meeting, not its purpose.'}]
  const a=newArgument(globalThis.crypto.randomUUID(),d.hypotheses[0].id)
  Object.assign(a,{evidence_ids:[evidence.id],relation:'compatible',inference:'Synthetic meeting fits either explanation.',limitation:'Synthetic discussion remains unknown.'})
  d.arguments=[a]
 }
 return d
}
export function syntheticAuthoringContext() {
 return{contract_version:'mip_hypothesis_authoring_v1',investigation_id:'00000000-0000-4000-8000-000000000002',
  workspace_version_id:'00000000-0000-4000-8000-000000000003',observation_id:'00000000-0000-4000-8000-000000000004',
  question:'What explains the fictional contract award?',access_role:'reviewer',publication_allowed:false,review_state:'unreviewed',
  historical_commit_visibility_qualified:false,recording_method:'human-argument-entry-v1',model_version:'none',estimation_methods:[],
  knowledge_cutoff:'2026-09-13T12:00:00.123456Z',head:null,materials:[{input_position:'9007199254740993',
   material_version:'00000000-0000-4000-8000-000000000005',material_hash:'a'.repeat(64),acquired_at:'2026-09-13T11:00:00.123456Z',
   published_at:null,event_time:null,permission_state:'checked_current',fields:[{name:'summary',length:21}]}],
  backlog:{contract_version:'mip_hypothesis_reassessment_backlog_v2',investigation_id:'00000000-0000-4000-8000-000000000002',
   publication_allowed:false,completed_reassessment:false,is_completion_receipt:false,causes:[]}}
}
