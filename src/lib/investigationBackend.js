import { createInvestigationWorkspaceClient } from './investigationWorkspaceClient.js'
import { createInvestigationEvidenceChecksClient } from './investigationEvidenceChecksClient.js'
import { createInvestigationEvidenceReviewsClient } from './investigationEvidenceReviewsClient.js'
import { createInvestigationInputImpactClient } from './investigationInputImpactClient.js'
import { createInvestigationSourceSpansClient } from './investigationSourceSpansClient.js'

const ROUTES = new Map([
  ['investigation-workspace', 'workspace'],
  ['investigation-evidence-checks', 'checks'],
  ['investigation-evidence-reviews', 'reviews'],
  ['investigation-input-impact', 'input-impact'],
  ['investigation-source-spans', 'source-spans'],
])

// Keep existing domain contracts and response validation behind one transport.
// The SDK supplies the current session for every call; no token is captured.
export function createInvestigationBackend(supabase) {
  const transport = supabase?.functions?.invoke ? { functions: { invoke(name, options) {
    const route = ROUTES.get(name)
    if (!route) throw new Error('unsupported_investigation_route')
    return supabase.functions.invoke(`investigation-api/${route}`, options)
  } } } : null
  return Object.freeze({
    workspace: createInvestigationWorkspaceClient(transport),
    checks: createInvestigationEvidenceChecksClient(transport),
    reviews: createInvestigationEvidenceReviewsClient(transport),
    inputImpact: createInvestigationInputImpactClient(transport),
    sourceSpans: createInvestigationSourceSpansClient(transport),
  })
}
