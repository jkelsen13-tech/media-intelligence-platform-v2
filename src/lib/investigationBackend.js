import { createInvestigationFollowingClient } from './investigationFollowingClient.js'
import { createStoryFollowingBackend } from './storyFollowingClient.js'
import { createInvestigationSelectiveIntakeClient } from './investigationSelectiveIntakeClient.js'
import { createInvestigationWorkspaceClient } from './investigationWorkspaceClient.js'
import { createInvestigationEvidenceChecksClient } from './investigationEvidenceChecksClient.js'
import { createInvestigationEvidenceReviewsClient } from './investigationEvidenceReviewsClient.js'
import { createInvestigationInputImpactClient } from './investigationInputImpactClient.js'
import { createInvestigationSourceSpansClient } from './investigationSourceSpansClient.js'

const ROUTES = new Map([
  ['investigation-workspace', 'workspace'],
  ['investigation-following', 'following'],
  ['investigation-selective-intake', 'selective-intake'],
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
  const followingCall = transport ? async (action, input, { expectedUserId } = {}) => {
    try {
      const result = await transport.functions.invoke('investigation-following', { body: { action, input }, ...(expectedUserId ? { headers: { 'X-MIP-Expected-User': expectedUserId } } : {}) })
      if (result.error) {
        let detail
        try { detail = await result.error.context?.json() } catch { /* fixed code only */ }
        const code = result.error.context?.status === 401 ? 'authentication_required' : detail?.error?.code
        return { data: null, error: { code: ['authentication_required','access_denied','version_conflict','invalid_request'].includes(code) ? code : 'service_unavailable' } }
      }
      return { data: result.data?.data ?? null, error: result.data?.error ?? null }
    } catch { return { data: null, error: { code: 'service_unavailable' } } }
  } : null
  return Object.freeze({
    workspace: createInvestigationWorkspaceClient(transport),
    following: createInvestigationFollowingClient({ call: followingCall }),
    storyFollowing: createStoryFollowingBackend(supabase),
    selectiveIntake: createInvestigationSelectiveIntakeClient(transport),
    checks: createInvestigationEvidenceChecksClient(transport),
    reviews: createInvestigationEvidenceReviewsClient(transport),
    inputImpact: createInvestigationInputImpactClient(transport),
    sourceSpans: createInvestigationSourceSpansClient(transport),
  })
}
