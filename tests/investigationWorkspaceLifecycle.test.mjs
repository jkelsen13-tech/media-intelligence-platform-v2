import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement, useMemo } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { createInvestigationWorkspaceClient } from '../src/lib/investigationWorkspaceClient.js'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import {
  WORKSPACE_STATUS,
} from '../src/lib/investigationWorkspaceSession.js'
import {
  createLocalInvestigationWorkspaceClient,
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
  outfile: join(compiledDir, 'PrivateInvestigationWorkspace.lifecycle.mjs'),
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
  join(compiledDir, 'PrivateInvestigationWorkspace.lifecycle.mjs')
)

const APP = readFileSync(join(repoRoot, 'src/App.jsx'), 'utf8')
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

function textOf(node) {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

function treeText(renderer) {
  return textOf(renderer.toJSON())
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
  const items = all.items.filter((item) => ids.includes(item.investigation_id))
  return { ...all, items }
}

function versioned(bundle, { investigationId, versionId }) {
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

function findAction(renderer, action) {
  return renderer.root.findByProps({ 'data-action': action })
}

async function clickAction(renderer, action) {
  await act(async () => {
    void findAction(renderer, action).props.onClick()
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

test('supplied investigation workspace source checksums remain unchanged', () => {
  for (const [path, expected] of MANIFEST) {
    assert.equal(sha256(path), expected, path)
  }
})

test('memoized production client does not restart catalog on unrelated rerenders', async () => {
  assert.match(APP, /useMemo\(\s*\(\)\s*=>\s*createInvestigationWorkspaceClient\(supabase\)/)
  const listCalls = []
  const listPending = deferred()
  const supabase = {
    functions: {
      async invoke(_name, { body }) {
        if (body.action === 'list') {
          listCalls.push(body)
          return listPending.promise
        }
        return { data: { data: null, error: { code: 'invalid_request' } }, error: null }
      },
    },
  }
  function ProductionHarness({ tick }) {
    const client = useMemo(() => createInvestigationWorkspaceClient(supabase), [])
    const workspace = usePrivateInvestigationWorkspace({
      client,
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
  for (let tick = 1; tick <= 12; tick += 1) {
    await act(async () => {
      renderer.update(createElement(ProductionHarness, { tick }))
    })
  }
  assert.equal(listCalls.length, 1)
  assert.equal(renderer.root.findByProps({ 'data-tick': '12' }).props['data-catalog-count'], '0')
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

test('authentication failure clears private UI immediately and ignores a late success', async () => {
  const api = createDeferredClient()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  assert.equal(probe.current.status, WORKSPACE_STATUS.ready)
  assert.match(treeText(renderer), /Local visual fixture: what retained evidence/)

  await startAction(() => probe.current.actions.openBeforeVersion(FIXTURE_VERSIONS.v1))
  assert.equal(api.reads.length, 2)

  await clickAction(renderer, 'mark-reviewed')
  await resolvePending(api.marks[0], fail('authentication_required'))

  assert.equal(probe.current.status, WORKSPACE_STATUS.authentication_required)
  assert.equal(probe.current.state.bundle, null)
  assert.equal(probe.current.state.panels, null)
  assert.deepEqual(probe.current.state.beforeBundles, {})
  assert.equal(probe.current.state.pendingReview, null)
  assert.doesNotMatch(treeText(renderer), /Local visual fixture: what retained evidence/)
  assert.match(treeText(renderer), /Sign in to read assigned investigations/)

  await resolvePending(api.reads[1], ok(FIXTURE_BUNDLES.comparable))
  assert.equal(probe.current.status, WORKSPACE_STATUS.authentication_required)
  assert.equal(probe.current.state.bundle, null)
  assert.deepEqual(probe.current.state.beforeBundles, {})
  assert.doesNotMatch(treeText(renderer), /Local visual fixture: what retained evidence/)
})

test('denied investigation access masks the bundle and drops a late concurrent read', async () => {
  const api = createDeferredClient()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  assert.equal(probe.current.status, WORKSPACE_STATUS.ready)

  await startAction(() => probe.current.actions.openBeforeVersion(FIXTURE_VERSIONS.v1))
  await clickAction(renderer, 'mark-reviewed')
  await resolvePending(api.marks[0], fail('access_denied'))

  assert.equal(probe.current.status, WORKSPACE_STATUS.access_denied)
  assert.equal(probe.current.state.bundle, null)
  assert.equal(probe.current.state.panels, null)
  assert.equal(
    probe.current.state.catalog.some((item) => item.investigation_id === FIXTURE_IDS.comparable),
    false,
  )
  assert.match(treeText(renderer), /This investigation is unavailable/)
  assert.doesNotMatch(treeText(renderer), /Local visual fixture: what retained evidence/)

  await resolvePending(api.reads[1], ok(FIXTURE_BUNDLES.comparable))
  assert.equal(probe.current.status, WORKSPACE_STATUS.access_denied)
  assert.equal(probe.current.state.bundle, null)
  assert.doesNotMatch(treeText(renderer), /The commitment may remain unimplemented/)
})

async function historySwitch(order) {
  const api = createDeferredClient()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable, FIXTURE_IDS.empty)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await startAction(() => probe.current.actions.openBeforeVersion(FIXTURE_VERSIONS.v1))
  const historyRead = api.reads[1]
  await startAction(() => probe.current.actions.selectInvestigation(FIXTURE_IDS.empty))
  const displayedB = api.reads[2]
  const historyBundle = versioned(FIXTURE_BUNDLES.comparable, {
    investigationId: FIXTURE_IDS.comparable,
    versionId: FIXTURE_VERSIONS.v1,
  })
  if (order === 'history-first') {
    await resolvePending(historyRead, ok(historyBundle))
    await resolvePending(displayedB, ok(FIXTURE_BUNDLES.empty))
  } else {
    await resolvePending(displayedB, ok(FIXTURE_BUNDLES.empty))
    await resolvePending(historyRead, ok(historyBundle))
  }
  assert.equal(probe.current.state.selectedInvestigationId, FIXTURE_IDS.empty)
  assert.equal(probe.current.state.bundle?.investigation_id, FIXTURE_IDS.empty)
  assert.equal(probe.current.state.beforeBundles[FIXTURE_VERSIONS.v1], undefined)
  assert.doesNotMatch(treeText(renderer), /The commitment may remain unimplemented/)
  assert.equal(Object.keys(probe.current.state.beforeBundles).length, 0)
  await act(async () => {
    renderer.unmount()
  })
}

test('history read completed before navigation does not attach to the next investigation', async () => {
  await historySwitch('history-first')
})

test('history read completed after the next investigation still discards the prior bundle', async () => {
  await historySwitch('displayed-first')
})

test('history reads do not cancel an in-flight displayed read', async () => {
  const api = createDeferredClient()
  const { probe } = await mountWorkspace({
    client: api.client,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  assert.equal(api.reads.length, 1)
  await startAction(() => probe.current.actions.openBeforeVersion(FIXTURE_VERSIONS.v1))
  assert.equal(api.reads.length, 2)
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  assert.equal(probe.current.status, WORKSPACE_STATUS.ready)
  assert.equal(probe.current.state.bundle?.investigation_id, FIXTURE_IDS.comparable)
  await resolvePending(
    api.reads[1],
    ok(versioned(FIXTURE_BUNDLES.comparable, { versionId: FIXTURE_VERSIONS.v1 })),
  )
  assert.equal(probe.current.state.beforeBundles[FIXTURE_VERSIONS.v1]?.version.id, FIXTURE_VERSIONS.v1)
  assert.equal(probe.current.state.bundle.version.id, FIXTURE_BUNDLES.comparable.version.id)
})

test('two before-version fetches keep independent identities after either completion order', async () => {
  const api = createDeferredClient()
  const { probe } = await mountWorkspace({
    client: api.client,
    userId: FIXTURE_USER.id,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await startAction(() => probe.current.actions.openBeforeVersion(FIXTURE_VERSIONS.v1))
  await startAction(() => probe.current.actions.openBeforeVersion(FIXTURE_VERSIONS.v3))
  const first = api.reads[1]
  const second = api.reads[2]
  await resolvePending(second, ok(versioned(FIXTURE_BUNDLES.historical, {
    investigationId: FIXTURE_IDS.comparable,
    versionId: FIXTURE_VERSIONS.v3,
  })))
  await resolvePending(first, ok(versioned(FIXTURE_BUNDLES.comparable, {
    investigationId: FIXTURE_IDS.comparable,
    versionId: FIXTURE_VERSIONS.v1,
  })))
  assert.equal(probe.current.state.beforeBundles[FIXTURE_VERSIONS.v1].version.id, FIXTURE_VERSIONS.v1)
  assert.equal(probe.current.state.beforeBundles[FIXTURE_VERSIONS.v3].version.id, FIXTURE_VERSIONS.v3)
  assert.equal(probe.current.state.bundle.version.id, FIXTURE_BUNDLES.comparable.version.id)
})

test('review conflict explanation survives reload, then a new click retries one payload', async () => {
  const receipts = ['11111111-1111-4111-8111-111111111101', '11111111-1111-4111-8111-111111111102']
  let issued = 0
  const api = createDeferredClient()
  const { renderer, probe } = await mountWorkspace({
    client: api.client,
    userId: FIXTURE_USER.id,
    randomUUID: () => receipts[issued++] ?? `overflow-${issued}`,
  })
  await resolvePending(api.lists[0], ok(catalogFor(FIXTURE_IDS.comparable)))
  await resolvePending(api.reads[0], ok(FIXTURE_BUNDLES.comparable))
  await clickAction(renderer, 'mark-reviewed')
  await resolvePending(api.marks[0], fail('version_conflict'))
  assert.equal(api.reads.length, 2)
  await resolvePending(api.reads[1], ok(FIXTURE_BUNDLES.comparable))
  assert.equal(probe.current.state.reviewConflict, true)
  assert.equal(probe.current.state.reviewError, 'version_conflict')
  assert.equal(probe.current.state.pendingReview, null)
  assert.match(treeText(renderer), /The review baseline changed/)
  assert.match(treeText(renderer), /not silently acknowledged/)
  findAction(renderer, 'mark-reviewed')

  await clickAction(renderer, 'mark-reviewed')
  assert.equal(api.marks[1].payload.receiptId, receipts[1])
  assert.equal(api.marks[1].payload.versionId, FIXTURE_BUNDLES.comparable.version.id)
  await resolvePending(api.marks[1], fail('request_failed'))
  assert.equal(probe.current.state.reviewConflict, false)
  assert.match(treeText(renderer), /Retry sends the same acknowledgement/)
  await clickAction(renderer, 'retry-review')
  assert.equal(api.marks[2].payload.receiptId, receipts[1])
  assert.deepEqual(api.marks[2].payload, api.marks[1].payload)
})

test('evidence-only addition and removed commitment both open compared records', async () => {
  const { renderer, probe } = await mountWorkspace({
    client: createLocalInvestigationWorkspaceClient({ scenario: 'evidence-only' }),
    userId: FIXTURE_USER.id,
  })
  for (let i = 0; i < 20 && probe.current.status !== WORKSPACE_STATUS.ready; i += 1) {
    await flushMicrotasks(2)
  }
  assert.equal(probe.current.status, WORKSPACE_STATUS.ready)
  assert.match(treeText(renderer), /did evidence enter after a commitment was removed/)
  findAction(renderer, 'open-compared-version')
  findAction(renderer, 'inspect-evidence-change')
  findAction(renderer, 'inspect-removed-record')

  await clickAction(renderer, 'inspect-evidence-change')
  for (let i = 0; i < 20 && probe.current.state.inspector?.kind !== 'evidence-change'; i += 1) {
    await flushMicrotasks(2)
  }
  assert.equal(probe.current.state.inspector?.kind, 'evidence-change')
  assert.equal(String(probe.current.state.inspector.change.position), FIXTURE_POSITION)
  assert.equal(typeof probe.current.state.inspector.change.position, 'string')
  assert.match(treeText(renderer), /Position 9007199254740993/)

  await clickAction(renderer, 'inspect-removed-record')
  for (let i = 0; i < 20 && probe.current.state.inspector?.kind !== 'before-state'; i += 1) {
    await flushMicrotasks(2)
  }
  assert.equal(probe.current.state.inspector?.kind, 'before-state')
  assert.equal(probe.current.state.inspector.focus.group, 'commitments')
  assert.equal(probe.current.state.inspector.focus.id, FIXTURE_COMMITMENT_ID)
  assert.match(treeText(renderer), /Collect the missing document/)
  assert.equal(
    probe.current.state.beforeBundles[FIXTURE_VERSIONS.v1].version.state.commitments[0].id,
    FIXTURE_COMMITMENT_ID,
  )

  await clickAction(renderer, 'open-compared-version')
  for (let i = 0; i < 20 && probe.current.state.bundle?.version?.id !== FIXTURE_VERSIONS.v1; i += 1) {
    await flushMicrotasks(2)
  }
  assert.equal(probe.current.state.selectedVersionId, FIXTURE_VERSIONS.v1)
  assert.equal(probe.current.state.bundle.version.id, FIXTURE_VERSIONS.v1)
  findAction(renderer, 'show-current-version')
  await clickAction(renderer, 'show-current-version')
  for (let i = 0; i < 20 && probe.current.state.selectedVersionId !== null; i += 1) {
    await flushMicrotasks(2)
  }
  assert.equal(probe.current.state.selectedVersionId, null)
  assert.equal(probe.current.state.bundle.version.id, FIXTURE_VERSIONS.v2)
})
