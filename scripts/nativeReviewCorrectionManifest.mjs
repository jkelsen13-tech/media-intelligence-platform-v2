import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildLaunchReviewCorrectionManifest } from './launchReviewCorrectionManifest.mjs'

const root = new URL('../', import.meta.url)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const identity = async path => ({ path, sha256: digest(await readFile(new URL(path, root))) })
const previous = Object.freeze([
  { path: 'verifier/investigation-api-native-responsive-2026-10-02.json', sha256: '5aaa25efd1d77374427d59cb96d13d1969e559d4c7d15c4c6bbd07f6a8ad503d' },
  { path: 'docs/MIP_NATIVE_RESPONSIVE_SOURCE_2026-10-02.json', sha256: '3d438efbc9aa6342e0ad98a8d7a16e01a44f1eb4011f9132060f2174c9923b7e' },
])
const gatewayTarget = 'verifier/investigation-api-native-review-corrections-2026-10-02.json'
const sourceTarget = 'docs/MIP_NATIVE_REVIEW_CORRECTIONS_SOURCE_2026-10-02.json'
const addedPaths = [
  'scripts/nativeReviewCorrectionManifest.mjs',
  'docs/MIP_NATIVE_REVIEW_CORRECTIONS_2026-10-02.md',
  'tests/worldViewNativeRgbOuterTeardown.test.mjs',
  'tests/helpers/worldViewNativeRgbOuterFixture.mjs',
  'tests/worldViewNativeRgbRetirement.test.mjs',
  'docs/world-view-native-outer-teardown-repair-2026-10-02.md',
  'tests/worldViewNativeDisclosureLifecycle.test.mjs',
  'tests/helpers/worldViewNativeDisclosureFixture.mjs',
  'docs/MIP_NATIVE_DISCLOSURE_CLEAR_2026-10-02.md',
  'tests/worldViewNativeOwnerExceptionSafety.test.mjs',
  'docs/world-view-native-owner-exception-repair-2026-10-02.md',
  'tests/worldViewNativeFenceFallback.test.mjs',
  'tests/helpers/worldViewNativeFenceFallbackFixture.mjs',
  'docs/MIP_NATIVE_FENCE_ATLAS_FALLBACK_2026-10-02.md',
]

// Preserve the reviewed historical candidate's bindings. New source identities
// belong to this successor; passing old CI is not its qualification receipt.
export async function buildNativeReviewCorrectionManifest() {
  const historical = []
  for (const entry of previous) {
    const bytes = await readFile(new URL(entry.path, root))
    if (digest(bytes) !== entry.sha256) throw Error('historical native source binding changed')
    historical.push(JSON.parse(bytes))
  }
  const [previousGateway, previousSource] = historical
  const current = await buildLaunchReviewCorrectionManifest()
  if (JSON.stringify(current.files) !== JSON.stringify(previousGateway.files))
    throw Error('gateway dependency bytes changed; inherited gateway evidence does not apply')
  for (const entry of current.sql_source_proposals)
    if (!previousGateway.sql_source_proposals.some(old => old.path === entry.path && old.sha256 === entry.sha256))
      throw Error('SQL proposal changed; inherited installation evidence does not apply')
  const frontendPaths = [...new Set([...current.frontend_files.map(entry => entry.path),
    ...previousGateway.frontend_files.map(entry => entry.path)])].sort()
  const gateway = {
    ...current,
    previous_manifests: [...current.previous_manifests, previous[0]],
    frontend_files: await Promise.all(frontendPaths.map(identity)),
    gateway_runtime_evidence: {
      gateway_files_byte_identical_to_previous_manifest: true,
      previous_manifest: previous[0].path,
      qualification: 'Retained gateway evidence applies only to identical gateway bytes. Changed frontend lifecycle needs independent qualification; no hosted runtime or installation claim.',
    },
    deployment_verification: 'Native cleanup and mounted source-disclosure source successor only. Source admission, protected installation, real accounts, physical devices, appearance and release remain separate unapplied gates.',
  }
  await writeFile(new URL(gatewayTarget, root), JSON.stringify(gateway, null, 2) + '\n')
  const paths = [...new Set([...previousSource.sources.map(entry => entry.path), ...addedPaths, gatewayTarget])].sort()
  const source = {
    contract: 'mip-native-review-correction-source-v1', date: '2026-10-02',
    status: 'CURRENT_SOURCE_BINDING_NOT_A_QUALIFICATION_RECEIPT', live_operations: 0,
    qualified_ancestor: previousSource.qualified_ancestor,
    reviewed_predecessor: {
      head: '67b638df3e1f8afe690368e4765604f454da6961', tree: '36d3ad4d7eb1f397c4001a3dd5e6e2f5d686c7c3',
      verdict: 'REPAIR_REQUIRED', ci_tests_each_runtime: 2539,
    },
    previous_manifests: previous,
    sources: await Promise.all(paths.map(identity)),
    unchanged_installation_qualification: previousSource.unchanged_installation_qualification,
    inherited_installation_scope: previousSource.inherited_installation_scope,
    changed_scope: 'Production native/facade cleanup ownership and retry, exception-safe App owner retirement, mounted Map/Graph source-disclosure lifecycle, fixed-reason Atlas fallback, baseline capture wording.',
    authority: 'No new publication, source admission, provider billing, protected installation, live rehearsal, merge, deployment or release authority.',
  }
  await writeFile(new URL(sourceTarget, root), JSON.stringify(source, null, 2) + '\n')
  return { gatewayTarget, sourceTarget, sourceCount: source.sources.length }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await buildNativeReviewCorrectionManifest()))
