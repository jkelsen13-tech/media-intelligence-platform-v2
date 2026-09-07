import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { definitionFixture } from './definitionRevisionFixture.mjs'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import { deferred, FIXTURE_USER, createLocalInvestigationWorkspaceClient } from '../src/lib/investigationWorkspaceFixtures.js'

const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'tests/.compiled/DefinitionRevisions.mjs')
mkdirSync(join(root, 'tests/.compiled'), { recursive: true })
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({ absWorkingDir: root, entryPoints: ['src/components/InvestigationDefinitionRevisions.jsx'], outfile: output, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react','react/jsx-runtime'] })
const { default: Revisions } = await import(pathToFileURL(output))
const plain = tree => JSON.stringify(tree.toJSON())
const text = value => Array.isArray(value) ? value.map(text).join('') : typeof value === 'string' || typeof value === 'number' ? String(value) : value?.props ? text(value.props.children) : ''
function details(tree, label) {
  return tree.root.findAllByType('details').find(d => d.children.some(child => child.type === 'summary' && text(child.props.children).includes(label)))
}
function open(node) { const target = { open: true }; act(() => node.props.onToggle({ target, currentTarget: target })) }
const loadButton = tree => tree.root.findAllByType('button')[0]

test('field comparison loads only on request and renders deadlines/stages lazily with honest status copy', async () => {
  const { after, before } = definitionFixture(), calls = []
  let tree
  const props = { bundle: after, onLoadBeforeVersion: async id => { calls.push(id); return { data: before } } }
  act(() => { tree = TestRenderer.create(createElement(Revisions, props)) })
  assert.equal(calls.length, 0); assert.doesNotMatch(plain(tree), /By August 31/)
  await act(async () => { await loadButton(tree).props.onClick() })
  assert.deepEqual(calls, [before.version.id])
  act(() => tree.update(createElement(Revisions, { ...props, beforeBundle: before })))
  open(details(tree, 'Commitment · Updated record'))
  assert.doesNotMatch(plain(tree), /By August 31/)
  assert.match(plain(tree), /Saved context/)
  assert.match(plain(tree), /No outcome evidence/)
  assert.match(plain(tree), /Intervening edits are not enumerated here/)
  open(details(tree, 'Deadline wording'))
  assert.match(plain(tree), /By August 31/); assert.match(plain(tree), /By September 30/)
  open(details(tree, 'Recorded status'))
  assert.match(plain(tree), /No follow-up found in the declared collection/)
  assert.match(plain(tree), /not proof the commitment caused it/)
  assert.match(plain(tree), /Removed record/)
  act(() => tree.unmount())
})
test('before/after excerpt rendering receives each exact saved bundle, without substituting current evidence', () => {
  const { after, before } = definitionFixture(), rendered = []
  before.version.state.hypotheses[0].evidence = structuredClone(after.version.state.hypotheses[0].evidence)
  before.version.state.hypotheses[0].evidence[0].note = 'Prior recorded note.'
  let tree
  const renderEvidence = (evidence, bundle) => { rendered.push({ evidence, bundle }); return createElement('p', null, bundle.version.id) }
  act(() => { tree = TestRenderer.create(createElement(Revisions, { bundle: after, beforeBundle: before, renderEvidence })) })
  open(details(tree, 'Hypothesis · Updated record')); open(details(tree, 'Retained excerpts'))
  assert.equal(rendered[0].bundle, before); assert.equal(rendered[1].bundle, after)
  assert.equal(rendered[0].evidence, before.version.state.hypotheses[0].evidence)
  assert.equal(rendered[1].evidence, after.version.state.hypotheses[0].evidence)
  act(() => tree.unmount())
})
test('failed loads are retryable and late completion cannot populate a changed review baseline or unmounted comparison', async () => {
  const { after, before } = definitionFixture(), pending = deferred(); let tree
  const props = { bundle: after, onLoadBeforeVersion: () => pending.promise }
  act(() => { tree = TestRenderer.create(createElement(Revisions, props)) })
  act(() => { loadButton(tree).props.onClick() }); assert.equal(loadButton(tree).props.disabled, true)
  const newer = structuredClone(after); newer.review.id = 'new-receipt'
  act(() => tree.update(createElement(Revisions, { ...props, bundle: newer })))
  await act(async () => { pending.resolve({ data: before }); await pending.promise })
  assert.equal(tree.root.findAllByProps({ 'data-definition-revisions': 'ready' }).length, 0)
  act(() => tree.update(createElement(Revisions, { bundle: after, onLoadBeforeVersion: async () => ({ error: 'service_unavailable' }) })))
  await act(async () => { await loadButton(tree).props.onClick() }); assert.match(plain(tree), /Retry the comparison/)
  const closed = deferred()
  act(() => tree.update(createElement(Revisions, { bundle: after, onLoadBeforeVersion: () => closed.promise })))
  act(() => { loadButton(tree).props.onClick(); tree.unmount() })
  await act(async () => { closed.resolve({ data: before }); await closed.promise })
})
test('historical and mismatched baselines show no reversed field changes; scope changes retain an evidence-comparison warning', () => {
  const { after, before } = definitionFixture(); let tree
  after.comparison.mode = 'historical_before_review'
  act(() => { tree = TestRenderer.create(createElement(Revisions, { bundle: after, beforeBundle: before })) })
  assert.equal(tree.toJSON(), null)
  after.comparison.mode = 'scope_changed'
  act(() => tree.update(createElement(Revisions, { bundle: after, beforeBundle: before })))
  assert.match(plain(tree), /an evidence comparison is unavailable/)
  act(() => tree.update(createElement(Revisions, { bundle: after, beforeBundle: { ...before, investigation_id: 'other' } })))
  assert.match(plain(tree), /No field comparison is shown/)
  assert.equal(tree.root.findAllByProps({ 'data-definition-revisions': 'ready' }).length, 0)
  act(() => tree.unmount())
})
test('the existing workspace read lifecycle clears the whole comparison on revoked access without marking review', async () => {
  const { after, before } = definitionFixture(), local = createLocalInvestigationWorkspaceClient({ scenario: 'populated' })
  let deny = false, reviews = 0, current, tree
  const client = { ...local, read: async (_id, version) => version === before.version.id ? deny ? { error: { code: 'access_denied' }, data: null } : { data: before, error: null } : { data: after, error: null }, markReviewed: () => { reviews++; throw Error('Unexpected review') } }
  function Probe() {
    current = usePrivateInvestigationWorkspace({ client, userId: FIXTURE_USER.id, active: true, initialInvestigationId: after.investigation_id })
    return current.state.bundle ? createElement(Revisions, { bundle: current.state.bundle, beforeBundle: current.state.beforeBundles[before.version.id], onLoadBeforeVersion: current.actions.openBeforeVersion }) : createElement('p', null, current.status)
  }
  await act(async () => { tree = TestRenderer.create(createElement(Probe)); await new Promise(resolve => setTimeout(resolve, 0)) })
  await act(async () => { await loadButton(tree).props.onClick() })
  assert.equal(tree.root.findAllByProps({ 'data-definition-revisions': 'ready' }).length, 1)
  deny = true
  await act(async () => { await loadButton(tree).props.onClick() })
  assert.equal(current.state.bundle, null); assert.deepEqual(current.state.beforeBundles, {})
  assert.equal(current.status, 'access_denied'); assert.equal(reviews, 0)
  act(() => tree.unmount())
})
