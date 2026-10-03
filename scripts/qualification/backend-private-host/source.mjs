// Public source inspection only. Local hash equality is never execution approval.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { buildSubmissionBundle, inspectPackage } from '../backend-live-rehearsal/package.mjs'
import { exactKeys } from '../backend-live-rehearsal/inert.mjs'
import { bindHostInert as bindInert } from './inert.mjs'

export const FROZEN675_HEAD = '675654be5a778c3173e682c4013031cb7796ed36'
export const HOST_VERSION = 'qik-private-host-source-1'
const HOST_PATHS = ['source.mjs', 'controller.mjs', 'closed-fixture.mjs', 'bridge.mjs', 'private_worker.py', 'inspect.mjs', 'inert.mjs', 'private-pipe.mjs', 'integration-lock.json']
const INTEGRATION_PATHS = ['../backend-private-client/libpq17.py', '../backend-private-client/frozen-inventory.json',
  '../backend-private-authority/canonical.mjs', '../backend-private-authority/contract.mjs',
  '../backend-private-authority/verifier.mjs', '../backend-private-authority/production.mjs',
  '../backend-private-authority/inspect.mjs', '../backend-private-authority/trust-registry.json']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const freeze = value => {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value) }
  return value
}
const refuse = code => { throw new Error(code) }

export async function loadHeldSource() {
  const lockBytes = await readFile(new URL('./artifact-lock.json', import.meta.url))
  let lock
  try { lock = JSON.parse(lockBytes.toString('utf8')) } catch { refuse('HOST_SOURCE_LOCK_REFUSED') }
  if (!exactKeys(lock, ['version', 'frozen675Head', 'sources']) || lock.version !== HOST_VERSION
    || lock.frozen675Head !== FROZEN675_HEAD || !exactKeys(lock.sources, HOST_PATHS)) refuse('HOST_SOURCE_LOCK_REFUSED')
  const sources = {}
  for (const path of HOST_PATHS) {
    const pin = lock.sources[path]
    if (!exactKeys(pin, ['bytes', 'sha256']) || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1
      || !/^[a-f0-9]{64}$/.test(pin.sha256)) refuse('HOST_SOURCE_LOCK_REFUSED')
    const bytes = await readFile(new URL(path, import.meta.url))
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256) refuse('HOST_SOURCE_DRIFT')
    sources[path] = bytes
  }
  // The frozen package validates its complete existing lock before resolving SQL.
  const inventory = await inspectPackage()
  const bundle = bindInert(await buildSubmissionBundle(), 'HOST_BUNDLE_REFUSED')
  if (bundle.executableLivePackage !== false || bundle.noLiveExecutionAPI !== true
    || bundle.sourceLockSha256 !== inventory.sourceLock.sha256) refuse('HOST_BUNDLE_REFUSED')
  const held = freeze({ bundle, artifact: {
    version: HOST_VERSION, frozen675Head: FROZEN675_HEAD, hostLockSha256: sha(lockBytes),
    hostSources: lock.sources, frozenSourceLockSha256: inventory.sourceLock.sha256,
    frozenSourcePins: inventory.publicSources,
    integrationSources: parseIntegrationLock(sources['integration-lock.json']).sources,
  } })
  // A second read detects ordinary file changes during loading; this does not
  // establish immutable interpreter/filesystem deployment or a trusted approval.
  if (!isDeepStrictEqual(await readFile(new URL('./artifact-lock.json', import.meta.url)), lockBytes)) refuse('HOST_SOURCE_DRIFT')
  for (const path of HOST_PATHS) {
    if (!isDeepStrictEqual(await readFile(new URL(path, import.meta.url)), sources[path])) refuse('HOST_SOURCE_DRIFT')
  }
  return held
}

function parseIntegrationLock(bytes) {
  let lock
  try { lock = JSON.parse(bytes.toString('utf8')) } catch { refuse('INTEGRATION_SOURCE_LOCK_REFUSED') }
  if (!exactKeys(lock, ['version', 'sources']) || lock.version !== 'qik-private-host-integration-lock-1'
    || !exactKeys(lock.sources, INTEGRATION_PATHS)) refuse('INTEGRATION_SOURCE_LOCK_REFUSED')
  for (const pin of Object.values(lock.sources)) {
    if (!exactKeys(pin, ['bytes', 'sha256']) || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1
      || !/^[a-f0-9]{64}$/.test(pin.sha256)) refuse('INTEGRATION_SOURCE_LOCK_REFUSED')
  }
  return lock
}

export async function assertFixedIntegrationSources(kind) {
  if (!['authority', 'native'].includes(kind)) refuse('INTEGRATION_SOURCE_LOCK_REFUSED')
  const held = await loadHeldSource()
  for (const [path, pin] of Object.entries(held.artifact.integrationSources)) {
    if (path.includes(kind === 'native' ? '/backend-private-client/' : '/backend-private-authority/')) {
      const bytes = await readFile(new URL(path, import.meta.url))
      if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256) refuse('INTEGRATION_SOURCE_DRIFT')
    }
  }
}

export async function loadFixedProductionAuthority() {
  try {
    // Fixed peer byte pins are checked BEFORE its code is imported. Source pins
    // still require an external approved immutable host binding to confer trust.
    await assertFixedIntegrationSources('authority')
    const { loadProductionAuthorityVerifier } = await import('../backend-private-authority/production.mjs')
    return await loadProductionAuthorityVerifier()
  } catch { return Object.freeze({ ready: false, code: 'AUTHORITY_SOURCE_UNAVAILABLE' }) }
}

export async function inspectPrivateHost(options = {}) {
  const bound = bindInert(options, 'HOST_INSPECTION_REFUSED')
  if (!exactKeys(bound, []) && !exactKeys(bound, ['claims'])) refuse('HOST_INSPECTION_REFUSED')
  const held = await loadHeldSource()
  const authority = await loadFixedProductionAuthority()
  return freeze({ version: HOST_VERSION, mode: 'source-only-offline-inspection', networkMode: 'none',
    sourceControllerPresent: true, privatePipeBridgeSourcePresent: true, nativePg17Qualified: false,
    liveReady: false, productionActivationAvailable: false, childSpawned: false,
    sourceIntegrity: 'MATCHES_LOCAL_LOCK', sourceReviewApproved: false,
    authorityCode: authority.code ?? 'PRODUCTION_AUTHORITY_UNAVAILABLE', claimsCanAuthorize: false,
    artifact: held.artifact,
    successCommandIds: held.bundle.successPath.map(phase => phase.commandId),
    failureCommandIds: held.bundle.failurePath.map(phase => phase.commandId),
    remainingBindings: ['accepted production issuer/root policy and revocation delivery',
      'trusted host clock and approved runtime/immutable artifact binding',
      'qualified native PG17 private connections and distinct verifier',
      'actual provider, TLS, CA, log privacy, baseline and execution-window evidence'],
  })
}
