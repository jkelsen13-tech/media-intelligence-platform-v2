// Offline source inventory; no candidate signed material is accepted or printed.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { loadProductionAuthorityVerifier } from './production.mjs'

const SOURCE_FILES = ['canonical.mjs', 'contract.mjs', 'verifier.mjs', 'production.mjs', 'trust-registry.json', 'inspect.mjs']
if (process.argv.length !== 3 || process.argv[2] !== '--inspect') {
  process.stdout.write(JSON.stringify({ code: 'OFFLINE_INSPECTION_ONLY', liveAuthorized: false }) + '\n')
  process.exitCode = 2
} else {
  try {
    const authority = await loadProductionAuthorityVerifier()
    const publicSources = await Promise.all(SOURCE_FILES.map(async name => {
      const bytes = await readFile(new URL(name, import.meta.url))
      return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    }))
    process.stdout.write(JSON.stringify({ mode: 'source-only-offline', code: authority.code,
      acceptedRootCount: authority.acceptedRootCount, cryptographicImplementation: 'ED25519_CANDIDATE_SOURCE_ONLY',
      trusted: false, liveAuthorized: false, publicSources }) + '\n')
  } catch {
    process.stdout.write(JSON.stringify({ code: 'SOURCE_INSPECTION_REFUSED', liveAuthorized: false }) + '\n')
    process.exitCode = 2
  }
}
