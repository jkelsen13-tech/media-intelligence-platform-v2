import { newsBackendFixture } from './newsBackendFixture.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'
export function curatedTables() {
  return {
    pipeline_config: [{ key: 'phase3_beta', value: true }, { key: 'provenance_ui', value: true }],
    p3_legal_case: [{ id: 'case-one', title: 'Synthetic proceeding', case_status: 'verdict_reached', verdict_or_disposition: 'Recorded disposition', deciding_body: 'Recorded deciding body', charge_or_issue: 'Recorded issue', review_status: 'reviewed', created_at: '2026-08-01' }, { id: 'case-two', title: 'Developing synthetic case', case_status: 'ongoing', review_status: 'awaiting_review', created_at: '2026-08-02' }],
    p3_legal_case_evidence: [{ id: 'ev-one', case_id: 'case-one', track: 'supporting', description: 'Recorded evidence description', source_passage: 'Attributed case passage', review_status: 'reviewed', created_at: '2026-08-02' }, { id: 'ev-two', case_id: 'case-two', track: 'missing_evidence', description: 'missing: Source record', review_status: 'awaiting_review', created_at: '2026-08-03' }, { id: 'ev-three', case_id: 'case-two', track: 'unverified_social', description: 'Unverified material', review_status: 'awaiting_review', created_at: '2026-08-04' }],
    p3_policy: [{ id: 'policy-one', name: 'Synthetic policy', agency: 'Recorded agency', review_status: 'reviewed', source_locator: { chapter: '2', pages: '20–22' }, created_at: '2026-08-01' }],
    p3_policy_track_event: [{ id: 'transition-one', policy_id: 'policy-one', track: 'stated_objective', state: 'announced', event_date: '2026-08-02', source_passage: 'Recorded objective passage', review_status: 'reviewed' }, { id: 'transition-two', policy_id: 'policy-one', track: 'actual_outcome', state: 'implemented', event_date: '2026-08-03', source_passage: 'Recorded outcome passage', review_status: 'reviewed' }],
    explanations: [{ id: 'review-one', assertion_id: 'edge:synthetic', is_current: true, review_status: 'auto_verified', state: 'ok' }],
  }
}
export function curatedFixture(options = {}) {
  const f = newsBackendFixture(options), publicData = createPublicDataBackend(f.client)
  return { ...f, backend: publicData.curated, evidence: publicData.evidence }
}
