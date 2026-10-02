import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildLaunchReviewCorrectionManifest } from './launchReviewCorrectionManifest.mjs'

const root = new URL('../', import.meta.url)
const gatewayPrevious = 'verifier/investigation-api-review-corrections-2026-10-02.json'
const sourcePrevious = 'docs/MIP_WHOLE_INSTALL_SEQUENCE_SOURCE_2026-10-02.json'
const gatewayTarget = 'verifier/investigation-api-native-responsive-2026-10-02.json'
const sourceTarget = 'docs/MIP_NATIVE_RESPONSIVE_SOURCE_2026-10-02.json'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const identity = async path => ({path, sha256:digest(await readFile(new URL(path, root)))})
const productFiles = [
  'src/App.jsx', 'src/views/WorldView.jsx', 'src/views/WorldMapCanvas.jsx',
  'src/lib/worldViewRealismController.js', 'src/lib/worldViewRendererAdapter.js',
  'src/lib/worldViewCesiumEllipsoidRendererAdapter.js', 'src/lib/worldViewSourceStatus.js',
  'src/lib/worldViewBoundedRgbImagery.js', 'src/components/WorldViewExploreShell.jsx',
  'src/styles/world-view-explore.css',
]
const qualificationFiles = [
  'scripts/nativeResponsiveSuccessorManifest.mjs', 'tests/investigationApi.test.mjs',
  'tests/helpers/worldViewNativeRgbFixture.mjs', 'tests/helpers/worldViewNativeRgbMountedSessionFixture.mjs',
  'tests/worldMapCanvasRealismLifecycle.test.mjs', 'tests/worldViewBoundedRgbImagery.test.mjs',
  'tests/worldViewNativeRgbAttachment.test.mjs', 'tests/worldViewNativeRgbSession.test.mjs',
  'tests/worldViewNativeRgbMountedSession.test.mjs', 'tests/worldView500SourceAccess.test.mjs',
  'tests/worldView500Responsive.browser.mjs', 'verifier/runWorldViewNativeRgbAppBrowser.mjs',
  'verifier/qualifyWorldViewNativeRgbPixels.py', 'verifier/runWorldView500ResponsiveSyntheticBrowser.mjs',
  'docs/world-view-native-rgb-attachment-2026-10-02.md',
]

// A new chronological source binding. The qualified 19700658 manifests and
// installation receipts remain byte-identical; none is relabelled for this tree.
export async function buildNativeResponsiveSuccessorManifest() {
  const previousGatewayBytes = await readFile(new URL(gatewayPrevious, root))
  const previousSourceBytes = await readFile(new URL(sourcePrevious, root))
  const previousGateway = JSON.parse(previousGatewayBytes)
  const previousSource = JSON.parse(previousSourceBytes)
  const current = await buildLaunchReviewCorrectionManifest()
  if (JSON.stringify(current.files) !== JSON.stringify(previousGateway.files))
    throw Error('gateway dependency bytes changed; inherited runtime evidence does not apply')
  for (const entry of current.sql_source_proposals)
    if (!previousGateway.sql_source_proposals.some(old => old.path === entry.path && old.sha256 === entry.sha256))
      throw Error('SQL proposal changed; inherited installation evidence does not apply')
  const frontendPaths = [...new Set([...current.frontend_files.map(entry => entry.path), ...productFiles])].sort()
  const gateway = {
    ...current,
    previous_manifests: [...current.previous_manifests, {path:gatewayPrevious, sha256:digest(previousGatewayBytes), status:'preserved'}],
    frontend_files: await Promise.all(frontendPaths.map(identity)),
    gateway_runtime_evidence: {
      gateway_files_byte_identical_to_previous_manifest:true,
      previous_manifest:gatewayPrevious,
      qualification:'Retained gateway module evidence applies only to identical gateway bytes; new frontend source needs its own qualification. No hosted runtime or deployment claim.',
    },
    deployment_verification:'Native imagery/responsive source successor only. Genuine imagery admission and activation, SQL installation, accounts, physical devices, appearance and release remain separate unapplied gates.',
  }
  await writeFile(new URL(gatewayTarget, root), JSON.stringify(gateway,null,2)+'\n')
  const paths = [...new Set([...previousSource.sources.map(entry => entry.path),
    ...productFiles, ...qualificationFiles, gatewayTarget])].sort()
  const source = {
    contract:'mip-native-responsive-successor-source-v1', date:'2026-10-02',
    status:'CURRENT_SOURCE_BINDING_NOT_A_QUALIFICATION_RECEIPT', live_operations:0,
    qualified_ancestor:{head:'19700658c54de69e2540b2e97bda743158f9d0dc',tree:'8bab9ff302015a90edfc659c7268dca141fd20cc'},
    previous_manifests:[{path:gatewayPrevious,sha256:digest(previousGatewayBytes)},
      {path:sourcePrevious,sha256:digest(previousSourceBytes)}],
    sources:await Promise.all(paths.map(identity)),
    unchanged_installation_qualification:previousSource.qualifications,
    inherited_installation_scope:'SQL proposals are unchanged. Historical disposable SQL receipts remain bound to their original source and are not new target or successor qualification.',
    changed_scope:'Retained App native RGB attachment, account/context/native lifetime fencing, local resource accounting, 480–589 landscape reader/control/source scroll allocation.',
    authority:'Transport packet grants no permission. Actual-App received RGB proof uses simulated test admission; genuine source remains UNAPPROVED. No protected installation, source activation, provider billing, merge or deployment.',
  }
  await writeFile(new URL(sourceTarget, root), JSON.stringify(source,null,2)+'\n')
  return {gatewayTarget,sourceTarget,sourceCount:source.sources.length}
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await buildNativeResponsiveSuccessorManifest()))
