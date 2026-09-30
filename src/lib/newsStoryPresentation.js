import { provenanceBasis, PROVENANCE_LABELS } from './newsFeedModel.js'

/**
 * Public news-reader fields only. This is a presentation input, never an
 * eligibility or publication decision: callers must use the authorized reader.
 * @typedef {Object} NewsArticle
 * @property {string} id
 * @property {string|null} [title]
 * @property {string|null} [summary]
 * @property {string|null} [outlet]
 * @property {string|null} [published_at]
 * @property {string|null} [url]
 * @property {string|null} [arc_id]
 * @property {string|null} [arc_title]
 */
const optionalText = (value) => value == null || typeof value === 'string'
const usableText = (value) => typeof value === 'string' && value.trim().length > 0

/** @param {NewsArticle} article */
export function validateNewsArticle(article) {
  if (!article || typeof article !== 'object' || !usableText(article.id) ||
    !['title', 'summary', 'outlet', 'published_at', 'url', 'arc_id', 'arc_title'].every(key => optionalText(article[key]))) {
    throw new TypeError('news_story_input_invalid')
  }
  return article
}

/** Validate the existing loadArticles response; do not fabricate count/rows. */
export function validateNewsPage(page) {
  if (!page || !Array.isArray(page.articles) || !Number.isSafeInteger(page.total) || page.total < 0 ||
      !optionalText(page.articlesUnavailable)) throw new TypeError('news_page_input_invalid')
  const ids = new Set()
  for (const article of page.articles) {
    validateNewsArticle(article)
    if (ids.has(article.id)) throw new TypeError('news_page_duplicate_identity')
    ids.add(article.id)
  }
  return page
}

/**
 * Explicit allowlist avoids forwarding private detail, claims or comparison
 * fields into a public card. Unknown provenance stays unknown.
 * @param {NewsArticle} article
 * @param {{citation?: Object|null, region?: string|null, canOpenArc?: boolean, canOpenNode?: boolean}} [joins]
 */
export function buildNewsStoryPresentation(article, joins = {}) {
  validateNewsArticle(article)
  const { citation, region, canOpenArc = false, canOpenNode = false } = joins
  const citedTypes = citation?.citedTypes
  const basis = provenanceBasis(article,
    Array.isArray(citedTypes) || citedTypes instanceof Set ? citedTypes : null)
  const publishedAt = usableText(article.published_at) && Number.isFinite(Date.parse(article.published_at))
    ? article.published_at : null
  return Object.freeze({
    id: article.id,
    title: usableText(article.title) ? article.title : 'Untitled article',
    summary: usableText(article.summary) ? article.summary : null,
    outlet: usableText(article.outlet) ? article.outlet : 'unknown outlet',
    region: usableText(region) ? region : null,
    publishedAt,
    provenanceLabel: basis ? PROVENANCE_LABELS[basis]
      : usableText(article.url) ? 'Publisher source URL recorded' : 'Publisher source URL not recorded',
    arc: canOpenArc && usableText(article.arc_id) && usableText(article.arc_title)
      ? Object.freeze({ id: article.arc_id, title: article.arc_title }) : null,
    graphNodeId: canOpenNode && citation?.hasGraphLink === true && usableText(citation.firstNodeId)
      ? citation.firstNodeId : null,
  })
}
