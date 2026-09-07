import {
  loadArticles,
  loadOutletDirectory,
  loadArticleDetail,
  loadArticleGraphLinks,
  loadSkyVerification,
  loadArticleTimelineKey,
  loadArticleComparisonEvents,
  loadCorpusMeta,
  loadNewSinceCount,
  loadArticleCitationMap,
  loadEventGrouping,
  loadOutletRegions,
  loadFilteredSourceMetricRows,
} from './supabase.js'

// News and Explore share the same bound browser client and public contracts.
// Options cannot replace that client, and no request or session is cached.
export function createNewsBackend(supabaseClient = null) {
  const options = Object.freeze({ supabaseClient })
  return Object.freeze({
    loadArticles: (filters) => loadArticles({ ...filters, ...options }),
    loadOutletDirectory: () => loadOutletDirectory(options),
    loadArticleDetail: (id) => loadArticleDetail(id, options),
    loadArticleGraphLinks: (id) => loadArticleGraphLinks(id, options),
    loadSkyVerification: (id) => loadSkyVerification(id, options),
    loadArticleTimelineKey: (id) => loadArticleTimelineKey(id, options),
    loadArticleComparisonEvents: (id) => loadArticleComparisonEvents(id, options),
    loadCorpusMeta: () => loadCorpusMeta(options),
    loadNewSinceCount: (isoTs) => loadNewSinceCount(isoTs, options),
    loadArticleCitationMap: () => loadArticleCitationMap(options),
    loadEventGrouping: () => loadEventGrouping(options),
    loadOutletRegions: () => loadOutletRegions(options),
    loadFilteredSourceMetricRows: (filters) => loadFilteredSourceMetricRows(filters, options),
  })
}
