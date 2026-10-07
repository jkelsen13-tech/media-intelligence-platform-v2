// Import-only bridge SOURCE. Production activation is unavailable. No CLI run,
// caller-selected executable/module, connection URL, SQL, or callback is accepted.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { exactKeys } from '../backend-live-rehearsal/inert.mjs'
import { bindHostInert as bindInert } from './inert.mjs'
import { loadHeldSource, loadFixedProductionAuthority, assertFixedIntegrationSources } from './source.mjs'
import { FixedPrivatePipe } from './private-pipe.mjs'

// A trusted runtime/immutable artifact/clock/private credential provider binding
// has not been issued. This is a factual deployment gate, not a caller option.
const PRODUCTION_RUNTIME_BOUND = false
// Independent of the empty authority registry and any future accepted roots.
// The Oct 7 provider evidence does not confirm the managed server-side trust
// interface required by the original frozen dblink package. This fixed HOLD
// requires reviewed source changes to reconsider; no caller value can lift it.
const PROVIDER_REFUSAL_CODE = 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD'
const PROVIDER_POLICY_LOCK_SHA256 = '75210834f32f6ebe6dbc21ac24601b5c953d9956b6b83e78d0a9914b5807373c'
const PYTHON = '/usr/bin/python3'
const LIBPQ = '/usr/lib/x86_64-linux-gnu/libpq.so.5.17'
const workerPath = new URL('./private_worker.py', import.meta.url).pathname
const clientPath = new URL('../backend-private-client/libpq17.py', import.meta.url).pathname
const bootstrap = session => `import importlib.util,sys\nspec=importlib.util.spec_from_file_location('qik_private_worker',${JSON.stringify(workerPath)})\nworker=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(worker)\nworker.serve_private_pipe(sys.stdin.buffer,sys.stdout.buffer,${JSON.stringify(session)})\n`
const refusal = code => Object.freeze({ code, liveAuthorized: false, childSpawned: false })

async function loadFixedProviderCapability() {
  // Fixed public JSON only: no policy script, dynamic import, callback, provider
  // probe, credential or caller-selected path/configuration is consumed.
  const lockUrl = new URL('../backend-provider-policy/source-lock.json', import.meta.url)
  const contractUrl = new URL('../backend-provider-policy/evidence-contract.json', import.meta.url)
  const sha = bytes => createHash('sha256').update(bytes).digest('hex')
  try {
    const lockBytes = await readFile(lockUrl)
    if (sha(lockBytes) !== PROVIDER_POLICY_LOCK_SHA256) throw new Error()
    const lock = JSON.parse(lockBytes.toString('utf8'))
    if (!exactKeys(lock, ['version', 'sources']) || lock.version !== 'qik-provider-capability-source-lock-1'
      || !exactKeys(lock.sources, ['evidence-contract.json'])) throw new Error()
    const pin = lock.sources['evidence-contract.json']
    if (!exactKeys(pin, ['bytes', 'sha256']) || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1
      || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw new Error()
    const bytes = await readFile(contractUrl)
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256) throw new Error()
    const contract = JSON.parse(bytes.toString('utf8'))
    if (contract.version !== 'qik-provider-capability-policy-1' || contract.status !== 'HOLD'
      || contract.refusalCode !== PROVIDER_REFUSAL_CODE || contract.inspectionOnly !== true
      || contract.liveAuthorized !== false || contract.productionActivationAvailable !== false) throw new Error()
    if (!isDeepStrictEqual(await readFile(lockUrl), lockBytes)
      || !isDeepStrictEqual(await readFile(contractUrl), bytes)) throw new Error()
    const freeze = value => {
      if (value && typeof value === 'object') {
        for (const item of Object.values(value)) freeze(item)
        Object.freeze(value)
      }
      return value
    }
    return freeze(contract)
  } catch { throw new Error('PROVIDER_POLICY_SOURCE_DRIFT') }
}

async function requireFixedProviderCapability() {
  await loadFixedProviderCapability()
  throw new Error(PROVIDER_REFUSAL_CODE)
}

export async function inspectPrivateBridgeGate(options = {}) {
  const bound = bindInert(options, 'PRIVATE_BRIDGE_INPUT_REFUSED')
  if (!exactKeys(bound, []) && !exactKeys(bound, ['claims'])) throw new Error('PRIVATE_BRIDGE_INPUT_REFUSED')
  await loadHeldSource()
  const providerCapability = await loadFixedProviderCapability()
  if (providerCapability.status === 'HOLD') return Object.freeze({ ...refusal(PROVIDER_REFUSAL_CODE), providerCapability })
  // Retain the independent authority/runtime gates below. A future provider
  // revision must review this fixed HOLD as well as satisfy all existing gates.
  const authority = await loadFixedProductionAuthority()
  if (authority.ready !== true || typeof authority.authorizePhase !== 'function') return refusal(authority.code ?? 'PRODUCTION_AUTHORITY_UNAVAILABLE')
  const authorization = await authority.authorizePhase()
  if (authorization?.trusted !== true || authorization?.liveAuthorized !== true) return refusal(authorization?.code ?? 'PRODUCTION_AUTHORITY_UNAVAILABLE')
  if (!PRODUCTION_RUNTIME_BOUND) return refusal('APPROVED_PRIVATE_HOST_RUNTIME_UNBOUND')
  // There is deliberately no promotion or launcher in this inspection API.
  return refusal('OPERATIONAL_ACTIVATION_UNAVAILABLE')
}

// Future trusted host boundary only, with fixed authority loaded internally.
// No caller callback or supplied "all claims true" value satisfies these gates.
// Kept private until actual runtime and private provider bindings are reviewed.
async function authorizeFixedPhase(held, reviewedSourceHashes, context, phase, recovery) {
  await requireFixedProviderCapability()
  const authority = await loadFixedProductionAuthority()
  if (authority.ready !== true || typeof authority.authorizePhase !== 'function') throw new Error(authority.code ?? 'PRODUCTION_AUTHORITY_UNAVAILABLE')
  const runtimeHashes = await loadFixedRuntimeHashes()
  const authorization = await authority.authorizePhase({ artifact: held.artifact, reviewedSourceHashes,
    runtimeHashes, context, phase, recovery })
  if (authorization?.trusted !== true || authorization?.liveAuthorized !== true) throw new Error(authorization?.code ?? 'PRODUCTION_AUTHORITY_UNAVAILABLE')
  // These observations must originate at the accepted fixed verifier. Candidate
  // cryptographic checks and caller-populated claims cannot enter this function.
  if (authorization.immutableArtifactBound !== true || authorization.trustedClockBound !== true
    || authorization.privateRuntimeBound !== true || !isDeepStrictEqual(authorization.artifact, held.artifact)
    || !isDeepStrictEqual(authorization.reviewedSourceHashes, reviewedSourceHashes)
    || !isDeepStrictEqual(authorization.runtimeHashes, runtimeHashes)) throw new Error('PRODUCTION_ARTIFACT_RUNTIME_BINDING_UNAVAILABLE')
  return authorization
}

async function loadFixedRuntimeHashes() {
  await requireFixedProviderCapability()
  // Public executable/library fingerprints only. These are observations, never
  // immutable-deployment attestation, trusted clock provenance or approval.
  const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex')
  return Object.freeze({ nodeExecutableSha256: await sha(process.execPath),
    pythonExecutableSha256: await sha(PYTHON), libpqLibrarySha256: await sha(LIBPQ) })
}

async function loadFixedNativeHashes(held) {
  await assertFixedIntegrationSources('native')
  const transport = await readFile(clientPath)
  const inventory = await readFile(new URL('../backend-private-client/frozen-inventory.json', import.meta.url))
  const frozenLock = await readFile(new URL('../backend-live-rehearsal/source-lock.json', import.meta.url))
  const sha = bytes => createHash('sha256').update(bytes).digest('hex')
  return Object.freeze({ sourceLock: sha(frozenLock), transportInventory: sha(inventory), transport: sha(transport),
    ...Object.fromEntries(held.artifact.frozenSourcePins.map(pin => [pin.name, pin.sha256])) })
}

async function launchFixedPrivateWorker(held, reviewedSourceHashes, context, session, recovery) {
  await requireFixedProviderCapability()
  await authorizeFixedPhase(held, reviewedSourceHashes, context, `connect_${session}`, recovery)
  if (!PRODUCTION_RUNTIME_BOUND) throw new Error('APPROVED_PRIVATE_HOST_RUNTIME_UNBOUND')
  // Exact interpreter/native library/source hashes and immutable deployment must
  // be authority-bound before this point. Local fingerprints alone are inadequate.
  const worker = await readFile(workerPath), client = await readFile(clientPath)
  const workerHash = createHash('sha256').update(worker).digest('hex')
  if (workerHash !== held.artifact.hostSources['private_worker.py'].sha256
    || createHash('sha256').update(client).digest('hex') !== reviewedSourceHashes.transport
    || !isDeepStrictEqual(await loadFixedNativeHashes(held), reviewedSourceHashes)) throw new Error('HOST_SOURCE_DRIFT')
  const child = spawn(PYTHON, ['-I', '-S', '-c', bootstrap(session)], {
    shell: false, cwd: '/', env: { LANG: 'C', LC_ALL: 'C' }, stdio: ['pipe', 'pipe', 'ignore'],
  })
  return new FixedPrivatePipe(child)
}

// No accepted private credential handoff issuer/route exists today. The function
// accepts no callback, path, environment variable, account, or claimed credential.
// A future trusted host must bind an actual issuer and inherited memory/pipe route
// whose evidence is verified by the fixed production verifier before a secret read.
async function takeFixedPrivateCredentialHandoff() {
  await requireFixedProviderCapability()
  throw new Error('ACCEPTED_PRIVATE_HANDOFF_ISSUER_AND_ROUTE_UNBOUND')
}

// Internal production port SOURCE, called only by the private controller wiring.
// Two workers isolate the verifier from the primary's pending request and socket.
// Fixed provider HOLD refuses BEFORE authority/hash/handoff/spawn/connect;
// the independent empty registry and all existing safety gates remain in source.
export async function createFixedProductionPort() {
  if (arguments.length !== 0) throw new Error('PRIVATE_BRIDGE_INPUT_REFUSED')
  const held = await loadHeldSource()
  await requireFixedProviderCapability()
  const authority = await loadFixedProductionAuthority()
  if (authority.ready !== true) throw new Error(authority.code ?? 'PRODUCTION_AUTHORITY_UNAVAILABLE')
  const hashes = await loadFixedNativeHashes(held)
  await authorizeFixedPhase(held, hashes, null, 'private_handoff', false)
  if (!PRODUCTION_RUNTIME_BOUND) throw new Error('APPROVED_PRIVATE_HOST_RUNTIME_UNBOUND')
  const handoff = await takeFixedPrivateCredentialHandoff()
  const primary = await launchFixedPrivateWorker(held, hashes, handoff.authorizationContext, 'primary', false)
  let verifier = null, primaryUsable = true, primaryContext = null
  try {
    const connected = await primary.request('connect_primary', { reviewedSourceHashes: hashes, privateFields: handoff.primary })
    primaryContext = bindInert(connected.context, 'PRIVATE_CONTEXT_REFUSED')
  } catch {
    primary.finish(); handoff.verifier = null; handoff.authorizationContext = null
    throw new Error('PRIVATE_CONNECTION_REFUSED')
  } finally { handoff.primary = null }
  return Object.freeze({
    budgets: Object.freeze({ command: 12000, operation: 12000, rollback: 12000, verification: 12000, cancelDrain: 16000 }),
    approvedCaPath: handoff.approvedCaPath, primaryContext, productionAuthorized: true,
    authorityBasis: 'FIXED ACCEPTED PRODUCTION VERIFIER; CURRENTLY UNAVAILABLE',
    async authorize(phase, recovery) {
      await authorizeFixedPhase(held, hashes, handoff.authorizationContext, phase.commandId, recovery)
    },
    primaryUsable: () => primaryUsable,
    async execute(phase, parameters) {
      const fixed = [...held.bundle.successPath, ...held.bundle.failurePath].find(p => p.commandId === phase.commandId)
      if (!fixed || !isDeepStrictEqual(fixed.submission, phase.submission)) throw new Error('HOST_SOURCE_DRIFT')
      const independent = phase.session.startsWith('distinct')
      const pipe = independent ? verifier : primary
      if (!pipe) throw new Error('PRIVATE_PIPE_UNAVAILABLE')
      try {
        return await pipe.request('execute', { session: independent ? 'verifier' : 'primary', commandId: phase.commandId, parameters })
      } catch (error) {
        // A command refusal requires drain; socket failure makes primary unusable.
        if (!independent && error?.message === 'PRIVATE_PIPE_UNAVAILABLE') primaryUsable = false
        throw new Error('COMMAND_FAILED')
      }
    },
    async cancelAndDrain() {
      // An outer host timeout can occur while Python is still inside native
      // execute. A serial pipe cannot dispatch a cancel behind that request.
      // Terminate the uncertain primary; no rollback is queued, no ACK inferred.
      // The separate verifier worker remains independent and UNKNOWN persists.
      if (primary.hasPending) { primaryUsable = false; primary.finish(); throw new Error('COMPLETION_UNCERTAIN') }
      try { return await primary.request('cancel_and_drain') }
      catch { if (primary.closed) primaryUsable = false; throw new Error('COMPLETION_UNCERTAIN') }
    },
    async openVerifier() {
      if (verifier) throw new Error('DISTINCT_VERIFIER_REUSE_REFUSED')
      verifier = await launchFixedPrivateWorker(held, hashes, handoff.authorizationContext, 'verifier', true)
      try {
        const connected = await verifier.request('connect_verifier', { reviewedSourceHashes: hashes, privateFields: handoff.verifier })
        return bindInert(connected.context, 'PRIVATE_CONTEXT_REFUSED')
      } catch {
        verifier.finish(); throw new Error('PRIVATE_VERIFIER_CONNECTION_REFUSED')
      } finally { handoff.verifier = null }
    },
    async finish() { handoff.verifier = null; handoff.authorizationContext = null; verifier?.finish(); primary.finish() },
    evidence: () => ({ privateBaselineBindingChecks: null, parameterBindingsChecked: null }),
  })
}
