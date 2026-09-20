// Receipt-only, read-only native contract adapter. This is not a saved SQL
// observation, extraction result, exact-citation binding, or admission operation.
import { retainedDateDisplay } from '../src/lib/investigationEvidenceTrail.js'
import { savedSourceHistory } from '../src/lib/investigationSourceHistory.js'
import { comparisonPublicationTiming } from '../src/lib/comparisonPublicationTiming.js'
import { NODE_TYPES, EDGE_TYPES } from '../src/graph/theme.js'

export const PROPAGATION_CONTRACT = 'demo-receipt-propagation-v1'
export const PROPAGATION_STAGES = Object.freeze([
  'capture', 'exact_evidence', 'claim_candidates', 'source_lineage', 'dependency_lineage',
  'comparison_membership', 'shared_unique_claims', 'entities', 'events', 'relationships',
  'publication_time', 'search_coverage', 'evidence_checks', 'source_history', 'versions',
  'review', 'timeline', 'collections', 'graph_nodes', 'graph_edges', 'subject',
  'cross_investigation_discovery', 'hypotheses', 'assessments', 'admission',
  'outlet_framing', 'contradiction_candidates', 'correction_candidates', 'assumptions',
  'strengthening_evidence', 'weakening_evidence', 'discriminating_evidence', 'unresolved_alternatives',
  'linked_assessments', 'assessment_dependencies', 'evidence_gaps', 'review_baseline', 'review_current',
  'review_prior', 'what_changed', 'historical_current', 'source_links', 'canonical_private_links',
  'attributed_statements', 'unresolved_identity_candidates', 'candidate_relationships',
  'accepted_relationships_by_type', 'rejected', 'deferred', 'saved_states', 'versioned_states',
  'source_history_items', 'evidence_check_records', 'search_coverage_records', 'graph_nodes_by_type',
  'graph_edges_by_type', 'cross_investigation_identity_continuity', 'cross_investigation_candidate_relationships',
  'cross_investigation_accepted_relationships', 'withheld_artifacts',
])
// Output units describe source-level outputs, never distinct group cardinality.
const units = {
  capture: 'capture references', exact_evidence: 'verified exact passages', claim_candidates: 'pending candidate references',
  source_lineage: 'origin declarations', dependency_lineage: 'dependency declarations', comparison_membership: 'collection memberships',
  shared_unique_claims: 'classified claims', entities: 'resolved entities', events: 'resolved events', relationships: 'accepted relationships',
  publication_time: 'recorded publication clocks', search_coverage: 'metadata-scanned receipts', evidence_checks: 'completed exact-evidence checks',
  source_history: 'capture history references', versions: 'native material versions', review: 'completed reviews', timeline: 'precise source-date items',
  collections: 'collection memberships', graph_nodes: 'private capture nodes', graph_edges: 'incident provenance edges', subject: 'private subject references',
  cross_investigation_discovery: 'accepted semantic bridges', hypotheses: 'generated hypotheses', assessments: 'retained assessments', admission: 'admitted artifacts',
  outlet_framing: 'framing analyses', contradiction_candidates: 'contradiction candidates', correction_candidates: 'correction candidates',
  assumptions: 'recorded assumptions', strengthening_evidence: 'strengthening evidence links', weakening_evidence: 'weakening evidence links',
  discriminating_evidence: 'discriminating evidence links', unresolved_alternatives: 'recorded unresolved alternatives',
  linked_assessments: 'assessment links', assessment_dependencies: 'assessment dependency links', evidence_gaps: 'coverage gap records',
  review_baseline: 'baseline reviews', review_current: 'current reviews', review_prior: 'prior reviews', what_changed: 'version comparisons',
  historical_current: 'verified currentness determinations', source_links: 'retained source URL references', canonical_private_links: 'canonical links',
  attributed_statements: 'exact attributed statements', unresolved_identity_candidates: 'identity candidates', candidate_relationships: 'relationship candidates',
  accepted_relationships_by_type: 'accepted relationships', rejected: 'recorded rejection decisions', deferred: 'recorded deferral decisions',
  saved_states: 'receipt-reported saved captures', versioned_states: 'native version records', source_history_items: 'capture history references',
  evidence_check_records: 'check status records', search_coverage_records: 'search coverage records', graph_nodes_by_type: 'private capture nodes',
  graph_edges_by_type: 'incident graph edges', cross_investigation_identity_continuity: 'accepted identity continuities',
  cross_investigation_candidate_relationships: 'cross-investigation relationship candidates', cross_investigation_accepted_relationships: 'accepted cross-investigation relationships',
  withheld_artifacts: 'generated artifacts withheld by gates',
}
const missingText = 'Exact retained field bytes and native field/version/hash binding are unavailable in the frozen receipts; synopsis is not evidence.'
const stage = (state, output_count, reason) => ({ state, output_count, reason, publication_allowed: false })
const unique = values => [...new Set(values.filter(Boolean))].sort()
const measure = (count, unit, meaning, state = 'recorded') => ({ count, unit, meaning, state })

// Exhaustive structural enumeration, no shortlist, token match, URL independence,
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
    operation: 'structural_enumeration', semantic_stage: 'blocked',
    count_units: { examined_pairs: 'unordered receipt pairs', cross_investigation_pairs: 'unordered receipt pairs spanning topics', accepted_bridges: 'accepted semantic bridges' },
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
      outlet_framing: stage('not_run', 0, missingText),
      contradiction_candidates: stage('not_run', 0, missingText), correction_candidates: stage('not_run', 0, missingText),
      assumptions: stage('unavailable', null, 'No retained native assumption records supplied.'),
      strengthening_evidence: stage('not_run', 0, 'No retained assessment and exact evidence binding supplied.'),
      weakening_evidence: stage('not_run', 0, 'No retained assessment and exact evidence binding supplied.'),
      discriminating_evidence: stage('not_run', 0, 'No retained hypotheses, alternatives or exact evidence binding supplied.'),
      unresolved_alternatives: stage('unavailable', null, 'No retained alternatives supplied; absence is not resolution.'),
      linked_assessments: stage('unavailable', null, 'No native assessment revision references supplied.'),
      assessment_dependencies: stage('unavailable', null, 'No native assessment dependency records supplied.'),
      evidence_gaps: stage('recorded', 1, missingText),
      review_baseline: stage('unavailable', null, 'No baseline review supplied.'),
      review_current: stage('unavailable', null, 'Pending state is not a completed current review.'),
      review_prior: stage('unavailable', null, 'No prior review supplied.'),
      what_changed: stage('blocked', 0, 'No baseline/current/prior native versions; one receipt cannot establish a change.'),
      historical_current: stage('unknown', null, 'Frozen historical receipt only; current source or review state was not queried.'),
      source_links: stage('recorded', 1, 'Exact receipt URL retained; no live retrieval or source endorsement.'),
      canonical_private_links: stage('unavailable', 0, 'Private capture retained; no canonical identity or linking authorization.'),
      attributed_statements: stage('blocked', 0, missingText),
      unresolved_identity_candidates: stage('not_run', 0, 'No exact mentions or native resolution candidate records supplied.'),
      candidate_relationships: stage('not_run', 0, 'No exact evidence, resolved endpoints or native relationship candidates supplied.'),
      accepted_relationships_by_type: stage('gated', 0, 'No accepted native relationships in this projection; declared provenance is separate.'),
      rejected: stage('unavailable', null, 'Pending is not a recorded rejection decision.'),
      deferred: stage('unavailable', null, 'Pending is not a recorded deferral decision.'),
      saved_states: stage('receipt_reported', 1, 'Historical receipt reports a saved capture; no new save performed.'),
      versioned_states: stage('unavailable', null, 'No native version chain supplied.'),
      source_history_items: stage('receipt_only', 1, 'One historical capture reference; full history unavailable.'),
      evidence_check_records: stage('status_only', 1, 'Blocked exact-evidence check status; not a successful check.'),
      search_coverage_records: stage('status_only', 1, 'Structural enumeration status; exact-text semantic search not run.'),
      graph_nodes_by_type: stage('private_only', 1, 'One document node; typed aggregate accounts separately for shared provenance nodes.'),
      graph_edges_by_type: stage('declared_provenance_only', incidentEdges.length, 'Documentary display edges only; no accepted semantic relationship.'),
      cross_investigation_identity_continuity: stage('blocked', 0, 'Repeated declared origin labels do not resolve shared actors.'),
      cross_investigation_candidate_relationships: stage('not_run', 0, 'Structural pair enumeration cannot generate semantic relationships.'),
      cross_investigation_accepted_relationships: stage('gated', 0, 'No reviewed native relationship or promotion authority.'),
      withheld_artifacts: stage('unknown', null, 'Gates block generation/admission; no generated artifact inventory was supplied, so withheld objects cannot be counted.'),
    }
    for (const [name, result] of Object.entries(stages)) result.unit = units[name]
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
        reviewed_at: null, material_version: null, predecessor_id: null, baseline: null, current: null, prior: null, what_changed: null },
      records: {
        outlet_framing: { outlet: source.outlet, state: 'not_run', framing: null },
        source_link: { url: source.url, basis: 'receipt', live_verified: false },
        historical_current: { basis: 'frozen_historical_receipt', current_state: 'unknown' },
        evidence_gap: { capture_id: source.capture_id, reason: missingText, scope: 'exact retained field unavailable' },
        evidence_check: { capture_id: source.capture_id, state: 'blocked', hash_check: 'not_run', span_check: 'not_run' },
        search_coverage: { capture_id: source.capture_id, operation: 'structural_enumeration', metadata_state: 'complete', exact_text_state: 'not_run' },
        accepted_relationships_by_type: Object.fromEntries(Object.keys(EDGE_TYPES).map(type => [type, { count: 0, unit: 'accepted relationships', state: 'gated' }])),
        graph_nodes_by_type: Object.fromEntries(Object.keys(NODE_TYPES).map(type => [type,
          measure(type === 'document' ? 1 : 0, 'private capture nodes', 'Capture-owned nodes of type ' + type + '; shared provenance nodes counted only in distinct aggregate.')])),
        graph_edges_by_type: Object.fromEntries(Object.keys(EDGE_TYPES).map(type => [type,
          { ...measure(incidentEdges.filter(edge => edge.type === type).length, 'incident declared-provenance edges',
            'Incident display edges of type ' + type + '; never accepted semantic relationships.'), substantive: false }])),
        gates: { exact_evidence: 'blocked', identity_resolution: 'blocked', review: 'pending', publication: 'forbidden', generated_artifact_inventory: 'unavailable' },
      },
      discovery: { examined_pairs: pairs.length, cross_investigation_pairs: pairs.filter(pair => pair.cross_investigation).length,
        accepted_bridges: 0, operation: 'structural_enumeration', count_units: discovery.count_units }, graph_edge_ids: incidentEdges.map(edge => edge.id) }
  })
  // Reuse the native article/capture identity grouping seam, explicitly marking
  // this input as an adapter over receipts, not a newly saved observation.
  const inputs = sourceReceipts.map(row => ({ position: row.input_position,
    capture: { id: row.capture_id, article_id: row.article_id }, record_version: null }))
  const history = { ...savedSourceHistory({ observation: { snapshot: { inputs } } }),
    basis: 'frozen_receipt_adapter', complete_history: false, excludedInputs_unit: 'unsupported receipt input references' }
  const groups = field => unique(sources.map(source => source[field])).map(id => ({ id,
    capture_ids: sources.filter(source => source[field] === id).map(source => source.capture_id) }))
  const origins = groups('origin_id'), dependencies = groups('dependency_id')
  const objectAccounting = {
    origin_groups: measure(origins.length, 'distinct declared origin groups', 'Unique nonempty origin_id values; independence unverified.'),
    dependency_groups: measure(dependencies.length, 'distinct declared dependency groups', 'Unique nonempty dependency_id values; no inference of syndication.'),
    collections: measure(universe.investigations.length, 'distinct private research collections', 'One private collection per bounded investigation topic.'),
    origin_memberships: measure(sources.filter(source => source.origin_id).length, 'origin declarations', 'Each receipt declaration counted once, regardless of repeated origin_id.'),
    dependency_memberships: measure(sources.filter(source => source.dependency_id).length, 'dependency declarations', 'Each receipt declaration counted once, regardless of repeated dependency_id.'),
    collection_memberships: measure(sources.length, 'collection memberships', 'Each retained capture belongs to its receipt topic.'),
    graph_nodes_by_type: Object.fromEntries(unique([...Object.keys(NODE_TYPES), ...graph.nodes.map(node => node.type)]).map(type =>
      [type, measure(graph.nodes.filter(node => node.type === type).length, 'distinct graph nodes', 'Private display nodes of type ' + type + '; not canonical identities.')])),
    graph_edges_by_type: Object.fromEntries(unique([...Object.keys(EDGE_TYPES), ...graph.edges.map(edge => edge.type)]).map(type =>
      [type, measure(graph.edges.filter(edge => edge.type === type).length, 'distinct graph edges', 'Private display edges of type ' + type + '; declared provenance only.')])),
    accepted_relationships_by_type: Object.fromEntries(Object.keys(EDGE_TYPES).map(type =>
      [type, measure(0, 'accepted relationships', 'No accepted ' + type + ' relationships in this projection; not a real-world absence claim.', 'gated')])),
  }
  const accounting = Object.fromEntries(PROPAGATION_STAGES.map(name => {
    const rows = sourceReceipts.map(row => row.stages[name])
    return [name, { inputs: rows.length, input_unit: 'receipt records', state_count_unit: 'receipt records', unit: units[name],
      meaning: 'Sum of per-source outputs in the stated unit; group memberships are not distinct objects. Null output means unavailable or unknown, never zero.',
      states: Object.fromEntries(unique(rows.map(row => row.state)).map(state => [state, rows.filter(row => row.state === state).length])),
      known_output_count: rows.reduce((sum, row) => sum + (row.output_count ?? 0), 0),
      unknown_output_sources: rows.filter(row => row.output_count === null).length, unknown_output_unit: 'receipt records' }]
  }))
  return { contract: PROPAGATION_CONTRACT, scope: 'frozen retained receipts only', publication_allowed: false,
    qualifications: { exact_passage_verified: false, claim_truth_qualified: false, source_authority_qualified: false,
      ingest_extraction_qualified: false, rights_qualified: false, production_qualified: false, publication_allowed: false },
    sourceReceipts, accounting, objectAccounting, discovery, history, publicationTiming: comparisonPublicationTiming(sources),
    groups: { origins, dependencies },
    outletFraming: unique(sources.map(source => source.outlet)).map(outlet => ({ outlet,
      receipt_coverage: measure(sources.filter(source => source.outlet === outlet).length, 'receipt records', 'Frozen receipts carrying this outlet annotation.'),
      analyses: measure(0, 'framing analyses', missingText, 'not_run') })),
    count_units: { sources: 'receipt records', by_topic: 'receipt records per topic', pending_candidates: 'pending candidate references',
      accepted_claims: 'accepted claims in this projection', entities: 'resolved entities in this projection', events: 'resolved events in this projection',
      relationships: 'accepted relationships in this projection', private_capture_nodes: 'distinct private capture nodes',
      declared_provenance_nodes: 'distinct shared declared-provenance nodes', declared_provenance_edges: 'distinct declared-provenance display edges',
      substantive_edges: 'substantive graph edges', accepted_bridges: 'accepted semantic bridges', canonical_subjects: 'canonical subjects in this projection',
      reviewed_sources: 'sources with completed reviews', hypotheses: 'generated hypotheses', assessments: 'retained assessments',
      independent_origins: 'verified independent source origins (unknown)', exact_text_available: 'receipts with verified exact text', exact_text_blocked: 'receipts lacking exact evidence',
      distinct_origin_groups: 'distinct declared origin groups', distinct_dependency_groups: 'distinct declared dependency groups', distinct_collections: 'distinct private collections' },
    counts: { sources: sources.length, by_topic: Object.fromEntries(universe.investigations.map(view => [view.topic, view.sources.length])),
      pending_candidates: sourceReceipts.length, accepted_claims: 0, entities: 0, events: 0, relationships: 0,
      private_capture_nodes: graph.nodes.filter(node => node.capture_id).length,
      declared_provenance_nodes: graph.nodes.filter(node => !node.capture_id).length,
      declared_provenance_edges: graph.edges.length, substantive_edges: 0, accepted_bridges: 0,
      canonical_subjects: 0, reviewed_sources: 0, hypotheses: 0, assessments: 0,
      independent_origins: null, exact_text_available: 0, exact_text_blocked: sources.length,
      distinct_origin_groups: origins.length, distinct_dependency_groups: dependencies.length, distinct_collections: universe.investigations.length },
    collections: universe.investigations.map(view => view.arc),
    timeline: sourceReceipts.filter(row => row.publication.source_date_display.dateTime).map(row => ({
      capture_id: row.capture_id, source_date: row.publication.source_date, basis: 'source_date_only', event_id: null, publication_allowed: false })),
  }
}
