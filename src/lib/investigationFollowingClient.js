// SOURCE ONLY. Explicit injected private call; no endpoint, Auth, cache or background task.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const uuid = value => typeof value === 'string' && UUID.test(value)
const schemas = {
  list: [[], ['after', 'limit']], read: [['investigation_id'], ['limit']],
  subscribe: [['investigation_id', 'event_id', 'previous_event_id', 'version_id', 'subject_id'], []],
  acknowledge: [['investigation_id', 'event_id', 'previous_event_id', 'version_id', 'subject_id'], []],
  unsubscribe: [['investigation_id', 'event_id', 'previous_event_id'], []],
}
export function createInvestigationFollowingClient({ call } = {}) {
  return Object.fromEntries(Object.keys(schemas).map(action => [action, async (input = {}, context = {}) => {
    if (typeof call !== 'function') return { data: null, error: { code: 'following_unbound' } }
    let expectedUserId
    try {
      if (!context || typeof context !== 'object' || Object.getPrototypeOf(context) !== Object.prototype) throw new Error()
      const descriptors = Object.getOwnPropertyDescriptors(context)
      if (Reflect.ownKeys(descriptors).some(k => k !== 'expectedUserId' || !Object.hasOwn(descriptors[k], 'value'))) throw new Error()
      expectedUserId = descriptors.expectedUserId?.value
      if (expectedUserId !== undefined && !uuid(expectedUserId)) throw new Error()
    } catch { return { data: null, error: { code: 'invalid_request' } } }
    const [required, optional] = schemas[action]
    const original = input
    try {
      if (!original || typeof original !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(original))) throw new Error()
      const descriptors = Object.getOwnPropertyDescriptors(original)
      if (Reflect.ownKeys(descriptors).some(k => typeof k !== 'string' || !Object.hasOwn(descriptors[k], 'value'))) throw new Error()
      input = Object.fromEntries(Object.entries(descriptors).map(([k, d]) => [k, d.value]))
    } catch { return { data: null, error: { code: 'invalid_request' } } }
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || required.some(k => !Object.hasOwn(input, k))
      || Object.keys(input).some(k => ![...required, ...optional].includes(k))
      || Object.entries(input).some(([k, v]) => k === 'limit' ? !Number.isInteger(v) || v < 1 || v > 50
        : ['after', 'previous_event_id'].includes(k) && v === null ? false : !uuid(v))) {
      return { data: null, error: { code: 'invalid_request' } }
    }
    try {
      // Snapshot validated primitives before crossing the injected asynchronous boundary.
      const result = await call(action, { ...input }, { expectedUserId })
      if (result?.error) {
        const allowed = ['access_denied', 'authentication_required', 'version_conflict', 'invalid_request']
        return { data: null, error: { code: allowed.includes(result.error.code) ? result.error.code : 'service_unavailable' } }
      }
      const data = result?.data
      if (expectedUserId !== undefined && data?.authenticated_user_id !== expectedUserId) return { data: null, error: { code: 'identity_mismatch' } }
      if (!data || data.publicly_eligible !== false
        || (['list', 'read'].includes(action) && (data.contract_version !== 'private-investigation-following-1' || data.scope !== 'private_investigation'))
        || (action !== 'list' && data.investigation_id !== input.investigation_id)) {
        return { data: null, error: { code: 'invalid_response' } }
      }
      return { data, error: null }
    } catch { return { data: null, error: { code: 'service_unavailable' } } }
  }]))
}
