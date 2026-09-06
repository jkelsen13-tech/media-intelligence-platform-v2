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
  INVESTIGATION_WORKSPACE_CONTRACT,
  investigationWorkspacePanels,
  resolveWorkspaceExcerpt,
} from '../src/lib/investigationWorkspaceClient.js'
import {
  COMPARISON_MODE_COPY,
  captureReviewPayload,
  catalogRequestKey,
  createRequestGate,
  mergeCatalogItems,
  privateInvestigationHeader,
  readRequestKey,
  statusFromSession,
  WORKSPACE_STATUS,
} from '../src/lib/investigationWorkspaceSession.js'
import {
  createLocalInvestigationWorkspaceClient,
  deferred,
  FIXTURE_BUNDLES,
  FIXTURE_IDS,
  FIXTURE_USER,
  previewAuthFor,
  readInvestigationWorkspacePreview,
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
  outfile: join(compiledDir, 'PrivateInvestigationWorkspace.mjs'),
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
const { default: PrivateInvestigationWorkspace, PrivateInvestigationInspector } = await import(join(compiledDir, 'PrivateInvestigationWorkspace.mjs'))

const APP = readFileSync(join(repoRoot, 'src/App.jsx'), 'utf8')
const CLIENT = readFileSync(join(repoRoot, 'src/lib/investigationWorkspaceClient.js'), 'utf8')
const HOOK = readFileSync(join(repoRoot, 'src/lib/usePrivateInvestigationWorkspace.js'), 'utf8')
const UI = readFileSync(join(repoRoot, 'src/components/PrivateInvestigationWorkspace.jsx'), 'utf8')
const FIXTURES = readFileSync(join(repoRoot, 'src/lib/investigationWorkspaceFixtures.js'), 'utf8')

const MANIFEST = [
  ['supabase/migrations/20260906075718_investigation_workspace_batch_v1.sql', '2ccf5dbf106ecef8fb589f4c9d824056dde130bc1b5ffc3a3ab6d0b154986647'],
  ['supabase/tests/investigation_workspace_smoke.sql', '80c41b1f982834cddb135d6c3fc2951992d9e6f5a9b4228364f501e05659bff0'],
  ['supabase/functions/investigation-workspace/index.ts', 'ccd35f53c99b5dbddd71cf1cb74bcd93890af12c6a788c26817c52f47ec15d9f'],
  ['supabase/functions/investigation-workspace/handler.mjs', '6d3c5e311476fe850498c64c2c534464db2a0c600e4a84eca0dda8a48b6748cd'],
  ['src/lib/investigationWorkspaceClient.js', '1183da6e8a62fbb374c03a8075de5f39e464ef61383f4e85200ccaca17d93865'],
  ['tests/investigationWorkspace.test.mjs', '4b72608f227ea94b2c87b587417a6fc648afd922e7b87570d995cb11289dadae'],
  ['docs/INVESTIGATION_WORKSPACE_BLUEPRINT_2026-09-06.md', 'fd5476e2d56dbe645fc3634669f969790c403296bacb3b65f4785b91e757dcb2'],
  ['docs/INVESTIGATION_WORKSPACE_FRONTEND_2026-09-06.md', 'f4eaa8493540ad61783c6645c93977b9492849a34e5f5844ebc9541a059342d1'],
  ['verifier/investigation_workspace_batch_2026-09-06.json', '9e5d664a99d752b3e382e1b038a6494ef36acd0155fc5d84bfb93aa666dfea68'],
]

function sha256(path) {
  return createHash('sha256').update(readFileSync(join(repoRoot, path))).digest('hex')
}

function readyWorkspace(bundle = FIXTURE_BUNDLES.comparable, extras = {}) {
  const panels = investigationWorkspacePanels(bundle)
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
      selectedVersionId: null,
      bundle,
      panels,
      bundleError: null,
      beforeBundles: {},
      inspector: null,
      pendingReview: null,
      reviewBusy: false,
      reviewError: null,
      reviewConflict: false,
      activeSection: 'overview',
      loadingCatalog: false,
      loadingBundle: false,
      ...extras,
    },
    actions: {
      refresh() {},
      loadMore() {},
      selectInvestigation() {},
      selectVersion() {},
      markReviewed() {},
      retryReview() {},
      openBeforeVersion() {},
      setInspector() {},
      setActiveSection() {},
      clearPrivateState() {},
    },
  }
}

function renderWorkspace(workspace, extra = {}) {
  return renderToStaticMarkup(createElement(PrivateInvestigationWorkspace, {
    workspace,
    accountUiAvailable: true,
    onSignIn() {},
    ...extra,
  }))
}

test('supplied investigation workspace source checksums remain unchanged', () => {
  for (const [path, expected] of MANIFEST) {
    assert.equal(sha256(path), expected, path)
  }
})

test('five connected sections render from one local fixture bundle', () => {
  const html = renderWorkspace(readyWorkspace())
  assert.match(html, /Overview/)
  assert.match(html, /What Changed/)
  assert.match(html, /Hypotheses/)
  assert.match(html, /Commitments/)
  assert.match(html, /Evidence Gaps/)
  assert.match(html, /Local visual fixture: what retained evidence/)
  assert.match(html, /The commitment may remain unimplemented/)
  assert.match(html, /A synthetic commitment/)
  assert.match(html, /Fixture collection/)
  assert.match(html, /inspector overflow testing/)
  assert.match(html, /No overall answer or confidence score is manufactured/)
  assert.match(html, /Alternatives may coexist/)
  assert.match(html, /No follow-up found in the declared collection/)
  assert.match(html, /not proof of no activity/)
  assert.match(html, /not proof of causality/)
  assert.match(html, /analyst declarations/)
  assert.match(html, /No winning explanation is selected/)
  assert.match(html, /not proof of causality or a winning explanation/)
  assert.doesNotMatch(html, /confidence score 8/)
  assert.doesNotMatch(html, /contenteditable|textarea|hypothesis editor|assignment editor/i)
})

test('signed-out and unassigned states stay honest', () => {
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
    },
    actions: readyWorkspace().actions,
  })
  assert.match(signedOut, /Sign in to read assigned investigations/)
  assert.match(signedOut, /does not create an assignment/)
  assert.doesNotMatch(signedOut, /Local visual fixture: what retained evidence/)

  const empty = renderWorkspace({
    status: WORKSPACE_STATUS.empty,
    sessionLoading: false,
    state: {
      catalog: [],
      bundle: null,
      panels: null,
      beforeBundles: {},
      inspector: null,
      pendingReview: null,
      activeSection: 'overview',
    },
    actions: readyWorkspace().actions,
  })
  assert.match(empty, /No investigations assigned to this account yet/)
  assert.doesNotMatch(empty, /live backend/)
  assert.doesNotMatch(empty, /No sample cards/)
})

test('empty sections do not claim disproof, completeness or zero uncertainty', () => {
  const html = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.empty))
  assert.match(html, /No hypotheses recorded/)
  assert.match(html, /Empty does not mean these explanations were disproven/)
  assert.match(html, /No commitments recorded/)
  assert.match(html, /No collection declarations recorded/)
})

test('access denial does not reveal whether an identifier exists', () => {
  const html = renderWorkspace({
    status: WORKSPACE_STATUS.access_denied,
    sessionLoading: false,
    state: {
      catalog: [],
      selectedInvestigationId: FIXTURE_IDS.denied,
      bundle: null,
      panels: null,
      beforeBundles: {},
      inspector: null,
      pendingReview: null,
      bundleError: 'access_denied',
      activeSection: 'overview',
    },
    actions: readyWorkspace().actions,
  })
  assert.match(html, /This investigation is unavailable/)
  assert.match(html, /does not say whether that identifier exists/)
  assert.doesNotMatch(html, /Local visual fixture: what retained evidence/)
})

test('exact Unicode citations keep bigint positions as strings', () => {
  const bundle = FIXTURE_BUNDLES.comparable
  const reference = bundle.version.state.hypotheses[0].evidence[0]
  const resolved = resolveWorkspaceExcerpt(bundle, reference)
  assert.equal(reference.position, '9007199254740993')
  assert.equal(typeof reference.position, 'string')
  assert.equal(resolved.excerpt, 'A report.')
  assert.equal(resolved.before, '💡 ')
  assert.equal(resolveWorkspaceExcerpt(bundle, { ...reference, span_start: 3, span_end: 12 }), null)
  const html = renderWorkspace(readyWorkspace())
  assert.match(html, /Position 9007199254740993/)
  assert.match(html, /Exact quotation checks source binding/)
})

test('historical and changed-scope comparison modes keep their distinct copy', () => {
  const historical = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.historical))
  assert.match(historical, new RegExp(COMPARISON_MODE_COPY.historical_before_review.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(historical, /cannot mark an earlier version reviewed/)
  assert.doesNotMatch(historical, /Mark this displayed version reviewed/)

  const scope = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.scope))
  assert.match(scope, /Evidence comparison is unavailable because the candidate scope differs/)
  assert.match(scope, /scope updated/)
})

test('explicit review captures one payload and retries it; conflicts require a new decision', async () => {
  const payloads = []
  let failOnce = true
  let conflictNext = false
  const client = createLocalInvestigationWorkspaceClient({
    markResults(payload) {
      payloads.push({ ...payload })
      if (conflictNext) return { data: null, error: { code: 'version_conflict' } }
      if (failOnce) {
        failOnce = false
        return { data: null, error: { code: 'request_failed' } }
      }
      return {
        data: {
          id: payload.receiptId,
          investigation_id: payload.investigationId,
          version_id: payload.versionId,
          previous_receipt_id: payload.previousReceiptId,
          recorded_at: '2026-09-06T08:00:00Z',
        },
        error: null,
      }
    },
  })
  const first = captureReviewPayload({
    investigationId: FIXTURE_IDS.comparable,
    versionId: FIXTURE_BUNDLES.comparable.version.id,
    previousReceiptId: FIXTURE_BUNDLES.comparable.review.id,
    receiptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
  })
  const failed = await client.markReviewed(first)
  assert.equal(failed.error.code, 'request_failed')
  const retried = await client.markReviewed(first)
  assert.equal(retried.error, null)
  assert.equal(payloads[0].receiptId, payloads[1].receiptId)
  assert.equal(payloads[0].versionId, payloads[1].versionId)
  conflictNext = true
  const conflicted = await client.markReviewed(first)
  assert.equal(conflicted.error.code, 'version_conflict')

  const conflictHtml = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.comparable, {
    reviewConflict: true,
    reviewError: 'version_conflict',
  }))
  assert.match(conflictHtml, /The review baseline changed/)
  assert.match(conflictHtml, /not silently acknowledged/)
})

test('account and selection races discard late responses from prior keys', async () => {
  const gate = createRequestGate()
  const slow = deferred()
  const client = createLocalInvestigationWorkspaceClient({
    pendingReads: { [`${FIXTURE_IDS.comparable}:head`]: slow },
  })
  const first = gate.start(readRequestKey('user-a', FIXTURE_IDS.comparable))
  const pending = client.read(FIXTURE_IDS.comparable)
  const second = gate.start(readRequestKey('user-b', FIXTURE_IDS.empty))
  slow.resolve({ data: FIXTURE_BUNDLES.comparable, error: null })
  const late = await pending
  assert.equal(gate.isCurrent(first), false)
  assert.equal(gate.isCurrent(second), true)
  assert.equal(late.data.investigation_id, FIXTURE_IDS.comparable)
  assert.equal(catalogRequestKey('user-a'), 'catalog:user-a:')
  assert.deepEqual(
    mergeCatalogItems(
      [{ investigation_id: FIXTURE_IDS.comparable }],
      [{ investigation_id: FIXTURE_IDS.comparable }, { investigation_id: FIXTURE_IDS.empty }],
    ).map((item) => item.investigation_id),
    [FIXTURE_IDS.comparable, FIXTURE_IDS.empty],
  )
})

test('unsupported contract and transport failure stay unavailable without fixture fallback', () => {
  const unsupported = renderWorkspace({
    status: WORKSPACE_STATUS.unsupported_contract,
    sessionLoading: false,
    state: {
      catalog: [],
      bundle: FIXTURE_BUNDLES.unsupported,
      panels: null,
      bundleError: 'unsupported_contract',
      beforeBundles: {},
      inspector: null,
      pendingReview: null,
      activeSection: 'overview',
    },
    actions: readyWorkspace().actions,
  })
  assert.match(unsupported, /contract is not supported/)
  assert.match(unsupported, /not guessed/)

  const unavailable = renderWorkspace({
    status: WORKSPACE_STATUS.unavailable,
    sessionLoading: false,
    state: {
      catalog: [],
      bundle: null,
      panels: null,
      bundleError: 'service_unavailable',
      beforeBundles: {},
      inspector: null,
      pendingReview: null,
      activeSection: 'overview',
    },
    actions: readyWorkspace().actions,
  })
  assert.match(unavailable, /unavailable right now/)
  assert.doesNotMatch(unavailable, /fixture records/)
  assert.doesNotMatch(unavailable, /GitHub Pages/)
})

test('viewer markup has no review button; inspector shares version and review state', () => {
  const viewer = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.viewer))
  assert.doesNotMatch(viewer, /Mark this displayed version reviewed/)
  assert.match(viewer, /Marking reviewed is limited to reviewers/)
  const inspector = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: readyWorkspace(),
    publicNode: null,
  }))
  assert.match(inspector, /Revision 2 · current saved version/)
  assert.match(inspector, /Receipt recorded/)
  assert.match(inspector, /Public graph view is unavailable/)
})

test('App memoizes the production client and never stores private workspace text', () => {
  assert.match(APP, /usePrivateInvestigationWorkspace/)
  assert.match(APP, /createInvestigationWorkspaceClient/)
  assert.match(APP, /useMemo\(\s*\(\)\s*=>\s*createInvestigationWorkspaceClient\(supabase\)/)
  assert.match(APP, /PrivateInvestigationWorkspace/)
  assert.match(APP, /useAuthSession/)
  assert.match(APP, /PRIVATE_INVESTIGATION_VIEW/)
  assert.match(HOOK, /clearPrivateState/)
  assert.match(HOOK, /pendingReview/)
  assert.match(HOOK, /version_conflict/)
  assert.match(HOOK, /receiptId: randomUUID/)
  assert.doesNotMatch(HOOK, /localStorage|indexedDB|sessionStorage/)
  assert.doesNotMatch(UI, /localStorage|indexedDB/)
  assert.doesNotMatch(CLIENT, /localStorage/)
  assert.match(APP, /import\.meta\.env\.DEV/)
  assert.match(FIXTURES, /env\?\.DEV !== true/)
  assert.equal(readInvestigationWorkspacePreview('?privateInvestigationFixture=populated', { DEV: false }), null)
  assert.equal(previewAuthFor('signed-out').user, null)
})

test('private investigation header stays question-centered and does not invent confidence', () => {
  const header = privateInvestigationHeader({
    status: WORKSPACE_STATUS.ready,
    panels: investigationWorkspacePanels(FIXTURE_BUNDLES.comparable),
    bundle: FIXTURE_BUNDLES.comparable,
    userId: FIXTURE_USER.id,
  })
  assert.equal(header.title, FIXTURE_BUNDLES.comparable.version.state.question)
  assert.match(header.location, /Assigned investigation/)
  assert.equal(header.dimensions.some((dim) => /confidence/i.test(dim.value)), false)
  assert.equal(investigationWorkspacePanels({ contract_version: 'other' }), null)
  assert.equal(statusFromSession({ sessionLoading: true, userId: null, state: {} }), WORKSPACE_STATUS.session_loading)
  assert.equal(INVESTIGATION_WORKSPACE_CONTRACT, 'investigation-workspace-1')
})

test('toolbar and empty copy stay user-facing without deployment jargon', () => {
  const html = renderWorkspace(readyWorkspace())
  assert.match(html, /Only investigations assigned to this account appear/)
  assert.doesNotMatch(html, /UUID paging/)
  assert.doesNotMatch(html, /frozen catalog/)
})

test('history controls and evidence drilldown exist without hypothesis excerpts', () => {
  const comparable = renderWorkspace(readyWorkspace())
  assert.match(comparable, /data-action="open-compared-version"/)
  assert.match(comparable, /data-action="inspect-compared-records"/)
  assert.match(comparable, /data-action="inspect-evidence-change"/)
  assert.match(comparable, /data-action="mark-reviewed"/)
  assert.doesNotMatch(comparable, /Open the before version/)

  const evidenceOnly = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.evidenceOnly))
  assert.match(evidenceOnly, /data-action="open-compared-version"/)
  assert.match(evidenceOnly, /data-action="inspect-evidence-change"/)
  assert.match(evidenceOnly, /data-action="inspect-removed-record"/)
  assert.match(evidenceOnly, /Position 9007199254740993/)
  assert.doesNotMatch(evidenceOnly, /The commitment may remain unimplemented/)

  const historical = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.historical, {
    selectedVersionId: FIXTURE_BUNDLES.historical.version.id,
  }))
  assert.match(historical, /data-action="show-current-version"/)
  assert.doesNotMatch(historical, /data-action="open-compared-version"/)
})

test('inspector masks leftover private bundle when access is denied', () => {
  const inspector = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: {
      ...readyWorkspace(),
      status: WORKSPACE_STATUS.access_denied,
    },
    publicNode: null,
  }))
  assert.match(inspector, /This investigation is unavailable/)
  assert.doesNotMatch(inspector, /Local visual fixture: what retained evidence/)
  assert.doesNotMatch(inspector, /Revision 2 · current saved version/)
})
