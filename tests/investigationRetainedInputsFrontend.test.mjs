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

const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'tests/.compiled/RetainedInputs.mjs')
mkdirSync(join(root, 'tests/.compiled'), { recursive: true })
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({ absWorkingDir: root, stdin: { contents: `export {default as Search,RetainedInputInspector as Inspector} from './src/components/InvestigationRetainedInputs.jsx'; export {default as Workspace,PrivateInvestigationInspector as WorkspaceInspector} from './src/components/PrivateInvestigationWorkspace.jsx'`, resolveDir: root, loader: 'jsx' }, outfile: output, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react','react/jsx-runtime'], plugins: [{ name: 'css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }] })
const { Search, Inspector, Workspace, WorkspaceInspector } = await import(pathToFileURL(output))
const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.children ?? n.props?.children) : String(n)
const button = (tree, label) => tree.root.findAllByType('button').find(b => text(b) === label)
function open(tree) {
  const disclosure = tree.root.findAllByType('details').find(d => d.children.some(c => c.type === 'summary' && text(c) === 'Browse and search saved inputs'))
  const target = { open: true }; act(() => disclosure.props.onToggle({ target, currentTarget: target }))
}
function search(tree, query) {
  act(() => tree.root.findByProps({ type: 'search' }).props.onChange({ target: { value: query } }))
  act(() => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }))
}
const inspectButtons = tree => tree.root.findAllByType('button').filter(b => text(b) === 'Inspect retained input')

test('finder is lazy, submits literal text locally, pages results and keeps no-match/missing-text limits visible', () => {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable)
  for (let i = 20; i < 45; i++) bundle.observation.snapshot.inputs.push({ position: String(i), capture: { id: `fixture-${i}`, payload: i === 20 ? {} : { title: `Paging fixture ${i}` } }, record_version: null })
  let tree; act(() => { tree = TestRenderer.create(createElement(Search, { bundle, onOpenInput() {} })) })
  assert.equal(tree.root.findAllByType('form').length, 0); open(tree)
  assert.equal(inspectButtons(tree).length, 10)
  act(() => button(tree, 'Show more inputs (22 remaining)').props.onClick())
  assert.equal(inspectButtons(tree).length, 20)
  act(() => tree.root.findByProps({ type: 'search' }).props.onChange({ target: { value: 'WITHDRAWN' } }))
  assert.equal(inspectButtons(tree).length, 20); assert.match(text(tree.toJSON()), /Submit the edited text/)
  search(tree, 'WITHDRAWN'); assert.equal(inspectButtons(tree).length, 1)
  assert.match(text(tree.toJSON()), /Recorded source status/)
  act(() => tree.root.findByType('select').props.onChange({ target: { value: 'capture' } }))
  assert.equal(inspectButtons(tree).length, 0); assert.match(text(tree.toJSON()), /not evidence that nothing exists elsewhere/)
  act(() => button(tree, 'Clear search and filters').props.onClick())
  assert.equal(inspectButtons(tree).length, 10); assert.equal(tree.root.findByType('select').props.value, 'all')
  assert.match(text(tree.toJSON()), /no searchable text/)
  act(() => tree.unmount())
})

test('record selection uses exact saved identity and unsafe retained URLs never become links', () => {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable), calls = []; let tree
  act(() => { tree = TestRenderer.create(createElement(Search, { bundle, onOpenInput: (...args) => calls.push(args) })) }); open(tree)
  search(tree, 'Corrected fixture node')
  act(() => inspectButtons(tree)[0].props.onClick())
  const selection = calls[0][0]; assert.equal(calls[0][1], bundle); assert.equal(selection.position, '5')
  act(() => tree.update(createElement(Inspector, { bundle, selection })))
  assert.match(text(tree.toJSON()), /Corrected fixture node/)
  act(() => tree.update(createElement(Inspector, { bundle, selection: { ...selection, position: '6' } })))
  assert.equal(tree.root.findAllByType('a').some(a => /^javascript:/i.test(a.props.href)), false)
  assert.match(text(tree.toJSON()), /not opened as a link/)
  act(() => tree.update(createElement(Inspector, { bundle, selection: { ...selection, versionId: 'older' } })))
  assert.match(text(tree.toJSON()), /No current record is substituted/)
  act(() => tree.unmount())
})

test('workspace searches perform no reads or writes and clear query/inspector on version changes and sign-out', async () => {
  const currentBundle = structuredClone(FIXTURE_BUNDLES.comparable), old = structuredClone(currentBundle)
  old.version.id = old.version.predecessor_id; old.version.revision = 1; old.version.predecessor_id = null
  old.observation.snapshot.inputs = []
  const local = createLocalInvestigationWorkspaceClient({ scenario: 'populated' }), calls = []; let current, tree
  const client = { ...local, read: async (_id, version) => { calls.push(version); return { data: version === old.version.id ? old : currentBundle } }, markReviewed() { assert.fail('Search must not write a review') } }
  function Probe({ userId = FIXTURE_USER.id }) {
    current = usePrivateInvestigationWorkspace({ client, userId, active: true, initialInvestigationId: currentBundle.investigation_id })
    return createElement(Fragment, null, createElement(Workspace, { workspace: current }), createElement(WorkspaceInspector, { workspace: current }))
  }
  await act(async () => { tree = TestRenderer.create(createElement(Probe)); await new Promise(r => setTimeout(r, 0)) })
  const reads = calls.length; open(tree); search(tree, 'Corrected fixture node')
  act(() => inspectButtons(tree)[0].props.onClick())
  assert.equal(current.state.inspector.kind, 'retained-input'); assert.equal(calls.length, reads)
  await act(async () => { await current.actions.selectVersion(currentBundle.investigation_id, old.version.id) })
  assert.equal(current.state.inspector, null); open(tree)
  assert.equal(tree.root.findByProps({ type: 'search' }).props.value, '')
  assert.match(text(tree.toJSON()), /No retained inputs are available to inspect/)
  act(() => tree.update(createElement(Probe, { userId: null })))
  assert.equal(current.state.bundle, null); assert.equal(tree.root.findAllByProps({ type: 'search' }).length, 0)
  assert.doesNotMatch(text(tree.toJSON()), /Corrected fixture node/)
  act(() => tree.unmount())
})
