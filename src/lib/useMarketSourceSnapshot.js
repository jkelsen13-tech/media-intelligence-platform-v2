import { useEffect, useState } from 'react'
import { createMarketSourceLookup } from './marketSourceLookup.js'
import { marketInstant } from '../../supabase/functions/_shared/marketsEvidenceContract.mjs'

// The current session/client owner provides the reader. Supplied snapshots are
// explicit backend-owner/test seams, not request payloads or publication flags.
export function useMarketSourceSnapshot({ supplied = null, reader = null, active = false,
  actorId = null, sessionReady = true, at = null } = {}) {
  const scope = JSON.stringify([actorId, at])
  const [loaded, setLoaded] = useState(null)
  useEffect(() => {
    if (supplied !== null || !sessionReady) { setLoaded(null); return }
    if (!active || typeof reader?.loadDirectory !== 'function') {
      setLoaded(previous => previous?.reader === reader && previous.scope === scope ? previous : null)
      return
    }
    let cancelled = false
    setLoaded({ reader, scope, status: 'loading', snapshot: null })
    Promise.resolve().then(() => cancelled ? null : reader.loadDirectory({ at })).then(result => {
      if (cancelled) return
      const source = createMarketSourceLookup(result?.snapshot)
      const valid = result?.status === 'available' && source.status === 'available'
        && (at === null || marketInstant(source.validAt) === marketInstant(at))
      setLoaded({ reader, scope, status: valid ? 'available' : 'unavailable', snapshot: valid ? result.snapshot : null })
    }).catch(() => {
      if (!cancelled) setLoaded({ reader, scope, status: 'unavailable', snapshot: null })
    })
    return () => { cancelled = true }
  }, [supplied, reader, active, scope, sessionReady])
  if (supplied !== null) return { status: createMarketSourceLookup(supplied).status, snapshot: supplied }
  if (!sessionReady) return { status: 'unavailable', snapshot: null }
  if (loaded?.reader === reader && loaded.scope === scope) return { status: loaded.status, snapshot: loaded.snapshot }
  // A render for another actor/clock/client cannot flash the prior snapshot
  // before effects run. Pending IDs remain hints until the reader qualifies them.
  return { status: active && typeof reader?.loadDirectory === 'function' ? 'loading' : 'unavailable', snapshot: null }
}
