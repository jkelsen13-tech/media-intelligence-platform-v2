// Public-only News envelope. Private native captures, candidates, hashes and
// review notes are intentionally absent from this browser contract.
export const NEWS_READER_PROJECTION_VERSION = 'news-eligible-article-v1'

export function eligibleNewsEnvelope(article) {
  if (!article?.id || !article?.url) return null
  return {
    projectionVersion: NEWS_READER_PROJECTION_VERSION,
    sourceRecord: {
      articleId: article.id,
      sourceFeed: article.feed ?? null,
      publisherUrl: article.url,
      publisher: article.outlet ?? null,
      // Source-registry key and capture version remain private/unknown here.
      sourceKey: null,
      captureId: null,
      inputRevision: null,
    },
    membership: { storyId: null, kind: 'unknown', version: null },
    display: {
      headline: { text: article.title, sourceField: 'public.articles.title', captureVersion: null },
      summary: article.summary == null ? null :
        { text: article.summary, sourceField: 'public.articles.summary', captureVersion: null },
    },
    clocks: {
      publication: { kind: 'publisher_publication', at: article.published_at ?? null, precision: 'unknown' },
      fetched: { kind: 'first_observed_in_public_article', at: article.fetched_at ?? null, precision: 'database_timestamp' },
      event: { kind: 'event_time', at: null, precision: 'unknown' },
      materialChange: { kind: 'material_story_change', at: null, precision: 'unknown' },
    },
    audience: { state: 'eligible', sourceStatus: article.source_status ?? null, policyVersion: null },
    assessment: { reviewState: 'unknown', support: 'unknown', breaking: 'unassessed' },
    coverage: { scope: 'current_page_only', independentOrigins: null, completeness: 'unknown' },
    consistency: { atomicAcrossJoins: false, status: 'partial_or_unknown' },
    routes: { newsArticleId: article.id, storyId: null, comparisonId: null, timelineKey: null },
  }
}
