import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createInvestigationWorkspaceClient } from '../src/lib/investigationWorkspaceClient.js'
import { createWorkspaceHandler } from '../supabase/functions/investigation-workspace/handler.mjs'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import { FIXTURE_USER, fixtureCatalog, deferred } from '../src/lib/investigationWorkspaceFixtures.js'
import { versionNavigationFixture } from './versionNavigationFixture.mjs'

const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'tests/.compiled/VersionNavigation.mjs')
mkdirSync(join(root, 'tests/.compiled'), { recursive: true })
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({ absWorkingDir: root, stdin: { contents: `export {default as Navigation} from './src/components/InvestigationVersionNavigation.jsx'; export {default as Workspace} from './src/components/PrivateInvestigationWorkspace.jsx'`, resolveDir: root, loader: 'jsx' }, outfile: output, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react','react/jsx-runtime'], plugins: [{ name: 'css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }] })
const { Navigation, Workspace } = await import(pathToFileURL(output))
const text = node => node == null ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.children ?? node.props?.children) : String(node)
const button = (tree, label) => tree.root.findAllByType('button').find(b => text(b) === label)
const click = async (tree, label) => act(async () => { await button(tree, label).props.onClick() })
const plain = tree => text(tree.toJSON())

function apiFixture() {
  const versions = versionNavigationFixture(), calls = [], control = { head: versions[2], fail: false, mismatch: false, deny: false, pending: null }
  const handler = createWorkspaceHandler({ authenticate: async () => FIXTURE_USER, rpc: async (action, input) => {
    calls.push({ action, input })
    if (action === 'list') return { data: fixtureCatalog() }
    if (action !== 'read' || control.deny) return { error: { code: '42501' } }
    if (control.pending) return control.pending.promise
    if (control.fail) return { error: { code: 'XX000' } }
    const found = control.mismatch ? control.head : input.version_id ? versions.find(b => b.version.id === input.version_id) : control.head
    return found ? { data: { ...found, head_version_id: control.head.version.id } } : { error: { code: '42501' } }
  } })
  const client = createInvestigationWorkspaceClient({ functions: { invoke: async (_name, options) => {
    const response = await handler(new Request('https://local.invalid/investigation-workspace', { method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' }, body: JSON.stringify(options.body) }))
    return response.ok ? { data: await response.json() } : { error: { context: response } }
  } } })
  return { versions, calls, control, client }
}
async function mount(api) {
  let current, tree
  function Probe({ userId = FIXTURE_USER.id }) {
    current = usePrivateInvestigationWorkspace({ client: api.client, userId, active: true, initialInvestigationId: api.versions[2].investigation_id })
    return createElement(Workspace, { workspace: current })
  }
  await act(async () => { tree = TestRenderer.create(createElement(Probe)); await new Promise(r => setTimeout(r, 0)) })
  return { tree, current: () => current, signOut: () => act(() => tree.update(createElement(Probe, { userId: null }))) }
}

test('navigation emits exact predecessor/review IDs and a fresh-head request, and pending writes block every route', () => {
  const [first,,head] = versionNavigationFixture(), calls = []; let tree
  const onSelectVersion = (...args) => calls.push(args)
  act(() => { tree = TestRenderer.create(createElement(Navigation, { bundle: head, onSelectVersion })) })
  assert.deepEqual(calls, [])
  act(() => button(tree, 'Previous saved version').props.onClick())
  act(() => button(tree, 'Refresh latest saved version').props.onClick())
  act(() => button(tree, 'Open reviewed version').props.onClick())
  assert.deepEqual(calls, [[head.investigation_id, head.version.predecessor_id], [head.investigation_id, null], [head.investigation_id, head.review.version_id]])
  for (const key of ['pendingReview','pendingReviewDecision','decisionSavedNeedsRefresh','pendingChecksRun']) {
    act(() => tree.update(createElement(Navigation, { bundle: head, state: { [key]: true }, onSelectVersion })))
    assert.ok(tree.root.findAllByType('button').every(b => b.props.disabled))
    act(() => button(tree, 'Refresh latest saved version').props.onClick()); assert.equal(calls.length, 3)
  }
  act(() => tree.update(createElement(Navigation, { bundle: first, onSelectVersion })))
  assert.equal(button(tree, 'Previous saved version').props.disabled, true)
  assert.match(plain(tree), /first saved version/); assert.match(plain(tree), /not when a reported event happened/)
  act(() => tree.unmount())
})

test('real client, handler and workspace hook switch all saved sections, preserve review and fetch a newly advanced head', async () => {
  const api = apiFixture(), p = await mount(api), [first, baseline, head] = api.versions
  assert.match(plain(p.tree), /Synthetic question at revision 3/)
  act(() => p.current().actions.setInspector({ kind: 'citation', versionId: head.version.id }))
  await click(p.tree, 'Previous saved version')
  assert.equal(p.current().state.bundle.version.id, baseline.version.id)
  assert.equal(p.current().state.panels.commitments[0].deadline_text, 'Synthetic deadline 2.')
  assert.equal(p.current().state.inspector, null); assert.deepEqual(p.current().state.beforeBundles, {})
  await click(p.tree, 'Previous saved version')
  assert.match(plain(p.tree), /Synthetic question at revision 1/)
  assert.equal(p.current().state.bundle.comparison.mode, 'historical_before_review')
  assert.equal(p.current().state.bundle.review.version_id, baseline.version.id)
  await click(p.tree, 'Open reviewed version')
  assert.equal(p.current().state.bundle.version.id, baseline.version.id)
  const next = structuredClone(head)
  next.version.id = '99999994-9999-4999-8999-999999999994'; next.version.revision = 4; next.version.predecessor_id = head.version.id
  next.version.state.question = 'Newly recorded revision 4?'; next.comparison.after_version_id = next.version.id
  api.control.head = next; api.versions.push(next)
  await click(p.tree, 'Return to latest saved version')
  assert.equal(p.current().state.bundle.version.id, next.version.id)
  assert.equal(p.current().state.selectedVersionId, null)
  assert.equal(api.calls.filter(c => c.action === 'read').at(-1).input.version_id, undefined)
  assert.equal(api.calls.some(c => !['list','read'].includes(c.action)), false)
  act(() => p.tree.unmount())
})

test('failed and mismatched version reads leave a retryable state and retry the requested exact version', async () => {
  for (const mode of ['fail', 'mismatch']) {
    const api = apiFixture(), p = await mount(api)
    api.control[mode] = true
    await click(p.tree, 'Previous saved version')
    assert.equal(p.current().status, 'unavailable'); assert.equal(p.current().state.loadingBundle, false)
    assert.equal(p.current().state.bundle, null)
    assert.equal(p.current().state.selectedVersionId, api.versions[1].version.id)
    api.control[mode] = false
    await click(p.tree, 'Retry')
    assert.equal(p.current().state.bundle.version.id, api.versions[1].version.id)
    assert.equal(p.current().state.bundle.review.version_id, api.versions[1].version.id)
    act(() => p.tree.unmount())
  }
})

test('revocation clears private versions and a late predecessor read cannot reappear after sign-out', async () => {
  const api = apiFixture(), p = await mount(api)
  api.control.deny = true; await click(p.tree, 'Previous saved version')
  assert.equal(p.current().status, 'access_denied'); assert.equal(p.current().state.bundle, null)
  assert.deepEqual(p.current().state.beforeBundles, {})
  act(() => p.tree.unmount())
  const delayed = apiFixture(), q = await mount(delayed), pending = deferred(); delayed.control.pending = pending
  let request
  act(() => { request = button(q.tree, 'Previous saved version').props.onClick() })
  q.signOut()
  await act(async () => { pending.resolve({ data: delayed.versions[1] }); await request })
  assert.equal(q.current().status, 'signed_out'); assert.equal(q.current().state.bundle, null)
  assert.doesNotMatch(plain(q.tree), /Synthetic question at revision/)
  act(() => q.tree.unmount())
})
