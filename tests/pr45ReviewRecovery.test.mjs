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
  isTerminalReviewAccessError,
  reviewDecisionContextMatches,
  reviewHistoryRefreshBlocked,
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
  outfile: join(compiledDir, 'PrivateInvestigationWorkspace.review-recovery.mjs'),
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
const { default: PrivateInvestigationWorkspace, PrivateInvestigationInspector } = await import(
  join(compiledDir, 'PrivateInvestigationWorkspace.review-recovery.mjs')
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
  return createElement('div', null,
    createElement(PrivateInvestigationWorkspace, {
      workspace,
      accountUiAvailable: true,
      onSignIn() {},
    }),
    createElement(PrivateInvestigationInspector, {
      workspace,
      accountUiAvailable: true,
    }),
  )
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


function historyResponse(input, events = [], next = null) {
 return { contract_version:'investigation-evidence-reviews-1', mode:'history', investigation_id:input.investigation_id,
 version_id:input.version_id, report_id:input.report_id, observation_id:FIXTURE_BUNDLES.comparable.observation.id,
 access_role:'reviewer', publicly_eligible:false, revision:input.at_revision, target_kind:input.target_kind,
 target_id:input.target_id, events, next_before_revision:next }
}

test('history refresh must not discard an in-flight decision receipt or retry identity', async () => {
 const {api,renderer,probe}=await readyComparable()
 const cue=FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
 await clickFirstAction(renderer,'inspect-challenge-cue')
 await resolvePending(api.reviewHistories[0],ok(historyResponse(api.reviewHistories[0].input)))
 await startAction(()=>probe.current.actions.saveEvidenceReview('evidence_cue',cue.id,completeCueDraft()))
 const payload=api.reviewDecides[0].input
 await startAction(()=>probe.current.actions.refreshReviewHistory())
 // Refresh may be disabled, deferred, or independently coordinated, but cannot lose the submission.
 if(api.reviewReads[1]) await resolvePending(api.reviewReads[1],ok(FIXTURE_REVIEWS.comparable))
 await resolvePending(api.reviewDecides[0],fail('service_unavailable'))
 assert.equal(probe.current.state.pendingReviewDecision?.event_id,payload.event_id,'ambiguous save lost its original retry identity')
})

test('late older history page must not replace an explicitly refreshed history revision', async () => {
 const old={...FIXTURE_REVIEWS.comparableDecided,revision:'30'}
 const {api,renderer,probe}=await readyComparable(createDeferredClients(),old)
 await clickFirstAction(renderer,'inspect-challenge-cue')
 await resolvePending(api.reviewHistories[0],ok(historyResponse(api.reviewHistories[0].input,[], '20')))
 await startAction(()=>probe.current.actions.loadOlderReviewHistory())
 const older=api.reviewHistories[1]
 await startAction(()=>probe.current.actions.refreshReviewHistory())
 await resolvePending(api.reviewReads[1],ok({...old,revision:'31'}))
 const fresh=api.reviewHistories[2]
 assert.equal(fresh.input.at_revision,'31')
 await resolvePending(fresh,ok(historyResponse(fresh.input)))
 await resolvePending(older,ok(historyResponse(older.input)))
 assert.equal(probe.current.state.reviewHistory.at_revision,'31','discarded page replaced refreshed history')
})

test('failed post-save refresh must not reintroduce state after switching investigations', async () => {
 const {api,probe}=await readyComparable()
 const cue=FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
 await startAction(()=>probe.current.actions.saveEvidenceReview('evidence_cue',cue.id,completeCueDraft()))
 await resolvePending(api.reviewDecides[0],ok(receiptFor(api.reviewDecides[0].input)))
 await startAction(()=>probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
 await resolvePending(api.reviewReads[1],fail('authentication_required'))
 assert.equal(probe.current.state.decisionSavedNeedsRefresh,false,'stale refresh reintroduced a saved-decision error')
})

test('history refresh button and action stay blocked until an in-flight save resolves; successful save still rereads', async () => {
  const { api, renderer, probe } = await readyComparable()
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  await clickFirstAction(renderer, 'inspect-challenge-cue')
  await resolvePending(api.reviewHistories[0], ok(historyResponse(api.reviewHistories[0].input)))
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, completeCueDraft()))
  const payload = api.reviewDecides[0].input
  assert.equal(findAction(renderer, 'refresh-review-history').props.disabled, true)
  const readsBefore = api.reviewReads.length
  await startAction(() => probe.current.actions.refreshReviewHistory())
  assert.equal(api.reviewReads.length, readsBefore)
  assert.equal(probe.current.state.pendingReviewDecision.event_id, payload.event_id)
  await resolvePending(api.reviewDecides[0], ok(receiptFor(payload)))
  await resolvePending(api.reviewReads[readsBefore], ok(FIXTURE_REVIEWS.comparableDecided))
  assert.equal(probe.current.state.pendingReviewDecision, null)
  assert.equal(probe.current.state.reviewsPanels.summary.relevant, 1)
  assert.equal(findAction(renderer, 'refresh-review-history').props.disabled, false)
})

test('successful save arriving after a permitted overlapping overview read keeps then replaces from the post-save read', async () => {
  const { api, renderer, probe } = await readyComparable()
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  await clickFirstAction(renderer, 'inspect-challenge-cue')
  await resolvePending(api.reviewHistories[0], ok(historyResponse(api.reviewHistories[0].input)))
  await startAction(() => probe.current.actions.refreshReviewHistory())
  const overlapping = api.reviewReads[1]
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, completeCueDraft()))
  const payload = api.reviewDecides[0].input
  await resolvePending(overlapping, ok(FIXTURE_REVIEWS.comparable))
  assert.equal(probe.current.state.pendingReviewDecision?.event_id, payload.event_id)
  assert.equal(probe.current.state.reviewsBusy, true)
  await resolvePending(api.reviewDecides[0], ok(receiptFor(payload)))
  const postSaveRead = api.reviewReads[api.reviewReads.length - 1]
  await resolvePending(postSaveRead, ok(FIXTURE_REVIEWS.comparableDecided))
  assert.equal(probe.current.state.pendingReviewDecision, null)
  assert.equal(probe.current.state.reviewsPanels.summary.relevant, 1)
})

test('older history page arriving before a refresh still cannot replace the new revision', async () => {
  const old = { ...FIXTURE_REVIEWS.comparableDecided, revision: '30' }
  const { api, renderer, probe } = await readyComparable(createDeferredClients(), old)
  await clickFirstAction(renderer, 'inspect-challenge-cue')
  await resolvePending(api.reviewHistories[0], ok(historyResponse(api.reviewHistories[0].input, [], '20')))
  await startAction(() => probe.current.actions.loadOlderReviewHistory())
  const older = api.reviewHistories[1]
  await startAction(() => probe.current.actions.refreshReviewHistory())
  await resolvePending(api.reviewReads[1], ok({ ...old, revision: '31' }))
  const fresh = api.reviewHistories[2]
  assert.equal(fresh.input.at_revision, '31')
  await resolvePending(older, ok(historyResponse(older.input, [{
    id: '00000000-0000-4000-8000-000000000030',
    decision: 'relevant',
    rationale: 'Stale older page.',
    revision: '30',
    authored_by_you: false,
    evidence: [],
  }])))
  await resolvePending(fresh, ok(historyResponse(fresh.input)))
  assert.equal(probe.current.state.reviewHistory.at_revision, '31')
  assert.equal(probe.current.state.reviewHistory.events.some((event) => event.id === '00000000-0000-4000-8000-000000000030'), false)
})

test('repeated history refresh ignores the previous revision page and its errors', async () => {
  const old = { ...FIXTURE_REVIEWS.comparableDecided, revision: '30' }
  const { api, renderer, probe } = await readyComparable(createDeferredClients(), old)
  await clickFirstAction(renderer, 'inspect-challenge-cue')
  await resolvePending(api.reviewHistories[0], ok(historyResponse(api.reviewHistories[0].input)))
  await startAction(() => probe.current.actions.refreshReviewHistory())
  await resolvePending(api.reviewReads[1], ok({ ...old, revision: '31' }))
  const firstRefresh = api.reviewHistories[1]
  assert.equal(firstRefresh.input.at_revision, '31')
  await startAction(() => probe.current.actions.refreshReviewHistory())
  await resolvePending(api.reviewReads[2], ok({ ...old, revision: '32' }))
  const secondRefresh = api.reviewHistories[2]
  assert.equal(secondRefresh.input.at_revision, '32')
  await resolvePending(firstRefresh, fail('service_unavailable'))
  assert.equal(probe.current.state.reviewHistoryError, null)
  await resolvePending(secondRefresh, ok(historyResponse(secondRefresh.input)))
  assert.equal(probe.current.state.reviewHistory.at_revision, '32')
  assert.equal(probe.current.state.reviewHistoryError, null)
})

test('confirmed save with failed refresh on the still-current selection still offers read recovery', async () => {
  const { api, renderer, probe } = await readyComparable()
  const cue = FIXTURE_CHECKS.comparable.report.result.challenge_cues[0]
  await startAction(() => probe.current.actions.saveEvidenceReview('evidence_cue', cue.id, completeCueDraft()))
  await resolvePending(api.reviewDecides[0], ok(receiptFor(api.reviewDecides[0].input)))
  await resolvePending(api.reviewReads[1], fail('request_failed'))
  assert.equal(probe.current.state.decisionSavedNeedsRefresh, true)
  assert.equal(probe.current.state.reviewsError, 'request_failed')
  assert.equal(probe.current.state.selectedInvestigationId, FIXTURE_IDS.comparable)
  assert.match(treeText(renderer), /Decision saved; refresh to load current review state/)
})

test('review history refresh helpers keep save identity distinct from terminal access clearing', () => {
  assert.equal(reviewHistoryRefreshBlocked({ pendingReviewDecision: { event_id: 'x' }, reviewsBusy: false }), true)
  assert.equal(reviewHistoryRefreshBlocked({ pendingReviewDecision: null, reviewsBusy: true }), true)
  assert.equal(reviewHistoryRefreshBlocked({ pendingReviewDecision: null, reviewsBusy: false }), false)
  assert.equal(isTerminalReviewAccessError('authentication_required'), true)
  assert.equal(isTerminalReviewAccessError('access_denied'), true)
  assert.equal(isTerminalReviewAccessError('request_failed'), false)
  assert.equal(reviewDecisionContextMatches({
    selectedInvestigationId: FIXTURE_IDS.comparable,
    bundle: FIXTURE_BUNDLES.comparable,
    checks: FIXTURE_CHECKS.comparable,
  }, {
    investigation_id: FIXTURE_IDS.comparable,
    version_id: FIXTURE_BUNDLES.comparable.version.id,
    report_id: FIXTURE_CHECKS.comparable.report.id,
  }), true)
  assert.equal(reviewDecisionContextMatches({
    selectedInvestigationId: FIXTURE_IDS.empty,
    bundle: null,
    checks: null,
  }, {
    investigation_id: FIXTURE_IDS.comparable,
    version_id: FIXTURE_BUNDLES.comparable.version.id,
    report_id: FIXTURE_CHECKS.comparable.report.id,
  }), false)
})

