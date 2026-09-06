import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  investigationEvidenceCheckPanels,
} from '../src/lib/investigationEvidenceChecksClient.js'
import { resolveWorkspaceExcerpt } from '../src/lib/investigationWorkspaceClient.js'
import {
  INVESTIGATION_WORKSPACE_PANELS,
  challengeCueCopy,
  checksRequestKey,
  lineageReasonCopy,
  resolveWorkspaceMetadata,
  safeWorkspaceHttpUrl,
  WORKSPACE_STATUS,
} from '../src/lib/investigationWorkspaceSession.js'
import { investigationWorkspacePanels } from '../src/lib/investigationWorkspaceClient.js'
import {
  FIXTURE_BUNDLES,
  FIXTURE_CHECKS,
  FIXTURE_CHECKS_REPORT_ID,
  FIXTURE_IDS,
  FIXTURE_UNICODE_CUE_SPAN,
  FIXTURE_USER,
  fixtureEvidenceChecks,
} from '../src/lib/investigationWorkspaceFixtures.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const viteRequire = createRequire(createRequire(import.meta.url).resolve('vite/package.json'))
const esbuild = viteRequire('esbuild')
const compiledDir = join(here, '.compiled')
mkdirSync(compiledDir, { recursive: true })
await esbuild.build({
  absWorkingDir: repoRoot,
  entryPoints: ['src/components/PrivateInvestigationWorkspace.jsx'],
  outfile: join(compiledDir, 'PrivateInvestigationWorkspace.evidence-checks.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  plugins: [{
    name: 'skip-css',
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}\n', loader: 'js' }))
    },
  }],
})
const { default: PrivateInvestigationWorkspace, PrivateInvestigationInspector } = await import(
  join(compiledDir, 'PrivateInvestigationWorkspace.evidence-checks.mjs')
)

const APP = readFileSync(join(repoRoot, 'src/App.jsx'), 'utf8')
const MANIFEST = [
  ['docs/INVESTIGATION_EVIDENCE_CHECKS_BACKEND_2026-09-06.md', '9ffa1264ba93a731df0024ea175347f42eae5e19105c631ea91bc7098b0b4ab3'],
  ['docs/INVESTIGATION_EVIDENCE_CHECKS_FRONTEND_2026-09-06.md', '48355b1c0156fbd392d53fa9a218e5b801e59fb923d11db133a3287802d1ac01'],
  ['src/lib/investigationEvidenceChecksClient.js', '3c2ed4ff0b1edbbabc4ae02bf367f45e86172fd91331c01540bacf0a115e8826'],
  ['supabase/functions/investigation-evidence-checks/index.ts', 'f40c56a8eac98c4af6014d38d9423e4592556f2cf718049b0fabf051be5c8a1f'],
  ['supabase/functions/investigation-evidence-checks/handler.mjs', '14c8d7d39d09b59498a76712086d26ac5a4c2086db7bd3f67c3d20ec1b26be10'],
  ['supabase/migrations/20260906100018_investigation_evidence_checks_v1.sql', 'cebe2b7c67d18c7c268e6b810e207eef4b112df023e8981c0e5010446944479a'],
  ['supabase/tests/investigation_evidence_checks_smoke.sql', 'f8d735fd9eef03866b42348b69f4a1acb7959b9923d1bb0ea1ac6e633b6ec628'],
  ['tests/investigationEvidenceChecks.test.mjs', '6e35dad632a64d67e6fdc77e74da65773d87dbd2c088c9e09461007671b47a34'],
  ['verifier/investigation_evidence_checks_2026-09-06.json', 'b7647a4dac3516ad41cde6335db8ed132ee5c95a2155b76b2df034660ea0d331'],
]

function sha256(path) {
  return createHash('sha256').update(readFileSync(join(repoRoot, path))).digest('hex')
}

function readyWorkspace(bundle = FIXTURE_BUNDLES.comparable, extras = {}) {
  const panels = investigationWorkspacePanels(bundle)
  const checks = extras.checks ?? FIXTURE_CHECKS.comparable
  const checksPanels = extras.checksPanels ?? investigationEvidenceCheckPanels(bundle, checks)
  return {
    status: WORKSPACE_STATUS.ready,
    sessionLoading: false,
    userId: FIXTURE_USER.id,
    state: {
      catalog: [{
        investigation_id: bundle.investigation_id,
        version_id: bundle.version.id,
        revision: bundle.version.revision,
        question: panels.question,
        access_role: bundle.access_role,
        reviewed_version_id: bundle.review?.version_id ?? null,
      }],
      hasMore: false,
      nextAfter: null,
      catalogError: null,
      selectedInvestigationId: bundle.investigation_id,
      selectedVersionId: extras.selectedVersionId ?? null,
      bundle,
      panels,
      bundleError: null,
      beforeBundles: {},
      inspector: extras.inspector ?? null,
      pendingReview: null,
      reviewBusy: false,
      reviewError: null,
      reviewConflict: false,
      activeSection: 'overview',
      loadingCatalog: false,
      loadingBundle: false,
      checks,
      checksPanels,
      checksError: extras.checksError ?? null,
      checksBusy: extras.checksBusy ?? false,
      loadingChecks: extras.loadingChecks ?? false,
      pendingChecksRun: extras.pendingChecksRun ?? null,
      ...extras.state,
    },
    actions: {
      refresh() {},
      loadMore() {},
      selectInvestigation() {},
      selectVersion() {},
      markReviewed() {},
      retryReview() {},
      runEvidenceChecks() {},
      retryChecks() {},
      openBeforeVersion() {},
      setInspector() {},
      setActiveSection() {},
      clearPrivateState() {},
    },
  }
}

function renderWorkspace(workspace) {
  return renderToStaticMarkup(createElement(PrivateInvestigationWorkspace, {
    workspace,
    accountUiAvailable: true,
    onSignIn() {},
  }))
}

test('supplied evidence-check source checksums remain unchanged', () => {
  for (const [path, expected] of MANIFEST) {
    assert.equal(sha256(path), expected, path)
  }
})

test('one saved report feeds source links, evidence checks and search coverage', () => {
  const html = renderWorkspace(readyWorkspace())
  assert.match(html, /Source Links/)
  assert.match(html, /Evidence Checks/)
  assert.match(html, /Search Coverage/)
  assert.match(html, /Possible shared-source pair/)
  assert.match(html, /Independence: unknown/)
  assert.match(html, /Direction: undetermined/)
  assert.match(html, /not necessarily syndication/)
  assert.match(html, /boilerplate or a common quotation/)
  assert.match(html, /Correction language appears/)
  assert.match(html, /Recorded source-status notices/)
  assert.match(html, /source-status notice/)
  assert.match(html, /analyst-declared collection records in Evidence Gaps/)
  assert.match(html, /External retrieval was not run/)
  assert.match(html, /Cue vocabulary: English only/)
  assert.match(html, /data-action="inspect-source-link"/)
  assert.doesNotMatch(html, /data-action="run-evidence-checks"/)
  assert.doesNotMatch(html, /evidence verified/i)
  assert.match(html, /No outlet is labeled independent/)
  assert.match(html, /not a contradiction, retraction verdict/)
  assert.equal(investigationEvidenceCheckPanels(FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparable).reportId, FIXTURE_CHECKS_REPORT_ID)
})

test('not-run and zero-result reports stay distinct, and viewers cannot run', () => {
  const notRun = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.historical, {
    checks: FIXTURE_CHECKS.historical,
    checksPanels: investigationEvidenceCheckPanels(FIXTURE_BUNDLES.historical, FIXTURE_CHECKS.historical),
    selectedVersionId: FIXTURE_BUNDLES.historical.version.id,
  }))
  assert.match(notRun, /Checks have not been run for this saved version/)
  assert.match(notRun, /data-action="run-evidence-checks"/)
  assert.match(notRun, /historical saved version/)
  assert.doesNotMatch(notRun, /No source-link candidates were found/)

  const zero = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.scope, {
    checks: FIXTURE_CHECKS.scope,
    checksPanels: investigationEvidenceCheckPanels(FIXTURE_BUNDLES.scope, FIXTURE_CHECKS.scope),
  }))
  assert.match(zero, /No source-link candidates were found/)
  assert.match(zero, /No correction, withdrawal, or recorded source-status cues were found/)
  assert.doesNotMatch(zero, /Checks have not been run for this saved version/)
  assert.doesNotMatch(zero, /data-action="run-evidence-checks"/)

  const viewer = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.viewer, {
    checks: FIXTURE_CHECKS.viewer,
    checksPanels: investigationEvidenceCheckPanels(FIXTURE_BUNDLES.viewer, FIXTURE_CHECKS.viewer),
  }))
  assert.doesNotMatch(viewer, /data-action="run-evidence-checks"/)
  assert.match(viewer, /Possible shared-source pair/)
})

test('partial scan and truncated counts stay distinct from a completed zero report', () => {
  const html = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.comparable, {
    checks: FIXTURE_CHECKS.comparablePartial,
    checksPanels: investigationEvidenceCheckPanels(FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparablePartial),
  }))
  assert.match(html, /only partially scanned/)
  assert.match(html, /250 candidate pairs were found/)
  assert.match(html, /220 cues were found/)
  assert.match(html, /Capture positions omitted from pair comparison: 101/)
  assert.doesNotMatch(html, /evidence verified/i)
})

test('Unicode cue highlighting and metadata notices resolve against the matching snapshot', () => {
  const bundle = FIXTURE_BUNDLES.comparable
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const resolved = resolveWorkspaceExcerpt(bundle, cue.reference)
  assert.equal(cue.reference.excerpt, 'correction')
  assert.equal(cue.reference.span_start, FIXTURE_UNICODE_CUE_SPAN.start)
  assert.equal(resolved.excerpt, 'correction')
  assert.match(resolved.before, /🧬/)
  assert.equal(resolveWorkspaceExcerpt(bundle, { ...cue.reference, span_start: cue.reference.span_start + 1 }), null)

  const statusCue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[1]
  const metadata = resolveWorkspaceMetadata(bundle, statusCue.metadata_reference)
  assert.equal(metadata.value, 'withdrawn')
  assert.equal(resolveWorkspaceMetadata(bundle, { ...statusCue.metadata_reference, value: 'corrected' }), null)

  const html = renderWorkspace(readyWorkspace())
  assert.match(html, /<mark>correction<\/mark>/)
  assert.match(html, /Recorded source status: withdrawn/)
})

test('unsafe locators render as text and mapper rejects mismatched investigation or observation', () => {
  const html = renderWorkspace(readyWorkspace())
  assert.match(html, /href="https:\/\/example.org\/shared-capture/)
  const inspector = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: readyWorkspace(FIXTURE_BUNDLES.comparable, {
      inspector: {
        kind: 'source-link',
        pair: {
          ...FIXTURE_CHECKS.comparable.report.result.lineage_candidates[0],
          right_position: '6',
          right_excerpt: null,
        },
      },
    }),
    publicNode: null,
  }))
  assert.match(inspector, /not opened as a link/)
  assert.match(inspector, /javascript:alert\(1\)/)
  assert.doesNotMatch(inspector, /href="javascript:/)
  assert.equal(safeWorkspaceHttpUrl('javascript:alert(1)'), null)
  assert.equal(safeWorkspaceHttpUrl('https://user:pass@example.org/x'), null)
  assert.equal(safeWorkspaceHttpUrl('https://example.org/shared-capture'), 'https://example.org/shared-capture')
  assert.equal(
    investigationEvidenceCheckPanels(
      { ...FIXTURE_BUNDLES.comparable, observation: { ...FIXTURE_BUNDLES.comparable.observation, id: '00000000-0000-4000-8000-000000000000' } },
      FIXTURE_CHECKS.comparable,
    ),
    null,
  )
  assert.equal(
    investigationEvidenceCheckPanels(FIXTURE_BUNDLES.empty, FIXTURE_CHECKS.comparable),
    null,
  )
  assert.equal(
    investigationEvidenceCheckPanels(FIXTURE_BUNDLES.comparable, fixtureEvidenceChecks('not_run', FIXTURE_BUNDLES.historical)),
    null,
  )
})

test('signed-out workspace stays empty of fixture evidence and App memoizes both clients', () => {
  const signedOut = renderWorkspace({
    status: WORKSPACE_STATUS.signed_out,
    sessionLoading: false,
    state: {
      catalog: [],
      bundle: null,
      panels: null,
      beforeBundles: {},
      inspector: null,
      pendingReview: null,
      activeSection: 'overview',
      checks: null,
      checksPanels: null,
    },
    actions: readyWorkspace().actions,
  })
  assert.match(signedOut, /Sign in to read assigned investigations/)
  assert.doesNotMatch(signedOut, /Possible shared-source pair/)
  assert.doesNotMatch(signedOut, /Local visual fixture: what retained evidence/)
  assert.match(APP, /useMemo\(\s*\(\)\s*=>\s*createInvestigationEvidenceChecksClient\(supabase\)/)
  assert.match(APP, /checksClient/)
  assert.equal(INVESTIGATION_WORKSPACE_PANELS.some((panel) => panel.id === 'source-links'), true)
  assert.match(lineageReasonCopy('identical_retained_text'), /boilerplate/)
  assert.match(challengeCueCopy('correction_language'), /not a contradiction/)
  assert.equal(checksRequestKey('u', 'i', 'v', 'o', 'run'), 'checks:run:u:i:v:o')
})

test('inspector can show two-sided witnesses and a metadata cue without fabricating offsets', () => {
  const pair = FIXTURE_CHECKS.comparable.report.result.lineage_candidates[0]
  const pairHtml = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: readyWorkspace(FIXTURE_BUNDLES.comparable, { inspector: { kind: 'source-link', pair } }),
    publicNode: null,
  }))
  assert.match(pairHtml, /Possible shared-source pair/)
  assert.match(pairHtml, /First retained capture/)
  assert.match(pairHtml, /Second retained capture/)
  assert.match(pairHtml, /Independence is unknown/)

  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[1]
  const cueHtml = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: readyWorkspace(FIXTURE_BUNDLES.comparable, {
      inspector: {
        kind: 'challenge-cue',
        cue,
        metadata: resolveWorkspaceMetadata(FIXTURE_BUNDLES.comparable, cue.metadata_reference),
      },
    }),
    publicNode: null,
  }))
  assert.match(cueHtml, /Recorded source status: withdrawn/)
  assert.doesNotMatch(cueHtml, /span_start/)
})
