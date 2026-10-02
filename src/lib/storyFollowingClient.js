// Public stories; personal Following remains private. No device storage or background delivery.
import { normalizeReviewedPublicStoryVersion, normalizeReviewedPublicVersion } from './reviewedPublicVersion.js'
import { parseInspectionInstant, inspectionInstantNanoseconds } from './inspectionTime.js'
export const STORY_FOLLOWING_CONTRACT = 'mip-public-story-following-v1'
export const PUBLIC_STORY_CONTRACT = 'mip-reviewed-public-story-v1'
export const isFollowingUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
const text = (v, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const date = v => parseInspectionInstant(v) !== null
const subject = v => ['article', 'graph_node'].includes(v?.subject_type) && isFollowingUuid(v?.subject_id)
const sequence = v => typeof v === 'string' && /^[1-9][0-9]*$/.test(v) && v.length <= 19 && BigInt(v) <= 9223372036854775807n
const keysOnly = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key))
const materialKeys = ['material_change_id','story_id','subject_type','subject_id','public_version_id','previous_public_version_id',
  'sequence','effective_at','declared_at','reason','evidence_refs','review_refs','policy_version','kind','importance','novelty','event_state','materiality_owner']
const subscriptionKeys = ['story_id','subject_type','subject_id','anchor_public_version_id','acknowledged_public_version_id','status','current_event_id']
export function isDisplayedPublicStory(v) {
  return normalizeReviewedPublicStoryVersion(v) !== null && date(v.reviewed_at) && date(v.visible_at)
    && inspectionInstantNanoseconds(v.reviewed_at) <= inspectionInstantNanoseconds(v.visible_at)
}
export function isPublicStoryMaterialChange(c, story) {
  return keysOnly(c,materialKeys) && isFollowingUuid(c.material_change_id) && c.story_id === story.story_id
    && c.subject_type === story.subject_type && c.subject_id === story.subject_id
    && isFollowingUuid(c.public_version_id) && isFollowingUuid(c.previous_public_version_id)
    && c.public_version_id !== c.previous_public_version_id
    && sequence(c.sequence) && BigInt(c.sequence) > 1n && date(c.effective_at) && date(c.declared_at)
    && text(c.reason) && text(c.policy_version) && c.materiality_owner === 'reviewed_publication_owner'
    && ['event_established', 'update', 'correction', 'resolution'].includes(c.kind)
    && ['major', 'material'].includes(c.importance) && ['genuinely_new', 'correction'].includes(c.novelty)
    && ['active', 'resolved', 'unresolved'].includes(c.event_state)
    && Array.isArray(c.evidence_refs) && c.evidence_refs.length > 0 && c.evidence_refs.length <= 100 && c.evidence_refs.every(isFollowingUuid)
    && Array.isArray(c.review_refs) && c.review_refs.length > 0 && c.review_refs.length <= 100 && c.review_refs.every(v => text(v))
}
export function normalizePublicStoryContext(data) {
  const story = data?.story
  if (!keysOnly(data,['contract','story','material_changes','evidence_versions','has_more','coverage'])
    || data?.contract !== 'mip-public-story-context-v1' || !isDisplayedPublicStory(story)
    || data.coverage !== 'declared_material_changes_only' || !Array.isArray(data.material_changes)
    || data.material_changes.length > 100 || typeof data.has_more !== 'boolean'
    || !data.material_changes.every(c => isPublicStoryMaterialChange(c, story) && BigInt(c.sequence) <= BigInt(story.sequence))
    || new Set(data.material_changes.map(c => c.material_change_id)).size !== data.material_changes.length
    || data.material_changes.some((c, i, all) => i > 0 && BigInt(c.sequence) <= BigInt(all[i - 1].sequence))
    || !Array.isArray(data.evidence_versions) || data.evidence_versions.length > 100) return null
  const evidence = data.evidence_versions.map(normalizeReviewedPublicVersion)
  if (evidence.some(v => !v) || new Set(evidence.map(v => v.public_version_id)).size !== evidence.length
    || data.material_changes.some(c => c.evidence_refs.some(id => !evidence.some(v => v.public_version_id === id)))) return null
  return { contract: data.contract, story: normalizeReviewedPublicStoryVersion(story), evidence_versions: evidence,
    material_changes: data.material_changes.map(c => Object.fromEntries(materialKeys.map(key => [key,c[key]]))),
    has_more: data.has_more, coverage: data.coverage }
}
export function isFollowingRead(data, { userId, storyId, displayedStory } = {}) {
  if (!isFollowingUuid(storyId) || !keysOnly(data,['contract','scope','delivery_channel','authenticated_user_id','story_id','subject_type','subject_id','story_status',
    'subscription','head_public_version_id','story_title','changes','unread_count','has_more','version_advanced','unclassified_version_changes','coverage'])
    || data?.contract !== STORY_FOLLOWING_CONTRACT || data.scope !== 'public_story' || data.delivery_channel !== 'in_app'
    || data.authenticated_user_id !== userId || data.story_id !== storyId || !subject(data)
    || data.coverage !== 'declared_material_changes_only' || !Array.isArray(data.changes) || data.changes.length > 50
    || !Number.isSafeInteger(data.unread_count) || data.unread_count < data.changes.length
    || typeof data.has_more !== 'boolean' || data.has_more !== (data.unread_count > data.changes.length)
    || typeof data.version_advanced !== 'boolean' || typeof data.unclassified_version_changes !== 'boolean'
    || !['public', 'revoked'].includes(data.story_status)
    || (displayedStory && (data.subject_id !== displayedStory.subject_id || data.subject_type !== displayedStory.subject_type))) return false
  const f = data.subscription
  if (f !== null && (!keysOnly(f,subscriptionKeys) || f.story_id !== storyId || f.subject_type !== data.subject_type || f.subject_id !== data.subject_id
    || !['active', 'unsubscribed', 'revoked'].includes(f.status) || !isFollowingUuid(f.current_event_id)
    || !isFollowingUuid(f.anchor_public_version_id) || !isFollowingUuid(f.acknowledged_public_version_id))) return false
  if ((f?.status !== 'active' || data.story_status !== 'public') && (data.changes.length || data.unread_count !== 0)) return false
  if (data.story_status === 'public' && !isFollowingUuid(data.head_public_version_id)) return false
  return data.changes.every(c => isPublicStoryMaterialChange(c, data))
    && new Set(data.changes.map(c => c.material_change_id)).size === data.changes.length
    && !data.changes.some((c, i, all) => i > 0 && BigInt(c.sequence) <= BigInt(all[i - 1].sequence))
}
const schemas = {
  list: [[], ['after', 'limit']], read: [['story_id'], ['limit']],
  subscribe: [['story_id', 'subject_id', 'subject_type', 'public_version_id', 'event_id', 'previous_event_id'], []],
  acknowledge: [['story_id', 'subject_id', 'subject_type', 'public_version_id', 'event_id', 'previous_event_id'], []],
  unsubscribe: [['story_id', 'event_id', 'previous_event_id'], []],
}
export function followingInput(action, input) {
  try {
    if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return null
    const descriptors = Object.getOwnPropertyDescriptors(input), schema = schemas[action]
    if (!schema || Reflect.ownKeys(descriptors).some(k => typeof k !== 'string' || !Object.hasOwn(descriptors[k], 'value'))) return null
    const value = Object.fromEntries(Object.entries(descriptors).map(([k, d]) => [k, d.value]))
    if (schema[0].some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !schema.flat().includes(k))) return null
    for (const [key, v] of Object.entries(value)) {
      if (key === 'subject_type') { if (!['article', 'graph_node'].includes(v)) return null }
      else if (key === 'limit') { if (!Number.isInteger(v) || v < 1 || v > 50) return null }
      else if (['after', 'previous_event_id'].includes(key) && v === null) continue
      else if (!isFollowingUuid(v)) return null
    }
    return value
  } catch { return null }
}
const failure = code => ({ data: null, error: { code } })
const safeCode = c => ['authentication_required', 'access_denied', 'version_conflict', 'invalid_request'].includes(c) ? c : 'service_unavailable'
function boundedSnapshot(data) {
  try {
    const json = JSON.stringify(data)
    return new TextEncoder().encode(json).length <= 2 * 1024 * 1024 ? JSON.parse(json) : null
  } catch { return null }
}
export function createStoryFollowingClient({ call } = {}) {
  return Object.freeze(Object.fromEntries(Object.keys(schemas).map(action => [action, async (input = {}, context = {}) => {
    const value = followingInput(action, input)
    let expectedUserId
    try {
      const descriptors = Object.getOwnPropertyDescriptors(context)
      if (Object.getPrototypeOf(context) !== Object.prototype || Reflect.ownKeys(descriptors).some(k => k !== 'expectedUserId' || !Object.hasOwn(descriptors[k], 'value'))) return failure('invalid_request')
      expectedUserId = descriptors.expectedUserId?.value
    } catch { return failure('invalid_request') }
    if (!value || !isFollowingUuid(expectedUserId)) return failure('invalid_request')
    if (typeof call !== 'function') return failure('service_unavailable')
    try {
      const result = await call(action, value, { expectedUserId })
      if (result?.error) return failure(safeCode(result.error.code))
      const data = boundedSnapshot(result?.data)
      if (data?.authenticated_user_id !== expectedUserId) return failure('authentication_required')
      if (data?.contract !== STORY_FOLLOWING_CONTRACT || data.scope !== 'public_story' || data.delivery_channel !== 'in_app') return failure('service_unavailable')
      if (action === 'list') {
        if (!keysOnly(data,['contract','scope','delivery_channel','authenticated_user_id','items','has_more','next_after'])
          || !Array.isArray(data.items) || data.items.length > 50 || typeof data.has_more !== 'boolean'
          || new Set(data.items.map(item => item.story_id)).size !== data.items.length
          || !data.items.every(item => isFollowingRead(item, { userId: expectedUserId, storyId: item.story_id }) && item.subscription?.status === 'active')
          || (data.has_more && !isFollowingUuid(data.next_after)) || (!data.has_more && data.next_after !== null)) return failure('service_unavailable')
      } else if (action === 'read') {
        if (!isFollowingRead(data, { userId: expectedUserId, storyId: value.story_id })) return failure('service_unavailable')
      } else if (!keysOnly(data,[...subscriptionKeys,'contract','scope','delivery_channel','authenticated_user_id','receipt_id','action'])
        || data.story_id !== value.story_id || data.receipt_id !== value.event_id || data.current_event_id !== value.event_id
        || data.action !== action || data.status !== (action === 'unsubscribe' ? 'unsubscribed' : 'active')
        || (action !== 'unsubscribe' && (data.acknowledged_public_version_id !== value.public_version_id
          || data.subject_id !== value.subject_id || data.subject_type !== value.subject_type))) return failure('service_unavailable')
      return { data, error: null }
    } catch { return failure('service_unavailable') }
  }])))
}
// The SDK obtains the current session at each foreground invoke. No captured bearer token.
// This route remains an unapplied binding until the reviewed deployment pack is installed.
export function createStoryFollowingBackend(client, { requestTimeoutMs = 15000 } = {}) {
  const timeoutMs = Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0 && requestTimeoutMs <= 15000 ? requestTimeoutMs : 15000
  async function boundedRequest(run) {
    const controller = new AbortController(); let timer
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve({ error: { code: 'service_unavailable' } }) }, timeoutMs)
      })])
    } finally { clearTimeout(timer) }
  }
  const call = client?.functions?.invoke ? async (action, input, { expectedUserId }) => {
    const result = await boundedRequest(signal => client.functions.invoke('investigation-api/story-following', {
      body: { action, input }, headers: { 'X-MIP-Expected-User': expectedUserId }, signal, timeout: timeoutMs }))
    if (result.error) {
      let detail
      try { detail = await result.error.context?.json() } catch { /* no server text in UI */ }
      return failure(result.error.context?.status === 401 ? 'authentication_required' : safeCode(detail?.error?.code))
    }
    return { data: result.data?.data ?? null, error: result.data?.error ?? null }
  } : null
  return Object.freeze({ ...createStoryFollowingClient({ call }), async loadStoryContext(storyId, { publicVersionId = null } = {}) {
    if (!isFollowingUuid(storyId) || (publicVersionId !== null && !isFollowingUuid(publicVersionId))) return failure('invalid_request')
    if (!client?.rpc) return failure('service_unavailable')
    try {
      const result = await boundedRequest(signal => {
        const request = client.rpc('read_reviewed_public_story_context_v1', { p_story_id: storyId, p_public_version_id: publicVersionId })
        return typeof request?.abortSignal === 'function' ? request.abortSignal(signal) : failure('service_unavailable')
      })
      const data = !result.error && normalizePublicStoryContext(boundedSnapshot(result.data))
      if (!data || data.story.story_id !== storyId || (publicVersionId && data.story.public_version_id !== publicVersionId)) return failure('service_unavailable')
      return { data, error: null }
    } catch { return failure('service_unavailable') }
  } })
}
