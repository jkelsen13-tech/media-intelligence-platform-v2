import { marketInstant } from '../../supabase/functions/_shared/marketsEvidenceContract.mjs'
import { createMarketSourceLookup } from './marketSourceLookup.js'
import { validateMarketsPublicDirectory } from '../../supabase/functions/_shared/marketsDirectoryContract.mjs'

export const MARKETS_SOURCE_RPC = 'read_markets_source_directory_v1'
const MAX_PROJECTION_BYTES = 2 * 1024 * 1024
const unavailable = reason => Object.freeze({ status: 'unavailable', reason, snapshot: null })
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

// Bound to the current session's installed client. The RPC owner must authorize
// and project retained typed identities, paths and excerpt rights. This transport
// cannot publish private assessments or treat response flags as authorization.
// Construction, null clients and invalid clocks perform no request.
export function createMarketsBackend(supabaseClient = null) {
  return Object.freeze({
    async loadDirectory({ at = null } = {}) {
      if (at !== null && marketInstant(at) === null) return unavailable('inspection_time_unavailable')
      if (typeof supabaseClient?.rpc !== 'function') return unavailable('client_not_configured')
      let response, timer
      const controller = new AbortController()
      try {
        const request = supabaseClient.rpc(MARKETS_SOURCE_RPC, { p_at: at })
        if (typeof request?.abortSignal !== 'function') return unavailable('directory_reader_unavailable')
        const deadline = new Promise(resolve => {
          timer = setTimeout(() => { resolve({ timedOut: true }); controller.abort() }, 15000)
        })
        response = await Promise.race([request.abortSignal(controller.signal), deadline])
        if (response?.timedOut === true) return unavailable('directory_request_timeout')
      } catch { return unavailable('directory_request_failed') }
      finally { if (timer !== undefined) clearTimeout(timer) }
      if (response?.error) return unavailable('directory_reader_unavailable')
      if (response?.data == null || response.data.status === 'unavailable') return unavailable('directory_unavailable')
      let snapshot
      try {
        const encoded = JSON.stringify(response.data)
        if (!encoded || new TextEncoder().encode(encoded).length > MAX_PROJECTION_BYTES) return unavailable('directory_invalid')
        snapshot = JSON.parse(encoded)
      } catch { return unavailable('directory_invalid') }
      const admitted = validateMarketsPublicDirectory(snapshot)
      if (admitted.status !== 'available') return unavailable('directory_invalid')
      snapshot = admitted.snapshot
      const source = createMarketSourceLookup(snapshot)
      if (source.status !== 'available') return unavailable('directory_invalid')
      if (at !== null && marketInstant(source.validAt) !== marketInstant(at)) return unavailable('inspection_scope_mismatch')
      return freeze({ status: 'available', reason: null, snapshot })
    },
  })
}
