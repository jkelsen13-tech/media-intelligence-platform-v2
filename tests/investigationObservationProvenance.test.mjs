import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createElement, Fragment } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { observationProvenanceFixture } from './investigationObservationProvenanceFixture.mjs'
import { savedRelevanceDeclarations, collectionDiagnostics } from '../src/lib/investigationObservationProvenance.js'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = root + 'tests/.compiled/ObservationProvenance.mjs'
await mkdir(root + 'tests/.compiled', { recursive: true })
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({ absWorkingDir: root, entryPoints: [process.env.MIP_WORKSPACE_COMPONENT ?? 'src/components/PrivateInvestigationWorkspace.jsx'], outfile: output, bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react','react/jsx-runtime','react-dom'], plugins: [{ name: 'css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }] })
const { default: Workspace, PrivateInvestigationInspector: Inspector } = await import(pathToFileURL(output))
const text = n => n == null ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.children ?? n.props?.children) : String(n)

// Real private owner response is produced once, not a hand-assembled mock payload.
const fixture = await observationProvenanceFixture()
if (process.env.MIP_DIAGNOSTICS_RECEIPTS) {
  await mkdir(process.env.MIP_DIAGNOSTICS_RECEIPTS, { recursive: true })
  await writeFile(process.env.MIP_DIAGNOSTICS_RECEIPTS + '/private-owner-fixture.json', JSON.stringify(fixture, null, 2) + '\n')
}

test('actual SQL/RPC/HTTP workspace response preserves distinct declaration when input was already watched', () => {
  const { before, current, position, declaration } = fixture
  assert.deepEqual(current.observation.snapshot.inputs, before.observation.snapshot.inputs)
  assert.ok(!current.comparison.evidence_changes.some(c => c.kind === 'evidence_entered_observation'))
  assert.equal(current.comparison.evidence_changes.filter(c => c.kind === 'relevant_input_declared').length, 2)
  const event = current.comparison.evidence_changes.find(c => c.kind === 'relevant_input_declared' && c.candidate_id === declaration.candidate_id)
  assert.ok(event, 'Authoritative retained declaration diff event must be supplied by existing SQL owner')
  assert.equal(event.position, position); assert.equal(event.candidate_id, declaration.candidate_id)
  const rows = savedRelevanceDeclarations(current).rows
  assert.equal(rows.length, 2); const row = rows.find(r => r.candidate_id === declaration.candidate_id); assert.equal(row.selection_ref, declaration.selection_ref)
  assert.equal(row.scopeRole, 'Retained assessment dependency candidate; outside selected scope')
  assert.ok(!current.observation.snapshot.scope_candidate_ids.includes(declaration.candidate_id))
  assert.ok(current.observation.snapshot.candidates.some(c => c.id === declaration.candidate_id))
  assert.equal(row.rationale, declaration.rationale); assert.equal(row.change_position, position)
  assert.equal(fixture.counts.workspace_reviews, 1); assert.equal(fixture.counts.declarations, 2)
})

test('actual saved owners distinguish scoped dispositions without inventing missing receipts or measured coverage', () => {
  const { current, checks, reviews, notRunChecks } = fixture
  const rows = collectionDiagnostics(current, checks, reviews)
  assert.ok(rows.some(r => r.kind === 'not_retained' && /Body text field at position/.test(r.scope)))
  assert.ok(rows.some(r => r.kind === 'not_searched' && /Synthetic not_run/.test(r.scope) && /scoped analyst declaration/.test(r.basis)))
  assert.ok(rows.some(r => r.kind === 'not_searched' && /External retrieval/.test(r.scope) && r.reference === checks.report.id))
  const rejected = rows.find(r => r.kind === 'rejected')
  assert.ok(rejected.reference.includes(reviews.targets[0].latest_event.id)); assert.match(rejected.basis, /Synthetic cue dismissed/)
  assert.ok(rows.some(r => r.kind === 'unknown' && /Reporting, extraction and rights/.test(r.scope)))
  assert.ok(!rows.some(r => ['not_reported','not_extracted','rights_blocked'].includes(r.kind)))
  assert.ok(!rows.some(r => /Synthetic (partial|completed)/.test(r.scope)))
  assert.ok(collectionDiagnostics(current, notRunChecks).some(r => /Checks status is not_run/.test(r.basis)))
  assert.ok(!collectionDiagnostics(current, { ...checks, version_id: fixture.before.version.id }, reviews).some(r => r.kind === 'rejected' || r.reference === checks.report.id))
  assert.equal(collectionDiagnostics(null)[0].kind, 'unavailable')
})

test('missing additive fields, ambiguous declarations and exact bigint positions remain honest', () => {
  const legacy = structuredClone(fixture.before); delete legacy.observation.snapshot.relevance_declarations
  assert.equal(savedRelevanceDeclarations(legacy).available, false)
  assert.equal(savedRelevanceDeclarations(fixture.before).rows.length, 0)
  const duplicate = structuredClone(fixture.current)
  duplicate.observation.snapshot.relevance_declarations.push(duplicate.observation.snapshot.relevance_declarations[0])
  assert.equal(savedRelevanceDeclarations(duplicate).rows.length, 1); assert.equal(savedRelevanceDeclarations(duplicate).excluded, 2)
  const high = structuredClone(fixture.current), position = '9007199254740997'
  high.observation.snapshot.relevance_declarations[0].change_position = position
  high.observation.snapshot.inputs[0].position = position
  assert.equal(savedRelevanceDeclarations(high).rows[0].change_position, position)
  assert.equal(savedRelevanceDeclarations(high).rows[0].input.position, position)
})

test('mounted real workspace reveals owner provenance, exact inspector and immutable baseline without write calls', async () => {
  const { current: bundle, before, checks, reviews, uid } = fixture
  let current, tree; const calls = []
  const client = {
    async list() { return { data: { items: [{ investigation_id: bundle.investigation_id, version_id: bundle.version.id, revision: bundle.version.revision, question: bundle.version.state.question, access_role: bundle.access_role }], has_more: false, next_after: null } } },
    async read(_id, version) { calls.push(version ?? 'current'); return { data: version === before.version.id ? before : bundle } },
    markReviewed() { assert.fail('Viewing provenance must not write a review') },
  }
  const checksClient = { read: async (_id, version) => ({ data: version === before.version.id ? { ...fixture.notRunChecks, version_id: before.version.id, observation_id: before.observation.id } : checks }), run() { assert.fail('Diagnostics must not run checks') } }
  const reviewsClient = { read: async () => ({ data: reviews }), decide() { assert.fail('Diagnostics must not decide') } }
  function Probe({ userId = uid }) {
    current = usePrivateInvestigationWorkspace({ client, checksClient, reviewsClient, userId, active: true, initialInvestigationId: bundle.investigation_id })
    return createElement(Fragment, null, createElement(Workspace, { workspace: current }), createElement(Inspector, { workspace: current }))
  }
  await act(async () => { tree = TestRenderer.create(createElement(Probe)); await new Promise(r => setTimeout(r, 0)) })
  assert.match(text(tree.toJSON()), /fixture:already-watched/)
  assert.match(text(tree.toJSON()), /Retained assessment dependency candidate; outside selected scope/)
  assert.match(text(tree.root.findByProps({ id: 'piw-changed' })), /Relevance declaration newly recorded/)
  assert.match(text(tree.root.findByProps({ id: 'piw-gaps' })), /not_retained.*not_searched.*rejected.*unknown/)
  const count = calls.length
  act(() => tree.root.findAllByType('button').find(b => text(b) === 'Inspect declared input').props.onClick())
  assert.equal(current.state.inspector.selection.position, fixture.position); assert.equal(calls.length, count)
  await act(async () => { await current.actions.selectVersion(bundle.investigation_id, before.version.id) })
  assert.equal(current.state.inspector, null)
  assert.doesNotMatch(text(tree.toJSON()), /fixture:already-watched/)
  assert.match(text(tree.toJSON()), /No usable relevance declarations/)
  act(() => tree.update(createElement(Probe, { userId: null })))
  assert.equal(tree.root.findAllByProps({ id: 'piw-overview' }).length, 0)
  act(() => tree.unmount())
  const panels = (await import('../src/lib/investigationWorkspaceClient.js')).investigationWorkspacePanels(bundle)
  const html = renderToStaticMarkup(createElement(Workspace, { workspace: { status: 'ready', userId: uid, state: { catalog: [], bundle, panels, beforeBundles: {}, checks, reviews, activeSection: 'overview' }, actions: {} } }))
  assert.match(html, /Saved relevance declarations/)
})
