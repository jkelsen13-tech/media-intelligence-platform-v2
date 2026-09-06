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
  outfile: join(compiledDir, 'PrivateInvestigationWorkspace.evidence-lifecycle.mjs'),
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
  join(compiledDir, 'PrivateInvestigationWorkspace.evidence-lifecycle.mjs')
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

function MountedWorkspace({ client, checksClient, userId, sessionLoading = false, active = true, probe }) {
  const workspace = usePrivateInvestigationWorkspace({
    client,
    checksClient,
    userId,
    sessionLoading,
    active,
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

test('memoized production clients do not restart catalog or checks on unrelated rerenders', async () => {
  const listCalls = []
  const checkCalls = []
  const listPending = deferred()
  const supabase = {
    functions: {
      async invoke(name, { body }) {
        if (name === 'investigation-workspace' && body.action === 'list') {
          listCalls.push(body)
          return listPending.promise
        }
        if (name === 'investigation-evidence-checks') {
          checkCalls.push(body)
          return { data: { data: null, error: { code: 'invalid_request' } }, error: null }
        }
        return { data: { data: null, error: { code: 'invalid_request' } }, error: null }
      },
    },
  }
  function ProductionHarness({ tick }) {
    const client = useMemo(() => createInvestigationWorkspaceClient(supabase), [])
    const checksClient = useMemo(() => createInvestigationEvidenceChecksClient(supabase), [])
    const workspace = usePrivateInvestigationWorkspace({
      client,
      checksClient,
      userId: FIXTURE_USER.id,
      sessionLoading: false,
      active: true,
    })
    return createElement('div', {
      'data-tick': String(tick),
      'data-status': workspace.status,
      'data-catalog-count': String(workspace.state.catalog.length),
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
  assert.equal(checkCalls.length, 0)
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
  assert.equal(checkCalls.length, 0)
})

test('reviewer run feeds all three sections once; a second click is not offered', async () => {
  const api = createDeferredClients()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.historical)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.historical))
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.historical))
  assert.equal(probe.current.state.checksPanels.status, 'not_run')
  assert.equal(probe.current.state.checksPanels.canRun, true)
  findAction(renderer, 'run-evidence-checks')
  assert.match(treeText(renderer), /Checks have not been run for this saved version/)

  await clickAction(renderer, 'run-evidence-checks')
  assert.equal(api.checkRuns.length, 1)
  assert.equal(api.checkRuns[0].investigationId, FIXTURE_IDS.historical)
  assert.equal(api.checkRuns[0].versionId, FIXTURE_BUNDLES.historical.version.id)
  await clickAction(renderer, 'run-evidence-checks')
  assert.equal(api.checkRuns.length, 1, 'duplicate run submissions are ignored while busy')

  await resolvePending(api.checkRuns[0], ok(FIXTURE_CHECKS.historicalZero))
  assert.equal(probe.current.state.checksPanels.status, 'saved')
  assert.equal(probe.current.state.checksPanels.canRun, false)
  assert.equal(probe.current.state.bundle.review, FIXTURE_BUNDLES.historical.review)
  assert.match(treeText(renderer), /No source-link candidates were found/)
  assert.match(treeText(renderer), /No correction, withdrawal, or recorded source-status cues were found/)
  assert.match(treeText(renderer), /Saved inputs checked/)
  assert.doesNotMatch(treeText(renderer), /Run evidence checks/)
  assert.equal(api.marks.length, 0)
  assert.equal(renderer.root.findAllByProps({ 'data-action': 'run-evidence-checks' }).length, 0)
})

test('viewer reads a saved report and never issues run', async () => {
  const { renderer, probe } = await mountWorkspace({
    client: createLocalInvestigationWorkspaceClient({ scenario: 'populated' }),
    checksClient: {
      async read() {
        return ok(FIXTURE_CHECKS.viewer)
      },
      async run() {
        throw new Error('viewer must not run')
      },
    },
    userId: FIXTURE_USER.id,
  })
  for (let i = 0; i < 20 && probe.current.status !== WORKSPACE_STATUS.ready; i += 1) {
    await flushMicrotasks(2)
  }
  assert.equal(probe.current.state.checksPanels.canRun, false)
  assert.doesNotMatch(treeText(renderer), /data-action="run-evidence-checks"/)
  assert.match(treeText(renderer), /Possible shared-source pair/)
})

test('logout clears private checks and ignores a delayed run', async () => {
  const { api, renderer, probe } = await readyComparable()
  await startAction(() => probe.current.actions.selectVersion(FIXTURE_IDS.comparable, FIXTURE_VERSIONS.v1))
  await resolvePending(
    api.reads[1],
    ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })),
  )
  const historicalChecks = fixtureEvidenceChecks('not_run', versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 }))
  historicalChecks.observation_id = FIXTURE_BUNDLES.comparable.observation.id
  await resolvePending(api.checkReads[1], ok(historicalChecks))
  await clickAction(renderer, 'run-evidence-checks')
  const run = api.checkRuns[0]
  await act(async () => {
    renderer.update(createElement(MountedWorkspace, {
      client: api.client,
      checksClient: api.checksClient,
      userId: null,
      probe,
    }))
  })
  assert.equal(probe.current.status, WORKSPACE_STATUS.signed_out)
  assert.equal(probe.current.state.checks, null)
  assert.equal(probe.current.state.checksPanels, null)
  await resolvePending(run, ok(FIXTURE_CHECKS.comparable))
  assert.equal(probe.current.state.checks, null)
  assert.doesNotMatch(treeText(renderer), /Possible shared-source pair/)
})

test('investigation switch drops a delayed checks read and does not open inspector from it', async () => {
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
  assert.equal(probe.current.state.inspector, null)
  assert.equal(probe.current.state.selectedInvestigationId, FIXTURE_IDS.empty)
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.comparable))
  assert.equal(probe.current.state.checks, null)
  assert.notEqual(probe.current.state.inspector?.kind, 'source-link')
  await resolvePending(api.checkReads[1], ok(FIXTURE_CHECKS.empty))
  assert.equal(probe.current.state.checksPanels.status, 'not_run')
  assert.doesNotMatch(treeText(renderer), /Possible shared-source pair/)
  assert.match(treeText(renderer), /Checks have not been run for this saved version/)
})

test('delayed run after inspector selection change cannot occupy the new inspector', async () => {
  const api = createDeferredClients()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await resolvePending(api.checkReads[0], ok(FIXTURE_CHECKS.comparable))
  await startAction(() => probe.current.actions.selectVersion(FIXTURE_IDS.comparable, FIXTURE_VERSIONS.v1))
  const historicalBundle = versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })
  await resolvePending(api.reads[1], ok(historicalBundle))
  const notRun = fixtureEvidenceChecks('not_run', historicalBundle)
  await resolvePending(api.checkReads[1], ok(notRun))
  await clickAction(renderer, 'run-evidence-checks')
  const run = api.checkRuns[0]
  await clickFirstAction(renderer, 'inspect-evidence-change')
  const history = api.reads[2]
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  await resolvePending(api.reads[3], ok(FIXTURE_BUNDLES.empty))
  await resolvePending(api.checkReads[2], ok(FIXTURE_CHECKS.empty))
  await resolvePending(run, ok(fixtureEvidenceChecks('zero', historicalBundle)))
  await resolvePending(history, ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })))
  assert.equal(probe.current.state.selectedInvestigationId, FIXTURE_IDS.empty)
  assert.equal(probe.current.state.inspector, null)
  assert.equal(probe.current.state.checksPanels.status, 'not_run')
  assert.doesNotMatch(treeText(renderer), /Possible shared-source pair/)
})

test('mismatched observation is rejected before panels or inspector can consume it', async () => {
  const api = createDeferredClients()
  const { probe } = await mountWorkspace({
    client: api.client,
    checksClient: api.checksClient,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  const mismatched = {
    ...FIXTURE_CHECKS.comparable,
    observation_id: '00000000-0000-4000-8000-000000000099',
  }
  await resolvePending(api.checkReads[0], ok(mismatched))
  assert.equal(probe.current.state.checksPanels, null)
  assert.equal(probe.current.state.checks, null)
  assert.equal(probe.current.state.inspector, null)
})

test('access denial clears checks immediately and a late success cannot restore them', async () => {
  const { api, probe, renderer } = await readyComparable()
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  await resolvePending(api.reads[1], fail('access_denied'))
  assert.equal(probe.current.status, WORKSPACE_STATUS.access_denied)
  assert.equal(probe.current.state.checks, null)
  assert.equal(probe.current.state.checksPanels, null)
  if (api.checkReads[1]) await resolvePending(api.checkReads[1], ok(FIXTURE_CHECKS.empty))
  assert.equal(probe.current.state.checks, null)
  assert.doesNotMatch(treeText(renderer), /Possible shared-source pair/)
})

test('local fixture run on a historical version does not change the review baseline', async () => {
  const { renderer, probe } = await mountWorkspace({
    client: createLocalInvestigationWorkspaceClient({ scenario: 'historical' }),
    checksClient: createLocalInvestigationEvidenceChecksClient({ scenario: 'historical' }),
    userId: FIXTURE_USER.id,
  })
  for (let i = 0; i < 30 && probe.current.state.checksPanels?.status !== 'not_run'; i += 1) {
    await flushMicrotasks(2)
  }
  const reviewBefore = probe.current.state.bundle.review
  await clickAction(renderer, 'run-evidence-checks')
  for (let i = 0; i < 20 && probe.current.state.checksPanels?.status !== 'saved'; i += 1) {
    await flushMicrotasks(2)
  }
  assert.equal(probe.current.state.checksPanels.status, 'saved')
  assert.deepEqual(probe.current.state.bundle.review, reviewBefore)
  assert.match(treeText(renderer), /No source-link candidates were found/)
  assert.doesNotMatch(treeText(renderer), /data-action="run-evidence-checks"/)
})
