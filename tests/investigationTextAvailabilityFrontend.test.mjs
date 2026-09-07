import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createElement, Fragment } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import { FIXTURE_BUNDLES, FIXTURE_USER, createLocalInvestigationWorkspaceClient } from '../src/lib/investigationWorkspaceFixtures.js'

const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'tests/.compiled/TextAvailability.mjs')
mkdirSync(join(root, 'tests/.compiled'), { recursive: true })
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({ absWorkingDir: root, stdin: { contents: `export {default as Inventory} from './src/components/InvestigationTextAvailability.jsx'; export {default as Workspace,PrivateInvestigationInspector as Inspector} from './src/components/PrivateInvestigationWorkspace.jsx'`, resolveDir: root, loader: 'jsx' }, outfile: output, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react','react/jsx-runtime'], plugins: [{ name: 'css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }] })
const { Inventory, Workspace, Inspector } = await import(pathToFileURL(output))
const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.children ?? n.props?.children) : String(n)
const buttons = tree => tree.root.findAllByType('button').filter(b => text(b) === 'Inspect retained text')
const open = (tree, prefix) => {
  const disclosure = tree.root.findAllByType('details').find(d => d.children.some(c => c.type === 'summary' && text(c).startsWith(prefix)))
  const target = { open: true }; act(() => disclosure.props.onToggle({ target, currentTarget: target }))
}

test('text groups disclose bounded records and inspect exact saved positions without changing the source bundle', () => {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable), calls = []
  bundle.observation.snapshot.inputs = Array.from({ length: 23 }, (_, i) => ({ position: String(BigInt('9007199254740993') + BigInt(i)), capture: { id: `fixture-${i}`, payload: { summary: 'Retained summary' } } }))
  let tree; act(() => { tree = TestRenderer.create(createElement(Inventory, { bundle, onOpenInput: (...args) => calls.push(args) })) })
  assert.equal(buttons(tree).length, 0); open(tree, 'Summary retained')
  assert.equal(buttons(tree).length, 10)
  act(() => tree.root.findAllByType('button').find(b => text(b).startsWith('Show more retained records')).props.onClick())
  assert.equal(buttons(tree).length, 20)
  act(() => buttons(tree)[0].props.onClick())
  assert.deepEqual(calls[0][0], { investigationId: bundle.investigation_id, versionId: bundle.version.id, observationId: bundle.observation.id, position: '9007199254740993' })
  assert.equal(calls[0][1], bundle)
  assert.match(text(tree.toJSON()), /Body text may be partial/)
  const old = structuredClone(bundle); old.version.id = 'older'
  act(() => tree.update(createElement(Inventory, { bundle: old })))
  assert.equal(buttons(tree).length, 0); open(tree, 'Summary retained')
  assert.equal(buttons(tree).length, 10); assert.ok(buttons(tree).every(b => b.props.disabled))
  act(() => tree.unmount())
})

test('unavailable and empty inventories do not report absence of evidence', () => {
  let tree; act(() => { tree = TestRenderer.create(createElement(Inventory, { bundle: null })) })
  assert.match(text(tree.toJSON()), /unavailable.*not a count of zero/)
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable); bundle.observation.snapshot.inputs = []
  act(() => tree.update(createElement(Inventory, { bundle })))
  assert.match(text(tree.toJSON()), /does not establish an absence of evidence elsewhere/)
  assert.equal(buttons(tree).length, 0); act(() => tree.unmount())
})

test('gaps retain unresolved questions without declarations; exact inspection is local and clears on version change or sign-out', async () => {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable), old = structuredClone(bundle)
  bundle.version.state.coverage = []; bundle.version.state.unresolved_questions = ['Which primary document is still missing?']
  old.version.id = old.version.predecessor_id; old.version.revision = 1; old.version.predecessor_id = null
  old.observation.snapshot.inputs = []; old.version.state.unresolved_questions = ['Historical unresolved question.']; old.version.state.coverage = []
  const local = createLocalInvestigationWorkspaceClient({ scenario: 'populated' }), reads = []; let current, tree
  const client = { ...local, read: async (_id, version) => { reads.push(version); return { data: version === old.version.id ? old : bundle } }, markReviewed() { assert.fail('Inventory must not mark reviewed') } }
  function Probe({ userId = FIXTURE_USER.id }) {
    current = usePrivateInvestigationWorkspace({ client, userId, active: true, initialInvestigationId: bundle.investigation_id })
    return createElement(Fragment, null, createElement(Workspace, { workspace: current }), createElement(Inspector, { workspace: current }))
  }
  await act(async () => { tree = TestRenderer.create(createElement(Probe)); await new Promise(r => setTimeout(r, 0)) })
  const gap = tree.root.findByProps({ id: 'piw-gaps' })
  assert.match(text(gap), /Which primary document is still missing\?/)
  assert.match(text(gap), /No collection/)
  const readCount = reads.length; open(tree, 'Body text retained')
  act(() => buttons(tree)[0].props.onClick())
  assert.equal(current.state.inspector.kind, 'retained-input'); assert.equal(reads.length, readCount)
  await act(async () => { await current.actions.selectVersion(bundle.investigation_id, old.version.id) })
  assert.equal(current.state.inspector, null); assert.equal(buttons(tree).length, 0)
  assert.match(text(tree.root.findByProps({ id: 'piw-gaps' })), /Historical unresolved question/)
  assert.doesNotMatch(text(tree.root.findByProps({ id: 'piw-gaps' })), /Which primary document/)
  act(() => tree.update(createElement(Probe, { userId: null })))
  assert.equal(tree.root.findAllByProps({ id: 'piw-gaps' }).length, 0)
  assert.equal(current.state.bundle, null); act(() => tree.unmount())
})
