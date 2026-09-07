import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { retainedInputImpact } from '../supabase/functions/investigation-input-impact/impact.mjs'
import { inputImpactMatches } from '../src/lib/investigationInputImpactClient.js'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import { FIXTURE_BUNDLES, FIXTURE_IDS, FIXTURE_USER, createLocalInvestigationWorkspaceClient, deferred } from '../src/lib/investigationWorkspaceFixtures.js'

const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'tests/.compiled/InputImpact.mjs')
mkdirSync(join(root, 'tests/.compiled'), { recursive: true })
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({ absWorkingDir: root, entryPoints: ['src/components/InvestigationInputImpact.jsx'], outfile: output,
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] })
const { default: Impact } = await import(pathToFileURL(output))
const position = '9007199254740993'
function fixture() {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable)
  bundle.observation.snapshot.assessments[0].context_positions = [position]
  return bundle
}
const plain = tree => JSON.stringify(tree.toJSON())
const lookup = tree => tree.root.findAllByType('button')[0]
async function settle(pending, result) { await act(async () => { pending.resolve(result); await pending.promise }) }

test('response binding rejects wrong versions, private-state changes, fabricated references and duplicate targets', () => {
  const bundle = fixture(), result = retainedInputImpact(bundle, position)
  assert.equal(inputImpactMatches(bundle, position, result), true)
  for (const change of [r => { r.observation_id = 'other' }, r => { r.version_id = 'other' }, r => { r.position = '1' },
    r => { r.publicly_eligible = true }, r => { r.assessment_effect = 'reassessed' }, r => { r.scope = 'all_sources' },
    r => r.context_assessment_ids.push('missing'), r => r.context_assessment_ids.push(r.context_assessment_ids[0]),
    r => { r.hypotheses[0].citation_indices = [999] }, r => { r.hypotheses[0].citation_indices = [0, 0] },
    r => { r.hypotheses[0].assessment_ids = ['unlinked'] }, r => r.hypotheses.push(r.hypotheses[0]),
    r => { r.stages[0].commitment_id = 'other' }, r => r.stages.push(r.stages[0]),
    r => r.unknown_context_assessment_ids.push(r.context_assessment_ids[0]),
  ]) {
    const altered = structuredClone(result); change(altered)
    assert.equal(inputImpactMatches(bundle, position, altered), false)
  }
})

test('lookup is explicit, opens exact saved evidence, and labels context separately from citations', async () => {
  const bundle = fixture(), result = retainedInputImpact(bundle, position)
  const pending = deferred(), calls = [], opened = []
  const client = { read: (...args) => { calls.push(args); return pending.promise } }
  let tree
  act(() => { tree = TestRenderer.create(createElement(Impact, { bundle, position, client, onOpenCitation: (...args) => opened.push(args) })) })
  assert.equal(calls.length, 0)
  act(() => { lookup(tree).props.onClick() })
  assert.equal(lookup(tree).props.disabled, true)
  assert.deepEqual(calls, [[bundle.investigation_id, bundle.version.id, position]])
  await settle(pending, { data: result })
  assert.match(plain(tree), /direct citation/)
  assert.match(plain(tree), /linked assessment/)
  assert.match(plain(tree), /not independent sources/)
  const open = tree.root.findAllByType('button').find(button => button.props.children === 'Open exact excerpt in inspector')
  act(() => open.props.onClick())
  assert.equal(opened[0][1], bundle)
  assert.equal(opened[0][0], bundle.version.state.hypotheses[0].evidence[0])
  act(() => tree.unmount())
})

test('late responses cannot populate a different version or a closed source disclosure', async () => {
  const bundle = fixture(), next = structuredClone(bundle); next.version.id = 'next-version'
  const pending = deferred(), terminal = []
  const client = { read: () => pending.promise }
  let tree
  act(() => { tree = TestRenderer.create(createElement(Impact, { bundle, position, client, onAccessFailure: code => terminal.push(code) })) })
  act(() => { lookup(tree).props.onClick() })
  act(() => tree.update(createElement(Impact, { bundle: next, position, client, onAccessFailure: code => terminal.push(code) })))
  assert.doesNotMatch(plain(tree), /Reading saved references/)
  await settle(pending, { error: { code: 'access_denied' } })
  assert.deepEqual(terminal, [])
  assert.equal(tree.root.findAllByProps({ 'data-input-impact': position }).length, 0)
  const closed = deferred(), closedClient = { read: () => closed.promise }
  act(() => tree.update(createElement(Impact, { bundle, position, client: closedClient, onAccessFailure: code => terminal.push(code) })))
  act(() => { lookup(tree).props.onClick(); tree.unmount() })
  await settle(closed, { error: { code: 'authentication_required' } })
  assert.deepEqual(terminal, [])
})

test('an unavailable service permits an explicit retry; mismatched results never show saved references', async () => {
  const bundle = fixture(), result = retainedInputImpact(bundle, position)
  let count = 0
  const client = { read: async () => ++count === 1 ? { error: { code: 'service_unavailable' } } : { data: { ...result, position: '1' } } }
  let tree
  act(() => { tree = TestRenderer.create(createElement(Impact, { bundle, position, client })) })
  await act(async () => { await lookup(tree).props.onClick() })
  assert.match(plain(tree), /Retry the lookup/)
  await act(async () => { await lookup(tree).props.onClick() })
  assert.match(plain(tree), /do not match this saved version/)
  assert.equal(tree.root.findAllByProps({ 'data-input-impact': position }).length, 0)
  act(() => tree.unmount())
})

test('active access denial clears the whole workspace while a departed bundle cannot clear a newer view', async () => {
  const client = createLocalInvestigationWorkspaceClient({ scenario: 'populated' })
  let current, tree
  function Probe({ userId }) {
    current = usePrivateInvestigationWorkspace({ client, userId, active: true, initialInvestigationId: FIXTURE_IDS.comparable })
    return null
  }
  await act(async () => { tree = TestRenderer.create(createElement(Probe, { userId: FIXTURE_USER.id })); await new Promise(resolve => setTimeout(resolve, 0)) })
  assert.ok(current.state.bundle)
  const old = current.state.bundle
  await act(async () => { await current.actions.selectInvestigation(FIXTURE_IDS.scope) })
  act(() => current.actions.rejectInputImpactAccess('access_denied', old))
  assert.ok(current.state.bundle)
  const active = current.state.bundle
  act(() => current.actions.rejectInputImpactAccess('access_denied', active))
  assert.equal(current.state.bundle, null)
  assert.equal(current.state.panels, null)
  assert.equal(current.status, 'access_denied')
  act(() => tree.unmount())
})
