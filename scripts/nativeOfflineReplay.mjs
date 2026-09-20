// Offline only: never imported into the browser or any production entry.
import { createHash } from 'node:crypto'
import { extractClaims, extractEntityCandidates, normalizeEntityName, guessEntityType } from './nativeReplayExtraction.mjs'
import { canonicalUrl, bodyHash, detectSyndicates, groupClaims, computeComparison, scanLoadedLanguage, clusterArticles } from '../supabase/functions/source-comparison-run/lib.js'
import lexicon from '../supabase/functions/source-comparison-run/loadedLanguageLexicon.json' with { type: 'json' }
import { PROPAGATION_STAGES } from './demoPropagation.mjs'
import { replayGraph } from './privateReplayClient.mjs'

export const REPLAY_CONTRACT = 'private-native-offline-replay-v1'
export const PRIVATE_REPLAY_PATH = '/private/native-replay.json'
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex')
const unique = values => [...new Set(values)]
const pending = { review_state: 'pending', candidate_state: 'pending', publication_allowed: false, public_admission: false, canonical_id: null }
const cp = text => Array.from(text)
function fail() { throw new Error('Private replay input failed contract validation; no input values logged.') }

export function replayPrivateInput(input, { expectedCount = 93 } = {}) {
  if (!Array.isArray(input?.records) || input.records.length !== expectedCount) fail()
  const records = [...input.records].sort((a, b) => String(a.capture_id).localeCompare(String(b.capture_id)))
  for (const key of ['capture_id', 'candidate_id']) if (new Set(records.map(r => r[key])).size !== records.length) fail()
  for (const r of records) {
    if (r.rights_mode !== 'bounded_exact_excerpt' || r.publication_allowed !== false || r.public_admission !== false || r.candidate_state !== 'pending') fail()
    if (['article_id', 'capture_id', 'candidate_id', 'url', 'topic', 'content_hash', 'field_name', 'field_version', 'exact_excerpt'].some(k => typeof r[k] !== 'string' || !r[k])) fail()
    if (!/^[a-f0-9]{64}$/i.test(r.content_hash) || !Number.isInteger(r.span_start) || !Number.isInteger(r.span_end) || r.span_start < 0 || r.span_end <= r.span_start || cp(r.exact_excerpt).length > 12000) fail()
  }
  const candidates = records.map(r => {
    const hasField = typeof r.captured_field_text === 'string'
    const lengthCheck = cp(r.exact_excerpt).length === r.span_end - r.span_start
    const spanCheck = hasField ? cp(r.captured_field_text).slice(r.span_start, r.span_end).join('') === r.exact_excerpt : null
    const checks = [
      { check: 'bounded_excerpt_length', state: lengthCheck ? 'passed' : 'failed' },
      { check: 'capture_payload_hash', state: 'retained_unverified', reason: 'Receipt/database capture hash retained as identity. Captured field text is not the canonical capture payload and cannot revalidate this hash.' },
      { check: 'exact_code_point_span', state: spanCheck === null ? 'unavailable' : spanCheck ? 'passed' : 'failed' },
      { check: 'rights_and_review_gate', state: 'passed' },
    ]
    const eligible = lengthCheck && spanCheck !== false
    // Never persist the full captured field. Only the licensed bounded span survives.
    const source = Object.fromEntries(['article_id','capture_id','candidate_id','url','topic','content_hash','span_start','span_end','field_name','field_version','outlet','title','published_at','source_date','origin_id','dependency_id','rights_mode'].map(k => [k, r[k] ?? null]))
    const text = eligible ? r.exact_excerpt : ''
    let cursor = 0
    const sentences = extractClaims(text).map((claim, i) => {
      const at = text.indexOf(claim.text, cursor); cursor = at + claim.text.length
      const start = r.span_start + cp(text.slice(0, at)).length
      return { ...claim, id: `${r.candidate_id}:sentence:${i + 1}`, span_start: start, span_end: start + cp(claim.text).length, ...pending }
    })
    const mentions = extractEntityCandidates(text, new Set(records.map(r => normalizeEntityName(r.outlet ?? '')))).map((m, i) => ({ ...m, id: `${r.candidate_id}:mention:${i + 1}`, normalized: normalizeEntityName(m.surface), guessed_type: guessEntityType(m.surface), identity_state: 'unresolved_private_candidate', ...pending }))
    const loaded_language = scanLoadedLanguage(text, lexicon).map(hit => ({ ...hit, span: hit.span.map(n => r.span_start + cp(text.slice(0, n)).length), span_unit: 'code_points' }))
    const gaps = checks.filter(c => c.state !== 'passed').map(c => `${c.check}:${c.state}`)
    if (!sentences.length) gaps.push('native_sentence_extraction_empty_or_outside_length_bounds')
    gaps.push('bounded_excerpt_only_not_full_source_coverage','independence_unresolved','human_review_pending','canonical_admission_unavailable')
    return { ...source, exact_excerpt: text, evidence_state: !eligible ? 'failed_quarantined' : hasField ? 'verified_bounded_span' : 'binding_incomplete', sentences, mentions, loaded_language, checks, gaps, ...pending }
  })
  const articles = candidates.map(c => ({ id: c.capture_id, outlet: c.outlet ?? c.article_id, url: c.url, body_text: c.exact_excerpt, published_at: c.published_at, embedding: null }))
  const syndicates = detectSyndicates(articles)
  const articlesById = new Map(articles.map(a => [a.id, a]))
  const items = candidates.flatMap(c => c.sentences.map(s => ({ articleId: c.capture_id, text: s.text, kind: s.kind })))
  const groups = groupClaims(items, 0.6)
  const comparison = computeComparison({ members: articles.map(article => ({ article, confidence: 1, method: 'explicit_private_input_universe' })), extracted: new Map(candidates.map(c => [c.capture_id, c.sentences.length > 0])) }, groups, articlesById, syndicates, { membershipFloor: 0.55 })
  const claim_groups = comparison.claims.map((g, i) => ({
    id: `private:lexical-group:${i + 1}`, representative_text: g.canonicalText,
    classification: unique(g.members.map(m => m.articleId)).length > 1 ? 'shared' : 'unique',
    members: g.members.map(m => ({ capture_id: m.articleId, text: m.surfaceText })),
    source_membership: unique(g.members.map(m => m.articleId)),
    omitted_by: g.omitted_by, coverage_unknown: g.coverage_unknown,
    absence_scope: 'Native extracted sentences within supplied bounded excerpts only; never whole-source omission.',
    method: 'native_lexical_groupClaims_0.6_computeComparison', independence: 'unknown', semantic_truth: 'unassessed', ...pending,
  }))
  const dependencies = []
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const a = candidates[i], b = candidates[j], evidence = []
    if (canonicalUrl(a.url) === canonicalUrl(b.url)) evidence.push('same_canonical_url')
    if (a.content_hash === b.content_hash) evidence.push('same_declared_capture_sha256')
    if (bodyHash(a.exact_excerpt) && bodyHash(a.exact_excerpt) === bodyHash(b.exact_excerpt)) evidence.push('same_normalized_bounded_excerpt_hash')
    if (evidence.length) dependencies.push({ id: `private:dependency:${i}:${j}`, capture_ids: [a.capture_id,b.capture_id], evidence, lineage_state: 'machine_detected_overlap_pending', independence: 'unknown', syndicate_group: syndicates.get(a.capture_id) ?? null, ...pending })
  }
  const entityIndex = new Map(candidates.map(c => [c.capture_id, new Set(c.mentions.map(m => m.normalized))]))
  const candidate_clusters = clusterArticles(articles, entityIndex, { similarityThreshold: 1, windowDays: 30, minSharedEntities: 2, membershipFloor: 0.55 })
    .filter(g => g.members.length > 1).map((g, i) => ({ id: `private:entity-cluster:${i + 1}`, capture_ids: g.members.map(m => m.article.id), topics: unique(g.members.map(m => candidates.find(c => c.capture_id === m.article.id).topic)), method: 'native_entity_overlap_on_unresolved_mentions', temporal_scope: '30 days where publication timestamps exist; undated pairs not temporally qualified', accepted_event: false, ...pending }))
  const lexical_clusters = claim_groups.filter(g => g.source_membership.length > 1).map(g => ({ id: g.id, capture_ids: g.source_membership, topics: unique(g.source_membership.map(id => candidates.find(c => c.capture_id === id).topic)), method: 'native_lexical_claim_group', accepted_event: false, ...pending }))
  const clusters = [...candidate_clusters, ...lexical_clusters]
  const counts = { candidates: candidates.length, sentences: items.length, framing: candidates.reduce((n,c) => n+c.sentences.filter(s => s.kind === 'framing').length,0), claim_groups: claim_groups.length, shared: claim_groups.filter(g => g.classification === 'shared').length, unique: claim_groups.filter(g => g.classification === 'unique').length, mentions: candidates.reduce((n,c) => n+c.mentions.length,0), dependencies: dependencies.length, candidate_clusters: clusters.length, cross_investigation_clusters: clusters.filter(c => c.topics.length > 1).length, checks: candidates.length*4, checks_passed: candidates.flatMap(c => c.checks).filter(c => c.state === 'passed').length, capture_hashes_retained_unverified: candidates.length, gaps: candidates.reduce((n,c) => n+c.gaps.length,0), accepted_events: 0, accepted_relationships: 0, canonical_entities: 0, reviewed: 0 }
  const revision = `replay:${hash(JSON.stringify({ candidates, claim_groups, dependencies, clusters })).slice(0,24)}`
  const supported = { capture:counts.candidates, exact_evidence:candidates.filter(c => c.evidence_state==='verified_bounded_span').length, claim_candidates:counts.candidates, source_lineage:counts.dependencies, dependency_lineage:counts.dependencies, comparison_membership:counts.candidates, shared_unique_claims:counts.claim_groups, outlet_framing:counts.framing, unresolved_identity_candidates:counts.mentions, candidate_relationships:counts.candidate_clusters, evidence_checks:counts.checks_passed, evidence_check_records:counts.checks, evidence_gaps:counts.gaps, search_coverage:counts.candidates, search_coverage_records:1, cross_investigation_discovery:counts.cross_investigation_clusters, cross_investigation_candidate_relationships:counts.cross_investigation_clusters, subject:counts.candidates, source_links:counts.candidates, review_baseline:1, review_current:1, what_changed:1 }
  const graph = replayGraph({clusters,dependencies}, candidates.map(c=>({...c,preview_id:c.capture_id})))
  Object.assign(supported,{graph_nodes:graph.nodes.length,graph_edges:graph.edges.length,graph_nodes_by_type:graph.nodes.length,graph_edges_by_type:graph.edges.length})
  const propagation = Object.fromEntries(PROPAGATION_STAGES.map(name => [name, { state: Object.hasOwn(supported,name) ? 'derived_private_pending' : 'unavailable', output_count:supported[name] ?? 0, reason:Object.hasOwn(supported,name) ? 'Isolated replay artifact; bounded evidence and unresolved candidates only.' : 'No supported native derivation or approved evidence supplied; no accepted output invented.', ...pending }]))
  for(const c of candidates) {
    const ownClusters=clusters.filter(g=>g.capture_ids.includes(c.capture_id))
    const ownDependencies=dependencies.filter(d=>d.capture_ids.includes(c.capture_id))
    const ownGroups=claim_groups.filter(g=>g.source_membership.includes(c.capture_id))
    const ownEdges=graph.edges.filter(e=>e.source===c.capture_id||e.target===c.capture_id)
    const outputs={capture:1,exact_evidence:c.evidence_state==='verified_bounded_span'?1:0,claim_candidates:1,source_lineage:ownDependencies.length,dependency_lineage:ownDependencies.length,comparison_membership:1,shared_unique_claims:ownGroups.length,outlet_framing:c.sentences.filter(s=>s.kind==='framing').length,unresolved_identity_candidates:c.mentions.length,candidate_relationships:ownClusters.length,evidence_checks:c.checks.filter(k=>k.state==='passed').length,evidence_check_records:c.checks.length,evidence_gaps:c.gaps.length,search_coverage:1,search_coverage_records:1,cross_investigation_discovery:ownClusters.filter(g=>g.topics.length>1).length,cross_investigation_candidate_relationships:ownClusters.filter(g=>g.topics.length>1).length,subject:1,source_links:1,review_baseline:1,review_current:1,what_changed:1,graph_nodes:1,graph_edges:ownEdges.length,graph_nodes_by_type:1,graph_edges_by_type:ownEdges.length}
    c.propagation=Object.fromEntries(PROPAGATION_STAGES.map(name=>[name,{...propagation[name],output_count:outputs[name]??0,scope:'this_capture_only; group values count memberships, not distinct global groups'}]))
  }
  return { contract:REPLAY_CONTRACT, revision, baseline:{ id:'isolated-qualification-receipt-only-v1', scope:'Explicit isolated qualification baseline constructed for this run; not historical native system state.', candidates:candidates.length, derived_artifacts:0 }, what_changed:{ baseline:'isolated-qualification-receipt-only-v1', current:revision, added:{ sentences:counts.sentences, lexical_groups:counts.claim_groups, unresolved_mentions:counts.mentions, dependency_evidence:counts.dependencies, candidate_clusters:counts.candidate_clusters, check_results:counts.checks }, removed:0, accepted:0 }, candidates, claim_groups, dependencies, clusters, counts, propagation, coverage:{ records:candidates.length, examined_pairs:candidates.length*(candidates.length-1)/2, scope:'whole supplied private source universe, bounded excerpts only', external_search:false, semantic_search:false }, ...pending }
}
