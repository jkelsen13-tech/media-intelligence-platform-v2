import { useCallback, useEffect, useRef, useState } from 'react'
import { isDisplayedPublicStory, isFollowingRead, isFollowingUuid } from './storyFollowingClient.js'

const empty = key => ({ key, status: 'unknown', data: null, error: null, busy: false })
// Request epochs and immediate render ownership prevent cross-account and
// cross-version reuse. No cache, persistence, polling or mutation retries.
export function useStoryFollowing({ story, userId, sessionReady = false, active = true, backend,
  onAccessFailure, randomUUID = () => globalThis.crypto?.randomUUID?.() } = {}) {
  const eligible = active && sessionReady && isFollowingUuid(userId) && isDisplayedPublicStory(story)
  const key = JSON.stringify([userId, story?.story_id, story?.subject_type, story?.subject_id, story?.public_version_id, sessionReady, active])
  const [state, setState] = useState(() => empty(key))
  const owner = useRef(null), epoch = useRef(0), mounted = useRef(true), busy = useRef(null)
  owner.current = eligible ? { key, backend } : null
  const current = token => mounted.current && owner.current?.key === key && owner.current.backend === backend && epoch.current === token
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; busy.current = null } }, [])
  const fail = (token, error) => {
    if (!current(token)) return
    const code = ['access_denied', 'authentication_required', 'version_conflict', 'invalid_request'].includes(error?.code) ? error.code : 'service_unavailable'
    busy.current = null
    setState({ ...empty(key), status: code === 'version_conflict' ? 'conflict' : 'unavailable', error: code })
    if (['access_denied', 'authentication_required'].includes(code)) onAccessFailure?.(code)
  }
  const accept = (token, result) => {
    if (!current(token)) return false
    if (result?.error || !isFollowingRead(result?.data, { userId, storyId: story.story_id, displayedStory: story })) { fail(token, result?.error); return false }
    busy.current = null
    setState({ key, status: 'ready', busy: false, data: result.data, error: null })
    if (result.data.story_status === 'revoked') onAccessFailure?.('access_denied')
    return true
  }
  const load = useCallback(async () => {
    if (!eligible || owner.current?.key !== key || owner.current.backend !== backend || busy.current === key) return
    const token = ++epoch.current; busy.current = key
    setState({ ...empty(key), status: 'loading', busy: true })
    try { accept(token, await backend?.read?.({ story_id: story.story_id, limit: 20 }, { expectedUserId: userId })) }
    catch { fail(token, { code: 'service_unavailable' }) }
  }, [key, eligible, backend, onAccessFailure])
  useEffect(() => {
    epoch.current++; busy.current = null; setState(empty(key))
    if (eligible) void load()
  }, [key, eligible, backend])
  const mutate = useCallback(async action => {
    if (!eligible || owner.current?.key !== key || owner.current.backend !== backend || busy.current === key
      || state.key !== key || state.status !== 'ready' || state.data?.story_status !== 'public') return
    const f = state.data.subscription
    if (action !== 'subscribe' && f?.status !== 'active') return
    if (action === 'subscribe' && f?.status === 'active') return
    let event
    try { event = randomUUID() } catch { return }
    if (!isFollowingUuid(event)) return
    const payload = { story_id: story.story_id, event_id: event, previous_event_id: f?.current_event_id ?? null,
      ...(action === 'unsubscribe' ? {} : { subject_type: story.subject_type, subject_id: story.subject_id, public_version_id: story.public_version_id }) }
    const token = ++epoch.current; busy.current = key
    // Withhold old personal payload during write and readback, including its count.
    setState({ ...empty(key), status: 'saving', busy: true })
    try {
      const result = await backend?.[action]?.(payload, { expectedUserId: userId })
      if (!current(token)) return
      if (result?.error) { fail(token, result.error); return }
      const receipt = result?.data
      if (receipt?.authenticated_user_id !== userId || receipt.story_id !== story.story_id || receipt.receipt_id !== event
        || receipt.current_event_id !== event || receipt.action !== action || receipt.scope !== 'public_story'
        || receipt.delivery_channel !== 'in_app' || receipt.status !== (action === 'unsubscribe' ? 'unsubscribed' : 'active')
        || (action !== 'unsubscribe' && (receipt.acknowledged_public_version_id !== story.public_version_id
          || receipt.subject_type !== story.subject_type || receipt.subject_id !== story.subject_id))) { fail(token); return }
      // Historical receipts cannot establish current state after revoke or account change.
      accept(token, await backend?.read?.({ story_id: story.story_id, limit: 20 }, { expectedUserId: userId }))
    } catch { fail(token, { code: 'service_unavailable' }) }
  }, [key, eligible, backend, state, onAccessFailure, randomUUID])
  const visible = eligible && state.key === key ? state : empty(key)
  return { ...visible, eligible, displayedPublicVersionId: story?.public_version_id, load,
    follow: () => mutate('subscribe'), unfollow: () => mutate('unsubscribe'), acknowledge: () => mutate('acknowledge') }
}

export function useStoryFollowingList({ userId, sessionReady = false, active = true, backend } = {}) {
  const eligible = active && sessionReady && isFollowingUuid(userId), key = JSON.stringify([userId, sessionReady, active])
  const [state, setState] = useState(() => empty(key))
  const owner = useRef(null), epoch = useRef(0), mounted = useRef(true), busy = useRef(null)
  owner.current = eligible ? { key, backend } : null
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; busy.current = null } }, [])
  const load = useCallback(async () => {
    if (!eligible || owner.current?.key !== key || owner.current.backend !== backend || busy.current === key) return
    busy.current = key; const token = ++epoch.current
    setState({ ...empty(key), status: 'loading', busy: true })
    const current = () => mounted.current && owner.current?.key === key && owner.current.backend === backend && epoch.current === token
    try {
      const result = await backend?.list?.({ limit: 50 }, { expectedUserId: userId })
      if (!current()) return
      busy.current = null
      const data = result?.data
      if (result?.error || data?.authenticated_user_id !== userId || data.contract !== 'mip-public-story-following-v1'
        || data.scope !== 'public_story' || data.delivery_channel !== 'in_app' || !Array.isArray(data.items)
        || !data.items.every(item => isFollowingRead(item, { userId, storyId: item.story_id }) && item.subscription?.status === 'active')) {
        setState({ ...empty(key), status: 'unavailable', error: result?.error?.code ?? 'service_unavailable' }); return
      }
      setState({ key, status: 'ready', data, error: null, busy: false })
    } catch { if (current()) { busy.current = null; setState({ ...empty(key), status: 'unavailable', error: 'service_unavailable' }) } }
  }, [key, eligible, backend])
  useEffect(() => { epoch.current++; busy.current = null; setState(empty(key)); if (eligible) void load() }, [key, eligible, backend])
  return { ...(eligible && state.key === key ? state : empty(key)), eligible, load }
}
