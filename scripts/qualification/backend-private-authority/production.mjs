// Fixed source-only production gate. No caller policy, root, callback or loader.
import { open } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseCanonicalJson } from './canonical.mjs'

const EXPECTED_REGISTRY = '{"acceptedCheckpointStoreBinding":null,"acceptedClockBinding":null,"acceptedRevocationBinding":null,"acceptedRoots":[],"status":"unbound","version":"qik-production-trust-registry-1"}'
const REFUSED = Object.freeze({ code: 'TRUST_ROOT_UNBOUND', cryptographicValid: false,
  contextValid: false, trusted: false, liveAuthorized: false })
const unavailable = code => Object.freeze({ ready: false, code, acceptedRootCount: 0,
  trustedClockBound: false, revocationDeliveryBound: false, durableCheckpointBound: false,
  authorizePhase: () => Object.freeze({ ...REFUSED, code }) })

export async function loadProductionAuthorityVerifier() {
  if (arguments.length !== 0) return unavailable('PRODUCTION_LOADER_INPUT_REFUSED')
  let handle
  try {
    const expected = Buffer.from(`${EXPECTED_REGISTRY}\n`, 'utf8')
    handle = await open(new URL('./trust-registry.json', import.meta.url), 'r')
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size !== expected.length) return unavailable('PRODUCTION_REGISTRY_DRIFT_REFUSED')
    // Bounded read even if the file changes after stat; never read caller paths.
    const buffer = Buffer.alloc(expected.length + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead !== expected.length) return unavailable('PRODUCTION_REGISTRY_DRIFT_REFUSED')
    const bytes = buffer.subarray(0, bytesRead)
    if (!bytes.equals(expected)) return unavailable('PRODUCTION_REGISTRY_DRIFT_REFUSED')
    const registry = parseCanonicalJson(bytes.toString('utf8').slice(0, -1))
    if (registry.acceptedRoots.length !== 0 || registry.status !== 'unbound')
      return unavailable('PRODUCTION_REGISTRY_DRIFT_REFUSED')
    // This hash covers PUBLIC source only. It does not establish root governance.
    const publicRegistrySourceSha256 = createHash('sha256').update(bytes).digest('hex')
    return Object.freeze({ ...unavailable('TRUST_ROOT_UNBOUND'), publicRegistrySourceSha256 })
  } catch {
    return unavailable('PRODUCTION_REGISTRY_UNAVAILABLE')
  } finally {
    if (handle) await handle.close().catch(() => {})
  }
}

// Only the exact empty source registry above is recognized.
export const PRODUCTION_TRUST_STATUS = 'EMPTY_UNBOUND'
