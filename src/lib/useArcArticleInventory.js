import { useEffect, useState } from 'react'

// Scope both the resolved data and each request to the selected arc and client.
// A late response cannot publish sources into another arc or overwrite a retry.
export function useArcArticleInventory(backend, arcId) {
  const [attempt, setAttempt] = useState(0)
  const [read, setRead] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => backend.loadArcArticleInventory(arcId))
      .then(result => {
        if (cancelled) return
        const ready = result?.state === 'ready' && Array.isArray(result.articles)
        setRead({ backend, arcId, attempt, state: ready ? 'ready' : 'unavailable', articles: ready ? result.articles : [] })
      })
      .catch(() => {
        if (!cancelled) setRead({ backend, arcId, attempt, state: 'unavailable', articles: [] })
      })
    return () => { cancelled = true }
  }, [backend, arcId, attempt])
  const current = read?.backend === backend && read?.arcId === arcId && read?.attempt === attempt
  return {
    state: current ? read.state : 'loading',
    articles: current ? read.articles : [],
    retry: () => setAttempt(value => value + 1),
  }
}
