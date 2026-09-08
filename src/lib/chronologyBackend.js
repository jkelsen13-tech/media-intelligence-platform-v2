import { loadArcs, loadArcDetail, loadArcArticles, loadArcConnections, loadArticleExcerpt, loadTimeline } from './supabase.js'
import { loadTimelineGroupedBetaFlag, loadArcGroupedTimeline } from './arcGroupedTimeline.js'

// All chronology lenses retain one browser client and existing public contracts.
// Independent reads preserve their own availability and publication semantics.
export function createChronologyBackend(supabaseClient = null) {
  const options = Object.freeze({ supabaseClient })
  return Object.freeze({
    loadArcs: () => loadArcs(options),
    loadArcDetail: (id) => loadArcDetail(id, options),
    loadArcArticles: (id) => loadArcArticles(id, options),
    loadArcConnections: (id) => loadArcConnections(id, options),
    loadArticleExcerpt: (id) => loadArticleExcerpt(id, options),
    loadTimeline: () => loadTimeline(options),
    loadTimelineGroupedBetaFlag: () => loadTimelineGroupedBetaFlag(options),
    loadArcGroupedTimeline: () => loadArcGroupedTimeline(options),
  })
}

// Empty is meaningful only after a successful read of the public projection.
// Both global and arc readers retain edgesUnavailable from the Data API seam.
export function chronologyConnectionReadState(data, error = null) {
  if (error || data?.edgesUnavailable) return 'unavailable'
  if (data == null) return 'loading'
  const edges = data.relationEdges ?? data.edges
  return Array.isArray(edges) ? 'ready' : 'unavailable'
}
