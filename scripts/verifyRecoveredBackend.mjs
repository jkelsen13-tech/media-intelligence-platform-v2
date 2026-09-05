import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runArcMembershipRegressionSuite } from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js'
import { runMembershipRegressionSuite } from '../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/source-comparison-run/lib.js'

// Offline verification only. These recovered deployment snapshots are not
// imported by the frontend or installed as active Edge Functions.
const root = fileURLToPath(new URL('../', import.meta.url))
const prefix = 'verifier/recovered-functions/2026-09-05/'
const manifest = JSON.parse(await readFile(path.join(root, prefix, 'manifest.json'), 'utf8'))
const seen = new Set()
for (const entry of manifest) {
  assert(entry.path.startsWith(prefix) && !entry.path.split('/').includes('..'), 'snapshot path outside recovery directory')
  assert(!seen.has(entry.path), 'duplicate snapshot path')
  seen.add(entry.path)
  const bytes = await readFile(path.join(root, entry.path))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `snapshot checksum mismatch: ${entry.path}`)
}
const algorithms = [
  ['arc', runArcMembershipRegressionSuite()],
  ['source_comparison', runMembershipRegressionSuite()],
].map(([algorithm, result]) => {
  assert.equal(result.passed, true, `${algorithm}: recovered regression suite failed`)
  for (const fixture of result.fixtures) {
    assert.equal(fixture.passed, true, fixture.fixture)
    assert.equal(fixture.result.eligible_for_auto_approval, false, `${fixture.fixture}: default-deny gate failed`)
  }
  return { algorithm, passed: result.passed, fixtures: result.fixtures.map(f => ({ name: f.fixture, passed: f.passed, auto_approval: f.result.eligible_for_auto_approval })) }
})
console.log(JSON.stringify({ snapshot_files_verified: seen.size, algorithms, database_writes: 0, production_readiness: 'not established by fixture tests' }, null, 2))
