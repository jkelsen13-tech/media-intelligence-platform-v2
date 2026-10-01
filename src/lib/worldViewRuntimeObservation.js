// Observe a public source-provider seam without changing scheduler deferrals,
// source results or failures. Metadata callbacks cannot break source loading.
// The installed provider's RequestState.CANCELLED is 4. Keep this detached signal here
// rather than importing vendor code across the lazy renderer boundary.
const CANCELLED_REQUEST_STATE = 4

function knownCancellation(request, error) {
  return request?.cancelled === true || request?.state === CANCELLED_REQUEST_STATE
    || error?.name === 'AbortError'
    // RequestScheduler.cancelRequest emits this specific RuntimeError.
    || (error?.name === 'RuntimeError' && typeof error.message === 'string'
      && /^Request cancelled: ".*"$/s.test(error.message))
}

export function observeWorldViewImagery(provider, { onStatus, isCancelled = () => false } = {}) {
  let status = { status: 'loading' }, disposed = false
  let original
  try { original = provider?.requestImage } catch { /* unavailable observation seam */ }
  const observable = () => {
    if (disposed) return false
    try { return !isCancelled() } catch { return false /* failed metadata probe stays silent */ }
  }
  const publish = value => {
    if (!observable() || status.status === value) return
    status = { status: value }
    try { onStatus?.({ ...status }) } catch { /* display metadata only */ }
  }
  const wrapped = typeof original === 'function' ? function (...args) {
    // The provider's requestImage(x, y, level, request) supplies request as arg 4.
    const request = args[3]
    const success = image => {
      if (!observable()) return
      try {
        if (image !== null && typeof image === 'object' && !knownCancellation(request)) publish('active')
      } catch { /* source result/probe access cannot break loading */ }
    }
    const failure = error => {
      if (!observable()) return
      try {
        if (status.status !== 'active' && !knownCancellation(request, error)) publish('unavailable')
      } catch { /* uninspectable metadata stays unknown */ }
    }
    let result
    try { result = original.apply(this, args) } catch (error) {
      failure(error)
      throw error // preserve synchronous error identity and timing
    }
    if (result === undefined || result === null) return result
    try {
      const then = result.then
      if (typeof then === 'function') then.call(result, success, failure)
      else success(result)
    } catch { /* broken observation/thenable probes cannot replace the source result */ }
    // Observe the original thenable; never hand its observer chain to callers.
    // Rejection handlers above affect metadata only, leaving original rejection intact.
    return result
  } : null
  if (wrapped) {
    try { provider.requestImage = wrapped } catch { /* readonly providers remain usable */ }
  }
  return {
    snapshot: () => ({ ...status }),
    dispose() {
      disposed = true
      try { if (wrapped && provider?.requestImage === wrapped) provider.requestImage = original } catch { /* metadata cleanup only */ }
    },
  }
}
