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
import {
  investigationEvidenceReviewPanels,
  EVIDENCE_REVIEW_LABELS,
} from '../src/lib/investigationEvidenceReviewsClient.js'
import { resolveWorkspaceExcerpt } from '../src/lib/investigationWorkspaceClient.js'
import { WORKSPACE_STATUS } from '../src/lib/investigationWorkspaceSession.js'
import { investigationWorkspacePanels } from '../src/lib/investigationWorkspaceClient.js'
import {
  buildSuggestedReviewDraft,
  reviewSubmissionBlockReason,
  selectedEvidenceFromDraft,
} from '../src/lib/investigationEvidenceReviewUi.js'
import {
  FIXTURE_BUNDLES,
  FIXTURE_CHECKS,
  FIXTURE_IDS,
  FIXTURE_REVIEWS,
  FIXTURE_USER,
  fixtureEvidenceReviews,
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
  outfile: join(compiledDir, 'PrivateInvestigationWorkspace.evidence-reviews.mjs'),
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
  join(compiledDir, 'PrivateInvestigationWorkspace.evidence-reviews.mjs')
)

const APP = readFileSync(join(repoRoot, 'src/App.jsx'), 'utf8')
const MANIFEST = [
  ['docs/INVESTIGATION_EVIDENCE_REVIEWS_BACKEND_2026-09-06.md', '1c4cc10d8206c28687ca091d38472161334e6fac5a953a7056aa2b66b41b463f'],
  ['docs/INVESTIGATION_EVIDENCE_REVIEWS_FRONTEND_2026-09-06.md', 'e5683cccfc9d24af78f1ba581867e64470aab57bb42716ea2f77986b742f8c20'],
  ['src/lib/investigationEvidenceReviewsClient.js', '14c6a989b7bb243969831b9e9613b62cd052ea39f5787a699db782a2470588c5'],
  ['supabase/functions/investigation-evidence-reviews/handler.mjs', '4dfde82551e33e4d23f894f2ae1876c0e7ba5e39a17243e212efa3497cb8af17'],
  ['supabase/functions/investigation-evidence-reviews/index.ts', '2bfeec8bc76c4bb968108fdb1b2e82bd29d77ac11e7c3e97db29022a3c5d0ffb'],
  ['supabase/migrations/20260906121130_investigation_evidence_reviews_v1.sql', '883bd5ea148b9b1d3d862f9e18ef5bd34066696b4ca857c27f22c5cfb65560df'],
  ['supabase/tests/investigation_evidence_reviews_smoke.sql', 'a4cc85d0ec263c56c3e4a4fc585127016a9bda0ce9278f7a93b518a5e3e56647'],
  ['tests/investigationEvidenceReviews.test.mjs', '9d9d494d8cdd39a113294cc4f35affcfad292f3ea3c6f50a4613c948791055d0'],
  ['verifier/investigation_evidence_reviews_2026-09-06.json', 'fe37ec70cbebe9672509a6b0475c7d4a4d4938196892c0f6f6f24a5a57423a94'],
]

function sha256(path) {
  return createHash('sha256').update(readFileSync(join(repoRoot, path))).digest('hex')
}

function readyWorkspace(bundle = FIXTURE_BUNDLES.comparable, extras = {}) {
  const panels = investigationWorkspacePanels(bundle)
  const checks = extras.checks ?? FIXTURE_CHECKS.comparable
  const checksPanels = extras.checksPanels ?? investigationEvidenceCheckPanels(bundle, checks)
  const reviews = extras.reviews === undefined ? FIXTURE_REVIEWS.comparable : extras.reviews
  const reviewsPanels = extras.reviewsPanels ?? (reviews ? investigationEvidenceReviewPanels(bundle, checks, reviews) : null)
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
      reviews,
      reviewsPanels,
      reviewsError: extras.reviewsError ?? null,
      reviewsBusy: extras.reviewsBusy ?? false,
      loadingReviews: extras.loadingReviews ?? false,
      pendingReviewDecision: extras.pendingReviewDecision ?? null,
      reviewsConflict: extras.reviewsConflict ?? false,
      decisionSavedNeedsRefresh: extras.decisionSavedNeedsRefresh ?? false,
      reviewDrafts: extras.reviewDrafts ?? {},
      reviewFilter: extras.reviewFilter ?? 'attention',
      reviewHistory: extras.reviewHistory ?? null,
      loadingReviewHistory: extras.loadingReviewHistory ?? false,
      loadingOlderReviewHistory: extras.loadingOlderReviewHistory ?? false,
      reviewHistoryError: extras.reviewHistoryError ?? null,
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
      saveEvidenceReview() {},
      retryEvidenceReviewDecision() {},
      retryReviews() {},
      updateReviewDraft() {},
      setReviewFilter() {},
      inspectReviewTarget() {},
      loadOlderReviewHistory() {},
      retryReviewHistory() {},
      refreshReviewHistory() {},
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

test('supplied evidence-review source checksums remain unchanged', () => {
  for (const [path, expected] of MANIFEST) {
    assert.equal(sha256(path), expected, path)
  }
})

test('reviewer sees decision controls and shared progress; viewer has no Save', () => {
  const html = renderWorkspace(readyWorkspace())
  assert.match(html, /Review progress for returned report targets/)
  assert.match(html, /Needs review: 3/)
  assert.match(html, /never reviewed: 3/)
  assert.match(html, /returned_report_targets_only/)
  assert.match(html, /data-action="save-evidence-review"/)
  assert.match(html, /Needs review/)
  assert.match(html, /Retained for follow-up/)
  assert.match(html, /Dismissed for this investigation/)
  assert.match(html, /Disputed/)
  assert.match(html, /not a factual verdict/)
  assert.doesNotMatch(html, /verified independent/)
  assert.doesNotMatch(html, /evidence verified/i)
  assert.equal(EVIDENCE_REVIEW_LABELS.relevant, 'Retained for follow-up')

  const viewer = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.viewer, {
    checks: FIXTURE_CHECKS.viewer,
    reviews: FIXTURE_REVIEWS.viewer,
  }))
  assert.doesNotMatch(viewer, /data-action="save-evidence-review"/)
  assert.match(viewer, /Viewer access can read this review state/)
  assert.match(viewer, /Review progress for returned report targets/)
})

test('read failure is not an unreviewed zero ledger and offers retry', () => {
  const html = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.comparable, {
    reviews: null,
    reviewsPanels: null,
    reviewsError: 'service_unavailable',
  }))
  assert.match(html, /data-action="retry-evidence-reviews"/)
  assert.match(html, /not an unreviewed ledger of zero targets/)
  assert.doesNotMatch(html, /Needs review: 0/)
  assert.doesNotMatch(html, /Returned targets: 0/)
})

test('saved decision with failed refresh offers read recovery, not another Save retry', () => {
  const html = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.comparable, {
    decisionSavedNeedsRefresh: true,
    reviewsError: 'service_unavailable',
    pendingReviewDecision: null,
  }))
  assert.match(html, /Decision saved; refresh to load current review state/)
  assert.match(html, /data-retry-kind="read"/)
  assert.doesNotMatch(html, /data-action="retry-evidence-review-decision"/)
})

test('capped results and omitted pairs stay distinct from zero-target reports', () => {
  const partial = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.comparable, {
    checks: FIXTURE_CHECKS.comparablePartial,
    reviews: FIXTURE_REVIEWS.comparablePartial,
  }))
  assert.match(partial, /Pair comparison omitted some capture inputs/)
  assert.match(partial, /Result lists are capped/)
  assert.match(partial, /do not expand this scan/)
  assert.doesNotMatch(partial, /only partially scanned/)

  const zero = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.scope, {
    checks: FIXTURE_CHECKS.scope,
    reviews: FIXTURE_REVIEWS.scope,
  }))
  assert.match(zero, /No source-link candidates were found/)
  assert.match(zero, /Returned targets: 0/)
  assert.doesNotMatch(zero, /Checks have not been run for this saved version/)
})

test('pair citations cover both inputs and Unicode cue offsets stay exact', () => {
  const bundle = FIXTURE_BUNDLES.comparable
  const pair = FIXTURE_CHECKS.comparable.report.result.lineage_candidates[0]
  const draft = buildSuggestedReviewDraft('source_link', pair, bundle)
  assert.equal(reviewSubmissionBlockReason(draft, 'source_link'), 'Text references need a relation and a reviewer-confirmed note in addition to the detector span.')
  draft.items = draft.items.map((item) => item.kind === 'text' && item.required
    ? { ...item, note: 'Compare these exact inputs.', selected: true }
    : item)
  draft.rationale = 'Retain the pair for follow-up.'
  assert.equal(reviewSubmissionBlockReason(draft, 'source_link'), null)
  const evidence = selectedEvidenceFromDraft(draft)
  assert.equal(evidence.some((row) => String(row.position) === String(pair.left_position)), true)
  assert.equal(evidence.some((row) => String(row.position) === String(pair.right_position)), true)
  assert.equal(reviewSubmissionBlockReason({ ...draft, items: draft.items.map((item) => item.id === 'machine-right' ? { ...item, selected: false } : item) }, 'source_link'), 'Source-link reviews must cite both retained input positions.')

  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const resolved = resolveWorkspaceExcerpt(bundle, cue.reference)
  assert.equal(resolved.excerpt, 'correction')
  assert.match(resolved.before, /🧬/)
  const cueDraft = buildSuggestedReviewDraft('evidence_cue', cue, bundle)
  cueDraft.rationale = 'Retain the cue.'
  cueDraft.items = cueDraft.items.map((item) => item.required ? { ...item, note: 'Exact retained cue.', selected: true } : item)
  assert.equal(reviewSubmissionBlockReason(cueDraft, 'evidence_cue'), null)

  const statusCue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[1]
  const statusDraft = buildSuggestedReviewDraft('evidence_cue', statusCue, bundle)
  statusDraft.rationale = 'Status is a recorded notice only.'
  assert.equal(reviewSubmissionBlockReason(statusDraft, 'evidence_cue'), null)
  assert.equal(selectedEvidenceFromDraft(statusDraft)[0].value, 'withdrawn')
})

test('history inspector shows exact rationale and honest actor labels', () => {
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const html = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: readyWorkspace(FIXTURE_BUNDLES.comparable, {
      inspector: { kind: 'challenge-cue', cue, resolved: resolveWorkspaceExcerpt(FIXTURE_BUNDLES.comparable, cue.reference), reference: cue.reference },
      reviewHistory: {
        target_kind: 'evidence_cue',
        target_id: cue.id,
        report_id: FIXTURE_CHECKS.comparable.report.id,
        at_revision: '1',
        next_before_revision: null,
        events: [{
          id: 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1',
          decision: 'relevant',
          rationale: 'Retain this cue for contextual follow-up. Fixture only.',
          revision: '1',
          authored_by_you: true,
          evidence: [{ ...cue.reference, relation: 'context', note: 'Exact retained context.' }],
        }],
        refreshed: false,
      },
    }),
    publicNode: null,
  }))
  assert.match(html, /Retain this cue for contextual follow-up/)
  assert.match(html, / · You · /)
  assert.doesNotMatch(html, /Alice/)
  assert.match(html, /data-action="refresh-review-history"/)
  assert.doesNotMatch(html, /data-action="refresh-review-history"[^>]*disabled/)
})

test('history refresh control is disabled while a decision is pending', () => {
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const html = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: readyWorkspace(FIXTURE_BUNDLES.comparable, {
      inspector: { kind: 'challenge-cue', cue },
      pendingReviewDecision: { event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', target_kind: 'evidence_cue', target_id: cue.id },
      reviewsBusy: true,
      reviewHistory: {
        target_kind: 'evidence_cue',
        target_id: cue.id,
        report_id: FIXTURE_CHECKS.comparable.report.id,
        at_revision: '0',
        next_before_revision: null,
        events: [],
        refreshed: false,
      },
    }),
    publicNode: null,
  }))
  assert.match(html, /data-action="refresh-review-history"/)
  assert.match(html, /data-action="refresh-review-history" disabled/)
  assert.match(html, /unavailable while a review decision is being saved/)
})

test('history failure is not an empty ledger; older-page loading remains usable', () => {
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const failed = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: readyWorkspace(FIXTURE_BUNDLES.comparable, {
      inspector: { kind: 'challenge-cue', cue },
      reviewHistoryError: 'service_unavailable',
      loadingReviewHistory: false,
    }),
    publicNode: null,
  }))
  assert.match(failed, /History failure is not an empty decision list/)
  assert.match(failed, /data-action="retry-review-history"/)

  const older = renderToStaticMarkup(createElement(PrivateInvestigationInspector, {
    workspace: readyWorkspace(FIXTURE_BUNDLES.comparable, {
      inspector: { kind: 'challenge-cue', cue },
      reviewHistory: {
        target_kind: 'evidence_cue',
        target_id: cue.id,
        report_id: FIXTURE_CHECKS.comparable.report.id,
        at_revision: '25',
        next_before_revision: '5',
        events: [{ id: '00000000-0000-4000-8000-000000000025', decision: 'relevant', rationale: 'Page one.', revision: '25', authored_by_you: false, evidence: [] }],
        refreshed: true,
      },
      loadingOlderReviewHistory: true,
    }),
    publicNode: null,
  }))
  assert.match(older, /explicitly refreshed/)
  assert.match(older, /Loading older decisions/)
  assert.match(older, /Assigned reviewer/)
})

test('reopened needs-review is distinguishable and mapper rejects mismatched identities', () => {
  const html = renderWorkspace(readyWorkspace(FIXTURE_BUNDLES.comparable, {
    reviews: FIXTURE_REVIEWS.comparableReopened,
  }))
  assert.match(html, /Reopened after an earlier decision/)
  assert.equal(
    investigationEvidenceReviewPanels(FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparable, {
      ...FIXTURE_REVIEWS.comparable,
      observation_id: '00000000-0000-4000-8000-000000000099',
    }),
    null,
  )
  assert.equal(
    investigationEvidenceReviewPanels(FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparable, {
      ...FIXTURE_REVIEWS.comparable,
      mode: 'receipt',
    }),
    null,
  )
})

test('DEV preview stays off in production and App memoizes the reviews client', () => {
  assert.equal(readInvestigationWorkspacePreview('?privateInvestigationFixture=populated', { DEV: false }), null)
  assert.match(APP, /useMemo\(\s*\(\)\s*=>\s*createInvestigationEvidenceReviewsClient\(supabase\)/)
  assert.match(APP, /reviewsClient/)
})
