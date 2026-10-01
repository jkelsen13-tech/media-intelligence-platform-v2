// Observe a public source-provider seam without changing scheduler deferrals,
// source results or failures. Metadata callbacks cannot break source loading.
export function observeWorldViewImagery(provider, { onStatus, isCancelled = () => false } = {}) {
  let status = { status: 'loading' }, disposed = false
  const original = provider?.requestImage
  const publish = value => {
    if (disposed || isCancelled() || status.status === value) return
    status = { status: value }
    try { onStatus?.({ ...status }) } catch { /* display metadata only */ }
  }
  const wrapped = typeof original === 'function' ? function (...args) {
    const result = original.apply(provider, args)
    if (!result) return result
    return Promise.resolve(result).then(image => {
      if (image) publish('active')
      return image
    }, error => {
      if (status.status !== 'active') publish('unavailable')
      throw error
    })
  } : null
  if (wrapped) provider.requestImage = wrapped
  return {
    snapshot: () => ({ ...status }),
    dispose() { disposed = true; if (provider?.requestImage === wrapped) provider.requestImage = original },
  }
}
