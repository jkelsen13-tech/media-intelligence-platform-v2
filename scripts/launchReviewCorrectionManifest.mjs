import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildStoryFollowingManifest } from './storyFollowingManifest.mjs'

const root = new URL('../', import.meta.url)
const previousPath = 'verifier/investigation-api-launch-gates-2026-10-02.json'
const target = 'verifier/investigation-api-review-corrections-2026-10-02.json'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

// Emit a chronological current package. Historical receipts/manifests are
// inputs retained verbatim, never refreshed to claim they tested new bytes.
export async function buildLaunchReviewCorrectionManifest() {
  const historical = await readFile(new URL(previousPath, root))
  const previous = JSON.parse(historical)
  const current = await buildStoryFollowingManifest()
  const gatewayUnchanged = JSON.stringify(current.files) === JSON.stringify(previous.files)
  if (!gatewayUnchanged) throw new Error('gateway tree changed; new runtime qualification required')
  const frontendPaths = [...new Set([...current.frontend_files.map(entry => entry.path),
    'src/App.jsx', 'src/views/NewsView.jsx', 'src/views/NewsStoryReader.jsx',
    'src/lib/reviewedPublicVersion.js', 'src/lib/reviewedPublicVersionBackend.js',
    'src/lib/worldViewSelectedCardViewport.js', 'src/lib/worldViewBillboardLayout.js',
    'src/lib/worldViewBillboardPresentation.js', 'src/lib/worldViewCesiumEllipsoidRendererAdapter.js',
    'src/styles/world-view-billboard-prototype.css'])]
  return {
    ...current,
    previous_manifests: [...current.previous_manifests,
      { path: previousPath, sha256: digest(historical), status: 'preserved' }],
    frontend_files: await Promise.all(frontendPaths.map(async path =>
      ({ path, sha256: digest(await readFile(new URL(path, root))) }))),
    gateway_runtime_evidence: {
      gateway_files_byte_identical_to_previous_manifest: gatewayUnchanged,
      previous_manifest: previousPath,
      qualification: 'retained offline module evidence applies only to identical gateway bytes; no hosted runtime or deployment claim',
    },
    story_following: {
      ...current.story_following,
      completeness_helper: 'mip_private.public_story_material_history_is_complete(uuid,uuid)',
      history_scope: 'incomplete authorized material history withholds derived urgency; hidden declarations expose no content, identity or count',
    },
    deployment_verification: 'Corrected source candidate only. SQL, transient installer authority, gateway/readers and source activation remain unapplied; target installation/Auth/account/device/release gates are distinct.',
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await buildLaunchReviewCorrectionManifest()
  await writeFile(new URL(target, root), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Created ${target}: ${manifest.files.length} unchanged gateway dependencies`)
}
