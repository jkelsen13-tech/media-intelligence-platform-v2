import { createFollowingHandler } from '../../source-proposals/investigationFollowingHandler.mjs'
import { createSelectiveIntakeHandler } from '../../source-proposals/investigationSelectiveIntakeHandler.mjs'
import { createWorkspaceHandler, createWorkspaceTransport } from '../investigation-workspace/handler.mjs'
import { createEvidenceChecksHandler, createEvidenceChecksTransport } from '../investigation-evidence-checks/handler.mjs'
import { createEvidenceReviewsHandler, createEvidenceReviewsTransport } from '../investigation-evidence-reviews/handler.mjs'
import { createInputImpactHandler } from '../investigation-input-impact/handler.mjs'
import { createSourceSpansHandler } from '../investigation-source-spans/handler.mjs'

export const INVESTIGATION_API_CONTRACT = 'investigation-api-1'

// One entry point, dispatching directly to the existing domain handlers. No
// HTTP fan-out, arbitrary RPC proxy, response cache, or automatic retry.
export function createInvestigationApiHandler({ authenticate, workspaceRpc, checksRpc, reviewsRpc, followingRpc, selectiveIntakeRpc,
  allowedOrigins = ['https://jkelsen13-tech.github.io'] }) {
  const common = { authenticate, allowedOrigins }
  const workspace = { ...common, rpc: workspaceRpc }
  const routes = new Map([
    ['workspace', createWorkspaceHandler(workspace)],
    ['following', createFollowingHandler({ ...common, rpc: followingRpc ?? (async () => ({ error: { code: 'not_configured' } })) })],
    ['selective-intake', createSelectiveIntakeHandler({ ...common, workspaceRpc,
      rpc: selectiveIntakeRpc ?? (async () => ({ error: { code: 'not_configured' } })) })],
    ['checks', createEvidenceChecksHandler({ ...common, rpc: checksRpc })],
    ['reviews', createEvidenceReviewsHandler({ ...common, rpc: reviewsRpc })],
    ['input-impact', createInputImpactHandler(workspace)],
    ['source-spans', createSourceSpansHandler(workspace)],
  ])
  return async request => {
    const url = new URL(request.url), origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', Vary: 'Origin',
      'X-MIP-Backend': INVESTIGATION_API_CONTRACT,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-mip-expected-user' }
    if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status, code) => new Response(JSON.stringify({ error: { code } }), { status, headers })
    if (origin && !allowedOrigins.includes(origin)) return reply(403, 'origin_denied')
    const path = /^\/(?:functions\/v1\/)?investigation-api\/([a-z-]+)$/.exec(url.pathname)
    const handler = path && !url.search ? routes.get(path[1]) : null
    if (!handler) return reply(404, 'route_not_found')
    try {
      // Forward the original stream: each domain retains its own byte limits,
      // schema validation, verified user injection and assignment enforcement.
      const response = await handler(request)
      const responseHeaders = new Headers(response.headers)
      responseHeaders.set('X-MIP-Backend', INVESTIGATION_API_CONTRACT)
      return new Response(response.body, { status: response.status, headers: responseHeaders })
    } catch { return reply(503, 'service_unavailable') }
  }
}

export function createInvestigationApiTransport(options) {
  const fetchImpl = options.fetchImpl ?? fetch
  const rpcPaths = new Set([
    'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/mip_investigation_workspace_v1',
    'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/mip_investigation_following_v1',
    'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/mip_investigation_selective_intake_v1',
    'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/mip_investigation_evidence_checks_v1',
    'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1/rpc/mip_investigation_evidence_reviews_v1',
  ])
  const transportOptions = { ...options, fetchImpl: (url, init) => {
    // Historical domain handlers remain unchanged. Strip only their invalid
    // opaque-key bearer header on the fixed server RPCs, never user Auth headers.
    if (rpcPaths.has(url) && options.serviceKey?.startsWith('sb_secret_')
      && init?.headers?.apikey === options.serviceKey
      && init.headers.Authorization === `Bearer ${options.serviceKey}`) {
      const headers = { ...init.headers }
      delete headers.Authorization
      return fetchImpl(url, { ...init, headers })
    }
    return fetchImpl(url, init)
  } }
  const workspace = createWorkspaceTransport(transportOptions)
  const followingRpc = async (action, input) => {
    // The existing workspace transport validated this same origin and credentials.
    const response = await transportOptions.fetchImpl(new URL('/rest/v1/rpc/mip_investigation_following_v1', options.url).href, {
      method: 'POST', headers: { apikey: options.serviceKey, Authorization: `Bearer ${options.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: action, p_input: input }), redirect: 'error', signal: AbortSignal.timeout(15000),
    })
    const data = await response.json()
    return response.ok ? { data } : { error: data }
  }
  const selectiveIntakeRpc = async (action, input) => {
    // Use the same validated origin, bounded server call and opaque-key boundary.
    const response = await transportOptions.fetchImpl(new URL('/rest/v1/rpc/mip_investigation_selective_intake_v1', options.url).href, {
      method: 'POST', headers: { apikey: options.serviceKey, Authorization: `Bearer ${options.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: action, p_input: input }), redirect: 'error', signal: AbortSignal.timeout(15000),
    })
    const data = await response.json()
    return response.ok ? { data } : { error: data }
  }
  return { authenticate: workspace.authenticate, workspaceRpc: workspace.rpc, followingRpc, selectiveIntakeRpc,
    checksRpc: createEvidenceChecksTransport(transportOptions).rpc,
    reviewsRpc: createEvidenceReviewsTransport(transportOptions).rpc }
}
