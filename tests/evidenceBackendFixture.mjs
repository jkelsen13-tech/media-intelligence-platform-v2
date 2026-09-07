import { newsBackendFixture } from './newsBackendFixture.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'
export const evidenceNode = { id: 'node-one', label: 'Recorded event', type: 'event', arc_id: 'arc-one', summary: 'Recorded event summary' }
export const evidencePolicy = { id: 'policy-one', label: 'Policy graph label', type: 'policy' }
export const evidenceEdge = { id: 'edge-one', source: 'policy-one', target: 'node-one', type: 'enables', doc_strength: 3, claimed_by: 'Recorded agency' }
export function evidenceTables() {
  return {
    nodes: [evidenceNode],
    sources: [{ id: 'source-one', node_id: 'node-one', headline: 'Node source headline', outlet: 'Recorded publisher', url: 'https://example.invalid/source', published_at: '2026-08-03' }],
    citations: [{ id: 'citation-one', resolved_node_id: 'node-one', article_id: 'article-one' }],
    story_arcs: [{ id: 'arc-one', root_node_id: 'node-one', category: 'public_health' }],
    articles: [{ id: 'article-one', arc_id: 'arc-one', title: 'Backing article title', outlet: 'Recorded publisher', url: 'https://example.invalid/article', published_at: '2026-08-03' }],
    policies: [{ id: 'policy-one', name: 'Recorded policy name', jurisdiction: 'Recorded jurisdiction', status: 'active', instrument_type: 'statute', source_url: 'https://example.invalid/policy' }],
    policy_actors: [{ policy_id: 'policy-one', actor_id: 'actor-one', role: 'sponsor' }],
    policy_topics: [{ policy_id: 'policy-one', topic_id: 'topic-one' }],
    policy_documents: [{ id: 'document-one', title: 'Recorded policy document', source: 'official_record', url: 'https://example.invalid/document' }],
    pipeline_config: [{ key: 'location_corroboration', value: true }, { key: 'provenance_ui', value: true }],
    sky_verifications: [{ id: 'sky-one', article_id: 'article-one', captured_at: '2026-08-04', angular_error_deg: 1, method: 'sun_position' }],
    explanations: [{ id: 'explanation-one', assertion_id: 'edge:edge-one', assertion_type: 'relationship', is_current: true, version: 1, state: 'ok', review_status: 'published',
      supporting_passage: 'Recorded grounding passage', falsification_condition: 'A contrary source would refute this connection', archived_sources: [], source_ids: ['article-one', 'document-one', 'missing-source'],
      remaining_uncertainty: 'Independent lineage remains unverified', rule_version: 'fixture-rule', provenance_class: 'documented',
    }],
  }
}
export function evidenceBackendFixture(options = {}) {
  const f = newsBackendFixture(options)
  return { ...f, backend: createPublicDataBackend(f.client).evidence }
}
