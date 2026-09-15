// Explicitly synthetic mechanism fixture; no real allegation, policy approval or calibration.
const absent=()=>({kind:'not_estimated',reason:'No approved estimation method is bound to this fixture.'})
export function hypothesisFixture() {
 return {
  contract_version:'mip_hypothesis_assessment_v1',id:'synthetic-assessment-1',question_id:'synthetic-question',
  question:'What explains the fictional contract award?',revision:1,predecessor_id:null,
  knowledge_cutoff:'2026-09-13T10:00:00.123456Z',completed_at:'2026-09-13T10:01:00Z',
  hypothesis_relationship:'not_established',
  hypotheses:[
   {id:'influence',definition:'Improper influence affected the award.',likelihood:absent(),confidence:absent()},
   {id:'selection',definition:'A legitimate selection process determined the award.',likelihood:absent(),confidence:absent()},
  ],
  comparison:{state:'difficult_to_distinguish',favored_ids:[],rationale:'The synthetic record establishes contact but not its effect on selection.',
   main_limitation:'The discussion and evaluation records are missing.',confidence:absent()},
  evidence:[{id:'meeting',input_position:'9007199254740993',material_version:'synthetic-version-1',
   acquired_at:'2026-09-13T10:00:00.123456Z',published_at:'2026-09-12',event_time:'2026-08-01',
   documented_claim:'The synthetic record describes a meeting, not an improper agreement.',quality:absent(),origin_group:null}],
  arguments:[{id:'argument-1',hypothesis_id:'influence',evidence_ids:['meeting'],relation:'compatible',
   inference:'A meeting is compatible with influence and with routine consultation.',
   limitation:'The record does not establish what was discussed or whether the award changed.',relevance:absent()}],
  assumptions:[],gaps:['Missing discussion and contemporaneous evaluation records.'],
  change_tests:['An authenticated pre-meeting evaluation could distinguish the proposed explanations.'],
  method_version:'synthetic-contract-only-v1',model_version:'none',review_state:'unreviewed',release_state:'private',
  revision_reason:'Initial synthetic mechanism fixture.',revision_trigger:'initial',revision_effect:'initial',
 }
}
