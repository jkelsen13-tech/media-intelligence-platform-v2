import { useCallback, useEffect, useRef, useState } from 'react'
import { createRequestGate } from './investigationWorkspaceSession.js'

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const empty = key => ({ key, status: 'unknown', data: null, error: null, busy: false })
function readMatches(data, id, userId) {
  const f = data?.subscription
  return data?.authenticated_user_id === userId && data?.contract_version === 'private-investigation-following-1' && data.scope === 'private_investigation'
    && data.publicly_eligible === false && data.investigation_id === id && data.coverage === 'registered_material_changes_only'
    && Array.isArray(data.changes) && data.changes.every(c => c && uuid(c.id) && c.investigation_id === id
      && uuid(c.subject_id) && c.subject_id === f?.subject?.id && uuid(c.before_version_id) && uuid(c.after_version_id) && uuid(c.before_observation_id) && uuid(c.after_observation_id)
      && typeof c.materiality_reason === 'string' && c.materiality_reason.trim() && typeof c.declared_at === 'string')
    && (f === null ? data.changes.length === 0 : (f?.investigation_id === id && ['active', 'unsubscribed', 'revoked'].includes(f.status)
      && f.subject?.type === 'graph_node' && uuid(f.subject.id) && uuid(f.acknowledged_version_id) && uuid(f.anchor_version_id)
      && uuid(f.current_event_id) && uuid(data.head_version_id) && uuid(data.head_observation_id) && typeof data.anchor_matches_head === 'boolean'
      && typeof data.version_advanced === 'boolean' && typeof data.unclassified_version_changes === 'boolean' && typeof data.has_more === 'boolean'
      && (f.status === 'active' || data.changes.length === 0)))
}

// Foreground private preferences only. No mount read, polling, storage, producer or automatic mutation retry.
export function useInvestigationFollowing({ userId, sessionLoading = false, bundle = null, active = false, client = null,
  onAccessFailure, randomUUID = () => globalThis.crypto?.randomUUID?.() } = {}) {
  const id = bundle?.investigation_id, version = bundle?.version?.id, observation = bundle?.observation?.id
  const subject = bundle?.version?.state?.canonical_subject
  const subjectId = subject?.type === 'graph_node' && uuid(subject.id) ? subject.id : null
  const key = JSON.stringify([userId, id, version, observation, subjectId])
  const eligible = active && !sessionLoading && uuid(userId) && bundle?.contract_version === 'investigation-workspace-1'
    && bundle.publicly_eligible === false && uuid(id) && uuid(version) && uuid(observation)
  const [state, setState] = useState(() => empty(key))
  const gate = useRef(createRequestGate()), owner = useRef(null), mounted = useRef(true), busyOwner = useRef(null)
  // Immediately withhold prior account/version data, before effects run.
  owner.current = eligible ? key : null
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; gate.current.invalidate() } }, [])
  useEffect(() => { gate.current.invalidate(); busyOwner.current = null; setState(empty(key)) }, [key, eligible, client])
  const current = token => mounted.current && owner.current === key && gate.current.isCurrent(token)
  const fail = (token, error) => {
    if (!current(token)) return
    const code = ['authentication_required', 'access_denied', 'version_conflict', 'invalid_request'].includes(error?.code) ? error.code : 'service_unavailable'
    busyOwner.current = null
    setState({ ...empty(key), status: code === 'version_conflict' ? 'conflict' : 'unavailable', error: code })
    if (['authentication_required', 'access_denied'].includes(code)) onAccessFailure?.(code, bundle)
  }
  const accept = (token, result) => {
    if (!current(token)) return false
    if (result?.error || !readMatches(result?.data, id, userId)) { fail(token, result?.error); return false }
    busyOwner.current = null
    setState({ key, status: 'ready', data: result.data, error: null, busy: false }); return true
  }
  const load = useCallback(async () => {
    if (!eligible || busyOwner.current === key) return
    busyOwner.current = key
    const token = gate.current.start(key)
    setState({ ...empty(key), status: 'loading', busy: true })
    try { accept(token, await client?.read?.({ investigation_id: id, limit: 20 }, { expectedUserId: userId })) }
    catch { fail(token, { code: 'service_unavailable' }) }
  }, [eligible, key, client, id, onAccessFailure, bundle])
  const mutate = useCallback(async action => {
    if (!eligible || busyOwner.current === key || state.key !== key || state.status !== 'ready' || state.busy || !state.data) return
    const f = state.data.subscription
    if (action === 'unsubscribe' && f?.status !== 'active') return
    if (action === 'acknowledge' && (f?.status !== 'active' || !subjectId || state.data.anchor_matches_head !== true || f.subject.id !== subjectId)) return
    if (action === 'subscribe' && !subjectId) return
    let event
    try { event = randomUUID() } catch { return }
    if (!uuid(event)) return
    const payload = { investigation_id: id, event_id: event, previous_event_id: f?.current_event_id ?? null,
      ...(action === 'unsubscribe' ? {} : { version_id: version, subject_id: subjectId }) }
    busyOwner.current = key
    const token = gate.current.start(key)
    setState({ ...empty(key), status: 'saving', busy: true })
    try {
      const result = await client?.[action]?.(payload, { expectedUserId: userId })
      if (!current(token)) return
      const receipt = result?.data
      if (result?.error) { fail(token, result.error); return }
      if (receipt?.authenticated_user_id !== userId || receipt?.investigation_id !== id || receipt.receipt_id !== event || receipt.current_event_id !== event
        || receipt.action !== action || receipt.publicly_eligible !== false
        || receipt.status !== (action === 'unsubscribe' ? 'unsubscribed' : 'active')
        || (action !== 'unsubscribe' && (receipt.acknowledged_version_id !== version || receipt.subject?.id !== subjectId))) {
        fail(token, { code: 'service_unavailable' }); return
      }
      // A receipt is historical. Confirm current preference through one foreground read before displaying it.
      accept(token, await client?.read?.({ investigation_id: id, limit: 20 }, { expectedUserId: userId }))
    } catch { fail(token, { code: 'service_unavailable' }) }
  }, [eligible, state, key, id, version, subjectId, client, onAccessFailure, bundle, randomUUID])
  const visible = eligible && state.key === key ? state : empty(key)
  return { ...visible, eligible, subjectId, displayedVersionId: version, load,
    follow: () => mutate('subscribe'), unfollow: () => mutate('unsubscribe'), acknowledge: () => mutate('acknowledge') }
}
