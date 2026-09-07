import { loadSources, loadNodeArticles, loadNodeCategory, loadSkyVerificationForNode, loadActorDerivation, loadPolicyDetail, loadEdgeSources } from './supabase.js'
import { loadExplanationReadView } from './explanationReadPath.js'

// One browser client for the visible evidence panels. Each existing loader
// retains its own publication/flag/availability contract and current session.
export function createEvidenceBackend(supabaseClient = null) {
  const options = Object.freeze({ supabaseClient })
  return Object.freeze({
    loadSources: id => loadSources(id, options),
    loadNodeArticles: id => loadNodeArticles(id, options),
    loadNodeCategory: node => loadNodeCategory(node, options),
    loadSkyVerificationForNode: id => loadSkyVerificationForNode(id, options),
    loadActorDerivation: ids => loadActorDerivation(ids, options),
    loadPolicyDetail: id => loadPolicyDetail(id, options),
    loadEdgeSources: ids => loadEdgeSources(ids, options),
    loadExplanationReadView: ({ assertionId, assertionType, limit } = {}) => loadExplanationReadView({ assertionId, assertionType, limit, ...options }),
  })
}
