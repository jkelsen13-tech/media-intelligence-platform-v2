import { normalizeReviewedPublicVersion, normalizeReviewedPublicStoryVersion, publicVersionUuid } from './reviewedPublicVersion.js'
export const REVIEWED_ARTICLE_RPC = 'read_reviewed_public_article_v1'
export const REVIEWED_STORY_RPC = 'read_reviewed_public_story_v1'
export const REVIEWED_STORY_FOR_ARTICLE_RPC = 'read_reviewed_public_story_for_article_v1'
const unavailable = reason => Object.freeze({ status: 'unavailable', reason, version: null })

// Uses the current browser session and installed, explicitly filtered RPC.
// No session/result cache or extraction fallback crosses this boundary.
export function createReviewedPublicVersionBackend(supabaseClient = null) {
  async function read(kind, id, publicVersionId) {
    if (!publicVersionUuid(id) || !(publicVersionId === null || publicVersionUuid(publicVersionId))) return unavailable('invalid_identity')
    if (typeof supabaseClient?.rpc !== 'function') return unavailable('client_not_configured')
    const isStory = kind !== 'article', forArticle = kind === 'article_story'
    let response, timer
    const controller = new AbortController()
    try {
      const request = supabaseClient.rpc(forArticle ? REVIEWED_STORY_FOR_ARTICLE_RPC : isStory ? REVIEWED_STORY_RPC : REVIEWED_ARTICLE_RPC,
        forArticle ? { p_article_id: id } : { [isStory ? 'p_story_id' : 'p_article_id']: id, p_public_version_id: publicVersionId })
      if (typeof request?.abortSignal !== 'function') return unavailable('reader_unavailable')
      response = await Promise.race([request.abortSignal(controller.signal), new Promise(resolve => {
        timer = setTimeout(() => { resolve({ timeout: true }); controller.abort() }, 15000)
      })])
    } catch { return unavailable('reader_failed') }
    finally { if (timer !== undefined) clearTimeout(timer) }
    if (response?.timeout) return unavailable('reader_timeout')
    if (response?.error) return unavailable('reader_unavailable')
    if (response?.data == null) return unavailable('version_not_visible')
    let row
    try {
      const bytes = JSON.stringify(response.data)
      if (new TextEncoder().encode(bytes).length > 1024 * 1024) return unavailable('invalid_version')
      row = JSON.parse(bytes)
    } catch { return unavailable('invalid_version') }
    const version = (isStory ? normalizeReviewedPublicStoryVersion : normalizeReviewedPublicVersion)(row)
    if (!version || (forArticle ? !version.members.some(member => member.article_id === id) : (isStory ? version.story_id : version.article_id) !== id)
      || (publicVersionId !== null && version.public_version_id !== publicVersionId)) return unavailable('version_scope_mismatch')
    return Object.freeze({ status: 'available', reason: null, version })
  }
  return Object.freeze({
    loadArticleVersion: (articleId, { publicVersionId = null } = {}) => read('article', articleId, publicVersionId),
    loadStoryVersion: (storyId, { publicVersionId = null } = {}) => read('story', storyId, publicVersionId),
    loadStoryForArticle: articleId => read('article_story', articleId, null),
  })
}
