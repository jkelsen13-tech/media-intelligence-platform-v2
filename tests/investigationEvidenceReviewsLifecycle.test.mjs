import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, useMemo } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { createInvestigationEvidenceChecksClient } from '../src/lib/investigationEvidenceChecksClient.js'
import { createInvestigationEvidenceReviewsClient } from '../src/lib/investigationEvidenceReviewsClient.js'
import { createInvestigationWorkspaceClient } from '../src/lib/investigationWorkspaceClient.js'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import { WORKSPACE_STATUS } from '../src/lib/investigationWorkspaceSession.js'
import {
  buildSuggestedReviewDraft,
} from '../src/lib/investigationEvidenceReviewUi.js'
import {
  createLocalInvestigationEvidenceChecksClient,
  createLocalInvestigationEvidenceReviewsClient,
  createLocalInvestigationWorkspaceClient,
  deferred,
  fixtureCatalog,
  FIXTURE_BUNDLES,
  FIXTURE_CHECKS,
  FIXTURE_IDS,
  FIXTURE_REVIEWS,
  FIXTURE_USER,
  FIXTURE_VERSIONS,
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
  outfile: join(compiledDir, 'PrivateInvestigationWorkspace.reviews-lifecycle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-test-renderer'],
  plugins: [{
    name: 'skip-css',
    setup(build) {
      build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}\n', loader: 'js' }))
    },
  }],
})
const { default: PrivateInvestigationWorkspace } = await import(
  join(compiledDir, 'PrivateInvestigationWorkspace.reviews-lifecycle.mjs')
)

function createDeferredClients() {
  const lists = []
  const reads = []
  const marks = []
  const checkReads = []
  const checkRuns = []
  const reviewReads = []
  const reviewDecides = []
  const reviewHistories = []
  return {
    lists,
    reads,
    marks,
    checkReads,
    checkRuns,
    reviewReads,
    reviewDecides,
    reviewHistories,
    client: {
      list(input) {
        const pending = deferred()
        lists.push({ input, ...pending })
        return pending.promise
      },
      read(investigationId, versionId) {
        const pending = deferred()
        reads.push({ investigationId, versionId: versionId ?? null, ...pending })
        return pending.promise
      },
      markReviewed(payload) {
        const pending = deferred()
        marks.push({ payload, ...pending })
        return pending.promise
      },
    },
    checksClient: {
      read(investigationId, versionId) {
        const pending = deferred()
        checkReads.push({ investigationId, versionId, ...pending })
        return pending.promise
      },
      run(investigationId, versionId) {
        const pending = deferred()
        checkRuns.push({ investigationId, versionId, ...pending })
        return pending.promise
      },
    },
    reviewsClient: {
      read(investigationId, versionId, reportId) {
        const pending = deferred()
        reviewReads.push({ investigationId, versionId, reportId, ...pending })
        return pending.promise
      },
      decide(input) {
        const pending = deferred()
        reviewDecides.push({ input, ...pending })
        return pending.promise
      },
      history(input) {
        const pending = deferred()
        reviewHistories.push({ input, ...pending })
        return pending.promise
      },
    },
  }
}

function ok(data) {
  return { data, error: null }
}

function fail(code) {
  return { data: null, error: { code } }
}

function catalogFor(...ids) {
  const all = fixtureCatalog('populated')
  const items = all.items.filter((item) => ids.includes(item.investigation_id))
  return { ...all, items }
}

function completeCueDraft() {
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const draft = buildSuggestedReviewDraft('evidence_cue', cue, FIXTURE_BUNDLES.comparable)
  return {
    ...draft,
    decision: 'relevant',
    rationale: 'Retain this cue for contextual follow-up. Fixture only.',
    items: draft.items.map((item) => (
      item.kind === 'text' ? { ...item, note: 'Exact retained context; no factual verdict.', selected: item.required || item.selected } : item
    )),
  }
}

function receiptFor(input, { revision = '1', replayed = false } = {}) {
  return {
    contract_version: 'investigation-evidence-reviews-1',
    investigation_id: input.investigation_id,
    version_id: input.version_id,
    observation_id: FIXTURE_BUNDLES.comparable.observation.id,
    report_id: input.report_id,
    access_role: 'reviewer',
    publicly_eligible: false,
    mode: 'receipt',
    revision,
    replayed,
    event: {
      id: input.event_id,
      report_id: input.report_id,
      revision,
      target_kind: input.target_kind,
      target_id: input.target_id,
      previous_event_id: input.previous_event_id,
      decision: input.decision,
      rationale: input.rationale,
      evidence: input.evidence,
      authored_by_you: true,
      recorded_at: '2026-09-06T12:00:00Z',
    },
  }
}

async function resolvePending(pending, value) {
  await act(async () => {
    pending.resolve(value)
    await pending.promise
    await Promise.resolve()
    await Promise.resolve()
  })
}

function textOf(node) {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

function treeText(renderer) {
  return textOf(renderer.toJSON())
}

function MountedWorkspace({
  client,
  checksClient,
  reviewsClient,
  userId,
  sessionLoading = false,
  active = true,
  initialInvestigationId = null,
  randomUUID,
  probe,
}) {
  const workspace = usePrivateInvestigationWorkspace({
    client,
    checksClient,
    reviewsClient,
    userId,
    sessionLoading,
    active,
    initialInvestigationId,
    randomUUID,
  })
  probe.current = workspace
  return createElement(PrivateInvestigationWorkspace, {
    workspace,
    accountUiAvailable: true,
    onSignIn() {},
  })
}

async function mountWorkspace(props) {
  const probe = { current: null }
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(createElement(MountedWorkspace, { ...props, probe }))
  })
  return { renderer, probe }
}

function findAction(renderer, action) {
  return renderer.root.findByProps({ 'data-action': action })
}

async function clickAction(renderer, action) {
  await act(async () => {
    void findAction(renderer, action).props.onClick()
    await Promise.resolve()
  })
}

async function clickFirstAction(renderer, action) {
  await act(async () => {
    const nodes = renderer.root.findAllByProps({ 'data-action': action })
    assert.ok(nodes.length > 0, `missing data-action=${action}`)
    void nodes[0].props.onClick()
    await Promise.resolve()
  })
}

async function startAction(work) {
  await act(async () => {
    void work()
    await Promise.resolve()
  })
}

async function flushMicrotasks(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function readyComparable(api = createDeferredClients(), reviews = FIXTURE_REVIEWS.comparable) {
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    reviewsClient: api.reviewsClient,
    userId: FIXTURE_USER.id,
    randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty, FIXTURE_IDS.historical)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.comparable))
  await resolvePending(api.reviewReads[0], ok(reviews))
  assert.equal(probe.current.status, WORKSPACE_STATUS.ready)
  return { api, renderer, probe }
}

test('memoized production clients do not restart catalog, checks or reviews on unrelated rerenders', async () => {
  const listCalls = []
  const listPending = deferred()
  const supabase = {
    functions: {
      async invoke(name, { body }) {
        if (name === 'investigation-workspace' && body.action === 'list') {
          listCalls.push(body)
          return listPending.promise
        }
        return { data: { data: null, error: { code: 'invalid_request' } }, error: null }
      },
    },
  }
  function ProductionHarness({ tick }) {
    const client = useMemo(() => createInvestigationWorkspaceClient(supabase), [])
    const checksClient = useMemo(() => createInvestigationEvidenceChecksClient(supabase), [])
    const reviewsClient = useMemo(() => createInvestigationEvidenceReviewsClient(supabase), [])
    const workspace = usePrivateInvestigationWorkspace({
      client,
      checksClient,
      reviewsClient,
      userId: FIXTURE_USER.id,
      sessionLoading: false,
      active: true,
    })
    return createElement('div', {
      'data-tick': String(tick),
      'data-status': workspace.status,
    })
  }
  let renderer
  await act(async () => {
    renderer = TestRenderer.create(createElement(ProductionHarness, { tick: 0 }))
  })
  for (let tick = 1; tick <= 8; tick += 1) {
    await act(async () => {
      renderer.update(createElement(ProductionHarness, { tick }))
    })
  }
  assert.equal(listCalls.length, 1)
  await act(async () => {
    listPending.resolve({
      data: {
        data: {
          contract_version: 'investigation-workspace-1',
          items: [],
          has_more: false,
          next_after: null,
          publicly_eligible: false,
        },
        error: null,
      },
      error: null,
    })
    await listPending.promise
    await Promise.resolve()
  })
  assert.equal(listCalls.length, 1)
})

test('reviewer explicit save updates shared summary after a read; viewer has no Save', async () => {
  const { api, renderer, probe } = await readyComparable()
  assert.match(treeText(renderer), /Needs review: 3/)
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const draft = completeCueDraft()
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, draft))
  assert.equal(api.reviewDecides.length, 1)
  const frozen = api.reviewDecides[0].input
  assert.equal(frozen.event_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01')
  assert.equal(frozen.previous_event_id, null)
  assert.equal(frozen.target_id, cue.id)
  await resolvePending(api.reviewDecides[0], ok(receiptFor(frozen)))
  assert.equal(api.reviewReads.length, 2)
  await resolvePending(api.reviewReads[1], ok(FIXTURE_REVIEWS.comparableDecided))
  assert.equal(probe.current.state.reviewsPanels.summary.relevant, 1)
  assert.match(treeText(renderer), /Retained for follow-up/)
  assert.equal(api.marks.length, 0)

  const viewerApi = createDeferredClients()
  const viewer = await mountWorkspace({
    client: viewerApi.client,
    checksClient: viewerApi.checksClient,
    reviewsClient: viewerApi.reviewsClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(viewerApi.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(viewerApi.reads[0], ok(FIXTURE_BUNDLES.viewer))
  await resolvePending(viewerApi.checkReads[0], ok(FIXTURE_CHECKS.viewer))
  await resolvePending(viewerApi.reviewReads[0], ok(FIXTURE_REVIEWS.viewer))
  assert.equal(viewer.probe.current.state.reviewsPanels.canDecide, false)
  assert.equal(viewer.renderer.root.findAllByProps({ 'data-action': 'save-evidence-review' }).length, 0)
  assert.equal(viewerApi.reviewDecides.length, 0)
})

test('read failure has an explicit retry and never masquerades as zero reviews', async () => {
  const api = createDeferredClients()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    reviewsClient: api.reviewsClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.comparable))
  await resolvePending(api.reviewReads[0], fail('service_unavailable'))
  assert.equal(probe.current.state.reviewsPanels, null)
  assert.match(treeText(renderer), /not an unreviewed ledger of zero targets/)
  await clickAction(renderer, 'retry-evidence-reviews')
  assert.equal(api.reviewReads.length, 2)
  await resolvePending(api.reviewReads[1], ok(FIXTURE_REVIEWS.comparable))
  assert.equal(probe.current.state.reviewsPanels.summary.needs_review, 3)
})

test('timeout retry preserves UUID and payload; failed refresh offers read recovery', async () => {
  const { api, renderer, probe } = await readyComparable()
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const draft = completeCueDraft()
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, draft))
  const first = api.reviewDecides[0].input
  await resolvePending(api.reviewDecides[0], fail('service_unavailable'))
  await clickAction(renderer, 'retry-evidence-review-decision')
  assert.equal(api.reviewDecides.length, 2)
  assert.deepEqual(api.reviewDecides[1].input, first)
  await resolvePending(api.reviewDecides[1], ok(receiptFor(first)))
  await resolvePending(api.reviewReads[1], fail('request_failed'))
  assert.equal(probe.current.state.decisionSavedNeedsRefresh, true)
  assert.equal(probe.current.state.pendingReviewDecision, null)
  assert.match(treeText(renderer), /Decision saved; refresh to load current review state/)
  await clickAction(renderer, 'retry-evidence-reviews')
  assert.equal(api.reviewDecides.length, 2)
  assert.equal(api.reviewReads.length, 3)
  await resolvePending(api.reviewReads[2], ok(FIXTURE_REVIEWS.comparableDecided))
  assert.equal(probe.current.state.decisionSavedNeedsRefresh, false)
  assert.equal(probe.current.state.reviewsPanels.summary.relevant, 1)
})

test('two reviewer submissions on the same predecessor conflict without automatic overwrite', async () => {
  let uuid = 0
  const api = createDeferredClients()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    reviewsClient: api.reviewsClient,
    userId: FIXTURE_USER.id,
    randomUUID: () => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa0${++uuid}`,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.comparable))
  await resolvePending(api.reviewReads[0], ok(FIXTURE_REVIEWS.comparable))
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const draft = completeCueDraft()
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, draft))
  const first = api.reviewDecides[0].input
  await resolvePending(api.reviewDecides[0], fail('version_conflict'))
  assert.equal(probe.current.state.reviewsConflict, true)
  assert.equal(probe.current.state.pendingReviewDecision, null)
  await resolvePending(api.reviewReads[1], ok(FIXTURE_REVIEWS.comparableDecided))
  assert.match(treeText(renderer), /The review changed/)
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, draft))
  assert.equal(api.reviewDecides.length, 2)
  assert.notEqual(api.reviewDecides[1].input.event_id, first.event_id)
  assert.equal(api.reviewDecides[1].input.previous_event_id, FIXTURE_REVIEWS.comparableDecided.targets.find((item) => item.target_id === cue.id).latest_event.id)
})

test('replayed older receipt cannot replace a newer target decision', async () => {
  const { api, probe } = await readyComparable()
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const draft = completeCueDraft()
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, draft))
  const frozen = api.reviewDecides[0].input
  await resolvePending(api.reviewDecides[0], ok(receiptFor(frozen, { revision: '1', replayed: true })))
  await resolvePending(api.reviewReads[1], ok(FIXTURE_REVIEWS.comparableDecided))
  const current = probe.current.state.reviewsPanels.targets.find((item) => item.target_id === cue.id)
  assert.equal(current.decision, 'relevant')
  assert.equal(current.latest_event.id, FIXTURE_REVIEWS.comparableDecided.targets.find((item) => item.target_id === cue.id).latest_event.id)
  assert.notEqual(current.latest_event.id, frozen.event_id)
})

test('delayed review read after logout or selection change has no stale effect', async () => {
  const { api, renderer, probe } = await readyComparable()
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  await resolvePending(api.reads[1], ok(FIXTURE_BUNDLES.empty))
  await resolvePending(api.checkReads[1], ok(FIXTURE_CHECKS.empty))
  await act(async () => {
    renderer.update(createElement(MountedWorkspace, {
      client: api.client,
      checksClient: api.checksClient,
      reviewsClient: api.reviewsClient,
      userId: null,
      probe,
    }))
  })
  assert.equal(probe.current.status, WORKSPACE_STATUS.signed_out)
  if (api.reviewReads[1]) await resolvePending(api.reviewReads[1], ok(FIXTURE_REVIEWS.comparable))
  assert.equal(probe.current.state.reviews, null)
  assert.doesNotMatch(treeText(renderer), /Review progress for returned report targets/)
})

test('current review identity mismatch clears busy state and remains recoverable', async () => {
  const { api, renderer, probe } = await readyComparable()
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, completeCueDraft()))
  const frozen = api.reviewDecides[0].input
  await resolvePending(api.reviewDecides[0], ok({
    ...receiptFor(frozen),
    observation_id: '00000000-0000-4000-8000-000000000099',
  }))
  assert.equal(probe.current.state.reviewsBusy, false)
  assert.equal(probe.current.state.reviewsError, 'identity_mismatch')
  assert.equal(probe.current.state.pendingReviewDecision.event_id, frozen.event_id)
  await clickAction(renderer, 'retry-evidence-review-decision')
  assert.equal(api.reviewDecides.length, 2)
  assert.deepEqual(api.reviewDecides[1].input, frozen)
})

test('history pages do not mix and late pages cannot occupy a new inspector selection', async () => {
  const { api, renderer, probe } = await readyComparable()
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  const pair = FIXTURE_CHECKS.comparable.report.result.lineage_candidates[0]
  await clickFirstAction(renderer, 'inspect-challenge-cue')
  assert.equal(api.reviewHistories.length, 1)
  assert.equal(api.reviewHistories[0].input.at_revision, '0')
  assert.equal(api.reviewHistories[0].input.before_revision, null)
  await clickFirstAction(renderer, 'inspect-source-link')
  assert.equal(api.reviewHistories.length, 2)
  await resolvePending(api.reviewHistories[0], ok({
    contract_version: 'investigation-evidence-reviews-1',
    investigation_id: FIXTURE_IDS.comparable,
    version_id: FIXTURE_BUNDLES.comparable.version.id,
    observation_id: FIXTURE_BUNDLES.comparable.observation.id,
    report_id: FIXTURE_CHECKS.comparable.report.id,
    access_role: 'reviewer',
    publicly_eligible: false,
    mode: 'history',
    revision: '0',
    target_kind: 'evidence_cue',
    target_id: cue.id,
    events: [{
      id: '00000000-0000-4000-8000-000000000001',
      decision: 'relevant',
      rationale: 'Stale cue history.',
      revision: '0',
      authored_by_you: true,
      evidence: [],
    }],
    next_before_revision: null,
  }))
  assert.notEqual(probe.current.state.reviewHistory?.target_id, cue.id)
  await resolvePending(api.reviewHistories[1], ok({
    contract_version: 'investigation-evidence-reviews-1',
    investigation_id: FIXTURE_IDS.comparable,
    version_id: FIXTURE_BUNDLES.comparable.version.id,
    observation_id: FIXTURE_BUNDLES.comparable.observation.id,
    report_id: FIXTURE_CHECKS.comparable.report.id,
    access_role: 'reviewer',
    publicly_eligible: false,
    mode: 'history',
    revision: '0',
    target_kind: 'source_link',
    target_id: pair.id,
    events: [],
    next_before_revision: '0',
  }))
  assert.equal(probe.current.state.reviewHistory.target_id, pair.id)
  assert.equal(probe.current.state.reviewHistory.events.length, 0)
  assert.doesNotMatch(treeText(renderer), /Stale cue history/)
})

test('new and archived versions remain separate for reviews', async () => {
  const api = createDeferredClients()
  const { probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    reviewsClient: api.reviewsClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.comparable))
  await resolvePending(api.reviewReads[0], ok(FIXTURE_REVIEWS.comparableDecided))
  assert.equal(probe.current.state.reviews.revision, '1')
  await startAction(() => probe.current.actions.selectVersion(FIXTURE_IDS.comparable, FIXTURE_VERSIONS.v1))
  const historicalBundle = {
    ...FIXTURE_BUNDLES.comparable,
    version: { ...FIXTURE_BUNDLES.comparable.version, id: FIXTURE_VERSIONS.v1, revision: 1 },
  }
  await resolvePending(api.reads[1], ok(historicalBundle))
  const historicalChecks = {
    ...FIXTURE_CHECKS.comparable,
    version_id: FIXTURE_VERSIONS.v1,
    report: { ...FIXTURE_CHECKS.comparable.report, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99', version_id: FIXTURE_VERSIONS.v1, investigation_id: FIXTURE_IDS.comparable },
  }
  await resolvePending(api.checkReads[1], ok(historicalChecks))
  const historicalReviews = fixtureReviewsFor(historicalBundle, historicalChecks)
  await resolvePending(api.reviewReads[1], ok(historicalReviews))
  assert.equal(probe.current.state.reviews.revision, '0')
  assert.equal(probe.current.state.reviews.report_id, historicalChecks.report.id)
  assert.notEqual(probe.current.state.reviews.report_id, FIXTURE_CHECKS.comparable.report.id)
})

function fixtureReviewsFor(bundle, checks) {
  return {
    ...FIXTURE_REVIEWS.comparable,
    investigation_id: bundle.investigation_id,
    version_id: bundle.version.id,
    observation_id: bundle.observation.id,
    report_id: checks.report.id,
    revision: '0',
    targets: FIXTURE_REVIEWS.comparable.targets.map((item) => ({ ...item, latest_event: null, decision: 'needs_review' })),
    summary: {
      returned_targets: 3,
      never_reviewed: 3,
      needs_review: 3,
      relevant: 0,
      not_relevant: 0,
      disputed: 0,
    },
  }
}

test('local fixture reviews do not enable production preview routes', async () => {
  const { renderer, probe } = await mountWorkspace({
    client: createLocalInvestigationWorkspaceClient({ scenario: 'populated' }),
    checksClient: createLocalInvestigationEvidenceChecksClient({ scenario: 'populated' }),
    reviewsClient: createLocalInvestigationEvidenceReviewsClient({ scenario: 'populated' }),
    userId: FIXTURE_USER.id,
    initialInvestigationId: FIXTURE_IDS.comparable,
  })
  for (let i = 0; i < 40 && probe.current.state.reviewsPanels == null; i += 1) {
    await flushMicrotasks(2)
  }
  assert.equal(probe.current.state.reviewsPanels.summary.needs_review, 3)
  assert.match(treeText(renderer), /Review progress for returned report targets/)
})
