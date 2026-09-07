import {
  loadGraph,
  loadGraphCoverage,
  loadNodeLocations,
  loadTopics,
  loadCorpusMeta,
  resolveEligibleArticleForNews,
} from './supabase.js'
import { loadSourceComparisonView } from './sourceComparisonReadPath.js'
import { createCuratedBackend } from './curatedBackend.js'
import { createEvidenceBackend } from './evidenceBackend.js'
import { createChronologyBackend } from './chronologyBackend.js'
import { createNewsBackend } from './newsBackend.js'
import { loadInvestigationSurface } from './investigationSurface.js'

// Public projections retain the browser client's current session and RLS.
// Construction performs no reads. Each method keeps its own availability
// contract; these independently loaded projections are not one snapshot.
export function createPublicDataBackend(supabaseClient = null) {
  const options = Object.freeze({ supabaseClient })
  return Object.freeze({
    news: createNewsBackend(supabaseClient),
    evidence: createEvidenceBackend(supabaseClient),
    curated: createCuratedBackend(supabaseClient),
    chronology: createChronologyBackend(supabaseClient),
    loadSourceComparisonView: () => loadSourceComparisonView(options),
    loadGraph: () => loadGraph(options),
    loadGraphCoverage: () => loadGraphCoverage(options),
    loadNodeLocations: () => loadNodeLocations(options),
    loadTopics: () => loadTopics(options),
    loadCorpusMeta: () => loadCorpusMeta(options),
    loadInvestigationSurface: (canonicalEventId) => loadInvestigationSurface(canonicalEventId, options),
    // A direct article ID is a navigation hint. The destination reader still
    // enforces eligibility; only URL lookups consult the eligible projection.
    resolveEligibleArticleForNews: (target) => resolveEligibleArticleForNews(target, options),
  })
}
