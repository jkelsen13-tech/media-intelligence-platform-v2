import { createWorkspaceHandler, createWorkspaceTransport } from '../investigation-workspace/handler.mjs'
import { createEvidenceChecksHandler, createEvidenceChecksTransport } from '../investigation-evidence-checks/handler.mjs'
import { createEvidenceReviewsHandler, createEvidenceReviewsTransport } from '../investigation-evidence-reviews/handler.mjs'
import { createInputImpactHandler } from '../investigation-input-impact/handler.mjs'
import { createSourceSpansHandler } from '../investigation-source-spans/handler.mjs'

export const INVESTIGATION_API_CONTRACT = 'investigation-api-1'

// One entry point, dispatching directly to the existing domain handlers. No
// HTTP fan-out, arbitrary RPC proxy, response cache, or automatic retry.
export function createInvestigationApiHandler({ authenticate, workspaceRpc, checksRpc, reviewsRpc,
  allowedOrigins = ['https://jkelsen13-tech.github.io'] }) {
  const common = { authenticate, allowedOrigins }
  const workspace = { ...common, rpc: workspaceRpc }
  const routes = new Map([
    ['workspace', createWorkspaceHandler(workspace)],
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
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' }
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
  const workspace = createWorkspaceTransport(options)
  return { authenticate: workspace.authenticate, workspaceRpc: workspace.rpc,
    checksRpc: createEvidenceChecksTransport(options).rpc,
    reviewsRpc: createEvidenceReviewsTransport(options).rpc }
}
