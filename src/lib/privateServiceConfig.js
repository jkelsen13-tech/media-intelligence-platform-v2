import { PRIVATE_SERVICE_ENDPOINT_POLICY } from './privateServiceEndpointPolicy.js'
import { V2_SUPABASE_URL } from './supabaseOrigin.js'

// Configuration only. No network, credentials, storage, URL overrides or fallback.
// Runtime transports independently reject redirects and re-check session lifetime.
function endpoint(raw, approved) {
  if (typeof raw !== 'string' || !Array.isArray(approved) || !approved.includes(raw)) return null
  try {
    const url = new URL(raw)
    if (url.href !== raw || url.origin !== V2_SUPABASE_URL || url.protocol !== 'https:' ||
        url.username || url.password || url.search || url.hash ||
        !/^\/functions\/v1\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)) return null
    return raw
  } catch { return null }
}

// approved is a source-controlled release policy, never derived from Vite/user input.
// An explicit argument exists for isolated tests; normal boot uses the empty policy.
export function resolvePrivateServiceConfig(env = {}, approved = PRIVATE_SERVICE_ENDPOINT_POLICY) {
  return Object.freeze({
    hypothesisEndpoint: endpoint(env?.VITE_HYPOTHESIS_ENDPOINT, approved?.hypothesisEndpoint),
    privateMarketsEndpoint: endpoint(env?.VITE_PRIVATE_MARKETS_ENDPOINT, approved?.privateMarketsEndpoint),
  })
}
