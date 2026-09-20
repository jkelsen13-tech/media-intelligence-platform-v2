// Receipt-only, read-only native contract adapter. This is not a saved SQL
// observation, extraction result, exact-citation binding, or admission operation.
import { retainedDateDisplay } from '../src/lib/investigationEvidenceTrail.js'
import { savedSourceHistory } from '../src/lib/investigationSourceHistory.js'
import { comparisonPublicationTiming } from '../src/lib/comparisonPublicationTiming.js'

export const PROPAGATION_CONTRACT = 'demo-receipt-propagation-v1'
export const PROPAGATION_STAGES = Object.freeze([
  'capture', 'exact_evidence', 'claim_candidates', 'source_lineage', 'dependency_lineage',
  'comparison_membership', 'shared_unique_claims', 'entities', 'events', 'relationships',
  'publication_time', 'search_coverage', 'evidence_checks', 'source_history', 'versions',
  'review', 'timeline', 'collections', 'graph_nodes', 'graph_edges', 'subject',
  'cross_investigation_discovery', 'hypotheses', 'assessments', 'admission',
])
const missingText = 'Exact retained field bytes and native field/version/hash binding are unavailable in the frozen receipts; synopsis is not evidence.'
const stage = (state, output_count, reason) => ({ state, output_count, reason, publication_allowed: false })
const unique = values => [...new Set(values.filter(Boolean))].sort()

// Exhaustive structural discovery, no shortlist, token match, URL independence,
// semantic equivalence, or entity resolution inferred from receipt annotations.
export function discoverReceiptPairs(sources) {
  const rows = [...sources].sort((a, b) => a.capture_id.localeCompare(b.capture_id))
  const pairs = []
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j]
    pairs.push({ left_capture_id: a.capture_id, right_capture_id: b.capture_id,
      cross_investigation: a.topic !== b.topic,
      same_article_id: a.article_id === b.article_id,
      same_content_hash: a.content_hash === b.content_hash,
      same_declared_origin: !!a.origin_id && a.origin_id === b.origin_id,
      same_declared_dependency: !!a.dependency_id && a.dependency_id === b.dependency_id,
      semantic_state: 'blocked_exact_evidence_unavailable', accepted_bridge: false,
      independence: 'unknown', corroborative: false, publication_allowed: false })
  }
  return { scope: 'all unordered pairs within the supplied frozen receipt universe only',
    metadata_scan_complete: true, semantic_search_complete: false, pairs,
    examined_pairs: pairs.length, cross_investigation_pairs: pairs.filter(pair => pair.cross_investigation).length,
    accepted_bridges: 0, reason: missingText }
}

export function buildReceiptPropagation(universe, graph) {
  const sources = [...universe.sources].sort((a, b) => a.capture_id.localeCompare(b.capture_id))
  const discovery = discoverReceiptPairs(sources)
  const sourceReceipts = sources.map((source, index) => {
    const roots = Object.fromEntries(['article_id', 'capture_id', 'candidate_id', 'content_hash', 'span_start', 'span_end',
      'topic', 'url', 'origin_id', 'dependency_id', 'rights', 'reader_state', 'capture_state', 'candidate_state'].map(key => [key, source[key]]))
    const publication = retainedDateDisplay(source.published_at)
    const date = retainedDateDisplay(source.source_date)
    const incidentEdges = graph.edges.filter(edge => edge.source === source.preview_id || edge.target === source.preview_id)
    const pairs = discovery.pairs.filter(pair => pair.left_capture_id === source.capture_id || pair.right_capture_id === source.capture_id)
    const stages = {
      capture: stage('recorded', 1, 'Frozen receipt identity; capture body is not bundled.'),
      exact_evidence: stage('blocked', 0, missingText),
      claim_candidates: stage('recorded_pending', 1, 'Existing candidate identity only; no exact claim text or accepted claim is derived.'),
      source_lineage: stage(source.origin_id ? 'declared_unverified' : 'unknown', source.origin_id ? 1 : 0, 'Receipt-declared provenance is not independent sourcing.'),
      dependency_lineage: stage(source.dependency_id ? 'declared_unverified' : 'unknown', source.dependency_id ? 1 : 0, 'Research dependency annotation, not verified syndication or corroboration.'),
      comparison_membership: stage('private_collection_only', 1, 'Topic membership is not native comparison-event membership.'),
      shared_unique_claims: stage('coverage_unknown', null, missingText),
      entities: stage('blocked', 0, missingText), events: stage('blocked', 0, missingText),
      relationships: stage('blocked', 0, 'No reviewed exact evidence and resolved endpoints; co-mention is not a relationship.'),
      publication_time: stage(publication.dateTime ? 'recorded' : 'unavailable', publication.dateTime ? 1 : 0, 'Retained publication clock only; source_date never supplies a missing timestamp.'),
      search_coverage: stage('metadata_only', 1, 'Every receipt scanned; exact-text and external-document coverage unavailable.'),
      evidence_checks: stage('blocked', 0, 'Hash/span syntax checked at projection; bytes unavailable for revalidation. Historical checks are not a current verification.'),
      source_history: stage('receipt_only', 1, 'One retained capture reference; no history completeness or change claim.'),
      versions: stage('unknown', null, 'Content hash identifies recorded capture; native material version and predecessor are not supplied.'),
      review: stage('pending', 0, 'Pending receipt states preserved; no completed review or review timestamp supplied.'),
      timeline: stage(date.dateTime ? 'source_date_only' : 'unavailable', date.dateTime ? 1 : 0, 'Source date item only, not an event occurrence.'),
      collections: stage('private_collection_only', 1, 'Research collection membership; not an accepted narrative arc.'),
      graph_nodes: stage('private_capture_only', 1, 'Private document node; no canonical subject identity.'),
      graph_edges: stage('declared_provenance_only', incidentEdges.length, 'Receipt-bound provenance edges only; no substantive or corroborative edges.'),
      subject: stage('private_only', 1, 'Private capture subject; canonical subject remains null.'),
      cross_investigation_discovery: stage('metadata_complete_semantics_blocked', 0, missingText),
      hypotheses: stage('blocked', 0, 'No native evidence-bound generation result supplied.'),
      assessments: stage('blocked', 0, 'No native retained assessment revision supplied.'),
      admission: stage('forbidden', 0, 'Private pending receipt projection has no promotion authority.'),
    }
    return { contract: PROPAGATION_CONTRACT, ...roots, publication_allowed: false,
      input_position: String(index + 1), stages,
      candidate: { id: source.candidate_id, capture_id: source.capture_id, state: source.candidate_state,
        content_hash: source.content_hash, span_start: source.span_start, span_end: source.span_end,
        exact_text: null, canonical_claim_id: null, publication_allowed: false },
      comparison: { collection_id: `private:collection:${source.topic}`, event_id: null,
        classification: 'coverage_unknown', shared: null, unique: null, omission: null },
      subject: { private_subject_id: source.preview_id, canonical_subject_type: null, canonical_subject_id: null },
      publication: { published_at: source.published_at, precision: source.publication_precision, display: publication,
        source_date: source.source_date, source_date_display: date },
      review: { reader_state: source.reader_state, capture_state: source.capture_state, candidate_state: source.candidate_state,
        reviewed_at: null, material_version: null, predecessor_id: null },
      discovery: { examined_pairs: pairs.length, cross_investigation_pairs: pairs.filter(pair => pair.cross_investigation).length,
        accepted_bridges: 0 }, graph_edge_ids: incidentEdges.map(edge => edge.id) }
  })
  // Reuse the native article/capture identity grouping seam, explicitly marking
  // this input as an adapter over receipts, not a newly saved observation.
  const inputs = sourceReceipts.map(row => ({ position: row.input_position,
    capture: { id: row.capture_id, article_id: row.article_id }, record_version: null }))
  const history = { ...savedSourceHistory({ observation: { snapshot: { inputs } } }),
    basis: 'frozen_receipt_adapter', complete_history: false }
  const accounting = Object.fromEntries(PROPAGATION_STAGES.map(name => {
    const rows = sourceReceipts.map(row => row.stages[name])
    return [name, { inputs: rows.length, states: Object.fromEntries(unique(rows.map(row => row.state)).map(state => [state, rows.filter(row => row.state === state).length])),
      known_output_count: rows.reduce((sum, row) => sum + (row.output_count ?? 0), 0),
      unknown_output_sources: rows.filter(row => row.output_count === null).length }]
  }))
  return { contract: PROPAGATION_CONTRACT, scope: 'frozen retained receipts only', publication_allowed: false,
    qualifications: { exact_passage_verified: false, claim_truth_qualified: false, source_authority_qualified: false,
      ingest_extraction_qualified: false, rights_qualified: false, production_qualified: false, publication_allowed: false },
    sourceReceipts, accounting, discovery, history, publicationTiming: comparisonPublicationTiming(sources),
    counts: { sources: sources.length, by_topic: Object.fromEntries(universe.investigations.map(view => [view.topic, view.sources.length])),
      pending_candidates: sourceReceipts.length, accepted_claims: 0, entities: 0, events: 0, relationships: 0,
      private_capture_nodes: graph.nodes.filter(node => node.capture_id).length,
      declared_provenance_nodes: graph.nodes.filter(node => !node.capture_id).length,
      declared_provenance_edges: graph.edges.length, substantive_edges: 0, accepted_bridges: 0,
      canonical_subjects: 0, reviewed_sources: 0, hypotheses: 0, assessments: 0,
      independent_origins: null, exact_text_available: 0, exact_text_blocked: sources.length },
    collections: universe.investigations.map(view => view.arc),
    timeline: sourceReceipts.filter(row => row.publication.source_date_display.dateTime).map(row => ({
      capture_id: row.capture_id, source_date: row.publication.source_date, basis: 'source_date_only', event_id: null, publication_allowed: false })),
  }
}
