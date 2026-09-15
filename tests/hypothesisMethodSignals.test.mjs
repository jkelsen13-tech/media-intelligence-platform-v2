import test from 'node:test';
import assert from 'node:assert/strict';
import {hypothesisFixture} from './hypothesisAssessmentFixture.mjs';
import {hypothesisHistoryView} from '../src/lib/hypothesisAssessmentClient.js';
test('method-change signal remains pending and distinct from source evidence or completion',()=>{
 const a=hypothesisFixture();
 const history={contract_version:'mip_hypothesis_history_v1',investigation_id:a.question_id,publication_allowed:false,
  temporal_scope:'retained_versions_only',historical_commit_visibility_qualified:false,
  entries:[{revision_id:a.id,revision:1,completed_at:a.completed_at,status:'available',assessment:a,current_context:false,reassessment_pending:true}]};
 const cause={cause_id:'synthetic-method-cause',revision_id:a.id,kind:'method_changed',state:'pending_explicit_reconciliation',
  detail:{classification:'method_change_requires_reassessment_not_approval'}};
 const backlog={contract_version:'mip_hypothesis_reassessment_backlog_v1',investigation_id:a.question_id,
  publication_allowed:false,completed_reassessment:false,coverage:'retained_causes_only',causes:[cause]};
 const view=hypothesisHistoryView(history,backlog,a.question_id);
 assert.ok(view);assert.equal(view.causes[0].kind,'method_changed');
 assert.equal(view.causes[0].state,'pending_explicit_reconciliation');
 assert.equal(view.entries[0].assessment.review_state,a.review_state);
 assert.equal(view.entries[0].assessment.release_state,'private');
 cause.state='reassessment_recorded';
 assert.equal(hypothesisHistoryView(history,backlog,a.question_id),null);
});
