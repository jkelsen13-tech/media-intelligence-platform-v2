import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, useMemo } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { createInvestigationEvidenceChecksClient } from '../src/lib/investigationEvidenceChecksClient.js'
import { createInvestigationWorkspaceClient } from '../src/lib/investigationWorkspaceClient.js'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import { WORKSPACE_STATUS } from '../src/lib/investigationWorkspaceSession.js'
import {
  createLocalInvestigationEvidenceChecksClient,
  createLocalInvestigationWorkspaceClient,
  deferred,
  fixtureCatalog,
  fixtureEvidenceChecks,
  FIXTURE_BUNDLES,
  FIXTURE_CHECKS,
  FIXTURE_IDS,
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
const { default: PrivateInvestigationWorkspace } = await import(
  join(compiledDir, 'PrivateInvestigationWorkspace.review-recovery.mjs')
)

function createDeferredClients() {
  const lists = []
  const reads = []
  const marks = []
  const checkReads = []
  const checkRuns = []
  return {
    lists,
    reads,
    marks,
    checkReads,
    checkRuns,
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

function versioned(bundle, { investigationId, versionId } = {}) {
  return {
    ...bundle,
    investigation_id: investigationId ?? bundle.investigation_id,
    version: {
      ...bundle.version,
      id: versionId ?? bundle.version.id,
      investigation_id: investigationId ?? bundle.investigation_id,
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

function MountedWorkspace({ client, checksClient, userId, sessionLoading = false, active = true, initialInvestigationId = null, probe }) {
  const workspace = usePrivateInvestigationWorkspace({
    client,
    checksClient,
    userId,
    sessionLoading,
    active,
    initialInvestigationId,
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

async function readyComparable(api = createDeferredClients()) {
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty, FIXTURE_IDS.historical)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.comparable))
  assert.equal(probe.current.status, WORKSPACE_STATUS.ready)
  return { api, renderer, probe }
}

test('review: failed check read exposes an actionable retry', async () => {
  const api = createDeferredClients()
  const { renderer, probe } = await mountWorkspace({client:api.client,checksClient:api.checksClient,userId:FIXTURE_USER.id})
  await resolvePending(api.lists[0],ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0],ok(FIXTURE_BUNDLES.comparable))
  await resolvePending(api.checkReads[0],fail('service_unavailable'))
  assert.equal(probe.current.state.loadingChecks,false)
  assert.equal(probe.current.state.checksError,'service_unavailable')
  const retries=renderer.root.findAllByProps({'data-action':'retry-evidence-checks'})
  assert.equal(retries.length,1,'Error copy asks to retry but no retry control is rendered')
})

test('review: current mismatched response terminates loading with recoverable error', async () => {
  const api=createDeferredClients()
  const {probe}=await mountWorkspace({client:api.client,checksClient:api.checksClient,userId:FIXTURE_USER.id})
  await resolvePending(api.lists[0],ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0],ok(FIXTURE_BUNDLES.comparable))
  await resolvePending(api.checkReads[0],ok({...FIXTURE_CHECKS.comparable,observation_id:'00000000-0000-4000-8000-000000000099'}))
  assert.equal(probe.current.state.checks,null)
  assert.equal(probe.current.state.loadingChecks,false,'Current rejected response leaves loading spinner stuck')
  assert.ok(probe.current.state.checksError)
})

test('review: result truncation alone does not claim the scan was incomplete', async () => {
  const api=createDeferredClients()
  const {renderer}=await mountWorkspace({client:api.client,checksClient:api.checksClient,userId:FIXTURE_USER.id})
  await resolvePending(api.lists[0],ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0],ok(FIXTURE_BUNDLES.comparable))
  const report=structuredClone(FIXTURE_CHECKS.comparable)
  report.report.result.completion='partial'
  report.report.result.coverage.lineage_excluded_positions=[]
  report.report.result.coverage.challenge_cues_found=201
  report.report.result.coverage.challenge_cues_returned=200
  await resolvePending(api.checkReads[0],ok(report))
  assert.doesNotMatch(treeText(renderer),/only partially scanned/,'A capped result list is not an incomplete scan')
})

test('review: run mismatch keeps pending identity and an explicit retry reuses it', async () => {
  const api = createDeferredClients()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.historical)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.historical))
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.historical))
  await clickAction(renderer, 'run-evidence-checks')
  await clickAction(renderer, 'run-evidence-checks')
  assert.equal(api.checkRuns.length, 1, 'duplicate run submissions are ignored while busy')
  const mismatched = {
    ...FIXTURE_CHECKS.historicalZero,
    observation_id: '00000000-0000-4000-8000-000000000099',
  }
  await resolvePending(api.checkRuns[0], ok(mismatched))
  assert.equal(probe.current.state.checksBusy, false)
  assert.equal(probe.current.state.loadingChecks, false)
  assert.equal(probe.current.state.checksError, 'identity_mismatch')
  assert.deepEqual(probe.current.state.pendingChecksRun, {
    investigationId: FIXTURE_IDS.historical,
    versionId: FIXTURE_BUNDLES.historical.version.id,
    observationId: FIXTURE_BUNDLES.historical.observation.id,
  })
  assert.equal(api.marks.length, 0)
  assert.equal(renderer.root.findAllByProps({ 'data-action': 'run-evidence-checks' }).length, 0)
  await clickAction(renderer, 'retry-evidence-checks')
  assert.equal(api.checkRuns.length, 2)
  assert.equal(api.checkRuns[1].investigationId, FIXTURE_IDS.historical)
  assert.equal(api.checkRuns[1].versionId, FIXTURE_BUNDLES.historical.version.id)
  await resolvePending(api.checkRuns[1], ok(FIXTURE_CHECKS.historicalZero))
  assert.equal(probe.current.state.checksPanels.status, 'saved')
  assert.equal(probe.current.state.pendingChecksRun, null)
  assert.equal(probe.current.state.checksError, null)
  assert.deepEqual(probe.current.state.bundle.review, FIXTURE_BUNDLES.historical.review)
})

test('review: viewer can retry a failed read without gaining run', async () => {
  const api = createDeferredClients()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.viewer))
  await resolvePending(api.checkReads[0], fail('service_unavailable'))
  assert.equal(probe.current.state.checksError, 'service_unavailable')
  assert.equal(renderer.root.findAllByProps({ 'data-action': 'retry-evidence-checks' }).length, 1)
  assert.equal(renderer.root.findAllByProps({ 'data-action': 'run-evidence-checks' }).length, 0)
  await clickAction(renderer, 'retry-evidence-checks')
  assert.equal(api.checkReads.length, 2)
  assert.equal(api.checkRuns.length, 0)
  await resolvePending(api.checkReads[1], ok(FIXTURE_CHECKS.viewer))
  assert.equal(probe.current.state.checksPanels.canRun, false)
  assert.equal(api.checkRuns.length, 0)
  assert.equal(renderer.root.findAllByProps({ 'data-action': 'run-evidence-checks' }).length, 0)
  assert.match(treeText(renderer), /Possible shared-source pair/)
})

test('review: superseded checks response does not occupy the newer selection', async () => {
  const api = createDeferredClients()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  assert.equal(api.checkReads.length, 1)
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  await resolvePending(api.reads[1], ok(FIXTURE_BUNDLES.empty))
  assert.equal(probe.current.state.selectedInvestigationId, FIXTURE_IDS.empty)
  assert.equal(probe.current.state.loadingChecks, true)
  await resolvePending(api.checkReads[0], ok({
    ...FIXTURE_CHECKS.comparable,
    observation_id: '00000000-0000-4000-8000-000000000099',
  }))
  assert.equal(probe.current.state.selectedInvestigationId, FIXTURE_IDS.empty)
  assert.equal(probe.current.state.checks, null)
  assert.equal(probe.current.state.checksError, null)
  assert.equal(probe.current.state.loadingChecks, true, 'Superseded mismatch must not clear the newer read')
  await resolvePending(api.checkReads[1], ok(FIXTURE_CHECKS.empty))
  assert.equal(probe.current.state.checksPanels.status, 'not_run')
  assert.equal(probe.current.state.checksError, null)
  assert.doesNotMatch(treeText(renderer), /Possible shared-source pair/)
  assert.match(treeText(renderer), /Checks have not been run for this saved version/)
})
