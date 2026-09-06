import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import {
  WORKSPACE_STATUS,
} from '../src/lib/investigationWorkspaceSession.js'
import {
  deferred,
  fixtureCatalog,
  FIXTURE_BUNDLES,
  FIXTURE_COMMITMENT_ID,
  FIXTURE_IDS,
  FIXTURE_POSITION,
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
  outfile: join(compiledDir, 'PrivateInvestigationWorkspace.inspector-review.mjs'),
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
  join(compiledDir, 'PrivateInvestigationWorkspace.inspector-review.mjs')
)

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

function createDeferredClient() {
  const lists = []
  const reads = []
  const marks = []
  return {
    lists,
    reads,
    marks,
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
  const evidence = fixtureCatalog('evidence-only')
  const items = [...all.items, ...evidence.items].filter((item) => ids.includes(item.investigation_id))
  return { ...all, items }
}

function versioned(bundle, { investigationId, versionId, headVersionId } = {}) {
  return {
    ...bundle,
    investigation_id: investigationId ?? bundle.investigation_id,
    head_version_id: headVersionId ?? bundle.head_version_id,
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

function MountedWorkspace({ client, userId, sessionLoading = false, active = true, randomUUID, probe }) {
  const workspace = usePrivateInvestigationWorkspace({
    client,
    userId,
    sessionLoading,
    active,
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

async function readyComparable(api = createDeferredClient()) {
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty, FIXTURE_IDS.evidenceOnly)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  assert.equal(probe.current.status, WORKSPACE_STATUS.ready)
  return { api, renderer, probe }
}

test('supplied investigation workspace source checksums remain unchanged', () => {
  for (const [path, expected] of MANIFEST) {
    assert.equal(sha256(path), expected, path)
  }
})

test('discarded history request must not overwrite inspector after navigation', async () => {
  const api = createDeferredClient()
  const { renderer, probe } = await mountWorkspace({ client: api.client, userId: FIXTURE_USER.id })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await act(async () => {
    void renderer.root.findAllByProps({ 'data-action': 'inspect-evidence-change' })[0].props.onClick()
    await Promise.resolve()
  })
  const history = api.reads[1]
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  await resolvePending(api.reads[2], ok(FIXTURE_BUNDLES.empty))
  assert.equal(probe.current.state.inspector, null)
  await resolvePending(history, ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })))
  assert.equal(
    probe.current.state.inspector,
    null,
    'Discarded old history completion must not install the old evidence inspector in the newly selected investigation',
  )
  assert.equal(probe.current.state.selectedInvestigationId, FIXTURE_IDS.empty)
  assert.equal(probe.current.state.activeSection, 'overview')
  assert.deepEqual(probe.current.state.beforeBundles, {})
})

test('inspect compared records and removed records also drop after navigation', async () => {
  const { api, renderer, probe } = await readyComparable()
  await clickFirstAction(renderer, 'inspect-compared-records')
  const comparedHistory = api.reads[1]
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  await resolvePending(api.reads[2], ok(FIXTURE_BUNDLES.empty))
  await resolvePending(comparedHistory, ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })))
  assert.equal(probe.current.state.inspector, null)
  assert.equal(probe.current.state.activeSection, 'overview')

  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.evidenceOnly))
  await resolvePending(api.reads[3], ok(FIXTURE_BUNDLES.evidenceOnly))
  await clickFirstAction(renderer, 'inspect-removed-record')
  const removedHistory = api.reads[4]
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  await resolvePending(api.reads[5], ok(FIXTURE_BUNDLES.empty))
  await resolvePending(removedHistory, ok(FIXTURE_BUNDLES.evidenceOnlyBefore))
  assert.equal(probe.current.state.inspector, null)
  assert.notEqual(probe.current.state.inspector?.focus?.id, FIXTURE_COMMITMENT_ID)
})

test('history errors and access denial do not commit inspector or section state', async () => {
  const { api, renderer, probe } = await readyComparable()
  await clickFirstAction(renderer, 'inspect-evidence-change')
  await resolvePending(api.reads[1], fail('request_failed'))
  assert.equal(probe.current.state.inspector, null)
  assert.equal(probe.current.status, WORKSPACE_STATUS.ready)
  assert.equal(probe.current.state.bundle.investigation_id, FIXTURE_IDS.comparable)
  assert.equal(probe.current.state.activeSection, 'overview')

  await clickFirstAction(renderer, 'inspect-compared-records')
  await resolvePending(api.reads[2], fail('access_denied'))
  assert.equal(probe.current.status, WORKSPACE_STATUS.access_denied)
  assert.equal(probe.current.state.inspector, null)
  assert.equal(probe.current.state.bundle, null)
  assert.equal(probe.current.state.activeSection, 'overview')
})

test('logout and account change discard a pending inspect continuation', async () => {
  const { api, renderer, probe } = await readyComparable()
  await clickFirstAction(renderer, 'inspect-evidence-change')
  const history = api.reads[1]
  await act(async () => {
    renderer.update(createElement(MountedWorkspace, {
      client: api.client,
      userId: null,
      probe,
    }))
  })
  await resolvePending(history, ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })))
  assert.equal(probe.current.status, WORKSPACE_STATUS.signed_out)
  assert.equal(probe.current.state.inspector, null)
  assert.equal(probe.current.state.bundle, null)

  const otherUser = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const api2 = createDeferredClient()
  const mounted = await mountWorkspace({ client: api2.client, userId: FIXTURE_USER.id })
  await resolvePending(api2.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api2.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await clickFirstAction(mounted.renderer, 'inspect-compared-records')
  const pending = api2.reads[1]
  await act(async () => {
    mounted.renderer.update(createElement(MountedWorkspace, {
      client: api2.client,
      userId: otherUser,
      probe: mounted.probe,
    }))
  })
  await resolvePending(api2.lists[1], ok(catalogFor(FIXTURE_IDS.empty)))
  if (api2.reads[2]) await resolvePending(api2.reads[2], ok(FIXTURE_BUNDLES.empty))
  await resolvePending(pending, ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })))
  assert.notEqual(mounted.probe.current.state.selectedInvestigationId, FIXTURE_IDS.comparable)
  assert.equal(mounted.probe.current.state.inspector, null)
  assert.notEqual(mounted.probe.current.state.inspector?.kind, 'before-state')
})

test('a newer saved head while selectedVersionId is still null rejects the old change', async () => {
  const { api, renderer, probe } = await readyComparable()
  await clickFirstAction(renderer, 'inspect-evidence-change')
  const staleHistory = api.reads[1]
  await startAction(() => probe.current.actions.refresh())
  await resolvePending(api.lists[1], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty)))
  const newerHead = versioned(FIXTURE_BUNDLES.comparable, {
    versionId: FIXTURE_VERSIONS.v3,
    headVersionId: FIXTURE_VERSIONS.v3,
  })
  await resolvePending(api.reads[2], ok(newerHead))
  assert.equal(probe.current.state.selectedVersionId, null)
  assert.equal(probe.current.state.bundle.version.id, FIXTURE_VERSIONS.v3)
  await resolvePending(staleHistory, ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })))
  assert.equal(
    probe.current.state.inspector,
    null,
    'Old evidence change must not render against a newer saved observation',
  )
  assert.equal(probe.current.state.activeSection, 'overview')

  await clickFirstAction(renderer, 'inspect-evidence-change')
  await resolvePending(
    api.reads[3],
    ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })),
  )
  assert.equal(probe.current.state.inspector?.kind, 'evidence-change')
  assert.equal(String(probe.current.state.inspector.change.position), FIXTURE_POSITION)
  assert.equal(probe.current.state.bundle.version.id, FIXTURE_VERSIONS.v3)
  assert.equal(probe.current.state.activeSection, 'changed')
})

test('a current inspect still opens the matching evidence after a discarded race', async () => {
  const { api, renderer, probe } = await readyComparable()
  await clickFirstAction(renderer, 'inspect-evidence-change')
  const stale = api.reads[1]
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  await resolvePending(api.reads[2], ok(FIXTURE_BUNDLES.empty))
  await resolvePending(stale, ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })))
  assert.equal(probe.current.state.inspector, null)

  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.comparable))
  await resolvePending(api.reads[3], ok(FIXTURE_BUNDLES.comparable))
  await clickFirstAction(renderer, 'inspect-evidence-change')
  await resolvePending(
    api.reads[4],
    ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })),
  )
  assert.equal(probe.current.state.inspector?.kind, 'evidence-change')
  assert.equal(String(probe.current.state.inspector.change.position), FIXTURE_POSITION)
  assert.equal(probe.current.state.selectedInvestigationId, FIXTURE_IDS.comparable)
  assert.equal(probe.current.state.activeSection, 'changed')
})
