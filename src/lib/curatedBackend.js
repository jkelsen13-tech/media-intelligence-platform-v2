import { loadPhase3BetaFlag, loadPhase3BetaView } from './phase3ReadPath.js'

// Curated legal/policy records retain the browser client's role and beta gate.
export function createCuratedBackend(supabaseClient = null) {
  const options = Object.freeze({ supabaseClient })
  return Object.freeze({
    loadPhase3BetaFlag: () => loadPhase3BetaFlag(options),
    loadPhase3BetaView: () => loadPhase3BetaView(options),
  })
}
