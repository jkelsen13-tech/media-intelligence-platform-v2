// Remote-journal recovery wrapper. It deliberately has no filesystem or
// browser-storage fallback and never persists the current session credential.
import {runAlgorithmShadowWorker} from './worker.js'

const allowed = new Set(['shadow_claim','shadow_complete','shadow_fail'])
const copy = value => JSON.parse(JSON.stringify(value))
function validate(entry, runtime) {
  if (!entry || entry.version !== 1 || !allowed.has(entry.operation) || entry.args?.p_runtime !== runtime ||
    typeof entry.args?.p_request !== 'string' || Object.hasOwn(entry.args, 'p_session')) throw new Error('mip_shadow_recovery_binding')
}
export function durableShadowRpc({rpc, journal, runtime, session}) {
  if (!journal || typeof journal.putOnce !== 'function' || typeof journal.get !== 'function' || typeof journal.assertSecurity !== 'function')
    throw new Error('mip_remote_journal_required')
  journal.assertSecurity({access_controlled: true, encrypted_at_rest: true, lease_tokens_redacted_from_logs: true, explicit_retention_policy: true})
  return async (operation, args) => {
    if (!allowed.has(operation) || args.p_runtime !== runtime || args.p_session !== session) throw new Error('mip_shadow_recovery_binding')
    const retained = copy(args); delete retained.p_session
    const entry = {version: 1, operation, args: retained}; validate(entry, runtime)
    const key = `${operation}:${args.p_request}`
    // Exact recovery necessarily retains the lease token and completion payload.
    // The security assertion above is a host contract, not local proof; the
    // deployment gate must verify it independently against the real journal.
    await journal.putOnce(key, entry)
    const result = await rpc(operation, copy(args))
    const receipt = operation === 'shadow_claim' ? (result ? {generation_id: result.generation_id} : null) : copy(result)
    await journal.putOnce(`${key}:receipt`, {version: 1, result: receipt})
    return result
  }
}
export function runDurableAlgorithmShadowWorker(options) {
  return runAlgorithmShadowWorker({...options, rpc: durableShadowRpc(options)})
}
export async function recoverShadowRequest({rpc, journal, runtime, session, key}) {
  const entry = await journal.get(key); validate(entry, runtime)
  if (key !== `${entry.operation}:${entry.args.p_request}`) throw new Error('mip_shadow_recovery_binding')
  return durableShadowRpc({rpc, journal, runtime, session})(entry.operation, {...copy(entry.args), p_session: session})
}
